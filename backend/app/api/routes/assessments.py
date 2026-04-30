from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

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
from app.schemas.capability_status import CapabilitiesStatusResponse
from app.schemas.final_report import FinalReportResponse
from app.schemas.recommendations import (
    BatchRecommendationGenerateRequest,
    BatchRecommendationGenerateResponse,
    AssessmentRecommendationsResponse,
    AssessmentTraceResponse,
    RecommendationOutputsResponse,
)
from app.services.assessment_service import AssessmentService

router = APIRouter(prefix="/assessments")


@router.post("", response_model=StartAssessmentResponse)
def start_assessment(req: StartAssessmentRequest, db: Session = Depends(get_db)) -> StartAssessmentResponse:
    service = AssessmentService(db)
    try:
        assessment = service.start_assessment(
            company_name=req.company_name,
            sector_label=req.sector,
            company_size_label=req.size,
            prompt_profile=req.prompt_profile,
        )
        return StartAssessmentResponse(assessment_id=assessment.id)
    except (ValueError, RuntimeError) as e:
        # If auto-classification fails, the client can retry with explicit sector/size.
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/{assessment_id}", response_model=AssessmentResponse)
def get_assessment(assessment_id: int, db: Session = Depends(get_db)) -> AssessmentResponse:
    service = AssessmentService(db)
    data = service.get_assessment(assessment_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return data


@router.get("/{assessment_id}/next-question", response_model=NextQuestionResponse)
def next_question(assessment_id: int, db: Session = Depends(get_db)) -> NextQuestionResponse:
    service = AssessmentService(db)
    result = service.next_question(assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.post("/{assessment_id}/answers", response_model=AnswerResponse)
def submit_answer(
    assessment_id: int,
    req: AnswerRequest,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> AnswerResponse:
    service = AssessmentService(db)
    try:
        result = service.submit_answer(
            assessment_id,
            req.answer,
            idempotency_key=idempotency_key,
            expected_axis=req.expected_axis,
            expected_version=req.expected_version,
        )
    except AssessmentStateConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/memory", response_model=AssessmentMemoryResponse)
def get_assessment_memory(assessment_id: int, db: Session = Depends(get_db)) -> AssessmentMemoryResponse:
    service = AssessmentService(db)
    result = service.get_memory(assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("", response_model=AssessmentsListResponse)
def list_assessments(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> AssessmentsListResponse:
    return AssessmentService(db).list_assessments(limit=limit, offset=offset)


@router.get("/{assessment_id}/messages", response_model=MessagesResponse)
def list_messages(
    assessment_id: int,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> MessagesResponse:
    result = AssessmentService(db).get_messages(assessment_id, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/capabilities", response_model=CapabilitiesStatusResponse)
def capabilities_status(
    assessment_id: int,
    axis: str | None = None,
    db: Session = Depends(get_db),
) -> CapabilitiesStatusResponse:
    result = AssessmentService(db).get_capabilities_status(assessment_id, axis=axis)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/criteria", response_model=CapabilitiesStatusResponse)
def criteria_status_legacy(
    assessment_id: int,
    axis: str | None = None,
    db: Session = Depends(get_db),
) -> CapabilitiesStatusResponse:
    # Backward-compatible alias for older clients.
    result = AssessmentService(db).get_capabilities_status(assessment_id, axis=axis)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/recommendations", response_model=AssessmentRecommendationsResponse)
def recommendations(
    assessment_id: int,
    db: Session = Depends(get_db),
) -> AssessmentRecommendationsResponse:
    result = AssessmentService(db).get_recommendations(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.post("/{assessment_id}/recommendations/batch-generate", response_model=BatchRecommendationGenerateResponse)
def recommendations_batch_generate(
    assessment_id: int,
    req: BatchRecommendationGenerateRequest,
    db: Session = Depends(get_db),
) -> BatchRecommendationGenerateResponse:
    result = AssessmentService(db).generate_recommendations_batch(
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
def recommendation_outputs(
    assessment_id: int,
    db: Session = Depends(get_db),
) -> RecommendationOutputsResponse:
    result = AssessmentService(db).get_recommendation_outputs(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/final-report", response_model=FinalReportResponse)
def final_report(
    assessment_id: int,
    db: Session = Depends(get_db),
) -> FinalReportResponse:
    result = AssessmentService(db).get_final_report(assessment_id=assessment_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result


@router.get("/{assessment_id}/trace", response_model=AssessmentTraceResponse)
def trace(
    assessment_id: int,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> AssessmentTraceResponse:
    result = AssessmentService(db).get_trace(assessment_id=assessment_id, limit=limit, offset=offset)
    if result is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return result
