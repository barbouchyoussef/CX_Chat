import asyncio
import json

from sqlalchemy import select

from app.db.session import SessionLocal
from app.db.models.axis import Axis
from app.db.models.capability import Capability
from app.repositories.capability_repository import CapabilityRepository
from app.services.llm.core.facade_service import build_llm_service


ANSWER = "we keep handling customer issues to improve our services"
AXIS_CODE = "manage"


async def main():
    async with SessionLocal() as db:
        llm = build_llm_service()
        capabilities_repo = CapabilityRepository(db)

        result = await db.execute(
            select(
                Capability.id,
                Capability.name,
                Capability.description,
                Capability.evidence_required,
                Capability.sort_order,
            )
            .join(Axis, Axis.id == Capability.axis_id)
            .where(Axis.code == AXIS_CODE)
            .order_by(Capability.sort_order.asc())
        )

        criteria = [
            {
                "id": int(row.id),
                "label": row.name,
                "description": row.description,
                "expected_evidence": row.evidence_required,
                "sort_order": int(row.sort_order),
                "covered": False,
            }
            for row in result.all()
        ]

        capability_ids = [criterion["id"] for criterion in criteria]
        rubrics_by_capability = await capabilities_repo.get_rubrics_for_capabilities(capability_ids)

        coverage_json = await llm.detect_coverage(
            answer=ANSWER,
            criteria=criteria,
            rubrics_by_capability=rubrics_by_capability,
        )

        print(json.dumps(coverage_json, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())