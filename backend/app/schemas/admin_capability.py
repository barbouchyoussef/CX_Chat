from pydantic import BaseModel, Field


class CapabilityBase(BaseModel):
    axis_id: int = Field(ge=1)
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    evidence_required: str | None = None
    question_guidelines: str | None = None
    sort_order: int = Field(ge=1)


class CapabilityCreate(CapabilityBase):
    pass


class CapabilityUpdate(BaseModel):
    axis_id: int | None = Field(default=None, ge=1)
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    evidence_required: str | None = None
    question_guidelines: str | None = None
    sort_order: int | None = Field(default=None, ge=1)


class CapabilityRead(CapabilityBase):
    id: int


class CapabilityMaturityRubricBase(BaseModel):
    capability_id: int = Field(ge=1)
    maturity_level_id: int = Field(ge=1)
    description: str = Field(min_length=1)


class CapabilityMaturityRubricCreate(CapabilityMaturityRubricBase):
    pass


class CapabilityMaturityRubricUpdate(BaseModel):
    capability_id: int | None = Field(default=None, ge=1)
    maturity_level_id: int | None = Field(default=None, ge=1)
    description: str | None = Field(default=None, min_length=1)


class CapabilityMaturityRubricRead(CapabilityMaturityRubricBase):
    id: int


class CapabilityRecommendationBase(BaseModel):
    capability_id: int = Field(ge=1)
    maturity_level_id: int = Field(ge=1)
    recommendation_guideline: str = Field(min_length=1)
    priority_hint: str | None = Field(default=None, max_length=40)
    consultant_note: str | None = None
    evidence_to_cite: str | None = None
    initiative_suggestions: str | None = None
    business_impact: str | None = None
    tone_hint: str | None = Field(default="balanced", max_length=40)


class CapabilityRecommendationCreate(CapabilityRecommendationBase):
    pass


class CapabilityRecommendationUpdate(BaseModel):
    capability_id: int | None = Field(default=None, ge=1)
    maturity_level_id: int | None = Field(default=None, ge=1)
    recommendation_guideline: str | None = Field(default=None, min_length=1)
    priority_hint: str | None = Field(default=None, max_length=40)
    consultant_note: str | None = None
    evidence_to_cite: str | None = None
    initiative_suggestions: str | None = None
    business_impact: str | None = None
    tone_hint: str | None = Field(default=None, max_length=40)


class CapabilityRecommendationRead(CapabilityRecommendationBase):
    id: int
