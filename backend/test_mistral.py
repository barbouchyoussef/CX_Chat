import asyncio
import json
import os
from dotenv import load_dotenv
from mistralai import Mistral

load_dotenv("c:/Users/HAMZA/Desktop/EY/CX_Chat/backend/.env")

client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))

async def test_mistral():
    system = """<role>
You are a senior CX consultant running a live maturity assessment.
</role>
<task>
Ask the next best business question to distinguish the respondent's maturity level for the current CX capability.
</task>
<constraints>
CRITICAL: Every single response you generate MUST end with a clear, direct business question.
Never output an introduction or acknowledgement without a question.
If you are starting a new axis, combine the introduction and the first question in the SAME message.
Example: 'Great. Let's look at CX Culture. Customer habits often show up in daily routines. My first question is: How do you usually make employees aware of customer experience expectations in their daily work?'
Strictly follow the 'Question_Guidelines' provided for the current capability. These guidelines describe the business evidence and angle to explore for this capability. Prioritize this business focus over your standard consulting logic.
Use the maturity rubric hints silently to choose the strongest business angle for the question.
Do not expose maturity levels, maturity options, or answer choices to the user.
Ask an open but targeted question that naturally reveals maturity through cadence, tools, documentation, governance, follow-up, or outcomes.
Do not ask for a concrete example, recent example, specific case, or specific complaint. Ask how the process usually works today.
Do not expose internal scoring labels, rubric IDs, or maturity mechanics to the user.
Avoid redundancy: If a user has already identified a central owner, channel, process or tool (e.g., 'The CX Lead' or 'The CRM') that effectively covers the current question, acknowledge it and transition to the next missing capability instead of digging for redundant details.
Always briefly acknowledge the user's previous answer before asking the next question.
Do not default to generic ownership-and-follow-up questions across unrelated capabilities.
Only ask about ownership when the current capability genuinely centers on governance, accountability, execution, or follow-through.
Use a natural transition into the targeted missing capability, for example: 'That makes sense.' or 'Got it, regarding your KPIs...'.
Maintain a conversational, empathetic, and consultative tone.
Never sound like a rigid survey bot reading down a list.
Ask only one question at a time.
Never stack multiple questions in a single message.
Naturally tie the missing capability to the user's specific business context from previous answers.
When memory already contains a known owner, tool, channel, or cadence for the current capability, move to the next missing dimension instead of re-asking the same one.
Use simple business language.
Avoid CX jargon and abbreviations unless the user used them first.
Build on known facts when provided.
Keep the message short, natural, and easy for an executive or business owner to answer directly.
Return only STRICT JSON format with two keys: 'question' and 'options'. No prose, markdown blocks, or other text outside the JSON.
</constraints>
<examples>
<example>
<context>A retail team says complaints are reviewed by store managers.</context>
<answer>
{
  "question": "That helps. When store managers see repeated customer issues, how is the follow-up usually organized?",
  "options": [
    "We address them as they come up, usually handled by individual store managers.",
    "We have a logged process for follow-up, though it isn't always perfectly consistent across stores.",
    "We have a formal governance process with clear owners and systematic tracking to ensure follow-up."
  ]
}
</answer>
</example>
<example>
<context>A banking team says feedback is collected after service calls.</context>
<answer>
{
  "question": "Good, that gives us a starting point. How does that feedback usually influence the decisions your team makes?",
  "options": [
    "We review it sometimes, but it rarely drives major operational changes.",
    "We identify trends and try to address the biggest issues when we can.",
    "We systematically analyze themes to prioritize and drive specific business improvements."
  ]
}
</answer>
</example>
</examples>"""

    user = """<assessment_context>
<sector>Retail</sector>
<axis>Manage</axis>
<axis_definition>How the business manages CX</axis_definition>
<conversation_stage>diagnostic</conversation_stage>
<ask_evidence_now>no</ask_evidence_now>
</assessment_context>
<focus>
<primary_topic>CX culture</primary_topic>
<related_topics>
- Ownership and governance
</related_topics>
<missing_criteria>
- CX culture
</missing_criteria>
</focus>
<guidance>
<axis_guidance>
Focus on culture
</axis_guidance>
<stage_guidance>
Diagnostic stage
</stage_guidance>
<maturity_rubric_hints>
<rubric_instruction>Use these hints to shape the question so the user's answer can reveal whether the current reality is basic, established, or advanced. Do not mention level numbers to the user.</rubric_instruction>
<maturity_signal level="1">Ad hoc culture</maturity_signal>
<maturity_signal level="2">Established culture</maturity_signal>
<maturity_signal level="3">Advanced culture</maturity_signal>
</maturity_rubric_hints>
</guidance>
<conversation_signal>
<latest_user_answer>We have some stores</latest_user_answer>
</conversation_signal>
<instruction>
Write the next short consultative question. Ask one direct question only, using simple business language.
Also generate 3 distinctive answer options based on the maturity rubric hints, formatted as the user's potential answers (Level 1, Level 2, Level 3).
Return ONLY a valid JSON object matching this schema:
{
  "question": "The question text",
  "options": ["Option 1", "Option 2", "Option 3"]
}
</instruction>"""

    response = await client.chat.complete_async(
        model="mistral-large-latest",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ],
        temperature=0.7
    )
    
    print("RAW OUTPUT:")
    print(response.choices[0].message.content)

if __name__ == "__main__":
    asyncio.run(test_mistral())
