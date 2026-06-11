from __future__ import annotations

import re
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
        memory_row = await self.axis_memory.get(assessment_id=assessment.id, axis=axis)
        memory_summary = memory_row.summary if memory_row is not None else None
        history = await self._build_chat_history(assessment_id)
        latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), None)
        if self._should_advance_analyze_after_sufficient_collection(
            axis=axis,
            axis_capabilities=axis_capabilities,
            memory_summary=memory_summary,
            history=history,
            latest_user_answer=latest_user_answer,
        ):
            assessment.current_axis_question_count = max(
                int(assessment.current_axis_question_count or 0),
                self.state.target_questions_for_axis(axis_capabilities),
            )
            await self.state.advance_if_axis_complete(
                assessment_id=assessment_id,
                assessment=assessment,
                max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
            )
            if assessment.status != "active":
                return NextQuestionResponse(status=assessment.status, message="Assessment completed")
            return await self._next_question(assessment_id)
        missing = [c["label"] for c in axis_capabilities if not c["covered"]]
        focus = self.select_question_focus(
            axis=axis,
            axis_capabilities=axis_capabilities,
            active_focus_capability_id=self.resolve_pending_focus_capability_id(assessment),
            latest_user_answer=latest_user_answer,
            memory_summary=memory_summary,
            question_count=int(assessment.current_axis_question_count or 0),
            history=history,
        )
        primary_missing_topic = focus["primary_topic"] if focus["primary_topic"] else (missing[0] if missing else axis)

        if assessment.pending_followup_hint:
            pending_hint = self.extract_followup_hint(assessment.pending_followup_hint) or str(assessment.pending_followup_hint or "")
            latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), "")
            if await self.should_reset_followup(
                latest_user_answer=latest_user_answer,
                pending_hint=str(assessment.pending_followup_hint or ""),
                clarification_count=int(assessment.clarification_count or 0),
                previous_question=(assessment.pending_question or "").strip() or None,
            ):
                assessment.pending_followup_hint = None
                assessment.pending_question = None
                assessment.pending_focus_capability_id = None
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
                assessment.pending_followup_hint = (
                    assessment.pending_followup_hint
                    if pending_hint == "maturity_confirmation"
                    else None
                )
                assessment.pending_question = question
                assessment.pending_focus_capability_id = focus.get("primary_capability_id")
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
            axis_description=getattr(assessment.current_axis, "description", None),
            axis_question_guidelines=getattr(assessment.current_axis, "question_guidelines", None),
            question_guidelines=question_guidelines,
            maturity_rubrics=maturity_rubrics,
            conversation_stage=assessment.conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        assessment.pending_question = question
        assessment.pending_followup_hint = None
        assessment.pending_focus_capability_id = focus.get("primary_capability_id")
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
        latest_user_answer: str | None = None,
        memory_summary: str | None = None,
        question_count: int = 0,
        history: list[ChatTurn] | None = None,
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

        primary_row = self._resolve_focus_row(
            uncovered,
            active_focus_capability_id,
            latest_user_answer=latest_user_answer,
            memory_summary=memory_summary,
            question_count=question_count,
            axis=canonical_axis,
            history=history,
        )
        primary_capability_id = self._row_capability_id(primary_row)
        primary = str(primary_row.get("label") or canonical_axis)
        primary_guideline = str(primary_row.get("question_guidelines") or "").strip() or None
        guidelines = [primary_guideline] if primary_guideline else []
        guidelines.extend(
            self._dynamic_guidelines_for_focus(
                label=primary,
                latest_user_answer=latest_user_answer,
                memory_summary=memory_summary,
                axis=canonical_axis,
                history=history,
            )
        )
        related_topics = [
            str(row.get("label") or "").strip()
            for row in uncovered
            if row is not primary_row and str(row.get("label") or "").strip()
        ][:2]
        return {
            "primary_capability_id": primary_capability_id,
            "primary_topic": primary,
            "related_topics": related_topics,
            "question_guidelines": guidelines,
            "primary_guideline": primary_guideline,
        }

    def _resolve_focus_row(
        self,
        uncovered: list[dict],
        active_focus_capability_id: int | None,
        latest_user_answer: str | None = None,
        memory_summary: str | None = None,
        question_count: int = 0,
        axis: str | None = None,
        history: list[ChatTurn] | None = None,
    ) -> dict:
        if active_focus_capability_id is not None:
            for row in uncovered:
                if self._row_capability_id(row) == active_focus_capability_id:
                    return row

        scored = [
            (
                self._focus_priority_score(
                    row=row,
                    latest_user_answer=latest_user_answer,
                    memory_summary=memory_summary,
                    question_count=question_count,
                    axis=axis,
                    history=history,
                ),
                row,
            )
            for row in uncovered
        ]
        scored.sort(key=lambda item: item[0])
        return scored[0][1]

    def _focus_priority_score(
        self,
        row: dict,
        latest_user_answer: str | None,
        memory_summary: str | None,
        question_count: int,
        axis: str | None,
        history: list[ChatTurn] | None,
    ) -> tuple[float, int, str]:
        label = str(row.get("label") or "").strip()
        normalized_label = self._normalize_topic_text(label)
        base_score = float(int(row.get("sort_order") or 9999))
        memory_types = self._memory_types_for_capability(memory_summary, label)
        memory_text = self._normalize_topic_text(memory_summary or "")
        has_feedback_collection_history = self._has_established_feedback_collection_history(history or [])
        latest_text = self._normalize_topic_text(latest_user_answer or "")
        latest_terms = self._important_terms(latest_text)
        uncovered_count = max(0, len([turn for turn in (history or []) if getattr(turn, "role", "") == "user"]))

        if memory_types:
            repeated_dimension_penalty = 0.0
            if normalized_label == "feedback collection" and {"channel", "tool", "cadence"}.issubset(memory_types):
                repeated_dimension_penalty += 15.0
            elif normalized_label == "ownership and governance" and {"owner", "cadence"}.issubset(memory_types):
                repeated_dimension_penalty += 10.0
            elif len(memory_types) >= 3:
                repeated_dimension_penalty += 6.0
            base_score += repeated_dimension_penalty

        if latest_terms:
            row_terms = self._important_terms(
                self._normalize_topic_text(
                    " ".join(
                        [
                            str(row.get("label") or ""),
                            str(row.get("description") or ""),
                            str(row.get("question_guidelines") or ""),
                            str(row.get("evidence_required") or ""),
                        ]
                    )
                )
            )
            if row_terms and latest_terms.intersection(row_terms):
                base_score -= 4.0

        if axis == "Analyze":
            if normalized_label == "feedback collection":
                if has_feedback_collection_history and question_count >= 1:
                    base_score += 18.0
                if self._has_established_feedback_collection_memory(memory_types):
                    if (
                        self._looks_like_journey_visibility_signal(latest_text)
                        or self._looks_like_channel_consistency_signal(latest_text)
                        or self._looks_like_improve_execution_signal(latest_text)
                        or "journey visibility" in memory_text
                        or "channel consistency" in memory_text
                    ):
                        base_score += 40.0
                if has_feedback_collection_history and (
                    self._looks_like_journey_visibility_signal(latest_text)
                    or self._looks_like_channel_consistency_signal(latest_text)
                    or self._looks_like_use_of_insights_signal(latest_text)
                    or self._looks_like_improve_execution_signal(latest_text)
                ):
                    base_score += 28.0
                if self._looks_like_use_of_insights_signal(latest_text):
                    base_score += 18.0
                if self._looks_like_journey_visibility_signal(latest_text):
                    base_score += 16.0
                if self._looks_like_improve_execution_signal(latest_text):
                    base_score += 20.0
                if question_count >= 2 and self._looks_like_basic_collection_signal(latest_text):
                    base_score += 8.0
            elif normalized_label == "use of insights":
                if self._looks_like_basic_collection_signal(latest_text) and not self._looks_like_use_of_insights_signal(latest_text):
                    base_score += 14.0
            elif normalized_label == "journey visibility" and self._looks_like_journey_visibility_signal(latest_text):
                base_score -= 10.0
            elif normalized_label == "channel consistency" and self._looks_like_channel_consistency_signal(latest_text):
                base_score -= 8.0

        return (base_score, int(row.get("sort_order") or 9999), label)

    def _row_capability_id(self, row: dict) -> int | None:
        try:
            raw_value = row.get("id")
            return int(raw_value) if raw_value is not None else None
        except Exception:
            return None

    def _memory_types_for_capability(self, memory_summary: str | None, capability_label: str) -> set[str]:
        if not memory_summary or not capability_label:
            return set()
        normalized_label = self._normalize_topic_text(capability_label)
        types: set[str] = set()
        for raw_line in str(memory_summary or "").split("\n"):
            match = re.match(
                r"^-\s*capability:\s*(.*?)\s*\|\s*([a-z]+)\s*:\s*(.+)$",
                raw_line.strip(),
                flags=re.IGNORECASE,
            )
            if not match:
                continue
            if self._normalize_topic_text(match.group(1).strip()) != normalized_label:
                continue
            fact_type = match.group(2).strip().lower()
            if fact_type:
                types.add(fact_type)
        return types

    def _normalize_topic_text(self, value: str | None) -> str:
        normalized = normalize_text(str(value or "")).lower()
        normalized = normalized.replace("&", "and")
        normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
        return re.sub(r"\s+", " ", normalized).strip()

    def _important_terms(self, text: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[a-z0-9]+", text)
            if len(token) > 3 and token not in {"their", "there", "today", "usually", "which", "through"}
        }

    def _looks_like_basic_collection_signal(self, text: str) -> bool:
        collection_terms = ("email", "phone", "crm", "logged", "survey", "channel", "feedback", "weekly", "reviewed")
        return sum(1 for term in collection_terms if term in text) >= 2

    def _looks_like_use_of_insights_signal(self, text: str) -> bool:
        insight_terms = ("theme", "themes", "root cause", "prioritize", "priority", "impact", "severity", "pattern")
        return sum(1 for term in insight_terms if term in text) >= 2

    def _looks_like_channel_consistency_signal(self, text: str) -> bool:
        signal_terms = ("inconsistent", "handoff", "different answers", "across channels", "shared context")
        return any(term in text for term in signal_terms)

    def _looks_like_journey_visibility_signal(self, text: str) -> bool:
        signal_terms = ("end to end", "touchpoint", "journey view", "journey map", "full picture")
        return any(term in text for term in signal_terms)

    def _looks_like_improve_execution_signal(self, text: str) -> bool:
        signal_terms = ("backlog", "assign owners", "follow up", "closure", "fixes", "pain points")
        return any(term in text for term in signal_terms)

    def _has_established_feedback_collection_memory(self, memory_types: set[str]) -> bool:
        if not memory_types:
            return False
        required = {"cadence"}
        signals = {"channel", "tool", "process"}
        return required.issubset(memory_types) and bool(memory_types.intersection(signals))

    def _has_established_feedback_collection_history(self, history: list[ChatTurn]) -> bool:
        if not history:
            return False
        recent_user_text = " ".join(
            self._normalize_topic_text(str(getattr(turn, "content", "")))
            for turn in history[-8:]
            if str(getattr(turn, "role", "")).lower() == "user"
        )
        if not recent_user_text:
            return False

        channels = sum(1 for term in ("email", "phone", "call", "crm", "survey", "complaint") if term in recent_user_text)
        structure = sum(1 for term in ("logged", "one place", "shared", "weekly", "review", "cases") if term in recent_user_text)
        return channels >= 2 and structure >= 2

    def _dynamic_guidelines_for_focus(
        self,
        label: str,
        latest_user_answer: str | None,
        memory_summary: str | None,
        axis: str | None,
        history: list[ChatTurn] | None,
    ) -> list[str]:
        if axis != "Analyze":
            return []

        normalized_label = self._normalize_topic_text(label)
        latest_text = self._normalize_topic_text(latest_user_answer or "")
        memory_text = self._normalize_topic_text(memory_summary or "")
        has_feedback_collection_history = self._has_established_feedback_collection_history(history or [])
        hints: list[str] = []

        if normalized_label == "feedback collection":
            if has_feedback_collection_history:
                hints.append(
                    "Basic collection channels and shared logging already appear established from earlier answers. "
                    "If this capability still needs a question, ask only about the remaining discipline such as tagging, categorization, routing, standardization, or duplicate handling. "
                    "Do not ask again whether feedback is captured in one place or through which channels."
                )
            if (
                self._looks_like_journey_visibility_signal(latest_text)
                or self._looks_like_channel_consistency_signal(latest_text)
                or "journey visibility" in memory_text
                or "channel consistency" in memory_text
            ):
                hints.append(
                    "Ask directly about how feedback is captured, logged, tagged, routed, or stored. "
                    "Do not ask about customer history transfer, handoffs, shared context across channels, end-to-end journey view, or seeing the full picture."
                )

        if normalized_label == "journey visibility":
            if self._looks_like_channel_consistency_signal(latest_text) or "channel consistency" in memory_text:
                hints.append(
                    "Ask about shared end-to-end journey view, journey mapping, cross-team review, or whether teams only see their own touchpoint. "
                    "Do not ask mainly about handoffs, logging consistency, or whether customer history follows across channels."
                )

        if normalized_label == "channel consistency":
            if self._looks_like_journey_visibility_signal(latest_text) or "journey visibility" in memory_text:
                hints.append(
                    "Ask about consistent answers, handoff rules, and whether customer context follows across channels. "
                    "Do not ask about journey maps, touchpoint ownership, or how feedback is collected and logged."
                )

        if normalized_label == "use of insights":
            if self._looks_like_basic_collection_signal(latest_text) or "feedback collection" in memory_text:
                hints.append(
                    "Ask how issues are compared, themes are identified, root causes are determined, or priorities are set. "
                    "Do not ask only about channels, one logging location, or review cadence."
                )

        return hints

    def _should_advance_analyze_after_sufficient_collection(
        self,
        axis: str,
        axis_capabilities: list[dict],
        memory_summary: str | None,
        history: list[ChatTurn],
        latest_user_answer: str | None,
    ) -> bool:
        if axis != "Analyze":
            return False

        uncovered = [row for row in axis_capabilities if not row.get("covered")]
        if len(uncovered) != 1:
            return False

        remaining_label = self._normalize_topic_text(str(uncovered[0].get("label") or ""))
        if remaining_label != "feedback collection":
            return False

        memory_types = self._memory_types_for_capability(memory_summary, str(uncovered[0].get("label") or ""))
        has_memory = self._has_established_feedback_collection_memory(memory_types)
        has_history = self._has_established_feedback_collection_history(history or [])
        if not has_memory and not has_history:
            return False

        latest_text = self._normalize_topic_text(latest_user_answer or "")
        if self._looks_like_basic_collection_signal(latest_text) and not (
            self._looks_like_channel_consistency_signal(latest_text)
            or self._looks_like_journey_visibility_signal(latest_text)
            or self._looks_like_use_of_insights_signal(latest_text)
            or self._looks_like_improve_execution_signal(latest_text)
        ):
            return False

        return True

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

    def resolve_pending_focus_capability_id(self, assessment: Any) -> int | None:
        raw_value = getattr(assessment, "pending_focus_capability_id", None)
        try:
            return int(raw_value) if raw_value is not None else self.extract_focus_capability_id(
                getattr(assessment, "pending_followup_hint", None)
            )
        except Exception:
            return self.extract_focus_capability_id(getattr(assessment, "pending_followup_hint", None))

    async def should_reset_followup(
        self,
        latest_user_answer: str,
        pending_hint: str,
        clarification_count: int,
        previous_question: str | None = None,
    ) -> bool:
        intent = await self.llm.route_user_intent(latest_user_answer, previous_question=previous_question)
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
        if base_hint in {"needs explanation", "insufficient_evidence", "maturity_confirmation", "process_meta_signal"}:
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
