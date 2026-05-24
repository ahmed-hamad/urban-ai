-- 005_import_features_raster.sql
-- Adds raster_images JSONB to import_features so URLs detected during GIS
-- validation are preserved and attached to reports upon confirmation.

ALTER TABLE import_features
  ADD COLUMN IF NOT EXISTS raster_images JSONB DEFAULT '[]';
