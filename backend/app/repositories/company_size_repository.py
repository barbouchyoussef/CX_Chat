from sqlalchemy.orm import Session

from app.db.models.company_size import CompanySize
from app.repositories.sector_repository import normalize_code


class CompanySizeRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_options(self, limit: int = 200) -> list[CompanySize]:
        return (
            self.db.query(CompanySize)
            .filter(CompanySize.code.notin_(["unknown", "string"]))
            .order_by(CompanySize.name.asc())
            .limit(limit)
            .all()
        )

    def get_or_create(self, label: str) -> CompanySize:
        code = normalize_code(label) if label.strip() else "unknown"
        size = self.db.query(CompanySize).filter(CompanySize.code == code).one_or_none()
        if size is not None:
            return size
        size = CompanySize(code=code, name=label.strip() or "Unknown")
        self.db.add(size)
        self.db.flush()
        return size

    def get_by_code(self, code: str) -> CompanySize | None:
        code_n = normalize_code(code)
        return self.db.query(CompanySize).filter(CompanySize.code == code_n).one_or_none()

    def get_or_create_by_code(self, code: str, label: str | None = None) -> CompanySize:
        code_n = normalize_code(code) if code.strip() else "unknown"
        size = self.db.query(CompanySize).filter(CompanySize.code == code_n).one_or_none()
        if size is not None:
            return size
        size = CompanySize(code=code_n, name=(label or code).strip() or "Unknown")
        self.db.add(size)
        self.db.flush()
        return size
