from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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


def _handle_integrity_error(db: Session, entity_name: str) -> None:
    db.rollback()
    raise HTTPException(status_code=409, detail=f"{entity_name} violates a unique or relational constraint.")


@router.get("/capabilities", response_model=list[CapabilityRead])
def list_capabilities(
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    axis_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[CapabilityRead]:
    q = db.query(Capability)
    if axis_id is not None:
        q = q.filter(Capability.axis_id == axis_id)
    rows = q.order_by(Capability.axis_id.asc(), Capability.sort_order.asc(), Capability.id.asc()).offset(offset).limit(limit).all()
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
def create_capability(payload: CapabilityCreate, db: Session = Depends(get_db)) -> CapabilityRead:
    row = Capability(
        axis_id=payload.axis_id,
        code=_normalize(payload.code),
        name=payload.name.strip(),
        description=payload.description,
        evidence_required=payload.evidence_required,
        question_guidelines=payload.question_guidelines,
        sort_order=payload.sort_order,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability")
    db.refresh(row)
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
def update_capability(capability_id: int, payload: CapabilityUpdate, db: Session = Depends(get_db)) -> CapabilityRead:
    row = db.query(Capability).filter(Capability.id == capability_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability not found")

    if payload.axis_id is not None:
        row.axis_id = payload.axis_id
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.description is not None:
        row.description = payload.description
    if payload.evidence_required is not None:
        row.evidence_required = payload.evidence_required
    if payload.question_guidelines is not None:
        row.question_guidelines = payload.question_guidelines
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability")
    db.refresh(row)
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
def delete_capability(capability_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(Capability).filter(Capability.id == capability_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability")
    return {"status": "deleted"}


@router.get("/capability-maturity-rubrics", response_model=list[CapabilityMaturityRubricRead])
def list_capability_maturity_rubrics(
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    capability_id: int | None = Query(default=None, ge=1),
    maturity_level_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[CapabilityMaturityRubricRead]:
    q = db.query(CapabilityMaturityRubric)
    if capability_id is not None:
        q = q.filter(CapabilityMaturityRubric.capability_id == capability_id)
    if maturity_level_id is not None:
        q = q.filter(CapabilityMaturityRubric.maturity_level_id == maturity_level_id)
    rows = q.order_by(CapabilityMaturityRubric.capability_id.asc(), CapabilityMaturityRubric.maturity_level_id.asc()).offset(offset).limit(limit).all()
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
def create_capability_maturity_rubric(
    payload: CapabilityMaturityRubricCreate,
    db: Session = Depends(get_db),
) -> CapabilityMaturityRubricRead:
    row = CapabilityMaturityRubric(
        capability_id=payload.capability_id,
        maturity_level_id=payload.maturity_level_id,
        description=payload.description.strip(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability maturity rubric")
    db.refresh(row)
    return CapabilityMaturityRubricRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        description=row.description,
    )


@router.patch("/capability-maturity-rubrics/{rubric_id}", response_model=CapabilityMaturityRubricRead)
def update_capability_maturity_rubric(
    rubric_id: int,
    payload: CapabilityMaturityRubricUpdate,
    db: Session = Depends(get_db),
) -> CapabilityMaturityRubricRead:
    row = db.query(CapabilityMaturityRubric).filter(CapabilityMaturityRubric.id == rubric_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability maturity rubric not found")
    if payload.capability_id is not None:
        row.capability_id = payload.capability_id
    if payload.maturity_level_id is not None:
        row.maturity_level_id = payload.maturity_level_id
    if payload.description is not None:
        row.description = payload.description.strip()
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability maturity rubric")
    db.refresh(row)
    return CapabilityMaturityRubricRead(
        id=row.id,
        capability_id=row.capability_id,
        maturity_level_id=row.maturity_level_id,
        description=row.description,
    )


@router.delete("/capability-maturity-rubrics/{rubric_id}")
def delete_capability_maturity_rubric(rubric_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(CapabilityMaturityRubric).filter(CapabilityMaturityRubric.id == rubric_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability maturity rubric not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability maturity rubric")
    return {"status": "deleted"}


@router.get("/capability-recommendations", response_model=list[CapabilityRecommendationRead])
def list_capability_recommendations(
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    capability_id: int | None = Query(default=None, ge=1),
    maturity_level_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[CapabilityRecommendationRead]:
    q = db.query(CapabilityRecommendation)
    if capability_id is not None:
        q = q.filter(CapabilityRecommendation.capability_id == capability_id)
    if maturity_level_id is not None:
        q = q.filter(CapabilityRecommendation.maturity_level_id == maturity_level_id)
    rows = q.order_by(CapabilityRecommendation.capability_id.asc(), CapabilityRecommendation.maturity_level_id.asc()).offset(offset).limit(limit).all()
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
def create_capability_recommendation(
    payload: CapabilityRecommendationCreate,
    db: Session = Depends(get_db),
) -> CapabilityRecommendationRead:
    row = CapabilityRecommendation(
        capability_id=payload.capability_id,
        maturity_level_id=payload.maturity_level_id,
        recommendation_guideline=payload.recommendation_guideline.strip(),
        priority_hint=payload.priority_hint,
        consultant_note=payload.consultant_note,
        evidence_to_cite=payload.evidence_to_cite,
        initiative_suggestions=payload.initiative_suggestions,
        business_impact=payload.business_impact,
        tone_hint=payload.tone_hint,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability recommendation")
    db.refresh(row)
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
def update_capability_recommendation(
    recommendation_id: int,
    payload: CapabilityRecommendationUpdate,
    db: Session = Depends(get_db),
) -> CapabilityRecommendationRead:
    row = db.query(CapabilityRecommendation).filter(CapabilityRecommendation.id == recommendation_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability recommendation not found")
    if payload.capability_id is not None:
        row.capability_id = payload.capability_id
    if payload.maturity_level_id is not None:
        row.maturity_level_id = payload.maturity_level_id
    if payload.recommendation_guideline is not None:
        row.recommendation_guideline = payload.recommendation_guideline.strip()
    if payload.priority_hint is not None:
        row.priority_hint = payload.priority_hint
    if payload.consultant_note is not None:
        row.consultant_note = payload.consultant_note
    if payload.evidence_to_cite is not None:
        row.evidence_to_cite = payload.evidence_to_cite
    if payload.initiative_suggestions is not None:
        row.initiative_suggestions = payload.initiative_suggestions
    if payload.business_impact is not None:
        row.business_impact = payload.business_impact
    if payload.tone_hint is not None:
        row.tone_hint = payload.tone_hint
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability recommendation")
    db.refresh(row)
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
def delete_capability_recommendation(recommendation_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(CapabilityRecommendation).filter(CapabilityRecommendation.id == recommendation_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Capability recommendation not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Capability recommendation")
    return {"status": "deleted"}
