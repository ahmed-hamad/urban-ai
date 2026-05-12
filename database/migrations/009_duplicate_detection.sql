-- 009_duplicate_detection.sql
-- Duplicate / correlation candidates between observations and reports,
-- and between reports themselves (cross-source internal duplicates).

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source side (observation OR report)
  source_type         VARCHAR(30) NOT NULL CHECK (source_type IN ('observation','report')),
  source_observation_id UUID REFERENCES observations(id)   ON DELETE CASCADE,
  source_report_id      UUID REFERENCES reports(id)        ON DELETE CASCADE,

  -- Matched report
  matched_report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,

  -- Confidence breakdown
  confidence          DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  distance_score      DOUBLE PRECISION NOT NULL DEFAULT 0,
  time_score          DOUBLE PRECISION NOT NULL DEFAULT 0,
  element_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_m          DOUBLE PRECISION,                    -- actual distance in metres
  time_diff_days      DOUBLE PRECISION,                    -- actual time difference in days

  -- Review workflow
  status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed_duplicate','rejected','merged')),
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  review_notes        TEXT,

  -- Scan metadata
  scan_id             UUID,                               -- groups candidates from same scan run
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent storing the same pair twice
  CONSTRAINT uq_duplicate_pair
    UNIQUE NULLS NOT DISTINCT (source_observation_id, source_report_id, matched_report_id)
);

-- Matching rules config (per entity, overrides global defaults)
CREATE TABLE IF NOT EXISTS duplicate_match_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID REFERENCES entities(id) ON DELETE CASCADE,
  distance_threshold_m  INTEGER      NOT NULL DEFAULT 20,
  time_threshold_days   INTEGER      NOT NULL DEFAULT 30,
  min_confidence        DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  weight_distance       DOUBLE PRECISION NOT NULL DEFAULT 0.50,
  weight_time           DOUBLE PRECISION NOT NULL DEFAULT 0.35,
  weight_element        DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  is_default            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Insert global default rule
INSERT INTO duplicate_match_rules
  (entity_id, distance_threshold_m, time_threshold_days, min_confidence,
   weight_distance, weight_time, weight_element, is_default)
VALUES
  (NULL, 20, 30, 0.5, 0.50, 0.35, 0.15, TRUE)
ON CONFLICT DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dup_status       ON duplicate_candidates(status);
CREATE INDEX IF NOT EXISTS idx_dup_source_obs   ON duplicate_candidates(source_observation_id)
  WHERE source_observation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dup_source_rep   ON duplicate_candidates(source_report_id)
  WHERE source_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dup_matched_rep  ON duplicate_candidates(matched_report_id);
CREATE INDEX IF NOT EXISTS idx_dup_confidence   ON duplicate_candidates(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_dup_scan_id      ON duplicate_candidates(scan_id)
  WHERE scan_id IS NOT NULL;
