import dotenv from 'dotenv'
dotenv.config()
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function runAlters() {
  try {
    // Create spatial_layers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spatial_layers (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        entity_id         UUID NOT NULL REFERENCES entities(id),
        layer_name        VARCHAR(255) NOT NULL,
        layer_type        VARCHAR(50) NOT NULL CHECK (layer_type IN (
          'reports', 'municipalities', 'districts', 'neighborhoods', 'priority_zones',
          'maintenance_contracts', 'cleaning_contracts', 'service_areas', 'assets',
          'operational_layers', 'external_jurisdiction_zones'
        )),
        governance_role   VARCHAR(50) CHECK (governance_role IN (
          'ownership', 'contract', 'jurisdiction', 'priority', 'operational'
        )),
        ownership_type    VARCHAR(50) CHECK (ownership_type IN (
          'internal', 'external', 'contracted', 'shared'
        )),
        responsible_entity UUID REFERENCES entities(id),
        contract_reference VARCHAR(255),
        auto_assignment_rules JSONB DEFAULT '{}',
        visibility_scope  VARCHAR(50) DEFAULT 'entity' CHECK (visibility_scope IN (
          'public', 'entity', 'department', 'restricted'
        )),
        layer_priority    INTEGER DEFAULT 0,
        description       TEXT,
        source_file       VARCHAR(1000),
        is_active         BOOLEAN DEFAULT true,
        created_by        UUID REFERENCES users(id),
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create spatial_layer_features table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spatial_layer_features (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        spatial_layer_id  UUID NOT NULL REFERENCES spatial_layers(id) ON DELETE CASCADE,
        entity_id         UUID NOT NULL REFERENCES entities(id),
        feature_name      VARCHAR(255),
        feature_type      VARCHAR(50),
        geometry          GEOMETRY(GEOMETRY, 4326) NOT NULL,
        attributes        JSONB DEFAULT '{}',
        municipality_id   UUID,
        district_id       UUID,
        neighborhood      VARCHAR(255),
        contract_id       VARCHAR(255),
        contractor_entity UUID REFERENCES entities(id),
        priority_level    INTEGER,
        sla_hours         INTEGER,
        external_entity   UUID REFERENCES entities(id),
        operational_notes TEXT,
        is_active         BOOLEAN DEFAULT true,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spatial_layers_entity     ON spatial_layers(entity_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spatial_layers_type       ON spatial_layers(layer_type)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spatial_layers_active     ON spatial_layers(is_active)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spatial_layer_features_layer ON spatial_layer_features(spatial_layer_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spatial_layer_features_geometry ON spatial_layer_features USING GIST(geometry)`)

    // ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS layer_type VARCHAR(50) DEFAULT 'reports'
    await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS layer_type VARCHAR(50) DEFAULT 'reports'`)

    // ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS spatial_layer_id UUID REFERENCES spatial_layers(id);
    await pool.query(`ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS spatial_layer_id UUID REFERENCES spatial_layers(id)`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS municipality_id UUID;
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS municipality_id UUID`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS district_id UUID;
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS district_id UUID`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(255)`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255)`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS contractor_entity UUID REFERENCES entities(id);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS contractor_entity UUID REFERENCES entities(id)`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority_level INTEGER;
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority_level INTEGER`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS sla_hours INTEGER`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS responsible_party UUID REFERENCES users(id);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS responsible_party UUID REFERENCES users(id)`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalation_chain JSONB DEFAULT '[]';
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS escalation_chain JSONB DEFAULT '[]'`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_at TIMESTAMPTZ;
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_at TIMESTAMPTZ`)

    // ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_by UUID REFERENCES users(id);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS spatial_enriched_by UUID REFERENCES users(id)`)

    console.log('All schema updates applied successfully')
  } catch (error) {
    console.error('Error applying schema updates:', error)
  } finally {
    await pool.end()
  }
}

runAlters()