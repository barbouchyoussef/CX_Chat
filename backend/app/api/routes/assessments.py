from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.dependencies.db import get_db
from app.domain.errors import AssessmentStateConflictError
from app.schemas.assessment import (
    AnswerRequest,
    AnswerResponse,
    AssessmentResponse,
    NextQuestionResponse,
    StartAssessmentRequest,
    StartAssessmentResponse,
)
from app.schemas.assessment_memory import AssessmentMemoryResponse
from app.schemas.admin import AssessmentsListResponse
from app.schemas.conversation import MessagesResponse
from app.schemas.capability_status import CapabilitiesStatusResponse, CapabilityHighlightsResponse
from app.schemas.final_report import FinalReportResponse
from app.schemas.recommendations import (
    BatchRecommendationGenerateRequest,
    BatchRecommendationGenerateResponse,
    AssessmentRecommendationsResponse,
    AssessmentTraceResponse,
    RecommendationOutputsResponse,
)
from app.schemas.interview_guide import (
    InterviewGuideResponse,
    GenerateInterviewGuideRequest,
    SaveInterviewGuideRequest,
    InterviewGuideListItem,
)
from app.services.assessment import (
    AssessmentConversationService,
    AssessmentReportingService,
    AssessmentService,
    build_assessment_conversation_service,
    build_assessment_reporting_service,
    build_assessment_service,
)
from app.services.platform import AsyncUnitOfWork

router = APIRouter(prefix="/assessments")


def get_reporting_service(db: AsyncSession = Depends(get_db)) -> AssessmentReportingService:
    return build_assessment_reporting_service(db)


def get_assessment_service(db: AsyncSession = Depends(get_db)) -> AssessmentService:
    return build_assessment_service(db)


def get_conversation_service(db: AsyncSession = Depends(get_db)) -> AssessmentConversationService:
    return build_assessment_conversation_service(db)


def _http_500_with_dev_detail(exc: Exception) -> HTTPException:
    settings = get_settings()
    detail = "Internal server error"
    if settings.app_env != "production":
        detail = f"{type(exc).__name__}: {exc}"
    return HTTPException(status_code=500, detail=detail)


