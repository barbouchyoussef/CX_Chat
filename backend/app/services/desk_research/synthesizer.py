"""Desk Research Synthesizer & Session Chatbot Service.

Provides:
1. Executive Cross-Document Synthesis Report (map-reduce over the extracted markdown).
2. Session RAG Chatbot Q&A with file citations.

Report generation uses a **map-reduce** strategy so it scales to the stated goal --
"process all kinds of documents and cover every detail" -- instead of dumping every
document into a single context window, which silently truncates once the combined
markdown outgrows the model. Small sessions still take the fast single-pass path.

All LLM calls route through the shared ``MistralGateway`` (retries, rate handling, keys
from settings) rather than hand-rolled HTTP with inline credentials.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import get_settings
from app.core.text_normalization import repair_encoding
from app.schemas.desk_research import ProcessedDocument
from app.services.llm.core.gateway import build_mistral_gateway

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Budgeting
# ---------------------------------------------------------------------------
# Characters, not tokens -- a ~4 char/token heuristic keeps this dependency-free.
# A generous margin is left below the model window for the system prompt and output.

# Above this combined size, switch from single-pass to map-reduce.
_SINGLE_PASS_CHAR_BUDGET = 120_000
# Each map call sees at most this much source text (one document, or a chunk of one).
_MAP_CHUNK_CHARS = 48_000
# The reduce step's combined map-notes must stay under this; above it, notes are
# condensed per document first (a second reduce tier).
_REDUCE_CHAR_BUDGET = 100_000
# How many map calls may run at once. Bounded so a big session does not burst the
# provider rate limit.
_MAP_CONCURRENCY = 4


REPORT_SYSTEM_PROMPT = """You are a Principal Customer Experience (CX) and Strategy Partner at EY, writing for C-level executives.

Your task is to produce a tight, high-signal Executive Desk Research Report drawn entirely from the provided session documents. Adapt the structure to what the documents actually contain. Never force a section that lacks supporting evidence.

The reader is an executive who wants to know, fast: what are these documents, what do they actually say, and what should we do about it. Density beats length. A short report full of specifics is worth more than a long one full of framing.

-----

WRITE LIKE THIS (non-negotiable):

- **Every sentence carries a specific fact** -- a figure, a date, a named entity, a metric, or a concrete finding pulled from the documents. If a sentence would survive being pasted into a report about a different company, delete it.
- **Absolute data fidelity.** Reproduce every figure, percentage, currency amount, date, and KPI EXACTLY as written. Never invent, round, or infer a number that is not in the source.
- **No waffle.** Do not write throat-clearing or generic strategy filler. Banned phrases include: "in today's competitive landscape", "it is important to note", "plays a crucial role", "robust and agile", "leverage synergies", "holistic approach", "moving forward", "at the end of the day", and any sentence whose only content is that a topic "is important". Cut them.
- **Lead with the finding, not the framing.** State the point, then the evidence. Do not warm up.
- **Attribute.** When a fact comes from a specific document, name it in-line (e.g. "per Center Performance - 2024").

-----

REPORT STRUCTURE (include a section only if the documents support it):

Begin with: `# Executive Desk Research Report: [Session Title]`

**Executive Summary** -- 3 to 5 sentences, no more. State: (1) what the document set collectively covers, (2) the two or three most important concrete findings with their numbers, (3) the single biggest risk and the single highest-impact opportunity. Every sentence must contain a specific fact.

**What Each Document Contains** -- A markdown table with columns: Document | Type | What it actually contains (be specific: the metrics, period, entities inside it) | Standout data point. This is where the reader learns the substance of each file at a glance -- make the "contains" and "standout" cells concrete and quantitative, not generic role descriptions.

**Key Findings by Theme** -- Group the substance into 2 to 4 themed sections based on what dominates the documents (e.g. revenue performance, operational KPIs, technical/architecture, customer behaviour). In each: lead with the finding in one sentence, give the supporting numbers (in a markdown table when quantitative), then one sentence of implication. Keep each theme tight.

**Cross-Document Insights** -- Only the connections a single document cannot reveal on its own: where two sources corroborate, where they contradict, and any trend visible only across the set. Skip this section if the documents do not actually intersect -- do not manufacture links.

**Risks and Data Gaps** -- A markdown table: Risk / Gap | Evidence | Severity. Include what a decision-maker would expect to see but the documents do not contain.

