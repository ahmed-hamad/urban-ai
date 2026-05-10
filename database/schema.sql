-- UrbanAI — Full PostGIS-Ready Database Schema
-- Requires: PostgreSQL 14+ with PostGIS extension
-- Run once on a fresh database.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── CORE ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(30)  NOT NULL CHECK (type IN ('internal', 'external')),
  code          VARCHAR(50)  UNIQUE,
  default_for_elements TEXT[] DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL CHECK (role IN ('admin', 'executive', 'manager', 'auditor', 'monitor')),
  entity_id     UUID REFERENCES entities(id),
  permissions   TEXT[]   DEFAULT '{}',
  status        VARCHAR(20)  DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  avatar        VARCHAR(10),
  join_date     DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ─── INGESTION LAYER ─────────────────────────────────────────────────────────
-- Uploaded media never directly creates reports.
-- Every file passes through: Upload → Candidate → Human Review → Draft Report

-- 1. media_ingestions: raw uploaded files before any processing
CREATE TABLE IF NOT EXISTS media_ingestions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id          UUID NOT NULL REFERENCES entities(id),
  uploaded_by        UUID NOT NULL REFERENCES users(id),

  file_name          VARCHAR(500)  NOT NULL,
  file_path          VARCHAR(1000) NOT NULL,
  file_type          VARCHAR(20)   NOT NULL CHECK (file_type IN ('image', 'video', 'audio')),
  mime_type          VARCHAR(100),
  file_size_bytes    BIGINT,

  -- GPS extracted from EXIF (or null if unavailable)
  gps_lat            DECIMAL(10, 8),
  gps_lng            DECIMAL(11, 8),
  gps_altitude       DECIMAL(10, 3),
  gps_accuracy       DECIMAL(10, 3),
  location           GEOMETRY(Point, 4326),

  capture_timestamp  TIMESTAMPTZ,
  exif_data          JSONB,

  processing_status  VARCHAR(30) DEFAULT 'pending'
                     CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed')),
  processing_error   TEXT,
  processed_at       TIMESTAMPTZ,
  thumbnail_path     VARCHAR(1000),

  -- Video-specific
  duration_seconds   DECIMAL(10, 2),
  frame_count        INTEGER,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_ingestions_entity    ON media_ingestions(entity_id);
CREATE INDEX idx_media_ingestions_uploader  ON media_ingestions(uploaded_by);
CREATE INDEX idx_media_ingestions_status    ON media_ingestions(processing_status);
CREATE INDEX idx_media_ingestions_location  ON media_ingestions USING GIST(location);
CREATE INDEX idx_media_ingestions_capture   ON media_ingestions(capture_timestamp);

