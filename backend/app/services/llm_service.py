from __future__ import annotations

import json
import logging
import re
from collections import OrderedDict
from dataclasses import asdict, dataclass, is_dataclass
from functools import wraps
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings, get_settings
from app.core.prompts_templates import (
    AXIS_CONSULTANT_GUIDANCE,
    SEMANTIC_PLAIN_LANGUAGE_INSTRUCTION,
    stage_discovery_guidance,
)
from app.core.text_normalization import normalize_text
from app.services.prompts import (
    BATCH_RECOMMENDATION_SYSTEM_PROMPT,
    BATCH_RECOMMENDATION_USER_TEMPLATE,
    CLARIFICATION_SYSTEM_PROMPT,
    COMPANY_CLASSIFICATION_SYSTEM_PROMPT,
    COVERAGE_SYSTEM_PROMPT,
    COVERAGE_USER_TEMPLATE,
    INTENT_ROUTER_SYSTEM_PROMPT,
    QUESTION_SYSTEM_PROMPT_GUIDED,
    QUESTION_SYSTEM_PROMPT_LIGHT,
    QUESTION_USER_TEMPLATE,
    RECOMMENDATION_SYSTEM_PROMPT,
    RECOMMENDATION_USER_TEMPLATE,
    REPORT_SYNTHESIS_SYSTEM_PROMPT,
    REPORT_SYNTHESIS_USER_TEMPLATE,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChatTurn:
    role: str
    content: str


def _freeze_for_cache(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, BaseModel):
        return _freeze_for_cache(value.model_dump(mode="json"))
    if is_dataclass(value) and not isinstance(value, type):
        return _freeze_for_cache(asdict(value))
    if isinstance(value, dict):
        return tuple(sorted((str(key), _freeze_for_cache(item)) for key, item in value.items()))
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_for_cache(item) for item in value)
    if isinstance(value, set):
        return tuple(sorted((_freeze_for_cache(item) for item in value), key=repr))
    return repr(value)


def async_lru_cache(maxsize: int = 128):
    def decorator(func):
        cache: OrderedDict[Any, Any] = OrderedDict()

        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            key = (id(getattr(self, "settings", None)), _freeze_for_cache(args), _freeze_for_cache(kwargs))
            if key in cache:
                cache.move_to_end(key)
                return cache[key]

            result = await func(self, *args, **kwargs)
            cache[key] = result
            cache.move_to_end(key)
            while len(cache) > maxsize:
                cache.popitem(last=False)
            return result

        return wrapper

    return decorator


