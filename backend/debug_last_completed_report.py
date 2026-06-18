from __future__ import annotations

import asyncio
import json

from sqlalchemy import text

from app.db.session import SessionLocal


async def main() -> None:
    async with SessionLocal() as db:
        assessment = (
            await db.execute(
                text(
                    """
                    SELECT id, status, language, created_at
                    FROM assessments
                    WHERE LOWER(status) = 'completed'
                    ORDER BY id DESC
                    LIMIT 1
                    """
                )
            )
        ).mappings().first()
        if assessment is None:
            print("No completed assessment found.")
            return

        assessment_id = int(assessment["id"])
        print("LAST_COMPLETED_ASSESSMENT")
        print(json.dumps(dict(assessment), ensure_ascii=False, default=str, indent=2))

        quick_win_templates = (
            await db.execute(
                text(
                    """
                    SELECT
                      c.name AS capability,
                      ml.level_number,
                      q.quick_win_guideline,
                      q.after_text,
                      q.owner_hint,
                      q.timeline_hint
                    FROM assessment_scores sc
                    JOIN capabilities c ON c.id = sc.capability_id
                    JOIN maturity_levels ml ON ml.id = sc.maturity_level_id
                    LEFT JOIN capability_quick_win_templates q
                      ON q.capability_id = sc.capability_id
                     AND q.maturity_level_id = sc.maturity_level_id
                    WHERE sc.assessment_id = :assessment_id
                    ORDER BY ml.level_number ASC, c.name ASC
                    LIMIT 12
                    """
                ),
                {"assessment_id": assessment_id},
            )
        ).mappings().all()
        print("QUICK_WIN_TEMPLATE_SOURCE_ROWS")
        print(json.dumps([dict(row) for row in quick_win_templates], ensure_ascii=False, default=str, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
