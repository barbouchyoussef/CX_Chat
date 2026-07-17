from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import os
import json
import re
from datetime import datetime, timezone
import logging

from app.core.config import get_settings
from app.dependencies.db import get_db
from app.db.models.company import Company
from app.schemas.scraping import CompanyOption, ScrapeRequest, ScrapingResponse
from app.services.scraping.scraping_service import run_full_scrape

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scraping")


@router.get("/companies", response_model=list[CompanyOption])
async def list_companies(db: AsyncSession = Depends(get_db)) -> list[CompanyOption]:
    """Return distinct company names for the dropdown selector."""
    result = await db.execute(
        select(Company.id, Company.name).order_by(Company.name.asc())
    )
    rows = result.all()
    return [CompanyOption(id=r.id, name=r.name) for r in rows]


@router.get("/reports")
async def list_reports() -> list[dict]:
    """List all saved scraping reports."""
    if not os.path.exists("scraped_data"):
        return []
    
    reports = []
    for filename in os.listdir("scraped_data"):
        if not filename.endswith(".json") or "_report_" not in filename:
            continue
            
        filepath = os.path.join("scraped_data", filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            reports.append({
                "filename": filename,
                "brand_name": data.get("brand_name", "Unknown"),
                "scraped_at": data.get("scraped_at"),
                "total_reviews": data.get("total_reviews", 0),
            })
        except Exception as e:
            logger.warning("Failed to read report %s: %s", filename, e)
            
    # Sort by scraped_at descending
    reports.sort(key=lambda x: x.get("scraped_at") or "", reverse=True)
    return reports


@router.get("/reports/{filename}")
async def get_report(filename: str) -> dict:
    """Retrieve details of a saved scraping report."""
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join("scraped_data", safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")
        
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load report: {e}")


def _determine_sector_id(brand: str) -> int:
    brand_lower = brand.lower()
    if "telecom" in brand_lower or "orange" in brand_lower or "ooredoo" in brand_lower or "telephony" in brand_lower:
        return 7  # Telecom
    if "bank" in brand_lower or "banque" in brand_lower or "finance" in brand_lower:
        return 5  # Banking
    if "assur" in brand_lower or "insur" in brand_lower:
        return 6  # Insurance
    if "shop" in brand_lower or "store" in brand_lower or "retail" in brand_lower:
        return 3  # Retail
    if "ecom" in brand_lower or "online" in brand_lower:
        return 4  # E-commerce
    return 1  # Unknown


@router.post("/run", response_model=ScrapingResponse)
async def run_scraping(req: ScrapeRequest, db: AsyncSession = Depends(get_db)) -> ScrapingResponse:
    """Run the multi-platform scraping pipeline for a brand and persist to DB if new."""
    settings = get_settings()
    token = settings.apify_api_token
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Apify API token is not configured. Set APIFY_API_TOKEN in .env.",
        )

    # 1. Trigger the scraping
    response = await run_full_scrape(req.brand_name, token, req.facebook_url)
    
    # 2. Persist the report to disk if any reviews were scraped
    if response.total_reviews > 0:
        try:
            os.makedirs("scraped_data", exist_ok=True)
            safe_brand = re.sub(r"[^a-zA-Z0-9_-]", "_", req.brand_name.strip().lower())
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            filename = f"{safe_brand}_report_{timestamp}.json"
            filepath = os.path.join("scraped_data", filename)
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(response.model_dump(), f, indent=2, ensure_ascii=False)
            logger.info("Saved full scraping report to %s", filepath)
        except Exception as e:
            logger.warning("Failed to save scraping report: %s", e)

        # 3. Persist company name to DB dropdown
        try:
            q = await db.execute(
                select(Company).where(Company.name.ilike(req.brand_name.strip()))
            )
            existing = q.scalars().first()
            if not existing:
                sector_id = _determine_sector_id(req.brand_name)
                new_company = Company(
                    name=req.brand_name.strip(),
                    sector_id=sector_id
                )
                db.add(new_company)
                await db.commit()
                logger.info("Saved new scraped company to database: %s (sector_id=%d)", req.brand_name, sector_id)
        except Exception as e:
            logger.warning("Failed to save scraped company to database: %s", e)

    return response
