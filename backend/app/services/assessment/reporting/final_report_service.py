import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.scoring import MaturityScoring
from app.core.text_normalization import normalize_text
from app.db.models.assessment_answer import AssessmentAnswer
from app.db.models.assessment_insight import AssessmentInsight
from app.db.models.capability import Capability
from app.db.models.capability_quick_win_template import CapabilityQuickWinTemplate
from app.db.models.maturity_level import MaturityLevel
from app.db.session import SessionLocal
from app.domain.constants import ASSESSMENT_STATUS_COMPLETED
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.final_report import (
    FinalReportAxisItem,
    FinalReportBenchmarkItem,
    FinalReportCapabilityItem,
    FinalReportCompetitiveCompetitor,
    FinalReportCompetitiveEvidenceLink,
    FinalReportCompetitiveStage,
    FinalReportHero,
    FinalReportLeaderEvidenceLink,
    FinalReportLeaderItem,
    FinalReportLeadersSnapshotMetrics,
    FinalReportLeadersSnapshot,
    FinalReportQuickWinItem,
    FinalReportQuickWinsTimeline,
    FinalReportWorkingMissingAxis,
    FinalReportWorkingMissingItem,
    FinalReportResponse,
    FinalReportSummary,
    FinalReportThemeItem,
)
from app.services.assessment.scoring.scoring_service import AssessmentScoringService
from app.services.assessment.scoring.scoring_service import build_assessment_scoring_service
from app.services.assessment.reporting.benchmark_service import (
    BenchmarkEvidenceSignal,
    BenchmarkQueryContext,
    BenchmarkService,
)
from app.services.assessment.reporting.telecom_discovery_leaders_service import TelecomDiscoveryLeadersService
from app.services.assessment.reporting.semantic_leaders_service import SemanticLeadersService
from app.services.llm.core.facade_service import LLMService, build_llm_service
from app.services.llm.utils import extract_json
from app.services.platform import AsyncUnitOfWork

logger = logging.getLogger(__name__)

LEADERS_SNAPSHOT_STATUS_PENDING = "pending"
LEADERS_SNAPSHOT_STATUS_RUNNING = "running"
LEADERS_SNAPSHOT_STATUS_COMPLETED = "completed"
LEADERS_SNAPSHOT_STATUS_FAILED = "failed"

_leaders_snapshot_tasks: dict[int, asyncio.Task[None]] = {}
_leaders_snapshot_tasks_lock = asyncio.Lock()
_leaders_snapshot_job_semaphore: asyncio.Semaphore | None = None
QUICK_WIN_TIMELINE_LABELS = ("Week 1", "Month 1", "Month 2", "Month 3-4")


def _get_leaders_snapshot_job_semaphore(settings: Settings) -> asyncio.Semaphore:
    global _leaders_snapshot_job_semaphore
    if _leaders_snapshot_job_semaphore is None:
        _leaders_snapshot_job_semaphore = asyncio.Semaphore(settings.benchmark_max_concurrent_jobs)
    return _leaders_snapshot_job_semaphore


