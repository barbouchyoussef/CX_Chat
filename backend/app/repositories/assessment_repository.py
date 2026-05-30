from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.models.assessment import Assessment
from app.db.models.assessment_insight import AssessmentInsight
from app.db.models.recommendation_output import RecommendationOutput
from app.db.models.assessment_score import AssessmentScore
from app.db.models.capability import Capability
from app.db.models.company import Company
from app.db.models.maturity_level import MaturityLevel
from app.db.models.region import Region


class AssessmentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _with_context(self):
        return (
            joinedload(Assessment.company).joinedload(Company.sector),
            joinedload(Assessment.company).joinedload(Company.company_size),
            joinedload(Assessment.company).joinedload(Company.region_ref),
            joinedload(Assessment.current_axis),
        )

    async def get_by_id(self, assessment_id: int) -> Assessment | None:
        result = await self.db.execute(
            select(Assessment)
            .options(*self._with_context())
            .where(Assessment.id == assessment_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_for_update(self, assessment_id: int) -> Assessment | None:
        result = await self.db.execute(
            select(Assessment)
            .options(*self._with_context())
            .where(Assessment.id == assessment_id)
            .with_for_update(of=Assessment)
        )
        return result.scalar_one_or_none()

    async def get_maturity_level_by_number(self, level_number: int) -> MaturityLevel | None:
        result = await self.db.execute(
            select(MaturityLevel).where(MaturityLevel.level_number == level_number)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        company_id: int,
        status: str,
        current_axis_id: int | None,
        prompt_profile: str = "consultant_guided",
    ) -> Assessment:
        assessment = Assessment(
            company_id=company_id,
            status=status,
            current_axis_id=current_axis_id,
            prompt_profile=prompt_profile,
        )
        self.db.add(assessment)
        await self.db.flush()
        return assessment

    async def initialize_scores(self, assessment_id: int) -> None:
        result = await self.db.execute(select(Capability))
        capabilities = result.scalars().all()
        links = [
            AssessmentScore(
                assessment_id=assessment_id,
                capability_id=c.id,
                maturity_level_id=None,
                assessment_status="not_assessed",
                confidence=None,
                justification=None,
            )
            for c in capabilities
        ]
        self.db.add_all(links)

    async def list_assessments(
        self,
        limit: int = 50,
        offset: int = 0,
        region_code: str | None = None,
    ) -> list[Assessment]:
        statement = (
            select(Assessment)
            .options(*self._with_context())
            .join(Company, Company.id == Assessment.company_id)
        )
        if region_code:
            statement = statement.join(Region, Region.id == Company.region_id).where(
                Region.name == region_code
            )
        result = await self.db.execute(statement.order_by(Assessment.id.desc()).offset(offset).limit(limit))
        return list(result.scalars().all())

    async def add_insight(
        self,
        assessment_id: int,
        capability_id: int | None,
        insight_text: str,
        maturity_level_id: int | None,
        confidence: float | None,
        justification: str | None,
        evidence_text: str | None,
    ) -> None:
        self.db.add(
            AssessmentInsight(
                assessment_id=assessment_id,
                capability_id=capability_id,
                insight_text=insight_text,
                maturity_level_id=maturity_level_id,
                confidence=confidence,
                justification=justification,
                evidence_text=evidence_text,
            )
        )

    async def replace_recommendation_outputs(self, assessment_id: int, items: list[dict]) -> None:
        await self.db.execute(
            delete(RecommendationOutput).where(RecommendationOutput.assessment_id == assessment_id)
        )
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

    async def list_recommendation_outputs(self, assessment_id: int) -> list[RecommendationOutput]:
        result = await self.db.execute(
            select(RecommendationOutput).where(RecommendationOutput.assessment_id == assessment_id)
        )
        return list(result.scalars().all())

    async def update_report_synthesis(
        self,
        assessment: Assessment,
        executive_summary_text: str,
        priority_message_text: str,
    ) -> None:
        assessment.executive_summary_text = executive_summary_text
        assessment.priority_message_text = priority_message_text
        await self.db.flush()

    async def update_leaders_snapshot_cache(
        self,
        assessment: Assessment,
        leaders_snapshot_payload: dict | None,
        leaders_snapshot_status: str | None = None,
        leaders_snapshot_generated_at: datetime | None = None,
        leaders_snapshot_error: str | None = None,
    ) -> None:
        assessment.leaders_snapshot_payload = leaders_snapshot_payload
        if leaders_snapshot_status is not None:
            assessment.leaders_snapshot_status = leaders_snapshot_status
        assessment.leaders_snapshot_generated_at = leaders_snapshot_generated_at
        assessment.leaders_snapshot_error = leaders_snapshot_error
        await self.db.flush()
