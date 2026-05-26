from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.company import Company


class CompanyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        name: str,
        sector_id: int,
        size_id: int,
        region: str | None = None,
        website_url: str | None = None,
    ) -> Company:
        company = Company(
            name=name,
            sector_id=sector_id,
            size_id=size_id,
            region=region,
            website_url=website_url,
        )
        self.db.add(company)
        await self.db.flush()
        return company
