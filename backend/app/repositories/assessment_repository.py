from sqlalchemy.orm import Session

from app.db.models.assessment import Assessment
from app.db.models.assessment_insight import AssessmentInsight
from app.db.models.recommendation_output import RecommendationOutput
from app.db.models.assessment_score import AssessmentScore
from app.db.models.capability import Capability
from app.db.models.company import Company
from app.db.models.maturity_level import MaturityLevel


class AssessmentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, assessment_id: int) -> Assessment | None:
        return self.db.query(Assessment).filter(Assessment.id == assessment_id).one_or_none()

    def get_by_id_for_update(self, assessment_id: int) -> Assessment | None:
        return (
            self.db.query(Assessment)
            .filter(Assessment.id == assessment_id)
            .with_for_update()
            .one_or_none()
        )

    def create(self, company_id: int, status: str, current_axis_id: int | None) -> Assessment:
        assessment = Assessment(company_id=company_id, status=status, current_axis_id=current_axis_id)
        self.db.add(assessment)
        self.db.flush()
        return assessment

    def initialize_scores(self, assessment_id: int) -> None:
        capabilities = self.db.query(Capability).all()
        baseline = (
            self.db.query(MaturityLevel)
            .order_by(MaturityLevel.level_number.asc())
            .limit(1)
            .one_or_none()
        )
        if baseline is None:
            raise ValueError("maturity_levels is empty. Seed maturity levels before starting assessments.")
        links = [
            AssessmentScore(
                assessment_id=assessment_id,
                capability_id=c.id,
                maturity_level_id=baseline.id,
                confidence=None,
                justification=None,
            )
            for c in capabilities
        ]
        self.db.add_all(links)

    def list_assessments(self, limit: int = 50, offset: int = 0) -> list[Assessment]:
        return (
            self.db.query(Assessment)
            .join(Company, Company.id == Assessment.company_id)
            .order_by(Assessment.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def add_insight(
        self,
        assessment_id: int,
        capability_id: int | None,
        insight_text: str,
        maturity_level_id: int | None,
        confidence: float | None,
        justification: str | None,
    ) -> None:
        self.db.add(
            AssessmentInsight(
                assessment_id=assessment_id,
                capability_id=capability_id,
                insight_text=insight_text,
                maturity_level_id=maturity_level_id,
                confidence=confidence,
                justification=justification,
            )
        )

    def replace_recommendation_outputs(self, assessment_id: int, items: list[dict]) -> None:
        self.db.query(RecommendationOutput).filter(RecommendationOutput.assessment_id == assessment_id).delete()
        if not items:
            return
        rows = [
            RecommendationOutput(
                assessment_id=assessment_id,
                capability_id=item.get("capability_id"),
                maturity_level_id=item.get("maturity_level_id"),
                generated_text=item["generated_text"],
                priority=item.get("priority"),
            )
            for item in items
        ]
        self.db.add_all(rows)

    def list_recommendation_outputs(self, assessment_id: int) -> list[RecommendationOutput]:
        return (
            self.db.query(RecommendationOutput)
            .filter(RecommendationOutput.assessment_id == assessment_id)
            .all()
        )
