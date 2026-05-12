from __future__ import annotations

from typing import Any

from app.core.config import Settings


class MistralGateway:
    """Low-level async gateway for Mistral chat completion calls."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def chat_messages(self, messages: list[dict[str, str]]) -> str:
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


def build_mistral_gateway(settings: Settings) -> MistralGateway:
    return MistralGateway(settings=settings)
