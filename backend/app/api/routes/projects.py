"""Routes for engagement projects (a tracked pipeline over the existing modules)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.schemas.project import (
    PROJECT_STEPS,
    Project,
    ProjectCreate,
    ProjectUpdate,
    StepUpdate,
)
from app.services.projects import project_store

router = APIRouter(prefix="/projects")


@router.get("", response_model=list[Project])
async def list_projects() -> list[Project]:
    return project_store.list_projects()


@router.post("", response_model=Project, status_code=201)
async def create_project(body: ProjectCreate) -> Project:
    return project_store.create(body.name, body.company_name, body.sector)


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str) -> Project:
    project = project_store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=Project)
async def update_project(project_id: str, body: ProjectUpdate) -> Project:
    project = project_store.update(
        project_id, name=body.name, company_name=body.company_name, sector=body.sector
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}/steps/{step_key}", response_model=Project)
async def set_project_step(project_id: str, step_key: str, body: StepUpdate) -> Project:
    if step_key not in PROJECT_STEPS:
        raise HTTPException(status_code=400, detail=f"Unknown step '{step_key}'")
    project = project_store.set_step(project_id, step_key, body.status)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str):
    if not project_store.delete(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return Response(status_code=204)
