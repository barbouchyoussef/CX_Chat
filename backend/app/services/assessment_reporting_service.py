import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.scoring import MaturityScoring
from app.core.text_normalization import normalize_text
from app.db.models.maturity_level import MaturityLevel
from app.domain.constants import ASSESSMENT_STATUS_COMPLETED
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
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
from app.schemas.recommendations import (
    AssessmentRecommendationItem,
    AssessmentRecommendationsResponse,
    AssessmentTraceItem,
    AssessmentTraceResponse,
    BatchRecommendationGenerateResponse,
    BatchRecommendationResult,
    RecommendationOutputItem,
    RecommendationOutputsResponse,
)
from app.services.assessment_scoring_service import AssessmentScoringService, build_assessment_scoring_service
from app.services.benchmark_service import BenchmarkQueryContext, BenchmarkService
from app.services.llm_service import LLMService, build_llm_service
from app.services.unit_of_work import AsyncUnitOfWork

logger = logging.getLogger(__name__)


class AssessmentTraceService:
    """Owns assessment conversation trace retrieval."""

    def __init__(
        self,
        assessments: AssessmentRepository,
        answers: AssessmentAnswerRepository,
    ) -> None:
        self.assessments = assessments
        self.answers = answers

    async def get_trace(self, assessment_id: int, limit: int = 500, offset: int = 0) -> AssessmentTraceResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = await self.answers.list_trace(assessment_id=assessment_id, limit=limit, offset=offset)
        items = [AssessmentTraceItem(**row) for row in rows]
        return AssessmentTraceResponse(assessment_id=assessment_id, items=items)


