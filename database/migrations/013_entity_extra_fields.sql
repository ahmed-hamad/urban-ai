-- 013_entity_extra_fields.sql
-- Adds parent_id (self-referential hierarchy), description, phone, email to entities.

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS parent_id    UUID        REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS phone        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS email        VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_id);
