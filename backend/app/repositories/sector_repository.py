from sqlalchemy.orm import Session

from app.db.models.sector import Sector


def normalize_code(value: str) -> str:
    return value.strip().lower()


class SectorRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_options(self, limit: int = 200) -> list[Sector]:
        return (
            self.db.query(Sector)
            .filter(Sector.code.notin_(["unknown", "string"]))
            .order_by(Sector.name.asc())
            .limit(limit)
            .all()
        )

    def get_or_create(self, label: str) -> Sector:
        code = normalize_code(label) if label.strip() else "unknown"
        sector = self.db.query(Sector).filter(Sector.code == code).one_or_none()
        if sector is not None:
            return sector
        sector = Sector(code=code, name=label.strip() or "Unknown")
        self.db.add(sector)
        self.db.flush()
        return sector

    def get_by_code(self, code: str) -> Sector | None:
        code_n = normalize_code(code)
        return self.db.query(Sector).filter(Sector.code == code_n).one_or_none()

    def get_or_create_by_code(self, code: str, label: str | None = None) -> Sector:
        code_n = normalize_code(code) if code.strip() else "unknown"
        sector = self.db.query(Sector).filter(Sector.code == code_n).one_or_none()
        if sector is not None:
            return sector
        sector = Sector(code=code_n, name=(label or code).strip() or "Unknown")
        self.db.add(sector)
        self.db.flush()
        return sector
