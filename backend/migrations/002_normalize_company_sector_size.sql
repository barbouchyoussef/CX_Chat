BEGIN;

CREATE TABLE IF NOT EXISTS sectors (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_sizes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

INSERT INTO sectors (code, label)
VALUES ('unknown', 'Unknown')
ON CONFLICT (code) DO NOTHING;

INSERT INTO company_sizes (code, label)
VALUES ('unknown', 'Unknown')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sectors (code, label)
SELECT DISTINCT lower(trim(c.sector)) AS code, trim(c.sector) AS label
FROM companies c
WHERE c.sector IS NOT NULL AND trim(c.sector) <> ''
ON CONFLICT (code) DO NOTHING;

INSERT INTO company_sizes (code, label)
SELECT DISTINCT lower(trim(c.size)) AS code, trim(c.size) AS label
FROM companies c
WHERE c.size IS NOT NULL AND trim(c.size) <> ''
ON CONFLICT (code) DO NOTHING;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS sector_id INTEGER,
  ADD COLUMN IF NOT EXISTS company_size_id INTEGER;

UPDATE companies c
SET sector_id = s.id
FROM sectors s
WHERE s.code = lower(trim(c.sector));

UPDATE companies c
SET company_size_id = cs.id
FROM company_sizes cs
WHERE cs.code = lower(trim(c.size));

UPDATE companies
SET sector_id = (SELECT id FROM sectors WHERE code = 'unknown')
WHERE sector_id IS NULL;

UPDATE companies
SET company_size_id = (SELECT id FROM company_sizes WHERE code = 'unknown')
WHERE company_size_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_companies_sector') THEN
    ALTER TABLE companies
      ADD CONSTRAINT fk_companies_sector FOREIGN KEY (sector_id) REFERENCES sectors(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_companies_company_size') THEN
    ALTER TABLE companies
      ADD CONSTRAINT fk_companies_company_size FOREIGN KEY (company_size_id) REFERENCES company_sizes(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_companies_sector_id ON companies(sector_id);
CREATE INDEX IF NOT EXISTS ix_companies_company_size_id ON companies(company_size_id);

ALTER TABLE companies
  ALTER COLUMN sector_id SET NOT NULL,
  ALTER COLUMN company_size_id SET NOT NULL;

COMMIT;
