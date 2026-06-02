-- VPI Mapping Templates
-- Saves user-confirmed field mappings so future imports suggest them automatically

CREATE TABLE IF NOT EXISTS vpi_mapping_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  dataset_type VARCHAR(20) NOT NULL CHECK (dataset_type IN ('observations', 'coverage')),
  mapping      JSONB       NOT NULL,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vpi_templates_type ON vpi_mapping_templates (dataset_type);
