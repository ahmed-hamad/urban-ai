-- VPI Module — مؤشر التشوه البصري (Visual Pollution Index)
-- Replaces VDI tables (017) with official VPI terminology + enhanced schema
-- New: targets table, coverage_rate, element VPI at multiple scopes, cluster_id as external ID

DROP TABLE IF EXISTS vdi_zone_kpi        CASCADE;
DROP TABLE IF EXISTS vdi_element_kpi     CASCADE;
DROP TABLE IF EXISTS vdi_amanah_kpi      CASCADE;
DROP TABLE IF EXISTS vdi_municipality_kpi CASCADE;
DROP TABLE IF EXISTS vdi_coverage        CASCADE;
DROP TABLE IF EXISTS vdi_observations    CASCADE;
DROP TABLE IF EXISTS vdi_upload_jobs     CASCADE;

-- ─── KPI Targets (configurable — no hardcoded values) ────────────────────────

CREATE TABLE IF NOT EXISTS vpi_targets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INTEGER     NOT NULL UNIQUE,
  vpi_target      NUMERIC     NOT NULL,   -- violations per km²
  coverage_target NUMERIC     NOT NULL,   -- percentage
  notes           TEXT,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO vpi_targets (year, vpi_target, coverage_target, notes)
VALUES (2026, 27, 95, 'المستهدف السنوي 2026')
ON CONFLICT (year) DO NOTHING;

-- ─── Upload Job Tracker ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vpi_upload_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month         VARCHAR(7)  NOT NULL,
  upload_type   VARCHAR(20) NOT NULL CHECK (upload_type IN ('observations', 'coverage')),
  status        VARCHAR(20) NOT NULL DEFAULT 'processing'
                            CHECK (status IN ('processing', 'completed', 'failed')),
  uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  file_name     TEXT,
  row_count     INTEGER,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Raw Observations ────────────────────────────────────────────────────────
-- Each row = 1 report
-- cluster_id = External Observation Report ID (future GIS spatial link)

CREATE TABLE IF NOT EXISTS vpi_observations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_job_id      UUID        NOT NULL REFERENCES vpi_upload_jobs(id) ON DELETE CASCADE,
  month              VARCHAR(7)  NOT NULL,
  municipality_name  TEXT        NOT NULL,
  priority_zone_name TEXT,
  element_name       TEXT        NOT NULL,
  units_count        NUMERIC     NOT NULL DEFAULT 0,
  cluster_id         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Raw Coverage ─────────────────────────────────────────────────────────────
-- covered_area_km2 = "المساحة (كم2)" — official measurement for all VPI calculations
-- zone_area_km2    = reference metadata only

CREATE TABLE IF NOT EXISTS vpi_coverage (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_job_id       UUID        NOT NULL REFERENCES vpi_upload_jobs(id) ON DELETE CASCADE,
  month               VARCHAR(7)  NOT NULL,
  municipality_name   TEXT        NOT NULL,
  priority_zone_name  TEXT,
  zone_area_km2       NUMERIC,
  covered_area_km2    NUMERIC     NOT NULL DEFAULT 0,
  coverage_rate       NUMERIC,    -- covered/zone*100 (from Excel or calculated)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Amanah KPI Snapshots ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vpi_amanah_kpi (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month                  VARCHAR(7)  NOT NULL UNIQUE,
  total_units            NUMERIC     NOT NULL DEFAULT 0,
  total_covered_area_km2 NUMERIC     NOT NULL DEFAULT 0,
  total_zone_area_km2    NUMERIC,
  vpi                    NUMERIC     NOT NULL DEFAULT 0,
  coverage_rate          NUMERIC,    -- total_covered / total_zone * 100
  report_count           INTEGER     NOT NULL DEFAULT 0,
  municipality_count     INTEGER     NOT NULL DEFAULT 0,
  calculated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Municipality KPI Snapshots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vpi_municipality_kpi (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month             VARCHAR(7)  NOT NULL,
  municipality_name TEXT        NOT NULL,
  report_count      INTEGER     NOT NULL DEFAULT 0,
  total_units       NUMERIC     NOT NULL DEFAULT 0,
  covered_area_km2  NUMERIC     NOT NULL DEFAULT 0,
  zone_area_km2     NUMERIC,
  vpi               NUMERIC     NOT NULL DEFAULT 0,
  coverage_rate     NUMERIC,
  amanah_units      NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct  NUMERIC     NOT NULL DEFAULT 0,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, municipality_name)
);

-- ─── Element KPI Snapshots (multi-scope) ─────────────────────────────────────
-- scope: Amanah (both NULL), Municipality (zone NULL), Zone (both set)

CREATE TABLE IF NOT EXISTS vpi_element_kpi (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month              VARCHAR(7)  NOT NULL,
  element_name       TEXT        NOT NULL,
  municipality_name  TEXT,
  priority_zone_name TEXT,
  report_count       INTEGER     NOT NULL DEFAULT 0,
  total_units        NUMERIC     NOT NULL DEFAULT 0,
  covered_area_km2   NUMERIC     NOT NULL DEFAULT 0,
  vpi                NUMERIC     NOT NULL DEFAULT 0,
  amanah_units       NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct   NUMERIC     NOT NULL DEFAULT 0,
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (month, element_name, municipality_name, priority_zone_name)
);

-- ─── Priority Zone KPI Snapshots ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vpi_zone_kpi (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month               VARCHAR(7)  NOT NULL,
  municipality_name   TEXT        NOT NULL,
  priority_zone_name  TEXT        NOT NULL,
  report_count        INTEGER     NOT NULL DEFAULT 0,
  total_units         NUMERIC     NOT NULL DEFAULT 0,
  covered_area_km2    NUMERIC     NOT NULL DEFAULT 0,
  zone_area_km2       NUMERIC,
  vpi                 NUMERIC     NOT NULL DEFAULT 0,
  coverage_rate       NUMERIC,
  amanah_units        NUMERIC     NOT NULL DEFAULT 0,
  municipality_units  NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct    NUMERIC     NOT NULL DEFAULT 0,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, municipality_name, priority_zone_name)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vpi_obs_month  ON vpi_observations (month);
CREATE INDEX IF NOT EXISTS idx_vpi_obs_muni   ON vpi_observations (municipality_name);
CREATE INDEX IF NOT EXISTS idx_vpi_obs_elem   ON vpi_observations (element_name);
CREATE INDEX IF NOT EXISTS idx_vpi_obs_clust  ON vpi_observations (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vpi_cov_month  ON vpi_coverage (month);
CREATE INDEX IF NOT EXISTS idx_vpi_cov_muni   ON vpi_coverage (municipality_name);
CREATE INDEX IF NOT EXISTS idx_vpi_mkpi_month ON vpi_municipality_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vpi_ekpi_month ON vpi_element_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vpi_zkpi_month ON vpi_zone_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vpi_jobs_month ON vpi_upload_jobs (month);
