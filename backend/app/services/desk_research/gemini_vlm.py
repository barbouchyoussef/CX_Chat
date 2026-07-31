"""Robust Multi-Provider VLM client supporting Gemini Flash Lite series and OpenRouter failover."""

import os
import re
import base64
import logging
import time
import asyncio
from typing import Optional, List, Dict
import httpx
from PIL import Image
import io

logger = logging.getLogger(__name__)


class MultiProviderVLMClient:
    """Multi-tier VLM client: Gemini key/model rotation -> OpenRouter failover -> Local OCR."""

    def __init__(self):
        try:
            from app.core.config import load_env_file
            load_env_file()
        except Exception:
            pass

        # 1. Gemini Config
        raw_gemini_keys = os.getenv("GEMINI_API_KEYS", "")
        self.gemini_keys = [k.strip().strip('"\'') for k in raw_gemini_keys.split(",") if k.strip()]
        
        # Newest-first vision models (verified against the live ListModels API, Jul 2026).
        # 'gemini-flash-lite-latest' is an auto-tracking alias so this keeps working as the
        # line advances. Override via env (GEMINI_VLM_MODELS) at any time.
        raw_gemini_models = os.getenv(
            "GEMINI_VLM_MODELS",
            "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash-lite,gemini-flash-lite-latest"
        )
        self.gemini_models = [m.strip() for m in raw_gemini_models.split(",") if m.strip()]
        
        self.current_key_idx = 0
        self.key_cooldowns: Dict[str, float] = {}  # key -> timestamp when available again

        # 2. OpenRouter Config
        raw_or_key = os.getenv("OPENROUTER_API_KEY", "")
        self.openrouter_key = raw_or_key.strip().strip('"\'') if raw_or_key else None
        self.openrouter_model = os.getenv("OPENROUTER_VLM_MODEL", "nvidia/nemotron-nano-12b-v2-vl:free")

    def _get_next_available_gemini_key(self) -> Optional[str]:
        """Return next non-cooldowned Gemini key."""
        if not self.gemini_keys:
            return None

        now = time.time()
        n_keys = len(self.gemini_keys)

        for _ in range(n_keys):
            key = self.gemini_keys[self.current_key_idx]
            cooldown_until = self.key_cooldowns.get(key, 0)
            if now >= cooldown_until:
                return key
            self.current_key_idx = (self.current_key_idx + 1) % n_keys

        return None

    def _mark_key_cooldown(self, key: str, retry_after_sec: float = 10.0) -> None:
        """Mark a key as cooling down and rotate to next key."""
        self.key_cooldowns[key] = time.time() + retry_after_sec
        if self.gemini_keys:
            self.current_key_idx = (self.current_key_idx + 1) % len(self.gemini_keys)

    def describe_image(self, pil_image: Image.Image, prompt: str = "") -> Optional[str]:
        """Synchronous VLM description with Gemini rotation and OpenRouter failover."""
        if not prompt:
            prompt = (
                "Describe this image from a document in detail. "
                "If it contains a chart, table, or graph, transcribe the data and numbers shown. "
                "If it contains text in Arabic or English, transcribe it accurately."
            )

        # Convert PIL image to Base64
        img_buffer = io.BytesIO()
        pil_image.save(img_buffer, format="PNG")
        img_b64 = base64.b64encode(img_buffer.getvalue()).decode("utf-8")

        with httpx.Client(timeout=30.0) as client:
            # 1. Try Gemini
            if self.gemini_keys:
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {"text": prompt},
                                {
                                    "inline_data": {
                                        "mime_type": "image/png",
                                        "data": img_b64,
                                    }
                                },
                            ]
                        }
                    ]
                }
                for model in self.gemini_models:
                    key = self._get_next_available_gemini_key()
                    if not key:
                        break
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
                    try:
                        res = client.post(url, json=payload)
                        if res.status_code == 200:
                            data = res.json()
                            candidates = data.get("candidates", [])
                            if candidates and "content" in candidates[0]:
                                parts = candidates[0]["content"].get("parts", [])
                                if parts and "text" in parts[0]:
                                    text = parts[0]["text"].strip()
                                    logger.info("Gemini VLM model %s succeeded via key %s...", model, key[:8])
                                    return text
                        elif res.status_code == 429:
                            self._mark_key_cooldown(key, 15.0)
                    except Exception as e:
                        logger.warning("Gemini VLM sync request failed: %s", e)

            # 2. Try OpenRouter Failover
            if self.openrouter_key:
                logger.info("Failing over to OpenRouter VLM...")
                headers = {
                    "Authorization": f"Bearer {self.openrouter_key}",
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "CX Chat Desk Research",
                }
                for model in [self.openrouter_model, "openrouter/free"]:
                    payload = {
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": f"data:image/png;base64,{img_b64}"}
                                    }
                                ]
                            }
                        ]
                    }
                    try:
                        res = client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
                        if res.status_code == 200:
                            data = res.json()
                            choices = data.get("choices", [])
                            if choices and isinstance(choices, list) and "message" in choices[0]:
                                content = choices[0]["message"].get("content", "").strip()
                                if content:
                                    logger.info("OpenRouter VLM model %s succeeded!", model)
                                    return content

                    except Exception as e:
                        logger.warning("OpenRouter VLM sync request failed for %s: %s", model, e)

        logger.warning("All VLM providers exhausted in sync call.")
        return None

    async def describe_image_async(self, pil_image: Image.Image, prompt: str = "") -> Optional[str]:
        """Asynchronous wrapper."""
        return await asyncio.to_thread(self.describe_image, pil_image, prompt)


# Global singleton instance
_vlm_instance: Optional[MultiProviderVLMClient] = None


def get_vlm_client() -> MultiProviderVLMClient:
    """Return cached MultiProviderVLMClient instance."""
    global _vlm_instance
    if _vlm_instance is None:
        _vlm_instance = MultiProviderVLMClient()
    return _vlm_instance
