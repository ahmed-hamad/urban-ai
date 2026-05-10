// backend/src/services/spatialGovernance.js
// Spatial Governance Engine for UrbanAI
// Handles automatic spatial enrichment of reports based on operational layers

import { query } from './db.js'

/**
 * Enrich a report with spatial governance data
 * Automatically determines municipality, district, contracts, etc. based on location
 */
export async function enrichReportSpatially(reportId, location, entityId) {
  if (!location) return // No location to enrich

  try {
    // Find intersecting spatial features
    const intersections = await findIntersectingFeatures(location, entityId)

    if (intersections.length === 0) return // No intersections found

    // Prioritize features by layer priority and type
    const prioritized = prioritizeIntersections(intersections)

    // Build enrichment data
    const enrichment = buildEnrichmentData(prioritized)

    // Update the report
    await updateReportWithEnrichment(reportId, enrichment)

    return enrichment
  } catch (error) {
    console.error('[spatialGovernance] enrichment error:', error)
    // Don't fail the report creation, just log
  }
}

/**
 * Find all spatial features that intersect with the given location
 */
async function findIntersectingFeatures(location, entityId) {
  const sql = `
    SELECT slf.*,
           sl.layer_type, sl.governance_role, sl.ownership_type,
           sl.responsible_entity, sl.contract_reference, sl.layer_priority,
           sl.auto_assignment_rules
    FROM spatial_layer_features slf
    JOIN spatial_layers sl ON sl.id = slf.spatial_layer_id
    WHERE sl.is_active = true
      AND slf.is_active = true
      AND sl.entity_id = $1
      AND ST_Intersects(slf.geometry, $2::geometry)
    ORDER BY sl.layer_priority DESC, slf.created_at DESC
  `

  const { rows } = await query(sql, [entityId, location])
  return rows
}

/**
 * Prioritize intersections based on layer type and governance rules
 */
function prioritizeIntersections(intersections) {
  // Group by layer type
  const byType = {}
  intersections.forEach(feature => {
    const type = feature.layer_type
    if (!byType[type]) byType[type] = []
    byType[type].push(feature)
  })

  // Priority order for governance
  const priorityOrder = [
    'municipalities',
    'districts',
    'neighborhoods',
    'maintenance_contracts',
    'cleaning_contracts',
    'priority_zones',
    'service_areas',
    'external_jurisdiction_zones',
    'assets',
    'operational_layers'
  ]

  const prioritized = []
  priorityOrder.forEach(type => {
    if (byType[type]) {
      // Take the highest priority feature of this type
      prioritized.push(...byType[type])
    }
  })

  return prioritized
}

/**
 * Build enrichment data from prioritized intersections
 */
function buildEnrichmentData(intersections) {
  const enrichment = {
    municipality_id: null,
    district_id: null,
    neighborhood: null,
    contract_id: null,
    contractor_entity: null,
    priority_level: null,
    sla_hours: null,
    responsible_party: null,
    escalation_chain: [],
    external_entity: null,
    operational_notes: []
  }

  intersections.forEach(feature => {
    switch (feature.layer_type) {
      case 'municipalities':
        if (!enrichment.municipality_id) {
          enrichment.municipality_id = feature.municipality_id || feature.id
        }
        break
      case 'districts':
        if (!enrichment.district_id) {
          enrichment.district_id = feature.district_id || feature.id
        }
        break
      case 'neighborhoods':
        if (!enrichment.neighborhood) {
          enrichment.neighborhood = feature.neighborhood || feature.feature_name
        }
        break
      case 'maintenance_contracts':
      case 'cleaning_contracts':
        if (!enrichment.contract_id) {
          enrichment.contract_id = feature.contract_id || feature.contract_reference
          enrichment.contractor_entity = feature.contractor_entity
          enrichment.sla_hours = feature.sla_hours
        }
        break
      case 'priority_zones':
        if (!enrichment.priority_level) {
          enrichment.priority_level = feature.priority_level
        }
        break
      case 'external_jurisdiction_zones':
        if (!enrichment.external_entity) {
          enrichment.external_entity = feature.external_entity
          enrichment.responsible_party = feature.responsible_entity
        }
        break
      case 'service_areas':
        if (!enrichment.responsible_party) {
          enrichment.responsible_party = feature.responsible_entity
        }
        break
    }

    // Collect operational notes
    if (feature.operational_notes) {
      enrichment.operational_notes.push(feature.operational_notes)
    }
  })

  // Build escalation chain based on governance
  if (enrichment.external_entity) {
    enrichment.escalation_chain = ['external_entity']
  } else if (enrichment.contractor_entity) {
    enrichment.escalation_chain = ['contractor', 'municipality']
  } else {
    enrichment.escalation_chain = ['municipality', 'district']
  }

  return enrichment
}

/**
 * Update report with enrichment data
 */
async function updateReportWithEnrichment(reportId, enrichment) {
  const sql = `
    UPDATE reports SET
      municipality_id = COALESCE(municipality_id, $2),
      district_id = COALESCE(district_id, $3),
      neighborhood = COALESCE(neighborhood, $4),
      contract_id = COALESCE(contract_id, $5),
      contractor_entity = COALESCE(contractor_entity, $6),
      priority_level = COALESCE(priority_level, $7),
      sla_hours = COALESCE(sla_hours, $8),
      responsible_party = COALESCE(responsible_party, $9),
      escalation_chain = COALESCE(escalation_chain, $10),
      spatial_enriched_at = NOW(),
      spatial_enriched_by = $11,
      updated_at = NOW()
    WHERE id = $1
  `

  await query(sql, [
    reportId,
    enrichment.municipality_id,
    enrichment.district_id,
    enrichment.neighborhood,
    enrichment.contract_id,
    enrichment.contractor_entity,
    enrichment.priority_level,
    enrichment.sla_hours,
    enrichment.responsible_party,
    JSON.stringify(enrichment.escalation_chain),
    null // TODO: pass user ID if available
  ])
}