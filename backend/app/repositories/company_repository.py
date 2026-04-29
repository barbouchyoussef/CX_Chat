from sqlalchemy.orm import Session

from app.db.models.company import Company


class CompanyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, name: str, sector_id: int, size_id: int) -> Company:
        company = Company(name=name, sector_id=sector_id, size_id=size_id)
        self.db.add(company)
        self.db.flush()
        return company
