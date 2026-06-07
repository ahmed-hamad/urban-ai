-- Migration 023: Element Mapping Engine + Training Dataset Pipeline
--
-- Three new components:
--   1. element_detection_mapping  — bridges AI labels → UrbanAI elements → regulatory elements
--   2. detection_candidates alter — adds mapping columns + ai_provider
--   3. ai_training_samples        — stores confirmed detections for future YOLO training
--
-- Governance rules (enforced via this schema):
--   - AI labels must never be linked directly to regulations
--   - Every detection passes through the mapping layer before report creation
--   - Training samples are written at confirm-time only (human decision is ground truth)

-- ─── 1. Element Detection Mapping ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS element_detection_mapping (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- AI side
  ai_label              VARCHAR(100) NOT NULL,
  ai_provider           VARCHAR(50)  NOT NULL DEFAULT 'claude_vision',

  -- UrbanAI canonical element
  urban_element_id      VARCHAR(100) NOT NULL,
  urban_element_label   VARCHAR(255) NOT NULL,

  -- Regulatory element (links to regulation articles and fine data)
  regulatory_element_id VARCHAR(100),

  -- Quality controls
  confidence_threshold  DECIMAL(3,2)  DEFAULT 0.40
                        CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  active                BOOLEAN       DEFAULT true,
  notes                 TEXT,

  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW(),

  UNIQUE (ai_label, ai_provider)
);

CREATE INDEX IF NOT EXISTS idx_mapping_provider_label ON element_detection_mapping(ai_provider, ai_label);
CREATE INDEX IF NOT EXISTS idx_mapping_urban_element  ON element_detection_mapping(urban_element_id);

COMMENT ON TABLE element_detection_mapping IS
  'Maps AI detection labels (per provider) to canonical UrbanAI elements and regulatory categories. '
  'This layer ensures AI labels are never directly linked to regulations or penalties.';

-- ─── 2. Alter detection_candidates ───────────────────────────────────────────

ALTER TABLE detection_candidates
  ADD COLUMN IF NOT EXISTS ai_provider                VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mapping_id                 UUID REFERENCES element_detection_mapping(id),
  ADD COLUMN IF NOT EXISTS mapped_urban_element_id    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mapped_urban_element_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mapped_regulatory_element_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_dc_mapping         ON detection_candidates(mapping_id);
CREATE INDEX IF NOT EXISTS idx_dc_mapped_element  ON detection_candidates(mapped_urban_element_id);

COMMENT ON COLUMN detection_candidates.ai_provider IS
  'AI service that produced this candidate: claude_vision, yolo, manual, etc.';
COMMENT ON COLUMN detection_candidates.mapping_id IS
  'FK to element_detection_mapping row used at detection time.';
COMMENT ON COLUMN detection_candidates.mapped_urban_element_id IS
  'Resolved UrbanAI element ID after mapping. This is what the draft report element_id will use.';
COMMENT ON COLUMN detection_candidates.mapped_urban_element_label IS
  'Human-readable Arabic label for mapped_urban_element_id.';
COMMENT ON COLUMN detection_candidates.mapped_regulatory_element_id IS
  'Regulatory element for fine/workflow lookup after mapping.';

