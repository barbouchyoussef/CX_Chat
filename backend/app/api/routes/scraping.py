from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import os
import json
import re
from datetime import datetime, timezone
import logging
from pathlib import Path

from app.core.config import get_settings
from app.dependencies.db import get_db
from app.db.models.company import Company
from app.schemas.manual_analysis import ManualAnalysisParseResponse
from app.schemas.scraping import CompanyOption, ScrapeRequest
from app.services.scraping.job_service import (
    create_job,
    get_job,
    job_to_status,
    start_job,
)
from app.services.scraping.manual_analysis_parser import parse_manual_analysis_workbook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scraping")

_TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "static" / "templates" / "SM_Website_Analysis_TEMPLATE.xlsx"


@router.get("/manual-analysis/template")
async def download_manual_analysis_template() -> FileResponse:
    """Serve the blank 'Social Media & Website Analysis' Excel template for the consultant to fill in."""
    if not _TEMPLATE_PATH.exists():
        raise HTTPException(status_code=404, detail="Template file not found on the server.")
    return FileResponse(
        path=_TEMPLATE_PATH,
        filename="SM_Website_Analysis_TEMPLATE.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/manual-analysis/parse", response_model=ManualAnalysisParseResponse)
async def parse_manual_analysis(file: UploadFile) -> ManualAnalysisParseResponse:
    """Parse a consultant-filled analysis workbook and return the structured data for review before scraping."""
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Please upload the .xlsx workbook (not .xls, .csv, etc.).")

    content = await file.read()
    try:
        return parse_manual_analysis_workbook(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


def _resolve_report_path(filename: str) -> str:
    """Turn a client-supplied report name into a path inside the reports directory.

    The name reaches us from the browser, so it is treated as hostile. `basename` strips any
    traversal, the naming convention keeps the endpoints away from anything that is not a
    saved report, and the containment check is the backstop if either is ever relaxed.
    """
    safe_name = os.path.basename(filename)
    if not safe_name.endswith(".json") or "_report_" not in safe_name:
        raise HTTPException(status_code=400, detail="Not a report file")

    reports_dir = os.path.abspath("scraped_data")
    filepath = os.path.abspath(os.path.join(reports_dir, safe_name))
    if os.path.commonpath([filepath, reports_dir]) != reports_dir:
        raise HTTPException(status_code=400, detail="Invalid report name")
    return filepath


@router.get("/reports/{filename}")
async def get_report(filename: str) -> dict:
    """Retrieve details of a saved scraping report."""
    filepath = _resolve_report_path(filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load report: {e}")


@router.delete("/reports/{filename}", status_code=204)
async def delete_report(filename: str) -> Response:
    """Delete one saved report from disk.

    Only the JSON archive is removed. The `scraping_jobs` row that produced it is left
    alone: it is the run history, and deleting a report is about tidying the list rather
    than erasing the fact that the run happened.
    """
    filepath = _resolve_report_path(filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        os.remove(filepath)
    except OSError as e:
        logger.exception("Failed to delete report %s", filepath)
        raise HTTPException(status_code=500, detail=f"Failed to delete report: {e}")

    logger.info("Deleted saved report %s", os.path.basename(filepath))
    return Response(status_code=204)


@router.post("/run", status_code=202)
async def run_scraping(req: ScrapeRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Queue a scrape and return its job id immediately.

    The work itself takes minutes; keeping the request open for it meant a closed tab or a
    proxy timeout destroyed a run that had already been paid for. Poll /scraping/jobs/{id}.
    """
    settings = get_settings()
    token = settings.apify_api_token
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Apify API token is not configured. Set APIFY_API_TOKEN in .env.",
        )
    if not req.brand_name.strip():
        raise HTTPException(status_code=400, detail="A company name is required.")

    job = await create_job(db, req)
    start_job(job.id, req, token)
    logger.info("Queued scraping job %s for '%s'", job.id, req.brand_name)
    return job_to_status(job)


@router.get("/jobs/{job_id}")
async def get_scraping_job(job_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Poll a queued scrape. Returns the full report once the job succeeds."""
    job = await get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Scraping job not found.")

    return job_to_status(job)
