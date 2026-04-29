BEGIN;

-- Axes
INSERT INTO axes (name) VALUES ('Manage') ON CONFLICT (name) DO NOTHING;
INSERT INTO axes (name) VALUES ('Analyze') ON CONFLICT (name) DO NOTHING;
INSERT INTO axes (name) VALUES ('Maintain') ON CONFLICT (name) DO NOTHING;

-- Generic criteria per axis (MVP seed)
-- Manage
INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'manage.feedback_collection', 'Feedback collection channels and cadence'
FROM axes a WHERE a.name = 'Manage'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'manage.ticketing_process', 'Support/ticketing process and ownership'
FROM axes a WHERE a.name = 'Manage'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'manage.customer_journeys', 'Key customer journeys documented and monitored'
FROM axes a WHERE a.name = 'Manage'
ON CONFLICT (code) DO NOTHING;

-- Analyze
INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'analyze.kpis', 'Customer experience KPIs (NPS, CSAT, CES) measured and reviewed'
FROM axes a WHERE a.name = 'Analyze'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'analyze.segmentation', 'Segmentation by customer type/behavior for insights'
FROM axes a WHERE a.name = 'Analyze'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'analyze.root_cause', 'Root cause analysis on top issues (qualitative + quantitative)'
FROM axes a WHERE a.name = 'Analyze'
ON CONFLICT (code) DO NOTHING;

-- Maintain
INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'maintain.improvement_loop', 'Continuous improvement loop with prioritization and tracking'
FROM axes a WHERE a.name = 'Maintain'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'maintain.training', 'Teams trained and enabled to deliver consistent CX'
FROM axes a WHERE a.name = 'Maintain'
ON CONFLICT (code) DO NOTHING;

INSERT INTO criteria (axis_id, code, label)
SELECT a.id, 'maintain.governance', 'Governance: roles, rituals, and accountability for CX outcomes'
FROM axes a WHERE a.name = 'Maintain'
ON CONFLICT (code) DO NOTHING;

COMMIT;

