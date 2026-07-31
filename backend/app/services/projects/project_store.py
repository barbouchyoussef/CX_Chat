"""Disk-backed store for engagement projects (one JSON file per project).

Kept deliberately simple and file-based (like the desk-research and social stores): a project is
lightweight metadata plus a per-step status map, so it needs no database migration.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.schemas.project import PROJECT_STEPS, Project, StepStatus

logger = logging.getLogger(__name__)

_ROOT = Path(os.getenv("PROJECTS_DATA_ROOT", "projects_data"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path(project_id: str) -> Path:
    # basename guards the id against path traversal.
    return _ROOT / f"{os.path.basename(project_id)}.json"


def _save(project: Project) -> None:
    _ROOT.mkdir(parents=True, exist_ok=True)
    _path(project.id).write_text(project.model_dump_json(indent=2), encoding="utf-8")


def _normalize_steps(project: Project) -> Project:
    for key in PROJECT_STEPS:
        project.steps.setdefault(key, "todo")
    return project


def create(name: str, company_name: str | None = None, sector: str | None = None) -> Project:
    project = Project(
        id=uuid4().hex[:12],
        name=(name or "").strip() or "Untitled Project",
        company_name=(company_name or "").strip() or None,
        sector=(sector or "").strip() or None,
        created_at=_now(),
        updated_at=_now(),
        steps={key: "todo" for key in PROJECT_STEPS},
    )
    _save(project)
    return project


def get(project_id: str) -> Project | None:
    path = _path(project_id)
    if not path.exists():
        return None
    try:
        return _normalize_steps(Project.model_validate_json(path.read_text(encoding="utf-8")))
    except Exception:
        logger.warning("Could not read project %s", project_id, exc_info=True)
        return None


def list_projects() -> list[Project]:
    if not _ROOT.exists():
        return []
    projects: list[Project] = []
    for f in _ROOT.glob("*.json"):
        try:
            projects.append(_normalize_steps(Project.model_validate_json(f.read_text(encoding="utf-8"))))
        except Exception:
            logger.warning("Skipping unreadable project file %s", f.name)
    projects.sort(key=lambda p: p.updated_at, reverse=True)
    return projects


def update(
    project_id: str,
    *,
    name: str | None = None,
    company_name: str | None = None,
    sector: str | None = None,
) -> Project | None:
    project = get(project_id)
    if not project:
        return None
    if name is not None and name.strip():
        project.name = name.strip()
    if company_name is not None:
        project.company_name = company_name.strip() or None
    if sector is not None:
        project.sector = sector.strip() or None
    project.updated_at = _now()
    _save(project)
    return project


def set_step(project_id: str, step_key: str, status: StepStatus) -> Project | None:
    if step_key not in PROJECT_STEPS:
        return None
    project = get(project_id)
    if not project:
        return None
    project.steps[step_key] = status
    project.updated_at = _now()
    _save(project)
    return project


def delete(project_id: str) -> bool:
    path = _path(project_id)
    if not path.exists():
        return False
    path.unlink()
    return True
