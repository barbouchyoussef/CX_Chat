from sqlalchemy.orm import Session

from app.domain.constants import ASSESSMENT_STATUS_COMPLETED, ASSESSMENT_STATUS_IN_PROGRESS, AXES_ORDER
from app.domain.errors import AssessmentStateConflictError
from app.core.text_normalization import normalize_text
from app.db.models.axis import Axis
from app.db.models.maturity_level import MaturityLevel
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment_idempotency_repository import AssessmentIdempotencyRepository
from app.repositories.capability_repository import CapabilityRepository
from app.repositories.company_repository import CompanyRepository
from app.repositories.company_size_repository import CompanySizeRepository
from app.repositories.sector_repository import SectorRepository
from app.schemas.assessment import (
    AnswerResponse,
    AssessmentResponse,
    AxisProgress,
    CompanyInfo,
    NextQuestionResponse,
)
from app.schemas.admin import AssessmentListItem, AssessmentsListResponse
from app.schemas.capability_status import CapabilitiesStatusResponse, CapabilityStatusItem
from app.schemas.assessment_memory import AssessmentMemoryResponse, AxisMemoryItem
from app.schemas.conversation import MessageItem, MessagesResponse
from app.schemas.final_report import (
    FinalReportAxisItem,
    FinalReportBenchmarkItem,
    FinalReportCapabilityItem,
    FinalReportResponse,
    FinalReportSummary,
    FinalReportThemeItem,
)
from app.schemas.recommendations import (
    BatchRecommendationGenerateResponse,
    BatchRecommendationResult,
    AssessmentRecommendationItem,
    AssessmentRecommendationsResponse,
    AssessmentTraceItem,
    AssessmentTraceResponse,
    RecommendationOutputItem,
    RecommendationOutputsResponse,
)
from app.services.llm_service import ChatTurn, LLMService
from app.services.benchmark_service import BenchmarkQueryContext, BenchmarkService


