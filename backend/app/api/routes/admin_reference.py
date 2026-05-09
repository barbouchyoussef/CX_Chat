from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.constants import normalize_axis_code, normalize_axis_name
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
from app.schemas.admin_ui_metadata import (
    AdminUiFieldMetadata,
    AdminUiMetadataResponse,
    AdminUiOptionItem,
    AdminUiSectionMetadata,
)

router = APIRouter(prefix="/admin/reference")


def _normalize(value: str) -> str:
    return value.strip().lower()


async def _handle_integrity_error(db: AsyncSession, entity_name: str) -> None:
    await db.rollback()
    raise HTTPException(status_code=409, detail=f"{entity_name} violates a unique or relational constraint.")


@router.get("/ui-metadata", response_model=AdminUiMetadataResponse)
def get_admin_ui_metadata() -> AdminUiMetadataResponse:
    return AdminUiMetadataResponse(
        capabilities=AdminUiSectionMetadata(
            title="Capabilities",
            help_text=(
                "Question guidance shapes how the LLM asks the next question. "
                "Use it to describe the discovery goal, useful examples, and maturity signals to test."
            ),
            fields={
                "question_guidelines": AdminUiFieldMetadata(
                    label="Question guidance for the LLM",
                    description=(
                        "Internal business guidance used to generate better questions. "
                        "This is not a fixed client-facing script."
                    ),
                    button_label="Edit guidance",
                    modal_title="Edit question guidance for the LLM",
                    placeholder="Write the internal guidance used by the LLM...",
                )
            },
        ),
        recommendations=AdminUiSectionMetadata(
            title="Capability recommendations",
            help_text=(
                "The report prompt gives most weight to recommended action direction, priority level, expected business impact, and writing tone. "
                "Optional framing notes help with nuance but do not replace the core recommendation."
            ),
            fields={
                "recommendation_guideline": AdminUiFieldMetadata(
                    label="Recommended action direction",
                    description="Primary action logic injected into the report prompt.",
                    button_label="Edit logic",
                    modal_title="Edit recommended action direction",
                    placeholder="Write the core action direction used by the report...",
                ),
                "priority_hint": AdminUiFieldMetadata(
                    label="Priority level",
                    description="Priority framing such as urgent_foundation, build_consistency, or scale_advantage.",
                    options=[
                        AdminUiOptionItem(
                            value="urgent_foundation",
                            label="Urgent foundation",
                            description="Use when the recommendation builds a missing base capability or fixes a structural gap.",
                        ),
                        AdminUiOptionItem(
                            value="build_consistency",
                            label="Build consistency",
                            description="Use when the organization already has a base and now needs more discipline, scale, or repeatability.",
                        ),
                        AdminUiOptionItem(
                            value="scale_advantage",
                            label="Scale advantage",
                            description="Use when the capability is mature and the recommendation is about optimization, differentiation, or value acceleration.",
                        ),
                    ],
                ),
                "business_impact": AdminUiFieldMetadata(
                    label="Expected business impact",
                    description="Business or customer outcome expected if the recommendation is implemented well.",
                    button_label="Edit impact",
                    modal_title="Edit expected business impact",
                    placeholder="Describe the customer or business outcome expected from this recommendation...",
                ),
                "tone_hint": AdminUiFieldMetadata(
                    label="Writing tone",
                    description="Preferred tone for the final report wording, such as direct, balanced, or executive.",
                    options=[
                        AdminUiOptionItem(
                            value="direct",
                            label="Direct",
                            description="Short, practical, and action-focused wording.",
                        ),
                        AdminUiOptionItem(
                            value="balanced",
                            label="Balanced",
                            description="Clear and professional wording with a mix of action and context.",
                        ),
                        AdminUiOptionItem(
                            value="executive",
                            label="Executive",
                            description="Leadership-oriented wording with stronger strategic framing and business impact language.",
                        ),
                    ],
                ),
                "consultant_note": AdminUiFieldMetadata(
                    label="Optional framing note",
                    description="Optional nuance or framing support for the final recommendation wording.",
                    button_label="Edit note",
                    modal_title="Edit optional framing note",
                    placeholder="Add optional nuance or framing for the final report wording...",
                ),
            },
        ),
    )


