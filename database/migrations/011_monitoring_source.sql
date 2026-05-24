-- 011_monitoring_source.sql
-- Adds monitoring source tracking to reports and a shared monitoring_sources
-- config table so custom sources typed by any monitor are visible to all.

-- ── Shared monitoring sources list ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitoring_sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id   UUID REFERENCES entities(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,  -- true = built-in, cannot be deleted
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitoring_sources_label
  ON monitoring_sources(label);

-- Seed the two built-in sources
INSERT INTO monitoring_sources (label, is_system)
VALUES
  ('رصد استباقي', true),
  ('رصد الأمين',  true)
ON CONFLICT (label) DO NOTHING;

-- ── reports: add monitoring_source column ─────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS monitoring_source VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_reports_monitoring_source
  ON reports(monitoring_source)
  WHERE monitoring_source IS NOT NULL;