class RecommendationService:
    """Owns recommendation generation, fallback handling, and persisted recommendation outputs."""

    def __init__(
        self,
        db: AsyncSession,
        assessments: AssessmentRepository,
        capabilities: CapabilityRepository,
        llm_service: LLMService,
        scoring_service: AssessmentScoringService,
        uow: AsyncUnitOfWork,
        settings: Settings,
    ) -> None:
        self.db = db
        self.assessments = assessments
        self.capabilities = capabilities
        self.llm = llm_service
        self.scoring = scoring_service
        self.uow = uow
        self.settings = settings

    async def get_recommendations(self, assessment_id: int) -> AssessmentRecommendationsResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        persisted_outputs = await self.assessments.list_recommendation_outputs(assessment_id=assessment_id)
        persisted_by_capability = {
            int(item.capability_id): item for item in persisted_outputs if item.capability_id is not None
        }
        maturity_rows_result = await self.db.execute(select(MaturityLevel))
        maturity_label_by_id = {int(m.id): str(m.label) for m in maturity_rows_result.scalars().all()}
        generated_jobs: dict[int, dict[str, Any]] = {}
        generated_text_by_capability: dict[int, str] = {}

        for row in rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                continue
            capability_id = int(row["capability_id"])
            persisted = persisted_by_capability.get(capability_id)
            if persisted is not None:
                generated_text_by_capability[capability_id] = normalize_text(persisted.generated_text)
                continue
            maturity_label = (
                maturity_label_by_id.get(int(row["maturity_level_id"]))
                if row.get("maturity_level_id")
                else "Unknown"
            )
            generated_jobs[capability_id] = self._recommendation_args_from_score_row(
                row,
                maturity_label=maturity_label,
            )

        generated_text_by_capability.update(await self._generate_recommendation_texts(generated_jobs))

        items: list[AssessmentRecommendationItem] = []
        for row in rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                row["recommendation_text"] = None
                items.append(AssessmentRecommendationItem(**row))
                continue
            row["recommendation_text"] = generated_text_by_capability.get(int(row["capability_id"]))
            items.append(AssessmentRecommendationItem(**row))
        return AssessmentRecommendationsResponse(assessment_id=assessment_id, items=items)

    async def generate_recommendations_batch(
        self,
        assessment_id: int,
        language: str = "en",
        max_actions_per_capability: int | None = None,
        tone: str = "practical",
        max_words_per_capability: int | None = None,
    ) -> BatchRecommendationGenerateResponse | None:
        resolved_max_actions = max_actions_per_capability or self.settings.MAX_ACTIONS_PER_CAPABILITY
        resolved_max_words = max_words_per_capability or self.settings.MAX_WORDS_PER_CAPABILITY
        return await self._generate_recommendations_batch(
            assessment_id=assessment_id,
            language=language,
            max_actions_per_capability=resolved_max_actions,
            tone=tone,
            max_words_per_capability=resolved_max_words,
        )

    async def _generate_recommendations_batch(
        self,
        assessment_id: int,
        language: str = "en",
        max_actions_per_capability: int | None = None,
        tone: str = "practical",
        max_words_per_capability: int | None = None,
    ) -> BatchRecommendationGenerateResponse | None:
        max_actions_per_capability = max_actions_per_capability or self.settings.MAX_ACTIONS_PER_CAPABILITY
        max_words_per_capability = max_words_per_capability or self.settings.MAX_WORDS_PER_CAPABILITY
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        maturity_rows_result = await self.db.execute(select(MaturityLevel))
        maturity_rows = maturity_rows_result.scalars().all()
        maturity_label_by_id = {int(m.id): str(m.label) for m in maturity_rows}

        llm_items: list[dict] = []
        for row in rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                continue
            confidence = row.get("confidence")
            evidence_list = []
            if row.get("justification"):
                evidence_list.append(str(row.get("justification")))
            recommendation_context = self.build_recommendation_context(row)
            evidence_quality = "weak"
            if len(evidence_list) >= 2 and all(
                len(e.strip()) >= self.settings.recommendation_strong_evidence_min_chars
                for e in evidence_list
            ):
                evidence_quality = "strong"
            elif len(evidence_list) >= 1 and any(
                len(e.strip()) >= self.settings.recommendation_medium_evidence_min_chars
                for e in evidence_list
            ):
                evidence_quality = "medium"
            llm_items.append(
                {
                    "capability_id": int(row["capability_id"]),
                    "axis": str(row.get("axis") or ""),
                    "capability_name": str(row.get("capability_name") or ""),
                    "maturity_level": (
                        maturity_label_by_id.get(int(row["maturity_level_id"]))
                        if row.get("maturity_level_id")
                        else "Unknown"
                    ),
                    "confidence": float(confidence) if confidence is not None else None,
                    "evidence": evidence_list[:2],
                    "insight_summary": str(row.get("justification") or ""),
                    "admin_guideline": recommendation_context["recommendation_guideline"],
                    "priority_hint": recommendation_context["priority_hint"],
                    "business_impact": recommendation_context["business_impact"],
                    "tone_hint": recommendation_context["tone_hint"],
                    "supporting_notes": recommendation_context["supporting_notes"],
                    "evidence_quality": evidence_quality,
                }
            )

        pre_gated: dict[int, BatchRecommendationResult] = {}
        llm_candidates: list[dict] = []
        for item in llm_items:
            capability_id = int(item["capability_id"])
            confidence = item.get("confidence")
            evidence = item.get("evidence") or []
            evidence_quality = str(item.get("evidence_quality") or "weak")
            if (
                confidence is None
                or float(confidence) < self.settings.RECOMMENDATION_MIN_CONFIDENCE
                or not evidence
                or evidence_quality == "weak"
            ):
                pre_gated[capability_id] = BatchRecommendationResult(
                    capability_id=capability_id,
                    status="needs_clarification",
                    recommendation_text=None,
                    clarification_question="Could you share one recent concrete example with owner, action, and measurable outcome?",
                    evidence_used=evidence[:2],
                )
                continue
            llm_candidates.append(item)

        try:
            generated = await self.llm.generate_recommendations_batch(
                assessment_id=assessment_id,
                items=llm_candidates,
                language=language,
                max_actions_per_capability=max_actions_per_capability,
                tone=tone,
                max_words_per_capability=max_words_per_capability,
            )
        except Exception as exc:
            logger.error("Batch recommendation LLM call failed: %s", exc, exc_info=True)
            generated = {}

        fallback_jobs = {
            int(item["capability_id"]): self._recommendation_args_from_batch_item(item, tone=tone)
            for item in llm_items
            if int(item["capability_id"]) not in pre_gated and not generated.get(int(item["capability_id"]))
        }
        fallback_text_by_capability = await self._generate_recommendation_texts(fallback_jobs)

        results: list[BatchRecommendationResult] = []
        output_rows: list[dict] = []
        for row in llm_items:
            capability_id = int(row["capability_id"])
            if capability_id in pre_gated:
                results.append(pre_gated[capability_id])
                continue
            ai = generated.get(capability_id)
            if ai:
                if ai.get("status") == "ok":
                    recommendation_text = normalize_text(
                        self._safe_concat(
                            [
                                ai.get("title"),
                                ai.get("why_this"),
                                ai.get("primary_action"),
                                ai.get("secondary_action"),
                                ai.get("expected_impact"),
                            ]
                        )
                    )
                    output_rows.append(
                        {
                            "capability_id": capability_id,
                            "maturity_level_id": next(
                                (r.get("maturity_level_id") for r in rows if int(r["capability_id"]) == capability_id),
                                None,
                            ),
                            "generated_text": recommendation_text,
                            "priority": row.get("priority_hint"),
                        }
                    )
                    results.append(
                        BatchRecommendationResult(
                            capability_id=capability_id,
                            status="ok",
                            recommendation_text=recommendation_text,
                            clarification_question=None,
                            evidence_used=ai.get("evidence_used") or [],
                        )
                    )
                else:
                    results.append(
                        BatchRecommendationResult(
                            capability_id=capability_id,
                            status="needs_clarification",
                            recommendation_text=None,
                            clarification_question=ai.get("clarification_question")
                            or "Can you share one concrete recent example?",
                            evidence_used=ai.get("evidence_used") or [],
                        )
                    )
            else:
                fallback = fallback_text_by_capability.get(
                    capability_id,
                    self._fallback_recommendation_text(
                        recommendation_guideline=row.get("admin_guideline"),
                        business_impact=row.get("business_impact"),
                    ),
                )
                output_rows.append(
                    {
                        "capability_id": capability_id,
                        "maturity_level_id": next(
                            (r.get("maturity_level_id") for r in rows if int(r["capability_id"]) == capability_id),
                            None,
                        ),
                        "generated_text": fallback,
                        "priority": row.get("priority_hint"),
                    }
                )
                results.append(
                    BatchRecommendationResult(
                        capability_id=capability_id,
                        status="ok",
                        recommendation_text=fallback,
                        clarification_question=None,
                        evidence_used=[],
                    )
                )

        async with self.uow:
            await self.assessments.replace_recommendation_outputs(assessment_id=assessment_id, items=output_rows)
        ok_count = sum(1 for r in results if r.status == "ok")
        clarification_count = sum(1 for r in results if r.status == "needs_clarification")
        return BatchRecommendationGenerateResponse(
            assessment_id=assessment_id,
            status="ok",
            results=results,
            ok_count=ok_count,
            clarification_count=clarification_count,
        )

    async def get_recommendation_outputs(self, assessment_id: int) -> RecommendationOutputsResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = await self.assessments.list_recommendation_outputs(assessment_id=assessment_id)
        items = [
            RecommendationOutputItem(
                id=int(row.id),
                capability_id=int(row.capability_id) if row.capability_id is not None else None,
                maturity_level_id=int(row.maturity_level_id) if row.maturity_level_id is not None else None,
                generated_text=str(row.generated_text),
                priority=row.priority,
                created_at=row.created_at,
            )
            for row in rows
        ]
        return RecommendationOutputsResponse(assessment_id=assessment_id, items=items)

    async def finalize_completed_assessment(self, assessment_id: int, assessment: Any) -> None:
        rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        maturity_rows_result = await self.db.execute(select(MaturityLevel))
        maturity_rows = maturity_rows_result.scalars().all()
        maturity_label_by_id = {int(m.id): str(m.label) for m in maturity_rows}
        maturity_number_by_id = {int(m.id): int(m.level_number) for m in maturity_rows}
        output_rows: list[dict] = []
        level_numbers: list[int] = []
        recommendation_jobs: dict[int, dict[str, Any]] = {}
        assessed_rows: list[dict] = []

        for row in rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                continue
            assessed_rows.append(row)
            maturity_level_id = row.get("maturity_level_id")
            if maturity_level_id is not None and int(maturity_level_id) in maturity_number_by_id:
                level_numbers.append(maturity_number_by_id[int(maturity_level_id)])
            maturity_label = maturity_label_by_id.get(int(maturity_level_id)) if maturity_level_id else "Unknown"
            recommendation_jobs[int(row["capability_id"])] = self._recommendation_args_from_score_row(
                row,
                maturity_label=maturity_label,
            )

        recommendation_text_by_capability = await self._generate_recommendation_texts(recommendation_jobs)
        for row in assessed_rows:
            maturity_level_id = row.get("maturity_level_id")
            capability_id = int(row["capability_id"])
            output_rows.append(
                {
                    "capability_id": row.get("capability_id"),
                    "maturity_level_id": maturity_level_id,
                    "generated_text": recommendation_text_by_capability.get(
                        capability_id,
                        self._fallback_recommendation_text(
                            recommendation_guideline=row.get("recommendation_guideline"),
                            business_impact=row.get("business_impact"),
                        ),
                    ),
                    "priority": row.get("priority_hint"),
                }
            )

        await self.assessments.replace_recommendation_outputs(assessment_id=assessment_id, items=output_rows)
        overall_level_id, overall_band = await self.scoring.compute_overall_maturity_band(level_numbers=level_numbers)
        assessment.overall_maturity_level_id = overall_level_id
        assessment.overall_maturity_band = overall_band

    @staticmethod
    def build_recommendation_context(row: dict) -> dict[str, str | None]:
        recommendation_guideline = normalize_text(str(row.get("recommendation_guideline") or "")) or None
        priority_hint = normalize_text(str(row.get("priority_hint") or "")) or None
        business_impact = normalize_text(str(row.get("business_impact") or "")) or None
        tone_hint = normalize_text(str(row.get("tone_hint") or "")) or "balanced"

        supporting_parts: list[str] = []
        consultant_note = normalize_text(str(row.get("consultant_note") or ""))
        if consultant_note:
            supporting_parts.append(consultant_note)
        initiative_suggestions = normalize_text(str(row.get("initiative_suggestions") or ""))
        if initiative_suggestions:
            supporting_parts.append(f"Suggested initiatives: {initiative_suggestions}")
        evidence_to_cite = normalize_text(str(row.get("evidence_to_cite") or ""))
        if evidence_to_cite and not row.get("justification"):
            supporting_parts.append(f"Reference pattern: {evidence_to_cite}")

        supporting_notes = " | ".join(part for part in supporting_parts[:2] if part) or None
        return {
            "recommendation_guideline": recommendation_guideline,
            "priority_hint": priority_hint,
            "business_impact": business_impact,
            "tone_hint": tone_hint,
            "supporting_notes": supporting_notes,
        }

    def _recommendation_args_from_score_row(self, row: dict, maturity_label: str) -> dict[str, Any]:
        recommendation_context = self.build_recommendation_context(row)
        return {
            "axis": str(row.get("axis") or ""),
            "capability": str(row.get("capability_name") or ""),
            "maturity_label": maturity_label,
            "confidence": row.get("confidence"),
            "justification": row.get("justification"),
            "recommendation_guideline": recommendation_context["recommendation_guideline"],
            "priority_hint": recommendation_context["priority_hint"],
            "business_impact": recommendation_context["business_impact"],
            "tone_hint": recommendation_context["tone_hint"],
            "supporting_notes": recommendation_context["supporting_notes"],
        }

    def _recommendation_args_from_batch_item(self, row: dict, tone: str) -> dict[str, Any]:
        return {
            "axis": str(row.get("axis") or ""),
            "capability": str(row.get("capability_name") or ""),
            "maturity_label": str(row.get("maturity_level") or "Unknown"),
            "confidence": row.get("confidence"),
            "justification": row.get("insight_summary"),
            "recommendation_guideline": row.get("admin_guideline"),
            "priority_hint": row.get("priority_hint"),
            "business_impact": row.get("business_impact"),
            "tone_hint": row.get("tone_hint") or tone,
            "supporting_notes": row.get("supporting_notes"),
        }

    async def _generate_recommendation_texts(self, jobs: dict[int, dict[str, Any]]) -> dict[int, str]:
        if not jobs:
            return {}

        async def run_job(capability_id: int, payload: dict[str, Any]) -> tuple[int, str]:
            return capability_id, await self._generate_recommendation_safe(**payload)

        task_results = await asyncio.gather(
            *(run_job(capability_id, payload) for capability_id, payload in jobs.items()),
            return_exceptions=True,
        )

        generated: dict[int, str] = {}
        for result in task_results:
            if isinstance(result, Exception):
                logger.error(
                    "Parallel recommendation task failed: %s",
                    result,
                    exc_info=(type(result), result, result.__traceback__),
                )
                continue
            capability_id, recommendation_text = result
            generated[capability_id] = recommendation_text
        return generated

    async def _generate_recommendation_safe(
        self,
        axis: str,
        capability: str,
        maturity_label: str,
        confidence: float | None,
        justification: str | None,
        recommendation_guideline: str | None,
        priority_hint: str | None,
        business_impact: str | None,
        tone_hint: str | None,
        supporting_notes: str | None,
    ) -> str:
        try:
            recommendation = await self.llm.generate_recommendation(
                axis=axis,
                capability=capability,
                maturity_label=maturity_label,
                confidence=confidence,
                justification=justification,
                recommendation_guideline=recommendation_guideline,
                priority_hint=priority_hint,
                business_impact=business_impact,
                tone_hint=tone_hint,
                supporting_notes=supporting_notes,
            )
            return normalize_text(recommendation) or self._fallback_recommendation_text(
                recommendation_guideline=recommendation_guideline,
                business_impact=business_impact,
            )
        except Exception as exc:
            logger.error("Recommendation generation failed for %s: %s", capability, exc, exc_info=True)
            return self._fallback_recommendation_text(
                recommendation_guideline=recommendation_guideline,
                business_impact=business_impact,
            )

    def _fallback_recommendation_text(
        self,
        recommendation_guideline: str | None,
        business_impact: str | None,
    ) -> str:
        return normalize_text(
            self._safe_concat(
                [
                    recommendation_guideline or "Recommendation generation is temporarily unavailable",
                    business_impact,
                ]
            )
        )

    def _safe_concat(self, parts: list[str | None]) -> str:
        safe_parts = []
        for part in parts:
            if part and str(part).strip():
                clean_part = str(part).strip()
                if clean_part[-1] not in ".!?":
                    clean_part += "."
                safe_parts.append(clean_part)
        return " ".join(safe_parts)


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


