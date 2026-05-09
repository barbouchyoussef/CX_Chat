BEGIN;

WITH guideline_updates(code, question_guidelines) AS (
  VALUES
    ('manage.feedback_collection', 'Goal: understand how customer feedback is captured and reviewed at an operating level. Start with one simple question: where does customer feedback come from today, and how regularly do teams look at it? If needed, ask who reviews it and whether it covers the main journeys. Basic signals: collection is informal, local, or mostly complaint-based. Established signals: regular channels and review rhythm exist, but coverage is incomplete. Advanced signals: feedback channels are structured, repeated, and linked to team routines and decision forums.'),
    ('manage.ticketing_process', 'Goal: understand whether customer issues follow a clear support process. Ask what happens when a customer reports a problem, from first contact to closure. If needed, ask who owns the ticket, how handoffs work, and how unresolved issues are escalated. Basic signals: issues are handled ad hoc and ownership is unclear. Established signals: a support process exists with some ownership and follow-up. Advanced signals: tickets have clear ownership, handoffs, service rules, and escalation paths that teams follow consistently.'),
    ('manage.customer_journeys', 'Goal: understand whether key customer journeys are documented and monitored by the business. Start by asking which customer journeys matter most and whether they are documented in any shared way. If needed, ask who owns them, how often they are reviewed, and whether teams track pain points along the journey. Basic signals: journeys are not formally documented. Established signals: some journeys are mapped or discussed but not consistently maintained. Advanced signals: important journeys are documented, monitored, and used in management routines.'),
    ('analyze.kpis', 'Goal: understand which customer measures the business tracks and how they are reviewed. Ask one practical question: which customer or service scores do you follow today, and what happens when they go in the wrong direction? Avoid jargon unless the user uses it first. Basic signals: measures are limited or disconnected from action. Established signals: customer scores are reviewed regularly and sometimes influence actions. Advanced signals: customer measures are reviewed with clear owners and drive prioritization, follow-up, and business decisions.'),
    ('analyze.segmentation', 'Goal: understand whether the business looks at different customer groups separately. Ask whether teams break down customer insight by segment, customer type, value, usage, or behavior. If needed, ask for one example where one customer group showed a different problem or need. Basic signals: one overall view only. Established signals: some segmentation exists but is used selectively. Advanced signals: segmentation is standard and directly shapes priorities, journeys, and actions.'),
    ('analyze.root_cause', 'Goal: understand whether teams go beyond symptoms to find underlying causes. Ask for one recent issue and how the team determined the real cause. If needed, ask what data was used, who was involved, and whether the same issue came back later. Basic signals: symptom fixing only. Established signals: some root-cause work exists but is inconsistent. Advanced signals: teams use structured root-cause analysis regularly and link it to action and verification.'),
    ('improve.improvement_loop', 'Goal: understand whether improvement actions are prioritized and tracked through to completion. Ask what happens after a pain point is identified, from prioritization to follow-up. If needed, ask how owners, deadlines, and status are tracked. Basic signals: improvements are one-off and weakly tracked. Established signals: some backlog or follow-up exists, but discipline is uneven. Advanced signals: there is a repeatable improvement loop with prioritization, owners, deadlines, and closure checks.'),
    ('improve.training', 'Goal: understand whether teams are enabled to deliver a consistent customer experience. Ask how frontline and support teams are trained or coached to handle customer experience well. If needed, ask how often training happens and how managers know the training is working. Basic signals: limited or informal enablement. Established signals: training exists but is uneven across teams. Advanced signals: teams are continuously trained, coached, and equipped with practical standards tied to customer outcomes.'),
    ('improve.governance', 'Goal: understand whether CX improvement is supported by roles, rituals, and accountability. Ask who reviews progress on customer experience improvements and how teams stay accountable. If needed, ask about recurring meetings, action tracking, and leadership involvement. Basic signals: improvements are not governed consistently. Established signals: some routines exist, but follow-through varies. Advanced signals: regular governance, clear ownership, and tracked accountability support sustained CX improvement.')
)
UPDATE capabilities c
SET question_guidelines = g.question_guidelines
FROM guideline_updates g
WHERE c.code = g.code;

