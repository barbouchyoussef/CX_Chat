from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.axis import Axis
from app.db.models.company_size import CompanySize
from app.db.models.maturity_level import MaturityLevel
from app.db.models.sector import Sector
from app.dependencies.db import get_db
from app.schemas.admin_reference import (
    AxisCreate,
    AxisRead,
    AxisUpdate,
    CompanySizeCreate,
    CompanySizeRead,
    CompanySizeUpdate,
    MaturityLevelCreate,
    MaturityLevelRead,
    MaturityLevelUpdate,
    SectorCreate,
    SectorRead,
    SectorUpdate,
)

router = APIRouter(prefix="/admin/reference")


def _normalize(value: str) -> str:
    return value.strip().lower()


def _handle_integrity_error(db: Session, entity_name: str) -> None:
    db.rollback()
    raise HTTPException(status_code=409, detail=f"{entity_name} violates a unique or relational constraint.")


@router.get("/axes", response_model=list[AxisRead])
def list_axes(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AxisRead]:
    rows = db.query(Axis).order_by(Axis.sort_order.asc()).offset(offset).limit(limit).all()
    return [AxisRead(id=r.id, code=r.code, name=r.name, sort_order=r.sort_order) for r in rows]


@router.post("/axes", response_model=AxisRead)
def create_axis(payload: AxisCreate, db: Session = Depends(get_db)) -> AxisRead:
    row = Axis(code=_normalize(payload.code), name=payload.name.strip(), sort_order=payload.sort_order)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Axis")
    db.refresh(row)
    return AxisRead(id=row.id, code=row.code, name=row.name, sort_order=row.sort_order)


@router.patch("/axes/{axis_id}", response_model=AxisRead)
def update_axis(axis_id: int, payload: AxisUpdate, db: Session = Depends(get_db)) -> AxisRead:
    row = db.query(Axis).filter(Axis.id == axis_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Axis not found")

    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Axis")
    db.refresh(row)
    return AxisRead(id=row.id, code=row.code, name=row.name, sort_order=row.sort_order)


@router.delete("/axes/{axis_id}")
def delete_axis(axis_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(Axis).filter(Axis.id == axis_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Axis not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Axis")
    return {"status": "deleted"}


@router.get("/sectors", response_model=list[SectorRead])
def list_sectors(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[SectorRead]:
    rows = db.query(Sector).order_by(Sector.name.asc()).offset(offset).limit(limit).all()
    return [SectorRead(id=r.id, code=r.code, name=r.name) for r in rows]


@router.post("/sectors", response_model=SectorRead)
def create_sector(payload: SectorCreate, db: Session = Depends(get_db)) -> SectorRead:
    row = Sector(code=_normalize(payload.code), name=payload.name.strip())
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Sector")
    db.refresh(row)
    return SectorRead(id=row.id, code=row.code, name=row.name)


@router.patch("/sectors/{sector_id}", response_model=SectorRead)
def update_sector(sector_id: int, payload: SectorUpdate, db: Session = Depends(get_db)) -> SectorRead:
    row = db.query(Sector).filter(Sector.id == sector_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Sector")
    db.refresh(row)
    return SectorRead(id=row.id, code=row.code, name=row.name)


@router.delete("/sectors/{sector_id}")
def delete_sector(sector_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(Sector).filter(Sector.id == sector_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Sector")
    return {"status": "deleted"}


@router.get("/company-sizes", response_model=list[CompanySizeRead])
def list_company_sizes(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[CompanySizeRead]:
    rows = db.query(CompanySize).order_by(CompanySize.name.asc()).offset(offset).limit(limit).all()
    return [CompanySizeRead(id=r.id, code=r.code, name=r.name) for r in rows]


@router.post("/company-sizes", response_model=CompanySizeRead)
def create_company_size(payload: CompanySizeCreate, db: Session = Depends(get_db)) -> CompanySizeRead:
    row = CompanySize(code=_normalize(payload.code), name=payload.name.strip())
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Company size")
    db.refresh(row)
    return CompanySizeRead(id=row.id, code=row.code, name=row.name)


@router.patch("/company-sizes/{company_size_id}", response_model=CompanySizeRead)
def update_company_size(company_size_id: int, payload: CompanySizeUpdate, db: Session = Depends(get_db)) -> CompanySizeRead:
    row = db.query(CompanySize).filter(CompanySize.id == company_size_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company size not found")
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Company size")
    db.refresh(row)
    return CompanySizeRead(id=row.id, code=row.code, name=row.name)


@router.delete("/company-sizes/{company_size_id}")
def delete_company_size(company_size_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(CompanySize).filter(CompanySize.id == company_size_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company size not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Company size")
    return {"status": "deleted"}


@router.get("/maturity-levels", response_model=list[MaturityLevelRead])
def list_maturity_levels(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[MaturityLevelRead]:
    rows = db.query(MaturityLevel).order_by(MaturityLevel.level_number.asc()).offset(offset).limit(limit).all()
    return [
        MaturityLevelRead(id=r.id, level_number=r.level_number, label=r.label, description=r.description)
        for r in rows
    ]


@router.post("/maturity-levels", response_model=MaturityLevelRead)
def create_maturity_level(payload: MaturityLevelCreate, db: Session = Depends(get_db)) -> MaturityLevelRead:
    row = MaturityLevel(
        level_number=payload.level_number,
        label=payload.label.strip(),
        description=payload.description,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Maturity level")
    db.refresh(row)
    return MaturityLevelRead(id=row.id, level_number=row.level_number, label=row.label, description=row.description)


@router.patch("/maturity-levels/{maturity_level_id}", response_model=MaturityLevelRead)
def update_maturity_level(
    maturity_level_id: int,
    payload: MaturityLevelUpdate,
    db: Session = Depends(get_db),
) -> MaturityLevelRead:
    row = db.query(MaturityLevel).filter(MaturityLevel.id == maturity_level_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Maturity level not found")
    if payload.level_number is not None:
        row.level_number = payload.level_number
    if payload.label is not None:
        row.label = payload.label.strip()
    if payload.description is not None:
        row.description = payload.description
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Maturity level")
    db.refresh(row)
    return MaturityLevelRead(id=row.id, level_number=row.level_number, label=row.label, description=row.description)


@router.delete("/maturity-levels/{maturity_level_id}")
def delete_maturity_level(maturity_level_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    row = db.query(MaturityLevel).filter(MaturityLevel.id == maturity_level_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Maturity level not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError:
        _handle_integrity_error(db, "Maturity level")
    return {"status": "deleted"}