class AssessmentReportingService:
    """Compatibility facade delegating to SRP reporting sub-services."""

    def __init__(
        self,
        trace_service: AssessmentTraceService,
        recommendation_service: RecommendationService,
        report_builder_service: ReportBuilderService,
    ) -> None:
        self.trace = trace_service
        self.recommendations = recommendation_service
        self.report_builder = report_builder_service

    async def get_trace(self, assessment_id: int, limit: int = 500, offset: int = 0) -> AssessmentTraceResponse | None:
        return await self.trace.get_trace(assessment_id=assessment_id, limit=limit, offset=offset)

    async def get_recommendations(self, assessment_id: int) -> AssessmentRecommendationsResponse | None:
        return await self.recommendations.get_recommendations(assessment_id=assessment_id)

    async def generate_recommendations_batch(
        self,
        assessment_id: int,
        language: str = "en",
        max_actions_per_capability: int | None = None,
        tone: str = "practical",
        max_words_per_capability: int | None = None,
    ) -> BatchRecommendationGenerateResponse | None:
        return await self.recommendations.generate_recommendations_batch(
            assessment_id=assessment_id,
            language=language,
            max_actions_per_capability=max_actions_per_capability,
            tone=tone,
            max_words_per_capability=max_words_per_capability,
        )

    async def get_recommendation_outputs(self, assessment_id: int) -> RecommendationOutputsResponse | None:
        return await self.recommendations.get_recommendation_outputs(assessment_id=assessment_id)

    async def get_final_report(self, assessment_id: int) -> FinalReportResponse | None:
        return await self.report_builder.get_final_report(assessment_id=assessment_id)

    async def finalize_completed_assessment(self, assessment_id: int, assessment: Any) -> None:
        await self.recommendations.finalize_completed_assessment(
            assessment_id=assessment_id,
            assessment=assessment,
        )


