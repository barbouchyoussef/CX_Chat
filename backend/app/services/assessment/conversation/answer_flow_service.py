from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from app.domain.constants import ASSESSMENT_STATUS_COMPLETED, ASSESSMENT_STATUS_IN_PROGRESS
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.assessment import AnswerResponse, NextQuestionResponse
from app.services.assessment.conversation.question_flow_service import QuestionFlowService
from app.services.assessment.reporting.reporting_service import AssessmentReportingService
from app.services.assessment.scoring.scoring_service import AssessmentScoringService
from app.services.assessment.state.state_service import AssessmentStateService
from app.services.llm.core.facade_service import LLMService


class AnswerFlowService:
    """Owns submit-answer routing, scoring integration, and persistence."""

    def __init__(
        self,
        assessments: AssessmentRepository,
        capabilities: CapabilityRepository,
        answers: AssessmentAnswerRepository,
        llm_service: LLMService,
        state_service: AssessmentStateService,
        scoring_service: AssessmentScoringService,
        reporting_service: AssessmentReportingService,
        question_flow_service: QuestionFlowService,
        max_extra_questions_per_axis: Callable[[], int],
        max_clarifications_per_focus: Callable[[], int],
        max_insufficient_evidence_retries: Callable[[], int],
        schedule_axis_memory_update: Callable[[int, str, str, list[int], list[dict]], Awaitable[asyncio.Task[str] | None]],
        schedule_next_question_prefetch: Callable[[Any], asyncio.Task[NextQuestionResponse | None] | None],
        cancel_scheduled_axis_memory_update: Callable[[asyncio.Task[str] | None], Awaitable[None]],
        cancel_scheduled_next_question_prefetch: Callable[[asyncio.Task[NextQuestionResponse | None] | None], Awaitable[None]],
        finalize_parallel_llm_tasks: Callable[[int, str, asyncio.Task[str] | None, asyncio.Task[NextQuestionResponse | None] | None], Awaitable[None]],
    ) -> None:
        self.assessments = assessments
        self.capabilities = capabilities
        self.answers = answers
        self.llm = llm_service
        self.state = state_service
        self.scoring = scoring_service
        self.reporting = reporting_service
        self.question_flow = question_flow_service
        self._max_extra_questions_per_axis = max_extra_questions_per_axis
        self._max_clarifications_per_focus = max_clarifications_per_focus
        self._max_insufficient_evidence_retries = max_insufficient_evidence_retries
        self._schedule_axis_memory_update = schedule_axis_memory_update
        self._schedule_next_question_prefetch = schedule_next_question_prefetch
        self._cancel_scheduled_axis_memory_update = cancel_scheduled_axis_memory_update
        self._cancel_scheduled_next_question_prefetch = cancel_scheduled_next_question_prefetch
        self._finalize_parallel_llm_tasks = finalize_parallel_llm_tasks

    async def submit_answer(
        self,
        assessment_id: int,
        answer: str,
        expected_axis: str | None = None,
        expected_version: int | None = None,
    ) -> AnswerResponse | None:
        assessment = await self.assessments.get_by_id_for_update(assessment_id)
        if assessment is None:
            return None

        self.state.assert_expected_state(
            assessment=assessment,
            expected_axis=expected_axis,
            expected_version=expected_version,
        )

        status_response = await self.state.ensure_assessment_still_active(
            assessment_id=assessment_id,
            assessment=assessment,
            max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
        )
        if status_response is not None:
            return AnswerResponse(status=assessment.status, axis=None, covered=[], confidence=None)

        axis = self.state.current_axis_name(assessment)
        axis_capabilities = await self.capabilities.list_for_axis(assessment_id, axis)
        intent = await self.llm.route_user_intent(answer)

        if intent == "VALID_ANSWER":
            return await self.process_valid_answer(
                assessment_id=assessment_id,
                assessment=assessment,
                axis=axis,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        if intent == "RESUME":
            return await self.handle_resume_intent(
                assessment_id=assessment_id,
                assessment=assessment,
                axis=axis,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        return await self.handle_non_valid_intent(
            assessment_id=assessment_id,
            assessment=assessment,
            axis=axis,
            answer=answer,
            axis_capabilities=axis_capabilities,
            intent=intent,
        )

    async def process_valid_answer(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
    ) -> AnswerResponse:
        capability_ids = [int(c["id"]) for c in axis_capabilities if "id" in c]
        rubrics_by_capability = await self.capabilities.get_rubrics_for_capabilities(capability_ids)
        coverage = await self.llm.detect_coverage(
            answer=answer,
            criteria=axis_capabilities,
            rubrics_by_capability=rubrics_by_capability,
        )
        focus = self.question_flow.select_question_focus(axis=axis, axis_capabilities=axis_capabilities)

        covered_ids = coverage.get("covered") or []
        covered_ids = self.scoring.apply_followup_gating(
            covered_ids=covered_ids,
            confidence_by_id=coverage.get("confidence_by_id") or {},
            evidence_by_id=coverage.get("evidence_by_id") or {},
            rationale_by_id=coverage.get("rationale_by_id") or {},
            maturity_level_number_by_id=coverage.get("maturity_level_number_by_id") or {},
            is_specific_and_actionable_by_id=coverage.get("is_specific_and_actionable_by_id") or {},
        )
        if not covered_ids and self.llm.is_negative_evidence_answer(answer):
            covered_ids = await self._force_level_one_for_current_focus(
                coverage=coverage,
                focus_capability_id=focus.get("primary_capability_id"),
                answer=answer,
                rationale=self._negative_evidence_rationale(answer),
                evidence=self._negative_evidence_evidence(answer),
            )
        confidence = self.scoring.resolve_confidence(covered_ids=covered_ids, confidence=coverage.get("confidence"))
        memory_update_task = await self._schedule_axis_memory_update(
            assessment_id=assessment_id,
            axis=axis,
            answer=answer,
            covered_ids=covered_ids,
            axis_capabilities=axis_capabilities,
        )
        next_question_task: asyncio.Task[NextQuestionResponse | None] | None = None
        try:
            await self.scoring.persist_scoring(
                assessment_id=assessment_id,
                covered_ids=covered_ids,
                confidence=confidence,
                maturity_level_by_id=coverage.get("maturity_level_by_id") or {},
                rationale_by_id=coverage.get("rationale_by_id") or {},
            )
            await self.scoring.persist_insights(
                assessment_id=assessment_id,
                covered_ids=covered_ids,
                maturity_level_by_id=coverage.get("maturity_level_by_id") or {},
                confidence=confidence,
                rationale_by_id=coverage.get("rationale_by_id") or {},
                evidence_by_id=coverage.get("evidence_by_id") or {},
            )
            await self.persist_answer(
                assessment_id=assessment_id,
                answer=answer,
                covered_ids=covered_ids,
                axis_capabilities=axis_capabilities,
                question_text=(assessment.pending_question or "").strip() or None,
            )
            await self.update_assessment_after_valid_answer(
                assessment_id=assessment_id,
                assessment=assessment,
                covered_ids=covered_ids,
                focus_capability_id=focus.get("primary_capability_id"),
            )
            next_question_task = self._schedule_next_question_prefetch(assessment)
        except Exception:
            await self._cancel_scheduled_axis_memory_update(memory_update_task)
            await self._cancel_scheduled_next_question_prefetch(next_question_task)
            raise
        await self._finalize_parallel_llm_tasks(
            assessment_id=assessment_id,
            axis=axis,
            memory_update_task=memory_update_task,
            next_question_task=next_question_task,
        )
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=covered_ids,
            confidence=float(confidence),
        )

    async def update_assessment_after_valid_answer(
        self,
        assessment_id: int,
        assessment: Any,
        covered_ids: list[int],
        focus_capability_id: int | None,
    ) -> None:
        prior_clarification_count = int(assessment.clarification_count or 0)
        assessment.pending_question = None
        if covered_ids:
            assessment.pending_followup_hint = None
            assessment.clarification_count = 0
        else:
            assessment.pending_followup_hint = (
                self.question_flow.set_followup_hint("insufficient_evidence", focus_capability_id)
                if prior_clarification_count < self._max_insufficient_evidence_retries()
                else None
            )
            assessment.clarification_count = prior_clarification_count + 1
        assessment.current_axis_question_count = int(assessment.current_axis_question_count) + 1
        await self.state.advance_if_axis_complete(
            assessment_id=assessment_id,
            assessment=assessment,
            max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
        )
        if assessment.status == ASSESSMENT_STATUS_COMPLETED:
            await self.reporting.finalize_completed_assessment(assessment_id=assessment_id, assessment=assessment)
        self.state.bump_version(assessment)

    async def handle_resume_intent(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
    ) -> AnswerResponse:
        focus = self.question_flow.select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        focus_capability_id = focus.get("primary_capability_id")
        if focus_capability_id is None:
            return await self.record_non_scoring_turn(
                assessment_id=assessment_id,
                assessment=assessment,
                answer=answer,
                axis_capabilities=axis_capabilities,
                pending_followup_hint=None,
                clear_pending_question=True,
            )

        level_one = await self.assessments.get_maturity_level_by_number(1)
        maturity_level_id = int(level_one.id) if level_one is not None else None
        confidence = self.scoring.resolve_confidence(covered_ids=[int(focus_capability_id)], confidence=None)
        rationale = self._resume_rationale(answer)
        evidence = self._resume_evidence(answer)

        await self.scoring.persist_scoring(
            assessment_id=assessment_id,
            covered_ids=[int(focus_capability_id)],
            confidence=confidence,
            maturity_level_by_id={int(focus_capability_id): maturity_level_id} if maturity_level_id is not None else {},
            rationale_by_id={int(focus_capability_id): rationale},
        )
        await self.scoring.persist_insights(
            assessment_id=assessment_id,
            covered_ids=[int(focus_capability_id)],
            maturity_level_by_id={int(focus_capability_id): maturity_level_id} if maturity_level_id is not None else {},
            confidence=confidence,
            rationale_by_id={int(focus_capability_id): rationale},
            evidence_by_id={int(focus_capability_id): evidence},
        )
        await self.persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[int(focus_capability_id)],
            axis_capabilities=axis_capabilities,
            question_text=(assessment.pending_question or "").strip() or None,
        )
        await self.update_assessment_after_valid_answer(
            assessment_id=assessment_id,
            assessment=assessment,
            covered_ids=[int(focus_capability_id)],
            focus_capability_id=int(focus_capability_id),
        )
        next_question_task = self._schedule_next_question_prefetch(assessment)
        await self._finalize_parallel_llm_tasks(
            assessment_id=assessment_id,
            axis=axis,
            memory_update_task=None,
            next_question_task=next_question_task,
        )
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=[int(focus_capability_id)],
            confidence=float(confidence),
        )

    async def handle_non_valid_intent(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
        intent: str,
    ) -> AnswerResponse:
        if intent == "CONFUSION" and self._should_exit_repeated_confusion(assessment):
            return await self.handle_repeated_confusion_intent(
                assessment_id=assessment_id,
                assessment=assessment,
                axis=axis,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        if intent == "LOW_QUALITY" and self._should_exit_repeated_low_quality(assessment):
            return await self.handle_repeated_low_quality_intent(
                assessment_id=assessment_id,
                assessment=assessment,
                axis=axis,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        previous_question = (assessment.pending_question or "").strip() or None
        await self.persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[],
            axis_capabilities=axis_capabilities,
            question_text=previous_question,
        )
        clarification_question = await self.question_flow.generate_intent_clarification_question(
            assessment_id=assessment_id,
            axis=axis,
            answer=answer,
            axis_capabilities=axis_capabilities,
            intent=intent,
            previous_question=previous_question,
        )
        if intent == "LOW_QUALITY":
            clarification_question = self._build_low_quality_clarification_message(clarification_question)

        if intent == "LOW_QUALITY":
            assessment.current_axis_question_count = int(assessment.current_axis_question_count or 0) + 1
            assessment.current_axis_low_quality_count = min(
                int(assessment.current_axis_low_quality_count or 0) + 1,
                self._max_extra_questions_per_axis(),
            )
            await self.state.advance_if_axis_complete(
                assessment_id=assessment_id,
                assessment=assessment,
                max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
            )
            if assessment.status == ASSESSMENT_STATUS_COMPLETED:
                await self.reporting.finalize_completed_assessment(assessment_id=assessment_id, assessment=assessment)

        assessment.pending_question = None
        assessment.pending_followup_hint = None
        is_same_active_axis = (
            assessment.status == ASSESSMENT_STATUS_IN_PROGRESS
            and self.state.current_axis_name(assessment) == axis
        )
        assessment.clarification_count = (
            self.next_clarification_count(assessment=assessment, intent=intent)
            if is_same_active_axis
            else 0
        )
        if is_same_active_axis:
            assessment.pending_question = clarification_question
            assessment.conversation_stage = "diagnostic"

        self.state.bump_version(assessment)
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=[],
            confidence=0.0,
        )

    async def handle_repeated_confusion_intent(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
    ) -> AnswerResponse:
        focus = self.question_flow.select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        focus_capability_id = focus.get("primary_capability_id")
        if focus_capability_id is None:
            return await self.record_non_scoring_turn(
                assessment_id=assessment_id,
                assessment=assessment,
                answer=answer,
                axis_capabilities=axis_capabilities,
                pending_followup_hint=None,
                clear_pending_question=True,
                increment_clarification=True,
            )

        capability_id = int(focus_capability_id)
        level_one = await self.assessments.get_maturity_level_by_number(1)
        maturity_level_id = int(level_one.id) if level_one is not None else None
        confidence = self.scoring.resolve_confidence(covered_ids=[capability_id], confidence=None)
        rationale = self._confusion_exit_rationale(answer)
        evidence = self._confusion_exit_evidence(answer)

        await self.scoring.persist_scoring(
            assessment_id=assessment_id,
            covered_ids=[capability_id],
            confidence=confidence,
            maturity_level_by_id={capability_id: maturity_level_id} if maturity_level_id is not None else {},
            rationale_by_id={capability_id: rationale},
        )
        await self.scoring.persist_insights(
            assessment_id=assessment_id,
            covered_ids=[capability_id],
            maturity_level_by_id={capability_id: maturity_level_id} if maturity_level_id is not None else {},
            confidence=confidence,
            rationale_by_id={capability_id: rationale},
            evidence_by_id={capability_id: evidence},
        )
        await self.persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[capability_id],
            axis_capabilities=axis_capabilities,
            question_text=(assessment.pending_question or "").strip() or None,
        )
        await self.update_assessment_after_valid_answer(
            assessment_id=assessment_id,
            assessment=assessment,
            covered_ids=[capability_id],
            focus_capability_id=capability_id,
        )
        next_question_task = self._schedule_next_question_prefetch(assessment)
        await self._finalize_parallel_llm_tasks(
            assessment_id=assessment_id,
            axis=axis,
            memory_update_task=None,
            next_question_task=next_question_task,
        )
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=[capability_id],
            confidence=float(confidence),
        )

    async def handle_repeated_low_quality_intent(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
    ) -> AnswerResponse:
        focus = self.question_flow.select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        focus_capability_id = focus.get("primary_capability_id")
        if focus_capability_id is None:
            return await self.record_non_scoring_turn(
                assessment_id=assessment_id,
                assessment=assessment,
                answer=answer,
                axis_capabilities=axis_capabilities,
                pending_followup_hint=None,
                clear_pending_question=True,
                increment_clarification=True,
                increment_low_quality=True,
            )

        capability_id = int(focus_capability_id)
        level_one = await self.assessments.get_maturity_level_by_number(1)
        maturity_level_id = int(level_one.id) if level_one is not None else None
        confidence = self.scoring.resolve_confidence(covered_ids=[capability_id], confidence=None)
        rationale = self._low_quality_exit_rationale(answer)
        evidence = self._low_quality_exit_evidence(answer)

        assessment.current_axis_low_quality_count = min(
            int(assessment.current_axis_low_quality_count or 0) + 1,
            self._max_extra_questions_per_axis(),
        )
        await self.scoring.persist_scoring(
            assessment_id=assessment_id,
            covered_ids=[capability_id],
            confidence=confidence,
            maturity_level_by_id={capability_id: maturity_level_id} if maturity_level_id is not None else {},
            rationale_by_id={capability_id: rationale},
        )
        await self.scoring.persist_insights(
            assessment_id=assessment_id,
            covered_ids=[capability_id],
            maturity_level_by_id={capability_id: maturity_level_id} if maturity_level_id is not None else {},
            confidence=confidence,
            rationale_by_id={capability_id: rationale},
            evidence_by_id={capability_id: evidence},
        )
        await self.persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[capability_id],
            axis_capabilities=axis_capabilities,
            question_text=(assessment.pending_question or "").strip() or None,
        )
        await self.update_assessment_after_valid_answer(
            assessment_id=assessment_id,
            assessment=assessment,
            covered_ids=[capability_id],
            focus_capability_id=capability_id,
        )
        next_question_task = self._schedule_next_question_prefetch(assessment)
        await self._finalize_parallel_llm_tasks(
            assessment_id=assessment_id,
            axis=axis,
            memory_update_task=None,
            next_question_task=next_question_task,
        )
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=[capability_id],
            confidence=float(confidence),
        )

    def next_clarification_count(self, assessment: Any, intent: str) -> int:
        return int(assessment.clarification_count or 0) + 1

    def _should_exit_repeated_low_quality(self, assessment: Any) -> bool:
        threshold = max(2, self._max_extra_questions_per_axis() + 1)
        return int(assessment.current_axis_low_quality_count or 0) + 1 >= threshold

    def _should_exit_repeated_confusion(self, assessment: Any) -> bool:
        return int(assessment.clarification_count or 0) + 1 > self._max_clarifications_per_focus()

    def _build_low_quality_clarification_message(self, clarification_question: str) -> str:
        question_text = (clarification_question or "").strip()
        if not question_text:
            question_text = "Could you restate your answer with one concrete business example?"
        return (
            "I didn't understand your last answer, and it doesn't give me a clear business signal. "
            f"{question_text}"
        )

    async def _force_level_one_for_current_focus(
        self,
        coverage: dict,
        focus_capability_id: int | None,
        answer: str,
        rationale: str,
        evidence: str,
    ) -> list[int]:
        if focus_capability_id is None:
            return []

        capability_id = int(focus_capability_id)
        level_one = await self.assessments.get_maturity_level_by_number(1)
        maturity_level_id = int(level_one.id) if level_one is not None else None
        confidence = self.scoring.resolve_confidence(covered_ids=[capability_id], confidence=None)

        coverage["covered"] = [capability_id]
        coverage["confidence"] = confidence
        coverage["confidence_by_id"] = {capability_id: confidence}
        coverage["maturity_level_number_by_id"] = {capability_id: 1}
        coverage["maturity_level_by_id"] = {capability_id: maturity_level_id} if maturity_level_id is not None else {}
        coverage["rationale_by_id"] = {capability_id: rationale}
        coverage["evidence_by_id"] = {capability_id: evidence}
        coverage["is_specific_and_actionable_by_id"] = {capability_id: True}
        return [capability_id]

    def _negative_evidence_rationale(self, answer: str) -> str:
        return (
            "The user explicitly stated they do not know, have no answer, or lack the process; "
            f"this is recorded as Level 1 maturity evidence. User wording: {self._compact_answer_excerpt(answer)}"
        )

    def _negative_evidence_evidence(self, answer: str) -> str:
        return f"User explicitly stated lack of knowledge or process: {self._compact_answer_excerpt(answer)}"

    def _resume_rationale(self, answer: str) -> str:
        return (
            "The user explicitly asked to skip, pass, or move on before providing assessable evidence; "
            f"this is recorded as Level 1 maturity evidence for the current capability. User wording: {self._compact_answer_excerpt(answer)}"
        )

    def _resume_evidence(self, answer: str) -> str:
        return f"User explicitly asked to skip or move on: {self._compact_answer_excerpt(answer)}"

    def _low_quality_exit_rationale(self, answer: str) -> str:
        return (
            "The user repeatedly provided text that could not be interpreted as credible business evidence; "
            f"this is recorded as Level 1 maturity evidence rather than inventing details. User wording: {self._compact_answer_excerpt(answer)}"
        )

    def _low_quality_exit_evidence(self, answer: str) -> str:
        return f"Repeated low-quality or non-interpretable response: {self._compact_answer_excerpt(answer)}"

    def _confusion_exit_rationale(self, answer: str) -> str:
        return (
            "The user repeatedly asked for clarification and did not provide assessable business evidence; "
            f"this is recorded as Level 1 maturity evidence rather than inventing details. User wording: {self._compact_answer_excerpt(answer)}"
        )

    def _confusion_exit_evidence(self, answer: str) -> str:
        return f"Repeated clarification request without assessable evidence: {self._compact_answer_excerpt(answer)}"

    def _compact_answer_excerpt(self, answer: str) -> str:
        value = " ".join(str(answer or "").strip().split())
        if not value:
            return '"no answer provided"'
        if len(value) <= 160:
            return f'"{value}"'
        return f'"{value[:157].rstrip()}..."'

    async def record_non_scoring_turn(
        self,
        assessment_id: int,
        assessment: Any,
        answer: str,
        axis_capabilities: list[dict],
        pending_followup_hint: str | None,
        clear_pending_question: bool,
        increment_clarification: bool = False,
        increment_question_count: bool = False,
        increment_low_quality: bool = False,
    ) -> AnswerResponse:
        await self.persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[],
            axis_capabilities=axis_capabilities,
            question_text=(assessment.pending_question or "").strip() or None,
        )
        if clear_pending_question:
            assessment.pending_question = None
        assessment.pending_followup_hint = pending_followup_hint
        assessment.clarification_count = (
            int(assessment.clarification_count or 0) + 1
            if increment_clarification
            else 0
        )

        if increment_question_count:
            assessment.current_axis_question_count = int(assessment.current_axis_question_count or 0) + 1
        if increment_low_quality:
            assessment.current_axis_low_quality_count = min(
                int(assessment.current_axis_low_quality_count or 0) + 1,
                self._max_extra_questions_per_axis(),
            )
        if increment_question_count:
            await self.state.advance_if_axis_complete(
                assessment_id=assessment_id,
                assessment=assessment,
                max_extra_questions_per_axis=self._max_extra_questions_per_axis(),
            )
            if assessment.status == ASSESSMENT_STATUS_COMPLETED:
                await self.reporting.finalize_completed_assessment(assessment_id=assessment_id, assessment=assessment)

        self.state.bump_version(assessment)
        return AnswerResponse(
            status=assessment.status,
            axis=self.state.response_axis(assessment),
            covered=[],
            confidence=0.0,
        )


    async def persist_answer(
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
        await self.answers.create(
            assessment_id=assessment_id,
            question=resolved_question,
            answer=answer,
            capability_id=top_capability_id,
        )


def build_answer_flow_service(
    assessments: AssessmentRepository,
    capabilities: CapabilityRepository,
    answers: AssessmentAnswerRepository,
    llm_service: LLMService,
    state_service: AssessmentStateService,
    scoring_service: AssessmentScoringService,
    reporting_service: AssessmentReportingService,
    question_flow_service: QuestionFlowService,
    max_extra_questions_per_axis: Callable[[], int],
    max_clarifications_per_focus: Callable[[], int],
    max_insufficient_evidence_retries: Callable[[], int],
    schedule_axis_memory_update: Callable[[int, str, str, list[int], list[dict]], Awaitable[asyncio.Task[str] | None]],
    schedule_next_question_prefetch: Callable[[Any], asyncio.Task[NextQuestionResponse | None] | None],
    cancel_scheduled_axis_memory_update: Callable[[asyncio.Task[str] | None], Awaitable[None]],
    cancel_scheduled_next_question_prefetch: Callable[[asyncio.Task[NextQuestionResponse | None] | None], Awaitable[None]],
    finalize_parallel_llm_tasks: Callable[[int, str, asyncio.Task[str] | None, asyncio.Task[NextQuestionResponse | None] | None], Awaitable[None]],
) -> AnswerFlowService:
    return AnswerFlowService(
        assessments=assessments,
        capabilities=capabilities,
        answers=answers,
        llm_service=llm_service,
        state_service=state_service,
        scoring_service=scoring_service,
        reporting_service=reporting_service,
        question_flow_service=question_flow_service,
        max_extra_questions_per_axis=max_extra_questions_per_axis,
        max_clarifications_per_focus=max_clarifications_per_focus,
        max_insufficient_evidence_retries=max_insufficient_evidence_retries,
        schedule_axis_memory_update=schedule_axis_memory_update,
        schedule_next_question_prefetch=schedule_next_question_prefetch,
        cancel_scheduled_axis_memory_update=cancel_scheduled_axis_memory_update,
        cancel_scheduled_next_question_prefetch=cancel_scheduled_next_question_prefetch,
        finalize_parallel_llm_tasks=finalize_parallel_llm_tasks,
    )
