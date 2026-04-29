from sqlalchemy.orm import Session

from app.db.models.capability_maturity_rubric import CapabilityMaturityRubric
from app.db.models.capability_recommendation import CapabilityRecommendation
from app.db.models.assessment_score import AssessmentScore
from app.db.models.axis import Axis
from app.db.models.capability import Capability


class CapabilityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_axis_progress(self, assessment_id: int) -> dict[str, tuple[int, int]]:
        rows = (
            self.db.query(Axis.name, AssessmentScore.confidence)
            .join(Capability, Capability.axis_id == Axis.id)
            .join(
                AssessmentScore,
                (AssessmentScore.capability_id == Capability.id)
                & (AssessmentScore.assessment_id == assessment_id),
            )
            .all()
        )

        totals: dict[str, int] = {}
        covered: dict[str, int] = {}
        for axis_name, confidence in rows:
            totals[axis_name] = totals.get(axis_name, 0) + 1
            if confidence is not None:
                covered[axis_name] = covered.get(axis_name, 0) + 1

        return {a: (covered.get(a, 0), totals[a]) for a in totals}

    def list_for_axis(self, assessment_id: int, axis_name: str) -> list[dict]:
        rows = (
            self.db.query(
                Capability.id,
                Capability.name,
                Capability.question_guidelines,
                AssessmentScore.maturity_level_id,
                AssessmentScore.confidence,
            )
            .join(Axis, Axis.id == Capability.axis_id)
            .join(
                AssessmentScore,
                (AssessmentScore.capability_id == Capability.id)
                & (AssessmentScore.assessment_id == assessment_id),
            )
            .filter(Axis.name == axis_name)
            .all()
        )
        return [
            {
                "id": cid,
                "label": label,
                "question_guidelines": question_guidelines,
                "maturity_level_id": int(maturity_level_id) if maturity_level_id is not None else None,
                "covered": conf is not None,
                "confidence": float(conf or 0),
            }
            for (cid, label, question_guidelines, maturity_level_id, conf) in rows
        ]

    def mark_covered(
        self,
        assessment_id: int,
        covered_ids: list[int],
        confidence: float,
        maturity_level_by_id: dict[int, int] | None = None,
        rationale_by_id: dict[int, str] | None = None,
    ) -> None:
        if not covered_ids:
            return

        maturity_level_by_id = maturity_level_by_id or {}
        rationale_by_id = rationale_by_id or {}

        for capability_id in covered_ids:
            update = {
                "confidence": confidence,
                "justification": rationale_by_id.get(capability_id),
            }
            if capability_id in maturity_level_by_id:
                update["maturity_level_id"] = maturity_level_by_id[capability_id]
            self.db.query(AssessmentScore).filter_by(
                assessment_id=assessment_id, capability_id=capability_id
            ).update(update)

    def list_all_for_assessment(self, assessment_id: int, axis_name: str | None = None) -> list[dict]:
        q = (
            self.db.query(
                Capability.id,
                Axis.name,
                Capability.code,
                Capability.name,
                AssessmentScore.maturity_level_id,
                AssessmentScore.confidence,
                AssessmentScore.justification,
                AssessmentScore.created_at,
            )
            .join(Axis, Axis.id == Capability.axis_id)
            .join(
                AssessmentScore,
                (AssessmentScore.capability_id == Capability.id)
                & (AssessmentScore.assessment_id == assessment_id),
            )
        )
        if axis_name:
            q = q.filter(Axis.name == axis_name)

        rows = q.order_by(Axis.name.asc(), Capability.id.asc()).all()
        return [
            {
                "id": int(cid),
                "axis": str(axis),
                "code": str(code),
                "label": str(label),
                "maturity_level_id": int(maturity_level_id) if maturity_level_id is not None else None,
                "assessed": confidence is not None,
                "covered": confidence is not None,
                "confidence": float(confidence or 0),
                "evidence_text": None,
                "rationale": justification,
                "updated_at": updated_at,
            }
            for (cid, axis, code, label, maturity_level_id, confidence, justification, updated_at) in rows
        ]

    def get_rubrics_for_capabilities(self, capability_ids: list[int]) -> dict[int, list[dict]]:
        if not capability_ids:
            return {}
        rows = (
            self.db.query(
                CapabilityMaturityRubric.capability_id,
                CapabilityMaturityRubric.maturity_level_id,
                CapabilityMaturityRubric.description,
            )
            .filter(CapabilityMaturityRubric.capability_id.in_(capability_ids))
            .order_by(CapabilityMaturityRubric.capability_id.asc(), CapabilityMaturityRubric.maturity_level_id.asc())
            .all()
        )
        out: dict[int, list[dict]] = {}
        for capability_id, maturity_level_id, description in rows:
            out.setdefault(int(capability_id), []).append(
                {
                    "maturity_level_id": int(maturity_level_id),
                    "description": str(description),
                }
            )
        return out

    def get_recommendations_for_scores(self, assessment_id: int) -> list[dict]:
        rows = (
            self.db.query(
                Capability.id,
                Capability.code,
                Capability.name,
                Axis.name,
                AssessmentScore.maturity_level_id,
                AssessmentScore.confidence,
                AssessmentScore.justification,
                CapabilityRecommendation.recommendation_guideline,
                CapabilityRecommendation.priority_hint,
                CapabilityRecommendation.consultant_note,
                CapabilityRecommendation.evidence_to_cite,
                CapabilityRecommendation.initiative_suggestions,
                CapabilityRecommendation.business_impact,
                CapabilityRecommendation.tone_hint,
            )
            .join(Axis, Axis.id == Capability.axis_id)
            .join(
                AssessmentScore,
                (AssessmentScore.capability_id == Capability.id)
                & (AssessmentScore.assessment_id == assessment_id),
            )
            .outerjoin(
                CapabilityRecommendation,
                (CapabilityRecommendation.capability_id == Capability.id)
                & (CapabilityRecommendation.maturity_level_id == AssessmentScore.maturity_level_id),
            )
            .order_by(Axis.sort_order.asc(), Capability.sort_order.asc(), Capability.id.asc())
            .all()
        )
        return [
            {
                "capability_id": int(capability_id),
                "capability_code": str(capability_code),
                "capability_name": str(capability_name),
                "axis": str(axis_name),
                "maturity_level_id": int(maturity_level_id) if maturity_level_id is not None else None,
                "confidence": float(confidence) if confidence is not None else None,
                "justification": justification,
                "recommendation_guideline": recommendation_guideline,
                "priority_hint": priority_hint,
                "consultant_note": consultant_note,
                "evidence_to_cite": evidence_to_cite,
                "initiative_suggestions": initiative_suggestions,
                "business_impact": business_impact,
                "tone_hint": tone_hint,
            }
            for (
                capability_id,
                capability_code,
                capability_name,
                axis_name,
                maturity_level_id,
                confidence,
                justification,
                recommendation_guideline,
                priority_hint,
                consultant_note,
                evidence_to_cite,
                initiative_suggestions,
                business_impact,
                tone_hint,
            ) in rows
        ]
