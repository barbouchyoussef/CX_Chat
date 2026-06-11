import asyncio
import json

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.services.assessment.reporting.recommendation_service import RecommendationService
from app.services.assessment.scoring.scoring_service import build_assessment_scoring_service
from app.services.llm.core.facade_service import build_llm_service
from app.services.platform import AsyncUnitOfWork


ASSESSMENT_ID = None  # Put an id here if needed, for example: 233


async def resolve_assessment_id(db):
    if ASSESSMENT_ID is not None:
        return ASSESSMENT_ID

    result = await db.execute(
        text("""
        SELECT id
        FROM assessments
        WHERE status = 'completed'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        """)
    )
    row = result.first()
    if not row:
        raise RuntimeError("No completed assessment found.")
    return int(row[0])


async def main():
    settings = get_settings()

    async with SessionLocal() as db:
        assessment_id = await resolve_assessment_id(db)

        assessments = AssessmentRepository(db)
        capabilities = CapabilityRepository(db)
        llm = build_llm_service(settings=settings)

        scoring = build_assessment_scoring_service(
            db,
            assessments=assessments,
            capabilities=capabilities,
            settings=settings,
        )

        recommendation_service = RecommendationService(
            db=db,
            assessments=assessments,
            capabilities=capabilities,
            llm_service=llm,
            scoring_service=scoring,
            uow=AsyncUnitOfWork(db),
            settings=settings,
        )

        rows = await capabilities.get_recommendations_for_scores(
            assessment_id=assessment_id
        )
        maturity_label_by_id = await recommendation_service._fetch_maturity_labels()

        items_json = []

        for row in rows:
            if not recommendation_service._is_assessed(row):
                continue

            confidence = row.get("confidence")
            evidence_list = []

            if row.get("evidence_text"):
                evidence_list.append(str(row.get("evidence_text")))

            if row.get("justification"):
                evidence_list.append(str(row.get("justification")))

            recommendation_context = recommendation_service.build_recommendation_context(row)
            evidence_quality = recommendation_service.evidence_quality.calculate(evidence_list)

            items_json.append(
                {
                    "capability_id": int(row["capability_id"]),
                    "axis": str(row.get("axis") or ""),
                    "capability_name": str(row.get("capability_name") or ""),
                    "maturity_level": (
                        maturity_label_by_id.get(int(row["maturity_level_id"]))
                        if row.get("maturity_level_id")
                        else "Unknown"
                    ),
                    "confidence": float(confidence) if confidence is not None else None,
                    "evidence": evidence_list[:2],
                    "insight_summary": str(row.get("justification") or ""),
                    "admin_guideline": recommendation_context["recommendation_guideline"],
                    "priority_hint": recommendation_context["priority_hint"],
                    "business_impact": recommendation_context["business_impact"],
                    "tone_hint": recommendation_context["tone_hint"],
                    "supporting_notes": recommendation_context["supporting_notes"],
                    "evidence_quality": evidence_quality.value,
                }
            )

        print(f"Assessment id: {assessment_id}")
        print(json.dumps(items_json, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())