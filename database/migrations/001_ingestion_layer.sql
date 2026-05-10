-- Migration 001: Ingestion Layer
-- Apply to an existing UrbanAI database that already has the core tables
-- (entities, users, reports, audit_logs).
-- Run once: psql -d urban_ai -f 001_ingestion_layer.sql

CREATE EXTENSION IF NOT EXISTS postgis;

-- media_ingestions
CREATE TABLE IF NOT EXISTS media_ingestions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id          UUID NOT NULL REFERENCES entities(id),
  uploaded_by        UUID NOT NULL REFERENCES users(id),
  file_name          VARCHAR(500)  NOT NULL,
  file_path          VARCHAR(1000) NOT NULL,
  file_type          VARCHAR(20)   NOT NULL CHECK (file_type IN ('image', 'video', 'audio')),
  mime_type          VARCHAR(100),
  file_size_bytes    BIGINT,
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
  duration_seconds   DECIMAL(10, 2),
  frame_count        INTEGER,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mi_entity   ON media_ingestions(entity_id);
CREATE INDEX idx_mi_status   ON media_ingestions(processing_status);
CREATE INDEX idx_mi_location ON media_ingestions USING GIST(location);
CREATE INDEX idx_mi_capture  ON media_ingestions(capture_timestamp);

-- detection_candidates
CREATE TABLE IF NOT EXISTS detection_candidates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  media_ingestion_id    UUID NOT NULL REFERENCES media_ingestions(id),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  detection_source      VARCHAR(30) NOT NULL DEFAULT 'manual'
                        CHECK (detection_source IN ('manual', 'yolo', 'frame_extraction', 'drone', 'bulk_import')),
  detection_model       VARCHAR(100),
  detection_confidence  DECIMAL(5, 4),
  suggested_element_type  VARCHAR(100),
  suggested_element_label VARCHAR(255),
  bounding_box            JSONB,
  gps_lat     DECIMAL(10, 8),
  gps_lng     DECIMAL(11, 8),
  location    GEOMETRY(Point, 4326),
  review_status   VARCHAR(30) DEFAULT 'pending_review'
                  CHECK (review_status IN ('pending_review', 'confirmed', 'rejected', 'grouped', 'merged')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  group_id            UUID,
  is_group_leader     BOOLEAN DEFAULT false,
  group_suggested_at  TIMESTAMPTZ,
  group_confirmed_at  TIMESTAMPTZ,
  group_confirmed_by  UUID REFERENCES users(id),
  report_id   UUID REFERENCES reports(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dc_entity   ON detection_candidates(entity_id);
CREATE INDEX idx_dc_status   ON detection_candidates(review_status);
CREATE INDEX idx_dc_group    ON detection_candidates(group_id);
CREATE INDEX idx_dc_location ON detection_candidates USING GIST(location);

-- import_jobs
CREATE TABLE IF NOT EXISTS import_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  created_by      UUID NOT NULL REFERENCES users(id),
  job_type        VARCHAR(30) NOT NULL
                  CHECK (job_type IN ('shapefile', 'geojson', 'kml', 'geopackage', 'csv', 'bulk_media')),
  file_name       VARCHAR(500)  NOT NULL,
  file_path       VARCHAR(1000) NOT NULL,
  file_size_bytes BIGINT,
  source_crs      VARCHAR(50),
  target_crs      VARCHAR(50) DEFAULT 'EPSG:4326',
  field_mapping   JSONB,
  status          VARCHAR(30) DEFAULT 'pending'
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
CREATE INDEX idx_ij_entity ON import_jobs(entity_id);
CREATE INDEX idx_ij_status ON import_jobs(status);

-- import_features
CREATE TABLE IF NOT EXISTS import_features (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_job_id  UUID NOT NULL REFERENCES import_jobs(id),
  entity_id      UUID NOT NULL REFERENCES entities(id),
  source_feature_id  VARCHAR(255),
  feature_index      INTEGER,
  geometry           GEOMETRY(Geometry, 4326),
  geometry_type      VARCHAR(50),
  source_attributes      JSONB,
  mapped_element_type    VARCHAR(100),
  mapped_description     TEXT,
  mapped_location_name   VARCHAR(255),
  mapped_district        VARCHAR(100),
  is_valid_geometry  BOOLEAN,
  geometry_error     TEXT,
  import_status  VARCHAR(30) DEFAULT 'pending'
                 CHECK (import_status IN ('pending', 'validated', 'imported', 'rejected', 'duplicate')),
  duplicate_of   UUID REFERENCES import_features(id),
  report_id      UUID REFERENCES reports(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_if_job      ON import_features(import_job_id);
CREATE INDEX idx_if_entity   ON import_features(entity_id);
CREATE INDEX idx_if_status   ON import_features(import_status);
CREATE INDEX idx_if_geometry ON import_features USING GIST(geometry);

-- Extend reports table with ingestion provenance columns
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS detection_candidate_id UUID REFERENCES detection_candidates(id),
  ADD COLUMN IF NOT EXISTS import_feature_id      UUID REFERENCES import_features(id),
  ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(30) DEFAULT 'manual'
    CHECK (ingestion_source IN ('manual', 'media_upload', 'yolo', 'gis_import', 'drone', 'bulk')),
  ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_reports_ingestion_source ON reports(ingestion_source);
CREATE INDEX IF NOT EXISTS idx_reports_location         ON reports USING GIST(location);
