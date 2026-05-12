from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.services.llm.prompts import REPORT_SYNTHESIS_SYSTEM_PROMPT, REPORT_SYNTHESIS_USER_TEMPLATE

logger = logging.getLogger(__name__)


class ReportSynthesisResponse(BaseModel):
    executive_summary: str | None = None
    priority_message: str | None = None


class ReportSynthesisService:
    """Executive report synthesis generation."""

    def __init__(
        self,
        settings: Settings,
        chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
        clean_text: Callable[[str | None], str],
        extract_json: Callable[[str], dict | None],
    ) -> None:
        self.settings = settings
        self._chat_messages = chat_messages
        self._clean_text = clean_text
        self._extract_json = extract_json

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
            content = await self._chat_messages(
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
            "executive_summary": self._clean_text(parsed.executive_summary or "") or fallback_summary,
            "priority_message": self._clean_text(parsed.priority_message or "") or fallback_priority,
        }

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


def build_report_synthesis_service(
    settings: Settings,
    chat_messages: Callable[[list[dict[str, str]]], Awaitable[str]],
    clean_text: Callable[[str | None], str],
    extract_json: Callable[[str], dict | None],
) -> ReportSynthesisService:
    return ReportSynthesisService(
        settings=settings,
        chat_messages=chat_messages,
        clean_text=clean_text,
        extract_json=extract_json,
    )
