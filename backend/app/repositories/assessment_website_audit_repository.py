from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.assessment_website_audit import AssessmentWebsiteAudit


class AssessmentWebsiteAuditRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_assessment_id(self, assessment_id: int) -> AssessmentWebsiteAudit | None:
        result = await self.db.execute(
            select(AssessmentWebsiteAudit).where(AssessmentWebsiteAudit.assessment_id == assessment_id)
        )
        return result.scalar_one_or_none()

    async def create_pending(self, assessment_id: int, website_url: str) -> AssessmentWebsiteAudit:
        existing = await self.get_by_assessment_id(assessment_id)
        if existing is not None:
            existing.website_url = website_url
            existing.status = "pending"
            existing.payload = None
            existing.error_message = None
            existing.report_path = None
            existing.desktop_screenshot_path = None
            existing.mobile_screenshot_path = None
            await self.db.flush()
            return existing

        audit = AssessmentWebsiteAudit(
            assessment_id=assessment_id,
            website_url=website_url,
            status="pending",
        )
        self.db.add(audit)
        await self.db.flush()
        return audit

    async def mark_running(self, audit: AssessmentWebsiteAudit) -> None:
        audit.status = "running"
        audit.error_message = None
        await self.db.flush()

    async def mark_completed(
        self,
        audit: AssessmentWebsiteAudit,
        payload: dict[str, Any],
        report_path: str | None,
        desktop_screenshot_path: str | None,
        mobile_screenshot_path: str | None,
    ) -> None:
        audit.status = "completed"
        audit.payload = payload
        audit.error_message = None
        audit.report_path = report_path
        audit.desktop_screenshot_path = desktop_screenshot_path
        audit.mobile_screenshot_path = mobile_screenshot_path
        await self.db.flush()

    async def mark_failed(self, audit: AssessmentWebsiteAudit, error_message: str) -> None:
        audit.status = "failed"
        audit.error_message = error_message[:2000]
        await self.db.flush()
