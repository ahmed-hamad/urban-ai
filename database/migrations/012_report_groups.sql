-- 012_report_groups.sql
-- Links reports that describe the same physical violation observed from
-- multiple monitoring sources. One report is the "leader"; others are members.

CREATE TABLE IF NOT EXISTS report_groups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leader_id     UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  member_id     UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_report_group_pair UNIQUE (leader_id, member_id),
  CONSTRAINT chk_no_self_group    CHECK (leader_id != member_id)
);

CREATE INDEX IF NOT EXISTS idx_report_groups_leader ON report_groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_report_groups_member ON report_groups(member_id);
