from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.assessment_idempotency import AssessmentIdempotency


class AssessmentIdempotencyRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, assessment_id: int, idempotency_key: str) -> AssessmentIdempotency | None:
        result = await self.db.execute(
            select(AssessmentIdempotency).where(
                AssessmentIdempotency.assessment_id == assessment_id,
                AssessmentIdempotency.idempotency_key == idempotency_key,
            )
        )
        return result.scalar_one_or_none()

    async def create(self, assessment_id: int, idempotency_key: str, response_payload: dict) -> AssessmentIdempotency:
        row = AssessmentIdempotency(
            assessment_id=assessment_id,
            idempotency_key=idempotency_key,
            response_payload=response_payload,
        )
        self.db.add(row)
        await self.db.flush()
        return row