WITH rubric_rows(code, level_number, description) AS (
  VALUES
    ('manage.feedback_collection', 1, 'Feedback is collected inconsistently, locally, or mainly through complaints; review rhythm is weak or absent.'),
    ('manage.feedback_collection', 2, 'Feedback channels and a review rhythm exist, but coverage is partial and actions are not consistently coordinated across teams.'),
    ('manage.feedback_collection', 3, 'Feedback collection is structured across key channels and regularly reviewed by teams to guide action and service decisions.'),
    ('manage.ticketing_process', 1, 'Customer issues are handled case by case with unclear ownership, weak tracking, and inconsistent escalation.'),
    ('manage.ticketing_process', 2, 'A support or ticketing process exists with named owners, but handoffs, tracking, or escalation discipline are uneven.'),
    ('manage.ticketing_process', 3, 'Customer issues follow a clear process with ownership, service rules, handoffs, escalation, and reliable follow-up.'),
    ('manage.customer_journeys', 1, 'Key customer journeys are not formally documented or monitored; teams focus mainly on isolated touchpoints.'),
    ('manage.customer_journeys', 2, 'Some important journeys are documented or discussed, but ownership, updates, and monitoring are inconsistent.'),
    ('manage.customer_journeys', 3, 'Key journeys are documented, owned, monitored, and used by teams to guide priorities and service improvements.'),
    ('analyze.kpis', 1, 'Customer measures are limited, lagging, or disconnected from regular review and action.'),
    ('analyze.kpis', 2, 'Customer measures are tracked and reviewed regularly, but action ownership and business linkage are incomplete.'),
    ('analyze.kpis', 3, 'Customer measures are reviewed with clear ownership and directly influence prioritization, operational follow-up, and business decisions.'),
    ('analyze.segmentation', 1, 'Customer insight is viewed mostly in aggregate, with little or no segmentation by type, value, or behavior.'),
    ('analyze.segmentation', 2, 'Some segmentation exists, but it is used selectively and does not consistently shape analysis or decisions.'),
    ('analyze.segmentation', 3, 'Segmentation is routinely applied and helps teams understand needs, prioritize issues, and tailor actions.'),
    ('analyze.root_cause', 1, 'Teams mainly react to symptoms and do not consistently identify the underlying causes of customer issues.'),
    ('analyze.root_cause', 2, 'Root-cause analysis is used in some cases, but methods, evidence, and follow-through are not consistent.'),
    ('analyze.root_cause', 3, 'Teams regularly use structured root-cause analysis and connect findings to actions, owners, and verification.'),
    ('improve.improvement_loop', 1, 'Improvement actions are reactive, one-off, or weakly tracked after issues are identified.'),
    ('improve.improvement_loop', 2, 'A backlog or follow-up process exists, but prioritization, ownership, or closure discipline is inconsistent.'),
    ('improve.improvement_loop', 3, 'A repeatable improvement loop exists with prioritization, owners, deadlines, status tracking, and closure checks.'),
    ('improve.training', 1, 'Teams receive limited or informal enablement, with weak consistency in how customer experience is delivered.'),
    ('improve.training', 2, 'Some customer experience training or coaching exists, but coverage and consistency vary across teams.'),
    ('improve.training', 3, 'Teams are continuously trained, coached, and equipped with practical standards tied to customer outcomes.'),
    ('improve.governance', 1, 'Customer experience improvement lacks regular governance, clear roles, and consistent accountability.'),
    ('improve.governance', 2, 'Some governance routines exist for CX improvement, but follow-through and accountability remain uneven.'),
    ('improve.governance', 3, 'Customer experience improvement is governed through regular rituals, clear ownership, action tracking, and leadership accountability.')
)
INSERT INTO capability_maturity_rubrics (capability_id, maturity_level_id, description)
SELECT c.id, ml.id, r.description
FROM rubric_rows r
JOIN capabilities c ON c.code = r.code
JOIN maturity_levels ml ON ml.level_number = r.level_number
ON CONFLICT (capability_id, maturity_level_id)
DO UPDATE SET description = EXCLUDED.description;

