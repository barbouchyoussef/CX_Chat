"""Cross-reference briefing: the Orion self-assessment vs. the follow-up interview.

Light, one-shot analysis (not a chat). It compares what the client claimed during the automated
Orion maturity self-assessment against what the consultant recorded in the interview, surfacing a
few insights and any inconsistencies. Only meaningful when the guide was generated from an
assessment that actually has an Orion conversation.
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from app.core.config import get_settings
from app.core.text_normalization import repair_encoding
from app.schemas.interview_guide import InterviewGuideResponse
from app.services.llm.core.gateway import build_mistral_gateway

logger = logging.getLogger(__name__)

INSIGHTS_SYSTEM_PROMPT = """You are the EY CX Interview Assistant. You are given TWO sources about the
same client:
1) SELF-ASSESSMENT (Orion): what the client claimed during an automated CX maturity self-assessment.
2) FOLLOW-UP INTERVIEW: the consultant's interview questions and the answer notes recorded so far.

Cross-reference them and produce a SHORT, useful briefing with these sections:
- **Key insights** (2-4 bullets): what the two sources together reveal about the client's CX
  maturity, priorities, or risks.
- **Inconsistencies** (bullets): where the interview answers contradict or don't line up with what
  was claimed in the self-assessment. If there are none, write exactly "No clear inconsistencies."
  — never invent one.
- **Worth probing** (1-3 bullets): the most valuable threads still unanswered or unclear.

Rules:
- Be concise. Bullets, not essays. Say each point once — no repetition, no preamble, no closing
  filler ("let me know if...", "would you like...").
- Ground every claim in the material provided; never fabricate a client response.
- If the interview has few or no recorded answers, focus on what exists and say coverage is thin.
- Answer in the guide's language.
"""


def _orion_history(trace_items: list) -> str:
    lines: list[str] = []
    for item in trace_items:
        q = repair_encoding(str(getattr(item, "question", "") or "")).strip()
        a = repair_encoding(str(getattr(item, "answer", "") or "")).strip()
        if q:
            lines.append(f"Orion: {q}")
        if a:
            lines.append(f"Client: {a}")
    return "\n".join(lines)


def _interview_answers(guide: InterviewGuideResponse) -> tuple[str, int, int]:
    """Return (serialized answered Q&A, answered_count, total_count)."""
    sections = (
        guide.introduction_questions, guide.manage_questions, guide.analyze_questions,
        guide.improve_questions, guide.closure_questions,
    )
    lines: list[str] = []
    answered = 0
    total = 0
    for items in sections:
        for q in items:
            total += 1
            note = (q.answerNote or "").strip()
            if note:
                answered += 1
                lines.append(f"- Q: {q.question}\n  A: {note}")
    body = "\n".join(lines) if lines else "(No interview answers recorded yet.)"
    return body, answered, total


def _default_llm() -> Callable[[str, str], Awaitable[str]]:
    gateway = build_mistral_gateway(get_settings())

    async def _llm(system_prompt: str, user_prompt: str) -> str:
        return await gateway.chat_messages(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        )

    return _llm


async def generate_insights(
    guide: InterviewGuideResponse,
    trace_items: list,
    *,
    llm_fn: Callable[[str, str], Awaitable[str]] | None = None,
) -> str:
    """Produce the cross-reference briefing markdown."""
    orion = _orion_history(trace_items)
    interview, answered, total = _interview_answers(guide)

    user_prompt = (
        f"CLIENT: {guide.company_name} (language: {guide.language})\n\n"
        f"=== SELF-ASSESSMENT (Orion) CONVERSATION ===\n{orion or '(none)'}\n\n"
        f"=== FOLLOW-UP INTERVIEW — recorded answers ({answered} of {total} questions answered) ===\n"
        f"{interview}\n\n"
        "Write the cross-reference briefing now."
    )
    llm = llm_fn or _default_llm()
    text = await llm(INSIGHTS_SYSTEM_PROMPT, user_prompt)
    return repair_encoding(text)