def build_assessment_reporting_service(
    db: AsyncSession,
    llm_service: LLMService | None = None,
    benchmark_service: BenchmarkService | None = None,
    scoring_service: AssessmentScoringService | None = None,
    settings: Settings | None = None,
) -> AssessmentReportingService:
    settings = settings or get_settings()
    assessments = AssessmentRepository(db)
    answers = AssessmentAnswerRepository(db)
    capabilities = CapabilityRepository(db)
    llm = llm_service or build_llm_service(settings=settings)
    benchmarks = benchmark_service or BenchmarkService()
    uow = AsyncUnitOfWork(db)
    scoring = scoring_service or build_assessment_scoring_service(
        db,
        assessments=assessments,
        capabilities=capabilities,
        settings=settings,
    )

    trace_service = AssessmentTraceService(
        assessments=assessments,
        answers=answers,
    )
    recommendation_service = RecommendationService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        llm_service=llm,
        scoring_service=scoring,
        uow=uow,
        settings=settings,
    )
    report_builder_service = ReportBuilderService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        llm_service=llm,
        benchmark_service=benchmarks,
        scoring_service=scoring,
        uow=uow,
        settings=settings,
    )
    return AssessmentReportingService(
        trace_service=trace_service,
        recommendation_service=recommendation_service,
        report_builder_service=report_builder_service,
    )
