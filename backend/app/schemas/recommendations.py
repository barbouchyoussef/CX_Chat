from datetime import datetime

from pydantic import BaseModel


class AssessmentRecommendationItem(BaseModel):
    capability_id: int
    capability_code: str
    capability_name: str
    axis: str
    maturity_level_id: int | None = None
    confidence: float | None = None
    justification: str | None = None
    recommendation_guideline: str | None = None
    priority_hint: str | None = None
    consultant_note: str | None = None
    evidence_to_cite: str | None = None
    initiative_suggestions: str | None = None
    business_impact: str | None = None
    tone_hint: str | None = None
    recommendation_text: str | None = None


class AssessmentRecommendationsResponse(BaseModel):
    assessment_id: int
    items: list[AssessmentRecommendationItem]


class RecommendationOutputItem(BaseModel):
    id: int
    capability_id: int | None = None
    maturity_level_id: int | None = None
    generated_text: str
    priority: str | None = None
    created_at: datetime


class RecommendationOutputsResponse(BaseModel):
    assessment_id: int
    items: list[RecommendationOutputItem]


class AssessmentTraceItem(BaseModel):
    capability_id: int | None = None
    capability_code: str | None = None
    axis: str | None = None
    question: str
    answer: str
    created_at: datetime
    maturity_level_id: int | None = None
    confidence: float | None = None
    justification: str | None = None
    recommendation_guideline: str | None = None
    priority_hint: str | None = None


class AssessmentTraceResponse(BaseModel):
    assessment_id: int
    items: list[AssessmentTraceItem]
