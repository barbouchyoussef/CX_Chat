from pydantic import BaseModel, Field

from app.schemas.reference import ReferenceOption


class WelcomeResponse(BaseModel):
    message: str


class ClientTurnRequest(BaseModel):
    # If omitted, this turn is treated as "company name" (start).
    assessment_id: int | None = None

    # For start flow: only provided when auto-classification fails.
    sector_code: str | None = Field(default=None, min_length=1, max_length=100)
    company_size_code: str | None = Field(default=None, min_length=1, max_length=100)

    # The user message: company name (start) or an answer (continue).
    message: str = Field(min_length=1, max_length=10_000)


class ClientTurnResponse(BaseModel):
    assessment_id: int | None
    status: str
    axis: str | None
    assistant_message: str

    # Optional telemetry for tests.
    covered: list[int] | None = None
    confidence: float | None = None

    # Only present when status == "needs_profile".
    sectors: list[ReferenceOption] | None = None
    company_sizes: list[ReferenceOption] | None = None
