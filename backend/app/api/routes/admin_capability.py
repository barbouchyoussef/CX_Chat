from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.capability import Capability
from app.db.models.capability_maturity_rubric import CapabilityMaturityRubric
from app.db.models.capability_recommendation import CapabilityRecommendation
from app.dependencies.db import get_db
from app.schemas.admin_capability import (
    CapabilityCreate,
    CapabilityMaturityRubricCreate,
    CapabilityMaturityRubricRead,
    CapabilityMaturityRubricUpdate,
    CapabilityRead,
    CapabilityRecommendationCreate,
    CapabilityRecommendationRead,
    CapabilityRecommendationUpdate,
    CapabilityUpdate,
)

router = APIRouter(prefix="/admin")


def _normalize(value: str) -> str:
    return value.strip().lower()

def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def _handle_integrity_error(db: AsyncSession, entity_name: str) -> None:
    await db.rollback()
    raise HTTPException(status_code=409, detail=f"{entity_name} violates a unique or relational constraint.")


@router.get("/capabilities", response_model=list[CapabilityRead])
async def list_capabilities(
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    axis_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[CapabilityRead]:
    statement = select(Capability)
    if axis_id is not None:
        statement = statement.where(Capability.axis_id == axis_id)
    result = await db.execute(
        statement.order_by(Capability.axis_id.asc(), Capability.sort_order.asc(), Capability.id.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        CapabilityRead(
            id=r.id,
            axis_id=r.axis_id,
            code=r.code,
            name=r.name,
            description=r.description,
            evidence_required=r.evidence_required,
            question_guidelines=r.question_guidelines,
            sort_order=r.sort_order,
        )
        for r in rows
    ]


@router.post("/capabilities", response_model=CapabilityRead)
async def create_capability(payload: CapabilityCreate, db: AsyncSession = Depends(get_db)) -> CapabilityRead:
    row = Capability(
        axis_id=payload.axis_id,
        code=_normalize(payload.code),
        name=payload.name.strip(),
        description=_clean_optional_text(payload.description),
        evidence_required=_clean_optional_text(payload.evidence_required),
        question_guidelines=_clean_optional_text(payload.question_guidelines),
        sort_order=payload.sort_order,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability")
    await db.refresh(row)
    return CapabilityRead(
        id=row.id,
        axis_id=row.axis_id,
        code=row.code,
        name=row.name,
        description=row.description,
        evidence_required=row.evidence_required,
        question_guidelines=row.question_guidelines,
        sort_order=row.sort_order,
    )


@router.patch("/capabilities/{capability_id}", response_model=CapabilityRead)
async def update_capability(capability_id: int, payload: CapabilityUpdate, db: AsyncSession = Depends(get_db)) -> CapabilityRead:
    result = await db.execute(select(Capability).where(Capability.id == capability_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability not found")

    if payload.axis_id is not None:
        row.axis_id = payload.axis_id
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.description is not None:
        row.description = _clean_optional_text(payload.description)
    if payload.evidence_required is not None:
        row.evidence_required = _clean_optional_text(payload.evidence_required)
    if payload.question_guidelines is not None:
        row.question_guidelines = _clean_optional_text(payload.question_guidelines)
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability")
    await db.refresh(row)
    return CapabilityRead(
        id=row.id,
        axis_id=row.axis_id,
        code=row.code,
        name=row.name,
        description=row.description,
        evidence_required=row.evidence_required,
        question_guidelines=row.question_guidelines,
        sort_order=row.sort_order,
    )


@router.delete("/capabilities/{capability_id}")
async def delete_capability(capability_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(Capability).where(Capability.id == capability_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability")
    return {"status": "deleted"}


@router.get("/capability-maturity-rubrics", response_model=list[CapabilityMaturityRubricRead])
async def list_capability_maturity_rubrics(
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    capability_id: int | None = Query(default=None, ge=1),
    maturity_level_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[CapabilityMaturityRubricRead]:
    statement = select(CapabilityMaturityRubric)
    if capability_id is not None:
        statement = statement.where(CapabilityMaturityRubric.capability_id == capability_id)
    if maturity_level_id is not None:
        statement = statement.where(CapabilityMaturityRubric.maturity_level_id == maturity_level_id)
    result = await db.execute(
        statement.order_by(CapabilityMaturityRubric.capability_id.asc(), CapabilityMaturityRubric.maturity_level_id.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        CapabilityMaturityRubricRead(
            id=r.id,
            capability_id=r.capability_id,
            maturity_level_id=r.maturity_level_id,
            description=r.description,
        )
        for r in rows
    ]


@router.post("/capability-maturity-rubrics", response_model=CapabilityMaturityRubricRead)
async def create_capability_maturity_rubric(
    payload: CapabilityMaturityRubricCreate,
    db: AsyncSession = Depends(get_db),
) -> CapabilityMaturityRubricRead:
    row = CapabilityMaturityRubric(
        capability_id=payload.capability_id,
        maturity_level_id=payload.maturity_level_id,
        description=payload.description.strip(),
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability maturity rubric")
    await db.refresh(row)
    return CapabilityMaturityRubricRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        description=row.description,
    )


@router.patch("/capability-maturity-rubrics/{rubric_id}", response_model=CapabilityMaturityRubricRead)
async def update_capability_maturity_rubric(
    rubric_id: int,
    payload: CapabilityMaturityRubricUpdate,
    db: AsyncSession = Depends(get_db),
) -> CapabilityMaturityRubricRead:
    result = await db.execute(select(CapabilityMaturityRubric).where(CapabilityMaturityRubric.id == rubric_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability maturity rubric not found")
    if payload.capability_id is not None:
        row.capability_id = payload.capability_id
    if payload.maturity_level_id is not None:
        row.maturity_level_id = payload.maturity_level_id
    if payload.description is not None:
        row.description = payload.description.strip()
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability maturity rubric")
    await db.refresh(row)
    return CapabilityMaturityRubricRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        description=row.description,
    )


@router.delete("/capability-maturity-rubrics/{rubric_id}")
async def delete_capability_maturity_rubric(rubric_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(CapabilityMaturityRubric).where(CapabilityMaturityRubric.id == rubric_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability maturity rubric not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability maturity rubric")
    return {"status": "deleted"}


@router.get("/capability-recommendations", response_model=list[CapabilityRecommendationRead])
async def list_capability_recommendations(
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    capability_id: int | None = Query(default=None, ge=1),
    maturity_level_id: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
) -> list[CapabilityRecommendationRead]:
    statement = select(CapabilityRecommendation)
    if capability_id is not None:
        statement = statement.where(CapabilityRecommendation.capability_id == capability_id)
    if maturity_level_id is not None:
        statement = statement.where(CapabilityRecommendation.maturity_level_id == maturity_level_id)
    result = await db.execute(
        statement.order_by(CapabilityRecommendation.capability_id.asc(), CapabilityRecommendation.maturity_level_id.asc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        CapabilityRecommendationRead(
            id=r.id,
            capability_id=r.capability_id,
            maturity_level_id=r.maturity_level_id,
            recommendation_guideline=r.recommendation_guideline,
            priority_hint=r.priority_hint,
            consultant_note=r.consultant_note,
            evidence_to_cite=r.evidence_to_cite,
            initiative_suggestions=r.initiative_suggestions,
            business_impact=r.business_impact,
            tone_hint=r.tone_hint,
        )
        for r in rows
    ]


@router.post("/capability-recommendations", response_model=CapabilityRecommendationRead)
async def create_capability_recommendation(
    payload: CapabilityRecommendationCreate,
    db: AsyncSession = Depends(get_db),
) -> CapabilityRecommendationRead:
    row = CapabilityRecommendation(
        capability_id=payload.capability_id,
        maturity_level_id=payload.maturity_level_id,
        recommendation_guideline=payload.recommendation_guideline.strip(),
        priority_hint=_clean_optional_text(payload.priority_hint),
        consultant_note=_clean_optional_text(payload.consultant_note),
        evidence_to_cite=_clean_optional_text(payload.evidence_to_cite),
        initiative_suggestions=_clean_optional_text(payload.initiative_suggestions),
        business_impact=_clean_optional_text(payload.business_impact),
        tone_hint=_clean_optional_text(payload.tone_hint),
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability recommendation")
    await db.refresh(row)
    return CapabilityRecommendationRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        recommendation_guideline=row.recommendation_guideline,
        priority_hint=row.priority_hint,
        consultant_note=row.consultant_note,
        evidence_to_cite=row.evidence_to_cite,
        initiative_suggestions=row.initiative_suggestions,
        business_impact=row.business_impact,
        tone_hint=row.tone_hint,
    )


@router.patch("/capability-recommendations/{recommendation_id}", response_model=CapabilityRecommendationRead)
async def update_capability_recommendation(
    recommendation_id: int,
    payload: CapabilityRecommendationUpdate,
    db: AsyncSession = Depends(get_db),
) -> CapabilityRecommendationRead:
    result = await db.execute(select(CapabilityRecommendation).where(CapabilityRecommendation.id == recommendation_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability recommendation not found")
    if payload.capability_id is not None:
        row.capability_id = payload.capability_id
    if payload.maturity_level_id is not None:
        row.maturity_level_id = payload.maturity_level_id
    if payload.recommendation_guideline is not None:
        row.recommendation_guideline = payload.recommendation_guideline.strip()
    if payload.priority_hint is not None:
        row.priority_hint = _clean_optional_text(payload.priority_hint)
    if payload.consultant_note is not None:
        row.consultant_note = _clean_optional_text(payload.consultant_note)
    if payload.evidence_to_cite is not None:
        row.evidence_to_cite = _clean_optional_text(payload.evidence_to_cite)
    if payload.initiative_suggestions is not None:
        row.initiative_suggestions = _clean_optional_text(payload.initiative_suggestions)
    if payload.business_impact is not None:
        row.business_impact = _clean_optional_text(payload.business_impact)
    if payload.tone_hint is not None:
        row.tone_hint = _clean_optional_text(payload.tone_hint)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability recommendation")
    await db.refresh(row)
    return CapabilityRecommendationRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        recommendation_guideline=row.recommendation_guideline,
        priority_hint=row.priority_hint,
        consultant_note=row.consultant_note,
        evidence_to_cite=row.evidence_to_cite,
        initiative_suggestions=row.initiative_suggestions,
        business_impact=row.business_impact,
        tone_hint=row.tone_hint,
    )


@router.delete("/capability-recommendations/{recommendation_id}")
async def delete_capability_recommendation(recommendation_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(CapabilityRecommendation).where(CapabilityRecommendation.id == recommendation_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability recommendation not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Capability recommendation")
    return {"status": "deleted"}