-- 2. detection_candidates: one candidate per uploaded file (or per YOLO detection)
-- Human review is mandatory before any report is created.
CREATE TABLE IF NOT EXISTS detection_candidates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  media_ingestion_id    UUID NOT NULL REFERENCES media_ingestions(id),
  entity_id             UUID NOT NULL REFERENCES entities(id),

  -- Who/what produced this candidate
  detection_source      VARCHAR(30) NOT NULL DEFAULT 'manual'
                        CHECK (detection_source IN ('manual', 'yolo', 'frame_extraction', 'drone', 'bulk_import')),
  detection_model       VARCHAR(100),        -- e.g. 'yolov8n'; null for manual
  detection_confidence  DECIMAL(5, 4),       -- 0.0000–1.0000; null for manual

  -- Suggested element (AI suggestion or user pre-annotation; not authoritative)
  suggested_element_type  VARCHAR(100),
  suggested_element_label VARCHAR(255),
  bounding_box            JSONB,             -- {x, y, width, height} in image pixel coords

  gps_lat     DECIMAL(10, 8),
  gps_lng     DECIMAL(11, 8),
  location    GEOMETRY(Point, 4326),

  -- Review state — human must act on every candidate
  review_status   VARCHAR(30) DEFAULT 'pending_review'
                  CHECK (review_status IN ('pending_review', 'confirmed', 'rejected', 'grouped', 'merged')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,

  -- Grouping — system may SUGGEST; human must CONFIRM
  group_id            UUID,
  is_group_leader     BOOLEAN DEFAULT false,
  group_suggested_at  TIMESTAMPTZ,
  group_confirmed_at  TIMESTAMPTZ,
  group_confirmed_by  UUID REFERENCES users(id),

  -- Set after human confirmation
  report_id   UUID,   -- FK to reports added below

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_detection_candidates_ingestion ON detection_candidates(media_ingestion_id);
CREATE INDEX idx_detection_candidates_entity    ON detection_candidates(entity_id);
CREATE INDEX idx_detection_candidates_status    ON detection_candidates(review_status);
CREATE INDEX idx_detection_candidates_group     ON detection_candidates(group_id);
CREATE INDEX idx_detection_candidates_report    ON detection_candidates(report_id);
CREATE INDEX idx_detection_candidates_location  ON detection_candidates USING GIST(location);

-- 3. import_jobs: GIS / bulk file import tracking
CREATE TABLE IF NOT EXISTS import_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  created_by    UUID NOT NULL REFERENCES users(id),

  job_type      VARCHAR(30) NOT NULL
                CHECK (job_type IN ('shapefile', 'geojson', 'kml', 'geopackage', 'csv', 'bulk_media')),
  file_name     VARCHAR(500)  NOT NULL,
  file_path     VARCHAR(1000) NOT NULL,
  file_size_bytes BIGINT,

  source_crs    VARCHAR(50),                -- e.g. 'EPSG:4326', detected or provided
  target_crs    VARCHAR(50) DEFAULT 'EPSG:4326',
  field_mapping JSONB,                      -- user-defined source-field → UrbanAI-field mapping

  status        VARCHAR(30) DEFAULT 'pending'
                CHECK (status IN ('pending', 'validating', 'preview_ready', 'importing', 'completed', 'failed', 'cancelled')),

  total_features    INTEGER,
  valid_features    INTEGER,
  invalid_features  INTEGER,
  imported_features INTEGER DEFAULT 0,
  validation_errors JSONB,
  processing_error  TEXT,
  preview_data      JSONB,

  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_jobs_entity     ON import_jobs(entity_id);
CREATE INDEX idx_import_jobs_created_by ON import_jobs(created_by);
CREATE INDEX idx_import_jobs_status     ON import_jobs(status);

-- Add layer_type for spatial governance
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS layer_type VARCHAR(50) DEFAULT 'reports'
  CHECK (layer_type IN (
    'reports', 'municipalities', 'districts', 'neighborhoods', 'priority_zones',
    'maintenance_contracts', 'cleaning_contracts', 'service_areas', 'assets',
    'operational_layers', 'external_jurisdiction_zones'
  ));
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS spatial_layer_id UUID REFERENCES spatial_layers(id);

-- 4. import_features: individual GIS features — operational spatial datasets, not file storage
CREATE TABLE IF NOT EXISTS import_features (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_job_id  UUID NOT NULL REFERENCES import_jobs(id),
  entity_id      UUID NOT NULL REFERENCES entities(id),

  source_feature_id  VARCHAR(255),
  feature_index      INTEGER,

  -- PostGIS-native geometry (WGS84 after reprojection)
  geometry        GEOMETRY(Geometry, 4326),
  geometry_type   VARCHAR(50),

  source_attributes   JSONB,         -- raw properties from source file
  mapped_element_type VARCHAR(100),  -- after field_mapping applied
  mapped_description  TEXT,
  mapped_location_name VARCHAR(255),
  mapped_district     VARCHAR(100),

  is_valid_geometry   BOOLEAN,
  geometry_error      TEXT,

  import_status  VARCHAR(30) DEFAULT 'pending'
                 CHECK (import_status IN ('pending', 'validated', 'imported', 'rejected', 'duplicate')),
  duplicate_of   UUID REFERENCES import_features(id),

  report_id   UUID,   -- FK to reports added below

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_features_job      ON import_features(import_job_id);
CREATE INDEX idx_import_features_entity   ON import_features(entity_id);
CREATE INDEX idx_import_features_status   ON import_features(import_status);
CREATE INDEX idx_import_features_geometry ON import_features USING GIST(geometry);

-- ─── REPORTS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id    UUID NOT NULL REFERENCES entities(id),

  -- Ingestion provenance (null = pure manual entry)
  detection_candidate_id  UUID REFERENCES detection_candidates(id),
  import_feature_id       UUID REFERENCES import_features(id),
  ingestion_source  VARCHAR(30) DEFAULT 'manual'
                    CHECK (ingestion_source IN ('manual', 'media_upload', 'yolo', 'gis_import', 'drone', 'bulk')),

  element_id     VARCHAR(100),
  element_label  VARCHAR(255),

  status         VARCHAR(50) NOT NULL DEFAULT 'draft',
  closure_type   VARCHAR(50),
  closure_notes  TEXT,
  closed_at      TIMESTAMPTZ,
  reopen_count   INTEGER DEFAULT 0,

  description    TEXT,

  -- PostGIS-ready location
  gps_lat        DECIMAL(10, 8),
  gps_lng        DECIMAL(11, 8),
  location       GEOMETRY(Point, 4326),
  location_name  VARCHAR(255),
  district       VARCHAR(100),

  created_by   UUID NOT NULL REFERENCES users(id),
  assigned_to  UUID REFERENCES users(id),

  estimated_fine   DECIMAL(12, 2),
  fine_article_id  VARCHAR(100),
  violator_id      VARCHAR(100),
  violator_name    VARCHAR(255),
  contractor_id    UUID,

  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Back-fill FKs now that reports table exists
ALTER TABLE detection_candidates
  ADD CONSTRAINT fk_dc_report FOREIGN KEY (report_id) REFERENCES reports(id);
ALTER TABLE import_features
  ADD CONSTRAINT fk_if_report FOREIGN KEY (report_id) REFERENCES reports(id);

CREATE INDEX idx_reports_entity          ON reports(entity_id);
CREATE INDEX idx_reports_status          ON reports(status);
CREATE INDEX idx_reports_created_by      ON reports(created_by);
CREATE INDEX idx_reports_assigned_to     ON reports(assigned_to);
CREATE INDEX idx_reports_ingestion_source ON reports(ingestion_source);
CREATE INDEX idx_reports_location        ON reports USING GIST(location);
CREATE INDEX idx_reports_created_at      ON reports(created_at DESC);

CREATE TABLE IF NOT EXISTS report_media (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id          UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  media_ingestion_id UUID REFERENCES media_ingestions(id),
  file_path          VARCHAR(1000) NOT NULL,
  file_type          VARCHAR(20)   NOT NULL,
  mime_type          VARCHAR(100),
  phase              VARCHAR(20) CHECK (phase IN ('before', 'after', 'evidence', 'letter')),
  caption            TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_report_media_report ON report_media(report_id);

-- ─── AUDIT LOG (immutable) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id     UUID REFERENCES entities(id),
  subject_type  VARCHAR(50) NOT NULL,
  subject_id    UUID        NOT NULL,
  action        VARCHAR(100) NOT NULL,
  from_status   VARCHAR(50),
  to_status     VARCHAR(50),
  performed_by  UUID REFERENCES users(id),
  metadata      JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_subject ON audit_logs(subject_type, subject_id);
CREATE INDEX idx_audit_logs_entity  ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_actor   ON audit_logs(performed_by);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Enforce immutability at the DB layer
CREATE RULE audit_log_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ─── SPATIAL GOVERNANCE LAYER ────────────────────────────────────────────────
-- Operational GIS layers for municipality governance and spatial enrichment

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

-- Indexes for spatial operations
CREATE INDEX idx_spatial_layers_entity     ON spatial_layers(entity_id);
CREATE INDEX idx_spatial_layers_type       ON spatial_layers(layer_type);
CREATE INDEX idx_spatial_layers_active     ON spatial_layers(is_active);
CREATE INDEX idx_spatial_layer_features_layer ON spatial_layer_features(spatial_layer_id);
CREATE INDEX idx_spatial_layer_features_entity ON spatial_layer_features(entity_id);
CREATE INDEX idx_spatial_layer_features_geom ON spatial_layer_features USING GIST(geometry);
CREATE INDEX idx_spatial_layer_features_muni ON spatial_layer_features(municipality_id);
CREATE INDEX idx_spatial_layer_features_dist ON spatial_layer_features(district_id);

-- ─── SPATIAL GOVERNANCE ENRICHMENT ───────────────────────────────────────────

-- Add spatial enrichment fields to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS municipality_id UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS district_id UUID;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contractor_entity UUID REFERENCES entities(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority_level INTEGER;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS responsible_party UUID REFERENCES users(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalation_chain JSONB DEFAULT '[]';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_by UUID REFERENCES users(id);
