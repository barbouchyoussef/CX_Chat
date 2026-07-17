from pydantic import BaseModel


class ScrapeRequest(BaseModel):
    brand_name: str
    facebook_url: str | None = None


class ReviewClassification(BaseModel):
    sentiment: str  # "positive", "neutral", "negative"
    confidence: float
    themes: list[str]
    complaint_category: str | None = None


class ScrapedReview(BaseModel):
    platform: str
    author: str | None = None
    text: str
    rating: float | None = None
    date: str | None = None
    url: str | None = None
    classification: ReviewClassification | None = None


class PlatformResult(BaseModel):
    platform: str
    status: str  # "success", "error", "empty"
    review_count: int = 0
    reviews: list[ScrapedReview] = []
    error_message: str | None = None


class TopicCount(BaseModel):
    topic: str
    count: int


class AnalysisSummary(BaseModel):
    positive_pct: float
    neutral_pct: float
    negative_pct: float
    top_themes: list[str]
    top_complaints: list[TopicCount]
    summary_text: str | None = None


class ScrapingResponse(BaseModel):
    brand_name: str
    scraped_at: str
    platforms: list[PlatformResult]
    total_reviews: int
    analysis: AnalysisSummary | None = None


class CompanyOption(BaseModel):
    id: int
    name: str
