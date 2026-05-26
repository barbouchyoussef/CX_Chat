from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="CX Assessment API", version="0.1.0")
    settings = get_settings()
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

    backend_root = Path(__file__).resolve().parents[1]
    audit_output_dir = Path(settings.website_audit_output_dir)
    if not audit_output_dir.is_absolute():
        audit_output_dir = backend_root / audit_output_dir
    audit_output_dir.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/audit-artifacts",
        StaticFiles(directory=str(audit_output_dir)),
        name="audit-artifacts",
    )
    return app


app = create_app()
