from datetime import datetime

from pydantic import BaseModel, Field


class AssessmentListItem(BaseModel):
    id: int
    status: str = Field(min_length=1, max_length=30)
    current_axis: str | None = Field(default=None, max_length=50)
    company_name: str = Field(min_length=1, max_length=255)
    sector: str = Field(min_length=1, max_length=255)
    size: str = Field(min_length=1, max_length=255)
    region: str | None = Field(default=None, max_length=120)
    created_at: datetime
    updated_at: datetime


class AssessmentsListResponse(BaseModel):
    items: list[AssessmentListItem]
    limit: int
    offset: int
