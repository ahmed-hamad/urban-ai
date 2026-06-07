// Element Mapping Service
//
// Bridges the gap between AI detection labels and UrbanAI regulatory elements.
// Every detection passes through this layer before a detection_candidate is written.
//
// Three-layer architecture:
//   AI Label (per provider) → Canonical UrbanAI Element → Regulatory Element
//
// Governance rules:
//   - AI labels must never be directly linked to regulations
//   - Mappings are loaded from element_detection_mapping (DB-driven, not hardcoded)
//   - Unmapped labels produce a candidate with NULL mapped fields (human picks at review)
//   - Inactive mappings are ignored

import { query } from '../db.js'

// Cache mappings in memory per provider to avoid per-detection DB round-trips.
// Invalidated after MAPPING_CACHE_TTL_MS.
const MAPPING_CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const _cache = new Map()  // providerKey → { rows, expiresAt }

async function loadMappings(aiProvider) {
  const cached = _cache.get(aiProvider)
  if (cached && cached.expiresAt > Date.now()) return cached.rows

  const { rows } = await query(
    `SELECT id, ai_label, urban_element_id, urban_element_label,
            regulatory_element_id, confidence_threshold
     FROM element_detection_mapping
     WHERE ai_provider = $1 AND active = true`,
    [aiProvider],
  )

  _cache.set(aiProvider, { rows, expiresAt: Date.now() + MAPPING_CACHE_TTL_MS })
  return rows
}

// Resolves a single AI label to its UrbanAI mapping row.
// Returns null if no active mapping exists for this label/provider combination.
export async function resolveMapping(aiLabel, aiProvider) {
  const rows = await loadMappings(aiProvider)
  return rows.find(r => r.ai_label === aiLabel) ?? null
}

// Applies mapping to an array of raw detections from any provider.
// Returns enriched detections with mapping fields attached.
export async function applyMappings(detections, aiProvider) {
  const rows = await loadMappings(aiProvider)
  const byLabel = Object.fromEntries(rows.map(r => [r.ai_label, r]))

  return detections.map(det => {
    const mapping = byLabel[det.element_type] ?? null
    return {
      ...det,
      mapping_id:                 mapping?.id                  ?? null,
      mapped_urban_element_id:    mapping?.urban_element_id    ?? null,
      mapped_urban_element_label: mapping?.urban_element_label ?? null,
      mapped_regulatory_element_id: mapping?.regulatory_element_id ?? null,
    }
  })
}

// Invalidates the in-memory cache for a provider.
// Call this after any mapping table write.
export function invalidateMappingCache(aiProvider) {
  if (aiProvider) _cache.delete(aiProvider)
  else _cache.clear()
}

// Lists all active mappings for a provider (or all providers if unspecified).
export async function listMappings({ aiProvider, includeInactive = false } = {}) {
  const params = []
  let sql = `SELECT * FROM element_detection_mapping WHERE 1=1`
  if (aiProvider)         { params.push(aiProvider); sql += ` AND ai_provider = $${params.length}` }
  if (!includeInactive)   { sql += ` AND active = true` }
  sql += ` ORDER BY ai_provider, ai_label`
  const { rows } = await query(sql, params)
  return rows
}

// Creates a new mapping entry.
export async function createMapping({ aiLabel, aiProvider, urbanElementId, urbanElementLabel, regulatoryElementId, confidenceThreshold, notes }) {
  const { rows: [row] } = await query(
    `INSERT INTO element_detection_mapping
       (ai_label, ai_provider, urban_element_id, urban_element_label,
        regulatory_element_id, confidence_threshold, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [aiLabel, aiProvider, urbanElementId, urbanElementLabel,
     regulatoryElementId ?? null, confidenceThreshold ?? 0.40, notes ?? null],
  )
  invalidateMappingCache(aiProvider)
  return row
}

// Updates an existing mapping (partial update — only provided fields are changed).
export async function updateMapping(id, fields) {
  const allowed = ['urban_element_id', 'urban_element_label', 'regulatory_element_id',
                   'confidence_threshold', 'active', 'notes']
  const sets = []
  const params = []
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { params.push(v); sets.push(`${k} = $${params.length}`) }
  }
  if (!sets.length) throw new Error('No valid fields to update')
  sets.push('updated_at = NOW()')
  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE element_detection_mapping SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
  if (row) invalidateMappingCache(row.ai_provider)
  return row ?? null
}
