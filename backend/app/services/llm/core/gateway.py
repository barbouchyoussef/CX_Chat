from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.config import Settings

logger = logging.getLogger(__name__)


class MistralGateway:
    """Low-level async gateway for Mistral chat completion calls."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def chat_messages(
        self,
        messages: list[dict[str, str]],
        *,
        rate_budget_scope: str | None = None,
    ) -> str:
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
            max_attempts = 3
            retryable_statuses = {429, 500, 502, 503, 504}
            data: dict[str, Any] | None = None

            for attempt in range(max_attempts):
                try:
                    if rate_budget_scope == "benchmark":
                        from app.services.assessment.reporting.provider_rate_limits import get_mistral_limiter

                        usage = await get_mistral_limiter(self.settings).acquire()
                        logger.warning(
                            "benchmark mistral request scope=%s per_second=%s per_minute=%s per_day=%s",
                            rate_budget_scope,
                            usage.per_second_count,
                            usage.per_minute_count,
                            usage.per_day_count,
                        )

                    response = await client.post(
                        url,
                        json=payload,
                        headers={"Authorization": f"Bearer {self.settings.mistral_api_key}"},
                    )
                    if response.status_code < 400:
                        data = response.json()
                        break

                    body_snippet = response.text[:800]
                    logger.warning(
                        "mistral request failed status=%s scope=%s model=%s body=%s",
                        response.status_code,
                        rate_budget_scope,
                        self.settings.mistral_model,
                        body_snippet,
                    )
                    if response.status_code == 429 and rate_budget_scope == "benchmark":
                        from app.services.assessment.reporting.provider_rate_limits import get_mistral_limiter

                        await get_mistral_limiter(self.settings).note_rate_limited()

                    if response.status_code in retryable_statuses and attempt < max_attempts - 1:
                        await asyncio.sleep(0.5 * (2 ** attempt))
                        continue

                    response.raise_for_status()
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    logger.warning(
                        "mistral transport failure scope=%s model=%s attempt=%s/%s error=%s",
                        rate_budget_scope,
                        self.settings.mistral_model,
                        attempt + 1,
                        max_attempts,
                        exc,
                    )
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(0.5 * (2 ** attempt))
                        continue
                    raise

            if data is None:
                raise RuntimeError("Mistral request failed after retries.")
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""


def build_mistral_gateway(settings: Settings) -> MistralGateway:
    return MistralGateway(settings=settings)
