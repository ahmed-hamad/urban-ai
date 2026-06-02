-- VDI Module — مؤشر التشوه البصري
-- Independent KPI engine: not linked to reports workflow, GIS imports, or intake queues

CREATE TABLE IF NOT EXISTS vdi_upload_jobs (
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

-- Raw observation rows — each row = 1 report
CREATE TABLE IF NOT EXISTS vdi_observations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_job_id       UUID        NOT NULL REFERENCES vdi_upload_jobs(id) ON DELETE CASCADE,
  month               VARCHAR(7)  NOT NULL,
  municipality_name   TEXT        NOT NULL,
  priority_zone_name  TEXT,
  element_name        TEXT        NOT NULL,
  units_count         NUMERIC     NOT NULL DEFAULT 0,
  cluster_id          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw coverage data — covered_area is used in VDI formula; zone_area is metadata
CREATE TABLE IF NOT EXISTS vdi_coverage (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_job_id       UUID        NOT NULL REFERENCES vdi_upload_jobs(id) ON DELETE CASCADE,
  month               VARCHAR(7)  NOT NULL,
  municipality_name   TEXT        NOT NULL,
  priority_zone_name  TEXT,
  zone_area           NUMERIC,
  covered_area        NUMERIC     NOT NULL DEFAULT 0,
  coverage_percentage NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-calculated municipality KPIs (refreshed on each upload)
CREATE TABLE IF NOT EXISTS vdi_municipality_kpi (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month             VARCHAR(7)  NOT NULL,
  municipality_name TEXT        NOT NULL,
  report_count      INTEGER     NOT NULL DEFAULT 0,
  total_units       NUMERIC     NOT NULL DEFAULT 0,
  covered_area      NUMERIC     NOT NULL DEFAULT 0,
  zone_area         NUMERIC,
  vdi               NUMERIC     NOT NULL DEFAULT 0,
  amanah_units      NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct  NUMERIC     NOT NULL DEFAULT 0,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, municipality_name)
);

-- Pre-calculated Amanah-level KPIs
CREATE TABLE IF NOT EXISTS vdi_amanah_kpi (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month               VARCHAR(7)  NOT NULL UNIQUE,
  total_units         NUMERIC     NOT NULL DEFAULT 0,
  total_covered_area  NUMERIC     NOT NULL DEFAULT 0,
  vdi                 NUMERIC     NOT NULL DEFAULT 0,
  report_count        INTEGER     NOT NULL DEFAULT 0,
  municipality_count  INTEGER     NOT NULL DEFAULT 0,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-calculated element KPIs — municipality_name IS NULL means Amanah-wide
CREATE TABLE IF NOT EXISTS vdi_element_kpi (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month             VARCHAR(7)  NOT NULL,
  element_name      TEXT        NOT NULL,
  municipality_name TEXT,
  report_count      INTEGER     NOT NULL DEFAULT 0,
  total_units       NUMERIC     NOT NULL DEFAULT 0,
  amanah_units      NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct  NUMERIC     NOT NULL DEFAULT 0,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, element_name, municipality_name)
);

-- Pre-calculated priority zone KPIs
CREATE TABLE IF NOT EXISTS vdi_zone_kpi (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month               VARCHAR(7)  NOT NULL,
  municipality_name   TEXT        NOT NULL,
  priority_zone_name  TEXT        NOT NULL,
  report_count        INTEGER     NOT NULL DEFAULT 0,
  total_units         NUMERIC     NOT NULL DEFAULT 0,
  covered_area        NUMERIC     NOT NULL DEFAULT 0,
  zone_area           NUMERIC,
  vdi                 NUMERIC     NOT NULL DEFAULT 0,
  municipality_units  NUMERIC     NOT NULL DEFAULT 0,
  contribution_pct    NUMERIC     NOT NULL DEFAULT 0,
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, municipality_name, priority_zone_name)
);

CREATE INDEX IF NOT EXISTS idx_vdi_obs_month   ON vdi_observations (month);
CREATE INDEX IF NOT EXISTS idx_vdi_obs_muni    ON vdi_observations (municipality_name);
CREATE INDEX IF NOT EXISTS idx_vdi_obs_elem    ON vdi_observations (element_name);
CREATE INDEX IF NOT EXISTS idx_vdi_cov_month   ON vdi_coverage (month);
CREATE INDEX IF NOT EXISTS idx_vdi_cov_muni    ON vdi_coverage (municipality_name);
CREATE INDEX IF NOT EXISTS idx_vdi_mkpi_month  ON vdi_municipality_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vdi_ekpi_month  ON vdi_element_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vdi_zkpi_month  ON vdi_zone_kpi (month);
CREATE INDEX IF NOT EXISTS idx_vdi_jobs_month  ON vdi_upload_jobs (month);
