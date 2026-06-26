import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
import json

async def check_assessments():
    engine = create_async_engine('postgresql+asyncpg://postgres:manticore@127.0.0.1:5432/cx_assessment')
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT a.id, a.status, a.language, c.name as company_name, s.name as sector_name, a.leaders_snapshot_status, a.leaders_snapshot_payload
            FROM assessments a
            LEFT JOIN companies c ON a.company_id = c.id
            LEFT JOIN sectors s ON c.sector_id = s.id
            WHERE a.id in (59, 62)
            ORDER BY a.id DESC
        """))
        for row in res.mappings().all():
            print(f"\nAssessment {row['id']} details:")
            print(f"Status: {row['status']}")
            print(f"Language: {row['language']}")
            print(f"Company: {row['company_name']}")
            print(f"Sector: {row['sector_name']}")
            print(f"Snapshot Status: {row['leaders_snapshot_status']}")
            print(f"Snapshot Payload: {json.dumps(row['leaders_snapshot_payload'], indent=2) if row['leaders_snapshot_payload'] else None}")

if __name__ == "__main__":
    asyncio.run(check_assessments())