@router.get("/axes", response_model=list[AxisRead])
async def list_axes(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[AxisRead]:
    result = await db.execute(select(Axis).order_by(Axis.sort_order.asc()).offset(offset).limit(limit))
    rows = result.scalars().all()
    return [
        AxisRead(
            id=r.id,
            code=(normalize_axis_code(r.code) or r.code).lower(),
            name=normalize_axis_name(r.name) or r.name,
            sort_order=r.sort_order,
        )
        for r in rows
    ]


@router.post("/axes", response_model=AxisRead)
async def create_axis(payload: AxisCreate, db: AsyncSession = Depends(get_db)) -> AxisRead:
    row = Axis(
        code=(normalize_axis_code(payload.code) or _normalize(payload.code)).lower(),
        name=normalize_axis_name(payload.name.strip()) or payload.name.strip(),
        sort_order=payload.sort_order,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Axis")
    await db.refresh(row)
    return AxisRead(
        id=row.id,
        code=(normalize_axis_code(row.code) or row.code).lower(),
        name=normalize_axis_name(row.name) or row.name,
        sort_order=row.sort_order,
    )


@router.patch("/axes/{axis_id}", response_model=AxisRead)
async def update_axis(axis_id: int, payload: AxisUpdate, db: AsyncSession = Depends(get_db)) -> AxisRead:
    result = await db.execute(select(Axis).where(Axis.id == axis_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Axis not found")

    if payload.code is not None:
        row.code = (normalize_axis_code(payload.code) or _normalize(payload.code)).lower()
    if payload.name is not None:
        row.name = normalize_axis_name(payload.name.strip()) or payload.name.strip()
    if payload.sort_order is not None:
        row.sort_order = payload.sort_order
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Axis")
    await db.refresh(row)
    return AxisRead(
        id=row.id,
        code=(normalize_axis_code(row.code) or row.code).lower(),
        name=normalize_axis_name(row.name) or row.name,
        sort_order=row.sort_order,
    )


@router.delete("/axes/{axis_id}")
async def delete_axis(axis_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(Axis).where(Axis.id == axis_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Axis not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Axis")
    return {"status": "deleted"}


@router.get("/sectors", response_model=list[SectorRead])
async def list_sectors(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[SectorRead]:
    result = await db.execute(select(Sector).order_by(Sector.name.asc()).offset(offset).limit(limit))
    rows = result.scalars().all()
    return [SectorRead(id=r.id, code=r.code, name=r.name) for r in rows]


@router.post("/sectors", response_model=SectorRead)
async def create_sector(payload: SectorCreate, db: AsyncSession = Depends(get_db)) -> SectorRead:
    row = Sector(code=_normalize(payload.code), name=payload.name.strip())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Sector")
    await db.refresh(row)
    return SectorRead(id=row.id, code=row.code, name=row.name)


@router.patch("/sectors/{sector_id}", response_model=SectorRead)
async def update_sector(sector_id: int, payload: SectorUpdate, db: AsyncSession = Depends(get_db)) -> SectorRead:
    result = await db.execute(select(Sector).where(Sector.id == sector_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Sector")
    await db.refresh(row)
    return SectorRead(id=row.id, code=row.code, name=row.name)


@router.delete("/sectors/{sector_id}")
async def delete_sector(sector_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(Sector).where(Sector.id == sector_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Sector not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Sector")
    return {"status": "deleted"}


@router.get("/company-sizes", response_model=list[CompanySizeRead])
async def list_company_sizes(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[CompanySizeRead]:
    result = await db.execute(select(CompanySize).order_by(CompanySize.name.asc()).offset(offset).limit(limit))
    rows = result.scalars().all()
    return [CompanySizeRead(id=r.id, code=r.code, name=r.name) for r in rows]


@router.post("/company-sizes", response_model=CompanySizeRead)
async def create_company_size(payload: CompanySizeCreate, db: AsyncSession = Depends(get_db)) -> CompanySizeRead:
    row = CompanySize(code=_normalize(payload.code), name=payload.name.strip())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Company size")
    await db.refresh(row)
    return CompanySizeRead(id=row.id, code=row.code, name=row.name)


@router.patch("/company-sizes/{company_size_id}", response_model=CompanySizeRead)
async def update_company_size(company_size_id: int, payload: CompanySizeUpdate, db: AsyncSession = Depends(get_db)) -> CompanySizeRead:
    result = await db.execute(select(CompanySize).where(CompanySize.id == company_size_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company size not found")
    if payload.code is not None:
        row.code = _normalize(payload.code)
    if payload.name is not None:
        row.name = payload.name.strip()
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Company size")
    await db.refresh(row)
    return CompanySizeRead(id=row.id, code=row.code, name=row.name)


@router.delete("/company-sizes/{company_size_id}")
async def delete_company_size(company_size_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(CompanySize).where(CompanySize.id == company_size_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company size not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Company size")
    return {"status": "deleted"}


@router.get("/maturity-levels", response_model=list[MaturityLevelRead])
async def list_maturity_levels(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[MaturityLevelRead]:
    result = await db.execute(select(MaturityLevel).order_by(MaturityLevel.level_number.asc()).offset(offset).limit(limit))
    rows = result.scalars().all()
    return [
        MaturityLevelRead(id=r.id, level_number=r.level_number, label=r.label, description=r.description)
        for r in rows
    ]


@router.post("/maturity-levels", response_model=MaturityLevelRead)
async def create_maturity_level(payload: MaturityLevelCreate, db: AsyncSession = Depends(get_db)) -> MaturityLevelRead:
    row = MaturityLevel(
        level_number=payload.level_number,
        label=payload.label.strip(),
        description=payload.description,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Maturity level")
    await db.refresh(row)
    return MaturityLevelRead(id=row.id, level_number=row.level_number, label=row.label, description=row.description)


@router.patch("/maturity-levels/{maturity_level_id}", response_model=MaturityLevelRead)
async def update_maturity_level(
    maturity_level_id: int,
    payload: MaturityLevelUpdate,
    db: AsyncSession = Depends(get_db),
) -> MaturityLevelRead:
    result = await db.execute(select(MaturityLevel).where(MaturityLevel.id == maturity_level_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Maturity level not found")
    if payload.level_number is not None:
        row.level_number = payload.level_number
    if payload.label is not None:
        row.label = payload.label.strip()
    if payload.description is not None:
        row.description = payload.description
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Maturity level")
    await db.refresh(row)
    return MaturityLevelRead(id=row.id, level_number=row.level_number, label=row.label, description=row.description)


@router.delete("/maturity-levels/{maturity_level_id}")
async def delete_maturity_level(maturity_level_id: int, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    result = await db.execute(select(MaturityLevel).where(MaturityLevel.id == maturity_level_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Maturity level not found")
    await db.delete(row)
    try:
        await db.commit()
    except IntegrityError:
        await _handle_integrity_error(db, "Maturity level")
    return {"status": "deleted"}
