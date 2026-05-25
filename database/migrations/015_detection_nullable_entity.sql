-- Migration 015: Entity assignment moves from upload time to per-detection confirmation time
-- entity_id is now determined by the human reviewer per detection candidate, not at upload.

-- Allow null entity_id on media_ingestions (the file itself has no inherent jurisdiction)
ALTER TABLE media_ingestions ALTER COLUMN entity_id DROP NOT NULL;

-- Allow null entity_id on detection_candidates (entity assigned at human confirmation)
ALTER TABLE detection_candidates ALTER COLUMN entity_id DROP NOT NULL;

-- Expand detection_source to include 'ai_vision' (Claude Vision / LLM-based detection)
DO $$
DECLARE con_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
  WHERE tc.table_name = 'detection_candidates'
    AND tc.constraint_type = 'CHECK'
    AND cc.check_clause ILIKE '%detection_source%'
  LIMIT 1;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE detection_candidates DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE detection_candidates
  ADD CONSTRAINT detection_candidates_detection_source_check
  CHECK (detection_source IN ('manual', 'yolo', 'ai_vision', 'frame_extraction', 'drone', 'bulk_import'));

-- Index for unassigned candidates (visible to unrestricted scope users)
CREATE INDEX IF NOT EXISTS idx_detection_candidates_unassigned
  ON detection_candidates(created_at DESC)
  WHERE entity_id IS NULL;
