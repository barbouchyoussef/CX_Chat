from sqlalchemy.orm import Session

from app.db.models.assessment_idempotency import AssessmentIdempotency


class AssessmentIdempotencyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, assessment_id: int, idempotency_key: str) -> AssessmentIdempotency | None:
        return (
            self.db.query(AssessmentIdempotency)
            .filter(
                AssessmentIdempotency.assessment_id == assessment_id,
                AssessmentIdempotency.idempotency_key == idempotency_key,
            )
            .one_or_none()
        )

    def create(self, assessment_id: int, idempotency_key: str, response_payload: dict) -> AssessmentIdempotency:
        row = AssessmentIdempotency(
            assessment_id=assessment_id,
            idempotency_key=idempotency_key,
            response_payload=response_payload,
        )
        self.db.add(row)
        self.db.flush()
        return row
