-- EOI Module — ذكاء الرصد الخارجي (External Observation Intelligence)
-- Separate from Official VPI. Generates Estimated/Forecast values only.

-- ─── Unit Conversion Rules ────────────────────────────────────────────────────
-- Configurable: no hardcoded values. 1 report = factor units.

CREATE TABLE IF NOT EXISTS eoi_unit_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  element_pattern TEXT        NOT NULL UNIQUE,
  match_type      VARCHAR(10) NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact', 'contains')),
  factor          NUMERIC     NOT NULL DEFAULT 1.0,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default 2026 rules: special elements = 1/50 per report
INSERT INTO eoi_unit_rules (element_pattern, match_type, factor, description) VALUES
  ('الأرصفة المتهالكة',               'exact',    0.02, '1/50 — large-area element'),
  ('حفر الشوارع',                     'exact',    0.02, '1/50 — large-area element'),
  ('الكتابات المشوهة للجدران والدهان', 'exact',    0.02, '1/50 — large-area element'),
  ('دهان البردورات',                   'exact',    0.02, '1/50 — large-area element'),
  ('عدم دهان الشوارع',                 'exact',    0.02, '1/50 — large-area element'),
  ('مخلفات البناء',                    'exact',    0.02, '1/50 — large-area element')
ON CONFLICT DO NOTHING;

-- ─── Upload Jobs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eoi_upload_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status        VARCHAR(20) NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing', 'completed', 'failed')),
  uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  file_name     TEXT,
  row_count     INTEGER,
  date_range    TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Raw External Observations ───────────────────────────────────────────────
-- Each row = 1 observation report from an external system (Balady Lens, etc.)
-- cluster_id = strategic GIS linkage key — never discard
-- estimated_units = calculated on import using eoi_unit_rules, stored permanently

CREATE TABLE IF NOT EXISTS eoi_observations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_job_id      UUID        REFERENCES eoi_upload_jobs(id) ON DELETE SET NULL,
  cluster_id         TEXT,
  report_number      TEXT,
  municipality_name  TEXT        NOT NULL,
  priority_zone_name TEXT,
  element_name       TEXT        NOT NULL,
  observation_date   DATE        NOT NULL,
  observation_month  VARCHAR(7)  NOT NULL,   -- 'YYYY-MM' derived from date
  visit_status       TEXT,
  closure_status     TEXT,
  closure_date       DATE,
  crm_number         TEXT,
  repeated_count     INTEGER     DEFAULT 0,
  lat                NUMERIC(11,7),
  lng                NUMERIC(11,7),
  processing_info    TEXT,
  estimated_units    NUMERIC     NOT NULL DEFAULT 1.0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Mapping Templates ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eoi_mapping_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  mapping     JSONB       NOT NULL,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Live VPI Estimates (per month, recalculated after each import) ───────────
-- NEVER used as official VPI. Labeled 'Estimated' throughout system.

CREATE TABLE IF NOT EXISTS eoi_live_vpi (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_month     VARCHAR(7)  NOT NULL UNIQUE,
  total_reports         INTEGER     NOT NULL DEFAULT 0,
  total_estimated_units NUMERIC     NOT NULL DEFAULT 0,
  covered_area_km2      NUMERIC,
  estimated_vpi         NUMERIC,
  data_days             INTEGER     NOT NULL DEFAULT 0,
  days_in_month         INTEGER     NOT NULL DEFAULT 30,
  forecast_units_eom    NUMERIC,
  forecast_vpi_eom      NUMERIC,
  confidence_score      VARCHAR(10),   -- 'low' | 'medium' | 'high'
  last_updated          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_eoi_obs_month   ON eoi_observations (observation_month);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_muni    ON eoi_observations (municipality_name);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_elem    ON eoi_observations (element_name);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_date    ON eoi_observations (observation_date);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_clust   ON eoi_observations (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eoi_obs_closure ON eoi_observations (closure_status);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_visit   ON eoi_observations (visit_status);
CREATE INDEX IF NOT EXISTS idx_eoi_obs_coords  ON eoi_observations (lat, lng) WHERE lat IS NOT NULL;
