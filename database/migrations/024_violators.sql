-- Migration 024: Persistent violator registry
-- Enables lookup by identifier to pre-fill future reports and track repeat violators.

CREATE TABLE IF NOT EXISTS violators (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         VARCHAR(20) NOT NULL CHECK (type IN ('establishment', 'contractor', 'beneficiary')),
  lookup_key   TEXT        NOT NULL,          -- commercial_reg / contractor_id / beneficiary_id
  name         TEXT,
  data         JSONB       NOT NULL DEFAULT '{}',
  report_count INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_violators_type_key ON violators (type, lookup_key);
CREATE INDEX IF NOT EXISTS idx_violators_type ON violators (type);

-- correction_deadline: set after assignment when the violation has a notice period
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS correction_days     INTEGER,
  ADD COLUMN IF NOT EXISTS correction_deadline DATE,
  ADD COLUMN IF NOT EXISTS has_notice_period   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN reports.has_notice_period   IS 'True when at least one violation article has notice: "ينطبق"';
COMMENT ON COLUMN reports.correction_days     IS 'Days in the correction window (from the violation regulation)';
COMMENT ON COLUMN reports.correction_deadline IS 'Date by which the violator must fix the issue (set after assignment)';
