import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.text_normalization import normalize_text
from app.domain.constants import ASSESSMENT_STATUS_COMPLETED, ASSESSMENT_STATUS_IN_PROGRESS, normalize_axis_name
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment_axis_memory_repository import AssessmentAxisMemoryRepository
from app.repositories.assessment_idempotency_repository import AssessmentIdempotencyRepository
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.assessment import AnswerResponse, NextQuestionResponse
from app.services.assessment_reporting_service import AssessmentReportingService, build_assessment_reporting_service
from app.services.assessment_scoring_service import AssessmentScoringService, build_assessment_scoring_service
from app.services.assessment_state_service import AssessmentStateService
from app.services.idempotency import idempotent_request
from app.services.llm_service import ChatTurn, LLMService, build_llm_service
from app.services.unit_of_work import AsyncUnitOfWork

logger = logging.getLogger(__name__)


class AssessmentConversationService:
    """Owns the CX assessment conversation loop and LLM orchestration."""

    def __init__(
        self,
        db: AsyncSession,
        assessments: AssessmentRepository,
        capabilities: CapabilityRepository,
        answers: AssessmentAnswerRepository,
        axis_memory: AssessmentAxisMemoryRepository,
        idempotency: AssessmentIdempotencyRepository,
        llm_service: LLMService,
        uow: AsyncUnitOfWork,
        state_service: AssessmentStateService,
        scoring_service: AssessmentScoringService,
        reporting_service: AssessmentReportingService,
        settings: Settings,
    ) -> None:
        self.db = db
        self.assessments = assessments
        self.capabilities = capabilities
        self.answers = answers
        self.axis_memory = axis_memory
        self.idempotency = idempotency
        self.llm = llm_service
        self.uow = uow
        self.state = state_service
        self.scoring = scoring_service
        self.reporting = reporting_service
        self.settings = settings

    @property
    def max_extra_questions_per_axis(self) -> int:
        return self.settings.chat_max_extra_questions_per_axis

    @property
    def max_clarifications_per_focus(self) -> int:
        return self.settings.chat_max_clarifications_per_focus

    @property
    def max_insufficient_evidence_retries(self) -> int:
        return self.settings.chat_max_insufficient_evidence_retries

    async def next_question(self, assessment_id: int) -> NextQuestionResponse | None:
        async with self.uow:
            return await self._next_question(assessment_id)

    async def _next_question(self, assessment_id: int) -> NextQuestionResponse | None:
        assessment = await self.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None

        status_response = await self.state.ensure_assessment_still_active(
            assessment_id=assessment_id,
            assessment=assessment,
            max_extra_questions_per_axis=self.max_extra_questions_per_axis,
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
        focus = self._select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        primary_missing_topic = focus["primary_topic"] if focus["primary_topic"] else (missing[0] if missing else axis)
        history = await self._build_chat_history(assessment_id)

        if assessment.pending_followup_hint:
            latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), "")
            if await self._should_reset_followup(
                latest_user_answer=latest_user_answer,
                pending_hint=str(assessment.pending_followup_hint or ""),
                clarification_count=int(assessment.clarification_count or 0),
            ):
                assessment.pending_followup_hint = None
                assessment.pending_question = None
                assessment.clarification_count = 0
            else:
                focus_topic = self._build_followup_topic(
                    primary_topic=primary_missing_topic,
                    related_topics=focus.get("related_topics") or [],
                    hint=str(assessment.pending_followup_hint or ""),
                    axis=axis,
                )
                question = await self.llm.generate_clarification_question(
                    axis=axis,
                    latest_user_answer=latest_user_answer,
                    hint=assessment.pending_followup_hint,
                    missing_topic=focus_topic,
                    history=history,
                    concerned_question=(assessment.pending_question or "").strip() or None,
                )
                assessment.pending_followup_hint = None
                assessment.pending_question = question
                assessment.conversation_stage = "diagnostic"
                return NextQuestionResponse(status=assessment.status, axis=axis, question=question)

        prompt_profile = str(getattr(assessment, "prompt_profile", "consultant_guided") or "consultant_guided")
        question_guidelines = [str(g or "").strip() for g in (focus.get("question_guidelines") or [])]
        question_guidelines = [q for q in question_guidelines if q]
        if prompt_profile == "llm_reasoning_light":
            question_guidelines = []
        latest_user_answer = next((turn.content for turn in reversed(history) if turn.role == "user"), None)
        sector_label = getattr(assessment.company.sector, "name", "Unknown")
        ask_evidence = int(assessment.current_axis_question_count or 0) >= 1 or int(assessment.current_axis_low_quality_count or 0) > 0
        helper_mode = assessment.pending_followup_hint == "needs explanation"
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
            related_topics=focus.get("related_topics") or [],
            memory_summary=memory_summary,
            question_guidelines=question_guidelines,
            conversation_stage=assessment.conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        assessment.pending_question = question
        assessment.pending_followup_hint = None
        return NextQuestionResponse(status=assessment.status, axis=axis, question=question)

    @idempotent_request
    async def submit_answer(
        self,
        assessment_id: int,
        answer: str,
        idempotency_key: str | None = None,
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
            max_extra_questions_per_axis=self.max_extra_questions_per_axis,
        )
        if status_response is not None:
            return AnswerResponse(status=assessment.status, axis=None, covered=[], confidence=None)

        axis = self.state.current_axis_name(assessment)
        axis_capabilities = await self.capabilities.list_for_axis(assessment_id, axis)
        intent = await self.llm.route_user_intent(answer)

        if intent == "VALID_ANSWER":
            return await self._process_valid_answer(
                assessment_id=assessment_id,
                assessment=assessment,
                axis=axis,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        if intent == "RESUME":
            return await self._handle_resume_intent(
                assessment_id=assessment_id,
                assessment=assessment,
                answer=answer,
                axis_capabilities=axis_capabilities,
            )

        return await self._handle_non_valid_intent(
            assessment_id=assessment_id,
            assessment=assessment,
            axis=axis,
            answer=answer,
            axis_capabilities=axis_capabilities,
            intent=intent,
        )

    async def _process_valid_answer(
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

        covered_ids = coverage.get("covered") or []
        covered_ids = self.scoring.apply_followup_gating(
            covered_ids=covered_ids,
            confidence_by_id=coverage.get("confidence_by_id") or {},
            evidence_by_id=coverage.get("evidence_by_id") or {},
            rationale_by_id=coverage.get("rationale_by_id") or {},
            maturity_level_number_by_id=coverage.get("maturity_level_number_by_id") or {},
            is_specific_and_actionable_by_id=coverage.get("is_specific_and_actionable_by_id") or {},
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
            await self._persist_answer(
                assessment_id=assessment_id,
                answer=answer,
                covered_ids=covered_ids,
                axis_capabilities=axis_capabilities,
                question_text=(assessment.pending_question or "").strip() or None,
            )
            await self._update_assessment_after_valid_answer(
                assessment_id=assessment_id,
                assessment=assessment,
                covered_ids=covered_ids,
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

    async def _update_assessment_after_valid_answer(
        self,
        assessment_id: int,
        assessment: Any,
        covered_ids: list[int],
    ) -> None:
        prior_clarification_count = int(assessment.clarification_count or 0)
        assessment.pending_question = None
        if covered_ids:
            assessment.pending_followup_hint = None
            assessment.clarification_count = 0
        else:
            assessment.pending_followup_hint = (
                "insufficient_evidence"
                if prior_clarification_count < self.max_insufficient_evidence_retries
                else None
            )
            assessment.clarification_count = prior_clarification_count + 1
        assessment.current_axis_question_count = int(assessment.current_axis_question_count) + 1
        await self.state.advance_if_axis_complete(
            assessment_id=assessment_id,
            assessment=assessment,
            max_extra_questions_per_axis=self.max_extra_questions_per_axis,
        )
        if assessment.status == ASSESSMENT_STATUS_COMPLETED:
            await self.reporting.finalize_completed_assessment(assessment_id=assessment_id, assessment=assessment)
        self.state.bump_version(assessment)

    async def _handle_resume_intent(
        self,
        assessment_id: int,
        assessment: Any,
        answer: str,
        axis_capabilities: list[dict],
    ) -> AnswerResponse:
        return await self._record_non_scoring_turn(
            assessment_id=assessment_id,
            assessment=assessment,
            answer=answer,
            axis_capabilities=axis_capabilities,
            pending_followup_hint=None,
            clear_pending_question=True,
        )

    async def _handle_non_valid_intent(
        self,
        assessment_id: int,
        assessment: Any,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
        intent: str,
    ) -> AnswerResponse:
        previous_question = (assessment.pending_question or "").strip() or None
        await self._persist_answer(
            assessment_id=assessment_id,
            answer=answer,
            covered_ids=[],
            axis_capabilities=axis_capabilities,
            question_text=previous_question,
        )
        clarification_question = await self._generate_intent_clarification_question(
            assessment_id=assessment_id,
            axis=axis,
            answer=answer,
            axis_capabilities=axis_capabilities,
            intent=intent,
            previous_question=previous_question,
        )

        if intent == "LOW_QUALITY":
            assessment.current_axis_question_count = int(assessment.current_axis_question_count or 0) + 1
            assessment.current_axis_low_quality_count = min(
                int(assessment.current_axis_low_quality_count or 0) + 1,
                self.max_extra_questions_per_axis,
            )
            await self.state.advance_if_axis_complete(
                assessment_id=assessment_id,
                assessment=assessment,
                max_extra_questions_per_axis=self.max_extra_questions_per_axis,
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
            self._next_clarification_count(assessment=assessment, intent=intent)
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

    async def _generate_intent_clarification_question(
        self,
        assessment_id: int,
        axis: str,
        answer: str,
        axis_capabilities: list[dict],
        intent: str,
        previous_question: str | None,
    ) -> str:
        focus = self._select_question_focus(axis=axis, axis_capabilities=axis_capabilities)
        primary_topic = focus["primary_topic"] if focus.get("primary_topic") else axis
        hint = self._intent_followup_hint(intent)
        focus_topic = self._build_followup_topic(
            primary_topic=primary_topic,
            related_topics=focus.get("related_topics") or [],
            hint=hint,
            axis=axis,
        )
        return await self.llm.generate_clarification_question(
            axis=axis,
            latest_user_answer=answer,
            hint=hint,
            missing_topic=focus_topic,
            history=await self._build_chat_history(assessment_id),
            concerned_question=previous_question,
        )

    def _select_question_focus(self, axis: str, axis_capabilities: list[dict]) -> dict:
        uncovered = [row for row in axis_capabilities if not row.get("covered")]
        if not uncovered:
            return {"primary_topic": axis, "related_topics": [], "question_guidelines": []}

        canonical_axis = normalize_axis_name(axis) or axis
        uncovered.sort(key=lambda row: (int(row.get("sort_order") or 9999), str(row.get("label") or "")))
        primary = str(uncovered[0].get("label") or canonical_axis)
        related = [str(row.get("label") or "") for row in uncovered[1:3] if str(row.get("label") or "").strip()]
        guidelines = [str(row.get("question_guidelines") or "").strip() for row in uncovered[:3] if str(row.get("question_guidelines") or "").strip()]
        return {
            "primary_topic": primary,
            "related_topics": related,
            "question_guidelines": guidelines,
        }

    def _intent_followup_hint(self, intent: str) -> str:
        if intent == "SOCIAL":
            return "social_signal"
        if intent == "CONFUSION":
            return "needs explanation"
        return "insufficient_evidence"

    def _next_clarification_count(self, assessment: Any, intent: str) -> int:
        if intent == "SOCIAL":
            return 0
        return int(assessment.clarification_count or 0) + 1

    async def _should_reset_followup(
        self,
        latest_user_answer: str,
        pending_hint: str,
        clarification_count: int,
    ) -> bool:
        if pending_hint == "social_signal":
            return True
        intent = await self.llm.route_user_intent(latest_user_answer)
        if intent == "RESUME":
            return True
        if pending_hint == "insufficient_evidence" and clarification_count >= self.max_insufficient_evidence_retries:
            return True
        if clarification_count >= self.max_clarifications_per_focus and pending_hint in {
            "needs explanation",
            "process_meta_signal",
        }:
            return True
        return False

    def _build_followup_topic(
        self,
        primary_topic: str | None,
        related_topics: list[str],
        hint: str,
        axis: str,
    ) -> str:
        topic = self._display_topic_label(primary_topic or axis)
        if hint in {"needs explanation", "insufficient_evidence", "social_signal", "process_meta_signal"}:
            return topic
        compact_related = [item.strip() for item in related_topics if item and item.strip()]
        if not compact_related:
            return topic
        return ", ".join(([topic] + [self._display_topic_label(item) for item in compact_related])[:2])

    def _display_topic_label(self, topic: str | None) -> str:
        return normalize_text(str(topic or "").replace("_", " ")).strip() or "this topic"

    async def _build_chat_history(self, assessment_id: int) -> list[ChatTurn]:
        history_messages = await self.answers.list_recent(
            assessment_id,
            limit=self.settings.llm_max_history_turns,
        )
        history: list[ChatTurn] = []
        for message in reversed(history_messages):
            history.append(ChatTurn(role="assistant", content=message.question))
            history.append(ChatTurn(role="user", content=message.answer))
        return history

    async def _record_non_scoring_turn(
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
        await self._persist_answer(
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
                self.max_extra_questions_per_axis,
            )
        if increment_question_count:
            await self.state.advance_if_axis_complete(
                assessment_id=assessment_id,
                assessment=assessment,
                max_extra_questions_per_axis=self.max_extra_questions_per_axis,
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

    async def _persist_answer(
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

    def _schedule_next_question_prefetch(self, assessment: Any) -> asyncio.Task[NextQuestionResponse | None] | None:
        if assessment.status != ASSESSMENT_STATUS_IN_PROGRESS:
            return None
        return asyncio.create_task(self._next_question(int(assessment.id)))

    async def _schedule_axis_memory_update(
        self,
        assessment_id: int,
        axis: str,
        answer: str,
        covered_ids: list[int],
        axis_capabilities: list[dict],
    ) -> asyncio.Task[str] | None:
        if not answer or not str(answer).strip():
            return None

        covered_labels = self._covered_labels_for_memory(
            covered_ids=covered_ids,
            axis_capabilities=axis_capabilities,
        )
        if not covered_labels:
            return None

        current = await self.axis_memory.get(assessment_id=assessment_id, axis=axis)
        current_summary = current.summary if current is not None else None
        return asyncio.create_task(
            self.llm.update_axis_memory(
                axis=axis,
                current_summary=current_summary,
                new_answer=answer,
                covered_labels=covered_labels,
            )
        )

    async def _finalize_parallel_llm_tasks(
        self,
        assessment_id: int,
        axis: str,
        memory_update_task: asyncio.Task[str] | None,
        next_question_task: asyncio.Task[NextQuestionResponse | None] | None,
    ) -> None:
        tasks = [task for task in (memory_update_task, next_question_task) if task is not None]
        if not tasks:
            return

        results = await asyncio.gather(*tasks, return_exceptions=True)
        result_by_task = dict(zip(tasks, results))

        if next_question_task is not None:
            next_question_result = result_by_task.get(next_question_task)
            if isinstance(next_question_result, BaseException):
                logger.error(
                    "Next question prefetch failed for assessment %s: %s",
                    assessment_id,
                    next_question_result,
                    exc_info=(type(next_question_result), next_question_result, next_question_result.__traceback__),
                )

        if memory_update_task is not None:
            await self._persist_axis_memory_result(
                assessment_id=assessment_id,
                axis=axis,
                result=result_by_task.get(memory_update_task),
            )

    async def _persist_scheduled_axis_memory_update(
        self,
        assessment_id: int,
        axis: str,
        memory_update_task: asyncio.Task[str] | None,
    ) -> None:
        if memory_update_task is None:
            return

        result = (await asyncio.gather(memory_update_task, return_exceptions=True))[0]
        await self._persist_axis_memory_result(assessment_id=assessment_id, axis=axis, result=result)

    async def _persist_axis_memory_result(
        self,
        assessment_id: int,
        axis: str,
        result: str | BaseException | None,
    ) -> None:
        if isinstance(result, BaseException):
            logger.error(
                "Axis memory update failed for assessment %s: %s",
                assessment_id,
                result,
                exc_info=(type(result), result, result.__traceback__),
            )
            return

        updated = str(result or "").strip()
        if not updated:
            return
        await self.axis_memory.upsert(assessment_id=assessment_id, axis=axis, summary=updated)

    async def _cancel_scheduled_axis_memory_update(self, memory_update_task: asyncio.Task[str] | None) -> None:
        if memory_update_task is None or memory_update_task.done():
            return
        memory_update_task.cancel()
        await asyncio.gather(memory_update_task, return_exceptions=True)

    async def _cancel_scheduled_next_question_prefetch(
        self,
        next_question_task: asyncio.Task[NextQuestionResponse | None] | None,
    ) -> None:
        if next_question_task is None or next_question_task.done():
            return
        next_question_task.cancel()
        await asyncio.gather(next_question_task, return_exceptions=True)

    def _covered_labels_for_memory(self, covered_ids: list[int], axis_capabilities: list[dict]) -> list[str]:
        covered_set = {int(capability_id) for capability_id in (covered_ids or [])}
        if not covered_set:
            return []

        label_by_id: dict[int, str] = {}
        for row in axis_capabilities or []:
            try:
                capability_id = int(row.get("id"))
            except Exception:
                continue
            label_by_id[capability_id] = str(row.get("label") or "").strip()

        return [label_by_id[capability_id] for capability_id in covered_ids if label_by_id.get(capability_id)]

    async def _update_axis_memory(
        self,
        assessment_id: int,
        axis: str,
        answer: str,
        covered_ids: list[int],
        axis_capabilities: list[dict],
    ) -> None:
        memory_update_task = await self._schedule_axis_memory_update(
            assessment_id=assessment_id,
            axis=axis,
            answer=answer,
            covered_ids=covered_ids,
            axis_capabilities=axis_capabilities,
        )
        await self._persist_scheduled_axis_memory_update(
            assessment_id=assessment_id,
            axis=axis,
            memory_update_task=memory_update_task,
        )


def build_assessment_conversation_service(
    db: AsyncSession,
    llm_service: LLMService | None = None,
    scoring_service: AssessmentScoringService | None = None,
    reporting_service: AssessmentReportingService | None = None,
    settings: Settings | None = None,
) -> AssessmentConversationService:
    resolved_settings = settings or get_settings()
    assessments = AssessmentRepository(db)
    capabilities = CapabilityRepository(db)
    answers = AssessmentAnswerRepository(db)
    axis_memory = AssessmentAxisMemoryRepository(db)
    idempotency = AssessmentIdempotencyRepository(db)
    llm = llm_service or build_llm_service(settings=resolved_settings)
    uow = AsyncUnitOfWork(db)
    state = AssessmentStateService(db, capabilities)
    scoring = scoring_service or build_assessment_scoring_service(
        db,
        assessments=assessments,
        capabilities=capabilities,
        settings=resolved_settings,
    )
    reporting = reporting_service or build_assessment_reporting_service(
        db,
        llm_service=llm,
        scoring_service=scoring,
        settings=resolved_settings,
    )
    return AssessmentConversationService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        answers=answers,
        axis_memory=axis_memory,
        idempotency=idempotency,
        llm_service=llm,
        uow=uow,
        state_service=state,
        scoring_service=scoring,
        reporting_service=reporting,
        settings=resolved_settings,
    )
