-- 006_spatial_governance.sql
-- Creates spatial governance tables if not already present,
-- then adds governance columns to reports and report_media.

-- ── Ensure spatial_layers exists ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spatial_layers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  layer_name        VARCHAR(255) NOT NULL,
  layer_type        VARCHAR(50) NOT NULL CHECK (layer_type IN (
    'reports', 'municipalities', 'districts', 'neighborhoods', 'priority_zones',
    'maintenance_contracts', 'cleaning_contracts', 'service_areas', 'assets',
    'operational_layers', 'external_jurisdiction_zones'
  )),
  governance_role   VARCHAR(50) CHECK (governance_role IN (
    'ownership', 'contract', 'jurisdiction', 'priority', 'operational'
  )),
  ownership_type    VARCHAR(50) CHECK (ownership_type IN (
    'internal', 'external', 'contracted', 'shared'
  )),
  responsible_entity UUID REFERENCES entities(id),
  contract_reference VARCHAR(255),
  auto_assignment_rules JSONB DEFAULT '{}',
  visibility_scope  VARCHAR(50) DEFAULT 'entity' CHECK (visibility_scope IN (
    'public', 'entity', 'department', 'restricted'
  )),
  layer_priority    INTEGER DEFAULT 0,
  description       TEXT,
  source_file       VARCHAR(1000),
  is_active         BOOLEAN DEFAULT true,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spatial_layers_entity ON spatial_layers(entity_id);
CREATE INDEX IF NOT EXISTS idx_spatial_layers_type   ON spatial_layers(layer_type);
CREATE INDEX IF NOT EXISTS idx_spatial_layers_active ON spatial_layers(is_active);

-- ── Ensure spatial_layer_features exists ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS spatial_layer_features (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spatial_layer_id  UUID NOT NULL REFERENCES spatial_layers(id) ON DELETE CASCADE,
  entity_id         UUID NOT NULL REFERENCES entities(id),
  feature_name      VARCHAR(255),
  feature_type      VARCHAR(50),
  geometry          GEOMETRY(GEOMETRY, 4326) NOT NULL,
  attributes        JSONB DEFAULT '{}',
  municipality_id   UUID,
  district_id       UUID,
  neighborhood      VARCHAR(255),
  contract_id       VARCHAR(255),
  contractor_entity UUID REFERENCES entities(id),
  priority_level    INTEGER,
  sla_hours         INTEGER,
  external_entity   UUID REFERENCES entities(id),
  operational_notes TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slf_layer  ON spatial_layer_features(spatial_layer_id);
CREATE INDEX IF NOT EXISTS idx_slf_entity ON spatial_layer_features(entity_id);
CREATE INDEX IF NOT EXISTS idx_slf_geom   ON spatial_layer_features USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_slf_muni   ON spatial_layer_features(municipality_id);
CREATE INDEX IF NOT EXISTS idx_slf_dist   ON spatial_layer_features(district_id);

-- ── import_jobs: add layer columns ───────────────────────────────────────────
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS layer_type VARCHAR(50) DEFAULT 'reports'
    CHECK (layer_type IN (
      'reports', 'municipalities', 'districts', 'neighborhoods', 'priority_zones',
      'maintenance_contracts', 'cleaning_contracts', 'service_areas', 'assets',
      'operational_layers', 'external_jurisdiction_zones'
    )),
  ADD COLUMN IF NOT EXISTS spatial_layer_id UUID REFERENCES spatial_layers(id);

-- ── reports: governance columns ──────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS priority_zone_id    UUID,
  ADD COLUMN IF NOT EXISTS municipality_id     UUID,
  ADD COLUMN IF NOT EXISTS district_id         UUID,
  ADD COLUMN IF NOT EXISTS neighborhood        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contract_id         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contractor_entity   UUID REFERENCES entities(id),
  ADD COLUMN IF NOT EXISTS priority_level      INTEGER,
  ADD COLUMN IF NOT EXISTS sla_hours           INTEGER,
  ADD COLUMN IF NOT EXISTS responsible_party   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS escalation_chain    JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS spatial_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS spatial_enriched_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_reports_priority_zone_id
  ON reports(priority_zone_id) WHERE priority_zone_id IS NOT NULL;

-- ── spatial_layer_features: feature_label ────────────────────────────────────
ALTER TABLE spatial_layer_features
  ADD COLUMN IF NOT EXISTS feature_label VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_slf_feature_label
  ON spatial_layer_features(feature_label) WHERE feature_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sl_type_active
  ON spatial_layers(layer_type) WHERE is_active = true;

-- ── report_media: uploaded_by ─────────────────────────────────────────────────
ALTER TABLE report_media
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_report_media_uploader
  ON report_media(uploaded_by) WHERE uploaded_by IS NOT NULL;
