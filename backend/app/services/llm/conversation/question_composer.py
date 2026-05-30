from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable
from html import escape
from typing import Any

from app.core.config import Settings
from app.core.prompts_templates import (
    AXIS_CONSULTANT_GUIDANCE,
    stage_discovery_guidance,
)
from app.services.llm.prompts import (
    CLARIFICATION_SYSTEM_PROMPT,
    QUESTION_SYSTEM_PROMPT_GUIDED,
    QUESTION_USER_TEMPLATE,
)

logger = logging.getLogger(__name__)


class QuestionComposerService:
    """Question and clarification generation with formatting safety guards."""

    def __init__(
        self,
        settings: Settings,
        chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
        clean_text: Callable[[str | None], str],
        clean_memory_text: Callable[[str | None], str],
    ) -> None:
        self.settings = settings
        self._chat_messages = chat_messages
        self._clean_text = clean_text
        self._clean_memory_text = clean_memory_text

    async def generate_question(
        self,
        axis: str,
        missing: list[str],
        history: list[Any],
        sector: str,
        latest_user_answer: str | None = None,
        transition_topic: str | None = None,
        related_topics: list[str] | None = None,
        memory_summary: str | None = None,
        axis_description: str | None = None,
        axis_question_guidelines: str | None = None,
        question_guidelines: list[str] | None = None,
        maturity_rubrics: list[dict] | None = None,
        conversation_stage: str = "intro",
        ask_evidence: bool = False,
        helper_mode: bool = False,
        prompt_profile: str = "consultant_guided",
    ) -> str:
        topic = transition_topic or (missing[0] if missing else "this axis")
        fallback = self._fallback_question(
            axis=axis,
            topic=topic,
            question_guidelines=question_guidelines,
            maturity_rubrics=maturity_rubrics,
        )

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
            axis_description=axis_description,
            axis_question_guidelines=axis_question_guidelines,
            question_guidelines=question_guidelines,
            maturity_rubrics=maturity_rubrics,
            conversation_stage=conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        try:
            text = await self._chat_messages(messages)
        except Exception as exc:
            logger.error("LLM question generation failed: %s", exc, exc_info=True)
            return fallback

        raw_candidate = self._clean_text(text)
        candidate = self._shape_consultative_text(raw_candidate or fallback)
        candidate = self._ensure_question_text(candidate, fallback, raw_text=raw_candidate)
        candidate = self._reduce_stacked_question(candidate)
        if self._is_duplicate_question(candidate, history):
            return self._ensure_question_text(fallback, fallback)
        return candidate

    async def generate_clarification_question(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        sector: str | None = None,
        company_scope: str | None = None,
        missing_topic: str | None = None,
        history: list[Any] | None = None,
        concerned_question: str | None = None,
    ) -> str:
        fallback = "Could you say in one sentence how this works today?"

        if not self.settings.mistral_api_key:
            logger.error("Cannot generate clarification question because MISTRAL_API_KEY is not set.")
            return fallback

        messages = self._build_clarification_messages(
            axis=axis,
            latest_user_answer=latest_user_answer,
            hint=hint,
            sector=sector,
            company_scope=company_scope,
            topic=(missing_topic or "this area").strip(),
            history=history or [],
            concerned_question=concerned_question,
        )
        try:
            text = await self._chat_messages(messages)
        except Exception as exc:
            logger.error("LLM clarification generation failed: %s", exc, exc_info=True)
            return fallback

        candidate = self._clean_text(text)
        if not candidate:
            logger.error("LLM clarification generation returned an empty response.")
            return fallback
        return self._reduce_stacked_question(self._shape_consultative_text(candidate))

    def _build_question_messages(
        self,
        axis: str,
        missing: list[str],
        sector: str,
        history: list[Any],
        latest_user_answer: str | None,
        transition_topic: str | None,
        related_topics: list[str] | None,
        memory_summary: str | None,
        question_guidelines: list[str] | None = None,
        maturity_rubrics: list[dict] | None = None,
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
            axis_description=self._clean_text(axis_description or "not provided"),
            transition_topic=readable_transition_topic,
            related_topics="\n".join(f"- {topic}" for topic in readable_related) or "- (none)",
            axis_guidance=AXIS_CONSULTANT_GUIDANCE,
            axis_guidelines_block=self._build_axis_guidelines_block(axis_question_guidelines),
            stage_guidance=stage_discovery_guidance(
                conversation_stage=conversation_stage,
                focus=readable_transition_topic,
            ),
            latest_user_answer=(latest_user_answer or "n/a"),
            anchor_block=self._build_anchor_block(
                memory_summary,
                latest_user_answer,
                readable_transition_topic,
            ),
            missing_list="\n".join(f"- {item}" for item in readable_missing) or "- (none)",
            conversation_stage=conversation_stage,
            ask_evidence=("yes" if ask_evidence else "no"),
            guidelines_block=self._build_question_guidelines_block(guidelines),
            maturity_rubric_block=self._build_maturity_rubric_block(maturity_rubrics or []),
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
        return QUESTION_SYSTEM_PROMPT_GUIDED

    def _build_clarification_messages(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        sector: str | None,
        company_scope: str | None,
        topic: str,
        history: list[Any],
        concerned_question: str | None = None,
    ) -> list[dict[str, str]]:
        recent_assistant = [
            str(getattr(turn, "content", ""))
            for turn in history
            if str(getattr(turn, "role", "")).lower() == "assistant"
        ][-5:]
        user = (
            "<clarification_context>\n"
            f"<axis>{axis}</axis>\n"
            f"<routing_hint>{hint or 'none'}</routing_hint>\n"
            f"<sector>{self._clean_text(sector or 'Unknown')}</sector>\n"
            f"<company_scope>{self._clean_text(company_scope or 'Unknown')}</company_scope>\n"
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

    def _build_anchor_block(
        self,
        memory_summary: str | None,
        latest_user_answer: str | None,
        focus_topic: str | None = None,
    ) -> str:
        memory = self._clean_memory_text(memory_summary or "")
        if not memory:
            return ""

        entries = self._parse_memory_entries(memory)
        if entries:
            anchor_lines = self._select_focus_memory_entry_lines(entries, focus_topic)
            known_types = self._select_focus_memory_types(entries, focus_topic)
        else:
            lines = [line.strip(" -") for line in memory.split("\n") if line.strip()]
            anchor_lines = self._select_focus_memory_lines(lines, focus_topic)
            known_types = []
        if latest_user_answer:
            latest_clean = self._clean_text(latest_user_answer).lower()
            anchor_lines = [
                line
                for line in anchor_lines
                if self._clean_text(line).lower() not in latest_clean
            ] or (
                self._select_focus_memory_entry_lines(entries, focus_topic, max_lines=1)
                if entries
                else self._select_focus_memory_lines(
                    [line.strip(" -") for line in memory.split("\n") if line.strip()],
                    focus_topic,
                    max_lines=1,
                )
            )

        joined = "\n".join(f"- {line}" for line in anchor_lines[:2])
        known_types_block = ""
        if known_types:
            joined_types = ", ".join(known_types[:4])
            focused_hint = self._build_known_dimensions_hint(known_types, focus_topic)
            known_types_block = (
                "<known_dimensions>\n"
                f"{joined_types}\n"
                "</known_dimensions>\n"
                "<known_dimensions_instruction>"
                "Avoid re-asking these dimensions unless the current capability truly requires confirming them."
                "</known_dimensions_instruction>\n"
                f"{focused_hint}"
            )
        return (
            "<known_facts>\n"
            f"{joined}\n"
            "</known_facts>\n"
            "<known_facts_instruction>Use these facts only to ask a more specific follow-up.</known_facts_instruction>\n"
            f"{known_types_block}"
        )

    def _select_focus_memory_lines(
        self,
        lines: list[str],
        focus_topic: str | None,
        max_lines: int = 2,
    ) -> list[str]:
        if not lines:
            return []

        focus_tokens = {
            token
            for token in re.findall(r"[a-z0-9]+", self._clean_text(focus_topic or "").lower())
            if len(token) > 3
        }
        if focus_tokens:
            focused = [
                line
                for line in lines
                if focus_tokens.intersection(
                    token
                    for token in re.findall(r"[a-z0-9]+", self._clean_text(line).lower())
                    if len(token) > 3
                )
            ]
            if focused:
                return focused[:max_lines]

        return lines[:max_lines]

    def _parse_memory_entries(self, memory: str) -> list[dict[str, str]]:
        entries: list[dict[str, str]] = []
        for raw_line in memory.split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            match = re.match(
                r"^-\s*capability:\s*(.*?)\s*\|\s*([a-z]+)\s*:\s*(.+)$",
                line,
                flags=re.IGNORECASE,
            )
            if not match:
                continue
            entries.append(
                {
                    "capability": match.group(1).strip(),
                    "type": match.group(2).strip().lower(),
                    "fact": match.group(3).strip(),
                }
            )
        return entries

    def _select_focus_memory_entry_lines(
        self,
        entries: list[dict[str, str]],
        focus_topic: str | None,
        max_lines: int = 2,
    ) -> list[str]:
        if not entries:
            return []

        normalized_focus = self._normalize_memory_label(focus_topic)
        exact_matches = [
            f"{entry['type']}: {entry['fact']}"
            for entry in entries
            if self._normalize_memory_label(entry.get("capability")) == normalized_focus
        ]
        if exact_matches:
            return exact_matches[:max_lines]

        fallback_lines = [
            f"{entry['type']}: {entry['fact']}"
            for entry in entries
        ]
        return self._select_focus_memory_lines(fallback_lines, focus_topic, max_lines=max_lines)

    def _select_focus_memory_types(
        self,
        entries: list[dict[str, str]],
        focus_topic: str | None,
    ) -> list[str]:
        if not entries:
            return []

        normalized_focus = self._normalize_memory_label(focus_topic)
        focused_entries = [
            entry
            for entry in entries
            if self._normalize_memory_label(entry.get("capability")) == normalized_focus
        ] or entries

        ordered_types: list[str] = []
        for entry in focused_entries:
            value = entry.get("type", "").strip().lower()
            if value and value not in ordered_types:
                ordered_types.append(value)
        return ordered_types

    def _normalize_memory_label(self, value: str | None) -> str:
        normalized = self._clean_text(value or "").lower()
        normalized = normalized.replace("&", "and")
        normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
        return re.sub(r"\s+", " ", normalized).strip()

    def _build_known_dimensions_hint(self, known_types: list[str], focus_topic: str | None) -> str:
        normalized_focus = self._normalize_memory_label(focus_topic)
        known = {item.strip().lower() for item in known_types if item and item.strip()}
        if not normalized_focus or not known:
            return ""

        if normalized_focus == "feedback collection" and {"channel", "tool", "cadence"}.intersection(known):
            return (
                "<known_dimensions_focus_hint>"
                "For Feedback collection, avoid re-asking which channels, tools, or review rhythm already exist. "
                "Prefer the next missing detail such as logging consistency, tagging, routing, deduplication, or standard capture practice."
                "</known_dimensions_focus_hint>\n"
            )
        if normalized_focus == "use of insights" and {"cadence"}.intersection(known):
            return (
                "<known_dimensions_focus_hint>"
                "For Use of insights, avoid re-asking only about review cadence. "
                "Prefer how themes are compared, root causes are identified, or issues are prioritized."
                "</known_dimensions_focus_hint>\n"
            )
        if normalized_focus == "acting on pain points" and {"owner", "tool", "process"}.intersection(known):
            return (
                "<known_dimensions_focus_hint>"
                "For Acting on pain points, avoid repeating generic ownership or backlog setup if already known. "
                "Prefer follow-through, closure discipline, prioritization, or validation of fixes."
                "</known_dimensions_focus_hint>\n"
            )
        return ""

    def _build_question_guidelines_block(self, guidelines: list[str] | None) -> str:
        cleaned = [item.strip() for item in (guidelines or []) if item and item.strip()]
        if not cleaned:
            return ""
        primary_guideline = escape(cleaned[0])
        supplemental = "\n".join(
            f"<supplemental_question_guideline>{escape(item)}</supplemental_question_guideline>"
            for item in cleaned[1:4]
        )
        return (
            "<admin_question_guidelines>\n"
            "<guideline_instruction>"
            "The current_capability_question_guideline comes from the database Question_Guidelines "
            "for the capability currently selected as the question focus. Use it as the main business focus for the next question. "
            "Supplemental question guidelines contain narrow boundary hints about what to ask next and what to avoid repeating."
            "</guideline_instruction>\n"
            f"<current_capability_question_guideline>{primary_guideline}</current_capability_question_guideline>\n"
            f"{supplemental}\n"
            "</admin_question_guidelines>\n"
        )

    def _build_axis_guidelines_block(self, axis_question_guidelines: str | None) -> str:
        cleaned = self._clean_text(axis_question_guidelines or "")
        if not cleaned:
            return ""
        return (
            "<axis_question_guidelines>\n"
            "<guideline_instruction>"
            "These database-managed axis guidelines define the high-level business angle for the current axis. "
            "Use them as context, then focus the actual question on the selected capability."
            "</guideline_instruction>\n"
            f"<axis_guideline>{escape(cleaned)}</axis_guideline>\n"
            "</axis_question_guidelines>\n"
        )

    def _build_maturity_rubric_block(self, rubrics: list[dict]) -> str:
        if not rubrics:
            return ""

        lines: list[str] = []
        for rubric in sorted(
            rubrics[:5],
            key=lambda item: int(item.get("maturity_level_number") or item.get("level_number") or 999),
        ):
            level_number = rubric.get("maturity_level_number") or rubric.get("level_number") or "?"
            description = self._clean_text(str(rubric.get("description") or ""))
            if not description:
                continue
            lines.append(
                f"<maturity_signal level=\"{level_number}\">{description[:420]}</maturity_signal>"
            )

        if not lines:
            return ""
        return (
            "<maturity_rubric_hints>\n"
            "<rubric_instruction>"
            "Use these hints to shape the question so the user's answer can reveal whether the current reality is basic, established, or advanced. "
            "Do not mention level numbers to the user."
            "</rubric_instruction>\n"
            + "\n".join(lines)
            + "\n</maturity_rubric_hints>\n"
        )

    def _build_memory_block(self, memory_summary: str | None) -> str:
        memory = self._clean_memory_text(memory_summary or "")
        if not memory:
            return ""
        return f"<axis_memory>\n{memory}\n</axis_memory>\n"

    def _history_to_messages(self, history: list[Any]) -> list[dict[str, str]]:
        selected: list[dict[str, str]] = []
        total_chars = 0
        max_chars = max(int(self.settings.llm_max_history_chars), 1)

        for turn in reversed(history[-self.settings.llm_max_history_turns :]):
            role = str(getattr(turn, "role", "")).strip().lower()
            if role not in ("user", "assistant"):
                continue
            content = str(getattr(turn, "content", "") or "").strip()
            if not content:
                continue
            if total_chars + len(content) > max_chars:
                if not selected:
                    selected.append({"role": role, "content": content[-max_chars:]})
                break
            total_chars += len(content)
            selected.append({"role": role, "content": content})

        return list(reversed(selected))

    def _is_duplicate_question(self, candidate: str, history: list[Any]) -> bool:
        normalized_candidate = self._normalize_for_match(candidate)
        if not normalized_candidate:
            return False
        recent_assistant_questions = [
            self._normalize_for_match(str(getattr(turn, "content", "")))
            for turn in history
            if str(getattr(turn, "role", "")).strip().lower() == "assistant"
        ][-6:]
        return normalized_candidate in recent_assistant_questions

    def _normalize_for_match(self, text: str) -> str:
        value = self._clean_text(text).lower()
        value = re.sub(r"[^a-z0-9\s]", "", value)
        return re.sub(r"\s+", " ", value).strip()

    def _fallback_question(
        self,
        axis: str,
        topic: str,
        question_guidelines: list[str] | None = None,
        maturity_rubrics: list[dict] | None = None,
    ) -> str:
        displayed_topic = self._display_topic_label(topic or axis)
        focus_phrase = self._fallback_focus_phrase(question_guidelines)
        if focus_phrase:
            return f"For {displayed_topic}, how does {focus_phrase} work today?"
        rubric_focus = self._fallback_rubric_focus(maturity_rubrics or [])
        if rubric_focus:
            return f"For {displayed_topic}, how does {rubric_focus} work today?"
        return f"How does {displayed_topic} work today?"

    def _fallback_rubric_focus(self, maturity_rubrics: list[dict]) -> str:
        if not maturity_rubrics:
            return ""

        combined = " ".join(
            self._clean_text(str(rubric.get("description") or "")).lower()
            for rubric in maturity_rubrics
        )
        focus_candidates = (
            ("ownership and follow-up", ("owner", "ownership", "accountability", "follow-up", "responsible")),
            ("review rhythm and actions", ("cadence", "review", "routine", "meeting", "ritual")),
            ("tools and tracking", ("tool", "tracker", "tracking", "dashboard", "backlog", "log", "record")),
            ("cross-team coordination", ("cross-functional", "function", "team", "handoff", "governance")),
            ("measured outcomes", ("outcome", "impact", "target", "metric", "kpi", "measure")),
        )
        for focus, tokens in focus_candidates:
            if any(token in combined for token in tokens):
                return focus
        return ""

    def _fallback_rubric_options(self, maturity_rubrics: list[dict]) -> str:
        if not maturity_rubrics:
            return ""

        signal_by_level: dict[int, str] = {}
        for rubric in maturity_rubrics:
            try:
                level = int(rubric.get("maturity_level_number") or rubric.get("level_number") or 0)
            except Exception:
                continue
            description = self._clean_text(str(rubric.get("description") or "")).lower()
            if not description:
                continue
            if level == 1:
                signal_by_level[level] = "mostly informal or reactive"
            elif level == 2:
                signal_by_level[level] = "partly structured but inconsistent"
            elif level == 3:
                signal_by_level[level] = "systematic, owned, and reviewed across teams"

        ordered = [signal_by_level[level] for level in (1, 2, 3) if signal_by_level.get(level)]
        if len(ordered) >= 2:
            return ", ".join(ordered[:-1]) + f", or {ordered[-1]}"
        return ordered[0] if ordered else ""

    def _fallback_focus_phrase(self, question_guidelines: list[str] | None) -> str:
        guideline = next((item.strip() for item in (question_guidelines or []) if item and item.strip()), "")
        if not guideline:
            return ""
        first_sentence = re.split(r"(?<=[.!?])\s+", guideline, maxsplit=1)[0].strip(" .!?")
        first_sentence = re.sub(
            r"^(assess|evaluate)\s+how\s+",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = re.sub(
            r"^(look for|focus on|prioritize)\s+",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = re.sub(
            r"^(whether|how clearly|how consistently|how systematically)\s+",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = re.sub(
            r"^(one\s+)?(real\s+)?(case|example)\s+(where|when)\s+",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = re.sub(
            r"\.\s*focus on.*$",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = re.sub(
            r",?\s*especially\s+whether.*$",
            "",
            first_sentence,
            flags=re.IGNORECASE,
        )
        first_sentence = first_sentence[:140].rstrip(" ,;:")
        return first_sentence[:1].lower() + first_sentence[1:] if first_sentence else ""

    def _display_topic_label(self, topic: str | None) -> str:
        return self._clean_text(str(topic or "").replace("_", " ")) or "this topic"

    def _shape_consultative_text(self, text: str) -> str:
        candidate = self._clean_text(text)
        if not candidate:
            return candidate
        max_question_chars = int(getattr(self.settings, "chat_max_question_chars", 360))
        if "?" in candidate:
            candidate = candidate[: candidate.find("?") + 1].strip()
        else:
            parts = re.split(r"(?<=[.!])\s+", candidate)
            candidate = " ".join(parts[:2]).strip()
        if "?" not in candidate and len(candidate) > max_question_chars:
            candidate = candidate[: max_question_chars - 3].rstrip(" ,;:") + "..."
        if not candidate.endswith((".", "?", "!")):
            candidate = candidate.rstrip() + "."
        return candidate

    def _ensure_question_text(self, text: str, fallback: str, raw_text: str | None = None) -> str:
        candidate = self._clean_text(text)
        fallback_question = self._clean_text(fallback)
        if "?" not in fallback_question:
            fallback_question = fallback_question.rstrip(" .!:;") + "?"

        raw_candidate = self._clean_text(raw_text or "") if raw_text is not None else None
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
        max_question_chars = int(getattr(self.settings, "chat_max_question_chars", 360))
        if len(combined) <= max_question_chars:
            return combined
        return fallback_question

    def _reduce_stacked_question(self, text: str) -> str:
        candidate = self._clean_text(text)
        if "?" not in candidate:
            return candidate

        question_end = candidate.find("?")
        question = candidate[: question_end + 1]
        intro = candidate[: question_end]
        stacked_match = re.search(
            r",\s+and\s+(how|what|who|when|where|which|do|does|did|is|are|can|could|would)\b",
            intro,
            flags=re.IGNORECASE,
        )
        if not stacked_match:
            return candidate

        reduced = intro[: stacked_match.start()].rstrip(" ,;:")
        if not reduced:
            return candidate
        return f"{reduced}?"

    def _looks_like_direct_question(self, text: str) -> bool:
        normalized = self._clean_text(text).lower()
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
            "oÃ¹ ",
            "quand ",
            "est-ce ",
            "est ce ",
        )
        return normalized.startswith(question_starters) or bool(
            re.search(
                r":\s*(can|could|would|what|how|who|when|where|which|do|does|did|is|are|"
                r"pouvez[- ]vous|comment|quel|quelle|quels|quelles|qui|ou|oÃ¹|quand|est[- ]ce)\b",
                normalized,
            )
        )


def build_question_composer_service(
    settings: Settings,
    chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
    clean_text: Callable[[str | None], str],
    clean_memory_text: Callable[[str | None], str],
) -> QuestionComposerService:
    return QuestionComposerService(
        settings=settings,
        chat_messages=chat_messages,
        clean_text=clean_text,
        clean_memory_text=clean_memory_text,
    )
