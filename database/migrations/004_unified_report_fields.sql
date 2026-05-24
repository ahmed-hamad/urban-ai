-- 004_unified_report_fields.sql
-- Adds report_number (sequential), priority, municipality to reports.
-- Ensures GIS-imported and manually-created reports share the same fields.

-- Sequential report number: RPT-YYYY-NNNNN
CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

CREATE OR REPLACE FUNCTION next_report_number() RETURNS TEXT AS $$
BEGIN
  RETURN 'RPT-' || EXTRACT(YEAR FROM NOW())::text
      || '-' || LPAD(nextval('report_number_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_number TEXT UNIQUE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority      TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS municipality  TEXT;

-- Back-fill existing rows so they are not null
UPDATE reports SET report_number = next_report_number()
WHERE  report_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_report_number ON reports(report_number);