class LLMService:
    _INTENT_LABELS = {"SOCIAL", "CONFUSION", "RESUME", "VALID_ANSWER", "LOW_QUALITY"}

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @async_lru_cache(maxsize=128)
    async def generate_question(
        self,
        axis: str,
        missing: list[str],
        history: list[ChatTurn],
        sector: str,
        latest_user_answer: str | None = None,
        transition_topic: str | None = None,
        related_topics: list[str] | None = None,
        memory_summary: str | None = None,
        question_guidelines: list[str] | None = None,
        conversation_stage: str = "intro",
        ask_evidence: bool = False,
        helper_mode: bool = False,
        prompt_profile: str = "consultant_guided",
    ) -> str:
        topic = transition_topic or (missing[0] if missing else "this axis")
        fallback = self._fallback_question(axis=axis, topic=topic)

        if not self.settings.mistral_api_key:
            logger.error("Cannot generate question because MISTRAL_API_KEY is not set.")
            return fallback

        messages = self._build_question_messages(
            axis=axis,
            missing=missing,
            sector=sector,
            history=history,
            latest_user_answer=latest_user_answer,
            transition_topic=transition_topic,
            related_topics=related_topics,
            memory_summary=memory_summary,
            question_guidelines=question_guidelines,
            conversation_stage=conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        try:
            text = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM question generation failed: %s", exc, exc_info=True)
            return fallback

        raw_candidate = self._clean_single_text(text)
        candidate = self._shape_consultative_text(raw_candidate or fallback)
        candidate = self._ensure_question_text(candidate, fallback, raw_text=raw_candidate)
        if self._is_duplicate_question(candidate, history):
            return self._ensure_question_text(fallback, fallback)
        return candidate

    async def route_user_intent(self, text: str) -> str:
        cleaned_text = self._clean_single_text(text)
        fast_intent = self._fast_route_intent(cleaned_text)
        if fast_intent is not None:
            return fast_intent

        if not self.settings.mistral_api_key:
            logger.error("Cannot route user intent because MISTRAL_API_KEY is not set.")
            return "LOW_QUALITY"

        messages = [
            {"role": "system", "content": INTENT_ROUTER_SYSTEM_PROMPT},
            {"role": "user", "content": f"<user_message>{cleaned_text}</user_message>"},
        ]
        try:
            raw_intent = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM intent routing failed: %s", exc, exc_info=True)
            return "LOW_QUALITY"

        intent = self._clean_single_text(raw_intent).upper()
        if intent not in self._INTENT_LABELS:
            logger.error("LLM returned invalid intent label: %r", raw_intent)
            return "LOW_QUALITY"
        return intent

    def _fast_route_intent(self, text: str) -> str | None:
        normalized = self._normalize_fast_intent_text(text)
        if self._is_negative_evidence_text(normalized):
            return "VALID_ANSWER"
        if self._is_confusion_request_text(normalized):
            return "CONFUSION"
        if normalized in {"ok", "oui", "suivant", "next", "continue"}:
            return "RESUME"
        if normalized in {"bonjour", "salut", "hello", "merci", "thanks"}:
            return "SOCIAL"
        return None

    def _normalize_fast_intent_text(self, text: str) -> str:
        value = self._clean_single_text(text).lower()
        value = re.sub(r"[^\w\s]", "", value)
        return re.sub(r"\s+", " ", value).strip()

    def _is_negative_evidence_answer(self, text: str) -> bool:
        return self._is_negative_evidence_text(self._normalize_fast_intent_text(text))

    def _is_negative_evidence_text(self, normalized_text: str) -> bool:
        if normalized_text in {
            "idk",
            "i dont know",
            "i do not know",
            "dont know",
            "do not know",
            "no idea",
            "pass",
            "skip",
            "none",
            "nothing",
            "no",
            "non",
            "not yet",
            "je ne sais pas",
            "j en sais rien",
            "aucun",
            "aucune",
            "rien",
            "pas encore",
        }:
            return True
        return any(
            re.search(pattern, normalized_text)
            for pattern in (
                r"\b(i|we|they|team|teams)\s+"
                r"(dont|do not|doesnt|does not|didnt|did not)\s+"
                r"(know|have|use|track|measure|collect|manage)\b",
                r"\b(no|not)\s+(formal\s+)?(process|owner|tool|tracking|system|cadence|routine)\b",
                r"\b(no|none)\s+(that\s+)?(i|we|they)\s+(know|know of|can share)\b",
                r"\b(pas de|aucun|aucune|sans)\s+(processus|outil|suivi|responsable|routine)\b",
                r"\b(nous navons pas|on na pas|je nai pas|il ny a pas)\b",
            )
        )

    def _is_confusion_request_text(self, normalized_text: str) -> bool:
        if normalized_text in {
            "explain",
            "explain please",
            "please explain",
            "what do you mean",
            "i dont understand",
            "i do not understand",
            "can you explain",
            "could you explain",
            "explique",
            "explique moi",
            "expliquez",
            "expliquez moi",
            "je ne comprends pas",
            "je comprends pas",
            "que voulez vous dire",
        }:
            return True
        return normalized_text.startswith(("explain ", "please explain ", "can you explain ", "could you explain "))

    async def generate_clarification_question(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        missing_topic: str | None = None,
        history: list[ChatTurn] | None = None,
        concerned_question: str | None = None,
    ) -> str:
        fallback = "Could you share one concrete example of how this works in practice today?"

        if not self.settings.mistral_api_key:
            logger.error("Cannot generate clarification question because MISTRAL_API_KEY is not set.")
            return fallback

        messages = self._build_clarification_messages(
            axis=axis,
            latest_user_answer=latest_user_answer,
            hint=hint,
            topic=(missing_topic or "this area").strip(),
            history=history or [],
            concerned_question=concerned_question,
        )
        try:
            text = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM clarification generation failed: %s", exc, exc_info=True)
            return fallback

        candidate = self._clean_single_text(text)
        if not candidate:
            logger.error("LLM clarification generation returned an empty response.")
            return fallback
        return self._shape_consultative_text(candidate)

    async def update_axis_memory(
        self,
        axis: str,
        current_summary: str | None,
        new_answer: str,
        covered_labels: list[str],
    ) -> str:
        if not self.settings.mistral_api_key:
            logger.error("Cannot update axis memory with LLM because MISTRAL_API_KEY is not set.")
            return (current_summary or "").strip()

        messages = self._build_memory_update_messages(axis, current_summary, new_answer, covered_labels)
        try:
            text = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM memory update failed: %s", exc, exc_info=True)
            return (current_summary or "").strip()
        return self._clean_memory_text(text) or (current_summary or "").strip()

    async def detect_coverage(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]] | None = None,
    ) -> dict:
        negative_evidence_coverage = self._build_negative_evidence_coverage(
            answer=answer,
            criteria=criteria,
            rubrics_by_capability=rubrics_by_capability or {},
        )
        if negative_evidence_coverage is not None:
            return negative_evidence_coverage

        if not self.settings.mistral_api_key:
            logger.error("Cannot detect coverage because MISTRAL_API_KEY is not set.")
            return {"covered": [], "confidence": None, "evidence_by_id": {}, "rationale_by_id": {}}

        allowed_ids = {int(c["id"]) for c in criteria if "id" in c}
        maturity_level_number_lookup = self._build_maturity_level_number_lookup(rubrics_by_capability or {})
        messages = self._build_coverage_messages(
            answer=answer,
            criteria=criteria,
            rubrics_by_capability=rubrics_by_capability or {},
        )

        parsed: CoverageResponse | None = None
        invalid_output = ""
        for attempt in range(2):
            try:
                invalid_output = await self._mistral_chat_messages(messages)
            except Exception as exc:
                logger.error("LLM coverage detection failed on attempt %s: %s", attempt + 1, exc, exc_info=True)
                break

            parsed = self._parse_coverage_json(invalid_output)
            if parsed is not None:
                break

            logger.error("LLM coverage detection returned invalid JSON on attempt %s: %r", attempt + 1, invalid_output)
            messages = self._build_coverage_fix_messages(
                answer=answer,
                criteria=criteria,
                rubrics_by_capability=rubrics_by_capability or {},
                invalid_output=invalid_output,
            )

        if parsed is None:
            return {"covered": [], "confidence": None, "evidence_by_id": {}, "rationale_by_id": {}}

        covered_ids: list[int] = []
        maturity_level_by_id: dict[int, int] = {}
        maturity_level_number_by_id: dict[int, int] = {}
        confidence_by_id: dict[int, float] = {}
        evidence_by_id: dict[int, str] = {}
        rationale_by_id: dict[int, str] = {}
        is_specific_and_actionable_by_id: dict[int, bool] = {}
        confidences: list[float] = []

        for item in parsed.covered_criteria:
            criterion_id = int(item.criterion_id)
            if criterion_id not in allowed_ids:
                continue
            covered_ids.append(criterion_id)
            if item.maturity_level_id is not None:
                maturity_level_id = int(item.maturity_level_id)
                maturity_level_by_id[criterion_id] = maturity_level_id
                maturity_level_number_by_id[criterion_id] = maturity_level_number_lookup.get(
                    maturity_level_id,
                    maturity_level_id,
                )
            confidence_by_id[criterion_id] = float(item.confidence)
            if item.evidence:
                evidence_by_id[criterion_id] = item.evidence
            if item.rationale:
                rationale_by_id[criterion_id] = item.rationale
            is_specific_and_actionable_by_id[criterion_id] = bool(item.is_specific_and_actionable)
            confidences.append(float(item.confidence))

        avg_confidence = (sum(confidences) / len(confidences)) if confidences else None
        return {
            "covered": covered_ids,
            "maturity_level_by_id": maturity_level_by_id,
            "maturity_level_number_by_id": maturity_level_number_by_id,
            "confidence_by_id": confidence_by_id,
            "confidence": avg_confidence,
            "evidence_by_id": evidence_by_id,
            "rationale_by_id": rationale_by_id,
            "is_specific_and_actionable_by_id": is_specific_and_actionable_by_id,
        }

    @async_lru_cache(maxsize=64)
    async def classify_company(self, company_name: str, sector_options: list[dict], size_options: list[dict]) -> dict:
        if not self.settings.mistral_api_key:
            logger.error("Cannot classify company because MISTRAL_API_KEY is not set.")
            return self._fallback_company_classification(sector_options, size_options)

        messages = self._build_company_classification_messages(company_name, sector_options, size_options)
        try:
            content = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM company classification failed: %s", exc, exc_info=True)
            return self._fallback_company_classification(sector_options, size_options)

        data = self._extract_json(content) or {}
        sector_code = str(data.get("sector_code") or "").strip().lower()
        size_code = str(data.get("company_size_code") or "").strip().lower()
        allowed_sectors = {str(o.get("code", "")).strip().lower() for o in sector_options}
        allowed_sizes = {str(o.get("code", "")).strip().lower() for o in size_options}

        if sector_code not in allowed_sectors:
            logger.error("Invalid sector_code returned by LLM: %r", sector_code)
            return self._fallback_company_classification(sector_options, size_options)
        if size_code not in allowed_sizes:
            logger.error("Invalid company_size_code returned by LLM: %r", size_code)
            return self._fallback_company_classification(sector_options, size_options)
        return {"sector_code": sector_code, "company_size_code": size_code}

    async def generate_recommendation(
        self,
        axis: str,
        capability: str,
        maturity_label: str,
        confidence: float | None,
        justification: str | None,
        recommendation_guideline: str | None,
        priority_hint: str | None,
        business_impact: str | None,
        tone_hint: str | None,
        supporting_notes: str | None = None,
    ) -> str:
        fallback_parts = [
            (recommendation_guideline or "").strip(),
            (business_impact or "").strip(),
        ]
        fallback = " ".join(part for part in fallback_parts if part).strip() or "No recommendation available yet."

        if not self.settings.mistral_api_key:
            logger.error("Cannot generate recommendation because MISTRAL_API_KEY is not set.")
            return fallback

        user = RECOMMENDATION_USER_TEMPLATE.format(
            axis=axis,
            capability=capability,
            maturity_label=maturity_label,
            confidence=f"{confidence:.2f}" if confidence is not None else "n/a",
            justification=(justification or "n/a"),
            recommendation_guideline=(recommendation_guideline or "n/a"),
            priority_hint=(priority_hint or "n/a"),
            business_impact=(business_impact or "n/a"),
            tone_hint=(tone_hint or "balanced"),
            supporting_notes=(supporting_notes or "n/a"),
        )
        try:
            text = await self._mistral_chat_messages(
                [{"role": "system", "content": RECOMMENDATION_SYSTEM_PROMPT}, {"role": "user", "content": user}]
            )
        except Exception as exc:
            logger.error("LLM recommendation generation failed: %s", exc, exc_info=True)
            return fallback
        return self._clean_single_text(text) or fallback

    async def generate_recommendations_batch(
        self,
        assessment_id: int,
        items: list[dict[str, Any]],
        language: str = "en",
        max_actions_per_capability: int | None = None,
        tone: str = "practical",
        max_words_per_capability: int | None = None,
    ) -> dict[int, dict[str, Any]]:
        if not items:
            return {}
        if not self.settings.mistral_api_key:
            logger.error("Cannot generate batch recommendations because MISTRAL_API_KEY is not set.")
            return {}
        max_actions_per_capability = max_actions_per_capability or self.settings.MAX_ACTIONS_PER_CAPABILITY
        max_words_per_capability = max_words_per_capability or self.settings.MAX_WORDS_PER_CAPABILITY

        user = BATCH_RECOMMENDATION_USER_TEMPLATE.format(
            assessment_id=assessment_id,
            language=language,
            max_actions=max_actions_per_capability,
            tone=tone,
            max_words=max_words_per_capability,
            items_json=json.dumps(items, ensure_ascii=False),
        )
        messages = [
            {"role": "system", "content": BATCH_RECOMMENDATION_SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]
        try:
            content = await self._mistral_chat_messages(messages)
        except Exception as exc:
            logger.error("LLM batch recommendation generation failed: %s", exc, exc_info=True)
            return {}

        parsed = self._parse_batch_recommendation_json(content)
        if parsed is None:
            logger.error("LLM batch recommendation response was not valid JSON: %r", content)
            return {}

        return {
            int(item.capability_id): {
                "status": item.status,
                "title": item.title,
                "why_this": item.why_this,
                "evidence_used": item.evidence_used,
                "primary_action": item.primary_action,
                "secondary_action": item.secondary_action,
                "expected_impact": item.expected_impact,
                "clarification_question": item.clarification_question,
            }
            for item in parsed.results
        }

    @async_lru_cache(maxsize=32)
    async def generate_report_synthesis(
        self,
        company_name: str,
        overall_maturity_band: str,
        overall_score_percent: float,
        strongest_axis: str,
        priority_axis: str,
        strengths_count: int,
        pain_points_count: int,
        axes: list[dict[str, Any]],
        strengths: list[dict[str, Any]],
        pain_points: list[dict[str, Any]],
    ) -> dict[str, str | None]:
        fallback_summary = (
            f"{company_name} is currently at {overall_maturity_band} maturity "
            f"({round(overall_score_percent)}%). {strongest_axis} is the strongest axis today, "
            f"while {priority_axis} represents the main improvement priority."
        )
        fallback_priority = f"The next step is to strengthen execution in {priority_axis} with a focused improvement plan."

        if not self.settings.mistral_api_key:
            raise RuntimeError("Cannot generate report synthesis because MISTRAL_API_KEY is not set.")

        user = REPORT_SYNTHESIS_USER_TEMPLATE.format(
            company_name=company_name,
            overall_maturity_band=overall_maturity_band,
            overall_score_percent=round(overall_score_percent, 2),
            strongest_axis=strongest_axis,
            priority_axis=priority_axis,
            strengths_count=strengths_count,
            pain_points_count=pain_points_count,
            axes_lines=self._format_report_items(axes[:6]),
            strengths_lines=self._format_report_theme_lines(strengths[:3]),
            pain_points_lines=self._format_report_theme_lines(pain_points[:3]),
        )
        try:
            content = await self._mistral_chat_messages(
                [
                    {"role": "system", "content": REPORT_SYNTHESIS_SYSTEM_PROMPT},
                    {"role": "user", "content": user},
                ]
            )
        except Exception as exc:
            logger.error("LLM report synthesis failed: %s", exc, exc_info=True)
            raise

        blob = self._extract_json(content)
        if not isinstance(blob, dict):
            logger.error("LLM report synthesis returned invalid JSON: %r", content)
            raise ValueError("LLM report synthesis returned invalid JSON.")
        try:
            parsed = ReportSynthesisResponse.model_validate(blob)
        except ValidationError as exc:
            logger.error("LLM report synthesis schema validation failed: %s", exc, exc_info=True)
            raise

        return {
            "executive_summary": self._clean_single_text(parsed.executive_summary or "") or fallback_summary,
            "priority_message": self._clean_single_text(parsed.priority_message or "") or fallback_priority,
        }

    async def is_confusion_signal(self, answer: str) -> bool:
        return (await self.route_user_intent(answer)) == "CONFUSION"

    async def is_social_signal(self, answer: str) -> bool:
        return (await self.route_user_intent(answer)) == "SOCIAL"

    async def is_resume_signal(self, answer: str) -> bool:
        return (await self.route_user_intent(answer)) == "RESUME"

    async def is_process_meta_signal(self, answer: str) -> bool:
        return (await self.route_user_intent(answer)) == "CONFUSION"

    def _build_question_messages(
        self,
        axis: str,
        missing: list[str],
        sector: str,
        history: list[ChatTurn],
        latest_user_answer: str | None,
        transition_topic: str | None,
        related_topics: list[str] | None,
        memory_summary: str | None,
        question_guidelines: list[str] | None = None,
        conversation_stage: str = "intro",
        ask_evidence: bool = False,
        helper_mode: bool = False,
        prompt_profile: str = "consultant_guided",
    ) -> list[dict[str, str]]:
        readable_missing = [self._display_topic_label(item) for item in missing[:12]]
        readable_related = [self._display_topic_label(item) for item in (related_topics or [])[:4]]
        readable_transition_topic = self._display_topic_label(transition_topic or (missing[0] if missing else axis))
        guidelines = [item.strip() for item in (question_guidelines or []) if item and item.strip()]

        user = QUESTION_USER_TEMPLATE.format(
            sector=sector,
            axis=axis,
            transition_topic=readable_transition_topic,
            related_topics="\n".join(f"- {topic}" for topic in readable_related) or "- (none)",
            axis_guidance=AXIS_CONSULTANT_GUIDANCE,
            stage_guidance=stage_discovery_guidance(
                conversation_stage=conversation_stage,
                focus=readable_transition_topic,
            ),
            latest_user_answer=(latest_user_answer or "n/a"),
            anchor_block=self._build_anchor_block(memory_summary, latest_user_answer),
            missing_list="\n".join(f"- {item}" for item in readable_missing) or "- (none)",
            conversation_stage=conversation_stage,
            ask_evidence=("yes" if ask_evidence else "no"),
            guidelines_block=self._build_question_guidelines_block(guidelines),
            memory_block=self._build_memory_block(memory_summary),
            helper_block=(
                "<helper_mode>User may be confused. Explain briefly before asking the question.</helper_mode>\n"
                if helper_mode
                else ""
            ),
        )
        system_prompt = self._question_system_prompt(prompt_profile)
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        messages.append({"role": "user", "content": user})
        return messages

    def _question_system_prompt(self, prompt_profile: str) -> str:
        base_prompt = QUESTION_SYSTEM_PROMPT_LIGHT if prompt_profile == "llm_reasoning_light" else QUESTION_SYSTEM_PROMPT_GUIDED
        return f"{base_prompt}\n<semantic_language_instruction>{SEMANTIC_PLAIN_LANGUAGE_INSTRUCTION}</semantic_language_instruction>"

    def _build_clarification_messages(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        topic: str,
        history: list[ChatTurn],
        concerned_question: str | None = None,
    ) -> list[dict[str, str]]:
        recent_assistant = [turn.content for turn in history if turn.role.lower() == "assistant"][-5:]
        user = (
            "<clarification_context>\n"
            f"<axis>{axis}</axis>\n"
            f"<routing_hint>{hint or 'none'}</routing_hint>\n"
            f"<focus_topic>{topic}</focus_topic>\n"
            f"<question_to_clarify>{concerned_question or 'n/a'}</question_to_clarify>\n"
            f"<latest_user_message>{latest_user_answer}</latest_user_message>\n"
            "<recent_assistant_messages>\n"
            + "\n".join(f"<message>{message}</message>" for message in recent_assistant)
            + "\n</recent_assistant_messages>\n"
            "</clarification_context>\n"
            "<instruction>Write the next clarification message now.</instruction>"
        )
        return [{"role": "system", "content": CLARIFICATION_SYSTEM_PROMPT}, {"role": "user", "content": user}]

    def _build_anchor_block(self, memory_summary: str | None, latest_user_answer: str | None) -> str:
        memory = self._clean_memory_text(memory_summary or "")
        if not memory:
            return ""

        lines = [line.strip(" -") for line in memory.split("\n") if line.strip()]
        anchor_lines = [line for line in lines[:2] if line]
        if latest_user_answer:
            latest_clean = self._clean_single_text(latest_user_answer).lower()
            anchor_lines = [
                line
                for line in anchor_lines
                if self._clean_single_text(line).lower() not in latest_clean
            ] or lines[:1]

        joined = "\n".join(f"- {line}" for line in anchor_lines[:2])
        return (
            "<known_facts>\n"
            f"{joined}\n"
            "</known_facts>\n"
            "<known_facts_instruction>Use these facts only to ask a more specific follow-up.</known_facts_instruction>\n"
        )

    def _build_question_guidelines_block(self, guidelines: list[str]) -> str:
        if not guidelines:
            return ""
        primary_guideline = guidelines[0]
        related_guidelines = "\n".join(
            f"<related_capability_question_guideline>{item}</related_capability_question_guideline>"
            for item in guidelines[1:12]
        )
        return (
            "<admin_question_guidelines>\n"
            "<guideline_instruction>"
            "The primary_missing_capability_question_guideline comes from the database Question_Guidelines "
            "for the first missing capability. Use it as the main questioning strategy."
            "</guideline_instruction>\n"
            f"<primary_missing_capability_question_guideline>{primary_guideline}</primary_missing_capability_question_guideline>\n"
            f"{related_guidelines}\n"
            "</admin_question_guidelines>\n"
        )

    def _build_memory_block(self, memory_summary: str | None) -> str:
        memory = self._clean_memory_text(memory_summary or "")
        if not memory:
            return ""
        return f"<axis_memory>\n{memory}\n</axis_memory>\n"

    def _format_report_items(self, items: list[dict[str, Any]]) -> str:
        lines = [
            f"- {item.get('axis')}: {item.get('score_percent')}% ({item.get('maturity_band')})"
            for item in items
        ]
        return "\n".join(lines) or "- none"

    def _format_report_theme_lines(self, items: list[dict[str, Any]]) -> str:
        lines = [
            "- "
            f"{item.get('capability')} [{item.get('axis')}] "
            f"confidence={item.get('confidence_label') or 'unknown'} "
            f"evidence={item.get('evidence_strength') or 'unknown'}: "
            f"{item.get('rationale') or 'No rationale provided'}"
            for item in items
        ]
        return "\n".join(lines) or "- none"

    def _build_company_classification_messages(
        self,
        company_name: str,
        sector_options: list[dict],
        size_options: list[dict],
    ) -> list[dict[str, str]]:
        sectors_text = "\n".join(f"- code={o['code']} label={o['label']}" for o in sector_options[:200])
        sizes_text = "\n".join(f"- code={o['code']} label={o['label']}" for o in size_options[:200])
        user = (
            f"Company name: {company_name}\n\n"
            "Sector options:\n"
            f"{sectors_text}\n\n"
            "Company size options:\n"
            f"{sizes_text}\n\n"
            "Return JSON:\n"
            '{ "sector_code": "retail", "company_size_code": "small" }'
        )
        return [{"role": "system", "content": COMPANY_CLASSIFICATION_SYSTEM_PROMPT}, {"role": "user", "content": user}]

    def _fallback_company_classification(self, sector_options: list[dict], size_options: list[dict]) -> dict:
        return {
            "sector_code": self._fallback_option_code(sector_options),
            "company_size_code": self._fallback_option_code(size_options),
        }

    def _fallback_option_code(self, options: list[dict]) -> str:
        if not options:
            raise ValueError("Cannot fallback company classification because reference options are empty.")
        normalized_options = [
            (str(option.get("code", "")).strip().lower(), option)
            for option in options
            if str(option.get("code", "")).strip()
        ]
        if not normalized_options:
            raise ValueError("Cannot fallback company classification because reference option codes are empty.")
        for preferred in ("other", "unknown", "general"):
            for code, _option in normalized_options:
                if code == preferred:
                    return code
        return normalized_options[0][0]

    def _build_negative_evidence_coverage(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]],
    ) -> dict | None:
        if not self._is_negative_evidence_answer(answer):
            return None

        criterion = self._select_primary_criterion_for_negative_evidence(criteria)
        if criterion is None:
            return None

        criterion_id = int(criterion["id"])
        maturity_level_id = self._level_one_maturity_level_id(
            criterion_id=criterion_id,
            rubrics_by_capability=rubrics_by_capability,
        )
        confidence = self.settings.scoring_default_confidence_if_covered
        evidence = "User stated they don't know or don't have a process."
        rationale = "Negative evidence is a valid Level 1 maturity signal for the current capability."
        return {
            "covered": [criterion_id],
            "maturity_level_by_id": {criterion_id: maturity_level_id},
            "maturity_level_number_by_id": {criterion_id: 1},
            "confidence_by_id": {criterion_id: confidence},
            "confidence": confidence,
            "evidence_by_id": {criterion_id: evidence},
            "rationale_by_id": {criterion_id: rationale},
            "is_specific_and_actionable_by_id": {criterion_id: True},
        }

    def _select_primary_criterion_for_negative_evidence(self, criteria: list[dict]) -> dict | None:
        eligible = [
            criterion
            for criterion in criteria
            if criterion.get("id") is not None and not criterion.get("covered")
        ]
        if not eligible:
            eligible = [criterion for criterion in criteria if criterion.get("id") is not None]
        if not eligible:
            return None
        eligible.sort(
            key=lambda criterion: (
                int(criterion.get("sort_order") or 9999),
                str(criterion.get("label") or ""),
            )
        )
        return eligible[0]

    def _level_one_maturity_level_id(
        self,
        criterion_id: int,
        rubrics_by_capability: dict[int, list[dict]],
    ) -> int:
        for rubric in rubrics_by_capability.get(criterion_id) or []:
            if int(rubric.get("maturity_level_number") or rubric.get("maturity_level_id") or 0) == 1:
                return int(rubric.get("maturity_level_id") or 1)
        for rubrics in rubrics_by_capability.values():
            for rubric in rubrics or []:
                if int(rubric.get("maturity_level_number") or rubric.get("maturity_level_id") or 0) == 1:
                    return int(rubric.get("maturity_level_id") or 1)
        return 1

    def _build_coverage_messages(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]],
    ) -> list[dict[str, str]]:
        criteria_lines = "\n".join(
            (
                f"- id={criterion['id']}: {criterion['label']}"
                f" | expected_evidence: {criterion.get('expected_evidence') or 'not provided'}"
            )
            for criterion in criteria[:50]
        )
        rubric_lines: list[str] = []
        for criterion in criteria[:50]:
            criterion_id = int(criterion["id"])
            for rubric in rubrics_by_capability.get(criterion_id) or []:
                rubric_lines.append(
                    f"- capability_id={criterion_id} "
                    f"maturity_level_id={rubric.get('maturity_level_id')} "
                    f"level_number={rubric.get('maturity_level_number') or rubric.get('maturity_level_id')}: "
                    f"{rubric.get('description')}"
                )

        user = COVERAGE_USER_TEMPLATE.format(
            criteria_lines=criteria_lines,
            rubrics_lines=("\n".join(rubric_lines) if rubric_lines else "- (none provided)"),
            answer=answer,
        )
        return [{"role": "system", "content": COVERAGE_SYSTEM_PROMPT}, {"role": "user", "content": user}]

    def _build_maturity_level_number_lookup(self, rubrics_by_capability: dict[int, list[dict]]) -> dict[int, int]:
        lookup: dict[int, int] = {}
        for rubrics in rubrics_by_capability.values():
            for rubric in rubrics or []:
                maturity_level_id = rubric.get("maturity_level_id")
                if maturity_level_id is None:
                    continue
                lookup[int(maturity_level_id)] = int(rubric.get("maturity_level_number") or maturity_level_id)
        return lookup

    def _build_coverage_fix_messages(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]],
        invalid_output: str,
    ) -> list[dict[str, str]]:
        messages = self._build_coverage_messages(answer, criteria, rubrics_by_capability)
        messages.append(
            {
                "role": "user",
                "content": (
                    "Your previous response was invalid.\n"
                    "Return only valid JSON matching the schema exactly.\n"
                    "Do not include markdown, code fences, or extra keys.\n"
                    f"Invalid output:\n{invalid_output}"
                ),
            }
        )
        return messages

    def _build_memory_update_messages(
        self,
        axis: str,
        current_summary: str | None,
        new_answer: str,
        covered_labels: list[str],
    ) -> list[dict[str, str]]:
        covered = "\n".join(f"- {label}" for label in covered_labels[:12]) or "- (none)"
        user = (
            f"Axis: {axis}\n\n"
            f"Current memory:\n{(current_summary or '').strip()}\n\n"
            f"User answer:\n{new_answer}\n\n"
            f"Newly covered criteria labels:\n{covered}\n\n"
            "Return updated memory:"
        )
        system = (
            "You maintain a compact, highly actionable memory for a CX assessment axis.\n"
            "Update the memory with new facts from the user's answer.\n"
            "CRITICAL: You MUST explicitly extract and retain any of the following if mentioned:\n"
            "- Tools, software, or channels (e.g., Salesforce, Excel, CRM, email, Jira).\n"
            "- Specific roles, titles, or departments (e.g., CX Lead, IT Manager, Store Director).\n"
            "- Rhythms, cadences, or frequencies (e.g., weekly, monthly, ad hoc).\n"
            "- Explicit absences of process (e.g., 'no formal KPIs', 'we don't track this').\n"
            "Keep it short (max 8 lines), factual, no fluff.\n"
            "Format each fact as a simple bullet point (-).\n"
            "Return only the updated memory text, no markdown."
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def _history_to_messages(self, history: list[ChatTurn]) -> list[dict[str, str]]:
        selected: list[dict[str, str]] = []
        total_chars = 0

        for turn in reversed(history[-self.settings.llm_max_history_turns :]):
            role = turn.role.strip().lower()
            if role not in ("user", "assistant"):
                continue
            content = (turn.content or "").strip()
            if not content:
                continue
            if total_chars + len(content) > self.settings.llm_max_history_chars:
                continue
            total_chars += len(content)
            selected.append({"role": role, "content": content})

        return list(reversed(selected))

    def _is_duplicate_question(self, candidate: str, history: list[ChatTurn]) -> bool:
        normalized_candidate = self._normalize_for_match(candidate)
        if not normalized_candidate:
            return False
        recent_assistant_questions = [
            self._normalize_for_match(turn.content)
            for turn in history
            if turn.role.strip().lower() == "assistant"
        ][-6:]
        return normalized_candidate in recent_assistant_questions

    def _normalize_for_match(self, text: str) -> str:
        value = self._clean_single_text(text).lower()
        value = re.sub(r"[^a-z0-9\s]", "", value)
        return re.sub(r"\s+", " ", value).strip()

    def _fallback_question(self, axis: str, topic: str) -> str:
        displayed_topic = self._display_topic_label(topic or axis)
        return f"Can you share one recent example of how this works today around {displayed_topic}?"

    def _display_topic_label(self, topic: str | None) -> str:
        return self._clean_single_text(str(topic or "").replace("_", " ")) or "this topic"

    def _shape_consultative_text(self, text: str) -> str:
        candidate = self._clean_single_text(text)
        if not candidate:
            return candidate
        if "?" in candidate:
            candidate = candidate[: candidate.find("?") + 1].strip()
        else:
            parts = re.split(r"(?<=[.!])\s+", candidate)
            candidate = " ".join(parts[:2]).strip()
        if len(candidate) > 260:
            candidate = candidate[:257].rstrip(" ,;:") + "..."
        if not candidate.endswith((".", "?", "!")):
            candidate = candidate.rstrip() + "."
        return candidate

    def _ensure_question_text(self, text: str, fallback: str, raw_text: str | None = None) -> str:
        candidate = self._clean_single_text(text)
        fallback_question = self._clean_single_text(fallback)
        if "?" not in fallback_question:
            fallback_question = fallback_question.rstrip(" .!:;") + "?"

        raw_candidate = self._clean_single_text(raw_text or "") if raw_text is not None else None
        if raw_candidate is not None and not raw_candidate:
            logger.warning("LLM question generation returned an empty response; using fallback question.")
            return fallback_question

        if "?" in candidate and (raw_candidate is None or "?" in raw_candidate):
            return candidate[: candidate.find("?") + 1].strip()

        if self._looks_like_direct_question(candidate):
            return candidate.rstrip(" .!:;") + "?"

        logger.warning("LLM question generation did not include a direct question; appending fallback question.")
        intro = candidate.rstrip(" ?.!:;")
        if not intro:
            return fallback_question

        combined = f"{intro}. {fallback_question}"
        if len(combined) <= 280:
            return combined
        return fallback_question

    def _looks_like_direct_question(self, text: str) -> bool:
        normalized = self._clean_single_text(text).lower()
        question_starters = (
            "can ",
            "could ",
            "would ",
            "what ",
            "how ",
            "who ",
            "when ",
            "where ",
            "which ",
            "do ",
            "does ",
            "did ",
            "is ",
            "are ",
            "can you ",
            "could you ",
            "pouvez-vous ",
            "pouvez vous ",
            "comment ",
            "quel ",
            "quelle ",
            "quels ",
            "quelles ",
            "qui ",
            "ou ",
            "où ",
            "quand ",
            "est-ce ",
            "est ce ",
        )
        return normalized.startswith(question_starters) or bool(
            re.search(
                r":\s*(can|could|would|what|how|who|when|where|which|do|does|did|is|are|"
                r"pouvez[- ]vous|comment|quel|quelle|quels|quelles|qui|ou|où|quand|est[- ]ce)\b",
                normalized,
            )
        )

    async def _mistral_chat_messages(self, messages: list[dict[str, str]]) -> str:
        import httpx  # type: ignore

        url = self.settings.mistral_base_url.rstrip("/") + "/chat/completions"
        payload: dict[str, Any] = {
            "model": self.settings.mistral_model,
            "temperature": self.settings.llm_temperature,
            "messages": messages,
        }
        if self.settings.llm_max_tokens is not None:
            payload["max_tokens"] = self.settings.llm_max_tokens

        async with httpx.AsyncClient(timeout=self.settings.llm_request_timeout_seconds) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {self.settings.mistral_api_key}"},
            )
            response.raise_for_status()
            data = response.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""

    def _extract_json(self, text: str) -> dict | None:
        decoder = json.JSONDecoder()
        for index, char in enumerate(text or ""):
            if char != "{":
                continue
            try:
                value, _end = decoder.raw_decode(text[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                return value
        return None

    def _clean_single_text(self, text: str | None) -> str:
        value = normalize_text(text)
        if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")):
            value = value[1:-1].strip()
        return re.sub(r"\s+", " ", value).strip()

    def _clean_memory_text(self, text: str | None) -> str:
        value = normalize_text(text)
        value = value.replace("\r\n", "\n").replace("\r", "\n")
        value = re.sub(r"^```[a-zA-Z]*\n?", "", value).strip()
        value = re.sub(r"\n?```$", "", value).strip()
        lines = [line.strip() for line in value.split("\n") if line.strip()]
        return "\n".join(lines[:8]).strip()

    def _parse_coverage_json(self, text: str) -> CoverageResponse | None:
        blob = self._extract_json(text)
        if not isinstance(blob, dict):
            return None
        try:
            return CoverageResponse.model_validate(blob)
        except ValidationError as exc:
            logger.error("Coverage JSON schema validation failed: %s", exc, exc_info=True)
            return None

    def _parse_batch_recommendation_json(self, text: str) -> BatchRecommendationResponse | None:
        blob = self._extract_json(text)
        if not isinstance(blob, dict):
            return None
        try:
            return BatchRecommendationResponse.model_validate(blob)
        except ValidationError as exc:
            logger.error("Batch recommendation JSON schema validation failed: %s", exc, exc_info=True)
            return None


class CoveredCriterionItem(BaseModel):
    criterion_id: int
    maturity_level_id: int | None = Field(default=None, ge=1)
    confidence: float = Field(ge=0.0, le=1.0)
    is_specific_and_actionable: bool = Field(
        description=(
            "True ONLY IF the evidence contains specific, concrete actions or tools mentioned by the user. "
            "False if the answer is vague (e.g., 'we use KPIs'), generic, or if you had to guess/imply their process."
        )
    )
    evidence: str | None = None
    rationale: str | None = None


class CoverageResponse(BaseModel):
    covered_criteria: list[CoveredCriterionItem] = Field(default_factory=list)


class BatchRecommendationItem(BaseModel):
    capability_id: int
    status: str = Field(pattern="^(ok|needs_clarification)$")
    title: str | None = None
    why_this: str | None = None
    evidence_used: list[str] = Field(default_factory=list)
    primary_action: str | None = None
    secondary_action: str | None = None
    expected_impact: str | None = None
    clarification_question: str | None = None


class BatchRecommendationResponse(BaseModel):
    results: list[BatchRecommendationItem] = Field(default_factory=list)


class ReportSynthesisResponse(BaseModel):
    executive_summary: str | None = None
    priority_message: str | None = None


def build_llm_service(settings: Settings | None = None) -> LLMService:
    return LLMService(settings=settings or get_settings())
