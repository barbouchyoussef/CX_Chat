from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from app.core.config import Settings

logger = logging.getLogger(__name__)


class MemoryService:
    """Axis memory updater for compact conversational state."""

    def __init__(
        self,
        settings: Settings,
        chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
        clean_memory_text: Callable[[str | None], str],
    ) -> None:
        self.settings = settings
        self._chat_messages = chat_messages
        self._clean_memory_text = clean_memory_text

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
            text = await self._chat_messages(messages)
        except Exception as exc:
            logger.error("LLM memory update failed: %s", exc, exc_info=True)
            return (current_summary or "").strip()
        return self._clean_memory_text(text) or (current_summary or "").strip()

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


def build_memory_service(
    settings: Settings,
    chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
    clean_memory_text: Callable[[str | None], str],
) -> MemoryService:
    return MemoryService(
        settings=settings,
        chat_messages=chat_messages,
        clean_memory_text=clean_memory_text,
    )
