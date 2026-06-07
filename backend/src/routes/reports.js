import { Router } from 'express'
import { requirePermission, buildReportScope } from '../middleware/auth.js'
import { query } from '../services/db.js'
import { audit } from '../services/audit.js'
import {
  onReportCreated, onReportAssigned, onQualityReviewNeeded,
  onReportRejected, onReportClosed, onInspectorClosed,
  onReportUnderReview, onDuplicateDetected,
} from '../services/notify.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUUID = (s) => UUID_RE.test(s)

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
           e.name  AS entity_name,
           e.type  AS entity_type,
           u1.full_name AS created_by_name,
           u2.full_name AS assigned_to_name,
           COUNT(*) OVER() AS total_count
    FROM reports r
    LEFT JOIN entities e ON e.id = r.entity_id
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

// GET /api/reports/monitoring-sources — must be before /:id routes
router.get('/monitoring-sources', requirePermission('view_reports'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, label, is_system FROM monitoring_sources ORDER BY is_system DESC, label`,
    )
    res.json({ sources: rows })
  } catch {
    // Table may not exist yet — return built-in defaults gracefully
    res.json({ sources: [
      { id: null, label: 'رصد استباقي', is_system: true },
      { id: null, label: 'رصد الأمين',  is_system: true },
    ]})
  }
})

// POST /api/reports/monitoring-sources — add a custom source (synced for all monitors)
router.post('/monitoring-sources', requirePermission('create_report'), async (req, res) => {
  const { label } = req.body
  if (!label?.trim()) return res.status(400).json({ error: 'التسمية مطلوبة', code: 'MISSING_LABEL' })
  try {
    const { rows: [src] } = await query(
      `INSERT INTO monitoring_sources (label, is_system, created_by)
       VALUES ($1, false, $2)
       ON CONFLICT (label) DO UPDATE SET label = EXCLUDED.label
       RETURNING id, label, is_system`,
      [label.trim(), req.user.id],
    )
    res.status(201).json({ source: src })
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ error: 'الجدول غير جاهز، شغّل setup-db.js' })
    throw err
  }
})

// GET /api/reports/:id/audit
// Returns the immutable audit log for a single report.
router.get('/:id/audit', requirePermission('view_reports'), async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Invalid report ID format' })
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
  if (!isUUID(req.params.id)) return res.status(404).json({ error: 'Report not found' })
  const scope = buildReportScope(req.user)

  const { rows } = await query(
    `SELECT r.*,
            e.name  AS entity_name,
            e.type  AS entity_type,
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
     LEFT JOIN entities e ON e.id = r.entity_id
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
// Manual and media-upload report creation. Location (coords) is mandatory per SOP.
// When candidateId is provided the report is linked to the detection candidate and
// ingestion_source is set to 'media_upload'.
router.post('/', requirePermission('create_report'), async (req, res) => {
  const {
    coords, element, element_label, description, entity_id, district, location_name,
    monitoring_source, priority, violations_data, estimated_fine, violator_name,
    violator_id, violator_type, candidateId,
  } = req.body

  const entityId = entity_id || req.user.entityId

  if (!coords || !Array.isArray(coords) || coords.length !== 2) {
    return res.status(400).json({ error: 'الموقع الجغرافي إلزامي لإنشاء البلاغ', code: 'LOCATION_REQUIRED' })
  }
  if (!entityId) {
    return res.status(400).json({ error: 'الجهة المسؤولة إلزامية', code: 'ENTITY_REQUIRED' })
  }

  // Validate candidateId format when provided
  if (candidateId && !isUUID(candidateId)) {
    return res.status(400).json({ error: 'Invalid candidateId format', code: 'INVALID_CANDIDATE_ID' })
  }

  const [lat, lng] = coords
  const latStr = lat != null ? String(lat) : null
  const lngStr = lng != null ? String(lng) : null

  const ingestionSource = candidateId ? 'media_upload' : 'manual'
  const { rows: [{ rn: reportNumber }] } = await query(`SELECT next_report_number() AS rn`)

  const violationsJson = violations_data ? JSON.stringify(violations_data) : null
  const fineVal        = estimated_fine != null ? String(estimated_fine) : null

  const { rows: [report] } = await query(
    `INSERT INTO reports
       (entity_id, ingestion_source, detection_candidate_id,
        element_id, element_label, status, description,
        district, location_name, gps_lat, gps_lng, created_by, report_number,
        monitoring_source, priority, violations_data,
        estimated_fine, violator_name, violator_id, violator_type,
        location)
     VALUES ($1,$2,$3::uuid,$4,$5,'draft',$6,$7,$8,
             $9::double precision,$10::double precision,$11,$12,$13,$14,
             $15::jsonb,$16::numeric,$17,$18,$19,
       CASE
         WHEN $9::double precision IS NOT NULL AND $10::double precision IS NOT NULL
         THEN ST_SetSRID(ST_MakePoint($10::double precision,$9::double precision),4326)
         ELSE NULL
       END)
     RETURNING *`,
    [
      entityId, ingestionSource, candidateId || null,
      element, element_label || element || null,
      description, district, location_name,
      latStr, lngStr, req.user.id, reportNumber,
      monitoring_source || null, priority || null,
      violationsJson, fineVal, violator_name || null, violator_id || null, violator_type || null,
    ],
  )

  // If this report was created from a detection candidate, link them
  if (candidateId) {
    // Mark candidate as confirmed and attach media
    const { rows: [candidate] } = await query(
      `UPDATE detection_candidates
         SET review_status = 'confirmed', reviewed_by = $1, reviewed_at = NOW(),
             report_id = $2, entity_id = $3, updated_at = NOW()
       WHERE id = $4 AND review_status = 'pending_review'
       RETURNING media_ingestion_id`,
      [req.user.id, report.id, entityId, candidateId],
    )

    // Copy source media as a report_media entry (phase=before)
    if (candidate?.media_ingestion_id) {
      await query(
        `INSERT INTO report_media (report_id, media_ingestion_id, file_path, file_type, mime_type, phase, uploaded_by)
         SELECT $1, id, file_path, file_type, mime_type, 'before', $2
         FROM media_ingestions WHERE id = $3
         ON CONFLICT DO NOTHING`,
        [report.id, req.user.id, candidate.media_ingestion_id],
      ).catch(() => {})
    }
  }

  await audit('report', report.id, 'created', req.user, {
    source: ingestionSource, reportNumber, monitoring_source, candidateId,
  })

  // Notify managers/executives about the new report (fire-and-forget)
  onReportCreated({
    reportId:     report.id,
    reportNumber: report.report_number,
    elementLabel: report.element_label || element,
    entityId:     report.entity_id,
    actorId:      req.user.id,
  })

  // Auto-detect duplicate reports: same element, within 100m, open status, different monitoring source
  let groupedWith = []
  if (element && latStr && lngStr) {
    const { rows: duplicates } = await query(
      `SELECT id, monitoring_source, status FROM reports
       WHERE id != $1
         AND element_id = $2
         AND status NOT IN ('closed_final', 'rejected', 'deleted')
         AND location IS NOT NULL
         AND ST_DWithin(
           location::geography,
           ST_SetSRID(ST_MakePoint($4::double precision,$3::double precision),4326)::geography,
           100
         )`,
      [report.id, element, latStr, lngStr],
    )
    for (const dup of duplicates) {
      const leaderId = dup.id < report.id ? dup.id : report.id
      const memberId = dup.id < report.id ? report.id : dup.id
      await query(
        `INSERT INTO report_groups (leader_id, member_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [leaderId, memberId],
      ).catch(() => {})
      groupedWith.push(dup.id)
    }
    if (groupedWith.length > 0) {
      onDuplicateDetected({
        reportId:       report.id,
        reportNumber:   report.report_number,
        duplicateCount: groupedWith.length + 1,
        entityId:       report.entity_id,
        actorId:        req.user.id,
      })
    }
  }

  res.status(201).json({ report, groupedWith })
})

// PATCH /api/reports/:id/status
// Governed status transition. Validates permissions and logs audit trail.
router.patch('/:id/status', requirePermission('view_reports'), async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Invalid report ID format' })
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

  // Fire event-driven notifications (fire-and-forget — never block the response)
  const notifyCtx = {
    reportId:     req.params.id,
    reportNumber: report.report_number,
    elementLabel: report.element_label,
    entityId:     report.entity_id,
    createdBy:    report.created_by,
    assignedTo:   assignedTo || report.assigned_to,
    actorId:      req.user.id,
  }
  if (toStatus === 'assigned' && (assignedTo || report.assigned_to)) {
    onReportAssigned({ ...notifyCtx, assignedToId: assignedTo || report.assigned_to })
  } else if (toStatus === 'under_review') {
    onReportUnderReview(notifyCtx)
  } else if (toStatus === 'quality_review') {
    onQualityReviewNeeded(notifyCtx)
  } else if (toStatus === 'rejected') {
    onReportRejected(notifyCtx)
  } else if (toStatus === 'closed_final') {
    onReportClosed(notifyCtx)
  } else if (['closed_inspector', 'pending_enforcement', 'pending_notice', 'unknown_offender'].includes(toStatus)) {
    onInspectorClosed(notifyCtx)
  }

  res.json({ success: true, reportId: req.params.id, toStatus, report: updated })
})

// GET /api/reports/:id/group — return all reports in the same duplicate group
router.get('/:id/group', requirePermission('view_reports'), async (req, res) => {
  if (!isUUID(req.params.id)) return res.json({ group: [] })
  const { rows } = await query(
    `SELECT r.id, r.report_number, r.element_id, r.element_label,
            r.status, r.monitoring_source, r.created_at,
            u.full_name AS created_by_name
     FROM report_groups rg
     JOIN reports r ON r.id = CASE WHEN rg.leader_id = $1 THEN rg.member_id ELSE rg.leader_id END
     JOIN users u ON u.id = r.created_by
     WHERE (rg.leader_id = $1 OR rg.member_id = $1)
       AND r.id != $1
       AND r.status != 'deleted'`,
    [req.params.id],
  )
  res.json({ group: rows })
})

// POST /api/reports/:id/batch-close — close this report and confirmed duplicates together
router.post('/:id/batch-close', requirePermission('close_inspector'), async (req, res) => {
  if (!isUUID(req.params.id)) return res.status(400).json({ error: 'Invalid report ID format' })
  const { closureType, closureNotes, includeIds = [] } = req.body
  if (!closureType) return res.status(400).json({ error: 'نوع الإغلاق مطلوب', code: 'MISSING_CLOSURE_TYPE' })

  const scope = buildReportScope(req.user)
  const allIds = [req.params.id, ...includeIds.filter(id => id !== req.params.id)]

  // Validate all IDs are valid UUIDs before touching the DB
  if (allIds.some(id => !isUUID(id))) {
    return res.status(400).json({ error: 'معرفات البلاغات غير صالحة', code: 'INVALID_REPORT_IDS' })
  }

  // Build scope-aware WHERE clause so a monitor/manager cannot close reports outside their scope
  const updateParams = [closureType, closureNotes || null, allIds]
  let scopeFilter = ''
  if (scope.type === 'entity') {
    updateParams.push(scope.entityId)
    scopeFilter = `AND entity_id = $${updateParams.length}::uuid`
  } else if (scope.type === 'user') {
    updateParams.push(scope.userId)
    scopeFilter = `AND (assigned_to = $${updateParams.length}::uuid OR created_by = $${updateParams.length}::uuid)`
  }

  const { rows: updated } = await query(
    `UPDATE reports
     SET status = 'closed_final', closure_type = $1, closure_notes = $2,
         closed_at = NOW(), updated_at = NOW()
     WHERE id = ANY($3::uuid[])
       AND status NOT IN ('closed_final', 'rejected', 'deleted')
       ${scopeFilter}
     RETURNING id, report_number, status`,
    updateParams,
  )

  for (const r of updated) {
    await audit('report', r.id, 'status_changed', req.user, {
      fromStatus: 'open',
      toStatus: 'closed_final',
      closureType,
      batchClose: true,
      batchLeader: req.params.id,
    })
  }

  res.json({ success: true, closed: updated.map(r => r.id) })
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
