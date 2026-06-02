-- Add report_status column to eoi_observations (separate from closure_status)
-- حالة البلاغ — contains workflow states like "قيد التنفيذ", "مغلق آلياً"
-- closure_status stays as is (حالة الإغلاق)

ALTER TABLE eoi_observations
  ADD COLUMN IF NOT EXISTS report_status TEXT;

CREATE INDEX IF NOT EXISTS idx_eoi_observations_report_status
  ON eoi_observations(report_status);
