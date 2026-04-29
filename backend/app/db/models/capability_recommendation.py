from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CapabilityRecommendation(Base):
    __tablename__ = "capability_recommendations"
    __table_args__ = (
        UniqueConstraint("capability_id", "maturity_level_id", name="capability_recommendations_capability_id_maturity_level_id_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    capability_id: Mapped[int] = mapped_column(ForeignKey("capabilities.id", ondelete="CASCADE"), nullable=False, index=True)
    maturity_level_id: Mapped[int] = mapped_column(
        ForeignKey("maturity_levels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recommendation_guideline: Mapped[str] = mapped_column(Text, nullable=False)
    priority_hint: Mapped[str | None] = mapped_column(String(40), nullable=True)
    consultant_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_to_cite: Mapped[str | None] = mapped_column(Text, nullable=True)
    initiative_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    tone_hint: Mapped[str | None] = mapped_column(String(40), nullable=True)

    capability = relationship("Capability")
    maturity_level = relationship("MaturityLevel")
