import { Router } from 'express'
import { requirePermission, buildReportScope } from '../middleware/auth.js'
import { query } from '../services/db.js'

const router = Router()

// Local audit helper (mirrors the pattern in ingestion.js)
async function audit(subjectType, subjectId, action, actor, meta = {}) {
  await query(
    `INSERT INTO audit_logs (subject_type, subject_id, action, performed_by, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [subjectType, subjectId, action, actor.id, actor.entityId, JSON.stringify(meta)],
  )
}

// GET /api/reports
// Returns reports from PostgreSQL with RBAC scope enforcement.
// Supports: status, element, ingestion_source, page, limit filters.
router.get('/', requirePermission('view_reports'), async (req, res) => {
  const scope = buildReportScope(req.user)
  const { status, element, ingestion_source, page = 1, limit = 50 } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  const params = []
  let sql = `
    SELECT r.*,
           u1.full_name AS created_by_name,
           u2.full_name AS assigned_to_name,
           COUNT(*) OVER() AS total_count
    FROM reports r
    LEFT JOIN users u1 ON u1.id = r.created_by
    LEFT JOIN users u2 ON u2.id = r.assigned_to
    WHERE 1=1
  `

  if (scope.type === 'entity') {
    params.push(scope.entityId)
    sql += ` AND r.entity_id = $${params.length}`
  } else if (scope.type === 'user') {
    params.push(scope.userId)
    sql += ` AND (r.assigned_to = $${params.length} OR r.created_by = $${params.length})`
  }

  if (status)           { params.push(status);           sql += ` AND r.status = $${params.length}` }
  if (element)          { params.push(element);          sql += ` AND r.element_id = $${params.length}` }
  if (ingestion_source) { params.push(ingestion_source); sql += ` AND r.ingestion_source = $${params.length}` }

  // Exclude soft-deleted
  sql += ` AND r.status != 'deleted'`

  params.push(Number(limit), offset)
  sql += ` ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)

  res.json({
    reports:  rows,
    total:    Number(rows[0]?.total_count ?? 0),
    scope:    scope.type,
    page:     Number(page),
    limit:    Number(limit),
  })
})

// GET /api/reports/:id/audit
// Returns the immutable audit log for a single report.
router.get('/:id/audit', requirePermission('view_reports'), async (req, res) => {
  const scope = buildReportScope(req.user)

  const { rows: [rep] } = await query(
    `SELECT entity_id, created_by, assigned_to FROM reports WHERE id = $1 AND status != 'deleted'`,
    [req.params.id],
  )
  if (!rep) return res.status(404).json({ error: 'Report not found' })

  if (scope.type === 'entity' && rep.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
  }
  if (scope.type === 'user' && rep.assigned_to !== scope.userId && rep.created_by !== scope.userId) {
    return res.status(403).json({ error: 'Forbidden', code: 'OWNERSHIP_MISMATCH' })
  }

  const { rows: logs } = await query(
    `SELECT al.*, u.full_name AS performed_by_name,
            al.metadata->>'fromStatus' AS from_status,
            al.metadata->>'toStatus'   AS to_status
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.performed_by
     WHERE al.subject_type = 'report' AND al.subject_id = $1
     ORDER BY al.created_at DESC`,
    [req.params.id],
  )

  res.json({ logs })
})

