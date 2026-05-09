SEMANTIC_PLAIN_LANGUAGE_INSTRUCTION = (
    "Use clear, natural, non-technical business language to describe CX concepts. "
    "Do not rely on static label translations. Interpret the provided axis and capability labels semantically; "
    "for example, instead of saying 'governance', ask who takes decisions, who owns follow-up, or how teams coordinate."
)

AXIS_CONSULTANT_GUIDANCE = (
    "- Interpret the axis name and missing capability labels semantically.\n"
    "- Translate abstract CX concepts into practical business language a non-technical leader can answer.\n"
    "- Focus on how the work happens today: who is involved, what action is taken, how often it happens, and what changes."
)

STAGE_DISCOVERY_GUIDANCE_BY_STAGE = {
    "intro": (
        "- Start broad and practical around {focus}.\n"
        "- Ask for current practice, not proof.\n"
        "- Keep it answerable with one short example."
    ),
    "diagnostic": (
        "- Move from broad statements to one concrete example around {focus}.\n"
        "- Clarify one useful angle only: owner, cadence, action, or result."
    ),
    "deep_dive": (
        "- Deep dive only where ambiguity remains around {focus}.\n"
        "- Ask for one last practical detail that improves scoring confidence."
    ),
}


def stage_discovery_guidance(conversation_stage: str, focus: str) -> str:
    template = STAGE_DISCOVERY_GUIDANCE_BY_STAGE.get(
        conversation_stage,
        STAGE_DISCOVERY_GUIDANCE_BY_STAGE["deep_dive"],
    )
    return template.format(focus=focus)
