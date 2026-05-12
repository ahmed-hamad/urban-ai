// Duplicate Detection API
// Review workflow for duplicate_candidates — all decisions require human review.
// No auto-creation, auto-merge, or auto-close.

import { Router } from 'express'
import { requirePermission } from '../middleware/auth.js'
import { query } from '../services/db.js'
import {
  listDuplicateCandidates,
  getDuplicateStats,
  scanInternalDuplicates,
} from '../services/duplicateDetection.js'

const router = Router()

// ─── List candidates ──────────────────────────────────────────────────────────

router.get('/', requirePermission('view_reports'), async (req, res) => {
  const { status, layerId, limit = '50', offset = '0' } = req.query
  const { entityId, role } = req.user

  const rows = await listDuplicateCandidates({
    entityId: role !== 'admin' && role !== 'executive' ? entityId : null,
    status: status || null,
    layerId: layerId || null,
    limit:  Math.min(Number(limit), 200),
    offset: Number(offset),
  })
  res.json({ candidates: rows })
})

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', requirePermission('view_reports'), async (req, res) => {
  const { entityId, role } = req.user
  const stats = await getDuplicateStats(
    role !== 'admin' && role !== 'executive' ? entityId : null,
  )
  res.json({ stats })
})

// ─── Get single candidate ─────────────────────────────────────────────────────

router.get('/:id', requirePermission('view_reports'), async (req, res) => {
  const { rows } = await query(
    `SELECT dc.*,
            sr.element_id AS src_element, sr.location_name AS src_location,
            sr.status AS src_status, sr.ingestion_source AS src_source,
            sr.gps_lat AS src_lat, sr.gps_lng AS src_lng,
            mr.element_id AS match_element, mr.location_name AS match_location,
            mr.status AS match_status, mr.ingestion_source AS match_source,
            mr.gps_lat AS match_lat, mr.gps_lng AS match_lng,
            obs.element_type AS obs_element, obs.location_name AS obs_location,
            obs.observed_at, obs.centroid_lat AS obs_lat, obs.centroid_lng AS obs_lng,
            ol.name AS obs_layer_name, ol.source_name AS obs_source_name,
            u.full_name AS reviewer_name
     FROM duplicate_candidates dc
     LEFT JOIN reports       sr  ON sr.id  = dc.source_report_id
     LEFT JOIN reports       mr  ON mr.id  = dc.matched_report_id
     LEFT JOIN observations  obs ON obs.id = dc.source_observation_id
     LEFT JOIN observation_layers ol ON ol.id = obs.layer_id
     LEFT JOIN users         u   ON u.id   = dc.reviewed_by
     WHERE dc.id = $1`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Candidate not found' })
  res.json({ candidate: rows[0] })
})

// ─── Review decision ──────────────────────────────────────────────────────────

router.patch('/:id/review', requirePermission('view_reports'), async (req, res) => {
  const { decision, notes } = req.body
  const VALID = ['confirmed_duplicate', 'rejected']

  if (!VALID.includes(decision)) {
    return res.status(400).json({ error: `القرار يجب أن يكون: ${VALID.join(' أو ')}` })
  }

  const { rows } = await query(
    `UPDATE duplicate_candidates
     SET status      = $1,
         reviewed_by = $2::uuid,
         reviewed_at = NOW(),
         review_notes = $3
     WHERE id = $4
     RETURNING id, status`,
    [decision, req.user.id, notes || null, req.params.id],
  )

  if (!rows.length) return res.status(404).json({ error: 'Candidate not found' })

  // Audit log
  await query(
    `INSERT INTO audit_logs (subject_type, subject_id, action, performed_by, entity_id, metadata)
     VALUES ('duplicate_candidate', $1, $2, $3, $4, $5)`,
    [req.params.id, `duplicate_${decision}`, req.user.id, req.user.entityId, JSON.stringify({ notes })],
  ).catch(() => {})

  res.json({ success: true, candidate: rows[0] })
})

// ─── Trigger internal (report-vs-report) scan ────────────────────────────────

router.post('/scan/internal', requirePermission('gis_access'), async (req, res) => {
  const { entityId, role } = req.user
  const scopeEntityId = role !== 'admin' ? entityId : (req.body.entityId || null)

  scanInternalDuplicates(scopeEntityId)
    .then(r => console.log(`[duplicates] internal scan done: ${r.candidatesInserted} candidates`))
    .catch(err => console.error('[duplicates] internal scan error:', err.message))

  res.json({ message: 'بدأ المسح الداخلي في الخلفية' })
})

// ─── Matching rules (per entity) ──────────────────────────────────────────────

router.get('/rules', requirePermission('manage_entities'), async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM duplicate_match_rules ORDER BY is_default DESC, created_at`,
  )
  res.json({ rules: rows })
})

router.put('/rules', requirePermission('manage_entities'), async (req, res) => {
  const {
    entityId, distanceThresholdM, timeThresholdDays,
    minConfidence, weightDistance, weightTime, weightElement,
  } = req.body

  const { rows } = await query(
    `INSERT INTO duplicate_match_rules
       (entity_id, distance_threshold_m, time_threshold_days,
        min_confidence, weight_distance, weight_time, weight_element)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (entity_id) DO UPDATE
       SET distance_threshold_m = EXCLUDED.distance_threshold_m,
           time_threshold_days  = EXCLUDED.time_threshold_days,
           min_confidence       = EXCLUDED.min_confidence,
           weight_distance      = EXCLUDED.weight_distance,
           weight_time          = EXCLUDED.weight_time,
           weight_element       = EXCLUDED.weight_element,
           updated_at           = NOW()
     RETURNING *`,
    [entityId || null, distanceThresholdM, timeThresholdDays,
     minConfidence, weightDistance, weightTime, weightElement],
  )
  res.json({ rule: rows[0] })
})

export default router
