from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.domain.constants import axis_name_variants, normalize_axis_code
from app.db.models.assessment import Assessment
from app.db.models.assessment_score import AssessmentScore
from app.db.models.axis import Axis
from app.db.models.capability import Capability
from app.db.models.company import Company
from app.db.models.company_size import CompanySize
from app.db.models.maturity_level import MaturityLevel
from app.db.models.recommendation_output import RecommendationOutput
from app.db.models.sector import Sector
from app.schemas.admin_analytics import (
    AnalyticsFilterSet,
    AnalyticsOverviewCounts,
    AnalyticsOverviewResponse,
    AnalyticsWindow,
    MaturityByCapabilityItem,
    MaturityByCapabilityResponse,
    RecommendationThemeItem,
    RecommendationThemesResponse,
    SectorTrendItem,
    SectorTrendsResponse,
    TopSignalItem,
    TopSignalsResponse,
)


class AdminAnalyticsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def overview(
        self,
        from_date: date,
        to_date: date,
        sector_code: str | None,
        company_size_code: str | None,
        status: str | None,
    ) -> AnalyticsOverviewResponse:
        assessments_q = self.db.query(Assessment.id, Assessment.status).join(Company, Company.id == Assessment.company_id)
        assessments_q = self._apply_assessment_filters(
            query=assessments_q,
            from_date=from_date,
            to_date=to_date,
            status=status,
            sector_code=sector_code,
            company_size_code=company_size_code,
        )
        rows = assessments_q.all()
        total = len(rows)
        completed = sum(1 for r in rows if (r.status or "").lower() == "completed")
        active = sum(1 for r in rows if (r.status or "").lower() == "active")

        levels = self._level_map()
        by_label = {"Basic": 0, "Established": 0, "Advanced": 0}
        level_rows = (
            self.db.query(MaturityLevel.label, func.count(Assessment.id))
            .select_from(Assessment)
            .join(Company, Company.id == Assessment.company_id)
            .join(MaturityLevel, MaturityLevel.id == Assessment.overall_maturity_level_id, isouter=True)
        )
        level_rows = self._apply_assessment_filters(
            query=level_rows,
            from_date=from_date,
            to_date=to_date,
            status=status,
            sector_code=sector_code,
            company_size_code=company_size_code,
        ).group_by(MaturityLevel.label).all()
        for label, count in level_rows:
            if label in by_label:
                by_label[label] = int(count)

        axis_rows = (
            self.db.query(
                Axis.code,
                func.avg(MaturityLevel.level_number),
            )
            .select_from(AssessmentScore)
            .join(Assessment, Assessment.id == AssessmentScore.assessment_id)
            .join(Company, Company.id == Assessment.company_id)
            .join(Capability, Capability.id == AssessmentScore.capability_id)
            .join(Axis, Axis.id == Capability.axis_id)
            .join(MaturityLevel, MaturityLevel.id == AssessmentScore.maturity_level_id)
        )
        axis_rows = self._apply_assessment_filters(
            query=axis_rows,
            from_date=from_date,
            to_date=to_date,
            status=status,
            sector_code=sector_code,
            company_size_code=company_size_code,
        ).group_by(Axis.code).all()
        axis_avg: dict[str, float] = {}
        for axis_code, avg_level in axis_rows:
            score_pct = float(avg_level or 0.0) / 3.0 * 100.0
            axis_avg[normalize_axis_code(str(axis_code)) or str(axis_code).upper()] = round(score_pct, 2)

        return AnalyticsOverviewResponse(
            window=AnalyticsWindow(from_date=from_date, to_date=to_date),
            filters=AnalyticsFilterSet(sector_code=sector_code, company_size_code=company_size_code, status=status),
            counts=AnalyticsOverviewCounts(assessments=total, completed=completed, active=active),
            maturity_distribution=by_label,
            axis_avg_score_percent=axis_avg,
        )

    def maturity_by_capability(
        self,
        from_date: date,
        to_date: date,
        sector_code: str | None,
        company_size_code: str | None,
        axis: str | None,
    ) -> MaturityByCapabilityResponse:
        level_map = self._level_map()
        q = (
            self.db.query(
                Capability.code,
                Capability.name,
                Axis.code,
                func.count(AssessmentScore.id),
                func.sum(case((MaturityLevel.level_number == level_map["basic"], 1), else_=0)),
                func.sum(case((MaturityLevel.level_number == level_map["established"], 1), else_=0)),
                func.sum(case((MaturityLevel.level_number == level_map["advanced"], 1), else_=0)),
                func.avg(AssessmentScore.confidence),
            )
            .select_from(AssessmentScore)
            .join(Assessment, Assessment.id == AssessmentScore.assessment_id)
            .join(Company, Company.id == Assessment.company_id)
            .join(Capability, Capability.id == AssessmentScore.capability_id)
            .join(Axis, Axis.id == Capability.axis_id)
            .join(MaturityLevel, MaturityLevel.id == AssessmentScore.maturity_level_id)
        )
        q = self._apply_assessment_filters(
            query=q,
            from_date=from_date,
            to_date=to_date,
            status="completed",
            sector_code=sector_code,
            company_size_code=company_size_code,
        )
        if axis:
            q = q.filter(func.lower(Axis.code).in_(axis_name_variants(axis)))
        rows = q.group_by(Capability.code, Capability.name, Axis.code).order_by(Axis.sort_order.asc(), Capability.sort_order.asc()).all()
        items = [
            MaturityByCapabilityItem(
                capability_code=str(code),
                capability_name=str(name),
                axis=normalize_axis_code(str(axis_code)) or str(axis_code).upper(),
                n=int(n or 0),
                basic=int(basic or 0),
                established=int(established or 0),
                advanced=int(advanced or 0),
                avg_confidence=round(float(avg_conf), 3) if avg_conf is not None else None,
            )
            for code, name, axis_code, n, basic, established, advanced, avg_conf in rows
        ]
        return MaturityByCapabilityResponse(items=items)

    def top_signals(
        self,
        from_date: date,
        to_date: date,
        sector_code: str | None,
        company_size_code: str | None,
        limit: int,
        signal: str,
    ) -> TopSignalsResponse:
        level_map = self._level_map()
        level_number = level_map["basic"] if signal == "pain" else level_map["advanced"]
        total_signal_q = (
            self.db.query(func.count(AssessmentScore.id))
            .select_from(AssessmentScore)
            .join(Assessment, Assessment.id == AssessmentScore.assessment_id)
            .join(Company, Company.id == Assessment.company_id)
        )
        total_signal_count = self._apply_assessment_filters(
            query=total_signal_q,
            from_date=from_date,
            to_date=to_date,
            status="completed",
            sector_code=sector_code,
            company_size_code=company_size_code,
        ).join(MaturityLevel, MaturityLevel.id == AssessmentScore.maturity_level_id).filter(
            MaturityLevel.level_number == level_number
        ).scalar() or 0

        rows = (
            self.db.query(
                Capability.code,
                Capability.name,
                Axis.code,
                func.count(AssessmentScore.id),
            )
            .select_from(AssessmentScore)
            .join(Assessment, Assessment.id == AssessmentScore.assessment_id)
            .join(Company, Company.id == Assessment.company_id)
            .join(Capability, Capability.id == AssessmentScore.capability_id)
            .join(Axis, Axis.id == Capability.axis_id)
            .join(MaturityLevel, MaturityLevel.id == AssessmentScore.maturity_level_id)
        )
        rows = self._apply_assessment_filters(
            query=rows,
            from_date=from_date,
            to_date=to_date,
            status="completed",
            sector_code=sector_code,
            company_size_code=company_size_code,
        ).filter(MaturityLevel.level_number == level_number).group_by(Capability.code, Capability.name, Axis.code).order_by(func.count(AssessmentScore.id).desc()).limit(limit).all()
        items: list[TopSignalItem] = []
        denom = max(int(total_signal_count), 1)
        for code, name, axis_code, cnt in rows:
            count_value = int(cnt or 0)
            items.append(
                TopSignalItem(
                    capability_code=str(code),
                    capability_name=str(name),
                    axis=normalize_axis_code(str(axis_code)) or str(axis_code).upper(),
                    count=count_value,
                    share_percent=round((count_value / denom) * 100.0, 2),
                )
            )
        return TopSignalsResponse(items=items)

    def recommendation_themes(
        self,
        from_date: date,
        to_date: date,
        sector_code: str | None,
        company_size_code: str | None,
        axis: str | None,
        limit: int,
    ) -> RecommendationThemesResponse:
        q = (
            self.db.query(
                RecommendationOutput.priority,
                func.count(RecommendationOutput.id),
            )
            .select_from(RecommendationOutput)
            .join(Assessment, Assessment.id == RecommendationOutput.assessment_id)
            .join(Company, Company.id == Assessment.company_id)
            .join(Capability, Capability.id == RecommendationOutput.capability_id, isouter=True)
            .join(Axis, Axis.id == Capability.axis_id, isouter=True)
        )
        q = self._apply_assessment_filters(
            query=q,
            from_date=from_date,
            to_date=to_date,
            status="completed",
            sector_code=sector_code,
            company_size_code=company_size_code,
        )
        if axis:
            q = q.filter(func.lower(Axis.code).in_(axis_name_variants(axis)))
        rows = (
            q.group_by(RecommendationOutput.priority)
            .order_by(func.count(RecommendationOutput.id).desc())
            .limit(limit)
            .all()
        )
        items = [
            RecommendationThemeItem(theme=str(theme or "unclassified"), count=int(cnt or 0))
            for theme, cnt in rows
        ]
        return RecommendationThemesResponse(items=items)

    def sector_trends(
        self,
        from_date: date,
        to_date: date,
        sector_code: str,
        group_by: str,
    ) -> SectorTrendsResponse:
        period_expr = func.date_trunc("month" if group_by == "month" else "quarter", Assessment.created_at)

        rows = (
            self.db.query(
                period_expr.label("period_start"),
                func.count(func.distinct(Assessment.id)).label("assessments"),
                func.avg(MaturityLevel.level_number).label("avg_level"),
                func.sum(case((MaturityLevel.level_number == 1, 1), else_=0)).label("basic"),
                func.sum(case((MaturityLevel.level_number == 2, 1), else_=0)).label("established"),
                func.sum(case((MaturityLevel.level_number == 3, 1), else_=0)).label("advanced"),
            )
            .select_from(Assessment)
            .join(Company, Company.id == Assessment.company_id)
            .join(AssessmentScore, AssessmentScore.assessment_id == Assessment.id)
            .join(MaturityLevel, MaturityLevel.id == AssessmentScore.maturity_level_id)
        )
        rows = self._apply_assessment_filters(
            query=rows,
            from_date=from_date,
            to_date=to_date,
            status="completed",
            sector_code=sector_code,
            company_size_code=None,
        ).group_by(period_expr).order_by(period_expr.asc()).all()

        series: list[SectorTrendItem] = []
        for period_start, assessments, avg_level, basic, established, advanced in rows:
            period_dt = period_start if isinstance(period_start, datetime) else datetime.combine(from_date, time.min)
            if group_by == "quarter":
                quarter = ((period_dt.month - 1) // 3) + 1
                period_label = f"{period_dt.year}-Q{quarter}"
            else:
                period_label = period_dt.strftime("%Y-%m")
            series.append(
                SectorTrendItem(
                    period=period_label,
                    assessments=int(assessments or 0),
                    overall_avg_score=round((float(avg_level or 0.0) / 3.0) * 100.0, 2),
                    basic=int(basic or 0),
                    established=int(established or 0),
                    advanced=int(advanced or 0),
                )
            )
        return SectorTrendsResponse(sector_code=sector_code, series=series)

    def _apply_assessment_filters(
        self,
        query,
        from_date: date,
        to_date: date,
        status: str | None,
        sector_code: str | None,
        company_size_code: str | None,
    ):
        query = query.filter(
            Assessment.created_at >= datetime.combine(from_date, time.min),
            Assessment.created_at <= datetime.combine(to_date, time.max),
        )
        if status:
            query = query.filter(func.lower(Assessment.status) == status.lower())
        if sector_code:
            query = query.join(Sector, Sector.id == Company.sector_id).filter(func.lower(Sector.code) == sector_code.lower())
        if company_size_code:
            query = query.join(CompanySize, CompanySize.id == Company.size_id).filter(
                func.lower(CompanySize.code) == company_size_code.lower()
            )
        return query

    def _level_map(self) -> dict[str, int]:
        rows = self.db.query(MaturityLevel.level_number, MaturityLevel.label).all()
        mapping = {str(label).strip().lower(): int(level_number) for level_number, label in rows}
        return {
            "basic": mapping.get("basic", 1),
            "established": mapping.get("established", 2),
            "advanced": mapping.get("advanced", 3),
        }