def _build_report_builder_service(db: AsyncSession, settings: Settings) -> "ReportBuilderService":
    assessments = AssessmentRepository(db)
    capabilities = CapabilityRepository(db)
    llm = build_llm_service(settings=settings)
    benchmarks = BenchmarkService(db=db)
    uow = AsyncUnitOfWork(db)
    scoring = build_assessment_scoring_service(
        db,
        assessments=assessments,
        capabilities=capabilities,
        settings=settings,
    )
    return ReportBuilderService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        llm_service=llm,
        benchmark_service=benchmarks,
        scoring_service=scoring,
        uow=uow,
        settings=settings,
    )

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

    async def get_final_report(
        self,
        assessment_id: int,
        refresh_synthesis: bool = False,
    ) -> FinalReportResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        report_date_label = self._report_date_label(getattr(assessment, "updated_at", None))
        company_name = normalize_text(getattr(assessment.company, "name", None))
        sector_name = normalize_text(getattr(getattr(assessment.company, "sector", None), "name", None))
        region = normalize_text(
            getattr(getattr(assessment.company, "region_ref", None), "name", None)
        )

        capability_rows = await self.capabilities.list_all_for_assessment(assessment_id=assessment_id)
        recommendation_rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        axis_maturity_content = await self.capabilities.get_axis_maturity_content()
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
                axis_level = None
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
                    axis_level = None
                    band = "Not scored"
                else:
                    average = sum(level_numbers) / len(level_numbers)
                    score = MaturityScoring.score_percent_from_level_average(average)
                    axis_level = self._rounded_level(average)
                    band = self._band_from_level(axis_level, "assessed")
            axes.append(
                FinalReportAxisItem(
                    axis=axis_name,
                    score_percent=round(score, 2),
                    maturity_band=band,
                    axis_level=axis_level,
                    axis_level_label=self._level_label(axis_level),
                )
            )

        all_level_numbers = [
            maturity_number_by_id[int(row["maturity_level_id"])]
            for row in capability_rows
            if str(row.get("assessment_status") or "not_assessed") == "assessed"
            and row.get("maturity_level_id") is not None
            and int(row["maturity_level_id"]) in maturity_number_by_id
        ]

        if axes:
            strongest = max(axes, key=lambda axis: axis.score_percent)
            priority = min(axes, key=lambda axis: axis.score_percent)
            overall_score = round(sum(axis.score_percent for axis in axes) / len(axes), 2)
        else:
            strongest = FinalReportAxisItem(
                axis="N/A",
                score_percent=0.0,
                maturity_band="Not scored",
                axis_level=None,
                axis_level_label=None,
            )
            priority = strongest
            overall_score = 0.0

        if all_level_numbers:
            overall_average = sum(all_level_numbers) / len(all_level_numbers)
            overall_level, overall_band = MaturityScoring.target_level_from_average(
                average=overall_average,
                basic_threshold=self.settings.maturity_average_basic_threshold,
                established_threshold=self.settings.maturity_average_established_threshold,
            )
        else:
            overall_level = None
            overall_band = "Not scored"

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
                    capability_id=capability_id,
                    maturity_level_number=maturity_level_number,
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

        rubric_content_by_capability_id = self._current_rubric_content_by_capability(
            capability_rows=capability_rows,
            rubrics_by_capability=await self.capabilities.get_rubrics_for_capabilities(
                capability_ids=[int(row["id"]) for row in capability_rows if row.get("id") is not None]
            ),
        )

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
            refresh_synthesis=refresh_synthesis,
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
        hero = FinalReportHero(
            report_title="CX Maturity Report",
            report_date_label=report_date_label,
            company_name=company_name,
            sector_name=sector_name,
            region=region,
            overall_level=overall_level,
            overall_level_label=self._level_label(overall_level),
            overall_maturity_band=overall_band,
            hero_message=self._hero_message(
                executive_summary=synthesis.get("executive_summary"),
                priority_message=synthesis.get("priority_message"),
                overall_band=overall_band,
                priority_axis=priority.axis,
            ),
            strongest_axis=strongest.axis if strongest.axis != "N/A" else None,
            strongest_axis_level=strongest.axis_level,
            strongest_axis_level_label=self._level_label(strongest.axis_level),
            priority_axis=priority.axis if priority.axis != "N/A" else None,
            priority_axis_level=priority.axis_level,
            priority_axis_level_label=self._level_label(priority.axis_level),
        )

        benchmarks: list[FinalReportBenchmarkItem] = []
        # Temporary safeguard: skip competitive landscape generation so completed
        # reports remain responsive while the benchmark layer is being stabilized.
        competitive_landscape: list[FinalReportCompetitiveStage] = []
        leaders_snapshot = await self._leaders_snapshot_section(
            assessment_id=assessment_id,
            assessment=assessment,
            refresh_snapshot=refresh_synthesis,
        )
        quick_wins_timeline = await self._build_quick_wins_timeline(
            assessment_id=assessment_id,
            capability_rows=capability_rows,
            capabilities=capabilities,
            maturity_number_by_id=maturity_number_by_id,
        )
        working_missing = self._build_working_missing_section(
            axes=axes,
            capabilities=capabilities,
            strengths=strengths,
            pain_points=pain_points,
            strongest_axis=strongest.axis,
            priority_axis=priority.axis,
            axis_maturity_content=axis_maturity_content,
            rubric_content_by_capability_id=rubric_content_by_capability_id,
        )

        return FinalReportResponse(
            assessment_id=assessment_id,
            hero=hero,
            summary=summary,
            axes=axes,
            strengths=strengths,
            pain_points=pain_points,
            capabilities=capabilities,
            benchmarks=benchmarks,
            competitive_landscape=competitive_landscape,
            leaders_snapshot=leaders_snapshot,
            quick_wins_timeline=quick_wins_timeline,
            working_missing=working_missing,
        )

    async def debug_competitive_first_layer(
        self,
        assessment_id: int,
        competitor_name: str | None = None,
    ) -> dict[str, Any] | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        sector_name = getattr(assessment.company.sector, "name", "Unknown")
        company_name = normalize_text(getattr(assessment.company, "name", None)) or "You"
        return await self.benchmarks.debug_competitive_first_layer(
            sector=sector_name,
            company_name=company_name,
            competitor_name=competitor_name,
        )

    async def debug_telecom_semantic_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        pain_points = await self._telecom_benchmark_pain_points(assessment_id=assessment_id)
        service = SemanticLeadersService(settings=self.settings, llm_service=self.llm)
        return await service.debug_leaders_snapshot(
            sector=getattr(assessment.company.sector, "name", "Unknown"),
            respondent_company_name=normalize_text(getattr(assessment.company, "name", None)) or "You",
            pain_points=pain_points,
        )

    async def debug_telecom_discovery_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        pain_points = await self._telecom_benchmark_pain_points(assessment_id=assessment_id)
        service = TelecomDiscoveryLeadersService(settings=self.settings, llm_service=self.llm)
        return await service.build_leaders_snapshot(
            sector=getattr(assessment.company.sector, "name", "Unknown"),
            respondent_company_name=normalize_text(getattr(assessment.company, "name", None)) or "You",
            pain_points=pain_points,
            include_debug=True,
        )

    async def _leaders_snapshot_section(
        self,
        *,
        assessment_id: int,
        assessment: Any,
        refresh_snapshot: bool,
    ) -> FinalReportLeadersSnapshot | None:
        cached_payload = getattr(assessment, "leaders_snapshot_payload", None)
        snapshot_status = str(getattr(assessment, "leaders_snapshot_status", "") or "").strip().lower()
        if cached_payload and snapshot_status == LEADERS_SNAPSHOT_STATUS_COMPLETED and not refresh_snapshot:
            try:
                logger.warning("leaders_snapshot cache hit for assessment=%s", assessment_id)
                return FinalReportLeadersSnapshot(**cached_payload)
            except Exception as exc:
                logger.warning("Invalid cached leaders snapshot for assessment=%s: %s", assessment_id, exc)

        logger.warning("leaders_snapshot cache miss for assessment=%s", assessment_id)
        if refresh_snapshot:
            await self._schedule_leaders_snapshot_job(assessment_id=assessment_id, force_refresh=True)
            if cached_payload:
                try:
                    return FinalReportLeadersSnapshot(**cached_payload)
                except Exception:
                    pass
            pending_snapshot = self._pending_leaders_snapshot(assessment=assessment)
            await self._persist_leaders_snapshot_cache(
                assessment=assessment,
                snapshot=pending_snapshot,
                status=LEADERS_SNAPSHOT_STATUS_PENDING,
                generated_at=None,
                error_message=None,
            )
            return pending_snapshot

        if snapshot_status in {LEADERS_SNAPSHOT_STATUS_PENDING, LEADERS_SNAPSHOT_STATUS_RUNNING}:
            await self._schedule_leaders_snapshot_job(assessment_id=assessment_id, force_refresh=False)
            if cached_payload:
                try:
                    return FinalReportLeadersSnapshot(**cached_payload)
                except Exception as exc:
                    logger.warning("Invalid pending leaders snapshot payload for assessment=%s: %s", assessment_id, exc)
            return self._pending_leaders_snapshot(assessment=assessment)

        if snapshot_status == LEADERS_SNAPSHOT_STATUS_FAILED:
            if cached_payload:
                try:
                    return FinalReportLeadersSnapshot(**cached_payload)
                except Exception as exc:
                    logger.warning("Invalid failed leaders snapshot payload for assessment=%s: %s", assessment_id, exc)
            return self._failed_leaders_snapshot(assessment=assessment)

        pending_snapshot = self._pending_leaders_snapshot(assessment=assessment)
        await self._persist_leaders_snapshot_cache(
            assessment=assessment,
            snapshot=pending_snapshot,
            status=LEADERS_SNAPSHOT_STATUS_PENDING,
            generated_at=None,
            error_message=None,
        )
        await self._schedule_leaders_snapshot_job(assessment_id=assessment_id, force_refresh=False)
        return pending_snapshot

    async def prepare_leaders_snapshot_generation(
        self,
        *,
        assessment_id: int,
        assessment: Any,
    ) -> None:
        if str(getattr(assessment, "status", "")) != ASSESSMENT_STATUS_COMPLETED:
            return
        snapshot_status = str(getattr(assessment, "leaders_snapshot_status", "") or "").strip().lower()
        if snapshot_status == LEADERS_SNAPSHOT_STATUS_COMPLETED and getattr(assessment, "leaders_snapshot_payload", None):
            return
        pending_snapshot = self._pending_leaders_snapshot(assessment=assessment)
        await self._persist_leaders_snapshot_cache(
            assessment=assessment,
            snapshot=pending_snapshot,
            status=LEADERS_SNAPSHOT_STATUS_PENDING,
            generated_at=None,
            error_message=None,
        )
        await self._schedule_leaders_snapshot_job(assessment_id=assessment_id, force_refresh=False)

    async def _schedule_leaders_snapshot_job(
        self,
        *,
        assessment_id: int,
        force_refresh: bool,
    ) -> None:
        async with _leaders_snapshot_tasks_lock:
            existing_task = _leaders_snapshot_tasks.get(assessment_id)
            if existing_task is not None and not existing_task.done():
                logger.warning("leaders_snapshot joined in-flight task for assessment=%s", assessment_id)
                return
            logger.warning("leaders_snapshot job enqueued for assessment=%s refresh=%s", assessment_id, force_refresh)
            task = asyncio.create_task(
                self._run_leaders_snapshot_job(
                    assessment_id=assessment_id,
                    force_refresh=force_refresh,
                )
            )
            _leaders_snapshot_tasks[assessment_id] = task

    async def _run_leaders_snapshot_job(
        self,
        *,
        assessment_id: int,
        force_refresh: bool,
    ) -> None:
        semaphore = _get_leaders_snapshot_job_semaphore(self.settings)
        try:
            async with semaphore:
                logger.warning("leaders_snapshot job started for assessment=%s refresh=%s", assessment_id, force_refresh)
                async with SessionLocal() as db:
                    builder = _build_report_builder_service(db, self.settings)
                    await builder._generate_and_persist_leaders_snapshot_job(
                        assessment_id=assessment_id,
                        force_refresh=force_refresh,
                    )
                logger.warning("leaders_snapshot job completed for assessment=%s refresh=%s", assessment_id, force_refresh)
        except Exception as exc:
            logger.warning("leaders_snapshot job failed for assessment=%s refresh=%s error=%s", assessment_id, force_refresh, exc)
        finally:
            current_task = asyncio.current_task()
            async with _leaders_snapshot_tasks_lock:
                task = _leaders_snapshot_tasks.get(assessment_id)
                if task is current_task:
                    _leaders_snapshot_tasks.pop(assessment_id, None)

    async def _persist_leaders_snapshot_cache(
        self,
        *,
        assessment: Any,
        snapshot: FinalReportLeadersSnapshot,
        status: str,
        generated_at: datetime | None,
        error_message: str | None,
    ) -> None:
        if str(getattr(assessment, "status", "")) != ASSESSMENT_STATUS_COMPLETED:
            return
        try:
            async with self.uow:
                await self.assessments.update_leaders_snapshot_cache(
                    assessment=assessment,
                    leaders_snapshot_payload=snapshot.model_dump(),
                    leaders_snapshot_status=status,
                    leaders_snapshot_generated_at=generated_at,
                    leaders_snapshot_error=error_message,
                )
        except Exception as exc:
            logger.warning(
                "Could not persist leaders snapshot cache for assessment=%s: %s",
                getattr(assessment, "id", None),
                exc,
            )

    async def _generate_and_persist_leaders_snapshot_job(
        self,
        *,
        assessment_id: int,
        force_refresh: bool,
    ) -> None:
        assessment = None
        for attempt in range(5):
            assessment = await self.assessments.get_by_id(assessment_id)
            if assessment is not None and str(getattr(assessment, "status", "")) == ASSESSMENT_STATUS_COMPLETED:
                break
            await asyncio.sleep(0.4)
        if assessment is None or str(getattr(assessment, "status", "")) != ASSESSMENT_STATUS_COMPLETED:
            logger.warning("leaders_snapshot job skipped for assessment=%s because completion state was not visible yet", assessment_id)
            return

        if (
            not force_refresh
            and str(getattr(assessment, "leaders_snapshot_status", "") or "").strip().lower() == LEADERS_SNAPSHOT_STATUS_COMPLETED
            and getattr(assessment, "leaders_snapshot_payload", None)
        ):
            return

        existing_payload = getattr(assessment, "leaders_snapshot_payload", None)
        if not (force_refresh and existing_payload):
            running_snapshot = self._pending_leaders_snapshot(
                assessment=assessment,
                status=LEADERS_SNAPSHOT_STATUS_RUNNING,
                message="Benchmark content is generating in the background.",
            )
            await self._persist_leaders_snapshot_cache(
                assessment=assessment,
                snapshot=running_snapshot,
                status=LEADERS_SNAPSHOT_STATUS_RUNNING,
                generated_at=None,
                error_message=None,
            )

        snapshot = await self._generate_live_leaders_snapshot(
            assessment_id=assessment_id,
            assessment=assessment,
            generation_mode="refresh" if force_refresh else "initial",
        )
        if snapshot is None:
            if force_refresh and existing_payload:
                logger.warning("leaders_snapshot refresh failed for assessment=%s; preserving previous completed snapshot", assessment_id)
                return
            failed_snapshot = self._failed_leaders_snapshot(assessment=assessment)
            await self._persist_leaders_snapshot_cache(
                assessment=assessment,
                snapshot=failed_snapshot,
                status=LEADERS_SNAPSHOT_STATUS_FAILED,
                generated_at=None,
                error_message="generation_failed",
            )
            return

        await self._persist_leaders_snapshot_cache(
            assessment=assessment,
            snapshot=snapshot,
            status=LEADERS_SNAPSHOT_STATUS_COMPLETED,
            generated_at=datetime.now(timezone.utc),
            error_message=None,
        )

    async def _generate_live_leaders_snapshot(
        self,
        *,
        assessment_id: int,
        assessment: Any,
        generation_mode: str,
    ) -> FinalReportLeadersSnapshot | None:
        sector = getattr(assessment.company.sector, "name", "Unknown")
        respondent_company_name = normalize_text(getattr(assessment.company, "name", None)) or "You"
        pain_points = await self._telecom_benchmark_pain_points(assessment_id=assessment_id)
        service = SemanticLeadersService(settings=self.settings, llm_service=self.llm)
        try:
            snapshot = await service.build_leaders_snapshot(
                sector=sector,
                respondent_company_name=respondent_company_name,
                pain_points=pain_points,
                generation_mode=generation_mode,
            )
        except Exception as exc:
            logger.warning("Leaders snapshot generation failed for assessment=%s: %s", assessment_id, exc)
            return None

        leaders: list[FinalReportLeaderItem] = []
        for item in (snapshot.get("leaders") or []):
            company_name = str(item.get("company_name") or "").strip()
            if not company_name:
                continue
            leader_summary = normalize_text(str(item.get("leader_summary") or "")).strip() or None
            leaders.append(
                FinalReportLeaderItem(
                    key=str(item.get("key") or ""),
                    company_name=company_name,
                    note=leader_summary,
                    leader_summary=leader_summary,
                    logo_url=item.get("logo_url"),
                        evidence_links=[
                            FinalReportLeaderEvidenceLink(
                                label=normalize_text(str(link.get("label") or "")).strip(),
                                url=str(link.get("url") or ""),
                                source_title=normalize_text(str(link.get("source_title") or "")).strip() or None,
                                mapped_capability=normalize_text(str(link.get("mapped_capability") or "")).strip() or None,
                                why_relevant=normalize_text(str(link.get("why_relevant") or "")).strip() or None,
                            )
                            for link in (item.get("evidence_links") or [])
                            if str(link.get("url") or "").strip()
                        ],
                )
            )

        if not leaders:
            return None

        return FinalReportLeadersSnapshot(
            supported=bool(snapshot.get("supported")),
            status=LEADERS_SNAPSHOT_STATUS_COMPLETED,
            sector=str(snapshot.get("sector") or sector),
            respondent_company_name=str(snapshot.get("respondent_company_name") or respondent_company_name),
            message=None,
            metrics=FinalReportLeadersSnapshotMetrics(**snapshot.get("metrics", {})) if isinstance(snapshot.get("metrics"), dict) else None,
            leaders=leaders[:3],
        )

    def _pending_leaders_snapshot(
        self,
        *,
        assessment: Any,
        status: str = LEADERS_SNAPSHOT_STATUS_PENDING,
        message: str = "Benchmark content is being prepared and will appear shortly.",
    ) -> FinalReportLeadersSnapshot:
        return FinalReportLeadersSnapshot(
            supported=True,
            status=status,
            sector=str(getattr(getattr(assessment.company, "sector", None), "name", "Unknown") or "Unknown"),
            respondent_company_name=normalize_text(getattr(assessment.company, "name", None)) or "You",
            message=message,
            metrics=None,
            leaders=[],
        )

    def _failed_leaders_snapshot(self, *, assessment: Any) -> FinalReportLeadersSnapshot:
        return FinalReportLeadersSnapshot(
            supported=False,
            status=LEADERS_SNAPSHOT_STATUS_FAILED,
            sector=str(getattr(getattr(assessment.company, "sector", None), "name", "Unknown") or "Unknown"),
            respondent_company_name=normalize_text(getattr(assessment.company, "name", None)) or "You",
            message="Benchmark content is temporarily unavailable.",
            metrics=None,
            leaders=[],
        )

    async def _build_quick_wins_timeline(
        self,
        *,
        assessment_id: int,
        capability_rows: list[dict[str, Any]],
        capabilities: list[FinalReportCapabilityItem],
        maturity_number_by_id: dict[int, int],
    ) -> FinalReportQuickWinsTimeline | None:
        assessed_capability_ids = [
            int(row["id"])
            for row in capability_rows
            if row.get("id") is not None and str(row.get("assessment_status") or "not_assessed") == "assessed"
        ]
        template_result = await self.db.execute(
            select(
                CapabilityQuickWinTemplate.capability_id,
                CapabilityQuickWinTemplate.maturity_level_id,
                CapabilityQuickWinTemplate.quick_win_guideline,
                CapabilityQuickWinTemplate.after_text,
                CapabilityQuickWinTemplate.owner_hint,
                CapabilityQuickWinTemplate.timeline_hint,
            )
            .where(
                CapabilityQuickWinTemplate.active.is_(True),
                CapabilityQuickWinTemplate.capability_id.in_(assessed_capability_ids),
            )
        )
        template_by_key = {
            (int(capability_id), int(maturity_level_id)): {
                "quick_win_guideline": normalize_text(str(quick_win_guideline or "")).strip() or None,
                "after_text": normalize_text(str(after_text or "")).strip() or None,
                "owner_hint": normalize_text(str(owner_hint or "")).strip() or None,
                "timeline_hint": normalize_text(str(timeline_hint or "")).strip() or None,
            }
            for capability_id, maturity_level_id, quick_win_guideline, after_text, owner_hint, timeline_hint in template_result.all()
            if capability_id is not None and maturity_level_id is not None
        }

        selected = self._select_quick_win_candidates(
            capability_rows=capability_rows,
            capabilities=capabilities,
            maturity_number_by_id=maturity_number_by_id,
            template_by_key=template_by_key,
        )
        if not selected:
            return None

        capability_ids = [int(item["capability_id"]) for item in selected]
        answers_result = await self.db.execute(
            select(
                AssessmentAnswer.capability_id,
                AssessmentAnswer.question,
                AssessmentAnswer.answer,
            )
            .where(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.capability_id.in_(capability_ids),
            )
            .order_by(AssessmentAnswer.created_at.asc(), AssessmentAnswer.id.asc())
        )
        answers_by_capability: dict[int, list[str]] = {}
        for capability_id, question, answer in answers_result.all():
            if capability_id is None:
                continue
            answer_text = normalize_text(str(answer or "")).strip()
            question_text = normalize_text(str(question or "")).strip()
            if not answer_text:
                continue
            composed = f"Q: {question_text} A: {answer_text}" if question_text else answer_text
            answers_by_capability.setdefault(int(capability_id), []).append(composed)

        insights_result = await self.db.execute(
            select(
                AssessmentInsight.capability_id,
                AssessmentInsight.insight_text,
                AssessmentInsight.justification,
                AssessmentInsight.evidence_text,
            )
            .where(
                AssessmentInsight.assessment_id == assessment_id,
                AssessmentInsight.capability_id.in_(capability_ids),
            )
            .order_by(AssessmentInsight.created_at.desc(), AssessmentInsight.id.desc())
        )
        insights_by_capability: dict[int, list[str]] = {}
        for capability_id, insight_text, justification, evidence_text in insights_result.all():
            if capability_id is None:
                continue
            snippets = [
                normalize_text(str(insight_text or "")).strip(),
                normalize_text(str(justification or "")).strip(),
                normalize_text(str(evidence_text or "")).strip(),
            ]
            combined = " ".join(part for part in snippets if part)
            if combined:
                insights_by_capability.setdefault(int(capability_id), []).append(combined)

        llm_candidates: list[dict[str, Any]] = []
        for step, item in enumerate(selected, start=1):
            llm_candidates.append(
                {
                    "step": step,
                    "timeline_label": QUICK_WIN_TIMELINE_LABELS[step - 1],
                    "axis": item["axis"],
                    "capability": item["capability"],
                    "maturity_band": item["maturity_band"],
                    "quick_win_guideline": item.get("quick_win_guideline"),
                    "after_text": item.get("after_text"),
                    "owner_hint": item.get("owner_hint"),
                    "timeline_hint": item.get("timeline_hint"),
                    "respondent_answers": answers_by_capability.get(int(item["capability_id"]), [])[:3],
                    "respondent_insights": insights_by_capability.get(int(item["capability_id"]), [])[:3],
                    "current_rationale": item.get("rationale"),
                }
            )

        items = await self._shape_quick_wins_with_llm(llm_candidates)
        return FinalReportQuickWinsTimeline(items=items[:4]) if items else None

    def _select_quick_win_candidates(
        self,
        *,
        capability_rows: list[dict[str, Any]],
        capabilities: list[FinalReportCapabilityItem],
        maturity_number_by_id: dict[int, int],
        template_by_key: dict[tuple[int, int], dict[str, str | None]],
    ) -> list[dict[str, Any]]:
        capability_item_by_id = {
            int(item.capability_id): item
            for item in capabilities
            if item.capability_id is not None
        }
        candidates: list[dict[str, Any]] = []
        for row in capability_rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                continue
            capability_id = row.get("id")
            maturity_level_id = row.get("maturity_level_id")
            if capability_id is None or maturity_level_id is None:
                continue
            capability_item = capability_item_by_id.get(int(capability_id))
            if capability_item is None:
                continue
            maturity_level_number = maturity_number_by_id.get(int(maturity_level_id))
            if maturity_level_number is None:
                continue
            template = template_by_key.get((int(capability_id), int(maturity_level_id))) or {}
            timeline_hint = normalize_text(str(template.get("timeline_hint") or "")).strip() or None
            quick_win_guideline = normalize_text(str(template.get("quick_win_guideline") or "")).strip() or None
            if not quick_win_guideline:
                continue
            candidates.append(
                {
                    "capability_id": int(capability_id),
                    "maturity_level_id": int(maturity_level_id),
                    "maturity_level_number": int(maturity_level_number),
                    "axis": capability_item.axis,
                    "capability": capability_item.capability,
                    "maturity_band": capability_item.maturity_band,
                    "confidence": float(capability_item.confidence or 0.0),
                    "rationale": normalize_text(
                        capability_item.rationale
                        or str(row.get("justification") or row.get("insight_justification") or row.get("evidence_text") or "")
                    ).strip()
                    or None,
                    "quick_win_guideline": quick_win_guideline,
                    "after_text": normalize_text(str(template.get("after_text") or "")).strip() or None,
                    "owner_hint": normalize_text(str(template.get("owner_hint") or "")).strip() or None,
                    "timeline_hint": timeline_hint,
                    "timeline_stage": self._quick_win_timeline_stage(timeline_hint),
                    "quick_win_rank_score": self._quick_win_rank_score(
                        timeline_hint=timeline_hint,
                        maturity_level_number=int(maturity_level_number),
                        confidence=float(capability_item.confidence or 0.0),
                        has_after_text=bool(normalize_text(str(template.get("after_text") or "")).strip()),
                    ),
                }
            )

        candidates.sort(key=lambda item: item["quick_win_rank_score"])
        if len(candidates) <= 4:
            return candidates

        selected: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        seen_axes: set[str] = set()
        for item in candidates:
            axis_key = self._normalize_axis_key(str(item["axis"]))
            if axis_key in seen_axes:
                continue
            selected.append(item)
            seen_axes.add(axis_key)
            seen_ids.add(int(item["capability_id"]))
            if len(selected) >= 4:
                return selected

        for item in candidates:
            capability_id = int(item["capability_id"])
            if capability_id in seen_ids:
                continue
            selected.append(item)
            seen_ids.add(capability_id)
            if len(selected) >= 4:
                break
        return selected[:4]

    async def _shape_quick_wins_with_llm(self, candidates: list[dict[str, Any]]) -> list[FinalReportQuickWinItem]:
        fallback = [self._fallback_quick_win_item(candidate) for candidate in candidates[:4]]
        if not candidates or not self.settings.mistral_api_key:
            return fallback

        payload = {
            "timeline_labels": list(QUICK_WIN_TIMELINE_LABELS[: len(candidates)]),
            "items": candidates[:4],
        }
        system_prompt = (
            "You write section-4 quick wins for a CX maturity report. "
            "Return JSON only with an object containing an `items` array. "
            "No markdown. No benchmark references. No consultant filler."
        )
        user_prompt = (
            "Transform the following capability-level inputs into exactly one quick win per item.\n"
            "Rules:\n"
            "- Preserve each item's step and timeline_label exactly as given.\n"
            "- Write a short action title of 5 to 10 words, suitable for the timeline label and popup.\n"
            "- Prefer owners explicitly mentioned in respondent answers or insights; otherwise infer the most plausible concise owner role.\n"
            "- `today_text` must summarize the respondent's current weakness in plain language.\n"
            "- Do not rewrite or embellish `after_text`; the backend derives that separately from the quick-win template.\n"
            "- Use only the provided inputs.\n"
            "- Never mention competitors, benchmarks, or sources.\n"
            "- Keep owner concise, like 'CX Lead' or 'Operations Manager'.\n"
            "Return JSON in this shape:\n"
            "{\"items\": [{\"step\": 1, \"timeline_label\": \"Week 1\", \"title\": \"...\", \"owner\": \"...\", \"today_text\": \"...\"}]}\n\n"
            f"Input:\n{json.dumps(payload, ensure_ascii=True)}"
        )
        try:
            content = await self.llm.gateway.chat_messages(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
            )
            blob = extract_json(content)
            raw_items = blob.get("items") if isinstance(blob, dict) else None
            if not isinstance(raw_items, list):
                return fallback
            parsed: list[FinalReportQuickWinItem] = []
            for index, raw in enumerate(raw_items[: len(candidates)]):
                if not isinstance(raw, dict):
                    continue
                parsed.append(self._finalize_quick_win_item(raw=raw, candidate=candidates[index], fallback=fallback[index]))
            if len(parsed) != len(candidates[:4]):
                return fallback
            return self._post_process_quick_win_items(parsed=parsed, candidates=candidates[:4], fallback=fallback)
        except Exception as exc:
            logger.error("Quick wins timeline shaping failed: %s", exc, exc_info=True)
            return fallback

    def _fallback_quick_win_item(self, candidate: dict[str, Any]) -> FinalReportQuickWinItem:
        step = int(candidate["step"])
        title = self._fallback_quick_win_title(candidate)
        today_text = self._fallback_quick_win_today_text(candidate)
        after_text = self._quick_win_after_text(candidate)
        owner = self._normalize_quick_win_owner_label(
            raw_owner=str(candidate.get("owner_hint") or ""),
            axis=str(candidate.get("axis") or ""),
            capability=str(candidate.get("capability") or ""),
        )
        return FinalReportQuickWinItem(
            step=step,
            timeline_label=self._normalize_quick_win_label(candidate.get("timeline_label"), QUICK_WIN_TIMELINE_LABELS[step - 1]),
            title=title,
            owner=owner,
            today_text=today_text,
            after_text=after_text,
        )

    def _normalize_quick_win_label(self, value: Any, fallback: str) -> str:
        normalized = normalize_text(str(value or "")).strip()
        if normalized in QUICK_WIN_TIMELINE_LABELS:
            return normalized
        return fallback

    def _quick_win_timeline_stage(self, timeline_hint: str | None) -> int:
        normalized = normalize_text(timeline_hint).lower().strip()
        if normalized == "earliest quick win":
            return 0
        if normalized == "after first routine is in place":
            return 1
        if normalized == "after first routines are visible":
            return 2
        if normalized == "later operationalization":
            return 3
        return 2

    def _quick_win_rank_score(
        self,
        *,
        timeline_hint: str | None,
        maturity_level_number: int,
        confidence: float,
        has_after_text: bool,
    ) -> tuple[float, int, int, float]:
        return (
            float(self._quick_win_timeline_stage(timeline_hint)),
            int(maturity_level_number),
            0 if has_after_text else 1,
            -round(float(confidence), 4),
        )

    def _normalize_quick_win_owner_label(self, *, raw_owner: str, axis: str, capability: str) -> str:
        normalized = normalize_text(raw_owner).strip()
        lowered = normalized.lower()
        capability_text = normalize_text(capability).lower()
        governance_capability = any(
            phrase in capability_text
            for phrase in (
                "ownership and governance",
                "governance",
                "decision-making",
                "decision making",
            )
        )
        if governance_capability and not any(
            term in lowered
            for term in ("operation", "support", "marketing", "digital", "product", "people", "insight", "analytic")
        ):
            return "CX Lead"
        owner_map = (
            (("cx", "customer experience"), "CX Lead"),
            (("insight", "analytics", "data"), "Insights Lead"),
            (("operation", "service operation"), "Operations Lead"),
            (("support",), "Support Lead"),
            (("transform", "program"), "Transformation Lead"),
            (("market",), "Marketing Lead"),
            (("digital",), "Digital Lead"),
            (("people", "hr", "training", "learning"), "People Lead"),
            (("product",), "Product Lead"),
        )
        for terms, label in owner_map:
            if any(term in lowered for term in terms):
                if governance_capability and label == "Operations Lead":
                    return "CX Lead"
                return label
        if lowered in {"leadership", "management", "team", "business", "company"} or len(normalized.split()) > 4:
            return "CX Lead" if governance_capability else self._fallback_quick_win_owner(axis=axis, capability=capability)
        if normalized:
            return "CX Lead" if governance_capability else self._fallback_quick_win_owner(axis=axis, capability=capability)
        return "CX Lead" if governance_capability else self._fallback_quick_win_owner(axis=axis, capability=capability)

    def _fallback_quick_win_title(self, candidate: dict[str, Any]) -> str:
        capability_text = normalize_text(str(candidate.get("capability") or "")).lower()
        title_map = {
            "decision-making": "Launch monthly customer decision review",
            "ownership and governance": "Formalize cross-functional CX reviews",
            "feedback collection": "Set weekly CRM feedback review",
            "use of insights": "Review top issues by customer impact",
            "channel consistency": "Fix top three channel handoff gaps",
            "journey visibility": "Map top journeys and assign owners",
            "measurement and continuous improvement": "Assign owners to core CX metrics",
            "acting on pain points": "Add root-cause step before closure",
            "cx culture": "Coach teams on key CX moments",
        }
        if capability_text in title_map:
            return title_map[capability_text]
        title_source = normalize_text(str(candidate.get("quick_win_guideline") or "")).strip()
        title = title_source.split(".")[0].strip() if title_source else ""
        if not title or len(title) > 90:
            title = f"Strengthen {candidate['capability']}"
        return title

    def _fallback_quick_win_today_text(self, candidate: dict[str, Any]) -> str:
        capability_text = normalize_text(str(candidate.get("capability") or "")).lower()
        today_map = {
            "decision-making": "Customer feedback is monitored, but it rarely shapes decisions, priorities, or roadmap choices in a structured way.",
            "ownership and governance": "A named owner exists, but cross-functional routines and escalation paths are still inconsistent.",
            "feedback collection": "Feedback is captured, but review routines and coverage across touchpoints are still incomplete.",
            "use of insights": "Customer information is available, but themes, root causes, and impact are not reviewed in a consistent way.",
            "channel consistency": "Customers can still face uneven handoffs or inconsistent answers across channels.",
            "journey visibility": "Teams improve isolated touchpoints, but no shared journey view drives coordinated action.",
            "measurement and continuous improvement": "Metrics are tracked, but they are not yet tied to ownership, decisions, or follow-through.",
            "acting on pain points": "Pain points are handled reactively, without a repeatable backlog, named owners, or closure discipline.",
            "cx culture": "Customer experience expectations are not yet reinforced through daily habits, coaching, or shared routines.",
        }
        if capability_text in today_map:
            return today_map[capability_text]
        rationale = normalize_text(str(candidate.get("current_rationale") or "")).strip()
        if rationale:
            return rationale
        return f"{candidate['capability']} is still inconsistent and relies on informal habits instead of a repeatable routine."

    def _quick_win_after_text(self, candidate: dict[str, Any]) -> str:
        after_text = normalize_text(str(candidate.get("after_text") or "")).strip()
        if after_text:
            return after_text
        return f"{candidate['capability']} becomes clearer, more repeatable, and easier for the team to sustain."

    def _finalize_quick_win_item(
        self,
        *,
        raw: dict[str, Any],
        candidate: dict[str, Any],
        fallback: FinalReportQuickWinItem,
    ) -> FinalReportQuickWinItem:
        title = normalize_text(str(raw.get("title") or "")).strip() or fallback.title
        today_text = normalize_text(str(raw.get("today_text") or "")).strip() or fallback.today_text
        owner = self._normalize_quick_win_owner_label(
            raw_owner=str(raw.get("owner") or candidate.get("owner_hint") or ""),
            axis=str(candidate.get("axis") or ""),
            capability=str(candidate.get("capability") or ""),
        )

        if not self._quick_win_title_matches_context(title=title, candidate=candidate, today_text=today_text):
            title = fallback.title
        if not self._quick_win_today_matches_context(today_text=today_text, candidate=candidate, title=title):
            today_text = fallback.today_text

        return FinalReportQuickWinItem(
            step=int(raw.get("step") or fallback.step),
            timeline_label=self._normalize_quick_win_label(raw.get("timeline_label"), fallback.timeline_label),
            title=title,
            owner=owner,
            today_text=today_text,
            after_text=self._quick_win_after_text(candidate),
        )

    def _post_process_quick_win_items(
        self,
        *,
        parsed: list[FinalReportQuickWinItem],
        candidates: list[dict[str, Any]],
        fallback: list[FinalReportQuickWinItem],
    ) -> list[FinalReportQuickWinItem]:
        finalized: list[FinalReportQuickWinItem] = []
        seen_after_keys: set[str] = set()
        for index, item in enumerate(parsed):
            after_text = normalize_text(item.after_text).strip() or fallback[index].after_text
            if self._is_generic_quick_win_after_text(after_text) or self._after_text_key(after_text) in seen_after_keys:
                after_text = fallback[index].after_text
            seen_after_keys.add(self._after_text_key(after_text))
            finalized.append(
                FinalReportQuickWinItem(
                    step=item.step,
                    timeline_label=item.timeline_label,
                    title=item.title,
                    owner=self._normalize_quick_win_owner_label(
                        raw_owner=item.owner,
                        axis=str(candidates[index].get("axis") or ""),
                        capability=str(candidates[index].get("capability") or ""),
                    ),
                    today_text=item.today_text,
                    after_text=after_text,
                )
            )
        return finalized

    def _quick_win_title_matches_context(self, *, title: str, candidate: dict[str, Any], today_text: str) -> bool:
        title_terms = self._quick_win_terms(title)
        context_terms = self._quick_win_terms(
            " ".join(
                [
                    str(candidate.get("capability") or ""),
                    str(candidate.get("quick_win_guideline") or ""),
                    str(today_text or ""),
                ]
            )
        )
        return bool(title_terms and title_terms.intersection(context_terms))

    def _quick_win_today_matches_context(self, *, today_text: str, candidate: dict[str, Any], title: str) -> bool:
        today_terms = self._quick_win_terms(today_text)
        context_terms = self._quick_win_terms(
            " ".join(
                [
                    str(candidate.get("capability") or ""),
                    str(candidate.get("current_rationale") or ""),
                    str(title or ""),
                ]
            )
        )
        return bool(today_terms and today_terms.intersection(context_terms))

    def _quick_win_terms(self, text: str | None) -> set[str]:
        tokens = re.findall(r"[a-z0-9]+", normalize_text(text).lower())
        stopwords = {
            "the", "and", "with", "from", "into", "that", "this", "your", "their", "they",
            "will", "than", "have", "has", "for", "more", "less", "over", "only", "still",
            "today", "after", "week", "month", "lead", "manager", "owner", "team", "customer",
        }
        return {token for token in tokens if len(token) > 3 and token not in stopwords}

    def _is_generic_quick_win_after_text(self, text: str) -> bool:
        lowered = normalize_text(text).lower().strip()
        generic_markers = (
            "improves customer experience",
            "better outcomes",
            "more repeatable",
            "easier to sustain",
            "drives improvement",
        )
        return any(marker in lowered for marker in generic_markers)

    def _after_text_key(self, text: str) -> str:
        return re.sub(r"\s+", " ", normalize_text(text).lower()).strip()

    def _fallback_quick_win_owner(self, *, axis: str, capability: str) -> str:
        capability_text = normalize_text(capability).lower()
        axis_key = self._normalize_axis_key(axis)
        if "journey" in capability_text or "channel" in capability_text:
            return "CX Lead"
        if "feedback" in capability_text or axis_key == "analyze":
            return "Insights Lead"
        if axis_key == "manage":
            return "Operations Manager"
        if axis_key == "improve":
            return "Transformation Lead"
        return "CX Lead"

    async def _telecom_benchmark_pain_points(self, assessment_id: int) -> list[dict[str, Any]]:
        capability_rows = await self.capabilities.list_all_for_assessment(assessment_id=assessment_id)
        recommendation_rows = await self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        recommendation_by_capability = {int(row["capability_id"]): row for row in recommendation_rows}
        maturity_rows_result = await self.db.execute(select(MaturityLevel))
        maturity_rows = maturity_rows_result.scalars().all()
        maturity_number_by_id = {int(item.id): int(item.level_number) for item in maturity_rows}

        weakest_rows: list[dict[str, Any]] = []
        for row in capability_rows:
            if str(row.get("assessment_status") or "not_assessed") != "assessed":
                continue
            maturity_level_id = row.get("maturity_level_id")
            maturity_number = (
                maturity_number_by_id.get(int(maturity_level_id))
                if maturity_level_id is not None
                else None
            )
            if maturity_number is None:
                continue
            weakest_rows.append(
                {
                    "capability_id": int(row.get("id")),
                    "capability": str(row.get("label") or ""),
                    "rationale": normalize_text(str(row.get("rationale") or row.get("evidence_text") or "")).strip() or None,
                    "maturity_level_id": int(maturity_level_id) if maturity_level_id is not None else None,
                    "maturity_number": maturity_number,
                    "confidence": float(row.get("confidence") or 0.0),
                }
            )

        weakest_rows.sort(
            key=lambda item: (
                int(item["maturity_number"]),
                float(item["confidence"]),
                str(item["capability"]),
            )
        )
        selected_rows = weakest_rows[:3]
        capability_descriptions_result = await self.db.execute(
            select(Capability.id, Capability.description).where(
                Capability.id.in_([int(item["capability_id"]) for item in selected_rows])
            )
        )
        capability_description_by_id = {
            int(capability_id): normalize_text(str(description or "")).strip() or None
            for capability_id, description in capability_descriptions_result.all()
        }
        rubrics_by_capability = await self.capabilities.get_rubrics_for_capabilities(
            capability_ids=[int(item["capability_id"]) for item in selected_rows]
        )
        level3_recommendations_by_capability = await self.capabilities.get_level3_recommendations_for_capabilities(
            capability_ids=[int(item["capability_id"]) for item in selected_rows]
        )
        pain_points = [
            {
                "capability": item["capability"],
                "capability_description": capability_description_by_id.get(int(item["capability_id"])),
                "rationale": item["rationale"],
                "maturity_number": item["maturity_number"],
                "evidence_to_cite": (
                    normalize_text(
                        str(
                            (recommendation_by_capability.get(int(item["capability_id"])) or {}).get("evidence_to_cite")
                            or ""
                        )
                    ).strip()
                    or None
                ),
                "action_hints": (
                    normalize_text(
                        str(
                            (recommendation_by_capability.get(int(item["capability_id"])) or {}).get("initiative_suggestions")
                            or ""
                        )
                    ).strip()
                    or None
                ),
                "rubric_description": next(
                    (
                        normalize_text(str(rubric.get("description") or "")).strip() or None
                        for rubric in rubrics_by_capability.get(int(item["capability_id"]), [])
                        if int(rubric.get("maturity_level_id") or 0) == int(item["maturity_level_id"] or 0)
                    ),
                    None,
                ),
                "level3_action_hints": (
                    normalize_text(
                        str(
                            (level3_recommendations_by_capability.get(int(item["capability_id"])) or {}).get(
                                "initiative_suggestions"
                            )
                            or ""
                        )
                    ).strip()
                    or None
                ),
            }
            for item in selected_rows
        ]
        return pain_points

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
        refresh_synthesis: bool = False,
    ) -> dict[str, str | None]:
        cached_summary = normalize_text(getattr(assessment, "executive_summary_text", None))
        cached_priority = normalize_text(getattr(assessment, "priority_message_text", None))
        if cached_summary and cached_priority and not refresh_synthesis:
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
            logger.error(
                "Report synthesis generation failed; returning degraded summary.",
                extra={
                    "assessment_id": getattr(assessment, "id", None),
                    "company_name": getattr(getattr(assessment, "company", None), "name", None),
                    "priority_axis": priority_axis,
                    "strongest_axis": strongest_axis,
                    "exception_type": type(exc).__name__,
                },
                exc_info=True,
            )
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
                "Please refer to your detailed findings below."
            ),
            "priority_message": (
                f"The next step is to review the {priority_axis} findings and prioritize the lowest maturity items."
            ),
        }

    def _build_working_missing_section(
        self,
        *,
        axes: list[FinalReportAxisItem],
        capabilities: list[FinalReportCapabilityItem],
        strengths: list[FinalReportThemeItem],
        pain_points: list[FinalReportThemeItem],
        strongest_axis: str,
        priority_axis: str,
        axis_maturity_content: dict[tuple[str, int], dict[str, str | None]],
        rubric_content_by_capability_id: dict[int, dict[str, str | None]],
    ) -> list[FinalReportWorkingMissingAxis]:
        axis_order = ("manage", "analyze", "improve")
        label_map = {"manage": "Manage", "analyze": "Analyze", "improve": "Improve"}
        axis_lookup = {
            self._normalize_axis_key(item.axis): item
            for item in axes
            if self._normalize_axis_key(item.axis) in axis_order
        }
        capability_lookup: dict[str, list[FinalReportCapabilityItem]] = {key: [] for key in axis_order}
        for item in capabilities:
            axis_key = self._normalize_axis_key(item.axis)
            if axis_key in capability_lookup:
                capability_lookup[axis_key].append(item)

        strengths_lookup: dict[str, list[FinalReportThemeItem]] = {key: [] for key in axis_order}
        for item in strengths:
            axis_key = self._normalize_axis_key(item.axis)
            if axis_key in strengths_lookup:
                strengths_lookup[axis_key].append(item)

        pain_lookup: dict[str, list[FinalReportThemeItem]] = {key: [] for key in axis_order}
        for item in pain_points:
            axis_key = self._normalize_axis_key(item.axis)
            if axis_key in pain_lookup:
                pain_lookup[axis_key].append(item)

        result: list[FinalReportWorkingMissingAxis] = []
        for axis_key in axis_order:
            axis_item = axis_lookup.get(
                axis_key,
                FinalReportAxisItem(
                    axis=label_map[axis_key],
                    score_percent=0.0,
                    maturity_band="Not scored",
                    axis_level=None,
                    axis_level_label=None,
                ),
            )
            axis_capabilities = capability_lookup.get(axis_key, [])
            working = self._build_working_missing_items(
                prioritized=strengths_lookup.get(axis_key, []),
                capabilities=axis_capabilities,
                prefer_basic=False,
                rubric_content_by_capability_id=rubric_content_by_capability_id,
            )
            missing = self._build_working_missing_items(
                prioritized=pain_lookup.get(axis_key, []),
                capabilities=axis_capabilities,
                prefer_basic=True,
                rubric_content_by_capability_id=rubric_content_by_capability_id,
            )
            subtitle, intro, stat_note = self._working_missing_axis_copy(
                axis_key=axis_key,
                axis_label=label_map[axis_key],
                maturity_band=axis_item.maturity_band,
                axis_level=axis_item.axis_level,
                strongest_axis=strongest_axis,
                priority_axis=priority_axis,
                axis_maturity_content=axis_maturity_content,
            )
            result.append(
                FinalReportWorkingMissingAxis(
                    axis=axis_key,
                    label=label_map[axis_key],
                    score_percent=axis_item.score_percent,
                    maturity_band=axis_item.maturity_band,
                    axis_level=axis_item.axis_level,
                    axis_level_label=axis_item.axis_level_label,
                    subtitle=subtitle,
                    intro=intro,
                    stat_note=stat_note,
                    working=working,
                    missing=missing,
                )
            )
        return result

    def _build_working_missing_items(
        self,
        *,
        prioritized: list[FinalReportThemeItem],
        capabilities: list[FinalReportCapabilityItem],
        prefer_basic: bool,
        rubric_content_by_capability_id: dict[int, dict[str, str | None]],
    ) -> list[FinalReportWorkingMissingItem]:
        items: list[FinalReportWorkingMissingItem] = []
        seen: set[str] = set()
        capability_lookup = {
            (self._normalize_axis_key(item.axis), normalize_text(item.capability).lower()): item
            for item in capabilities
        }

        def push(capability_name: str, maturity_band: str, summary: str | None, evidence_snippet: str | None) -> None:
            key = normalize_text(capability_name).lower()
            if not key or key in seen:
                return
            seen.add(key)
            items.append(
                FinalReportWorkingMissingItem(
                    capability=capability_name,
                    maturity_band=maturity_band,
                    summary=summary,
                    evidence_snippet=evidence_snippet,
                )
            )

        for item in prioritized:
            capability_match = capability_lookup.get(
                (self._normalize_axis_key(item.axis), normalize_text(item.capability).lower())
            )
            display = self._working_missing_display_copy(
                capability=capability_match,
                rubric_content_by_capability_id=rubric_content_by_capability_id,
            )
            push(
                item.capability,
                item.maturity_band,
                display["summary"] or normalize_text(item.recommendation) or normalize_text(item.rationale),
                display["evidence_snippet"] or normalize_text(item.rationale) or normalize_text(item.recommendation),
            )

        sorted_capabilities = sorted(
            capabilities,
            key=lambda item: (
                0 if (item.maturity_band == "Basic") == prefer_basic else 1,
                float(item.confidence or 0.0) if not prefer_basic else -float(item.confidence or 0.0),
                item.capability,
            ),
        )
        for item in sorted_capabilities:
            if len(items) >= 3:
                break
            if prefer_basic and item.maturity_band != "Basic":
                continue
            if not prefer_basic and item.maturity_band == "Basic":
                continue
            display = self._working_missing_display_copy(
                capability=item,
                rubric_content_by_capability_id=rubric_content_by_capability_id,
            )
            push(
                item.capability,
                item.maturity_band,
                display["summary"] or normalize_text(item.recommendation) or normalize_text(item.rationale),
                display["evidence_snippet"] or normalize_text(item.rationale) or normalize_text(item.recommendation),
            )
        return items[:3]

    def _current_rubric_content_by_capability(
        self,
        *,
        capability_rows: list[dict[str, Any]],
        rubrics_by_capability: dict[int, list[dict]],
    ) -> dict[int, dict[str, str | None]]:
        result: dict[int, dict[str, str | None]] = {}
        for row in capability_rows:
            capability_id = row.get("id")
            maturity_level_id = row.get("maturity_level_id")
            if capability_id is None or maturity_level_id is None:
                continue
            for rubric in rubrics_by_capability.get(int(capability_id), []):
                if int(rubric.get("maturity_level_id") or 0) != int(maturity_level_id):
                    continue
                result[int(capability_id)] = {
                    "description": normalize_text(str(rubric.get("description") or "")).strip() or None,
                    "card_summary": normalize_text(str(rubric.get("card_summary") or "")).strip() or None,
                }
                break
        return result

    def _working_missing_display_copy(
        self,
        *,
        capability: FinalReportCapabilityItem | None,
        rubric_content_by_capability_id: dict[int, dict[str, str | None]],
    ) -> dict[str, str | None]:
        if capability is None or capability.capability_id is None:
            return {"summary": None, "evidence_snippet": None}
        content = rubric_content_by_capability_id.get(int(capability.capability_id), {})
        return {
            "summary": content.get("card_summary") or content.get("description"),
            "evidence_snippet": None,
        }

    def _working_missing_axis_copy(
        self,
        *,
        axis_key: str,
        axis_label: str,
        maturity_band: str,
        axis_level: int | None,
        strongest_axis: str,
        priority_axis: str,
        axis_maturity_content: dict[tuple[str, int], dict[str, str | None]],
    ) -> tuple[str, str, str]:
        strongest_key = self._normalize_axis_key(strongest_axis)
        priority_key = self._normalize_axis_key(priority_axis)
        content = (
            axis_maturity_content.get((axis_key, int(axis_level)))
            if axis_level is not None
            else None
        ) or {}

        subtitle = content.get("axis_description")
        if not subtitle:
            if maturity_band == "Advanced":
                subtitle = f"{axis_label} is operating as a reliable system, not just a good intention."
            elif maturity_band == "Established":
                subtitle = f"{axis_label} shows visible discipline, but execution is not fully systematic yet."
            elif maturity_band == "Basic":
                subtitle = f"{axis_label} shows early signals, but the operating model is still fragile."
            else:
                subtitle = f"{axis_label} does not yet have enough evidence to show a stable operating model."

        intro = content.get("axis_panel_copy")
        if not intro and axis_key == strongest_key:
            intro = (
                f"{axis_label} is currently the strongest part of the respondent profile. "
                f"It already shows the clearest operating evidence in the assessment."
            )
            stat_note = "This is the most mature axis in the current report and the best foundation to build on."
        elif not intro and axis_key == priority_key:
            intro = (
                f"{axis_label} is the main priority axis right now. "
                f"It needs stronger routines, shared visibility, and more repeatable follow-through."
            )
            stat_note = "This is the axis where the next maturity gain is most likely to come from."
        elif not intro:
            intro = (
                f"{axis_label} sits between current strengths and current gaps. "
                f"The focus here is to keep what is working and make the weaker routines more consistent."
            )
            stat_note = "This axis has meaningful signals, but it still needs stronger consistency and proof."
        else:
            if axis_key == strongest_key:
                stat_note = "This is the most mature axis in the current report and the best foundation to build on."
            elif axis_key == priority_key:
                stat_note = "This is the axis where the next maturity gain is most likely to come from."
            else:
                stat_note = "This axis has meaningful signals, but it still needs stronger consistency and proof."
        return subtitle, intro, stat_note

    @staticmethod
    def _normalize_axis_key(value: str | None) -> str:
        normalized = normalize_text(value).lower().strip()
        if normalized.startswith("manag"):
            return "manage"
        if normalized.startswith("anal"):
            return "analyze"
        if normalized.startswith("improv"):
            return "improve"
        return normalized

    def _benchmark_evidence_signals(
        self,
        capabilities: list[FinalReportCapabilityItem],
        pain_points: list[FinalReportThemeItem],
        priority_axis: str,
    ) -> list[BenchmarkEvidenceSignal]:
        signals: list[BenchmarkEvidenceSignal] = []
        seen: set[tuple[str, str]] = set()

        def add_signal(capability: str, maturity_band: str, rationale: str | None, axis: str) -> None:
            key = (axis, capability)
            if key in seen:
                return
            seen.add(key)
            signals.append(
                BenchmarkEvidenceSignal(
                    capability=capability,
                    maturity_band=maturity_band,
                    rationale=rationale,
                )
            )

        for item in pain_points:
            add_signal(
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                axis=item.axis,
            )

        for item in capabilities:
            if len(signals) >= 6:
                break
            if item.axis != priority_axis:
                continue
            add_signal(
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                axis=item.axis,
            )
        return signals

    def _band_from_level(self, level: int | None, assessment_status: str) -> str:
        return MaturityScoring.band_from_level(level=level, assessment_status=assessment_status)

    @staticmethod
    def _rounded_level(average: float) -> int | None:
        if average <= 0:
            return None
        return max(1, min(3, int(round(average))))

    @staticmethod
    def _level_label(level: int | None) -> str | None:
        if level is None:
            return None
        return f"{level} / 3"

    @staticmethod
    def _report_date_label(value: Any) -> str | None:
        if value is None:
            return None
        try:
            return value.strftime("%B %Y")
        except Exception:
            return None

    def _hero_message(
        self,
        executive_summary: str | None,
        priority_message: str | None,
        overall_band: str,
        priority_axis: str,
    ) -> str:
        summary = normalize_text(executive_summary)
        priority = normalize_text(priority_message)
        if summary and priority and priority.lower() not in summary.lower():
            return f"{summary} {priority}"
        if summary:
            return summary
        if priority:
            return priority
        if overall_band == "Not scored":
            return "The assessment is not yet complete enough to generate a reliable maturity summary."
        return f"The next step is to strengthen the {priority_axis} axis and raise overall maturity."

    def _competitive_company_note(
        self,
        *,
        overall_band: str,
        strongest_axis: str,
        priority_axis: str,
    ) -> str:
        strongest = normalize_text(strongest_axis).lower() if strongest_axis else "your strongest area"
        priority = normalize_text(priority_axis).lower() if priority_axis else "your next priority"
        if overall_band == "Basic":
            return (
                f"Early customer-experience foundations are visible, with the biggest opportunity in {priority}."
            )
        if overall_band == "Advanced":
            return (
                f"Customer experience is already being treated as a competitive system, with {strongest} leading today."
            )
        return (
            f"Solid ownership culture and visible progress, with {priority} still needing a more repeatable operating model."
        )

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


