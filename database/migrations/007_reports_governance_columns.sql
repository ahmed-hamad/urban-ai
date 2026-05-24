-- 007_reports_governance_columns.sql
-- Adds spatial governance enrichment columns to reports.
-- These are auto-populated by spatialGovernance.js via PostGIS intersection
-- after a report is created. All use COALESCE so explicit values are preserved.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS municipality_id      UUID,
  ADD COLUMN IF NOT EXISTS district_id          UUID,
  ADD COLUMN IF NOT EXISTS neighborhood         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS priority_level       INTEGER,
  ADD COLUMN IF NOT EXISTS sla_hours            INTEGER,
  ADD COLUMN IF NOT EXISTS contract_id          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS spatial_enriched_at  TIMESTAMPTZ;

-- Governance lookup indexes
CREATE INDEX IF NOT EXISTS idx_reports_municipality_id
  ON reports(municipality_id)
  WHERE municipality_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_district_id
  ON reports(district_id)
  WHERE district_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_contract_id
  ON reports(contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_priority_level
  ON reports(priority_level)
  WHERE priority_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_spatial_enriched
  ON reports(spatial_enriched_at)
  WHERE spatial_enriched_at IS NOT NULL;
