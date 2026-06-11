from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import PurePosixPath
from typing import TYPE_CHECKING

import httpx

from app.core.config import Settings, get_settings
from app.core.text_normalization import normalize_text
from app.services.assessment.reporting.sector_leader_candidates import (
    LeaderCandidate,
    SECTOR_LEADER_CANDIDATES,
    get_capability_retrieval_phrases,
)

if TYPE_CHECKING:
    from app.services.llm.core.facade_service import LLMService

logger = logging.getLogger(__name__)

_MOJIBAKE_REPLACEMENTS = {
    "Â°": "°",
    "Â·": "·",
    "â€™": "’",
    "â€˜": "‘",
    "â€œ": "“",
    "â€": "”",
    "â€“": "–",
    "â€”": "—",
    "â€¢": "•",
    "â€¦": "...",
}

class SemanticLeadersService:
    _langsearch_max_retries = 3
    _rerank_summary_char_limit = 3500

    def __init__(self, settings: Settings | None = None, llm_service: "LLMService | None" = None) -> None:
        self.settings = settings or get_settings()
        self.llm = llm_service
        self._metrics: dict[str, int] = {}
        self._last_rerank_debug: dict = {}

    async def build_leaders_snapshot(
        self,
        *,
        sector: str,
        respondent_company_name: str,
        pain_points: list[dict[str, str | None]],
        generation_mode: str = "initial",
    ) -> dict:
        return await self._build_snapshot(
            sector=sector,
            respondent_company_name=respondent_company_name,
            pain_points=pain_points,
            include_debug=False,
            generation_mode=generation_mode,
        )

    async def debug_leaders_snapshot(
        self,
        *,
        sector: str,
        respondent_company_name: str,
        pain_points: list[dict[str, str | None]],
    ) -> dict:
        return await self._build_snapshot(
            sector=sector,
            respondent_company_name=respondent_company_name,
            pain_points=pain_points,
            include_debug=True,
            generation_mode="debug",
        )

    async def _build_snapshot(
        self,
        *,
        sector: str,
        respondent_company_name: str,
        pain_points: list[dict[str, str | None]],
        include_debug: bool,
        generation_mode: str,
    ) -> dict:
        sector_key = self._resolve_sector_key(sector)
        if sector_key is None:
            return {
                "supported": False,
                "reason": f"Semantic leaders are not yet configured for sector '{sector}'.",
                "sector": sector,
                "respondent_company_name": respondent_company_name,
                "leaders": [],
            }

        if not self.settings.langsearch_api_key:
            return {
                "supported": False,
                "reason": "LANGSEARCH_API_KEY is not configured.",
                "sector": sector,
                "respondent_company_name": respondent_company_name,
                "leaders": [],
            }

        normalized_respondent = normalize_text(respondent_company_name).lower()
        candidates = [
            candidate
            for candidate in SECTOR_LEADER_CANDIDATES.get(sector_key, ())
            if normalize_text(candidate.company_name).lower() != normalized_respondent
        ]
        self._metrics = {
            "candidates_considered": len(candidates),
            "candidates_evaluated": 0,
            "web_search_calls": 0,
            "rerank_calls": 0,
            "mistral_calls": 0,
            "documents_retrieved": 0,
            "documents_validated": 0,
            "documents_rejected_indirect": 0,
            "capability_coverage_count": 0,
        }

        leaders: list[dict] = []
        candidate_debug: list[dict] = []
        for candidate in candidates:
            self._metrics["candidates_evaluated"] += 1
            leader = await self._evaluate_candidate(
                candidate=candidate,
                sector=sector,
                sector_key=sector_key,
                pain_points=pain_points,
                include_debug=include_debug,
                generation_mode=generation_mode,
            )
            if leader:
                if include_debug and isinstance(leader.get("_debug"), dict):
                    candidate_debug.append(leader["_debug"])
                if leader.get("company_name"):
                    leaders.append(leader)
            elif include_debug:
                candidate_debug.append(
                    {
                        "company_name": candidate.company_name,
                        "selected_count": 0,
                        "reason": "candidate_returned_none",
                    }
                )
        leaders.sort(
            key=lambda item: (
                -float(item.get("_semantic_score") or 0.0),
                -int(len(item.get("evidence_links") or [])),
                str(item.get("company_name") or ""),
            )
        )

        mistral_budget = max(0, int(self.settings.benchmark_max_mistral_calls_per_assessment))
        shortlist_count = min(len(leaders), max(3, mistral_budget))
        logger.warning(
            "benchmark leader curation budget sector=%s candidates=%s shortlist=%s mistral_budget=%s llm_present=%s",
            sector,
            len(leaders),
            shortlist_count,
            mistral_budget,
            self.llm is not None,
        )
        curated_pool: list[dict] = []
        for index, item in enumerate(leaders[:shortlist_count]):
            use_mistral = index < mistral_budget
            curated = await self._curate_ranked_candidate(
                item=item,
                sector=sector,
                pain_points=pain_points,
                allow_llm=use_mistral,
            )
            if curated:
                curated_pool.append(curated)

        total_mistral_calls = self._metrics.get("mistral_calls", 0)
        curated_leaders = self._select_final_leaders(curated_pool, pain_points=pain_points)
        self._metrics["capability_coverage_count"] = len(
            {
                normalize_text(str(link.get("mapped_capability") or "")).strip().lower()
                for leader in curated_leaders
                for link in (leader.get("evidence_links") or [])
                if normalize_text(str(link.get("mapped_capability") or "")).strip()
            }
        )

        trimmed: list[dict] = []
        for item in curated_leaders[:3]:
            clean = dict(item)
            clean.pop("_semantic_score", None)
            clean.pop("_pre_curation_score", None)
            clean.pop("_curated_score", None)
            clean.pop("_debug", None)
            clean.pop("_mistral_calls", None)
            clean.pop("_raw_links", None)
            clean.pop("_coverage_capabilities", None)
            clean.pop("_document_assessments", None)
            clean.pop("_rejected_evidence", None)
            trimmed.append(clean)

        payload = {
            "supported": True,
            "sector_key": sector_key,
            "sector": sector,
            "respondent_company_name": respondent_company_name,
            "pain_points": pain_points,
            "metrics": {
                **self._metrics,
                "mistral_calls": total_mistral_calls,
            },
            "leaders": trimmed,
        }
        logger.warning(
            "benchmark snapshot built sector=%s mode=%s candidates=%s leaders=%s mistral_calls=%s",
            sector_key,
            generation_mode,
            len(candidates),
            len(trimmed),
            total_mistral_calls,
        )
        if include_debug:
            payload["candidate_debug"] = candidate_debug
        return payload

    async def _evaluate_candidate(
        self,
        *,
        candidate: LeaderCandidate,
        sector: str,
        sector_key: str,
        pain_points: list[dict[str, str | None]],
        include_debug: bool = False,
        generation_mode: str = "initial",
    ) -> dict | None:
        search_queries = self._build_search_queries(
            company_name=candidate.company_name,
            search_context=candidate.search_context,
            sector=sector,
            sector_key=sector_key,
            pain_points=pain_points,
        )
        search_query = search_queries[0]
        retrieved_documents = await self._web_search_candidates(
            search_queries,
            allow_fallback_query=generation_mode != "initial",
            max_docs=self.settings.benchmark_max_langsearch_docs_per_candidate,
        )
        if not retrieved_documents:
            if include_debug:
                return {
                    "_debug": {
                        "company_name": candidate.company_name,
                        "retrieved_count": 0,
                        "reranked_count": 0,
                        "semantic_dedup_skips": 0,
                        "selected_count": 0,
                        "reason": "no_search_results",
                    }
                }
            return None

        rerank_query = self._build_rerank_query(
            company_name=candidate.company_name,
            search_context=candidate.search_context,
            sector=sector,
            sector_key=sector_key,
            pain_points=pain_points,
        )
        reranked = await self._semantic_rerank(
            query=rerank_query,
            documents=[self._document_text_for_rerank(item) for item in retrieved_documents],
            top_n=min(6 if generation_mode == "initial" else 8, len(retrieved_documents)),
        )
        used_fallback_rerank = False
        if not reranked:
            reranked = self._fallback_rerank_results(
                documents=retrieved_documents,
                top_n=min(6 if generation_mode == "initial" else 8, len(retrieved_documents)),
            )
            used_fallback_rerank = True

        candidate_evidence: list[dict[str, str | None]] = []
        cumulative_relevance_score = 0.0
        unique_urls: set[str] = set()
        unique_domains: set[str] = set()
        semantic_dedup_cache: list[dict] = []
        semantic_dedup_skips = 0

        for result in reranked:
            index = int(result.get("index", -1))
            if index < 0 or index >= len(retrieved_documents):
                continue
            document = retrieved_documents[index]
            url = str(document.get("url") or "").strip()
            if not url or url in unique_urls:
                continue
            if self._is_duplicate_document(semantic_dedup_cache, document):
                semantic_dedup_skips += 1
                continue
            unique_urls.add(url)
            domain = self._url_domain(url)
            if domain:
                unique_domains.add(domain)
            semantic_dedup_cache.append(document)
            relevance_score = float(result.get("relevance_score") or 0.0)
            cumulative_relevance_score += relevance_score
            candidate_evidence.append(
                {
                    "title": document.get("title"),
                    "summary": document.get("summary"),
                    "url": url,
                    "source_title": self._clean_source_title(
                        raw_title=str(document.get("title") or ""),
                        url=url,
                    ),
                    "rerank_relevance_score": relevance_score,
                }
            )
            if len(candidate_evidence) >= 5:
                break

        self._metrics["documents_retrieved"] = self._metrics.get("documents_retrieved", 0) + len(retrieved_documents)

        if not candidate_evidence:
            if include_debug:
                return {
                    "_debug": {
                        "company_name": candidate.company_name,
                        "retrieved_count": len(retrieved_documents),
                        "reranked_count": len(reranked),
                        "semantic_dedup_skips": semantic_dedup_skips,
                        "selected_count": 0,
                        "reason": "no_evidence_after_selection",
                    }
                }
            return None

        average_relevance_score = cumulative_relevance_score / max(len(candidate_evidence), 1)
        diversity_bonus = min(max(len(unique_domains) - 1, 0), 2) * 0.01
        semantic_dedup_penalty = min(semantic_dedup_skips, 2) * 0.01
        aggregate_score = average_relevance_score + diversity_bonus - semantic_dedup_penalty

        leader_summary = self._fallback_leader_summary(company_name=candidate.company_name, links=candidate_evidence)

        payload = {
            "key": candidate.key,
            "company_name": candidate.company_name,
            "logo_url": f"https://logo.clearbit.com/{candidate.domain}",
            "search_query": search_query,
            "search_queries": search_queries,
            "rerank_query": rerank_query,
            "_search_context": candidate.search_context,
            "_sector_key": sector_key,
            "leader_summary": leader_summary,
            "evidence_links": candidate_evidence[:3],
            "_raw_links": candidate_evidence,
            "_semantic_score": aggregate_score,
            "_pre_curation_score": aggregate_score,
            "_mistral_calls": 0,
        }
        if include_debug:
            payload["_debug"] = {
                "company_name": candidate.company_name,
                "retrieved_count": len(retrieved_documents),
                "reranked_count": len(reranked),
                "semantic_dedup_skips": semantic_dedup_skips,
                "selected_count": len(candidate_evidence),
                "average_relevance_score": average_relevance_score,
                "diversity_bonus": diversity_bonus,
                "semantic_dedup_penalty": semantic_dedup_penalty,
                "semantic_score": aggregate_score,
                "pre_curation_score": aggregate_score,
                "mistral_calls": 0,
                "reason": "retrieved_with_fallback_rank" if used_fallback_rerank else "retrieved_and_ranked",
                "rerank_debug": self._last_rerank_debug,
            }
        return payload

    def _build_search_queries(
        self,
        *,
        company_name: str,
        search_context: str,
        sector: str,
        sector_key: str,
        pain_points: list[dict[str, str | None]],
    ) -> list[str]:
        pain_summary = self._pain_point_summary(pain_points)
        search_focus = self._pain_point_retrieval_focus(pain_points, sector_key=sector_key)
        context = search_context.strip()
        context_clause = f" {company_name} is a {context}." if context else ""
        primary_query = (
            f"Find public case studies, detailed reports, or implementation evidence showing how {company_name} handles "
            f"{pain_summary} in {sector} through {search_focus}. Prefer official material and credible third-party analysis "
            f"with concrete operating practices, service routines, decision workflows, or measurable improvements. "
            f"Prefer sources from 2023 or newer.{context_clause}"
        )
        fallback_query = (
            f"Find public examples, case studies, or reports showing how {company_name} improves customer experience in {sector} "
            f"through {pain_summary}. Focus on concrete operating practices, customer feedback handling, issue resolution, "
            f"decision routines, or measurable service improvements.{context_clause}"
        )
        return [primary_query, fallback_query]

    def _build_rerank_query(
        self,
        *,
        company_name: str,
        search_context: str,
        sector: str,
        sector_key: str,
        pain_points: list[dict[str, str | None]],
    ) -> str:
        pain_details = self._pain_point_details_formatted(pain_points)
        context_clause = f"\nCompany context: {search_context}" if search_context.strip() else ""
        return (
            f"Rank these documents by how well they show concrete evidence of what {company_name} is doing "
            f"in {self._normalized_sector_label(sector_key, sector)} to address these specific customer experience gaps.\n\n"
            f"Evaluate the documents as benchmark evidence, not as general company coverage. "
            f"Prioritize documents that show how {company_name} operates, measures, governs, or improves the capability in practice.\n\n"
            f"Use the pain-point details below as a benchmark rubric:\n"
            f"- 'What this capability means' explains the business capability being assessed\n"
            f"- 'Current practice signals to look for' lists structured practices that directly relate to the capability\n"
            f"- 'Current gap' describes what weak maturity looks like for the respondent\n"
            f"- 'Best-practice signals to reward' describes what mature benchmark behavior looks like\n\n"
            f"{pain_details}{context_clause}\n\n"
            f"When ranking, strongly prefer documents that connect one or more of the current practice or best-practice signals "
            f"to concrete operating evidence such as named workflows, ownership models, review routines, listening systems, "
            f"decision processes, improvement backlogs, or measurable outcomes.\n\n"
            f"Prefer evidence of:\n"
            f"- Operating models and team structures\n"
            f"- Formal processes, systems, or tools\n"
            f"- Measurable outcomes or capability improvements\n"
            f"- Governance or accountability structures\n"
            f"- Structured feedback, action loops, or customer-informed decisions\n"
            f"- Best-practice signals such as ownership, review cadence, root-cause work, listening systems, action tracking, and measurable service improvement\n\n"
            f"Source authority guidance:\n"
            f"- Strongly reward official company case studies, annual reports with concrete operating detail, implementation writeups, and credible third-party case studies or analyst-style coverage\n"
            f"- Moderately reward trade publications, executive interviews, and substantive industry reporting when they describe concrete customer experience practices\n"
            f"- Deprioritize generic blog posts, broad overview pages, low-substance marketing pages, academic upload portals, and pages that lack verifiable operating detail\n\n"
            f"Avoid generic claims like enhancing experience or transforming service without concrete details.\n"
            f"Demote broad report pages, infrastructure-only stories, high-level strategy pages, and generic customer-experience narratives unless they clearly describe customer experience operating practices.\n"
            f"Reward documents that clearly show how {company_name} is closing the gap between weak maturity and mature practice for one or more of these pain points."
        )

    async def _web_search_candidates(
        self,
        queries: list[str],
        *,
        allow_fallback_query: bool,
        max_docs: int,
    ) -> list[dict]:
        merged: list[dict] = []
        seen_urls: set[str] = set()
        for index, query in enumerate(queries):
            for item in await self._web_search(query):
                url = str(item.get("url") or "").strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                merged.append(item)
                if len(merged) >= max_docs:
                    return merged
            if index == 0 and not allow_fallback_query and len(merged) >= min(3, max_docs):
                return merged
        return merged

    async def _web_search(self, query: str) -> list[dict]:
        endpoint = self.settings.langsearch_base_url.rstrip("/") + "/web-search"
        payload = {
            "query": query,
            "summary": True,
            "count": 6,
        }
        self._metrics["web_search_calls"] = self._metrics.get("web_search_calls", 0) + 1
        try:
            data = await self._post_langsearch(endpoint=endpoint, payload=payload)
        except Exception as exc:
            logger.warning("Telecom semantic web search failed for query=%r: %s", query, exc)
            return []

        values = ((((data or {}).get("data") or {}).get("webPages") or {}).get("value")) or []
        items: list[dict] = []
        for value in values:
            title = normalize_text(str(value.get("name") or "")).strip()
            url = str(value.get("url") or "").strip()
            summary = normalize_text(str(value.get("summary") or value.get("snippet") or "")).strip()
            site_name = normalize_text(str(value.get("siteName") or "")).strip() or None
            if not title or not url:
                continue
            items.append(
                {
                    "title": title,
                    "url": url,
                    "summary": summary or None,
                    "site_name": site_name,
                }
            )
        return items

    async def _semantic_rerank(self, *, query: str, documents: list[str], top_n: int) -> list[dict]:
        if not documents:
            self._last_rerank_debug = {"status": "skipped", "reason": "no_documents"}
            return []

        endpoint = self.settings.langsearch_base_url.rstrip("/") + "/rerank"
        requested_top_n = min(top_n, len(documents))
        payload = {
            "model": "langsearch-reranker-v1",
            "query": query,
            "documents": documents,
            "top_n": requested_top_n,
            "return_documents": False,
        }
        self._last_rerank_debug = {
            "status": "started",
            "endpoint": endpoint,
            "document_count": len(documents),
            "requested_top_n": requested_top_n,
            "query_chars": len(query),
            "total_document_chars": sum(len(document or "") for document in documents),
            "max_document_chars": max((len(document or "") for document in documents), default=0),
        }
        self._metrics["rerank_calls"] = self._metrics.get("rerank_calls", 0) + 1
        try:
            data = await self._post_langsearch(endpoint=endpoint, payload=payload)
        except httpx.HTTPStatusError as exc:
            response = exc.response
            self._last_rerank_debug = {
                **self._last_rerank_debug,
                "status": "http_error",
                "http_status": response.status_code if response is not None else None,
                "response_body_preview": self._safe_response_preview(response.text if response is not None else ""),
            }
            logger.warning(
                "Telecom semantic rerank HTTP error status=%s body=%s query=%r",
                self._last_rerank_debug.get("http_status"),
                self._last_rerank_debug.get("response_body_preview"),
                query,
            )
            return []
        except Exception as exc:
            self._last_rerank_debug = {
                **self._last_rerank_debug,
                "status": "exception",
                "exception_type": type(exc).__name__,
                "exception_message": str(exc)[:500],
            }
            logger.warning("Telecom semantic rerank failed for query=%r: %s", query, exc)
            return []
        results = (data or {}).get("results")
        if results is None and isinstance((data or {}).get("data"), dict):
            results = ((data or {}).get("data") or {}).get("results")
        if results is None and isinstance((data or {}).get("data"), list):
            results = (data or {}).get("data")
        normalized_results = list(results or [])
        self._last_rerank_debug = {
            **self._last_rerank_debug,
            "status": "completed" if normalized_results else "empty_results",
            "top_level_keys": sorted((data or {}).keys()),
            "data_type": type((data or {}).get("data")).__name__ if isinstance(data, dict) else type(data).__name__,
            "results_count": len(normalized_results),
        }
        if not normalized_results:
            logger.warning(
                "Telecom semantic rerank returned no results keys=%s data_type=%s document_count=%s",
                self._last_rerank_debug.get("top_level_keys"),
                self._last_rerank_debug.get("data_type"),
                len(documents),
            )
        return normalized_results

    def _safe_response_preview(self, text: str, limit: int = 500) -> str:
        compact = " ".join((text or "").split())
        return compact[:limit]

    def _fallback_rerank_results(self, *, documents: list[dict], top_n: int) -> list[dict[str, float | int]]:
        ranked_count = min(max(int(top_n or 0), 0), len(documents))
        return [
            {
                "index": index,
                "relevance_score": max(0.35, 0.72 - (index * 0.04)),
            }
            for index in range(ranked_count)
        ]

    async def _post_langsearch(self, *, endpoint: str, payload: dict) -> dict:
        headers = {
            "Authorization": f"Bearer {self.settings.langsearch_api_key}",
            "Content-Type": "application/json",
        }
        from app.services.assessment.reporting.provider_rate_limits import (
            BenchmarkProviderUnavailable,
            get_langsearch_limiter,
        )

        limiter = get_langsearch_limiter(self.settings)

        async with httpx.AsyncClient(timeout=20.0) as client:
            for attempt in range(self._langsearch_max_retries):
                try:
                    usage = await limiter.acquire()
                except BenchmarkProviderUnavailable as exc:
                    logger.warning(
                        "provider call skipped due to app-level quota provider=langsearch endpoint=%s reason=%s",
                        endpoint,
                        exc,
                    )
                    raise
                logger.warning(
                    "benchmark langsearch request endpoint=%s per_second=%s per_minute=%s per_day=%s",
                    endpoint,
                    usage.per_second_count,
                    usage.per_minute_count,
                    usage.per_day_count,
                )
                response = await client.post(endpoint, headers=headers, json=payload)
                if response.status_code != 429:
                    response.raise_for_status()
                    return response.json()

                await limiter.note_rate_limited()
                retry_after_header = response.headers.get("Retry-After")
                retry_after_seconds = self._parse_retry_after_seconds(retry_after_header)
                if retry_after_seconds is None:
                    retry_after_seconds = min(10.0, 2.0 * (attempt + 1))
                logger.warning(
                    "LangSearch rate limited request to %s; retrying in %.2fs (attempt %s/%s)",
                    endpoint,
                    retry_after_seconds,
                    attempt + 1,
                    self._langsearch_max_retries,
                )
                await asyncio.sleep(retry_after_seconds)

        raise httpx.HTTPStatusError(
            message="LangSearch request failed after retries due to rate limiting.",
            request=response.request,
            response=response,
        )

    def _parse_retry_after_seconds(self, value: str | None) -> float | None:
        if not value:
            return None
        try:
            seconds = float(value.strip())
        except (TypeError, ValueError):
            return None
        return seconds if seconds > 0 else None

    def _document_text(self, item: dict) -> str:
        parts = [
            f"Title: {normalize_text(str(item.get('title') or '')).strip()}",
            f"Source: {normalize_text(str(item.get('site_name') or '')).strip()}",
            f"Summary: {normalize_text(str(item.get('summary') or '')).strip()}",
            f"URL: {str(item.get('url') or '').strip()}",
        ]
        return "\n".join(part for part in parts if part and not part.endswith(": "))

    def _document_text_for_rerank(self, item: dict) -> str:
        summary = normalize_text(str(item.get("summary") or "")).strip()
        if len(summary) > self._rerank_summary_char_limit:
            summary = summary[: self._rerank_summary_char_limit].rsplit(" ", 1)[0].strip() + "..."
        parts = [
            f"Title: {normalize_text(str(item.get('title') or '')).strip()}",
            f"Source: {normalize_text(str(item.get('site_name') or '')).strip()}",
            f"Summary: {summary}",
            f"URL: {str(item.get('url') or '').strip()}",
        ]
        return "\n".join(part for part in parts if part and not part.endswith(": "))

    def _pain_point_summary(self, pain_points: list[dict[str, str | None]]) -> str:
        labels = [
            normalize_text(str(item.get("capability") or "")).strip()
            for item in pain_points[:3]
            if normalize_text(str(item.get("capability") or "")).strip()
        ]
        return ", ".join(labels) if labels else "customer feedback, service quality, and digital experience"

    def _pain_point_details(self, pain_points: list[dict[str, str | None]]) -> str:
        return self._pain_point_summary(pain_points)

    def _pain_point_retrieval_focus(
        self,
        pain_points: list[dict[str, str | None]],
        *,
        sector_key: str,
    ) -> str:
        parts: list[str] = []
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            phrase = self._capability_retrieval_phrase(item, sector_key=sector_key)
            if capability and phrase:
                parts.append(f"{capability}: {phrase}")
            elif capability:
                parts.append(capability)
        return ", ".join(parts) if parts else self._pain_point_summary(pain_points)

    def _capability_retrieval_phrase(self, item: dict[str, str | None], *, sector_key: str) -> str:
        capability = normalize_text(str(item.get("capability") or "")).strip().lower()
        capability_retrieval_phrases = get_capability_retrieval_phrases(sector_key)
        if capability in capability_retrieval_phrases:
            return capability_retrieval_phrases[capability]

        description = self._clean_evidence_text(str(item.get("capability_description") or ""))
        action_hints = self._clean_action_hints(str(item.get("action_hints") or ""))
        parts = [part for part in [description, action_hints] if part]
        return "; ".join(parts)

    def _pain_point_details_formatted(self, pain_points: list[dict[str, str | None]]) -> str:
        details: list[str] = []
        for idx, item in enumerate(pain_points[:3], 1):
            capability = normalize_text(str(item.get("capability") or "")).strip()
            if not capability:
                continue
            capability_description = self._clean_evidence_text(str(item.get("capability_description") or ""))
            action_hints = self._clean_action_hints(str(item.get("action_hints") or ""))
            current_gap = self._sanitized_pain_point_detail(item)
            level3_action_hints = self._clean_action_hints(str(item.get("level3_action_hints") or ""))

            parts = [f"{idx}. {capability}:"]
            if capability_description:
                parts.append(f"   What this capability means: {capability_description}")
            if action_hints:
                parts.append(f"   Current practice signals to look for: {action_hints}")
            if current_gap:
                parts.append(f"   Current gap: {current_gap}")
            if level3_action_hints:
                parts.append(f"   Best-practice signals to reward: {level3_action_hints}")
            details.append("\n".join(parts))
        return "\n".join(details) if details else "customer feedback, service quality, and digital experience"

    def _pain_point_rubric_details(self, pain_points: list[dict[str, str | None]]) -> str:
        details: list[str] = []
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            rubric_description = normalize_text(str(item.get("rubric_description") or "")).strip()
            if capability and rubric_description:
                details.append(f"{capability}: {rubric_description}")
            elif capability:
                details.append(capability)
        return "; ".join(details) if details else self._pain_point_summary(pain_points)

    def _sanitized_pain_point_detail(self, item: dict[str, str | None]) -> str:
        source = normalize_text(str(item.get("rubric_description") or item.get("rationale") or "")).strip()
        if not source:
            return ""
        source = re.sub(r"^Level\s+\d+\s*/\s*[^:]+:\s*", "", source, flags=re.IGNORECASE).strip()
        kept: list[str] = []
        for sentence in self._summary_sentences(source):
            lowered = sentence.lower()
            if lowered.startswith("the user may"):
                continue
            if "user wording" in lowered or "did not provide assessable business evidence" in lowered:
                continue
            kept.append(sentence)
        return self._clean_evidence_text(" ".join(kept).strip())

    def _summary_sentences(self, text: str) -> list[str]:
        normalized = normalize_text(text).replace("\n", " ").strip()
        if not normalized:
            return []
        return [part.strip(" -") for part in re.split(r"(?<=[\.\!\?])\s+", normalized) if part.strip(" -")]

    def _clean_evidence_text(self, text: str) -> str:
        value = normalize_text(text).replace("\n", " ").strip(" -")
        value = re.sub(r"^\s*transcript\s*", "", value, flags=re.IGNORECASE).strip(" -")
        value = re.sub(r"^\[\s*music\s*\]\s*", "", value, flags=re.IGNORECASE).strip(" -")
        value = re.sub(r"^\s*by\s+[a-z0-9 ,.'/-]+\s*", "", value, flags=re.IGNORECASE).strip(" -")
        value = re.sub(r"\s+", " ", value).strip()
        return value[:280].strip(" -,:;")

    def _clean_action_hints(self, text: str) -> str:
        normalized = normalize_text(text).strip()
        if not normalized:
            return ""
        hints = [self._clean_evidence_text(part) for part in normalized.split(";")]
        cleaned = [hint for hint in hints if hint]
        return ", ".join(cleaned[:4])

    def _resolve_sector_key(self, sector: str | None) -> str | None:
        normalized = normalize_text(sector).lower().strip()
        if not normalized:
            return None
        normalized = normalized.replace("&", " and ")
        normalized = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
        sector_aliases = {
            "telecom": "telecom",
            "banking insurance": "banking_insurance",
            "banking and insurance": "banking_insurance",
            "retail ecommerce": "retail_ecommerce",
            "retail e commerce": "retail_ecommerce",
            "ecommerce": "ecommerce",
            "e commerce": "ecommerce",
            "retail": "retail",
            "banking": "banking",
            "insurance": "insurance",
            "healthcare": "healthcare",
            "hospitality travel": "hospitality_travel",
            "hospitality and travel": "hospitality_travel",
            "travel": "travel",
            "technology": "technology",
            "public services": "public_services",
            "public sector": "public_sector",
        }
        return sector_aliases.get(normalized)

    def _normalized_sector_label(self, sector_key: str, fallback: str) -> str:
        labels = {
            "telecom": "telecom",
            "banking_insurance": "banking and insurance",
            "retail_ecommerce": "retail and e-commerce",
            "ecommerce": "e-commerce",
            "retail": "retail",
            "banking": "banking",
            "insurance": "insurance",
            "healthcare": "healthcare",
            "hospitality_travel": "hospitality and travel",
            "travel": "travel",
            "technology": "technology",
            "public_services": "public services",
            "public_sector": "public sector",
        }
        return labels.get(sector_key, normalize_text(fallback).strip() or sector_key)


    def _url_domain(self, url: str) -> str | None:
        match = re.match(r"^https?://([^/]+)", url.strip(), flags=re.IGNORECASE)
        if not match:
            return None
        return match.group(1).lower()

    def _clean_source_title(self, *, raw_title: str, url: str) -> str | None:
        title = self._clean_evidence_text(raw_title)
        title = re.sub(r"\s+\|\s+(?:pdf|home|official site|case study)$", "", title, flags=re.IGNORECASE).strip()
        title = re.sub(r"\s+-\s+(?:pdf|official site)$", "", title, flags=re.IGNORECASE).strip()
        if self._looks_like_bad_source_title(title):
            title = self._source_title_from_url(url)
        return title or None

    def _looks_like_bad_source_title(self, title: str) -> bool:
        if not title:
            return True
        lowered = title.lower()
        if len(title) < 14:
            return True
        if lowered.endswith(" repo") or lowered.endswith(" report repo"):
            return True
        if len(re.findall(r"[A-Za-z]{2,}", title)) < 3:
            return True
        return False

    def _source_title_from_url(self, url: str) -> str | None:
        path_match = re.match(r"^https?://[^/]+/(.+)$", url.strip(), flags=re.IGNORECASE)
        if not path_match:
            return None
        path = path_match.group(1).split("?", 1)[0].split("#", 1)[0].strip("/")
        if not path:
            return None
        slug = PurePosixPath(path).name
        slug = re.sub(r"\.(pdf|html?)$", "", slug, flags=re.IGNORECASE)
        slug = slug.replace("-", " ").replace("_", " ")
        slug = re.sub(r"\s+", " ", slug).strip()
        if not slug:
            return None
        return slug.title()

    async def _curate_ranked_candidate(
        self,
        *,
        item: dict,
        sector: str,
        pain_points: list[dict[str, str | None]],
        allow_llm: bool,
    ) -> dict | None:
        raw_links = list(item.get("_raw_links") or [])
        if not raw_links:
            return None

        curated = await self._curate_leader_package(
            company_name=str(item.get("company_name") or ""),
            sector=sector,
            pain_points=pain_points,
            raw_links=raw_links,
            allow_llm=allow_llm,
        )
        evidence_links = curated.get("links") or []
        if not evidence_links:
            return None

        payload = dict(item)
        payload["leader_summary"] = curated.get("leader_summary") or item.get("leader_summary")
        payload["evidence_links"] = evidence_links
        payload["_mistral_calls"] = int(curated.get("mistral_calls") or 0)
        payload["_curated_score"] = float(curated.get("curated_score") or item.get("_semantic_score") or 0.0)
        payload["_coverage_capabilities"] = list(curated.get("coverage_capabilities") or [])
        payload["_document_assessments"] = list(curated.get("document_assessments") or [])
        payload["_rejected_evidence"] = list(curated.get("rejected_evidence") or [])
        if isinstance(payload.get("_debug"), dict):
            payload["_debug"].update(
                {
                    "document_assessments": payload["_document_assessments"],
                    "rejected_evidence": payload["_rejected_evidence"],
                    "coverage_capabilities": payload["_coverage_capabilities"],
                    "curated_score": payload["_curated_score"],
                    "selected_count": len(evidence_links),
                    "mistral_calls": payload["_mistral_calls"],
                }
            )
        return payload

    async def _curate_leader_package(
        self,
        *,
        company_name: str,
        sector: str,
        pain_points: list[dict[str, str | None]],
        raw_links: list[dict[str, str | None]],
        allow_llm: bool,
    ) -> dict[str, object]:
        fallback_links = self._fallback_links(raw_links=raw_links, pain_points=pain_points)
        fallback_summary = self._fallback_leader_summary(company_name=company_name, links=fallback_links)
        if not raw_links:
            return {
                "leader_summary": fallback_summary,
                "links": [],
                "mistral_calls": 0,
                "curated_score": 0.0,
                "coverage_capabilities": [],
                "document_assessments": [],
                "rejected_evidence": [],
            }
        if self.llm is None or not allow_llm:
            if not allow_llm:
                logger.warning(
                    "provider call skipped due to app-level quota provider=mistral reason=max_calls_per_assessment company=%s",
                    company_name,
                )
            else:
                logger.warning(
                    "leader package curation skipped because llm_service is unavailable company=%s",
                    company_name,
                )
            return {
                "leader_summary": fallback_summary,
                "links": fallback_links,
                "mistral_calls": 0,
                "curated_score": self._fallback_curated_score(fallback_links),
                "coverage_capabilities": self._link_capability_coverage(fallback_links),
                "document_assessments": [],
                "rejected_evidence": [],
            }

        pain_details = self._pain_point_details_formatted(pain_points)
        evidence_lines = "\n".join(
            (
                f"{idx + 1}. Title: {self._clean_evidence_text(str(link.get('title') or link.get('source_title') or ''))}\n"
                f"   Summary: {self._clean_evidence_text(str(link.get('summary') or ''))}\n"
                f"   Source: {self._clean_evidence_text(str(link.get('source_title') or ''))}\n"
                f"   Best matching respondent pain point: {self._best_matching_capability(link=link, pain_points=pain_points) or 'unknown'}\n"
                f"   URL: {str(link.get('url') or '').strip()}"
            )
            for idx, link in enumerate(raw_links[:5])
        )
        strongest_gaps = ", ".join(
            capability
            for capability in [
                normalize_text(str(item.get("capability") or "")).strip()
                for item in pain_points[:2]
            ]
            if capability
        ) or "the respondent's weakest capabilities"
        prompt = (
            f"Review these benchmark evidence candidates for {company_name} in {sector}.\n\n"
            "Assess each document semantically against the respondent pain points before you decide what to keep.\n"
            "Select only evidence that directly demonstrates the capability through concrete operating proof, routines, "
            "tooling, ownership, or measured outcomes.\n"
            "Reject indirect-but-plausible evidence when the capability match is mostly inferential or when the source is "
            "strategic narrative without a clear CX mechanism.\n\n"
            f"Pain-point rubric:\n{pain_details}\n\n"
            "Before deciding what to keep, compare the documents against each other for source substance and benchmark "
            "trustworthiness. Prefer the evidence that provides clearer operating proof, stronger specificity, and more "
            "credible benchmark detail when two sources claim similar things.\n\n"
            "Return strict JSON with this shape:\n"
            '{"leader_summary":"one short sentence under 110 characters","document_assessments":[{"index":1,"matched_capability":"...","match_confidence":0.0,"match_reason":"...","evidence_type":"implementation case study","operating_specificity":0.0,"source_authority":0.0,"measurable_outcome_clarity":0.0,"indirectness_risk":0.0,"keep_recommendation":true,"why_relevant":"...","rewrite_label":"..."}]}\n'
            "Rules:\n"
            "- assess every document index provided\n"
            f"- leader_summary must mention the 1 to 2 strongest respondent gaps it addresses, especially among: {strongest_gaps}\n"
            "- leader_summary must be concise enough to fit a small report chip without truncation\n"
            "- matched_capability must match one of the respondent pain points when possible\n"
            "- match_confidence, operating_specificity, source_authority, measurable_outcome_clarity, and indirectness_risk must be numbers from 0 to 1\n"
            "- evidence_type must be one of: implementation case study, operational report, executive interview, annual/reporting disclosure, news/commentary, product/vendor case study, generic marketing / low-substance overview\n"
            "- keep_recommendation must be true only when the document directly supports the capability with concrete proof\n"
            "- source_authority should reflect benchmark trustworthiness and substance, not brand fame alone\n"
            "- when similar documents support the same claim, score the more substantive and benchmark-trustworthy one higher and reject the weaker one when appropriate\n"
            "- why_relevant must explain in one short sentence how the evidence addresses that respondent gap\n"
            "- rewrite_label must stay faithful to the evidence and emphasize only the concrete practice or outcome explicitly shown\n"
            "- do not invent facts, names, metrics, or governance details\n"
            "- do not upgrade a broad strategic narrative into an operating mechanism if the source does not clearly show that mechanism\n"
            "- prefer implementation case studies, concrete transformation programs, named tooling, measured outcomes, and formal operating routines when they are actually described\n\n"
            f"Evidence candidates:\n{evidence_lines}"
        )
        logger.warning(
            "leader package curation prompt metrics company=%s chars=%s pain_points=%s evidence_docs=%s",
            company_name,
            len(prompt),
            len(pain_points[:3]),
            min(len(raw_links), 5),
        )
        from app.services.assessment.reporting.provider_rate_limits import BenchmarkProviderUnavailable

        try:
            logger.warning(
                "leader package curation calling mistral company=%s documents=%s sector=%s",
                company_name,
                min(len(raw_links), 5),
                sector,
            )
            content = await self.llm.gateway.chat_messages(
                [
                    {
                        "role": "system",
                        "content": "You are a precise benchmark curator. Output JSON only.",
                    },
                    {"role": "user", "content": prompt},
                ],
                rate_budget_scope="benchmark",
            )
            self._metrics["mistral_calls"] = self._metrics.get("mistral_calls", 0) + 1
            parsed = self._parse_json_object(content)
        except BenchmarkProviderUnavailable as exc:
            logger.warning("Leader package curation skipped for %s: %s", company_name, exc)
            return {"leader_summary": fallback_summary, "links": fallback_links, "mistral_calls": 0}
        except Exception as exc:
            logger.exception("Leader package curation failed for %s", company_name)
            return {"leader_summary": fallback_summary, "links": fallback_links, "mistral_calls": 0}

        raw_assessments = parsed.get("document_assessments") if isinstance(parsed, dict) else None
        scored_assessments = self._normalize_document_assessments(
            raw_assessments=raw_assessments if isinstance(raw_assessments, list) else [],
            raw_links=raw_links,
            pain_points=pain_points,
        )
        self._metrics["documents_validated"] = self._metrics.get("documents_validated", 0) + len(scored_assessments)
        self._metrics["documents_rejected_indirect"] = self._metrics.get("documents_rejected_indirect", 0) + sum(
            1 for assessment in scored_assessments if assessment.get("rejection_reason") == "indirectness_risk"
        )
        curated_links = self._select_curated_links(scored_assessments)
        rejected_evidence = [
            {
                "index": assessment.get("index"),
                "source_title": assessment.get("source_title"),
                "matched_capability": assessment.get("matched_capability"),
                "selection_score": assessment.get("selection_score"),
                "rejection_reason": assessment.get("rejection_reason"),
                "evidence_type": assessment.get("evidence_type"),
                "indirectness_risk": assessment.get("indirectness_risk"),
            }
            for assessment in scored_assessments
            if not assessment.get("selected")
        ]
        if not curated_links:
            curated_links = fallback_links

        leader_summary = self._trim_leader_summary(
            self._leader_summary_from_assessments(
                company_name=company_name,
                requested_summary=normalize_text(str((parsed or {}).get("leader_summary") or "")).strip(),
                selected_links=curated_links,
            )
            or fallback_summary
        )
        return {
            "leader_summary": leader_summary,
            "links": curated_links[:3],
            "mistral_calls": 1,
            "curated_score": self._curated_score(scored_assessments, curated_links),
            "coverage_capabilities": self._link_capability_coverage(curated_links),
            "document_assessments": scored_assessments,
            "rejected_evidence": rejected_evidence,
        }

    def _fallback_links(
        self,
        *,
        raw_links: list[dict[str, str | None]],
        pain_points: list[dict[str, str | None]],
    ) -> list[dict[str, str | None]]:
        return [
            {
                "label": self._fallback_evidence_label(link),
                "url": str(link.get("url") or ""),
                "source_title": self._clean_source_title(
                    raw_title=str(link.get("source_title") or link.get("title") or ""),
                    url=str(link.get("url") or ""),
                ),
                "mapped_capability": self._best_matching_capability(link=link, pain_points=pain_points),
                "why_relevant": self._fallback_relevance_reason(link=link, pain_points=pain_points),
            }
            for link in raw_links[:3]
            if str(link.get("url") or "").strip()
        ]

    def _normalize_document_assessments(
        self,
        *,
        raw_assessments: list[dict],
        raw_links: list[dict[str, str | None]],
        pain_points: list[dict[str, str | None]],
    ) -> list[dict[str, object]]:
        assessments: list[dict[str, object]] = []
        seen_indices: set[int] = set()
        for raw_item in raw_assessments:
            if not isinstance(raw_item, dict):
                continue
            try:
                index = int(raw_item.get("index")) - 1
            except (TypeError, ValueError):
                continue
            if index < 0 or index >= len(raw_links) or index in seen_indices:
                continue
            seen_indices.add(index)
            base_link = raw_links[index]
            matched_capability = self._resolve_mapped_capability(
                self._clean_evidence_text(str(raw_item.get("matched_capability") or "")),
                pain_points,
            ) or self._best_matching_capability(link=base_link, pain_points=pain_points)
            assessment = {
                "index": index + 1,
                "title": str(base_link.get("title") or ""),
                "summary": str(base_link.get("summary") or ""),
                "url": str(base_link.get("url") or ""),
                "source_title": self._clean_source_title(
                    raw_title=str(base_link.get("source_title") or base_link.get("title") or ""),
                    url=str(base_link.get("url") or ""),
                ),
                "matched_capability": matched_capability,
                "match_confidence": self._bounded_score(raw_item.get("match_confidence")),
                "match_reason": self._clean_evidence_text(str(raw_item.get("match_reason") or "")),
                "evidence_type": self._normalize_evidence_type(str(raw_item.get("evidence_type") or "")),
                "operating_specificity": self._bounded_score(raw_item.get("operating_specificity")),
                "source_authority": self._bounded_score(raw_item.get("source_authority")),
                "measurable_outcome_clarity": self._bounded_score(raw_item.get("measurable_outcome_clarity")),
                "indirectness_risk": self._bounded_score(raw_item.get("indirectness_risk")),
                "keep_recommendation": bool(raw_item.get("keep_recommendation")),
                "why_relevant": self._clean_evidence_text(str(raw_item.get("why_relevant") or "")),
                "rewrite_label": self._clean_evidence_text(str(raw_item.get("rewrite_label") or "")),
                "rerank_relevance_score": float(base_link.get("rerank_relevance_score") or 0.0),
            }
            assessment["selection_score"] = self._document_selection_score(assessment)
            assessment["rejection_reason"] = self._document_rejection_reason(assessment)
            assessment["soft_diversity_candidate"] = self._is_soft_diversity_candidate(assessment)
            assessments.append(assessment)
        self._apply_post_curation_filters(assessments)
        assessments.sort(key=lambda item: -float(item.get("selection_score") or 0.0))
        return assessments

    def _bounded_score(self, value: object) -> float:
        try:
            score = float(value)
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(1.0, score))

    def _normalize_evidence_type(self, value: str) -> str:
        normalized = normalize_text(value).lower().strip()
        categories = (
            "implementation case study",
            "operational report",
            "executive interview",
            "annual/reporting disclosure",
            "news/commentary",
            "product/vendor case study",
            "generic marketing / low-substance overview",
        )
        for category in categories:
            if normalized == category or normalized in category:
                return category
        return "news/commentary"

    def _evidence_type_weight(self, evidence_type: str) -> float:
        weights = {
            "implementation case study": 1.0,
            "operational report": 0.9,
            "product/vendor case study": 0.82,
            "annual/reporting disclosure": 0.74,
            "executive interview": 0.68,
            "news/commentary": 0.56,
            "generic marketing / low-substance overview": 0.32,
        }
        return weights.get(evidence_type, 0.5)

    def _document_selection_score(self, assessment: dict[str, object]) -> float:
        rerank_score = max(0.0, min(1.0, float(assessment.get("rerank_relevance_score") or 0.0)))
        evidence_type_weight = self._evidence_type_weight(str(assessment.get("evidence_type") or ""))
        return (
            0.3 * float(assessment.get("match_confidence") or 0.0)
            + 0.22 * float(assessment.get("operating_specificity") or 0.0)
            + 0.14 * float(assessment.get("source_authority") or 0.0)
            + 0.1 * float(assessment.get("measurable_outcome_clarity") or 0.0)
            + 0.1 * evidence_type_weight
            + 0.08 * rerank_score
            - 0.28 * float(assessment.get("indirectness_risk") or 0.0)
        )

    def _document_rejection_reason(self, assessment: dict[str, object]) -> str | None:
        if not assessment.get("keep_recommendation"):
            return "llm_rejected"
        if not assessment.get("matched_capability"):
            return "no_capability_match"
        if float(assessment.get("match_confidence") or 0.0) < 0.62:
            return "low_capability_match"
        if float(assessment.get("operating_specificity") or 0.0) < 0.52:
            return "low_operating_specificity"
        if float(assessment.get("indirectness_risk") or 0.0) >= 0.3:
            return "indirectness_risk"
        if float(assessment.get("source_authority") or 0.0) < 0.4 and float(assessment.get("measurable_outcome_clarity") or 0.0) < 0.35:
            return "weak_authority_and_outcomes"
        if float(assessment.get("selection_score") or 0.0) < 0.53:
            return "low_selection_score"
        return None

    def _is_soft_diversity_candidate(self, assessment: dict[str, object]) -> bool:
        return (
            bool(assessment.get("matched_capability"))
            and float(assessment.get("match_confidence") or 0.0) >= 0.58
            and float(assessment.get("operating_specificity") or 0.0) >= 0.5
            and float(assessment.get("indirectness_risk") or 0.0) < 0.22
            and float(assessment.get("selection_score") or 0.0) >= 0.47
        )

    def _apply_post_curation_filters(self, assessments: list[dict[str, object]]) -> None:
        if not assessments:
            return
        self._reject_post_curation_duplicates(assessments)
        self._reject_same_capability_collapse(assessments)

    def _reject_post_curation_duplicates(self, assessments: list[dict[str, object]]) -> None:
        survivors = [item for item in assessments if item.get("rejection_reason") is None]
        if len(survivors) < 2:
            return
        for index, item in enumerate(survivors):
            if item.get("rejection_reason") is not None:
                continue
            for other in survivors[index + 1 :]:
                if other.get("rejection_reason") is not None:
                    continue
                if not self._are_near_duplicate_assessments(item, other):
                    continue
                loser = item
                winner = other
                if float(item.get("selection_score") or 0.0) >= float(other.get("selection_score") or 0.0):
                    winner = item
                    loser = other
                loser["rejection_reason"] = "post_curation_duplicate"
                logger.warning(
                    "benchmark duplicate evidence rejected kept=%s dropped=%s",
                    winner.get("url"),
                    loser.get("url"),
                )

    def _reject_same_capability_collapse(self, assessments: list[dict[str, object]]) -> None:
        survivors = [item for item in assessments if item.get("rejection_reason") is None]
        if len(survivors) < 2:
            return
        capabilities = {
            normalize_text(str(item.get("matched_capability") or "")).strip().lower()
            for item in survivors
            if normalize_text(str(item.get("matched_capability") or "")).strip()
        }
        if len(capabilities) != 1:
            return
        top_score = max(float(item.get("selection_score") or 0.0) for item in survivors)
        for item in survivors:
            if float(item.get("selection_score") or 0.0) >= top_score - 0.04:
                continue
            if (
                float(item.get("indirectness_risk") or 0.0) >= 0.18
                or float(item.get("operating_specificity") or 0.0) < 0.65
                or float(item.get("match_confidence") or 0.0) < 0.72
            ):
                item["rejection_reason"] = "collapsed_easy_capability"

    def _are_near_duplicate_assessments(self, left: dict[str, object], right: dict[str, object]) -> bool:
        left_url = str(left.get("url") or "")
        right_url = str(right.get("url") or "")
        if left_url and right_url and left_url == right_url:
            return True
        left_domain = self._url_domain(left_url)
        right_domain = self._url_domain(right_url)
        left_title = self._clean_evidence_text(str(left.get("title") or left.get("source_title") or ""))
        right_title = self._clean_evidence_text(str(right.get("title") or right.get("source_title") or ""))
        left_summary = self._clean_evidence_text(str(left.get("summary") or left.get("rewrite_label") or ""))
        right_summary = self._clean_evidence_text(str(right.get("summary") or right.get("rewrite_label") or ""))
        same_capability = (
            normalize_text(str(left.get("matched_capability") or "")).strip().lower()
            == normalize_text(str(right.get("matched_capability") or "")).strip().lower()
        )
        if left_domain and right_domain and left_domain == right_domain:
            if left_title and right_title and self._token_overlap(left_title, right_title) >= 0.72:
                return True
            if left_summary and right_summary and self._token_overlap(left_summary, right_summary) >= 0.84:
                return True
        if same_capability and left_summary and right_summary and self._token_overlap(left_summary, right_summary) >= 0.9:
            return True
        return False

    def _select_curated_links(self, assessments: list[dict[str, object]]) -> list[dict[str, str | None]]:
        selected: list[dict[str, object]] = []
        covered_capabilities: set[str] = set()
        remaining = [item for item in assessments if item.get("rejection_reason") is None]
        while remaining and len(selected) < 3:
            best = max(
                remaining,
                key=lambda item: float(item.get("selection_score") or 0.0)
                + (0.05 if str(item.get("matched_capability") or "").lower() not in covered_capabilities else 0.0),
            )
            selected.append(best)
            capability = normalize_text(str(best.get("matched_capability") or "")).strip().lower()
            if capability:
                covered_capabilities.add(capability)
            remaining = [item for item in remaining if item is not best]

        selected = self._rebalance_selected_assessments(selected=selected, assessments=assessments)
        selected = self._enforce_leader_capability_diversity(selected=selected, assessments=assessments)

        for assessment in assessments:
            assessment["selected"] = assessment in selected

        return [
            {
                "label": self._clean_evidence_text(str(assessment.get("rewrite_label") or ""))
                or self._fallback_evidence_label(
                    {
                        "title": str(assessment.get("title") or ""),
                        "summary": str(assessment.get("summary") or ""),
                        "mapped_capability": str(assessment.get("matched_capability") or ""),
                        "source_title": str(assessment.get("source_title") or ""),
                    }
                ),
                "url": str(assessment.get("url") or ""),
                "source_title": self._clean_source_title(
                    raw_title=str(assessment.get("source_title") or ""),
                    url=str(assessment.get("url") or ""),
                ),
                "mapped_capability": self._clean_evidence_text(str(assessment.get("matched_capability") or "")) or None,
                "why_relevant": self._clean_evidence_text(str(assessment.get("why_relevant") or ""))
                or self._clean_evidence_text(
                    f"This evidence supports {assessment.get('matched_capability') or 'the respondent gap'} through {assessment.get('summary') or 'concrete public proof'}"
                ),
            }
            for assessment in selected
            if str(assessment.get("url") or "").strip()
        ]

    def _link_capability_coverage(self, links: list[dict[str, str | None]]) -> list[str]:
        coverage: list[str] = []
        seen: set[str] = set()
        for link in links:
            capability = self._clean_evidence_text(str(link.get("mapped_capability") or ""))
            if not capability:
                continue
            lowered = capability.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            coverage.append(capability)
        return coverage

    def _rebalance_selected_assessments(
        self,
        *,
        selected: list[dict[str, object]],
        assessments: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        if len(selected) < 2:
            return selected
        capability_counts: dict[str, int] = {}
        for item in selected:
            capability = normalize_text(str(item.get("matched_capability") or "")).strip().lower()
            if capability:
                capability_counts[capability] = capability_counts.get(capability, 0) + 1
        duplicated_capabilities = {cap for cap, count in capability_counts.items() if count > 1}
        if not duplicated_capabilities:
            return selected

        alternatives = [
            item
            for item in assessments
            if item not in selected and item.get("rejection_reason") is None
        ]
        if not alternatives:
            return selected

        for duplicate_capability in duplicated_capabilities:
            weakest_duplicate = min(
                [item for item in selected if normalize_text(str(item.get("matched_capability") or "")).strip().lower() == duplicate_capability],
                key=lambda item: float(item.get("selection_score") or 0.0),
                default=None,
            )
            if weakest_duplicate is None:
                continue
            replacement = max(
                [
                    item
                    for item in alternatives
                    if normalize_text(str(item.get("matched_capability") or "")).strip().lower() not in capability_counts
                ],
                key=lambda item: float(item.get("selection_score") or 0.0),
                default=None,
            )
            if replacement is None:
                continue
            if float(replacement.get("selection_score") or 0.0) + 0.06 >= float(weakest_duplicate.get("selection_score") or 0.0):
                selected = [replacement if item is weakest_duplicate else item for item in selected]
                capability_counts.pop(duplicate_capability, None)
                replacement_capability = normalize_text(str(replacement.get("matched_capability") or "")).strip().lower()
                if replacement_capability:
                    capability_counts[replacement_capability] = capability_counts.get(replacement_capability, 0) + 1
                alternatives = [item for item in alternatives if item is not replacement]
        return selected

    def _enforce_leader_capability_diversity(
        self,
        *,
        selected: list[dict[str, object]],
        assessments: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        if len(selected) < 2:
            return selected
        selected_capabilities = {
            normalize_text(str(item.get("matched_capability") or "")).strip().lower()
            for item in selected
            if normalize_text(str(item.get("matched_capability") or "")).strip()
        }
        if len(selected_capabilities) > 1:
            return selected

        alternatives = [
            item
            for item in assessments
            if item not in selected
            and normalize_text(str(item.get("matched_capability") or "")).strip().lower() not in selected_capabilities
            and (
                item.get("rejection_reason") is None
                or (
                    item.get("soft_diversity_candidate")
                    and str(item.get("rejection_reason") or "") in {"low_selection_score", "weak_authority_and_outcomes"}
                )
            )
        ]
        if not alternatives:
            return selected

        weakest = min(selected, key=lambda item: float(item.get("selection_score") or 0.0))
        replacement = max(alternatives, key=lambda item: float(item.get("selection_score") or 0.0), default=None)
        if replacement is None:
            return selected
        if float(replacement.get("selection_score") or 0.0) + 0.09 < float(weakest.get("selection_score") or 0.0):
            return selected
        return [replacement if item is weakest else item for item in selected]

    def _curated_score(self, assessments: list[dict[str, object]], links: list[dict[str, str | None]]) -> float:
        if not links:
            return 0.0
        link_urls = {str(link.get("url") or "") for link in links if str(link.get("url") or "").strip()}
        selected_scores = [
            float(assessment.get("selection_score") or 0.0)
            for assessment in assessments
            if str(assessment.get("url") or "") in link_urls
        ]
        if selected_scores:
            return sum(selected_scores) / len(selected_scores)
        return self._fallback_curated_score(links)

    def _fallback_curated_score(self, links: list[dict[str, str | None]]) -> float:
        if not links:
            return 0.0
        coverage_bonus = min(len(self._link_capability_coverage(links)), 2) * 0.03
        return 0.52 + coverage_bonus

    def _leader_summary_from_assessments(
        self,
        *,
        company_name: str,
        requested_summary: str,
        selected_links: list[dict[str, str | None]],
    ) -> str | None:
        supported_capabilities = self._link_capability_coverage(selected_links)
        if requested_summary and supported_capabilities and not self._summary_looks_incomplete(requested_summary):
            supported_tokens = {cap.lower() for cap in supported_capabilities}
            if any(token in requested_summary.lower() for token in supported_tokens) and len(requested_summary) <= 100:
                return requested_summary
        if not supported_capabilities:
            return requested_summary or None
        if len(supported_capabilities) == 1:
            return f"{company_name} shows concrete {supported_capabilities[0].lower()} through public benchmark evidence"
        return (
            f"{company_name} shows concrete {supported_capabilities[0].lower()} and "
            f"{supported_capabilities[1].lower()} through public benchmark evidence"
        )

    def _summary_looks_incomplete(self, text: str) -> bool:
        cleaned = self._clean_evidence_text(text)
        if not cleaned:
            return True
        lowered = cleaned.lower()
        if lowered.endswith((" and", " via", " through", " with", " including", " like", " such as")):
            return True
        if cleaned.endswith(("'", "\"", "/", "-", ":", ";", ",")):
            return True
        return False

    def _select_final_leaders(
        self,
        leaders: list[dict],
        *,
        pain_points: list[dict[str, str | None]],
    ) -> list[dict]:
        if len(leaders) <= 3:
            return leaders[:3]
        selected: list[dict] = []
        covered_capabilities: set[str] = set()
        target_capabilities = [
            normalize_text(str(item.get("capability") or "")).strip().lower()
            for item in pain_points[:3]
            if normalize_text(str(item.get("capability") or "")).strip()
        ]
        remaining = list(leaders)
        while remaining and len(selected) < 3:
            best = max(
                remaining,
                key=lambda item: float(item.get("_curated_score") or item.get("_semantic_score") or 0.0)
                + self._leader_diversity_bonus(
                    item=item,
                    covered_capabilities=covered_capabilities,
                    target_capabilities=target_capabilities,
                ),
            )
            selected.append(best)
            covered_capabilities.update(
                normalize_text(str(capability or "")).strip().lower()
                for capability in (best.get("_coverage_capabilities") or [])
                if normalize_text(str(capability or "")).strip()
            )
            remaining = [item for item in remaining if item is not best]
        selected.sort(
            key=lambda item: (
                -float(item.get("_curated_score") or item.get("_semantic_score") or 0.0),
                -len(item.get("_coverage_capabilities") or []),
                str(item.get("company_name") or ""),
            )
        )
        return selected[:3]

    def _leader_diversity_bonus(
        self,
        *,
        item: dict,
        covered_capabilities: set[str],
        target_capabilities: list[str],
    ) -> float:
        capabilities = [
            normalize_text(str(capability or "")).strip().lower()
            for capability in (item.get("_coverage_capabilities") or [])
            if normalize_text(str(capability or "")).strip()
        ]
        new_capabilities = [capability for capability in capabilities if capability not in covered_capabilities]
        target_bonus = sum(1 for capability in new_capabilities if capability in target_capabilities) * 0.05
        breadth_bonus = min(len(new_capabilities), 2) * 0.03
        duplicate_penalty = 0.04 if capabilities and not new_capabilities else 0.0
        return target_bonus + breadth_bonus - duplicate_penalty

    def _fallback_leader_summary(self, *, company_name: str, links: list[dict[str, str | None]]) -> str | None:
        source_title = self._clean_evidence_text(str((links[0] or {}).get("source_title") or "")) if links else ""
        if source_title:
            return self._trim_leader_summary(f"{company_name} shows benchmark evidence through {source_title}.")
        return self._trim_leader_summary(f"{company_name} shows public benchmark evidence for CX practices.")

    def _trim_leader_summary(self, text: str | None) -> str | None:
        summary = self._clean_evidence_text(text or "")
        if not summary:
            return None
        first_sentence = next((sentence for sentence in self._summary_sentences(summary) if sentence), summary)
        normalized = self._clean_evidence_text(first_sentence)
        if len(normalized) <= 110:
            return normalized
        shortened = normalized[:110].rsplit(" ", 1)[0].strip(" ,;:-")
        shortened = shortened or normalized[:110].strip(" ,;:-")
        while shortened and self._summary_looks_incomplete(shortened):
            candidate = shortened.rsplit(" ", 1)[0].strip(" ,;:-")
            if not candidate or candidate == shortened:
                break
            shortened = candidate
        return shortened or normalized[:110].strip(" ,;:-")

    def _parse_json_object(self, content: str | None) -> dict[str, object]:
        text = normalize_text(content or "").strip()
        if not text:
            return {}
        fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
        if fenced:
            text = fenced.group(1).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
        return json.loads(text)

    def _fallback_evidence_label(self, link: dict[str, str | None]) -> str:
        title = self._clean_evidence_text(str(link.get("title") or link.get("source_title") or ""))
        summary = self._clean_evidence_text(str(link.get("summary") or ""))
        capability = self._clean_evidence_text(str(link.get("mapped_capability") or ""))
        if capability and summary:
            return self._clean_evidence_text(f"{capability}: {summary}")
        if title and summary:
            return self._clean_evidence_text(f"{title}: {summary}")
        return summary or title or "Public benchmark evidence was identified."

    def _best_matching_capability(
        self,
        *,
        link: dict[str, str | None],
        pain_points: list[dict[str, str | None]],
    ) -> str | None:
        text = self._clean_evidence_text(
            f"{link.get('title') or ''} {link.get('summary') or ''} {link.get('source_title') or ''}"
        ).lower()
        best_capability: str | None = None
        best_score = 0.0
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            if not capability:
                continue
            rubric = self._clean_evidence_text(
                " ".join(
                    [
                        str(item.get("capability_description") or ""),
                        str(item.get("action_hints") or ""),
                        str(item.get("level3_action_hints") or ""),
                    ]
                )
            ).lower()
            score = self._token_overlap(text, f"{capability.lower()} {rubric}")
            if score > best_score:
                best_score = score
                best_capability = capability
        return best_capability

    def _fallback_relevance_reason(
        self,
        *,
        link: dict[str, str | None],
        pain_points: list[dict[str, str | None]],
    ) -> str | None:
        capability = self._best_matching_capability(link=link, pain_points=pain_points)
        summary = self._clean_evidence_text(str(link.get("summary") or ""))
        if capability and summary:
            return self._clean_evidence_text(f"This evidence supports {capability} through {summary}")
        if capability:
            return self._clean_evidence_text(f"This evidence is most relevant to {capability}.")
        return None

    def _resolve_mapped_capability(
        self,
        raw_value: str | None,
        pain_points: list[dict[str, str | None]],
    ) -> str | None:
        normalized = normalize_text(raw_value).lower().strip()
        if not normalized:
            return None
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            if capability and normalized in capability.lower():
                return capability
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            if capability and self._token_overlap(normalized, capability.lower()) >= 0.6:
                return capability
        return None

    def _pain_point_evidence_context(self, pain_points: list[dict[str, str | None]]) -> str:
        if not pain_points:
            return "Capability gaps being benchmarked: customer feedback, service quality, and digital experience."

        lines = ["Capability gaps being benchmarked:"]
        for item in pain_points[:3]:
            capability = normalize_text(str(item.get("capability") or "")).strip()
            if not capability:
                continue
            description = self._clean_evidence_text(str(item.get("capability_description") or ""))
            gap_detail = self._sanitized_pain_point_detail(item)

            line = capability
            if description:
                line += f" - {description}"
            if gap_detail:
                line += f" Current gap: {gap_detail}"
            lines.append(line)

        if len(lines) == 1:
            return "Capability gaps being benchmarked: customer feedback, service quality, and digital experience."
        return "\n".join(lines)

    def _is_duplicate_document(self, existing_docs: list[dict], candidate: dict) -> bool:
        if not existing_docs:
            return False

        candidate_title = self._clean_evidence_text(str(candidate.get("title") or ""))
        candidate_summary = self._clean_evidence_text(str(candidate.get("summary") or ""))
        candidate_domain = self._url_domain(str(candidate.get("url") or ""))
        if not candidate_title and not candidate_summary:
            return False

        for existing in existing_docs:
            existing_title = self._clean_evidence_text(str(existing.get("title") or ""))
            existing_summary = self._clean_evidence_text(str(existing.get("summary") or ""))
            existing_domain = self._url_domain(str(existing.get("url") or ""))
            if candidate_title and existing_title and candidate_title.lower() == existing_title.lower():
                return True
            if (
                candidate_domain
                and existing_domain
                and candidate_domain == existing_domain
                and candidate_title
                and existing_title
                and self._token_overlap(candidate_title, existing_title) >= 0.75
            ):
                return True
            if candidate_summary and existing_summary and self._token_overlap(candidate_summary, existing_summary) >= 0.82:
                return True
        return False

    def _token_overlap(self, left: str, right: str) -> float:
        left_tokens = {token for token in re.split(r"[^a-z0-9]+", left.lower()) if len(token) >= 4}
        right_tokens = {token for token in re.split(r"[^a-z0-9]+", right.lower()) if len(token) >= 4}
        if not left_tokens or not right_tokens:
            return 0.0
        intersection = len(left_tokens & right_tokens)
        baseline = max(1, min(len(left_tokens), len(right_tokens)))
        return intersection / baseline


class TelecomSemanticLeadersService(SemanticLeadersService):
    """Backward-compatible alias for the former telecom-only leaders service."""
