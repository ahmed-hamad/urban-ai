-- 008_observation_analysis.sql
-- External observation analysis layers (e.g. عدسة بلدي, field surveys).
-- These are NOT reports — they are analysis-only reference layers.
-- Observations are matched against reports for duplicate/correlation detection.

CREATE TABLE IF NOT EXISTS observation_layers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  source_name     VARCHAR(255),                          -- e.g. 'عدسة بلدي', 'مسح ميداني 2025'
  layer_type      VARCHAR(50)  NOT NULL DEFAULT 'observations',
  file_path       VARCHAR(512),
  format          VARCHAR(20),                           -- 'geojson', 'shapefile', 'csv', 'excel'
  total_count     INTEGER      NOT NULL DEFAULT 0,
  matched_count   INTEGER      NOT NULL DEFAULT 0,       -- observations with ≥1 duplicate candidate
  status          VARCHAR(30)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  distance_threshold_m  INTEGER NOT NULL DEFAULT 20,     -- spatial match threshold in metres
  time_threshold_days   INTEGER NOT NULL DEFAULT 30,     -- temporal match threshold in days
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id        UUID NOT NULL REFERENCES observation_layers(id) ON DELETE CASCADE,
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,

  -- Geometry (WGS84)
  geometry        GEOMETRY(Geometry, 4326) NOT NULL,
  centroid_lat    DOUBLE PRECISION,
  centroid_lng    DOUBLE PRECISION,

  -- Source attributes (raw from file)
  source_id       VARCHAR(255),
  element_type    VARCHAR(255),
  description     TEXT,
  location_name   VARCHAR(512),
  district        VARCHAR(255),
  observed_at     TIMESTAMPTZ,
  severity        VARCHAR(50),
  source_attributes JSONB DEFAULT '{}',

  -- Duplicate analysis results
  best_confidence DOUBLE PRECISION DEFAULT 0,           -- highest confidence score against any report
  matched_report_id UUID REFERENCES reports(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observations_layer_id    ON observations(layer_id);
CREATE INDEX IF NOT EXISTS idx_observations_entity_id   ON observations(entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_geom        ON observations USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_observations_centroid    ON observations(centroid_lat, centroid_lng)
  WHERE centroid_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_observations_element     ON observations(element_type)
  WHERE element_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_observations_observed_at ON observations(observed_at)
  WHERE observed_at IS NOT NULL;
