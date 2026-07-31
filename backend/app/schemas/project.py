"""Schemas for CX engagement projects.

A project groups a client engagement into a tracked pipeline over the existing modules. It is a
thin tracking/navigation layer -- the modules themselves are untouched; the project just records
which steps are done, in progress, or still to do.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StepStatus = Literal["todo", "in_progress", "done"]

# The pipeline steps, in engagement order. Keys map to the services-hub modules.
PROJECT_STEPS: list[str] = ["assessment", "interview", "desk_research", "social"]


class Project(BaseModel):
    id: str
    name: str
    company_name: str | None = None
    sector: str | None = None
    created_at: str
    updated_at: str
    # step key -> status
    steps: dict[str, StepStatus] = Field(default_factory=dict)


class ProjectCreate(BaseModel):
    name: str = Field(..., description="Project name")
    company_name: str | None = None
    sector: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    company_name: str | None = None
    sector: str | None = None


class StepUpdate(BaseModel):
    status: StepStatus