**Recommendations** -- 3 to 6, ordered by impact. Each is one line: the action, the specific finding it addresses (with its number), and the expected effect. No generic advice -- every recommendation must trace to something in the documents.

-----

FORMATTING:

- Header hierarchy: `#` title, `##` sections, `###` subsections. Quantitative data goes in markdown tables.
- Use **bold** for the specific figures and findings that matter. Use `>` blockquotes only for a genuinely pivotal conclusion, at most two or three in the whole report.
- No GitHub alert callouts (`> [!IMPORTANT]` etc.). No emoji. No horizontal rules between every section.
"""


# The map step is deliberately extractive, not interpretive: its whole job is to carry
# every number and fact forward intact so the final synthesis has nothing to invent.
MAP_SYSTEM_PROMPT = """You are a meticulous research analyst preparing extraction notes for a senior partner's report.

You are given ONE section of ONE source document. Produce dense, faithful extraction notes that preserve EVERYTHING an executive analysis would need:

- Every financial figure, percentage, currency amount, date, KPI, and named metric -- reproduced EXACTLY as written, with its label and unit.
- Every table -- reproduced as a compact markdown table, values unchanged.
- Every named entity (companies, products, people, segments, systems, regulations) and the claim attached to it.
- Section headings and the structure of the material.
- Any stated conclusion, risk, trend, or recommendation.

RULES:
- Do NOT summarize away numbers. Do NOT round. Do NOT editorialize or add analysis -- that happens later.
- If the section is boilerplate (headers/footers/legal), say so in one line rather than padding.
- Output structured markdown notes only. Be complete but non-repetitive.
"""

REDUCE_CONDENSE_SYSTEM_PROMPT = """You are consolidating multiple extraction-note fragments that all come from THE SAME document.

Merge them into a single coherent set of notes for that document, preserving every figure, table, date, entity, and stated conclusion exactly. Remove only literal duplication. Do not add analysis. Output markdown notes only.
"""


CHAT_SYSTEM_PROMPT = """You are the EY CX Desk Research Assistant — a sharp, senior customer-experience
research analyst embedded in the user's document workspace. You help them explore, understand, and
reason about the documents they have uploaded to the current session.

You handle every kind of message naturally:
- Greetings, thanks, and small talk → respond briefly and warmly; no citations needed.
- Questions about the workspace itself ("what documents do I have?", "what can you do?") → answer
  from the session document list provided to you.
- Questions about the documents' content, data, or findings → answer from the retrieved excerpts.
- Analytical / open-ended asks ("what are the risks?", "compare X and Y", "summarize the strategy")
  → synthesize across the excerpts; reason, don't just quote.

How to answer well:
1. Ground every factual claim about the documents in the retrieved excerpts, and cite the source
   inline as `[filename, p<page>]`. Never invent a citation or a figure.
2. When excerpts are provided but don't cover the question, say so plainly, then offer what the
   documents DO contain that's relevant — be helpful, not a dead end.
3. When no excerpts are provided (e.g. small talk or a workspace question), just answer directly.
4. Be concise and analytical, in a professional EY consulting tone. Use short markdown — bold key
   numbers, bullet lists for multiple points. Answer in the user's language.
