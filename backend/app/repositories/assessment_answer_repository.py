from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models.assessment_answer import AssessmentAnswer
from app.db.models.capability import Capability
from app.db.models.axis import Axis
from app.db.models.assessment_score import AssessmentScore
from app.db.models.capability_recommendation import CapabilityRecommendation


class AssessmentAnswerRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self, assessment_id: int, question: str, answer: str, capability_id: int | None = None
    ) -> AssessmentAnswer:
        row = AssessmentAnswer(assessment_id=assessment_id, capability_id=capability_id, question=question, answer=answer)
        self.db.add(row)
        self.db.flush()
        return row

    def list_recent(self, assessment_id: int, limit: int = 20) -> list[AssessmentAnswer]:
        return (
            self.db.query(AssessmentAnswer)
            .filter(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(desc(AssessmentAnswer.id))
            .limit(limit)
            .all()
        )

    def list_for_assessment(self, assessment_id: int, limit: int = 200, offset: int = 0) -> list[AssessmentAnswer]:
        return (
            self.db.query(AssessmentAnswer)
            .filter(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(AssessmentAnswer.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def list_trace(self, assessment_id: int, limit: int = 500, offset: int = 0) -> list[dict]:
        rows = (
            self.db.query(
                AssessmentAnswer.capability_id,
                Capability.code,
                Axis.name,
                AssessmentAnswer.question,
                AssessmentAnswer.answer,
                AssessmentAnswer.created_at,
                AssessmentScore.maturity_level_id,
                AssessmentScore.confidence,
                AssessmentScore.justification,
                CapabilityRecommendation.recommendation_guideline,
                CapabilityRecommendation.priority_hint,
            )
            .outerjoin(Capability, Capability.id == AssessmentAnswer.capability_id)
            .outerjoin(Axis, Axis.id == Capability.axis_id)
            .outerjoin(
                AssessmentScore,
                (AssessmentScore.assessment_id == AssessmentAnswer.assessment_id)
                & (AssessmentScore.capability_id == AssessmentAnswer.capability_id),
            )
            .outerjoin(
                CapabilityRecommendation,
                (CapabilityRecommendation.capability_id == AssessmentAnswer.capability_id)
                & (CapabilityRecommendation.maturity_level_id == AssessmentScore.maturity_level_id),
            )
            .filter(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(AssessmentAnswer.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return [
            {
                "capability_id": int(capability_id) if capability_id is not None else None,
                "capability_code": capability_code,
                "axis": axis_name,
                "question": question,
                "answer": answer,
                "created_at": created_at,
                "maturity_level_id": int(maturity_level_id) if maturity_level_id is not None else None,
                "confidence": float(confidence) if confidence is not None else None,
                "justification": justification,
                "recommendation_guideline": recommendation_guideline,
                "priority_hint": priority_hint,
            }
            for (
                capability_id,
                capability_code,
                axis_name,
                question,
                answer,
                created_at,
                maturity_level_id,
                confidence,
                justification,
                recommendation_guideline,
                priority_hint,
            ) in rows
        ]
