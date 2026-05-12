-- 002_gis_enterprise_fields.sql
-- Expands GIS attribute persistence for enterprise field mapping.
-- import_features: adds mapped_operational JSONB (all 26 mapped fields)
-- reports: adds 8 dedicated GIS columns + JSONB metadata bucket

ALTER TABLE import_features
  ADD COLUMN IF NOT EXISTS mapped_operational JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_import_features_mapped_operational
  ON import_features USING GIN (mapped_operational);

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS gis_external_id      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gis_observation_date TEXT,
  ADD COLUMN IF NOT EXISTS gis_contractor       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gis_agency           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gis_severity         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gis_violation_type   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gis_notes            TEXT,
  ADD COLUMN IF NOT EXISTS gis_operational_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reports_gis_external_id
  ON reports (gis_external_id)
  WHERE gis_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_gis_contractor
  ON reports (gis_contractor)
  WHERE gis_contractor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_gis_violation_type
  ON reports (gis_violation_type)
  WHERE gis_violation_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_gis_operational_metadata
  ON reports USING GIN (gis_operational_metadata);
