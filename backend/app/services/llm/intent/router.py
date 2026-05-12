from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable

from app.core.config import Settings
from app.services.llm.prompts import INTENT_ROUTER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class IntentRouter:
    """Intent classification with deterministic fast-path and LLM fallback."""

    _INTENT_LABELS = {"CONFUSION", "RESUME", "VALID_ANSWER", "LOW_QUALITY"}

    def __init__(
        self,
        settings: Settings,
        chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
        clean_text: Callable[[str | None], str],
    ) -> None:
        self.settings = settings
        self._chat_messages = chat_messages
        self._clean_text = clean_text

    async def route(self, text: str) -> str:
        cleaned_text = self._clean_text(text)
        fast_intent = self.fast_route(cleaned_text)
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
            raw_intent = await self._chat_messages(messages)
        except Exception as exc:
            logger.error("LLM intent routing failed: %s", exc, exc_info=True)
            return "LOW_QUALITY"

        intent = self._clean_text(raw_intent).upper()
        if intent not in self._INTENT_LABELS:
            logger.error("LLM returned invalid intent label: %r", raw_intent)
            return "LOW_QUALITY"
        return intent

    def fast_route(self, text: str) -> str | None:
        normalized = self.normalize_fast_intent_text(text)
        if self.is_placeholder_noise_text(normalized):
            return "LOW_QUALITY"
        if self.is_negative_evidence_text(normalized):
            return "VALID_ANSWER"
        if self.is_confusion_request_text(normalized):
            return "CONFUSION"
        if normalized in {
            "pass",
            "skip",
            "go on",
            "move on",
            "next",
            "continue",
            "suivant",
            "on continue",
            "continuer",
        }:
            return "RESUME"
        return None

    def is_placeholder_noise_text(self, normalized_text: str) -> bool:
        if not normalized_text:
            return True

        noise_patterns = (
            r"\b(bla\s*bla(?:\s*bla)*)\b",
            r"\b(blah\s*blah(?:\s*blah)*)\b",
            r"\b(test(?:\s*test)*)\b",
            r"\b(lorem ipsum)\b",
            r"^(?:[a-z])(?:\s+[a-z]){0,3}$",
        )
        if any(re.search(pattern, normalized_text) for pattern in noise_patterns):
            return True

        tokens = normalized_text.split()
        if len(tokens) >= 3 and len(set(tokens)) == 1:
            return True
        return False

    def normalize_fast_intent_text(self, text: str) -> str:
        value = self._clean_text(text).lower()
        value = re.sub(r"[^\w\s]", "", value)
        return re.sub(r"\s+", " ", value).strip()

    def is_negative_evidence_answer(self, text: str) -> bool:
        return self.is_negative_evidence_text(self.normalize_fast_intent_text(text))

    def is_negative_evidence_text(self, normalized_text: str) -> bool:
        if normalized_text in {
            "idk",
            "i dont know",
            "i do not know",
            "dont know",
            "do not know",
            "no idea",
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

    def is_confusion_request_text(self, normalized_text: str) -> bool:
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


def build_intent_router(
    settings: Settings,
    chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
    clean_text: Callable[[str | None], str],
) -> IntentRouter:
    return IntentRouter(
        settings=settings,
        chat_messages=chat_messages,
        clean_text=clean_text,
    )
