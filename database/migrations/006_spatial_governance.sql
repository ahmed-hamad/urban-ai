-- 006_spatial_governance.sql
-- Completes spatial governance model:
--   • reports.priority_zone_id — FK reference to the intersecting priority-zone feature
--   • spatial_layer_features.feature_label — human-readable override (e.g. "الباحة")
--   • report_media.uploaded_by — tracks who attached GIS raster images
--   • Performance indexes for governance lookups

-- ── reports ──────────────────────────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS priority_zone_id UUID;

CREATE INDEX IF NOT EXISTS idx_reports_priority_zone_id
  ON reports(priority_zone_id)
  WHERE priority_zone_id IS NOT NULL;

-- ── spatial_layer_features ───────────────────────────────────────────────────
-- feature_label overrides feature_name for display (e.g. official Arabic name)
ALTER TABLE spatial_layer_features
  ADD COLUMN IF NOT EXISTS feature_label VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_slf_feature_label
  ON spatial_layer_features(feature_label)
  WHERE feature_label IS NOT NULL;

-- Composite index for governance intersection queries
CREATE INDEX IF NOT EXISTS idx_sl_type_active
  ON spatial_layers(layer_type)
  WHERE is_active = true;

-- ── report_media ─────────────────────────────────────────────────────────────
ALTER TABLE report_media
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_report_media_uploader
  ON report_media(uploaded_by)
  WHERE uploaded_by IS NOT NULL;