5. Use the conversation history to resolve follow-ups ("and in 2025?", "why?") in context.
"""


def _chunk_text(text: str, size: int) -> list[str]:
    """Split text into <= ``size`` char chunks, preferring paragraph boundaries.

    Keeps whole paragraphs together where possible so a table or figure is not sliced
    down the middle, which would strand half its numbers in a different map call.
    """
    text = text.strip()
    if len(text) <= size:
        return [text] if text else []

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for para in text.split("\n\n"):
        para_len = len(para) + 2
        if current_len + para_len > size and current:
            chunks.append("\n\n".join(current))
            current, current_len = [], 0
        if para_len > size:
            # A single oversized paragraph (e.g. a giant table) is hard-split.
            for i in range(0, len(para), size):
                chunks.append(para[i : i + size])
            continue
        current.append(para)
        current_len += para_len
    if current:
        chunks.append("\n\n".join(current))
    return chunks


class DeskResearchSynthesizer:
    """Full-document report generation and session RAG chatbot queries."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._gateway = build_mistral_gateway(self._settings)

    # ------------------------------------------------------------------ #
    #  Executive report (map-reduce)                                       #
    # ------------------------------------------------------------------ #

    async def generate_executive_report(
        self,
        documents: List[ProcessedDocument],
        session_title: Optional[str] = None,
        language: str = "English",
        user_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate the cross-document executive report.

        Small sessions take a single LLM pass. Larger ones are handled map-reduce:
        each document (chunked if long) is extracted in parallel, then those notes are
        synthesized into the final report -- so no document is ever silently dropped.
        """
        usable = [d for d in documents if (d.markdown or "").strip()]
        if not usable:
            return {"status": "error", "message": "No readable document content to analyze."}

        total_chars = sum(len(d.markdown) for d in usable)
        title = session_title or "Desk Research Session"

        if total_chars <= _SINGLE_PASS_CHAR_BUDGET:
            report = await self._single_pass_report(usable, title, language, user_context)
            strategy = "single_pass"
            map_calls = 0
        else:
            report, map_calls = await self._map_reduce_report(usable, title, language, user_context)
            strategy = "map_reduce"

        if not report or report.startswith("Error:"):
            return {"status": "error", "message": report or "Report generation failed."}

        # Repair any UTF-8-as-Latin-1 mojibake in the model's output (curly quotes, dashes,
        # echoed Arabic filenames) before it is shown or saved. Structure-preserving.
        report = repair_encoding(report)

        return {
            "status": "success",
            "document_count": len(usable),
            "total_chars_analyzed": total_chars,
            "strategy": strategy,
            "map_calls": map_calls,
            "report_markdown": report,
        }

    async def _single_pass_report(
        self,
        documents: List[ProcessedDocument],
        title: str,
        language: str,
        user_context: Optional[str],
    ) -> str:
        parts = []
        for idx, doc in enumerate(documents, 1):
            header = f"=== DOCUMENT {idx}: {doc.filename} ({doc.format.upper()}, {doc.page_count} pages/sheets) ==="
            parts.append(f"{header}\n{doc.markdown.strip()}\n")
        context = "\n\n".join(parts)

        user_prompt = self._compose_report_prompt(title, language, user_context, context)
        return await self._report_llm(REPORT_SYSTEM_PROMPT, user_prompt)

    async def _map_reduce_report(
        self,
        documents: List[ProcessedDocument],
        title: str,
        language: str,
        user_context: Optional[str],
    ) -> tuple[str, int]:
        # ── Map: extract each (document, chunk) in parallel ─────────────
        units: list[tuple[int, str, int, int, str]] = []  # doc_idx, filename, chunk_i, chunk_n, text
        for doc_idx, doc in enumerate(documents, 1):
            chunks = _chunk_text(doc.markdown, _MAP_CHUNK_CHARS) or [""]
            for chunk_i, chunk in enumerate(chunks, 1):
                units.append((doc_idx, doc.filename, chunk_i, len(chunks), chunk))

        semaphore = asyncio.Semaphore(_MAP_CONCURRENCY)

        async def _map_one(unit: tuple[int, str, int, int, str]) -> tuple[int, str, str]:
            doc_idx, filename, chunk_i, chunk_n, text = unit
            label = filename if chunk_n == 1 else f"{filename} (part {chunk_i}/{chunk_n})"
            async with semaphore:
                notes = await self._report_llm(
                    MAP_SYSTEM_PROMPT,
                    f"Source document: {label}\n\nSECTION CONTENT:\n{text}",
                )
            return doc_idx, filename, notes

        map_results = await asyncio.gather(*[_map_one(u) for u in units])
        map_calls = len(units)

        # ── Group notes back by document, condensing multi-chunk docs ───
        notes_by_doc: dict[int, list[str]] = {}
        name_by_doc: dict[int, str] = {}
        for doc_idx, filename, notes in map_results:
            if notes and not notes.startswith("Error:"):
                notes_by_doc.setdefault(doc_idx, []).append(notes)
                name_by_doc[doc_idx] = filename

        doc_note_blocks: list[str] = []
        for doc_idx in sorted(notes_by_doc):
            filename = name_by_doc[doc_idx]
            fragments = notes_by_doc[doc_idx]
            merged = "\n\n".join(fragments)
            if len(fragments) > 1 and len(merged) > _MAP_CHUNK_CHARS:
                merged = await self._report_llm(
                    REDUCE_CONDENSE_SYSTEM_PROMPT,
                    f"Document: {filename}\n\nFRAGMENTS:\n{merged}",
                )
                map_calls += 1
            doc_note_blocks.append(f"=== DOCUMENT {doc_idx}: {filename} ===\n{merged.strip()}")

        combined_notes = "\n\n".join(doc_note_blocks)

        # ── If the notes themselves overflow, condense per document again ─
        if len(combined_notes) > _REDUCE_CHAR_BUDGET:
            condensed: list[str] = []
            for block in doc_note_blocks:
                if len(block) > _MAP_CHUNK_CHARS:
                    block = await self._report_llm(REDUCE_CONDENSE_SYSTEM_PROMPT, block)
                    map_calls += 1
                condensed.append(block.strip())
            combined_notes = "\n\n".join(condensed)

        # ── Reduce: synthesize the final report from the notes ──────────
        user_prompt = self._compose_report_prompt(
            title,
            language,
            user_context,
            combined_notes,
            from_notes=True,
        )
        report = await self._report_llm(REPORT_SYSTEM_PROMPT, user_prompt)
        return report, map_calls

    def _compose_report_prompt(
        self,
        title: str,
        language: str,
        user_context: Optional[str],
        context: str,
        *,
        from_notes: bool = False,
    ) -> str:
        focus = ""
        if user_context and user_context.strip():
            focus = (
                "\nUSER SPECIFIC FOCUS AND GOAL FOR THIS ANALYSIS:\n"
                f'"{user_context.strip()}"\n'
                "(Prioritize and directly address this request throughout the report.)\n"
            )
        source_label = (
            "Below are faithful EXTRACTION NOTES prepared from every uploaded document "
            "(all figures and tables preserved verbatim):"
            if from_notes
            else "Below is the COMPLETE EXTRACTED DATA from all uploaded documents in this session:"
        )
        return (
            f"Language requested: {language}\n"
            f"Session Title: {title}\n"
            f"{focus}\n"
            f"{source_label}\n\n"
            f"{context}\n\n"
            "Generate the comprehensive, executive-level Desk Research Synthesis Report "
            "following the system guidelines."
        )

    # ------------------------------------------------------------------ #
    #  Session chatbot (secondary use case)                                #
    # ------------------------------------------------------------------ #

    async def chat_with_session(
        self,
        documents: List[ProcessedDocument],
        query: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Answer a query against session documents with agentic RAG.

        The model first decides whether the documents are needed (greetings/meta answered
        directly; content questions grounded with citations), retrieves multi-query when they
        are, and answers with a defined analyst role and the conversation history. Falls back to
        legacy keyword-over-blocks retrieval only if the engine path fails -- so it never hard-fails.
        """
        if not documents:
            return {"answer": "No documents uploaded in this session to search.", "sources": []}

        if session_id:
            try:
                from app.services.desk_research import rag_index
                from app.services.rag import engine

                namespace = rag_index.ensure_index(session_id, documents)
                # Always-available manifest so "what documents do I have?" needs no retrieval.
                manifest = ", ".join(repair_encoding(d.filename) for d in documents)
                preamble = f"Documents in this session: {manifest}."
                # Let the agent know the report exists and how to cite it.
                from app.services.desk_research import session_manager

                _info = session_manager.get_session(session_id)
                if _info and _info.report_markdown:
                    preamble += " An executive report has been generated for this session; it is searchable and cited as [Executive Report]."
                result = await engine.agentic_answer(
                    query,
                    self._chat_llm,
                    answer_system_prompt=CHAT_SYSTEM_PROMPT,
                    context_source=engine.rag_context_source(
                        namespace, k=8, header="Relevant excerpts from the session's documents:"
                    ),
                    history=chat_history,
                    preamble=preamble,
                )
                return {
                    "answer": repair_encoding(result["answer"]),
                    "sources": list(dict.fromkeys(repair_encoding(s) for s in result["sources"])),
                    "retrieved_blocks_count": result["retrieved_count"],
                    "used_search": result.get("used_context", False),
                }
            except Exception:
                logger.warning("RAG chat path failed for %s; using keyword fallback.", session_id, exc_info=True)

        # ── Legacy fallback: keyword overlap over raw blocks ──
        relevant_blocks = self._retrieve_relevant_blocks(documents, query, top_k=12)

        context_lines, sources = [], []
        for b in relevant_blocks:
            src_str = f"{b['filename']} (Page/Sheet {b['page']})"
            sources.append(src_str)
            context_lines.append(f"--- [Source: {src_str}] ---\n{b['text']}")

        user_prompt = f"Context from Session Documents:\n\n" + "\n\n".join(context_lines) + f"\n\nUser Question: {query}"
        answer = await self._chat_llm(CHAT_SYSTEM_PROMPT, user_prompt)

        return {
            "answer": repair_encoding(answer),
            "sources": list(dict.fromkeys(repair_encoding(s) for s in sources)),
            "retrieved_blocks_count": len(relevant_blocks),
        }

    def _retrieve_relevant_blocks(
        self,
        documents: List[ProcessedDocument],
        query: str,
        top_k: int = 12,
    ) -> List[Dict[str, Any]]:
        """Keyword-overlap block retrieval. (Semantic retrieval is the planned upgrade.)"""
        q_words = {w.lower() for w in query.split() if len(w) > 2}
        scored_blocks = []
        for doc in documents:
            for b in doc.blocks:
                if not b.text or len(b.text.strip()) < 10:
                    continue
                b_words = {w.lower() for w in b.text.split()}
                score = len(q_words & b_words)
                if score > 0:
                    scored_blocks.append(
                        {"filename": doc.filename, "page": b.page_number or 1, "text": b.text, "score": score}
                    )
        scored_blocks.sort(key=lambda x: x["score"], reverse=True)

        if not scored_blocks:
            for doc in documents[:2]:
                for b in doc.blocks[:5]:
                    if b.text and len(b.text.strip()) > 10:
                        scored_blocks.append(
                            {"filename": doc.filename, "page": b.page_number or 1, "text": b.text, "score": 0}
                        )
        return scored_blocks[:top_k]

    # ------------------------------------------------------------------ #
    #  LLM plumbing                                                        #
    # ------------------------------------------------------------------ #

    async def _report_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Report/map/reduce calls: primary Mistral gateway, optional env-only Gemini failover."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            content = await self._gateway.chat_messages(messages)
            if content and content.strip():
                return content.strip()
            logger.warning("Mistral returned empty content; trying failover.")
        except Exception as exc:
            logger.warning("Mistral report call failed (%s); trying failover.", exc)

        fallback = await self._gemini_failover(system_prompt, user_prompt)
        return fallback or "Error: Could not reach any LLM provider for report synthesis."

    async def _chat_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Chat Q&A: Moonshot/Kimi if configured, else Mistral gateway, else Gemini."""
        settings = self._settings
        if settings.moonshot_api_key:
            try:
                async with httpx.AsyncClient(timeout=90.0) as client:
                    res = await client.post(
                        settings.moonshot_base_url.rstrip("/") + "/chat/completions",
                        headers={"Authorization": f"Bearer {settings.moonshot_api_key}"},
                        json={
                            "model": settings.moonshot_model,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt},
                            ],
                        },
                    )
                    if res.status_code == 200:
                        content = ((res.json().get("choices") or [{}])[0].get("message", {}).get("content") or "").strip()
                        if content:
                            return content
                    else:
                        logger.warning("Moonshot chat returned %d: %s", res.status_code, res.text[:120])
            except Exception as exc:
                logger.warning("Moonshot chat failed: %s", exc)

        # Fall back to the same report pipeline (gateway → Gemini).
        return await self._report_llm(system_prompt, user_prompt)

    async def _gemini_failover(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Env-only Gemini failover. No hardcoded credentials: silent no-op if unconfigured."""
        keys = [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()]
        if not keys:
            return None
        # Newest-first text models (verified against the live ListModels API, Jul 2026);
        # prefer full flash for synthesis quality, then lite for availability, then a
        # self-tracking 'latest' alias. Override via GEMINI_TEXT_MODELS.
        models = [
            m.strip()
            for m in os.getenv(
                "GEMINI_TEXT_MODELS",
                "gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-flash-latest",
            ).split(",")
            if m.strip()
        ]
        async with httpx.AsyncClient(timeout=90.0) as client:
            for key in keys:
                for model in models:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
                    payload = {
                        "systemInstruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"parts": [{"text": user_prompt}]}],
                    }
                    try:
                        res = await client.post(url, json=payload)
                        if res.status_code == 200:
                            parts = res.json()["candidates"][0]["content"]["parts"]
                            text = "".join(p.get("text", "") for p in parts).strip()
                            if text:
                                logger.info("Gemini failover succeeded with %s", model)
                                return text
                    except Exception:
                        continue
        return None


# Singleton
_synthesizer: Optional[DeskResearchSynthesizer] = None


def get_synthesizer() -> DeskResearchSynthesizer:
    global _synthesizer
    if _synthesizer is None:
        _synthesizer = DeskResearchSynthesizer()
    return _synthesizer
