from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.repositories.assessment_website_audit_repository import AssessmentWebsiteAuditRepository
from app.services.platform import AsyncUnitOfWork

logger = logging.getLogger(__name__)


class WebsiteAuditService:
    """Runs and persists the homepage UX/UI audit for an assessment."""

    def __init__(
        self,
        audits: AssessmentWebsiteAuditRepository,
        uow: AsyncUnitOfWork,
        settings: Settings,
    ) -> None:
        self.audits = audits
        self.uow = uow
        self.settings = settings

    async def create_pending(self, assessment_id: int, website_url: str) -> None:
        if not self.settings.website_audit_enabled:
            return
        await self.audits.create_pending(assessment_id=assessment_id, website_url=website_url)

    async def run_for_assessment(self, assessment_id: int, website_url: str) -> None:
        if not self.settings.website_audit_enabled:
            return

        audit = await self.audits.get_by_assessment_id(assessment_id)
        if audit is None:
            async with self.uow:
                audit = await self.audits.create_pending(assessment_id=assessment_id, website_url=website_url)

        try:
            async with self.uow:
                await self.audits.mark_running(audit)

            payload, output_dir = await asyncio.wait_for(
                self._run_external_audit(assessment_id=assessment_id, website_url=website_url),
                timeout=self.settings.website_audit_timeout_seconds,
            )

            async with self.uow:
                refreshed = await self.audits.get_by_assessment_id(assessment_id)
                if refreshed is None:
                    refreshed = await self.audits.create_pending(assessment_id=assessment_id, website_url=website_url)
                await self.audits.mark_completed(
                    audit=refreshed,
                    payload=self._report_payload(payload),
                    report_path=str((output_dir / "report.html").resolve()),
                    desktop_screenshot_path=str((output_dir / "screenshots" / "desktop.png").resolve()),
                    mobile_screenshot_path=str((output_dir / "screenshots" / "mobile.png").resolve()),
                )
        except Exception as exc:
            logger.error("Website audit failed for assessment %s: %s", assessment_id, exc, exc_info=True)
            async with self.uow:
                refreshed = await self.audits.get_by_assessment_id(assessment_id)
                if refreshed is None:
                    refreshed = await self.audits.create_pending(assessment_id=assessment_id, website_url=website_url)
                await self.audits.mark_failed(refreshed, self._failure_message(exc))

    async def _run_external_audit(self, assessment_id: int, website_url: str) -> tuple[dict[str, Any], Path]:
        backend_root = Path(__file__).resolve().parents[4]
        audit_root = backend_root / "UX_UI_AUDIT"
        output_dir = self._output_dir(backend_root=backend_root, assessment_id=assessment_id)

        audit_script = audit_root / "audit_homepage.py"
        candidate_errors: list[RuntimeError] = []
        for python_executable in self._audit_python_candidates(audit_root):
            try:
                payload = await self._run_subprocess_audit(
                    python_executable=python_executable,
                    audit_script=audit_script,
                    audit_root=audit_root,
                    website_url=website_url,
                    output_dir=output_dir,
                )
                return payload, output_dir
            except RuntimeError as exc:
                candidate_errors.append(exc)
                if not self._should_fallback_to_backend_runtime(exc):
                    raise
                logger.warning(
                    "Website audit Python candidate failed before audit execution; trying next candidate: %s",
                    exc,
                )

        if candidate_errors:
            raise candidate_errors[-1]

        if str(backend_root) not in sys.path:
            sys.path.insert(0, str(backend_root))

        from UX_UI_AUDIT.audit_homepage import normalize_url, run_audit

        payload = await run_audit(normalize_url(website_url), output_dir)
        return payload, output_dir

    async def _run_subprocess_audit(
        self,
        python_executable: Path,
        audit_script: Path,
        audit_root: Path,
        website_url: str,
        output_dir: Path,
    ) -> dict[str, Any]:
        result = await asyncio.to_thread(
            subprocess.run,
            [
                str(python_executable),
                str(audit_script),
                website_url,
                "--out",
                str(output_dir),
            ],
            cwd=str(audit_root),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            details = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(
                f"Homepage audit process failed with exit code {result.returncode}: "
                f"{details or 'no output'}"
            )

        audit_json = output_dir / "audit.json"
        if not audit_json.exists():
            details = (result.stdout or "").strip()
            raise RuntimeError(
                "Homepage audit process finished but did not create audit.json"
                + (f": {details}" if details else "")
            )
        return json.loads(audit_json.read_text(encoding="utf-8"))

    def _output_dir(self, backend_root: Path, assessment_id: int) -> Path:
        output_base = Path(self.settings.website_audit_output_dir)
        if not output_base.is_absolute():
            output_base = backend_root / output_base
        return output_base / str(assessment_id)

    def _audit_python_candidates(self, audit_root: Path) -> list[Path]:
        candidates: list[Path] = []
        audit_python = audit_root / ".venv" / "Scripts" / "python.exe"
        if audit_python.exists():
            candidates.append(audit_python)

        current_python = Path(sys.executable)
        if current_python.exists() and current_python not in candidates:
            candidates.append(current_python)

        return candidates

    def _report_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        findings = payload.get("findings")
        return {
            "url": payload.get("url"),
            "generatedAt": payload.get("generatedAt"),
            "overallScore": payload.get("overallScore"),
            "findings": findings if isinstance(findings, list) else [],
        }

    def _failure_message(self, exc: Exception) -> str:
        text = f"{type(exc).__name__}: {exc}".strip()
        if "Executable doesn't exist" in text or "playwright install" in text:
            return (
                "Playwright browser is not installed for the website audit environment. "
                "Run `backend\\UX_UI_AUDIT\\.venv\\Scripts\\python.exe -m playwright install chromium`."
            )
        if "TimeoutError" in text or "timed out" in text.lower():
            return "The website audit timed out while loading or analyzing the homepage."
        return text[:1200]

    def _should_fallback_to_backend_runtime(self, exc: RuntimeError) -> bool:
        text = str(exc)
        fallback_markers = (
            "No Python at",
            "ModuleNotFoundError:",
            "ImportError:",
            "cannot import name '_imaging'",
        )
        return any(marker in text for marker in fallback_markers)


def build_website_audit_service(
    db: AsyncSession,
    settings: Settings | None = None,
) -> WebsiteAuditService:
    resolved_settings = settings or get_settings()
    return WebsiteAuditService(
        audits=AssessmentWebsiteAuditRepository(db),
        uow=AsyncUnitOfWork(db),
        settings=resolved_settings,
    )


async def run_website_audit_background(assessment_id: int, website_url: str) -> None:
    settings = get_settings()
    async with SessionLocal() as db:
        service = build_website_audit_service(db=db, settings=settings)
        await service.run_for_assessment(assessment_id=assessment_id, website_url=website_url)
