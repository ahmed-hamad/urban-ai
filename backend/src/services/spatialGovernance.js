// Spatial Governance Engine — UrbanAI
// Automatically enriches reports with governance data derived from PostGIS
// intersections against operational layers (municipalities, priority zones,
// districts, contracts, etc.).
//
// Enrichment is NON-BLOCKING: failures are logged but never abort report creation.
// All column updates use COALESCE so manually-entered or GIS-mapped values are
// preserved and never overwritten by spatial enrichment.

import { query } from './db.js'

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enrichReportSpatially(reportId, location, entityId) {
  if (!location) return

  try {
    const intersections = await findIntersectingFeatures(location, entityId)
    if (intersections.length === 0) return

    const enrichment = buildEnrichmentData(intersections)
    if (Object.keys(enrichment).length > 0) {
      await updateReportWithEnrichment(reportId, enrichment)
    }
    return enrichment
  } catch (err) {
    console.error('[spatialGovernance] enrichment error for report', reportId, ':', err.message)
    // Non-fatal — report creation already succeeded
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function findIntersectingFeatures(location, entityId) {
  // Query all active governance-layer features that spatially contain this point.
  // Includes both entity-scoped layers and globally visible (public) layers.
  const { rows } = await query(`
    SELECT
      slf.id,
      COALESCE(slf.feature_label, slf.feature_name) AS display_name,
      slf.priority_level,
      slf.sla_hours,
      slf.operational_notes,
      slf.attributes,
      sl.layer_type,
      sl.governance_role,
      sl.layer_priority
    FROM spatial_layer_features slf
    JOIN spatial_layers sl ON sl.id = slf.spatial_layer_id
    WHERE sl.is_active  = true
      AND slf.is_active = true
      AND (sl.entity_id = $1 OR sl.visibility_scope = 'public')
      AND ST_Intersects(slf.geometry, $2::geometry)
    ORDER BY sl.layer_priority DESC NULLS LAST, sl.layer_type ASC
  `, [entityId, location])
  return rows
}

function buildEnrichmentData(intersections) {
  const e = {}

  for (const f of intersections) {
    const name = f.display_name || null

    switch (f.layer_type) {

      case 'municipalities':
        if (!e.municipality) {
          e.municipality    = name
          e.municipality_id = f.id
        }
        break

      case 'districts':
        if (!e.district) {
          e.district    = name
          e.district_id = f.id
        }
        break

      case 'neighborhoods':
        if (!e.neighborhood) {
          e.neighborhood = name
        }
        break

      case 'priority_zones':
        if (!e.priority) {
          e.priority         = name           // zone name (not high/medium/low)
          e.priority_zone_id = f.id
          if (f.priority_level != null) e.priority_level = f.priority_level
          if (f.sla_hours     != null) e.sla_hours      = f.sla_hours
        }
        break

      case 'maintenance_contracts':
      case 'cleaning_contracts': {
        if (!e.contract_id) {
          const attrs = f.attributes ?? {}
          e.contract_id = attrs.contract_id || f.display_name || null
          if (e.sla_hours == null && f.sla_hours != null) e.sla_hours = f.sla_hours
        }
        break
      }

      case 'service_areas':
        // future: populate responsible_party
        break
    }
  }

  return e
}

async function updateReportWithEnrichment(reportId, enrichment) {
  const sets   = ['spatial_enriched_at = NOW()', 'updated_at = NOW()']
  const params = [reportId]   // $1 = reportId

  // COALESCE: never overwrite a value that was explicitly set
  function maybeSet(col, val, cast = '') {
    if (val == null) return
    params.push(val)
    sets.push(`${col} = COALESCE(${col}, $${params.length}${cast})`)
  }

  maybeSet('municipality',    enrichment.municipality)
  maybeSet('municipality_id', enrichment.municipality_id, '::uuid')
  maybeSet('district',        enrichment.district)
  maybeSet('district_id',     enrichment.district_id,     '::uuid')
  maybeSet('neighborhood',    enrichment.neighborhood)
  maybeSet('priority',        enrichment.priority)
  maybeSet('priority_zone_id',enrichment.priority_zone_id,'::uuid')
  maybeSet('priority_level',  enrichment.priority_level,  '::integer')
  maybeSet('sla_hours',       enrichment.sla_hours,       '::integer')
  maybeSet('contract_id',     enrichment.contract_id)

  await query(
    `UPDATE reports SET ${sets.join(', ')} WHERE id = $1`,
    params,
  )
}
