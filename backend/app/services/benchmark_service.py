from __future__ import annotations

from dataclasses import dataclass
import re

import httpx

from app.core.config import get_settings
from app.core.text_normalization import normalize_text


@dataclass(frozen=True)
class BenchmarkQueryContext:
    sector: str
    company_size: str
    priority_axis: str
    pain_points: list[str]


class BenchmarkService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def get_contextual_benchmarks(self, context: BenchmarkQueryContext) -> list[dict]:
        if not self.settings.langsearch_api_key:
            return []

        queries = self._build_queries(context)
        all_items: list[dict] = []
        seen_urls: set[str] = set()
        for query in queries:
            for item in self._search(query):
                url = str(item.get("url") or "").strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                item["summary"] = self._compact_summary(
                    title=str(item.get("title") or ""),
                    summary=str(item.get("summary") or ""),
                )
                all_items.append(item)
                if len(all_items) >= 6:
                    return all_items
        return all_items

    def _build_queries(self, context: BenchmarkQueryContext) -> list[str]:
        top_pain = context.pain_points[:2]
        pain_hint = " and ".join(top_pain) if top_pain else context.priority_axis
        return [
            f"{context.sector} customer experience innovation methods 2025 2026",
            f"{context.sector} {context.company_size} best practices {pain_hint}",
            f"{context.sector} CX operating model {context.priority_axis} case study",
        ]

    def _search(self, query: str) -> list[dict]:
        endpoint = self.settings.langsearch_base_url.rstrip("/") + "/web-search"
        headers = {
            "Authorization": f"Bearer {self.settings.langsearch_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "query": query,
            "freshness": "oneYear",
            "summary": True,
            "count": 4,
        }
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post(endpoint, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except Exception:
            return []

        envelope = (data or {}).get("data") or {}
        values = ((envelope.get("webPages") or {}).get("value")) or []
        items: list[dict] = []
        for value in values:
            title = normalize_text(str(value.get("name") or ""))
            url = str(value.get("url") or "").strip()
            snippet = normalize_text(str(value.get("snippet") or ""))
            summary = normalize_text(str(value.get("summary") or ""))
            published_at = value.get("datePublished")
            site_name = normalize_text(str(value.get("siteName") or ""))
            if not title or not url:
                continue
            method_signal = self._infer_method_signal(text=f"{title} {snippet} {summary}")
            items.append(
                {
                    "title": title,
                    "url": url,
                    "site_name": site_name or None,
                    "published_at": str(published_at) if published_at else None,
                    "summary": summary or snippet or None,
                    "method_signal": method_signal,
                }
            )
        return items

    def _infer_method_signal(self, text: str) -> str | None:
        sample = text.lower()
        if "personalization" in sample:
            return "Personalization at scale"
        if "journey" in sample:
            return "Journey-led operating model"
        if "voice of customer" in sample or "voc" in sample:
            return "Closed-loop VoC"
        if "agent" in sample or "copilot" in sample or "ai" in sample:
            return "AI-assisted customer operations"
        if "omnichannel" in sample:
            return "Omnichannel consistency"
        return None

    def _compact_summary(self, title: str, summary: str) -> str | None:
        raw = self._clean_summary_text(summary)
        if not raw:
            return None
        if len(raw) <= 320:
            return raw
        llm_text = self._summarize_with_llm(title=title, text=raw)
        if llm_text:
            return self._clean_summary_text(llm_text)
        return raw[:317].rstrip() + "..."

    def _summarize_with_llm(self, title: str, text: str) -> str | None:
        if not self.settings.mistral_api_key:
            return None
        prompt = (
            "Summarize this benchmark source for a business report.\n"
            "Output only 2 short sentences (max 55 words total).\n"
            "Focus on concrete CX/innovation practice and potential business impact.\n"
            f"Title: {title}\n"
            f"Content: {text[:3000]}"
        )
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.post(
                    self.settings.mistral_base_url.rstrip("/") + "/chat/completions",
                    headers={"Authorization": f"Bearer {self.settings.mistral_api_key}"},
                    json={
                        "model": self.settings.mistral_model,
                        "temperature": 0.2,
                        "messages": [
                            {"role": "system", "content": "You write concise executive summaries."},
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
                response.raise_for_status()
                data = response.json()
                content = (((data or {}).get("choices") or [{}])[0].get("message") or {}).get("content")
                compact = self._clean_summary_text(str(content or ""))
                if not compact:
                    return None
                if len(compact) > 380:
                    return compact[:377].rstrip() + "..."
                return compact
        except Exception:
            return None

    def _clean_summary_text(self, text: str) -> str:
        cleaned = normalize_text(text)
        replacements = {
            "â€™": "'",
            "â€œ": '"',
            "â€": '"',
            "â€“": "-",
            "â€”": "-",
            "Ã©": "e",
        }
        for bad, good in replacements.items():
            cleaned = cleaned.replace(bad, good)
        cleaned = cleaned.replace("**", "")
        cleaned = re.sub(r"^\s*Executive Summary:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned
