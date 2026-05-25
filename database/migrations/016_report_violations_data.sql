-- Migration 016: Store violations / violator detail on reports
-- Allows the 6-step ReportNew form to persist fine articles and violator data
-- that were not previously captured in the reports table.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS violations_data JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS violator_type   VARCHAR(50);

COMMENT ON COLUMN reports.violations_data IS
  'JSON snapshot: {articles, violatorType, violatorData, violationsApplicable, fineTotal}';
