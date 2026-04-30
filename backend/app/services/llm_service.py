from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.core.config import get_settings
from app.core.text_normalization import normalize_text
from app.services.prompts import (
    BATCH_RECOMMENDATION_SYSTEM_PROMPT,
    BATCH_RECOMMENDATION_USER_TEMPLATE,
    COMPANY_CLASSIFICATION_SYSTEM_PROMPT,
    COVERAGE_SYSTEM_PROMPT,
    COVERAGE_USER_TEMPLATE,
    QUESTION_SYSTEM_PROMPT_GUIDED,
    QUESTION_SYSTEM_PROMPT_LIGHT,
    QUESTION_USER_TEMPLATE,
    RECOMMENDATION_SYSTEM_PROMPT,
    RECOMMENDATION_USER_TEMPLATE,
)


@dataclass(frozen=True)
class ChatTurn:
    role: str
    content: str


class LLMService:
    _MAX_HISTORY_TURNS = 12
    _MAX_HISTORY_CHARS = 6000

    def __init__(self) -> None:
        self.settings = get_settings()

    def generate_question(
        self,
        axis: str,
        missing: list[str],
        history: list[ChatTurn],
        sector: str,
        latest_user_answer: str | None = None,
        transition_topic: str | None = None,
        memory_summary: str | None = None,
        question_guidelines: list[str] | None = None,
        conversation_stage: str = "intro",
        ask_evidence: bool = False,
        helper_mode: bool = False,
        prompt_profile: str = "consultant_guided",
    ) -> str:
        topic = missing[0] if missing else "this axis"
        fallback = f"How do you currently handle {topic} in day-to-day work?"

        if not self.settings.mistral_api_key:
            return fallback

        messages = self._build_question_messages(
            axis=axis,
            missing=missing,
            sector=sector,
            history=history,
            latest_user_answer=latest_user_answer,
            memory_summary=memory_summary,
            question_guidelines=question_guidelines,
            conversation_stage=conversation_stage,
            ask_evidence=ask_evidence,
            helper_mode=helper_mode,
            prompt_profile=prompt_profile,
        )
        try:
            text = self._mistral_chat_messages(messages)
        except Exception:
            return fallback
        candidate = self._clean_single_text(text) or fallback
        if self._is_duplicate_question(candidate, history):
            return fallback
        return candidate

    def assess_answer_quality(self, answer: str) -> tuple[bool, str | None]:
        text = self._clean_single_text(answer).lower()
        if not text:
            return False, "empty answer"
        tokens = [part for part in re.split(r"\s+", text) if part]
        if len(tokens) < 3:
            return False, "answer is too short"
        low_signal = {
            "blabla",
            "blah blah",
            "idk",
            "i dont know",
            "dont know",
            "n/a",
            "na",
            "none",
            "test",
            "ok",
        }
        if text in low_signal:
            return False, "answer has no concrete information"
        unique_ratio = len(set(tokens)) / max(len(tokens), 1)
        if unique_ratio < 0.45:
            return False, "answer is repetitive"
        has_alpha = bool(re.search(r"[a-z]", text))
        if not has_alpha:
            return False, "answer is unclear"
        return True, None

    def generate_clarification_question(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        missing_topic: str | None = None,
        history: list[ChatTurn] | None = None,
    ) -> str:
        topic = (missing_topic or "this area").strip()
        dynamic = self._generate_dynamic_clarification_question(
            axis=axis,
            latest_user_answer=latest_user_answer,
            hint=hint,
            topic=topic,
            history=history or [],
        )
        if dynamic:
            return dynamic

        reactions = [
            "I see where you are coming from.",
            "That gives me a useful starting point.",
            "Thanks, that helps me understand your context.",
            "Good, I can work with that.",
            "That is clear, thank you.",
        ]
        prompts = [
            f"Could you walk me through one recent case on {topic}: trigger, owner, action, and outcome?",
            f"Can you share one concrete example on {topic} and explain what changed after the action?",
            f"Please describe one real incident on {topic} with a measurable business or customer result.",
            f"Could you give one specific case on {topic}, including who decided and how impact was tracked?",
        ]
        if hint == "answer is too short":
            prompts = [
                f"Could you add one concrete example on {topic} with specific action and outcome?",
                f"Please expand with one real case on {topic}: what happened, what was done, and what changed?",
            ]
        elif hint == "answer is repetitive":
            prompts = [
                f"Could you provide one detailed case on {topic} instead of a general statement?",
                f"Please share one specific situation on {topic} with clear facts and measurable impact.",
            ]
        elif hint == "answer has no concrete information":
            prompts = [
                f"Could you give one real recent case on {topic} with owner, action, and measurable result?",
                f"I need one concrete example on {topic}: decision taken, responsible team, and observed outcome.",
            ]
        elif hint == "needs explanation":
            prompts = [
                f"To clarify, I am asking how {topic} works in practice in your team. You can start with: 'Usually, when X happens, team Y does Z.'",
                f"Quick explanation: this helps us place your maturity level for {topic}. You can answer with one simple recent example.",
            ]

        seed = abs(hash((axis, latest_user_answer or "", hint or "", topic)))
        reaction = self._pick_non_repetitive_reaction(reactions=reactions, history=history or [], seed=seed)
        question = prompts[seed % len(prompts)]
        candidate = f"{reaction} {question}"
        if history and self._is_duplicate_question(candidate, history):
            candidate = f"{reaction} {prompts[(seed + 1) % len(prompts)]}"
        return candidate

    def _generate_dynamic_clarification_question(
        self,
        axis: str,
        latest_user_answer: str,
        hint: str | None,
        topic: str,
        history: list[ChatTurn],
    ) -> str | None:
        if not self.settings.mistral_api_key:
            return None
        recent_assistant = [turn.content for turn in history if turn.role.lower() == "assistant"][-5:]
        system = (
            "You are a conversational CX assessment assistant.\n"
            "Write one short follow-up question that sounds natural and human.\n"
            "If the user is confused, briefly explain what you need, then ask one simple question.\n"
            "Avoid repeating previous opening phrases.\n"
            "Return only one line of text."
        )
        user = (
            f"Axis: {axis}\n"
            f"Hint: {hint or 'none'}\n"
            f"Missing topic: {topic}\n"
            f"Latest user answer: {latest_user_answer}\n"
            "Recent assistant openings to avoid:\n"
            + "\n".join(f"- {msg}" for msg in recent_assistant)
            + "\n\nWrite the next follow-up now."
        )
        try:
            text = self._mistral_chat_messages(
                [{"role": "system", "content": system}, {"role": "user", "content": user}]
            )
        except Exception:
            return None
        candidate = self._clean_single_text(text)
        if not candidate:
            return None
        if self._is_duplicate_question(candidate, history):
            return None
        return candidate

    def _pick_non_repetitive_reaction(self, reactions: list[str], history: list[ChatTurn], seed: int) -> str:
        recent_assistant = [self._clean_single_text(turn.content).lower() for turn in history if turn.role.lower() == "assistant"][-5:]
        ordered = reactions[seed % len(reactions) :] + reactions[: seed % len(reactions)]
        for reaction in ordered:
            if not any(msg.startswith(reaction.lower()) for msg in recent_assistant):
                return reaction
        return ordered[0]

    def update_axis_memory(
        self, axis: str, current_summary: str | None, new_answer: str, covered_labels: list[str]
    ) -> str:
        if not self.settings.mistral_api_key:
            base = (current_summary or "").strip()
            add = f"New info: {new_answer.strip()}"
            if covered_labels:
                add = add + f" (covered: {', '.join(covered_labels[:8])})"
            if not base:
                return add
            return (base + "\n" + add).strip()

        messages = self._build_memory_update_messages(axis, current_summary, new_answer, covered_labels)
        try:
            text = self._mistral_chat_messages(messages)
        except Exception:
            return (current_summary or "").strip()
        return self._clean_memory_text(text) or (current_summary or "").strip()

    def detect_coverage(self, answer: str, criteria: list[dict], rubrics_by_capability: dict[int, list[dict]] | None = None) -> dict:
        if not self.settings.mistral_api_key:
            covered = []
            for c in criteria:
                label = c["label"]
                if any(word in answer.lower() for word in label.lower().split()):
                    covered.append(int(c["id"]))
            return {"covered": covered, "confidence": 0.7, "evidence_by_id": {}, "rationale_by_id": {}}

        allowed_ids = {int(c["id"]) for c in criteria if "id" in c}
        messages = self._build_coverage_messages(
            answer=answer,
            criteria=criteria,
            rubrics_by_capability=rubrics_by_capability or {},
        )

        parsed: CoverageResponse | None = None
        invalid_output = ""
        for _attempt in range(2):
            try:
                invalid_output = self._mistral_chat_messages(messages)
            except Exception:
                break
            parsed = self._parse_coverage_json(invalid_output)
            if parsed is not None:
                break
            messages = self._build_coverage_fix_messages(
                answer=answer,
                criteria=criteria,
                rubrics_by_capability=rubrics_by_capability or {},
                invalid_output=invalid_output,
            )

        if parsed is None:
            return {"covered": [], "confidence": None, "evidence_by_id": {}, "rationale_by_id": {}}

        covered_ids: list[int] = []
        maturity_level_by_id: dict[int, int] = {}
        confidence_by_id: dict[int, float] = {}
        evidence_by_id: dict[int, str] = {}
        rationale_by_id: dict[int, str] = {}
        confidences: list[float] = []

        for item in parsed.covered_criteria:
            cid = int(item.criterion_id)
            if cid not in allowed_ids:
                continue
            covered_ids.append(cid)
            if item.maturity_level_id is not None:
                maturity_level_by_id[cid] = int(item.maturity_level_id)
            confidence_by_id[cid] = float(item.confidence)
            if item.evidence:
                evidence_by_id[cid] = item.evidence
            if item.rationale:
                rationale_by_id[cid] = item.rationale
            confidences.append(float(item.confidence))

        avg_conf = (sum(confidences) / len(confidences)) if confidences else None
        return {
            "covered": covered_ids,
            "maturity_level_by_id": maturity_level_by_id,
            "confidence_by_id": confidence_by_id,
            "confidence": avg_conf,
            "evidence_by_id": evidence_by_id,
            "rationale_by_id": rationale_by_id,
        }

    def classify_company(self, company_name: str, sector_options: list[dict], size_options: list[dict]) -> dict:
        """
        Returns: {"sector_code": str, "company_size_code": str}
        sector_options/size_options items must include: {"code": "...", "label": "..."}.
        """
        if not self.settings.mistral_api_key:
            raise RuntimeError("MISTRAL_API_KEY is not set")

        messages = self._build_company_classification_messages(company_name, sector_options, size_options)
        content = self._mistral_chat_messages(messages)

        data = self._extract_json(content) or {}
        sector_code = str(data.get("sector_code") or "").strip().lower()
        size_code = str(data.get("company_size_code") or "").strip().lower()

        allowed_sectors = {str(o.get("code", "")).strip().lower() for o in sector_options}
        allowed_sizes = {str(o.get("code", "")).strip().lower() for o in size_options}

        if sector_code not in allowed_sectors:
            raise ValueError(f"Invalid sector_code returned by LLM: {sector_code!r}")
        if size_code not in allowed_sizes:
            raise ValueError(f"Invalid company_size_code returned by LLM: {size_code!r}")

        return {"sector_code": sector_code, "company_size_code": size_code}

    def generate_recommendation(
        self,
        axis: str,
        capability: str,
        maturity_label: str,
        confidence: float | None,
        justification: str | None,
        recommendation_guideline: str | None,
        priority_hint: str | None,
        consultant_note: str | None,
        evidence_to_cite: str | None,
        initiative_suggestions: str | None,
        business_impact: str | None,
        tone_hint: str | None,
    ) -> str:
        fallback_parts = [
            (recommendation_guideline or "").strip(),
            (initiative_suggestions or "").strip(),
            (business_impact or "").strip(),
        ]
        fallback = " ".join(part for part in fallback_parts if part).strip() or "No recommendation available yet."

        if not self.settings.mistral_api_key:
            return fallback

        user = RECOMMENDATION_USER_TEMPLATE.format(
            axis=axis,
            capability=capability,
            maturity_label=maturity_label,
            confidence=f"{confidence:.2f}" if confidence is not None else "n/a",
            justification=(justification or "n/a"),
            recommendation_guideline=(recommendation_guideline or "n/a"),
            priority_hint=(priority_hint or "n/a"),
            consultant_note=(consultant_note or "n/a"),
            evidence_to_cite=(evidence_to_cite or "n/a"),
            initiative_suggestions=(initiative_suggestions or "n/a"),
            business_impact=(business_impact or "n/a"),
            tone_hint=(tone_hint or "balanced"),
        )
        try:
            text = self._mistral_chat_messages(
                [{"role": "system", "content": RECOMMENDATION_SYSTEM_PROMPT}, {"role": "user", "content": user}]
            )
        except Exception:
            return fallback
        return self._clean_single_text(text) or fallback

    def generate_recommendations_batch(
        self,
        assessment_id: int,
        items: list[dict[str, Any]],
        language: str = "en",
        max_actions_per_capability: int = 2,
        tone: str = "practical",
        max_words_per_capability: int = 120,
    ) -> dict[int, dict[str, Any]]:
        if not items:
            return {}
        if not self.settings.mistral_api_key:
            return {}

        user = BATCH_RECOMMENDATION_USER_TEMPLATE.format(
            assessment_id=assessment_id,
            language=language,
            max_actions=max_actions_per_capability,
            tone=tone,
            max_words=max_words_per_capability,
            items_json=json.dumps(items, ensure_ascii=False),
        )
        messages = [
            {"role": "system", "content": BATCH_RECOMMENDATION_SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]
        try:
            content = self._mistral_chat_messages(messages)
        except Exception:
            return {}

        parsed = self._parse_batch_recommendation_json(content)
        if parsed is None:
            return {}
        result_map: dict[int, dict[str, Any]] = {}
        for item in parsed.results:
            result_map[int(item.capability_id)] = {
                "status": item.status,
                "title": item.title,
                "why_this": item.why_this,
                "evidence_used": item.evidence_used,
                "primary_action": item.primary_action,
                "secondary_action": item.secondary_action,
                "expected_impact": item.expected_impact,
                "clarification_question": item.clarification_question,
            }
        return result_map

    def _build_question_messages(
        self,
        axis: str,
        missing: list[str],
        sector: str,
        history: list[ChatTurn],
        latest_user_answer: str | None,
        memory_summary: str | None,
        question_guidelines: list[str] | None = None,
        conversation_stage: str = "intro",
        ask_evidence: bool = False,
        helper_mode: bool = False,
        prompt_profile: str = "consultant_guided",
    ) -> list[dict]:
        missing_list = "\n".join(f"- {m}" for m in missing[:12]) or "- (none)"

        memory = (memory_summary or "").strip()
        memory_block = f"\n\nAxis memory (facts learned so far):\n{memory}\n" if memory else ""
        guidelines = [g.strip() for g in (question_guidelines or []) if g and g.strip()]
        guidelines_text = "\n".join(f"- {g}" for g in guidelines[:12])
        guidelines_block = ""
        if guidelines_text:
            guidelines_block = f"Question guidelines from admins:\n{guidelines_text}\n\n"

        user = QUESTION_USER_TEMPLATE.format(
            sector=sector,
            axis=axis,
            latest_user_answer=(latest_user_answer or "n/a"),
            missing_list=missing_list,
            conversation_stage=conversation_stage,
            ask_evidence=("yes" if ask_evidence else "no"),
            guidelines_block=guidelines_block,
            memory_block=memory_block,
            helper_block=(
                "User may be confused. Start with one plain-language explanation and one response starter.\n\n"
                if helper_mode
                else ""
            ),
        )

        system_prompt = (
            QUESTION_SYSTEM_PROMPT_LIGHT if prompt_profile == "llm_reasoning_light" else QUESTION_SYSTEM_PROMPT_GUIDED
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        messages.extend(self._history_to_messages(history))
        messages.append({"role": "user", "content": user})
        return messages

    def is_confusion_signal(self, answer: str) -> bool:
        text = self._clean_single_text(answer).lower()
        if not text:
            return False
        confusion_markers = [
            "i don't understand",
            "dont understand",
            "not clear",
            "what do you mean",
            "can you explain",
            "je ne comprends pas",
            "c'est pas clair",
            "explain",
        ]
        return any(marker in text for marker in confusion_markers)

    def _build_company_classification_messages(
        self, company_name: str, sector_options: list[dict], size_options: list[dict]
    ) -> list[dict]:
        sectors_text = "\n".join(f"- code={o['code']} label={o['label']}" for o in sector_options[:200])
        sizes_text = "\n".join(f"- code={o['code']} label={o['label']}" for o in size_options[:200])

        user = (
            f"Company name: {company_name}\n\n"
            "Sector options:\n"
            f"{sectors_text}\n\n"
            "Company size options:\n"
            f"{sizes_text}\n\n"
            "Return JSON:\n"
            '{ "sector_code": "retail", "company_size_code": "small" }'
        )

        return [{"role": "system", "content": COMPANY_CLASSIFICATION_SYSTEM_PROMPT}, {"role": "user", "content": user}]

    def _build_coverage_messages(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]],
    ) -> list[dict]:
        crit_lines = "\n".join(f"- id={c['id']}: {c['label']}" for c in criteria[:50])
        rubric_lines: list[str] = []
        for c in criteria[:50]:
            cid = int(c["id"])
            rubric_rows = rubrics_by_capability.get(cid) or []
            if not rubric_rows:
                continue
            for rub in rubric_rows:
                rubric_lines.append(
                    f"- capability_id={cid} level={rub.get('maturity_level_id')}: {rub.get('description')}"
                )
        rubrics_text = "\n".join(rubric_lines) if rubric_lines else "- (none provided)"
        user = COVERAGE_USER_TEMPLATE.format(
            criteria_lines=crit_lines,
            rubrics_lines=rubrics_text,
            answer=answer,
        )
        return [{"role": "system", "content": COVERAGE_SYSTEM_PROMPT}, {"role": "user", "content": user}]

    def _build_coverage_fix_messages(
        self,
        answer: str,
        criteria: list[dict],
        rubrics_by_capability: dict[int, list[dict]],
        invalid_output: str,
    ) -> list[dict]:
        base = self._build_coverage_messages(
            answer=answer,
            criteria=criteria,
            rubrics_by_capability=rubrics_by_capability,
        )
        fix = (
            "Your previous response was invalid.\n"
            "Return ONLY valid JSON matching the schema exactly.\n"
            "Do not include markdown, code fences, or extra keys.\n"
            f"Invalid output:\n{invalid_output}"
        )
        base.append({"role": "user", "content": fix})
        return base

    def _build_memory_update_messages(
        self, axis: str, current_summary: str | None, new_answer: str, covered_labels: list[str]
    ) -> list[dict]:
        system = (
            "You maintain a compact memory for a CX assessment axis.\n"
            "Update the memory with new facts from the user's answer.\n"
            "Keep it short (max 8 lines), factual, no fluff.\n"
            "Return ONLY the updated memory text, no markdown."
        )
        covered = "\n".join(f"- {l}" for l in covered_labels[:12]) or "- (none)"
        user = (
            f"Axis: {axis}\n\n"
            f"Current memory:\n{(current_summary or '').strip()}\n\n"
            f"User answer:\n{new_answer}\n\n"
            f"Newly covered criteria labels:\n{covered}\n\n"
            "Return updated memory:"
        )
        return [{"role": "system", "content": system}, {"role": "user", "content": user}]

    def _history_to_messages(self, history: list[ChatTurn]) -> list[dict[str, str]]:
        # Keep only supported roles and truncate both by turns and rough character count.
        msgs: list[dict[str, str]] = []
        total_chars = 0

        for turn in history[-self._MAX_HISTORY_TURNS :]:
            role = turn.role.strip().lower()
            if role not in ("user", "assistant"):
                continue
            content = (turn.content or "").strip()
            if not content:
                continue

            total_chars += len(content)
            if total_chars > self._MAX_HISTORY_CHARS:
                break
            msgs.append({"role": role, "content": content})

        return msgs

    def _is_duplicate_question(self, candidate: str, history: list[ChatTurn]) -> bool:
        normalized_candidate = self._normalize_for_match(candidate)
        if not normalized_candidate:
            return False
        recent_assistant_questions = [
            self._normalize_for_match(turn.content)
            for turn in history
            if turn.role.strip().lower() == "assistant"
        ][-6:]
        return normalized_candidate in recent_assistant_questions

    def _normalize_for_match(self, text: str) -> str:
        value = self._clean_single_text(text).lower()
        value = re.sub(r"[^a-z0-9\s]", "", value)
        value = re.sub(r"\s+", " ", value).strip()
        return value

    def _mistral_chat_messages(self, messages: list[dict[str, str]]) -> str:
        import httpx  # type: ignore

        url = self.settings.mistral_base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {self.settings.mistral_api_key}"}
        payload: dict[str, Any] = {
            "model": self.settings.mistral_model,
            "temperature": 0.2,
            "messages": messages,
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""

    def _extract_json(self, text: str) -> dict | None:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            return None
        blob = match.group(0)
        try:
            return json.loads(blob)
        except Exception:
            return None

    def _clean_single_text(self, text: str) -> str:
        t = normalize_text(text)
        # Remove wrapping quotes if the model returns them.
        if len(t) >= 2 and ((t[0] == '"' and t[-1] == '"') or (t[0] == "'" and t[-1] == "'")):
            t = t[1:-1].strip()
        # Collapse whitespace/newlines into a single line question.
        t = re.sub(r"\s+", " ", t).strip()
        return t

    def _clean_memory_text(self, text: str) -> str:
        t = normalize_text(text)
        t = t.replace("\r\n", "\n").replace("\r", "\n")
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t).strip()
        t = re.sub(r"\n?```$", "", t).strip()
        lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
        return "\n".join(lines[:8]).strip()

    def _parse_coverage_json(self, text: str) -> "CoverageResponse | None":
        blob = self._extract_json(text)
        if not isinstance(blob, dict):
            return None
        try:
            return CoverageResponse.model_validate(blob)
        except ValidationError:
            return None

    def _parse_batch_recommendation_json(self, text: str) -> "BatchRecommendationResponse | None":
        blob = self._extract_json(text)
        if not isinstance(blob, dict):
            return None
        try:
            return BatchRecommendationResponse.model_validate(blob)
        except ValidationError:
            return None


class CoveredCriterionItem(BaseModel):
    criterion_id: int
    maturity_level_id: int | None = Field(default=None, ge=1)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: str | None = None
    rationale: str | None = None


class CoverageResponse(BaseModel):
    covered_criteria: list[CoveredCriterionItem] = Field(default_factory=list)


class BatchRecommendationItem(BaseModel):
    capability_id: int
    status: str = Field(pattern="^(ok|needs_clarification)$")
    title: str | None = None
    why_this: str | None = None
    evidence_used: list[str] = Field(default_factory=list)
    primary_action: str | None = None
    secondary_action: str | None = None
    expected_impact: str | None = None
    clarification_question: str | None = None


class BatchRecommendationResponse(BaseModel):
    results: list[BatchRecommendationItem] = Field(default_factory=list)
