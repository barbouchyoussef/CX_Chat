import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.scoring import MaturityScoring
from app.core.text_normalization import normalize_text
from app.db.models.maturity_level import MaturityLevel
from app.domain.constants import ASSESSMENT_STATUS_COMPLETED
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.final_report import (
    FinalReportAxisItem,
    FinalReportBenchmarkItem,
    FinalReportCapabilityItem,
    FinalReportResponse,
    FinalReportSummary,
    FinalReportThemeItem,
)
from app.services.assessment.scoring.scoring_service import AssessmentScoringService
from app.services.assessment.reporting.benchmark_service import BenchmarkQueryContext, BenchmarkService
from app.services.llm.core.facade_service import LLMService
from app.services.platform import AsyncUnitOfWork

logger = logging.getLogger(__name__)

class ReportBuilderService:
    """Owns final report assembly, report synthesis caching, and report presentation helpers."""

    def __init__(
        self,
        db: AsyncSession,
        assessments: AssessmentRepository,
        capabilities: CapabilityRepository,
        llm_service: LLMService,
        benchmark_service: BenchmarkService,
        scoring_service: AssessmentScoringService,
        uow: AsyncUnitOfWork,
        settings: Settings,
    ) -> None:
        self.db = db
        self.assessments = assessments
        self.capabilities = capabilities
        self.llm = llm_service
        self.benchmarks = benchmark_service
        self.scoring = scoring_service
        self.uow = uow
        self.settings = settings

    async def get_final_report(self, assessment_id: int) -> FinalReportResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        capability_rows = await self.capabilities.list_all_for_assessment(assessment_id=assessment_id)
        recommendation_rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        rec_by_capability = {int(row["capability_id"]): row for row in recommendation_rows}
        persisted_outputs = await self.assessments.list_recommendation_outputs(assessment_id=assessment_id)
        persisted_by_capability = {
            int(item.capability_id): item for item in persisted_outputs if item.capability_id is not None
        }
        maturity_rows_result = await self.db.execute(select(MaturityLevel))
        maturity_rows = maturity_rows_result.scalars().all()
        maturity_number_by_id = {int(m.id): int(m.level_number) for m in maturity_rows}

        axis_groups: dict[str, list[dict]] = {}
        for row in capability_rows:
            axis_groups.setdefault(str(row["axis"]), []).append(row)

        axes: list[FinalReportAxisItem] = []
        for axis_name, rows in axis_groups.items():
            if not rows:
                continue
            assessed_rows = [r for r in rows if str(r.get("assessment_status") or "not_assessed") == "assessed"]
            if not assessed_rows:
                score = 0.0
                band = "In progress"
            else:
                level_numbers = [
                    maturity_number_by_id[int(r["maturity_level_id"])]
                    for r in assessed_rows
                    if r.get("maturity_level_id") is not None
                    and int(r["maturity_level_id"]) in maturity_number_by_id
                ]
                if not level_numbers:
                    score = 0.0
                    band = "Not scored"
                else:
                    average = sum(level_numbers) / len(level_numbers)
                    score = MaturityScoring.score_percent_from_level_average(average)
                    band = self._band_from_level(int(round(average)) if average > 0 else None, "assessed")
            axes.append(
                FinalReportAxisItem(
                    axis=axis_name,
                    score_percent=round(score, 2),
                    maturity_band=band,
                )
            )

        if axes:
            strongest = max(axes, key=lambda axis: axis.score_percent)
            priority = min(axes, key=lambda axis: axis.score_percent)
            overall_score = round(sum(axis.score_percent for axis in axes) / len(axes), 2)
        else:
            strongest = FinalReportAxisItem(axis="N/A", score_percent=0.0, maturity_band="Not scored")
            priority = strongest
            overall_score = 0.0

        overall_band = MaturityScoring.band_from_score_percent(
            score_percent=overall_score,
            basic_threshold=self.settings.maturity_score_basic_threshold,
            established_threshold=self.settings.maturity_score_established_threshold,
        )

        capabilities: list[FinalReportCapabilityItem] = []
        for row in capability_rows:
            assessment_status = str(row.get("assessment_status") or "not_assessed")
            if assessment_status != "assessed":
                continue
            capability_id = int(row["id"])
            maturity_level_id = row.get("maturity_level_id")
            maturity_level_number = (
                maturity_number_by_id[int(maturity_level_id)]
                if maturity_level_id is not None and int(maturity_level_id) in maturity_number_by_id
                else None
            )
            rec = rec_by_capability.get(capability_id, {})
            persisted = persisted_by_capability.get(capability_id)
            recommendation_text = (
                normalize_text(persisted.generated_text)
                if persisted is not None
                else normalize_text(str(rec.get("recommendation_text") or rec.get("recommendation_guideline") or ""))
            )
            confidence_value = float(row.get("confidence") or 0.0) if row.get("confidence") is not None else None
            capabilities.append(
                FinalReportCapabilityItem(
                    axis=str(row["axis"]),
                    capability=str(row["label"]),
                    maturity_band=self._band_from_level(maturity_level_number, assessment_status),
                    assessment_status=assessment_status,
                    confidence=confidence_value,
                    rationale=self._soften_report_rationale(
                        rationale=row.get("rationale"),
                        confidence=confidence_value,
                    ),
                    recommendation=recommendation_text or None,
                    priority=rec.get("priority_hint"),
                )
            )

        assessed_capabilities = list(capabilities)
        strengths_candidates = [c for c in assessed_capabilities if c.maturity_band == "Advanced"]
        if not strengths_candidates:
            established = [c for c in assessed_capabilities if c.maturity_band == "Established"]
            established.sort(key=lambda item: float(item.confidence or 0.0), reverse=True)
            strengths_candidates = established[:3]
        pain_candidates = [c for c in assessed_capabilities if c.maturity_band == "Basic"]

        strengths = [
            FinalReportThemeItem(
                axis=item.axis,
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                recommendation=item.recommendation,
                priority=item.priority,
            )
            for item in strengths_candidates[:3]
        ]
        pain_points = [
            FinalReportThemeItem(
                axis=item.axis,
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                recommendation=item.recommendation,
                priority=item.priority,
            )
            for item in pain_candidates[:3]
        ]

        synthesis = await self._get_or_generate_report_synthesis(
            assessment=assessment,
            overall_band=overall_band,
            overall_score=overall_score,
            strongest_axis=strongest.axis,
            priority_axis=priority.axis,
            axes=axes,
            strengths=strengths,
            pain_points=pain_points,
            strengths_count=len(strengths_candidates),
            pain_points_count=len(pain_candidates),
            capabilities=capabilities,
        )

        summary = FinalReportSummary(
            overall_score_percent=overall_score,
            overall_maturity_band=overall_band,
            strongest_axis=strongest.axis,
            strongest_axis_score_percent=strongest.score_percent,
            priority_axis=priority.axis,
            priority_axis_score_percent=priority.score_percent,
            strengths_count=len(strengths_candidates),
            pain_points_count=len(pain_candidates),
            assessed_capabilities_count=len(assessed_capabilities),
            unassessed_capabilities_count=max(0, len(capability_rows) - len(assessed_capabilities)),
            executive_summary_text=synthesis.get("executive_summary"),
            priority_message_text=synthesis.get("priority_message"),
        )

        benchmark_context = BenchmarkQueryContext(
            sector=getattr(assessment.company.sector, "name", "Unknown"),
            company_size=getattr(assessment.company.company_size, "name", "Unknown"),
            priority_axis=priority.axis,
            pain_points=[item.capability for item in pain_points],
        )
        benchmark_rows = self.benchmarks.get_contextual_benchmarks(benchmark_context)
        benchmarks = [FinalReportBenchmarkItem(**row) for row in benchmark_rows]

        return FinalReportResponse(
            assessment_id=assessment_id,
            summary=summary,
            axes=axes,
            strengths=strengths,
            pain_points=pain_points,
            capabilities=capabilities,
            benchmarks=benchmarks,
        )

    async def _get_or_generate_report_synthesis(
        self,
        assessment: Any,
        overall_band: str,
        overall_score: float,
        strongest_axis: str,
        priority_axis: str,
        axes: list[FinalReportAxisItem],
        strengths: list[FinalReportThemeItem],
        pain_points: list[FinalReportThemeItem],
        strengths_count: int,
        pain_points_count: int,
        capabilities: list[FinalReportCapabilityItem],
    ) -> dict[str, str | None]:
        cached_summary = normalize_text(getattr(assessment, "executive_summary_text", None))
        cached_priority = normalize_text(getattr(assessment, "priority_message_text", None))
        if cached_summary and cached_priority:
            return {"executive_summary": cached_summary, "priority_message": cached_priority}

        degraded = self._degraded_report_synthesis(priority_axis=priority_axis)
        try:
            synthesis = await self.llm.generate_report_synthesis(
                company_name=getattr(assessment.company, "name", "This company"),
                overall_maturity_band=overall_band,
                overall_score_percent=overall_score,
                strongest_axis=strongest_axis,
                priority_axis=priority_axis,
                strengths_count=strengths_count,
                pain_points_count=pain_points_count,
                axes=[axis_item.model_dump() for axis_item in axes],
                strengths=[
                    {
                        **item.model_dump(),
                        "confidence_label": self._confidence_label(capabilities, item.capability, item.axis),
                        "evidence_strength": self._evidence_strength_label(capabilities, item.capability, item.axis),
                    }
                    for item in strengths
                ],
                pain_points=[
                    {
                        **item.model_dump(),
                        "confidence_label": self._confidence_label(capabilities, item.capability, item.axis),
                        "evidence_strength": self._evidence_strength_label(capabilities, item.capability, item.axis),
                    }
                    for item in pain_points
                ],
            )
        except Exception as exc:
            logger.error("Report synthesis generation failed: %s", exc, exc_info=True)
            return degraded

        executive_summary = normalize_text(synthesis.get("executive_summary")) or degraded["executive_summary"]
        priority_message = normalize_text(synthesis.get("priority_message")) or degraded["priority_message"]
        if str(getattr(assessment, "status", "")) == ASSESSMENT_STATUS_COMPLETED:
            try:
                async with self.uow:
                    await self.assessments.update_report_synthesis(
                        assessment=assessment,
                        executive_summary_text=executive_summary,
                        priority_message_text=priority_message,
                    )
            except Exception as exc:
                logger.error("Could not persist report synthesis cache: %s", exc, exc_info=True)
        return {"executive_summary": executive_summary, "priority_message": priority_message}

    def _degraded_report_synthesis(self, priority_axis: str) -> dict[str, str]:
        return {
            "executive_summary": (
                "Report synthesis is temporarily unavailable. "
                "Please refer to your quantitative scores below."
            ),
            "priority_message": (
                f"The next step is to review the {priority_axis} scores and prioritize the lowest maturity items."
            ),
        }

    def _band_from_level(self, level: int | None, assessment_status: str) -> str:
        return MaturityScoring.band_from_level(level=level, assessment_status=assessment_status)

    def _soften_report_rationale(self, rationale: str | None, confidence: float | None) -> str | None:
        text = normalize_text(rationale)
        if not text:
            return None
        if confidence is None or confidence >= self.settings.RECOMMENDATION_MIN_CONFIDENCE:
            return text

        lowered = text.lower()
        if lowered.startswith(("there are early signs", "current evidence suggests", "the current evidence points to")):
            return text
        if confidence >= self.settings.REPORT_MEDIUM_CONFIDENCE_THRESHOLD:
            return (
                f"Current evidence suggests that {text[0].lower() + text[1:]}"
                if len(text) > 1
                else f"Current evidence suggests that {text.lower()}"
            )
        return (
            f"There are early signs that {text[0].lower() + text[1:]}"
            if len(text) > 1
            else f"There are early signs that {text.lower()}"
        )

    def _confidence_label(
        self,
        capabilities: list[FinalReportCapabilityItem],
        capability_name: str,
        axis_name: str,
    ) -> str:
        match = next(
            (item for item in capabilities if item.capability == capability_name and item.axis == axis_name),
            None,
        )
        confidence = float(match.confidence or 0.0) if match and match.confidence is not None else 0.0
        if confidence >= self.settings.REPORT_HIGH_CONFIDENCE_THRESHOLD:
            return "high"
        if confidence >= self.settings.REPORT_MEDIUM_CONFIDENCE_THRESHOLD:
            return "medium"
        return "low"

    def _evidence_strength_label(
        self,
        capabilities: list[FinalReportCapabilityItem],
        capability_name: str,
        axis_name: str,
    ) -> str:
        match = next(
            (item for item in capabilities if item.capability == capability_name and item.axis == axis_name),
            None,
        )
        if match is None:
            return "low"
        rationale_length = len(normalize_text(match.rationale or ""))
        confidence = float(match.confidence or 0.0) if match.confidence is not None else 0.0
        if (
            confidence >= self.settings.REPORT_HIGH_CONFIDENCE_THRESHOLD
            and rationale_length >= self.settings.report_high_evidence_min_chars
        ):
            return "high"
        if (
            confidence >= self.settings.REPORT_MEDIUM_CONFIDENCE_THRESHOLD
            and rationale_length >= self.settings.report_medium_evidence_min_chars
        ):
            return "medium"
        return "low"


