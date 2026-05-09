from pydantic import BaseModel, Field


class CapabilityBase(BaseModel):
    axis_id: int = Field(ge=1)
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    evidence_required: str | None = None
    question_guidelines: str | None = Field(
        default=None,
        title="Question guidance for the LLM",
        description=(
            "Business guidance used by the LLM to generate the next question. "
            "Describe the discovery goal, useful examples, and maturity signals to test. "
            "This is not a fixed script shown to the client."
        ),
    )
    sort_order: int = Field(ge=1)


class CapabilityCreate(CapabilityBase):
    pass


class CapabilityUpdate(BaseModel):
    axis_id: int | None = Field(default=None, ge=1)
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    evidence_required: str | None = None
    question_guidelines: str | None = Field(
        default=None,
        title="Question guidance for the LLM",
        description=(
            "Business guidance used by the LLM to generate the next question. "
            "Describe the discovery goal, useful examples, and maturity signals to test."
        ),
    )
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
    recommendation_guideline: str = Field(
        min_length=1,
        title="Recommended action direction",
        description=(
            "Primary management action or recommendation logic injected into the final report prompt. "
            "Write the action direction, not the final polished paragraph."
        ),
    )
    priority_hint: str | None = Field(
        default=None,
        max_length=40,
        title="Priority level",
        description="Priority framing for the recommendation, such as urgent_foundation, build_consistency, or scale_advantage.",
    )
    consultant_note: str | None = Field(
        default=None,
        title="Optional framing note",
        description="Optional nuance or framing note that helps shape the final wording without overriding the main recommendation.",
    )
    evidence_to_cite: str | None = Field(
        default=None,
        title="Reference evidence pattern",
        description="Optional reminder of the type of evidence pattern that usually supports this recommendation.",
    )
    initiative_suggestions: str | None = Field(
        default=None,
        title="Suggested initiatives",
        description="Optional examples of initiatives or workstreams that can support the recommendation.",
    )
    business_impact: str | None = Field(
        default=None,
        title="Expected business impact",
        description="Business or customer outcome expected if the recommendation is implemented well.",
    )
    tone_hint: str | None = Field(
        default="balanced",
        max_length=40,
        title="Writing tone",
        description="Preferred tone for the final recommendation wording, such as direct, balanced, or executive.",
    )


class CapabilityRecommendationCreate(CapabilityRecommendationBase):
    pass


class CapabilityRecommendationUpdate(BaseModel):
    capability_id: int | None = Field(default=None, ge=1)
    maturity_level_id: int | None = Field(default=None, ge=1)
    recommendation_guideline: str | None = Field(
        default=None,
        min_length=1,
        title="Recommended action direction",
        description="Primary management action or recommendation logic injected into the report prompt.",
    )
    priority_hint: str | None = Field(
        default=None,
        max_length=40,
        title="Priority level",
        description="Priority framing for the recommendation.",
    )
    consultant_note: str | None = Field(
        default=None,
        title="Optional framing note",
        description="Optional nuance or framing note for the final recommendation wording.",
    )
    evidence_to_cite: str | None = Field(
        default=None,
        title="Reference evidence pattern",
        description="Optional reminder of the evidence pattern typically linked to this recommendation.",
    )
    initiative_suggestions: str | None = Field(
        default=None,
        title="Suggested initiatives",
        description="Optional examples of initiatives that can support the recommendation.",
    )
    business_impact: str | None = Field(
        default=None,
        title="Expected business impact",
        description="Business or customer outcome expected from the recommendation.",
    )
    tone_hint: str | None = Field(
        default=None,
        max_length=40,
        title="Writing tone",
        description="Preferred tone for the final recommendation wording.",
    )


class CapabilityRecommendationRead(CapabilityRecommendationBase):
    id: int
