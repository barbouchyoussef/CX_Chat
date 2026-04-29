ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS current_axis VARCHAR(50),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE criteria
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE assessment_criteria
ADD COLUMN IF NOT EXISTS evidence_text TEXT,
ADD COLUMN IF NOT EXISTS rationale TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS axis VARCHAR(50),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_assessment_criteria_assessment'
    ) THEN
        ALTER TABLE assessment_criteria
        ADD CONSTRAINT fk_assessment_criteria_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_assessment_criteria_criterion'
    ) THEN
        ALTER TABLE assessment_criteria
        ADD CONSTRAINT fk_assessment_criteria_criterion
        FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_messages_assessment'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT fk_messages_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_assessment_criterion'
    ) THEN
        ALTER TABLE assessment_criteria
        ADD CONSTRAINT uq_assessment_criterion UNIQUE (assessment_id, criterion_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_assessments_company_id ON assessments(company_id);
CREATE INDEX IF NOT EXISTS ix_criteria_axis_id ON criteria(axis_id);
CREATE INDEX IF NOT EXISTS ix_assessment_criteria_assessment_id ON assessment_criteria(assessment_id);
CREATE INDEX IF NOT EXISTS ix_assessment_criteria_criterion_id ON assessment_criteria(criterion_id);
CREATE INDEX IF NOT EXISTS ix_messages_assessment_id ON messages(assessment_id);
