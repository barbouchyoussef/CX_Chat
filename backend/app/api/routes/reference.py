from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies.db import get_db
from app.schemas.reference import ReferenceOptionsResponse
from app.repositories.company_size_repository import CompanySizeRepository
from app.repositories.sector_repository import SectorRepository

router = APIRouter(prefix="/reference")


@router.get("/options", response_model=ReferenceOptionsResponse)
def get_reference_options(db: Session = Depends(get_db)) -> ReferenceOptionsResponse:
    sectors = SectorRepository(db).list_options()
    sizes = CompanySizeRepository(db).list_options()
    return ReferenceOptionsResponse(
        sectors=[{"code": s.code, "label": s.name} for s in sectors],
        company_sizes=[{"code": cs.code, "label": cs.name} for cs in sizes],
    )