@router.post("", response_model=StartAssessmentResponse)
async def start_assessment(
    req: StartAssessmentRequest,
    service: AssessmentService = Depends(get_assessment_service),
) -> StartAssessmentResponse:
    try:
        assessment = await service.start_assessment(
            company_name=req.company_name,
            sector_label=req.sector,
            company_size_label=req.size,
            region=req.region,
            prompt_profile=req.prompt_profile,
            language=req.language,
        )
        return StartAssessmentResponse(assessment_id=assessment.id)
    except (ValueError, RuntimeError) as e:
        # If auto-classification fails, the client can retry with explicit sector/size.
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(
    assessment_id: int,
    service: AssessmentService = Depends(get_assessment_service),
) -> AssessmentResponse:
    data = await service.get_assessment(assessment_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return data


@router.get("/{assessment_id}/next-question", response_model=NextQuestionResponse)
async def next_question(
    assessment_id: int,
    service: AssessmentConversationService = Depends(get_conversation_service),
) -> NextQuestionResponse:
    try:
        result = await service.next_question(assessment_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_500_with_dev_detail(exc)


@router.post("/{assessment_id}/answers", response_model=AnswerResponse)
async def submit_answer(
    assessment_id: int,
    req: AnswerRequest,
    service: AssessmentConversationService = Depends(get_conversation_service),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> AnswerResponse:
    try:
        result = await service.submit_answer(
            assessment_id,
            req.answer,
            idempotency_key=idempotency_key,
            expected_axis=req.expected_axis,
            expected_version=req.expected_version,
        )
    except AssessmentStateConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as exc:
        raise _http_500_with_dev_detail(exc)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/memory", response_model=AssessmentMemoryResponse)
async def get_assessment_memory(
    assessment_id: int,
    service: AssessmentService = Depends(get_assessment_service),
) -> AssessmentMemoryResponse:
    try:
        result = await service.get_memory(assessment_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_500_with_dev_detail(exc)


@router.get("", response_model=AssessmentsListResponse)
async def list_assessments(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    region_code: str | None = Query(default=None),
    service: AssessmentService = Depends(get_assessment_service),
) -> AssessmentsListResponse:
    return await service.list_assessments(limit=limit, offset=offset, region_code=region_code)


@router.get("/{assessment_id}/messages", response_model=MessagesResponse)
async def list_messages(
    assessment_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    service: AssessmentService = Depends(get_assessment_service),
) -> MessagesResponse:
    result = await service.get_messages(assessment_id, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/capabilities", response_model=CapabilitiesStatusResponse)
async def capabilities_status(
    assessment_id: int,
    axis: str | None = None,
    service: AssessmentService = Depends(get_assessment_service),
) -> CapabilitiesStatusResponse:
    try:
        result = await service.get_capabilities_status(assessment_id, axis=axis)
        if result is None:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_500_with_dev_detail(exc)


@router.get("/{assessment_id}/capabilities/highlights", response_model=CapabilityHighlightsResponse)
async def capability_highlights(
    assessment_id: int,
    axis: str | None = None,
    limit: int = Query(default=6, ge=1, le=20),
    service: AssessmentService = Depends(get_assessment_service),
) -> CapabilityHighlightsResponse:
    try:
        result = await service.get_capability_highlights(assessment_id=assessment_id, axis=axis, limit=limit)
        if result is None:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise _http_500_with_dev_detail(exc)


@router.get("/{assessment_id}/criteria", response_model=CapabilitiesStatusResponse)
async def criteria_status_legacy(
    assessment_id: int,
    axis: str | None = None,
    service: AssessmentService = Depends(get_assessment_service),
) -> CapabilitiesStatusResponse:
    # Backward-compatible alias for older clients.
    result = await service.get_capabilities_status(assessment_id, axis=axis)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/recommendations", response_model=AssessmentRecommendationsResponse)
async def recommendations(
    assessment_id: int,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> AssessmentRecommendationsResponse:
    result = await reporting.get_recommendations(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.post("/{assessment_id}/recommendations/batch-generate", response_model=BatchRecommendationGenerateResponse)
async def recommendations_batch_generate(
    assessment_id: int,
    req: BatchRecommendationGenerateRequest,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> BatchRecommendationGenerateResponse:
    result = await reporting.generate_recommendations_batch(
        assessment_id=assessment_id,
        language=req.language,
        max_actions_per_capability=req.max_actions_per_capability,
        tone=req.tone,
        max_words_per_capability=req.max_words_per_capability,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/recommendation-outputs", response_model=RecommendationOutputsResponse)
async def recommendation_outputs(
    assessment_id: int,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> RecommendationOutputsResponse:
    result = await reporting.get_recommendation_outputs(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/final-report", response_model=FinalReportResponse)
async def final_report(
    assessment_id: int,
    refresh_synthesis: bool = Query(default=False),
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> FinalReportResponse:
    result = await reporting.get_final_report(
        assessment_id=assessment_id,
        refresh_synthesis=refresh_synthesis,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.post("/interview-guide/generate", response_model=InterviewGuideResponse)
async def generate_interview_guide(
    req: GenerateInterviewGuideRequest,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> InterviewGuideResponse:
    result = await reporting.get_interview_guide(req)
    if result is None:
        raise HTTPException(status_code=400, detail="Unable to generate interview guide. Verify parameters.")
    return result


@router.get("/{assessment_id}/competitive-first-layer-debug")
async def competitive_first_layer_debug(
    assessment_id: int,
    competitor_name: str | None = Query(default=None),
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> dict:
    result = await reporting.debug_competitive_first_layer(
        assessment_id=assessment_id,
        competitor_name=competitor_name,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/telecom-semantic-leaders-debug")
async def telecom_semantic_leaders_debug(
    assessment_id: int,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> dict:
    result = await reporting.debug_telecom_semantic_leaders(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/telecom-discovery-leaders-debug")
async def telecom_discovery_leaders_debug(
    assessment_id: int,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> dict:
    result = await reporting.debug_telecom_discovery_leaders(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/trace", response_model=AssessmentTraceResponse)
async def trace(
    assessment_id: int,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> AssessmentTraceResponse:
    result = await reporting.get_trace(assessment_id=assessment_id, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


from pydantic import BaseModel

class BenchmarkTestRequest(BaseModel):
    sector: str
    company_name: str
    pain_points: list[dict] = []
    language: str = "fr"

@router.post("/benchmark-test")
async def run_benchmark_test(
    req: BenchmarkTestRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from app.services.llm.core.facade_service import build_llm_service
    from app.services.assessment.reporting.telecom_semantic_leaders_service import SemanticLeadersService

    settings = get_settings()
    llm = build_llm_service(settings=settings)

    pain_points = req.pain_points
    if not pain_points:
        # Default seeded pain points corresponding to common capabilities and rubrics
        pain_points = [
            {
                "capability": "Feedback collection",
                "capability_description": "Capturing customer feedback through listening channels, surveys, complaint capture, and regular review routines.",
                "action_hints": "Set one recurring feedback pulse and one weekly review routine.",
                "rubric_description": "Feedback is collected inconsistently or through a few isolated channels, with weak logging, ownership, and review rhythm.",
                "level3_action_hints": "Feedback becomes a normal input into service management, improving continuity between listening, decisions, and action."
            },
            {
                "capability": "Measurement and continuous improvement",
                "capability_description": "Tracking customer experience through dashboards, review cycles, owner linkage, and action-focused metrics.",
                "action_hints": "Pick a small set of CX measures and review them on a fixed cadence.",
                "rubric_description": "Measures are limited or disconnected from action, with little evidence of a regular improvement loop.",
                "level3_action_hints": "Improvement activity becomes easier to prioritize and govern through connected CX, operational, and business outcomes."
            },
            {
                "capability": "Decision-making",
                "capability_description": "Using customer evidence in decision forums, prioritization reviews, and action planning.",
                "action_hints": "Link customer decisions to named owners, actions, and follow-up checks.",
                "rubric_description": "Customer evidence influences some decisions, but the practice is partial, siloed, or inconsistent across teams.",
                "level3_action_hints": "Customer evidence has a stronger path into planning, helping teams prioritize resources around the highest-impact experience gaps."
            }
        ]

    service = SemanticLeadersService(settings=settings, llm_service=llm)

    try:
        snapshot = await service.build_leaders_snapshot(
            sector=req.sector,
            respondent_company_name=req.company_name,
            pain_points=pain_points,
            language=req.language,
            generation_mode="initial",
        )
        return snapshot
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/interview-guide/save")
async def save_interview_guide(
    req: SaveInterviewGuideRequest,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> dict:
    return await reporting.save_interview_guide(req)


@router.get("/interview-guide/list", response_model=list[InterviewGuideListItem])
async def list_interview_guides(
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> list[InterviewGuideListItem]:
    return await reporting.list_interview_guides()


@router.get("/interview-guide/{guide_id}", response_model=InterviewGuideResponse)
async def get_saved_interview_guide(
    guide_id: int,
    reporting: AssessmentReportingService = Depends(get_reporting_service),
) -> InterviewGuideResponse:
    guide = await reporting.get_saved_interview_guide(guide_id)
    if guide is None:
        raise HTTPException(status_code=404, detail="Interview guide not found")
    
    # Expose the payload parsed as InterviewGuideResponse
    # The payload is stored as JSONB which matches the InterviewGuideResponse schema structure
    # We inject the saved guide ID into the payload so the frontend knows its DB primary key
    payload = dict(guide.payload)
    payload["id"] = guide.id
    return payload

