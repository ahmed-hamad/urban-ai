-- Migration 024: Restore adjusted VPI columns for eoi_live_vpi
-- Adjusted VPI excludes observations where visit_status ILIKE '%خاطئ%'
-- (i.e. "منتهية بلاغ خاطئ" — false/invalid reports).
-- The original estimated_vpi remains unchanged.

ALTER TABLE eoi_live_vpi
  ADD COLUMN IF NOT EXISTS adj_total_reports  INTEGER,
  ADD COLUMN IF NOT EXISTS adj_total_units    NUMERIC,
  ADD COLUMN IF NOT EXISTS adj_estimated_vpi  NUMERIC;

COMMENT ON COLUMN eoi_live_vpi.adj_total_reports IS 'Reports after excluding visit_status ILIKE ''%خاطئ%''';
COMMENT ON COLUMN eoi_live_vpi.adj_total_units   IS 'Estimated units after exclusion';
COMMENT ON COLUMN eoi_live_vpi.adj_estimated_vpi IS 'Adjusted estimated VPI after exclusion — FORECAST, never official';
