from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.schemas.client import ClientTurnRequest, ClientTurnResponse, WelcomeResponse
from app.services.assessment import AssessmentService, build_assessment_service

router = APIRouter(prefix="/client")


def get_assessment_service(db: AsyncSession = Depends(get_db)) -> AssessmentService:
    return build_assessment_service(db)




@router.post("/turn", response_model=ClientTurnResponse)
async def client_turn(
    req: ClientTurnRequest,
    service: AssessmentService = Depends(get_assessment_service),
) -> ClientTurnResponse:
    conversation = service.conversation

    # Step 1: start (company name) if no assessment_id.
    if req.assessment_id is None:
        try:
            assessment = await service.start_assessment(
                company_name=req.message,
                sector_label=req.sector_code,
                company_size_label=req.company_size_code,
            )
        except (ValueError, RuntimeError) as e:
            # Only ask for sector/size when auto-classification fails.
            sectors = await service.sectors.list_options()
            sizes = await service.sizes.list_options()
            return ClientTurnResponse(
                assessment_id=None,
                status="needs_profile",
                axis=None,
                assistant_message=str(e),
                sectors=[{"code": s.code, "label": s.name} for s in sectors],
                company_sizes=[{"code": cs.code, "label": cs.name} for cs in sizes],
            )

        nxt = await conversation.next_question(assessment.id)
        # next_question returns None only when assessment missing; impossible here.
        if nxt is None:
            return ClientTurnResponse(
                assessment_id=assessment.id,
                status="error",
                axis=None,
                assistant_message="Failed to start assessment.",
            )
        msg = nxt.question or (nxt.message or "")
        return ClientTurnResponse(
            assessment_id=assessment.id,
            status=nxt.status,
            axis=nxt.axis,
            assistant_message=msg,
        )

    # Step 2: answer turn.
    if not req.message.strip():
        return ClientTurnResponse(
            assessment_id=req.assessment_id,
            status="error",
            axis=None,
            assistant_message="Empty message.",
        )

    ans = await conversation.submit_answer(req.assessment_id, req.message)
    if ans is None:
        return ClientTurnResponse(
            assessment_id=req.assessment_id,
            status="not_found",
            axis=None,
            assistant_message="Assessment not found.",
        )

    # If completed, return a completion message; otherwise return next question.
    if ans.status != "active":
        return ClientTurnResponse(
            assessment_id=req.assessment_id,
            status=ans.status,
            axis=ans.axis,
            assistant_message="Assessment completed.",
            covered=ans.covered,
            confidence=ans.confidence,
        )

    nxt = await conversation.next_question(req.assessment_id)
    if nxt is None:
        return ClientTurnResponse(
            assessment_id=req.assessment_id,
            status="error",
            axis=None,
            assistant_message="Failed to fetch next question.",
            covered=ans.covered,
            confidence=ans.confidence,
        )
    msg = nxt.question or (nxt.message or "")
    return ClientTurnResponse(
        assessment_id=req.assessment_id,
        status=nxt.status,
        axis=nxt.axis,
        assistant_message=msg,
        covered=ans.covered,
        confidence=ans.confidence,
    )
