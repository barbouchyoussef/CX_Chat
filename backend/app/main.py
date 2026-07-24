import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Close out scraping jobs orphaned by a previous process.

    Jobs run as in-process tasks, so a restart (including an autoreload in dev) leaves rows
    stuck at 'running' that no task will ever finish. Without this the UI polls them forever.
    """
    try:
        from app.db.session import SessionLocal
        from app.services.scraping.job_service import reap_stale_jobs

        async with SessionLocal() as db:
            await reap_stale_jobs(db)
    except Exception:
        # Never block startup on housekeeping -- a database that is not up yet is not fatal here.
        logger.exception("Could not reap interrupted scraping jobs at startup")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="CX Assessment API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
