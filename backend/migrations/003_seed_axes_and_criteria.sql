BEGIN;

-- Axes
INSERT INTO axes (code, name, sort_order)
VALUES
  ('manage', 'Manage', 1),
  ('analyze', 'Analyze', 2),
  ('improve', 'Improve', 3)
ON CONFLICT (code) DO NOTHING;

-- Generic capabilities per axis (MVP seed)
INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'manage.feedback_collection', 'Feedback collection channels and cadence', 10
FROM axes a WHERE a.code = 'manage'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'manage.ticketing_process', 'Support/ticketing process and ownership', 20
FROM axes a WHERE a.code = 'manage'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'manage.customer_journeys', 'Key customer journeys documented and monitored', 30
FROM axes a WHERE a.code = 'manage'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'analyze.kpis', 'Customer experience KPIs (NPS, CSAT, CES) measured and reviewed', 10
FROM axes a WHERE a.code = 'analyze'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'analyze.segmentation', 'Segmentation by customer type or behavior for insights', 20
FROM axes a WHERE a.code = 'analyze'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'analyze.root_cause', 'Root cause analysis on top issues (qualitative and quantitative)', 30
FROM axes a WHERE a.code = 'analyze'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'improve.improvement_loop', 'Continuous improvement loop with prioritization and tracking', 10
FROM axes a WHERE a.code = 'improve'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'improve.training', 'Teams trained and enabled to deliver consistent CX', 20
FROM axes a WHERE a.code = 'improve'
ON CONFLICT (code) DO NOTHING;

INSERT INTO capabilities (axis_id, code, name, sort_order)
SELECT a.id, 'improve.governance', 'Governance: roles, rituals, and accountability for CX outcomes', 30
FROM axes a WHERE a.code = 'improve'
ON CONFLICT (code) DO NOTHING;

COMMIT;
