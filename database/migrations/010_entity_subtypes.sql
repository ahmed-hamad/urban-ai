-- 010_entity_subtypes.sql
-- Extend entities.type to support UI subtypes (amana, municipality, agency, department)
-- while keeping backward compatibility with existing internal/external values.

ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_type_check
  CHECK (type IN ('internal', 'external', 'amana', 'municipality', 'agency', 'department'));