-- ─── 3. AI Training Samples ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_training_samples (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source
  detection_candidate_id      UUID REFERENCES detection_candidates(id),
  image_path                  VARCHAR(1000) NOT NULL,
  image_hash                  VARCHAR(64),

  -- Ground truth (set by human reviewer at confirm time)
  mapped_urban_element_id     VARCHAR(100),
  mapped_urban_element_label  VARCHAR(255),
  bounding_box                JSONB,   -- [x%, y%, w%, h%] — same format as detection_bbox

  -- Reviewer decision
  reviewer_decision           VARCHAR(20) NOT NULL
                              CHECK (reviewer_decision IN ('confirmed', 'rejected', 'modified')),
  reviewed_by                 UUID REFERENCES users(id),
  reviewed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- AI prediction metadata (preserved for comparison against ground truth)
  ai_provider                 VARCHAR(50),
  ai_model                    VARCHAR(100),
  ai_confidence               DECIMAL(5,4),
  ai_predicted_label          VARCHAR(100),

  -- Spatial context (filled post-enrichment where available)
  gps_lat                     DECIMAL(10,8),
  gps_lng                     DECIMAL(11,8),
  municipality                VARCHAR(255),
  district                    VARCHAR(255),
  priority_zone               VARCHAR(255),

  -- Export tracking for dataset generation
  exported_at                 TIMESTAMPTZ,
  export_batch                VARCHAR(50),

  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_samples_candidate ON ai_training_samples(detection_candidate_id);
CREATE INDEX IF NOT EXISTS idx_training_samples_element   ON ai_training_samples(mapped_urban_element_id);
CREATE INDEX IF NOT EXISTS idx_training_samples_decision  ON ai_training_samples(reviewer_decision);
CREATE INDEX IF NOT EXISTS idx_training_samples_provider  ON ai_training_samples(ai_provider);
CREATE INDEX IF NOT EXISTS idx_training_samples_exported  ON ai_training_samples(exported_at) WHERE exported_at IS NULL;

COMMENT ON TABLE ai_training_samples IS
  'Ground-truth dataset for future YOLO model training. '
  'Populated at human confirm/reject time only — never by AI. '
  'Do not implement training pipeline yet; only the dataset pipeline.';

-- ─── 4. Seed mappings for Claude Vision provider ──────────────────────────────
-- Maps all 26 current violation types (1:1 since Claude was prompted with exact IDs).
-- For YOLO, different ai_label values will map to the same urban_element_id.

INSERT INTO element_detection_mapping (ai_label, ai_provider, urban_element_id, urban_element_label, regulatory_element_id) VALUES
  ('construction_waste',          'claude_vision', 'construction_waste',          'مخلفات البناء',                           'construction_waste'),
  ('construction_site_fencing',   'claude_vision', 'construction_site_fencing',   'تسوير مواقع الأعمال الإنشائية',           'construction_site_fencing'),
  ('temp_barriers',               'claude_vision', 'temp_barriers',               'الحواجز المؤقتة في مواقع العمل',          'temp_barriers'),
  ('building_under_construction', 'claude_vision', 'building_under_construction', 'تغطية المباني تحت الإنشاء',              'building_under_construction'),
  ('lighting_poles',              'claude_vision', 'lighting_poles',              'أعمدة الإنارة',                           'lighting_poles'),
  ('abandoned_vehicles',          'claude_vision', 'abandoned_vehicles',          'المركبات المهملة والتالفة',               'abandoned_vehicles'),
  ('commercial_signs',            'claude_vision', 'commercial_signs',            'اللوحات التجارية',                        'commercial_signs'),
  ('restaurant_vents',            'claude_vision', 'restaurant_vents',            'مداخن التهوية في المطاعم',               'restaurant_vents'),
  ('street_furniture',            'claude_vision', 'street_furniture',            'أثاث الشوارع',                            'street_furniture'),
  ('wall_graffiti',               'claude_vision', 'wall_graffiti',               'الكتابات المشوهة للجدران',                'wall_graffiti'),
  ('waste_containers',            'claude_vision', 'waste_containers',            'الحاويات وتكدس النفايات',                 'waste_containers'),
  ('street_excavation',           'claude_vision', 'street_excavation',           'حفر الشوارع والطرق',                     'street_excavation'),
  ('directional_signs',           'claude_vision', 'directional_signs',           'اللوحات الإرشادية',                      'directional_signs'),
  ('sidewalks',                   'claude_vision', 'sidewalks',                   'الأرصفة المتهالكة',                       'sidewalks'),
  ('general_cleanliness',         'claude_vision', 'general_cleanliness',         'النظافة العامة',                          'general_cleanliness'),
  ('illegal_storage',             'claude_vision', 'illegal_storage',             'التشوين',                                 'illegal_storage'),
  ('material_transport',          'claude_vision', 'material_transport',          'نقل مواد البناء',                         'material_transport'),
  ('roof_hangars',                'claude_vision', 'roof_hangars',                'الهناجر المخالفة فوق السطوح',            'roof_hangars'),
  ('building_cladding',           'claude_vision', 'building_cladding',           'تكسيات المباني المتهالكة',               'building_cladding'),
  ('ac_pipes',                    'claude_vision', 'ac_pipes',                    'مجاري وتمديدات التكييف',                 'ac_pipes'),
  ('satellite_dishes',            'claude_vision', 'satellite_dishes',            'أطباق الأقمار الاصطناعية',               'satellite_dishes'),
  ('canopies',                    'claude_vision', 'canopies',                    'المظلات والخيام',                         'canopies'),
  ('balcony_coverage',            'claude_vision', 'balcony_coverage',            'تغطية الشرفات',                           'balcony_coverage'),
  ('advertising_boards',          'claude_vision', 'advertising_boards',          'اللوحات الإعلانية',                      'advertising_boards'),
  ('street_vendors',              'claude_vision', 'street_vendors',              'البائعين الجائلين',                       'street_vendors'),
  ('warning_signs',               'claude_vision', 'warning_signs',               'اللوحات التحذيرية',                       'warning_signs')
ON CONFLICT (ai_label, ai_provider) DO NOTHING;