WITH recommendation_rows(code, level_number, recommendation_guideline, priority_hint, consultant_note, evidence_to_cite, initiative_suggestions, business_impact, tone_hint) AS (
  VALUES
    ('manage.feedback_collection', 1, 'Set up 3-5 core feedback channels with a clear weekly review rhythm and a named owner for follow-up.', 'urgent_foundation', 'Start simple and operational.', 'Feedback is informal or complaint-led.', 'Touchpoint feedback channels; weekly review routine', 'Earlier issue detection and faster service correction.', 'direct'),
    ('manage.feedback_collection', 2, 'Expand feedback coverage across the main journeys and connect reviews to cross-functional action tracking.', 'build_consistency', 'Move from partial coverage to managed coverage.', 'Regular channels exist but are partial.', 'Journey coverage expansion; cross-team review', 'Better visibility across the full customer experience.', 'balanced'),
    ('manage.feedback_collection', 3, 'Integrate feedback channels into operating routines and decision forums so customer signals shape service and investment choices.', 'scale_advantage', 'Use structured listening as a management asset.', 'Structured channels and review rhythm already exist.', 'Integrated listening governance', 'Stronger decision quality and reduced churn risk.', 'executive'),
    ('manage.ticketing_process', 1, 'Define a simple ticketing flow with owner, status, escalation rule, and closure check for customer issues.', 'urgent_foundation', 'Create a minimum viable support discipline.', 'Ownership and tracking are weak.', 'Ticket flow; escalation rule', 'Fewer lost issues and faster customer recovery.', 'direct'),
    ('manage.ticketing_process', 2, 'Strengthen ticket handoffs, service expectations, and escalation rules across the main support journeys.', 'build_consistency', 'Focus on reliability across teams.', 'A process exists but is uneven.', 'Handoff design; service rules', 'Lower rework and more predictable resolution.', 'balanced'),
    ('manage.ticketing_process', 3, 'Use ticket data to improve root-cause visibility, prioritization, and proactive service recovery.', 'scale_advantage', 'Turn support operations into a learning system.', 'Support discipline is already strong.', 'Ticket analytics; proactive recovery', 'Lower failure demand and improved customer trust.', 'executive'),
    ('manage.customer_journeys', 1, 'Document the 2-3 most important customer journeys and assign an owner for each one.', 'urgent_foundation', 'Start where customer impact is highest.', 'Journeys are not formally documented.', 'Priority journeys; journey owner', 'Better focus on the highest-friction experiences.', 'direct'),
    ('manage.customer_journeys', 2, 'Maintain key journeys with review cadence, pain-point tracking, and links to improvement actions.', 'build_consistency', 'Make journeys a living management tool.', 'Some journeys exist but are not maintained.', 'Journey review cadence; pain-point log', 'Stronger cross-team alignment and prioritization.', 'balanced'),
    ('manage.customer_journeys', 3, 'Use owned and monitored journeys as the backbone for planning, governance, and resource prioritization.', 'scale_advantage', 'Scale journey management into the operating model.', 'Key journeys are already documented and monitored.', 'Journey operating model', 'Better investment focus and end-to-end experience quality.', 'executive'),
    ('analyze.kpis', 1, 'Define a small set of customer and service measures, assign owners, and review them on a fixed cadence.', 'urgent_foundation', 'Start with clarity and rhythm.', 'Measures are weak or disconnected from action.', 'Customer/service score baseline', 'Better visibility and faster correction.', 'direct'),
    ('analyze.kpis', 2, 'Link customer measures to owners, root causes, and actions so score movement triggers consistent follow-up.', 'build_consistency', 'Close the gap between review and action.', 'Measures are tracked but action linkage is partial.', 'Action-linked KPI reviews', 'More reliable follow-through and proof of impact.', 'balanced'),
    ('analyze.kpis', 3, 'Use customer measures as part of a broader operating dashboard that shapes priorities, investment, and service design.', 'scale_advantage', 'Turn measures into a strategic lever.', 'Measures already influence decisions.', 'Integrated decision dashboard', 'Stronger CX ROI and executive alignment.', 'executive'),
    ('analyze.segmentation', 1, 'Start segmenting feedback and performance by a few meaningful customer groups such as customer type, value, or usage pattern.', 'urgent_foundation', 'Use simple segmentation first.', 'Analysis is mostly aggregate.', 'Basic customer segmentation', 'Sharper insight into where issues hurt most.', 'direct'),
    ('analyze.segmentation', 2, 'Standardize segmentation in reporting and use it to compare needs, pain points, and outcomes across groups.', 'build_consistency', 'Make segmentation part of normal analysis.', 'Segmentation exists but is selective.', 'Segment-based reporting', 'Better targeting and smarter prioritization.', 'balanced'),
    ('analyze.segmentation', 3, 'Use segmentation to tailor journeys, interventions, and retention actions to the groups that matter most.', 'scale_advantage', 'Connect segmentation to action at scale.', 'Segmentation is already established.', 'Segment-led action design', 'Higher relevance, conversion, and loyalty.', 'executive'),
    ('analyze.root_cause', 1, 'Introduce a simple root-cause method for the top recurring issues and require owners to document the true cause before closure.', 'urgent_foundation', 'Stop fixing symptoms only.', 'Teams react to symptoms.', 'Root-cause checklist', 'Fewer recurring issues and lower service waste.', 'direct'),
    ('analyze.root_cause', 2, 'Use recurring root-cause reviews across teams and connect findings to prioritized action plans and verification.', 'build_consistency', 'Increase discipline and follow-through.', 'Root-cause work is inconsistent.', 'Cross-team root-cause reviews', 'More effective fixes and better learning.', 'balanced'),
    ('analyze.root_cause', 3, 'Combine root-cause analysis with predictive signals and trend monitoring to catch problems earlier.', 'scale_advantage', 'Move from diagnosis to anticipation.', 'Structured root-cause practice already exists.', 'Predictive issue detection', 'Fewer failures and faster recovery.', 'executive'),
    ('improve.improvement_loop', 1, 'Create a shared improvement backlog with owner, due date, priority, and closure evidence for each action.', 'urgent_foundation', 'Introduce one clear improvement system.', 'Improvement work is reactive and weakly tracked.', 'Improvement backlog', 'Higher completion discipline and clearer ownership.', 'direct'),
    ('improve.improvement_loop', 2, 'Use a regular improvement review to reprioritize actions, unblock teams, and verify whether fixes actually worked.', 'build_consistency', 'Make follow-through reliable.', 'A backlog exists but discipline is uneven.', 'Improvement review cadence', 'More reliable execution and measurable outcomes.', 'balanced'),
    ('improve.improvement_loop', 3, 'Use the improvement loop to manage a portfolio of changes by customer and business impact.', 'scale_advantage', 'Turn improvement into a managed portfolio.', 'A strong improvement loop already exists.', 'Impact-based improvement portfolio', 'Better resource allocation and stronger value delivery.', 'executive'),
    ('improve.training', 1, 'Equip frontline and support teams with a simple CX playbook, practical scenarios, and coaching on the moments that matter most.', 'urgent_foundation', 'Focus on practical behavior change.', 'Enablement is limited or informal.', 'CX playbook; coaching', 'More consistent service and higher employee confidence.', 'direct'),
    ('improve.training', 2, 'Expand training into recurring coaching and quality feedback across teams and channels.', 'build_consistency', 'Make enablement repeatable.', 'Training exists but is uneven.', 'Coaching rhythm; quality feedback', 'Stronger consistency and better service outcomes.', 'balanced'),
    ('improve.training', 3, 'Link training, coaching, and recognition to the customer outcomes the business wants to improve most.', 'scale_advantage', 'Tie enablement directly to value.', 'Training is already embedded.', 'Outcome-linked enablement', 'Faster adoption and better CX performance.', 'executive'),
    ('improve.governance', 1, 'Set a simple CX governance rhythm with named owners, action review, and escalation of blocked issues.', 'urgent_foundation', 'Start with rhythm and accountability.', 'Governance is weak or inconsistent.', 'CX governance cadence', 'Clearer ownership and faster progress.', 'direct'),
    ('improve.governance', 2, 'Formalize governance with cross-functional reviews, action tracking, and leadership follow-up on unresolved issues.', 'build_consistency', 'Strengthen follow-through.', 'Some routines exist but accountability is uneven.', 'Cross-functional CX reviews', 'Better execution discipline and fewer stalled actions.', 'balanced'),
    ('improve.governance', 3, 'Use governance to steer improvement investment, benefit realization, and outcome accountability across journeys.', 'scale_advantage', 'Move governance toward value management.', 'Governance is already structured.', 'Benefit realization governance', 'Sustained improvement and stronger ROI.', 'executive')
)
INSERT INTO capability_recommendations (
  capability_id,
  maturity_level_id,
  recommendation_guideline,
  priority_hint,
  consultant_note,
  evidence_to_cite,
  initiative_suggestions,
  business_impact,
  tone_hint
)
SELECT
  c.id,
  ml.id,
  r.recommendation_guideline,
  r.priority_hint,
  r.consultant_note,
  r.evidence_to_cite,
  r.initiative_suggestions,
  r.business_impact,
  r.tone_hint
FROM recommendation_rows r
JOIN capabilities c ON c.code = r.code
JOIN maturity_levels ml ON ml.level_number = r.level_number
ON CONFLICT (capability_id, maturity_level_id)
DO UPDATE SET
  recommendation_guideline = EXCLUDED.recommendation_guideline,
  priority_hint = EXCLUDED.priority_hint,
  consultant_note = EXCLUDED.consultant_note,
  evidence_to_cite = EXCLUDED.evidence_to_cite,
  initiative_suggestions = EXCLUDED.initiative_suggestions,
  business_impact = EXCLUDED.business_impact,
  tone_hint = EXCLUDED.tone_hint;

COMMIT;
