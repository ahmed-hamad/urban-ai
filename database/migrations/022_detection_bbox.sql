-- Migration 022: Add bounding box support to detection_candidates
-- Stores AI-detected element position as [x_pct, y_pct, width_pct, height_pct] (0-100 range)

ALTER TABLE detection_candidates
  ADD COLUMN IF NOT EXISTS detection_bbox JSONB;

COMMENT ON COLUMN detection_candidates.detection_bbox IS
  'Bounding box from AI vision: [x%, y%, width%, height%] — percentage of image dimensions (0-100). NULL if not detected or unavailable.';