class AssessmentService:
    DEFAULT_CONFIDENCE_IF_COVERED = 0.7
    DEFAULT_CONFIDENCE_IF_NOT_COVERED = 0.0
    MIN_CONFIDENCE_TO_SCORE = 0.7
    MAX_CAPABILITIES_PER_ANSWER = 1
    MAX_QUESTIONS_PER_AXIS = 4
    MAX_EXTRA_QUESTIONS_PER_AXIS = 1

    def __init__(self, db: Session) -> None:
        self.db = db
        self.sectors = SectorRepository(db)
        self.sizes = CompanySizeRepository(db)
        self.companies = CompanyRepository(db)
        self.assessments = AssessmentRepository(db)
        self.capabilities = CapabilityRepository(db)
        self.answers = AssessmentAnswerRepository(db)
        self.idempotency = AssessmentIdempotencyRepository(db)
        self.llm = LLMService()
        self.benchmarks = BenchmarkService()

    def start_assessment(self, company_name: str, sector_label: str | None, company_size_label: str | None):
        try:
            sector, size = self._resolve_company_profile(
                company_name=company_name,
                sector_code=sector_label,
                company_size_code=company_size_label,
            )
            company = self.companies.create(name=company_name, sector_id=sector.id, size_id=size.id)
            first_axis = self._get_first_axis()

            assessment = self.assessments.create(
                company_id=company.id,
                status=ASSESSMENT_STATUS_IN_PROGRESS,
                current_axis_id=first_axis.id if first_axis is not None else None,
            )
            self.assessments.initialize_scores(assessment.id)
            self.db.commit()
            return assessment
        except Exception:
            self.db.rollback()
            raise

    def get_assessment(self, assessment_id: int) -> AssessmentResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        progress_map = self.capabilities.get_axis_progress(assessment_id)
        progress = [AxisProgress(axis=a, covered=c, total=t) for a, (c, t) in progress_map.items()]

        company = assessment.company
        sector_label = getattr(company.sector, "name", "Unknown")
        size_label = getattr(company.company_size, "name", "Unknown")
        current_axis_name = assessment.current_axis.name if assessment.current_axis is not None else None

        return AssessmentResponse(
            id=assessment.id,
            status=assessment.status,
            current_axis=current_axis_name,
            state_version=int(assessment.state_version),
            overall_maturity_band=assessment.overall_maturity_band,
            company=CompanyInfo(id=company.id, name=company.name, sector=sector_label, size=size_label),
            progress=progress,
        )

    def next_question(self, assessment_id: int) -> NextQuestionResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        status_response = self._ensure_assessment_still_active(assessment_id, assessment)
        if status_response is not None:
            return status_response

        axis = self._current_axis_name(assessment)
        axis_capabilities = self.capabilities.list_for_axis(assessment_id, axis)
        missing = [c["label"] for c in axis_capabilities if not c["covered"]]
        primary_missing_topic = missing[0] if missing else axis
        history = self._build_chat_history(assessment_id)
        if assessment.pending_followup_hint:
            latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), "")
            focus_topic = ", ".join(missing[:2]) if missing else primary_missing_topic
            question = self.llm.generate_clarification_question(
                axis=axis,
                latest_user_answer=latest_user_answer,
                hint=assessment.pending_followup_hint,
                missing_topic=focus_topic,
                history=history,
            )
            assessment.pending_followup_hint = None
            assessment.pending_question = question
            assessment.conversation_stage = "diagnostic"
            self.db.commit()
            return NextQuestionResponse(status=assessment.status, axis=axis, question=question)
        question_guidelines = [str(c.get("question_guidelines") or "").strip() for c in axis_capabilities]
        question_guidelines = [q for q in question_guidelines if q]
        latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), None)
        sector_label = getattr(assessment.company.sector, "name", "Unknown")
        ask_evidence = int(assessment.current_axis_question_count or 0) >= 2 or int(assessment.current_axis_low_quality_count or 0) > 0
        helper_mode = assessment.pending_followup_hint == "needs explanation"
        if int(assessment.current_axis_question_count or 0) <= 1:
            assessment.conversation_stage = "intro"
        elif int(assessment.current_axis_question_count or 0) <= 3:
            assessment.conversation_stage = "diagnostic"
        else:
            assessment.conversation_stage = "deep_dive"
        question = self.llm.generate_question(
            axis=axis,
            missing=missing,
            history=history,
            sector=sector_label,
            latest_user_answer=latest_user_answer,
            transition_topic=primary_missing_topic,
            memory_summary=None,
            question_guidelines=question_guidelines,
            conversation_stage=assessment.conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
        )
        assessment.pending_question = question
        assessment.pending_followup_hint = None
        self.db.commit()
        return NextQuestionResponse(status=assessment.status, axis=axis, question=question)

    def submit_answer(
        self,
        assessment_id: int,
        answer: str,
        idempotency_key: str | None = None,
        expected_axis: str | None = None,
        expected_version: int | None = None,
    ) -> AnswerResponse | None:
        try:
            if idempotency_key:
                cached = self.idempotency.get(assessment_id=assessment_id, idempotency_key=idempotency_key)
                if cached is not None:
                    return AnswerResponse(**cached.response_payload)

            assessment = self.assessments.get_by_id_for_update(assessment_id)
            if assessment is None:
                return None

            self._assert_expected_state(
                assessment=assessment,
                expected_axis=expected_axis,
                expected_version=expected_version,
            )

            if idempotency_key:
                cached = self.idempotency.get(assessment_id=assessment_id, idempotency_key=idempotency_key)
                if cached is not None:
                    return AnswerResponse(**cached.response_payload)

            status_response = self._ensure_assessment_still_active(assessment_id, assessment)
            if status_response is not None:
                response = AnswerResponse(status=assessment.status, axis=None, covered=[], confidence=None)
                if idempotency_key:
                    self.idempotency.create(
                        assessment_id=assessment_id,
                        idempotency_key=idempotency_key,
                        response_payload=response.model_dump(),
                    )
                    self.db.commit()
                return response

            axis = self._current_axis_name(assessment)
            axis_capabilities = self.capabilities.list_for_axis(assessment_id, axis)
            capability_ids = [int(c["id"]) for c in axis_capabilities if "id" in c]
            rubrics_by_capability = self.capabilities.get_rubrics_for_capabilities(capability_ids)
            if self.llm.is_confusion_signal(answer):
                self._persist_answer(
                    assessment_id=assessment_id,
                    answer=answer,
                    covered_ids=[],
                    axis_capabilities=axis_capabilities,
                    question_text=(assessment.pending_question or "").strip() or None,
                )
                assessment.pending_question = None
                assessment.pending_followup_hint = "needs explanation"
                assessment.clarification_count = int(assessment.clarification_count or 0) + 1
                assessment.state_version = int(assessment.state_version) + 1
                response = AnswerResponse(
                    status=assessment.status,
                    axis=assessment.current_axis.name if assessment.current_axis is not None else None,
                    covered=[],
                    confidence=0.0,
                )
                if idempotency_key:
                    self.idempotency.create(
                        assessment_id=assessment_id,
                        idempotency_key=idempotency_key,
                        response_payload=response.model_dump(),
                    )
                self.db.commit()
                return response
            is_quality_ok, quality_hint = self.llm.assess_answer_quality(answer)
            if not is_quality_ok:
                self._persist_answer(
                    assessment_id=assessment_id,
                    answer=answer,
                    covered_ids=[],
                    axis_capabilities=axis_capabilities,
                    question_text=(assessment.pending_question or "").strip() or None,
                )
                assessment.pending_question = None
                assessment.pending_followup_hint = quality_hint
                assessment.current_axis_question_count = int(assessment.current_axis_question_count) + 1
                assessment.current_axis_low_quality_count = min(
                    int(assessment.current_axis_low_quality_count) + 1,
                    self.MAX_EXTRA_QUESTIONS_PER_AXIS,
                )
                self._advance_if_axis_complete(assessment_id, assessment)
                assessment.state_version = int(assessment.state_version) + 1
                response = AnswerResponse(
                    status=assessment.status,
                    axis=assessment.current_axis.name if assessment.current_axis is not None else None,
                    covered=[],
                    confidence=0.0,
                )
                if idempotency_key:
                    self.idempotency.create(
                        assessment_id=assessment_id,
                        idempotency_key=idempotency_key,
                        response_payload=response.model_dump(),
                    )
                self.db.commit()
                return response
            coverage = self.llm.detect_coverage(
                answer=answer,
                criteria=axis_capabilities,
                rubrics_by_capability=rubrics_by_capability,
            )

            covered_ids = coverage.get("covered") or []
            covered_ids = self._apply_followup_gating(
                covered_ids=covered_ids,
                confidence_by_id=coverage.get("confidence_by_id") or {},
                evidence_by_id=coverage.get("evidence_by_id") or {},
                rationale_by_id=coverage.get("rationale_by_id") or {},
            )
            confidence = self._resolve_confidence(covered_ids=covered_ids, confidence=coverage.get("confidence"))
            self._persist_scoring(
                assessment_id=assessment_id,
                covered_ids=covered_ids,
                confidence=confidence,
                maturity_level_by_id=coverage.get("maturity_level_by_id") or {},
                rationale_by_id=coverage.get("rationale_by_id") or {},
            )
            self._persist_insights(
                assessment_id=assessment_id,
                covered_ids=covered_ids,
                maturity_level_by_id=coverage.get("maturity_level_by_id") or {},
                confidence=confidence,
                rationale_by_id=coverage.get("rationale_by_id") or {},
                evidence_by_id=coverage.get("evidence_by_id") or {},
            )
            self._persist_answer(
                assessment_id=assessment_id,
                answer=answer,
                covered_ids=covered_ids,
                axis_capabilities=axis_capabilities,
                question_text=(assessment.pending_question or "").strip() or None,
            )
            assessment.pending_question = None
            assessment.pending_followup_hint = None
            assessment.clarification_count = 0
            assessment.current_axis_question_count = int(assessment.current_axis_question_count) + 1
            self._advance_if_axis_complete(assessment_id, assessment)
            if assessment.status == ASSESSMENT_STATUS_COMPLETED:
                self._finalize_completed_assessment(assessment_id=assessment_id, assessment=assessment)
            assessment.state_version = int(assessment.state_version) + 1
            response = AnswerResponse(
                status=assessment.status,
                axis=assessment.current_axis.name if assessment.current_axis is not None else None,
                covered=covered_ids,
                confidence=float(confidence),
            )
            if idempotency_key:
                self.idempotency.create(
                    assessment_id=assessment_id,
                    idempotency_key=idempotency_key,
                    response_payload=response.model_dump(),
                )
            self.db.commit()
            return response
        except Exception:
            self.db.rollback()
            raise

    def get_memory(self, assessment_id: int) -> AssessmentMemoryResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        items: list[AxisMemoryItem] = []
        return AssessmentMemoryResponse(assessment_id=assessment_id, items=items)

    def list_assessments(self, limit: int = 50, offset: int = 0) -> AssessmentsListResponse:
        rows = self.assessments.list_assessments(limit=limit, offset=offset)
        items: list[AssessmentListItem] = []
        for a in rows:
            c = a.company
            items.append(
                AssessmentListItem(
                    id=a.id,
                    status=a.status,
                    current_axis=a.current_axis.name if a.current_axis is not None else None,
                    company_name=c.name,
                    sector=getattr(c.sector, "name", ""),
                    size=getattr(c.company_size, "name", ""),
                    created_at=a.created_at,
                    updated_at=a.updated_at,
                )
            )
        return AssessmentsListResponse(items=items, limit=limit, offset=offset)

    def get_messages(self, assessment_id: int, limit: int = 200, offset: int = 0) -> MessagesResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.answers.list_for_assessment(assessment_id, limit=limit, offset=offset)
        items: list[MessageItem] = []
        for m in rows:
            items.append(
                MessageItem(
                    id=(m.id * 2) - 1,
                    role="assistant",
                    axis=None,
                    content=m.question,
                    created_at=m.created_at,
                )
            )
            items.append(
                MessageItem(
                    id=(m.id * 2),
                    role="user",
                    axis=None,
                    content=m.answer,
                    created_at=m.created_at,
                )
            )
        return MessagesResponse(assessment_id=assessment_id, items=items)

    def get_capabilities_status(self, assessment_id: int, axis: str | None = None) -> CapabilitiesStatusResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.capabilities.list_all_for_assessment(assessment_id, axis_name=axis)
        items = [CapabilityStatusItem(**r) for r in rows]
        return CapabilitiesStatusResponse(assessment_id=assessment_id, axis=axis, items=items)

    def get_recommendations(self, assessment_id: int) -> AssessmentRecommendationsResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        persisted_outputs = self.assessments.list_recommendation_outputs(assessment_id=assessment_id)
        persisted_by_capability = {int(item.capability_id): item for item in persisted_outputs if item.capability_id is not None}
        maturity_label_by_id = {
            int(m.id): str(m.label)
            for m in self.db.query(MaturityLevel).all()
        }
        items: list[AssessmentRecommendationItem] = []
        for row in rows:
            persisted = persisted_by_capability.get(int(row["capability_id"]))
            if persisted is not None:
                recommendation_text = normalize_text(persisted.generated_text)
            else:
                maturity_label = maturity_label_by_id.get(int(row["maturity_level_id"])) if row.get("maturity_level_id") else "Unknown"
                recommendation_text = self.llm.generate_recommendation(
                    axis=str(row.get("axis") or ""),
                    capability=str(row.get("capability_name") or ""),
                    maturity_label=maturity_label,
                    confidence=row.get("confidence"),
                    justification=row.get("justification"),
                    recommendation_guideline=row.get("recommendation_guideline"),
                    priority_hint=row.get("priority_hint"),
                    consultant_note=row.get("consultant_note"),
                    evidence_to_cite=row.get("evidence_to_cite"),
                    initiative_suggestions=row.get("initiative_suggestions"),
                    business_impact=row.get("business_impact"),
                    tone_hint=row.get("tone_hint"),
                )
            row["recommendation_text"] = normalize_text(recommendation_text)
            items.append(AssessmentRecommendationItem(**row))
        return AssessmentRecommendationsResponse(assessment_id=assessment_id, items=items)

    def generate_recommendations_batch(
        self,
        assessment_id: int,
        language: str = "en",
        max_actions_per_capability: int = 2,
        tone: str = "practical",
        max_words_per_capability: int = 120,
    ) -> BatchRecommendationGenerateResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        maturity_rows = self.db.query(MaturityLevel).all()
        maturity_label_by_id = {int(m.id): str(m.label) for m in maturity_rows}

        llm_items: list[dict] = []
        for row in rows:
            capability_id = int(row["capability_id"])
            confidence = row.get("confidence")
            evidence_list = []
            if row.get("justification"):
                evidence_list.append(str(row.get("justification")))
            if row.get("evidence_to_cite"):
                evidence_list.append(str(row.get("evidence_to_cite")))
            evidence_quality = "weak"
            if len(evidence_list) >= 2 and all(len(e.strip()) >= 40 for e in evidence_list):
                evidence_quality = "strong"
            elif len(evidence_list) >= 1 and any(len(e.strip()) >= 30 for e in evidence_list):
                evidence_quality = "medium"
            llm_items.append(
                {
                    "capability_id": capability_id,
                    "axis": str(row.get("axis") or ""),
                    "capability_name": str(row.get("capability_name") or ""),
                    "maturity_level": maturity_label_by_id.get(int(row["maturity_level_id"])) if row.get("maturity_level_id") else "Unknown",
                    "confidence": float(confidence) if confidence is not None else None,
                    "evidence": evidence_list[:2],
                    "insight_summary": str(row.get("justification") or ""),
                    "admin_guideline": str(row.get("recommendation_guideline") or ""),
                    "priority_hint": str(row.get("priority_hint") or ""),
                    "evidence_quality": evidence_quality,
                }
            )

        pre_gated: dict[int, BatchRecommendationResult] = {}
        llm_candidates: list[dict] = []
        for item in llm_items:
            capability_id = int(item["capability_id"])
            confidence = item.get("confidence")
            evidence = item.get("evidence") or []
            evidence_quality = str(item.get("evidence_quality") or "weak")
            if confidence is None or float(confidence) < 0.80 or not evidence or evidence_quality == "weak":
                pre_gated[capability_id] = BatchRecommendationResult(
                    capability_id=capability_id,
                    status="needs_clarification",
                    recommendation_text=None,
                    clarification_question="Could you share one recent concrete example with owner, action, and measurable outcome?",
                    evidence_used=evidence[:2],
                )
                continue
            llm_candidates.append(item)

        generated = self.llm.generate_recommendations_batch(
            assessment_id=assessment_id,
            items=llm_candidates,
            language=language,
            max_actions_per_capability=max_actions_per_capability,
            tone=tone,
            max_words_per_capability=max_words_per_capability,
        )

        results: list[BatchRecommendationResult] = []
        output_rows: list[dict] = []
        for row in llm_items:
            capability_id = int(row["capability_id"])
            if capability_id in pre_gated:
                results.append(pre_gated[capability_id])
                continue
            ai = generated.get(capability_id)
            if ai:
                if ai.get("status") == "ok":
                    recommendation_text = normalize_text(
                        " ".join(
                            p
                            for p in [
                                ai.get("title"),
                                ai.get("why_this"),
                                ai.get("primary_action"),
                                ai.get("secondary_action"),
                                ai.get("expected_impact"),
                            ]
                            if p
                        )
                    )
                    output_rows.append(
                        {
                            "capability_id": capability_id,
                            "maturity_level_id": next((r.get("maturity_level_id") for r in rows if int(r["capability_id"]) == capability_id), None),
                            "generated_text": recommendation_text,
                            "priority": row.get("priority_hint"),
                        }
                    )
                    results.append(
                        BatchRecommendationResult(
                            capability_id=capability_id,
                            status="ok",
                            recommendation_text=recommendation_text,
                            clarification_question=None,
                            evidence_used=ai.get("evidence_used") or [],
                        )
                    )
                else:
                    results.append(
                        BatchRecommendationResult(
                            capability_id=capability_id,
                            status="needs_clarification",
                            recommendation_text=None,
                            clarification_question=ai.get("clarification_question") or "Can you share one concrete recent example?",
                            evidence_used=ai.get("evidence_used") or [],
                        )
                    )
            else:
                fallback = self.llm.generate_recommendation(
                    axis=str(row.get("axis") or ""),
                    capability=str(row.get("capability_name") or ""),
                    maturity_label=str(row.get("maturity_level") or "Unknown"),
                    confidence=row.get("confidence"),
                    justification=row.get("insight_summary"),
                    recommendation_guideline=row.get("admin_guideline"),
                    priority_hint=row.get("priority_hint"),
                    consultant_note=None,
                    evidence_to_cite=(row.get("evidence") or [None])[0],
                    initiative_suggestions=None,
                    business_impact=None,
                    tone_hint=tone,
                )
                fallback = normalize_text(fallback)
                output_rows.append(
                    {
                        "capability_id": capability_id,
                        "maturity_level_id": next((r.get("maturity_level_id") for r in rows if int(r["capability_id"]) == capability_id), None),
                        "generated_text": fallback,
                        "priority": row.get("priority_hint"),
                    }
                )
                results.append(
                    BatchRecommendationResult(
                        capability_id=capability_id,
                        status="ok",
                        recommendation_text=fallback,
                        clarification_question=None,
                        evidence_used=[],
                    )
                )

        self.assessments.replace_recommendation_outputs(assessment_id=assessment_id, items=output_rows)
        ok_count = sum(1 for r in results if r.status == "ok")
        clarification_count = sum(1 for r in results if r.status == "needs_clarification")
        return BatchRecommendationGenerateResponse(
            assessment_id=assessment_id,
            status="ok",
            results=results,
            ok_count=ok_count,
            clarification_count=clarification_count,
        )

    def get_trace(self, assessment_id: int, limit: int = 500, offset: int = 0) -> AssessmentTraceResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.answers.list_trace(assessment_id=assessment_id, limit=limit, offset=offset)
        items = [AssessmentTraceItem(**row) for row in rows]
        return AssessmentTraceResponse(assessment_id=assessment_id, items=items)

    def get_recommendation_outputs(self, assessment_id: int) -> RecommendationOutputsResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        rows = self.assessments.list_recommendation_outputs(assessment_id=assessment_id)
        items = [
            RecommendationOutputItem(
                id=int(row.id),
                capability_id=int(row.capability_id) if row.capability_id is not None else None,
                maturity_level_id=int(row.maturity_level_id) if row.maturity_level_id is not None else None,
                generated_text=str(row.generated_text),
                priority=row.priority,
                created_at=row.created_at,
            )
            for row in rows
        ]
        return RecommendationOutputsResponse(assessment_id=assessment_id, items=items)

    def get_final_report(self, assessment_id: int) -> FinalReportResponse | None:
        assessment = self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        capability_rows = self.capabilities.list_all_for_assessment(assessment_id=assessment_id)
        recommendation_rows = self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        rec_by_capability = {int(row["capability_id"]): row for row in recommendation_rows}

        axis_groups: dict[str, list[dict]] = {}
        for row in capability_rows:
            axis_groups.setdefault(str(row["axis"]), []).append(row)

        def _band_from_level(level: int | None) -> str:
            if level == 1:
                return "Basic"
            if level == 2:
                return "Established"
            if level == 3:
                return "Advanced"
            return "Not scored"

        axes: list[FinalReportAxisItem] = []
        for axis_name, rows in axis_groups.items():
            if not rows:
                continue
            avg = sum((int(r.get("maturity_level_id") or 0) for r in rows)) / len(rows)
            score = max(0.0, min((avg / 3.0) * 100.0, 100.0))
            level = int(round(avg)) if avg > 0 else None
            axes.append(
                FinalReportAxisItem(
                    axis=axis_name,
                    score_percent=round(score, 2),
                    maturity_band=_band_from_level(level),
                )
            )

        if axes:
            strongest = max(axes, key=lambda a: a.score_percent)
            priority = min(axes, key=lambda a: a.score_percent)
            overall_score = round(sum(a.score_percent for a in axes) / len(axes), 2)
        else:
            strongest = FinalReportAxisItem(axis="N/A", score_percent=0.0, maturity_band="Not scored")
            priority = strongest
            overall_score = 0.0

        if overall_score < 40:
            overall_band = "Basic"
        elif overall_score < 75:
            overall_band = "Established"
        else:
            overall_band = "Advanced"

        capabilities: list[FinalReportCapabilityItem] = []
        for row in capability_rows:
            capability_id = int(row["id"])
            rec = rec_by_capability.get(capability_id, {})
            capabilities.append(
                FinalReportCapabilityItem(
                    axis=str(row["axis"]),
                    capability=str(row["label"]),
                    maturity_band=_band_from_level(row.get("maturity_level_id")),
                    confidence=row.get("confidence"),
                    rationale=row.get("rationale"),
                    recommendation=rec.get("recommendation_text") or rec.get("recommendation_guideline"),
                    priority=rec.get("priority_hint"),
                )
            )

        strengths_candidates = [c for c in capabilities if c.maturity_band == "Advanced"]
        pain_candidates = [c for c in capabilities if c.maturity_band == "Basic"]

        strengths = [
            FinalReportThemeItem(
                axis=item.axis,
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                recommendation=item.recommendation,
                priority=item.priority,
            )
            for item in strengths_candidates[:3]
        ]
        pain_points = [
            FinalReportThemeItem(
                axis=item.axis,
                capability=item.capability,
                maturity_band=item.maturity_band,
                rationale=item.rationale,
                recommendation=item.recommendation,
                priority=item.priority,
            )
            for item in pain_candidates[:3]
        ]

        summary = FinalReportSummary(
            overall_score_percent=overall_score,
            overall_maturity_band=overall_band,
            strongest_axis=strongest.axis,
            strongest_axis_score_percent=strongest.score_percent,
            priority_axis=priority.axis,
            priority_axis_score_percent=priority.score_percent,
            strengths_count=len(strengths_candidates),
            pain_points_count=len(pain_candidates),
        )

        benchmark_context = BenchmarkQueryContext(
            sector=getattr(assessment.company.sector, "name", "Unknown"),
            company_size=getattr(assessment.company.company_size, "name", "Unknown"),
            priority_axis=priority.axis,
            pain_points=[item.capability for item in pain_points],
        )
        benchmark_rows = self.benchmarks.get_contextual_benchmarks(benchmark_context)
        benchmarks = [FinalReportBenchmarkItem(**row) for row in benchmark_rows]

        return FinalReportResponse(
            assessment_id=assessment_id,
            summary=summary,
            axes=axes,
            strengths=strengths,
            pain_points=pain_points,
            capabilities=capabilities,
            benchmarks=benchmarks,
        )

    def _advance_if_axis_complete(self, assessment_id: int, assessment) -> None:
        if assessment.status != ASSESSMENT_STATUS_IN_PROGRESS:
            return

        axis = self._current_axis_name(assessment)
        axis_criteria = self.capabilities.list_for_axis(assessment_id, axis)
        axis_completed_by_score = bool(axis_criteria and all(c["covered"] for c in axis_criteria))
        adaptive_cap = self.MAX_QUESTIONS_PER_AXIS + min(
            int(assessment.current_axis_low_quality_count or 0),
            self.MAX_EXTRA_QUESTIONS_PER_AXIS,
        )
        axis_completed_by_limit = int(assessment.current_axis_question_count or 0) >= adaptive_cap
        if axis_completed_by_score or axis_completed_by_limit:
            ordered_axes = (
                self.db.query(Axis)
                .order_by(Axis.sort_order.asc())
                .all()
            )
            names = [a.name for a in ordered_axes]
            try:
                idx = names.index(axis)
            except ValueError:
                idx = -1
            next_axis = ordered_axes[idx + 1] if idx + 1 < len(ordered_axes) else None
            if next_axis is None:
                assessment.status = ASSESSMENT_STATUS_COMPLETED
                assessment.current_axis_id = None
                assessment.current_axis_question_count = 0
                assessment.current_axis_low_quality_count = 0
                assessment.conversation_stage = "completed"
            else:
                assessment.current_axis_id = next_axis.id
                assessment.current_axis_question_count = 0
                assessment.current_axis_low_quality_count = 0
                assessment.conversation_stage = "intro"

    def _get_first_axis(self) -> Axis | None:
        return (
            self.db.query(Axis)
            .order_by(Axis.sort_order.asc())
            .limit(1)
            .one_or_none()
        )

    def _resolve_company_profile(self, company_name: str, sector_code: str | None, company_size_code: str | None):
        if sector_code and company_size_code:
            sector = self.sectors.get_by_code(sector_code)
            size = self.sizes.get_by_code(company_size_code)
            if sector is None:
                raise ValueError(f"Unknown sector code: {sector_code!r}")
            if size is None:
                raise ValueError(f"Unknown company_size code: {company_size_code!r}")
            return sector, size

        sector_opts = [{"code": s.code, "label": s.name} for s in self.sectors.list_options()]
        size_opts = [{"code": cs.code, "label": cs.name} for cs in self.sizes.list_options()]
        if not sector_opts or not size_opts:
            raise ValueError("Sector/company size options are empty in DB; seed reference tables first.")

        classification = self.llm.classify_company(company_name, sector_opts, size_opts)
        sector = self.sectors.get_or_create_by_code(classification["sector_code"], label=classification["sector_code"])
        size = self.sizes.get_or_create_by_code(
            classification["company_size_code"],
            label=classification["company_size_code"],
        )
        return sector, size

    def _ensure_assessment_still_active(self, assessment_id: int, assessment) -> NextQuestionResponse | None:
        self._advance_if_axis_complete(assessment_id, assessment)
        if assessment.status != ASSESSMENT_STATUS_IN_PROGRESS:
            self.db.commit()
            return NextQuestionResponse(status=assessment.status, message="Assessment completed")
        return None

    def _current_axis_name(self, assessment) -> str:
        return assessment.current_axis.name if assessment.current_axis is not None else AXES_ORDER[0]

    def _build_chat_history(self, assessment_id: int) -> list[ChatTurn]:
        history_msgs = self.answers.list_recent(assessment_id, limit=20)
        history: list[ChatTurn] = []
        for msg in reversed(history_msgs):
            history.append(ChatTurn(role="assistant", content=msg.question))
            history.append(ChatTurn(role="user", content=msg.answer))
        return history

    def _resolve_confidence(self, covered_ids: list[int], confidence: float | None) -> float:
        if confidence is not None:
            return float(confidence)
        if covered_ids:
            return self.DEFAULT_CONFIDENCE_IF_COVERED
        return self.DEFAULT_CONFIDENCE_IF_NOT_COVERED

    def _persist_scoring(
        self,
        assessment_id: int,
        covered_ids: list[int],
        confidence: float,
        maturity_level_by_id: dict[int, int],
        rationale_by_id: dict[int, str],
    ) -> None:
        self.capabilities.mark_covered(
            assessment_id=assessment_id,
            covered_ids=covered_ids,
            confidence=confidence,
            maturity_level_by_id=maturity_level_by_id,
            rationale_by_id=rationale_by_id,
        )

    def _apply_followup_gating(
        self,
        covered_ids: list[int],
        confidence_by_id: dict[int, float],
        evidence_by_id: dict[int, str],
        rationale_by_id: dict[int, str],
    ) -> list[int]:
        if not covered_ids:
            return []

        ranked = []
        for capability_id in covered_ids:
            confidence = float(confidence_by_id.get(capability_id, 0.0))
            evidence = (evidence_by_id.get(capability_id) or "").strip()
            rationale = (rationale_by_id.get(capability_id) or "").strip()
            has_support = bool(evidence or rationale)
            if confidence < self.MIN_CONFIDENCE_TO_SCORE or not has_support:
                continue
            ranked.append((capability_id, confidence, len(evidence), len(rationale)))

        if not ranked:
            return []

        ranked.sort(key=lambda item: (item[1], item[2] + item[3]), reverse=True)
        return [capability_id for capability_id, _, _, _ in ranked[: self.MAX_CAPABILITIES_PER_ANSWER]]

    def _persist_answer(
        self,
        assessment_id: int,
        answer: str,
        covered_ids: list[int],
        axis_capabilities: list[dict],
        question_text: str | None = None,
    ) -> None:
        top_capability_id = covered_ids[0] if covered_ids else None
        resolved_question = question_text
        if not resolved_question:
            resolved_question = "[system] question unavailable"
            if axis_capabilities:
                resolved_question = f"[system] {axis_capabilities[0]['label']}"
        self.answers.create(
            assessment_id=assessment_id,
            question=resolved_question,
            answer=answer,
            capability_id=top_capability_id,
        )

    def _persist_insights(
        self,
        assessment_id: int,
        covered_ids: list[int],
        maturity_level_by_id: dict[int, int],
        confidence: float,
        rationale_by_id: dict[int, str],
        evidence_by_id: dict[int, str],
    ) -> None:
        for capability_id in covered_ids:
            evidence = (evidence_by_id.get(capability_id) or "").strip()
            rationale = (rationale_by_id.get(capability_id) or "").strip()
            insight_text = rationale or evidence or "Capability assessed from latest response."
            if evidence and rationale:
                insight_text = f"{rationale} Evidence: {evidence}"
            self.assessments.add_insight(
                assessment_id=assessment_id,
                capability_id=capability_id,
                insight_text=insight_text,
                maturity_level_id=maturity_level_by_id.get(capability_id),
                confidence=confidence,
                justification=rationale or None,
            )

    def _finalize_completed_assessment(self, assessment_id: int, assessment) -> None:
        rows = self.capabilities.get_recommendations_for_scores(assessment_id=assessment_id)
        maturity_rows = self.db.query(MaturityLevel).all()
        maturity_label_by_id = {int(m.id): str(m.label) for m in maturity_rows}
        maturity_number_by_id = {int(m.id): int(m.level_number) for m in maturity_rows}
        output_rows: list[dict] = []
        level_numbers: list[int] = []

        for row in rows:
            maturity_level_id = row.get("maturity_level_id")
            if maturity_level_id is not None and int(maturity_level_id) in maturity_number_by_id:
                level_numbers.append(maturity_number_by_id[int(maturity_level_id)])
            maturity_label = maturity_label_by_id.get(int(maturity_level_id)) if maturity_level_id else "Unknown"
            recommendation_text = self.llm.generate_recommendation(
                axis=str(row.get("axis") or ""),
                capability=str(row.get("capability_name") or ""),
                maturity_label=maturity_label,
                confidence=row.get("confidence"),
                justification=row.get("justification"),
                recommendation_guideline=row.get("recommendation_guideline"),
                priority_hint=row.get("priority_hint"),
                consultant_note=row.get("consultant_note"),
                evidence_to_cite=row.get("evidence_to_cite"),
                initiative_suggestions=row.get("initiative_suggestions"),
                business_impact=row.get("business_impact"),
                tone_hint=row.get("tone_hint"),
            )
            output_rows.append(
                {
                    "capability_id": row.get("capability_id"),
                    "maturity_level_id": maturity_level_id,
                    "generated_text": normalize_text(recommendation_text),
                    "priority": row.get("priority_hint"),
                }
            )

        self.assessments.replace_recommendation_outputs(assessment_id=assessment_id, items=output_rows)
        overall_level_id, overall_band = self._compute_overall_maturity_band(level_numbers=level_numbers)
        assessment.overall_maturity_level_id = overall_level_id
        assessment.overall_maturity_band = overall_band

    def _compute_overall_maturity_band(self, level_numbers: list[int]) -> tuple[int | None, str | None]:
        if not level_numbers:
            return None, None
        average = sum(level_numbers) / len(level_numbers)
        if average < 1.67:
            target_level = 1
            target_band = "Basic"
        elif average < 2.34:
            target_level = 2
            target_band = "Established"
        else:
            target_level = 3
            target_band = "Advanced"

        row = self.db.query(MaturityLevel).filter(MaturityLevel.level_number == target_level).one_or_none()
        if row is None:
            return None, target_band
        return int(row.id), target_band

    def _assert_expected_state(
        self,
        assessment,
        expected_axis: str | None,
        expected_version: int | None,
    ) -> None:
        if expected_axis is None and expected_version is None:
            return

        current_axis = self._current_axis_name(assessment)
        if expected_axis is not None and expected_axis != current_axis:
            raise AssessmentStateConflictError(
                f"State conflict: expected_axis={expected_axis!r}, current_axis={current_axis!r}"
            )

        if expected_version is not None and int(expected_version) != int(assessment.state_version):
            raise AssessmentStateConflictError(
                f"State conflict: expected_version={expected_version}, current_version={assessment.state_version}"
            )
