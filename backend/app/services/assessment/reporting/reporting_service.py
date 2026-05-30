from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.final_report import FinalReportResponse
from app.schemas.recommendations import (
    AssessmentRecommendationsResponse,
    AssessmentTraceResponse,
    BatchRecommendationGenerateResponse,
    RecommendationOutputsResponse,
)
from app.services.assessment.reporting.benchmark_service import BenchmarkService
from app.services.assessment.reporting.recommendation_service import RecommendationService
from app.services.assessment.reporting.final_report_service import ReportBuilderService
from app.services.assessment.reporting.trace_service import AssessmentTraceService
from app.services.assessment.scoring.scoring_service import (
    AssessmentScoringService,
    build_assessment_scoring_service,
)
from app.services.llm.core.facade_service import LLMService, build_llm_service
from app.services.platform import AsyncUnitOfWork


class AssessmentReportingService:
    """Compatibility facade delegating to reporting sub-services."""

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

    async def get_final_report(
        self,
        assessment_id: int,
        refresh_synthesis: bool = False,
    ) -> FinalReportResponse | None:
        return await self.report_builder.get_final_report(
            assessment_id=assessment_id,
            refresh_synthesis=refresh_synthesis,
        )

    async def debug_competitive_first_layer(
        self,
        assessment_id: int,
        competitor_name: str | None = None,
    ) -> dict[str, Any] | None:
        return await self.report_builder.debug_competitive_first_layer(
            assessment_id=assessment_id,
            competitor_name=competitor_name,
        )

    async def debug_telecom_semantic_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        return await self.report_builder.debug_telecom_semantic_leaders(assessment_id=assessment_id)

    async def debug_telecom_discovery_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        return await self.report_builder.debug_telecom_discovery_leaders(assessment_id=assessment_id)

    async def finalize_completed_assessment(self, assessment_id: int, assessment: Any) -> None:
        await self.recommendations.finalize_completed_assessment(
            assessment_id=assessment_id,
            assessment=assessment,
        )
        await self.report_builder.prepare_leaders_snapshot_generation(
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
    benchmarks = benchmark_service or BenchmarkService(db=db)
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
    report_builder = ReportBuilderService(
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
        report_builder_service=report_builder,
    )
