from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.core.text_normalization import normalize_text
from app.domain.constants import normalize_axis_name
from app.repositories.assessment_axis_memory_repository import AssessmentAxisMemoryRepository
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.assessment import NextQuestionResponse
from app.services.assessment.state.state_service import AssessmentStateService
from app.services.llm.core.facade_service import ChatTurn, LLMService


class QuestionFlowService:
    """Owns question-generation flow for the active assessment axis."""

    def __init__(
        self,
        assessments: AssessmentRepository,
        capabilities: CapabilityRepository,
        axis_memory: AssessmentAxisMemoryRepository,
        llm_service: LLMService,
        state_service: AssessmentStateService,
        build_chat_history: Callable[[int], Awaitable[list[ChatTurn]]],
        max_extra_questions_per_axis: Callable[[], int],
        max_clarifications_per_focus: Callable[[], int],
        max_insufficient_evidence_retries: Callable[[], int],
    ) -> None:
        self.assessments = assessments
        self.capabilities = capabilities
        self.axis_memory = axis_memory
        self.llm = llm_service
        self.state = state_service
        self._build_chat_history = build_chat_history
        self._max_extra_questions_per_axis = max_extra_questions_per_axis
        self._max_clarifications_per_focus = max_clarifications_per_focus
        self._max_insufficient_evidence_retries = max_insufficient_evidence_retries

    async def next_question(self, assessment_id: int) -> NextQuestionResponse | None:
        return await self._next_question(assessment_id)

    async def _next_question(self, assessment_id: int) -> NextQuestionResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        status_response = await self.state.ensure_assessment_still_active(
            assessment_id=assessment_id,
            assessment=assessment,
            max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
        )
        if status_response is not None:
            return status_response

        axis = self.state.current_axis_name(assessment)
        if assessment.pending_question and not assessment.pending_followup_hint:
            return NextQuestionResponse(
                status=assessment.status,
                axis=axis,
                question=assessment.pending_question,
            )

        axis_capabilities = await self.capabilities.list_for_axis(assessment_id, axis)
        missing = [c["label"] for c in axis_capabilities if not c["covered"]]
        focus = self.select_question_focus(
            axis=axis,
            axis_capabilities=axis_capabilities,
            active_focus_capability_id=self.extract_focus_capability_id(assessment.pending_followup_hint),
        )
        primary_missing_topic = focus["primary_topic"] if focus["primary_topic"] else (missing[0] if missing else axis)
        history = await self._build_chat_history(assessment_id)

        if assessment.pending_followup_hint:
            pending_hint = self.extract_followup_hint(assessment.pending_followup_hint) or str(assessment.pending_followup_hint or "")
            latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), "")
            if await self.should_reset_followup(
                latest_user_answer=latest_user_answer,
                pending_hint=str(assessment.pending_followup_hint or ""),
                clarification_count=int(assessment.clarification_count or 0),
            ):
                assessment.pending_followup_hint = None
                assessment.pending_question = None
                assessment.clarification_count = 0
            else:
                focus_topic = self.build_followup_topic(
                    primary_topic=primary_missing_topic,
                    related_topics=[],
                    hint=pending_hint,
                    axis=axis,
                )
                question = await self.llm.generate_clarification_question(
                    axis=axis,
                    latest_user_answer=latest_user_answer,
                    hint=pending_hint,
                    sector=getattr(assessment.company.sector, "name", "Unknown"),
                    company_scope=getattr(assessment.company.company_size, "name", "Unknown"),
                    missing_topic=focus_topic,
                    history=history,
                    concerned_question=(assessment.pending_question or "").strip() or None,
                )
                assessment.pending_followup_hint = None
                assessment.pending_question = question
                assessment.conversation_stage = "diagnostic"
                return NextQuestionResponse(status=assessment.status, axis=axis, question=question)

        prompt_profile = str(getattr(assessment, "prompt_profile", "consultant_guided") or "consultant_guided")
        if prompt_profile == "llm_reasoning_light":
            prompt_profile = "consultant_guided"
        question_guidelines = [str(g or "").strip() for g in (focus.get("question_guidelines") or [])]
        question_guidelines = [q for q in question_guidelines if q]
        maturity_rubrics = await self._maturity_rubrics_for_focus(focus.get("primary_capability_id"))
        latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), None)
        sector_label = getattr(assessment.company.sector, "name", "Unknown")
        ask_evidence = int(assessment.current_axis_question_count or 0) >= 1 or int(assessment.current_axis_low_quality_count or 0) > 0
        helper_mode = self.extract_followup_hint(assessment.pending_followup_hint) == "needs explanation"
        memory_row = await self.axis_memory.get(assessment_id=assessment.id, axis=axis)
        memory_summary = memory_row.summary if memory_row is not None else None

        if int(assessment.current_axis_question_count or 0) == 0:
            assessment.conversation_stage = "intro"
        elif int(assessment.current_axis_question_count or 0) == 1:
            assessment.conversation_stage = "diagnostic"
        else:
            assessment.conversation_stage = "deep_dive"

        question = await self.llm.generate_question(
            axis=axis,
            missing=missing,
            history=history,
            sector=sector_label,
            latest_user_answer=latest_user_answer,
            transition_topic=primary_missing_topic,
            related_topics=[],
            memory_summary=memory_summary,
            question_guidelines=question_guidelines,
            maturity_rubrics=maturity_rubrics,
            conversation_stage=assessment.conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        assessment.pending_question = question
        assessment.pending_followup_hint = None
        return NextQuestionResponse(status=assessment.status, axis=axis, question=question)

    async def generate_intent_clarification_question(
        self,
        assessment_id: int,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
        intent: str,
        previous_question: str | None,
    ) -> str:
        assessment = await self.assessments.get_by_id(assessment_id)
        company = getattr(assessment, "company", None) if assessment is not None else None
        sector_name = getattr(getattr(company, "sector", None), "name", "Unknown")
        company_scope = getattr(getattr(company, "company_size", None), "name", "Unknown")
        focus = self.select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        primary_topic = focus["primary_topic"] if focus.get("primary_topic") else axis
        hint = self.intent_followup_hint(intent)
        focus_topic = self.build_followup_topic(
            primary_topic=primary_topic,
            related_topics=[],
            hint=hint,
            axis=axis,
        )
        return await self.llm.generate_clarification_question(
            axis=axis,
            latest_user_answer=answer,
            hint=hint,
            sector=sector_name,
            company_scope=company_scope,
            missing_topic=focus_topic,
            history=await self._build_chat_history(assessment_id),
            concerned_question=previous_question,
        )

    def select_question_focus(
        self,
        axis: str,
        axis_capabilities: list[dict],
        active_focus_capability_id: int | None = None,
    ) -> dict:
        uncovered = [row for row in axis_capabilities if not row.get("covered")]
        if not uncovered:
            return {
                "primary_capability_id": None,
                "primary_topic": axis,
                "related_topics": [],
                "question_guidelines": [],
                "primary_guideline": None,
            }

        canonical_axis = normalize_axis_name(axis) or axis
        uncovered.sort(key=lambda row: (int(row.get("sort_order") or 9999), str(row.get("label") or "")))

        primary_row = self._resolve_focus_row(uncovered, active_focus_capability_id)
        primary_capability_id = self._row_capability_id(primary_row)
        primary = str(primary_row.get("label") or canonical_axis)
        primary_guideline = str(primary_row.get("question_guidelines") or "").strip() or None
        guidelines = [primary_guideline] if primary_guideline else []
        return {
            "primary_capability_id": primary_capability_id,
            "primary_topic": primary,
            "related_topics": [],
            "question_guidelines": guidelines,
            "primary_guideline": primary_guideline,
        }

    def _resolve_focus_row(self, uncovered: list[dict], active_focus_capability_id: int | None) -> dict:
        if active_focus_capability_id is not None:
            for row in uncovered:
                if self._row_capability_id(row) == active_focus_capability_id:
                    return row
        return uncovered[0]

    def _row_capability_id(self, row: dict) -> int | None:
        try:
            raw_value = row.get("id")
            return int(raw_value) if raw_value is not None else None
        except Exception:
            return None

    def intent_followup_hint(self, intent: str) -> str:
        if intent == "CONFUSION":
            return "needs explanation"
        return "insufficient_evidence"

    def set_followup_hint(self, hint: str | None, focus_capability_id: int | None) -> str | None:
        base_hint = self.extract_followup_hint(hint)
        if not base_hint:
            return None
        if focus_capability_id is None:
            return base_hint
        return f"{base_hint}|focus:{focus_capability_id}"

    def extract_followup_hint(self, raw_hint: str | None) -> str | None:
        value = str(raw_hint or "").strip()
        if not value:
            return None
        return value.split("|", 1)[0].strip() or None

    def extract_focus_capability_id(self, raw_hint: str | None) -> int | None:
        value = str(raw_hint or "").strip()
        if "|focus:" not in value:
            return None
        try:
            return int(value.rsplit("|focus:", 1)[1].strip())
        except Exception:
            return None

    async def should_reset_followup(
        self,
        latest_user_answer: str,
        pending_hint: str,
        clarification_count: int,
    ) -> bool:
        intent = await self.llm.route_user_intent(latest_user_answer)
        base_hint = self.extract_followup_hint(pending_hint) or ""
        if intent == "RESUME":
            return True
        if base_hint == "insufficient_evidence" and clarification_count >= self._max_insufficient_evidence_retries():
            return True
        if clarification_count >= self._max_clarifications_per_focus() and base_hint in {
            "needs explanation",
            "process_meta_signal",
        }:
            return True
        return False

    def build_followup_topic(
        self,
        primary_topic: str | None,
        related_topics: list[str],
        hint: str,
        axis: str,
    ) -> str:
        topic = self.display_topic_label(primary_topic or axis)
        base_hint = self.extract_followup_hint(hint) or hint
        if base_hint in {"needs explanation", "insufficient_evidence", "process_meta_signal"}:
            return topic
        compact_related = [item.strip() for item in related_topics if item and item.strip()]
        if not compact_related:
            return topic
        return ", ".join(([topic] + [self.display_topic_label(item) for item in compact_related])[:2])

    def display_topic_label(self, topic: str | None) -> str:
        return normalize_text(str(topic or "").replace("_", " ")).strip() or "this topic"

    async def _maturity_rubrics_for_focus(self, capability_id: int | None) -> list[dict]:
        if capability_id is None:
            return []
        try:
            rubrics_by_capability = await self.capabilities.get_rubrics_for_capabilities([int(capability_id)])
        except Exception:
            return []
        return list(rubrics_by_capability.get(int(capability_id)) or [])


def build_question_flow_service(
    assessments: AssessmentRepository,
    capabilities: CapabilityRepository,
    axis_memory: AssessmentAxisMemoryRepository,
    llm_service: LLMService,
    state_service: AssessmentStateService,
    build_chat_history: Callable[[int], Awaitable[list[ChatTurn]]],
    max_extra_questions_per_axis: Callable[[], int],
    max_clarifications_per_focus: Callable[[], int],
    max_insufficient_evidence_retries: Callable[[], int],
) -> QuestionFlowService:
    return QuestionFlowService(
        assessments=assessments,
        capabilities=capabilities,
        axis_memory=axis_memory,
        llm_service=llm_service,
        state_service=state_service,
        build_chat_history=build_chat_history,
        max_extra_questions_per_axis=max_extra_questions_per_axis,
        max_clarifications_per_focus=max_clarifications_per_focus,
        max_insufficient_evidence_retries=max_insufficient_evidence_retries,
    )