// GET /api/reports/:id
// Returns full report details including: media attachments, GIS source attributes,
// candidate media (fallback when report_media is empty), geometry.
router.get('/:id', requirePermission('view_reports'), async (req, res) => {
  const scope = buildReportScope(req.user)

  const { rows } = await query(
    `SELECT r.*,
            u1.full_name  AS created_by_name,
            u2.full_name  AS assigned_to_name,
            ST_AsGeoJSON(r.location)::json AS location_geojson,

            -- GIS import: source feature attributes + geometry + enterprise mapped fields
            imf.source_attributes    AS gis_source_attributes,
            imf.mapped_element_type  AS gis_element_type,
            imf.mapped_description   AS gis_description,
            imf.mapped_operational   AS gis_mapped_operational,
            ST_AsGeoJSON(imf.geometry)::json AS gis_geometry_geojson,

            -- Media candidate: original uploaded file (fallback when no report_media)
            dc.media_ingestion_id    AS candidate_ingestion_id,
            mi.file_path             AS candidate_file_path,
            mi.file_type             AS candidate_file_type,
            mi.mime_type             AS candidate_mime_type,
            mi.capture_timestamp     AS candidate_capture_timestamp,

            -- Media attachments from report_media table (aggregated)
            COALESCE((
              SELECT json_agg(
                json_build_object(
                  'id',        rm.id,
                  'file_path', rm.file_path,
                  'file_type', rm.file_type,
                  'mime_type', rm.mime_type,
                  'phase',     rm.phase,
                  'caption',   rm.caption
                ) ORDER BY rm.created_at
              )
              FROM report_media rm WHERE rm.report_id = r.id
            ), '[]'::json) AS media_attachments

     FROM reports r
     LEFT JOIN users u1        ON u1.id  = r.created_by
     LEFT JOIN users u2        ON u2.id  = r.assigned_to
     LEFT JOIN import_features imf ON imf.id = r.import_feature_id
     LEFT JOIN detection_candidates dc ON dc.id = r.detection_candidate_id
     LEFT JOIN media_ingestions  mi ON mi.id  = dc.media_ingestion_id
     WHERE r.id = $1 AND r.status != 'deleted'`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Report not found' })

  const report = rows[0]
  if (scope.type === 'entity' && report.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
  }
  if (scope.type === 'user' && report.assigned_to !== scope.userId && report.created_by !== scope.userId) {
    return res.status(403).json({ error: 'Forbidden', code: 'OWNERSHIP_MISMATCH' })
  }

  res.json({ report })
})

// POST /api/reports
// Manual report creation. Location (coords) is mandatory per SOP.
router.post('/', requirePermission('create_report'), async (req, res) => {
  const { coords, element, description, entity_id, district, location_name } = req.body
  const entityId = req.user.entityId ?? entity_id

  if (!coords || !Array.isArray(coords) || coords.length !== 2) {
    return res.status(400).json({ error: 'الموقع الجغرافي إلزامي لإنشاء البلاغ', code: 'LOCATION_REQUIRED' })
  }

  const [lat, lng] = coords
  const latStr = lat != null ? String(lat) : null
  const lngStr = lng != null ? String(lng) : null

  const { rows: [{ rn: reportNumber }] } = await query(`SELECT next_report_number() AS rn`)

  const { rows: [report] } = await query(
    `INSERT INTO reports
       (entity_id, ingestion_source, element_id, element_label, status, description,
        district, location_name, gps_lat, gps_lng, created_by, report_number, location)
     VALUES ($1,'manual',$2,$2,'draft',$3,$4,$5,
             $6::double precision,$7::double precision,$8,$9,
       CASE
         WHEN $6::double precision IS NOT NULL AND $7::double precision IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint($7::double precision,$6::double precision),4326)
         ELSE NULL
       END)
     RETURNING *`,
    [entityId, element, description, district, location_name, latStr, lngStr, req.user.id, reportNumber],
  )

  await audit('report', report.id, 'created', req.user, { source: 'manual', reportNumber })
  res.status(201).json({ report })
})

// PATCH /api/reports/:id/status
// Governed status transition. Validates permissions and logs audit trail.
router.patch('/:id/status', requirePermission('view_reports'), async (req, res) => {
  const { toStatus, reason, closureType, closureNotes, assignedTo } = req.body
  const scope = buildReportScope(req.user)

  const TRANSITION_PERMS = {
    submitted:           'create_report',
    under_review:        'assign_report',
    assigned:            'assign_report',
    rejected:            'reject_report',
    closed_inspector:    'close_inspector',
    pending_enforcement: 'close_inspector',
    pending_notice:      'close_inspector',
    unknown_offender:    'close_inspector',
    quality_review:      'quality_review',
    closed_final:        'close_final',
  }
  const required = TRANSITION_PERMS[toStatus]
  if (required) {
    const userPerms = req.user.permissions || []
    if (!userPerms.includes(required) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden', code: 'MISSING_PERMISSION', required, transition: toStatus,
      })
    }
  }

  const { rows } = await query(
    `SELECT * FROM reports WHERE id = $1 AND status != 'deleted'`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Report not found' })

  const report = rows[0]
  if (scope.type === 'entity' && report.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
  }
  if (scope.type === 'user' && report.assigned_to !== scope.userId && report.created_by !== scope.userId) {
    return res.status(403).json({ error: 'Forbidden', code: 'OWNERSHIP_MISMATCH' })
  }

  // draft → submitted: validate required fields before the report enters the workflow
  if (toStatus === 'submitted') {
    if (report.status !== 'draft') {
      return res.status(409).json({ error: 'يمكن تقديم البلاغات في مرحلة المسودة فقط', code: 'NOT_DRAFT' })
    }
    const missing = []
    if (!report.element_id)  missing.push('element_id')
    if (!report.description) missing.push('description')
    if (report.gps_lat == null || report.gps_lng == null) missing.push('location')
    if (!report.entity_id)   missing.push('entity_id')
    if (missing.length > 0) {
      return res.status(422).json({
        error: 'البلاغ غير مكتمل — يرجى استيفاء جميع الحقول المطلوبة قبل التقديم',
        code: 'INCOMPLETE_DRAFT',
        missing,
      })
    }
  }

  const setParams = [toStatus]
  const setClauses = ['status = $1', 'updated_at = NOW()']

  if (closureType !== undefined) {
    setParams.push(closureType)
    setClauses.push(`closure_type = $${setParams.length}`)
  }
  if (closureNotes !== undefined) {
    setParams.push(closureNotes)
    setClauses.push(`closure_notes = $${setParams.length}`)
  }
  if (assignedTo !== undefined) {
    const uuid = assignedTo || null
    if (uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      return res.status(400).json({ error: 'معرف المستخدم غير صالح', code: 'INVALID_USER_ID' })
    }
    setParams.push(uuid)
    setClauses.push(`assigned_to = $${setParams.length}::uuid`)
  }
  if (toStatus === 'submitted') {
    setClauses.push('submitted_at = NOW()')
  }
  if (toStatus === 'closed_final') {
    setClauses.push('closed_at = NOW()')
  }

  setParams.push(req.params.id)
  const { rows: [updated] } = await query(
    `UPDATE reports SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
    setParams,
  )

  await audit('report', req.params.id, 'status_changed', req.user, {
    fromStatus: report.status,
    toStatus,
    reason,
    closureType,
  })

  res.json({ success: true, reportId: req.params.id, toStatus, report: updated })
})

// DELETE /api/reports/:id — admin only, soft-delete via status flag
router.delete('/:id', requirePermission('view_reports'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_ONLY' })
  }

  const { rows } = await query(
    `UPDATE reports SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 AND status != 'deleted' RETURNING id`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Report not found' })

  await audit('report', req.params.id, 'deleted', req.user, {})
  res.json({ success: true })
})

export default router
