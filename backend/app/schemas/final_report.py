from pydantic import BaseModel


class FinalReportSummary(BaseModel):
    overall_score_percent: float
    overall_maturity_band: str
    strongest_axis: str
    strongest_axis_score_percent: float
    priority_axis: str
    priority_axis_score_percent: float
    strengths_count: int
    pain_points_count: int


class FinalReportAxisItem(BaseModel):
    axis: str
    score_percent: float
    maturity_band: str


class FinalReportThemeItem(BaseModel):
    axis: str
    capability: str
    maturity_band: str
    rationale: str | None = None
    recommendation: str | None = None
    priority: str | None = None


class FinalReportCapabilityItem(BaseModel):
    axis: str
    capability: str
    maturity_band: str
    confidence: float | None = None
    rationale: str | None = None
    recommendation: str | None = None
    priority: str | None = None


class FinalReportBenchmarkItem(BaseModel):
    title: str
    url: str
    site_name: str | None = None
    published_at: str | None = None
    summary: str | None = None
    method_signal: str | None = None


class FinalReportResponse(BaseModel):
    assessment_id: int
    summary: FinalReportSummary
    axes: list[FinalReportAxisItem]
    strengths: list[FinalReportThemeItem]
    pain_points: list[FinalReportThemeItem]
    capabilities: list[FinalReportCapabilityItem]
    benchmarks: list[FinalReportBenchmarkItem]
