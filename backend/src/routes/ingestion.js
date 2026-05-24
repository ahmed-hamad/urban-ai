import { Router }   from 'express'
import multer        from 'multer'
import path          from 'path'
import { mkdir }     from 'fs/promises'
import { randomUUID } from 'crypto'
import { requirePermission, buildReportScope } from '../middleware/auth.js'
import { query, getClient } from '../services/db.js'
import { extractMetadata, classifyFileType }   from '../services/ingestion/mediaProcessor.js'
import {
  processGeoJSON, processShapefile, extractRasterAttributes,
  buildEffectiveMapping, applyFieldMapping,
} from '../services/ingestion/gisProcessor.js'
import { suggestGroups, describeGroup }        from '../services/ingestion/candidateGrouper.js'
import { enrichReportSpatially } from '../services/spatialGovernance.js'

const router = Router()

// ─── Report number generator ──────────────────────────────────────────────────
async function nextReportNumber(client) {
  const fn = client ? client.query.bind(client) : query
  const { rows: [{ rn }] } = await fn(`SELECT next_report_number() AS rn`)
  return rn
}

// Attach raster image URLs from GIS feature attributes as report_media (phase=before).
async function attachRasterImages(reportId, rasterImages, userId, dbClient) {
  if (!rasterImages || rasterImages.length === 0) return
  const fn = dbClient ? dbClient.query.bind(dbClient) : query
  // rasterImages may arrive as a JSONB string (from DB column) or a JS array
  const images = Array.isArray(rasterImages)
    ? rasterImages
    : (typeof rasterImages === 'string' ? JSON.parse(rasterImages) : [])
  for (const img of images) {
    if (!img?.url) continue
    await fn(
      `INSERT INTO report_media (report_id, file_path, file_type, mime_type, phase, caption, uploaded_by)
       VALUES ($1, $2, 'image', 'image/jpeg', 'before', $3, $4::uuid)`,
      [reportId, img.url, `مرفق GIS: ${img.attrName || 'صورة'}`, userId || null],
    ).catch(() => {})
  }
}

// ─── Upload directories ───────────────────────────────────────────────────────

const UPLOAD_ROOT = process.env.UPLOAD_PATH ?? 'uploads'
const MEDIA_DIR   = path.join(UPLOAD_ROOT, 'media')
const GIS_DIR     = path.join(UPLOAD_ROOT, 'gis')

await mkdir(MEDIA_DIR, { recursive: true })
await mkdir(GIS_DIR,   { recursive: true })

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${randomUUID()}${ext}`)
  },
})

const gisStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, GIS_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${randomUUID()}${ext}`)
  },
})

const ALLOWED_MEDIA_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'image/tiff', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo', 'video/x-matroska',
])

const GIS_EXTENSIONS = new Set(['.geojson', '.json', '.shp', '.kml', '.gpkg', '.zip'])

const GIS_TYPE_MAP = {
  '.geojson': 'geojson',
  '.json':    'geojson',
  '.shp':     'shapefile',
  '.kml':     'kml',
  '.gpkg':    'geopackage',
  '.zip':     'shapefile',
}

const mediaUpload = multer({
  storage: mediaStorage,
  limits:  { fileSize: 200 * 1024 * 1024 },  // 200 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MEDIA_MIME.has(file.mimetype)) return cb(null, true)
    cb(Object.assign(new Error(`Unsupported media type: ${file.mimetype}`), { code: 'UNSUPPORTED_TYPE' }))
  },
})

const gisUpload = multer({
  storage: gisStorage,
  limits:  { fileSize: 500 * 1024 * 1024 },  // 500 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (GIS_EXTENSIONS.has(ext)) return cb(null, true)
    cb(Object.assign(new Error(`Unsupported GIS format: ${file.originalname}`), { code: 'UNSUPPORTED_FORMAT' }))
  },
})

// ─── Shared audit helper ─────────────────────────────────────────────────────

async function audit(subjectType, subjectId, action, actor, meta = {}, dbClient = null) {
  const q = dbClient ? dbClient.query.bind(dbClient) : query
  await q(
    `INSERT INTO audit_logs (subject_type, subject_id, action, performed_by, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [subjectType, subjectId, action, actor.id, actor.entityId, JSON.stringify(meta)],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA INGESTION
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ingestion/media
// Upload one or more media files.
// Each file becomes one media_ingestion + one detection_candidate (pending_review).
// No report is created. Human review is required.
router.post('/media', requirePermission('create_report'), mediaUpload.array('files', 20), async (req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ error: 'No files received', code: 'NO_FILES' })
  }

  const entityId = req.user.entityId ?? req.body.entity_id
  if (!entityId) {
    return res.status(400).json({ error: 'entity_id is required', code: 'ENTITY_REQUIRED' })
  }

  const created = []
  const failed  = []

  for (const file of req.files) {
    try {
      const fileType = classifyFileType(file.mimetype)
      const meta     = await extractMetadata(file.path, file.mimetype)

      const gpsLat = meta.gpsLat != null ? String(meta.gpsLat) : null
      const gpsLng = meta.gpsLng != null ? String(meta.gpsLng) : null

      const { rows: [ingestion] } = await query(
        `INSERT INTO media_ingestions
           (entity_id, uploaded_by, file_name, file_path, file_type, mime_type, file_size_bytes,
            gps_lat, gps_lng, gps_altitude, capture_timestamp, exif_data, processing_status,
            location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::double precision,$9::double precision,$10,$11,$12,'processed',
           CASE
            WHEN $8::double precision IS NOT NULL
            AND $9::double precision IS NOT NULL
            THEN ST_SetSRID(
              ST_MakePoint(
                $9::double precision,
                $8::double precision
              ),
              4326
            )
            ELSE NULL
          END)
         RETURNING id, entity_id`,
        [
          entityId, req.user.id, file.originalname, file.path, fileType, file.mimetype,
          file.size, gpsLat, gpsLng, meta.gpsAltitude,
          meta.captureTimestamp, JSON.stringify(meta.exifData ?? {}),
        ],
      )

      const { rows: [candidate] } = await query(
        `INSERT INTO detection_candidates
           (media_ingestion_id, entity_id, detection_source, gps_lat, gps_lng, location)
         VALUES ($1,$2,'manual',$3::double precision,$4::double precision,
            CASE
              WHEN $3::double precision IS NOT NULL
              AND $4::double precision IS NOT NULL
              THEN ST_SetSRID(
                ST_MakePoint(
                  $4::double precision,
                  $3::double precision
                ),
                4326
              )
              ELSE NULL
            END)
         RETURNING id`,
        [ingestion.id, entityId, gpsLat, gpsLng],
      )

      await audit('media_ingestion', ingestion.id, 'media_uploaded', req.user, {
        fileName: file.originalname, fileType, hasGPS: meta.gpsLat != null,
      })

      created.push({
        ingestionId: ingestion.id,
        candidateId: candidate.id,
        fileName:    file.originalname,
        fileType,
        hasGPS:      meta.gpsLat != null,
        gpsLat:      meta.gpsLat,
        gpsLng:      meta.gpsLng,
        captureTimestamp: meta.captureTimestamp,
      })
    } catch (err) {
      console.error('[ingestion/media] file error:', file.originalname, err.message)
      failed.push({ fileName: file.originalname, error: err.message })
    }
  }

  res.status(201).json({
    success: true,
    created: created.length,
    failed:  failed.length,
    results: created,
    errors:  failed,
    message: `${created.length} detection candidate(s) created. Human review required before any report is generated.`,
  })
})

// GET /api/ingestion/media
router.get('/media', requirePermission('view_reports'), async (req, res) => {
  const scope  = buildReportScope(req.user)
  const { processing_status, page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit

  const params = []
  let sql = `SELECT mi.*, u.full_name AS uploaded_by_name,
               COUNT(*) OVER() AS total_count
             FROM media_ingestions mi
             JOIN users u ON u.id = mi.uploaded_by WHERE 1=1`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND mi.entity_id = $${params.length}` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND mi.uploaded_by = $${params.length}` }
  if (processing_status)       { params.push(processing_status); sql += ` AND mi.processing_status = $${params.length}` }

  params.push(Number(limit), Number(offset))
  sql += ` ORDER BY mi.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  res.json({ media: rows, total: Number(rows[0]?.total_count ?? 0), page: Number(page), limit: Number(limit) })
})

// ─────────────────────────────────────────────────────────────────────────────
// DETECTION CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ingestion/candidates
router.get('/candidates', requirePermission('view_reports'), async (req, res) => {
  const scope  = buildReportScope(req.user)
  const { review_status = 'pending_review', element_type, page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit

  const params = []
  let sql = `SELECT dc.*,
               mi.file_name, mi.file_path, mi.file_type, mi.thumbnail_path,
               mi.capture_timestamp, mi.mime_type,
               u.full_name AS reviewed_by_name,
               COUNT(*) OVER() AS total_count
             FROM detection_candidates dc
             JOIN media_ingestions mi ON mi.id = dc.media_ingestion_id
             LEFT JOIN users u ON u.id = dc.reviewed_by WHERE 1=1`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND dc.entity_id = $${params.length}` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND mi.uploaded_by = $${params.length}` }
  if (review_status)           { params.push(review_status);  sql += ` AND dc.review_status = $${params.length}` }
  if (element_type)            { params.push(element_type);   sql += ` AND dc.suggested_element_type = $${params.length}` }

  params.push(Number(limit), Number(offset))
  sql += ` ORDER BY mi.capture_timestamp DESC NULLS LAST, dc.created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  res.json({ candidates: rows, total: Number(rows[0]?.total_count ?? 0), page: Number(page), limit: Number(limit) })
})

// GET /api/ingestion/candidates/:id
router.get('/candidates/:id', requirePermission('view_reports'), async (req, res) => {
  const { rows } = await query(
    `SELECT dc.*, mi.file_name, mi.file_path, mi.file_type, mi.thumbnail_path,
             mi.capture_timestamp, mi.exif_data,
             u.full_name AS reviewed_by_name
     FROM detection_candidates dc
     JOIN media_ingestions mi ON mi.id = dc.media_ingestion_id
     LEFT JOIN users u ON u.id = dc.reviewed_by
     WHERE dc.id = $1`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Candidate not found' })

  const c = rows[0]
  const scope = buildReportScope(req.user)
  if (scope.type === 'entity' && c.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
  }

  res.json({ candidate: c })
})

// PATCH /api/ingestion/candidates/:id/confirm
// Human reviews and confirms a candidate → creates a draft report + report_media entry.
// This is the ONLY path from candidate to report for media-based ingestion.
router.patch('/candidates/:id/confirm', requirePermission('create_report'), async (req, res) => {
  const { elementType, elementLabel, description, notes } = req.body
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Fetch candidate AND its source media in one query
    const { rows: [candidate] } = await client.query(
      `SELECT dc.*, mi.file_path AS mi_file_path, mi.file_type AS mi_file_type,
              mi.mime_type AS mi_mime_type, mi.capture_timestamp AS mi_capture_timestamp
       FROM detection_candidates dc
       JOIN media_ingestions mi ON mi.id = dc.media_ingestion_id
       WHERE dc.id = $1 FOR UPDATE OF dc`,
      [req.params.id],
    )
    if (!candidate) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Candidate not found' })
    }
    if (candidate.review_status !== 'pending_review') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Candidate already reviewed', status: candidate.review_status })
    }

    const scope = buildReportScope(req.user)
    if (scope.type === 'entity' && candidate.entity_id !== scope.entityId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
    }

    const candidateLat = candidate.gps_lat != null ? String(candidate.gps_lat) : null
    const candidateLng = candidate.gps_lng != null ? String(candidate.gps_lng) : null

    const { rows: [report] } = await client.query(
      `INSERT INTO reports
         (entity_id, detection_candidate_id, ingestion_source, element_id, element_label,
          status, description, gps_lat, gps_lng, created_by,
          location)
       VALUES ($1,$2,'media_upload',$3,$4,'draft',$5,$6::double precision,$7::double precision,$8,
         CASE
           WHEN $6::double precision IS NOT NULL
           AND $7::double precision IS NOT NULL
           THEN ST_SetSRID(
             ST_MakePoint(
               $7::double precision,
               $6::double precision
             ),
             4326
           )
           ELSE NULL
         END)
       RETURNING *`,
      [
        candidate.entity_id, candidate.id,
        elementType  ?? candidate.suggested_element_type,
        elementLabel ?? candidate.suggested_element_label,
        description, candidateLat, candidateLng, req.user.id,
      ],
    )

    // Persist the source media as a report_media entry (phase=before)
    if (candidate.mi_file_path) {
      await client.query(
        `INSERT INTO report_media
           (report_id, media_ingestion_id, file_path, file_type, mime_type, phase)
         VALUES ($1, $2, $3, $4, $5, 'before')`,
        [
          report.id, candidate.media_ingestion_id,
          candidate.mi_file_path, candidate.mi_file_type ?? 'image', candidate.mi_mime_type,
        ],
      )
    }

    await client.query(
      `UPDATE detection_candidates SET
         review_status = 'confirmed', reviewed_by = $1, reviewed_at = NOW(),
         review_notes = $2, report_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [req.user.id, notes, report.id, candidate.id],
    )

    await audit('detection_candidate', candidate.id, 'candidate_confirmed', req.user,
      { reportId: report.id, elementType }, client)
    await audit('report', report.id, 'created', req.user,
      { source: 'media_upload', candidateId: candidate.id }, client)

    await client.query('COMMIT')
    await enrichReportSpatially(report.id, report.location, candidate.entity_id)
    res.status(201).json({ success: true, reportId: report.id, report })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[ingestion] candidate confirm error:', err)
    res.status(500).json({ error: 'Failed to confirm candidate' })
  } finally {
    client.release()
  }
})

// PATCH /api/ingestion/candidates/:id/reject
router.patch('/candidates/:id/reject', requirePermission('create_report'), async (req, res) => {
  const { reason } = req.body

  const { rows } = await query(
    `UPDATE detection_candidates SET
       review_status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
       review_notes = $2, updated_at = NOW()
     WHERE id = $3 AND review_status = 'pending_review'
     RETURNING id, entity_id`,
    [req.user.id, reason, req.params.id],
  )
  if (!rows.length) {
    return res.status(404).json({ error: 'Candidate not found or already reviewed' })
  }

  await audit('detection_candidate', req.params.id, 'candidate_rejected', req.user, { reason })
  res.json({ success: true })
})

// POST /api/ingestion/candidates/suggest-groups
// Returns grouping suggestions based on spatial + temporal + element proximity.
// Suggestions only — no data is modified.
router.post('/candidates/suggest-groups', requirePermission('view_reports'), async (req, res) => {
  const { proximityMeters = 50, timeWindowMinutes = 30, requireSameElement = false } = req.body
  const scope  = buildReportScope(req.user)

  const params = []
  let sql = `SELECT dc.id, dc.gps_lat, dc.gps_lng, dc.suggested_element_type,
               mi.capture_timestamp
             FROM detection_candidates dc
             JOIN media_ingestions mi ON mi.id = dc.media_ingestion_id
             WHERE dc.review_status = 'pending_review'`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND dc.entity_id = $${params.length}` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND mi.uploaded_by = $${params.length}` }

  const { rows: candidates } = await query(sql, params)

  const groups    = suggestGroups(candidates, { proximityMeters, timeWindowMinutes, requireSameElement })
  const described = groups.map(ids => ({
    candidateIds: ids,
    description:  describeGroup(candidates, ids),
  }))

  res.json({
    suggestedGroups: described,
    groupCount:      groups.length,
    note: 'Suggestions only. Human confirmation required before any group becomes a report.',
  })
})

// POST /api/ingestion/candidates/confirm-group
// Human confirms a suggested group → creates ONE draft report from N candidates.
router.post('/candidates/confirm-group', requirePermission('create_report'), async (req, res) => {
  const { candidateIds, elementType, elementLabel, description } = req.body

  if (!Array.isArray(candidateIds) || candidateIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 candidate IDs required to form a group' })
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')

    const { rows: candidates } = await client.query(
      `SELECT * FROM detection_candidates
       WHERE id = ANY($1::uuid[]) AND review_status = 'pending_review' FOR UPDATE`,
      [candidateIds],
    )
    if (candidates.length !== candidateIds.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'One or more candidates are not available for grouping' })
    }

    const entityId  = candidates[0].entity_id
    const groupId   = randomUUID()
    const withLoc   = candidates.filter(c => c.gps_lat && c.gps_lng)
    const centroidLat = withLoc.length
      ? withLoc.reduce((s, c) => s + parseFloat(c.gps_lat), 0) / withLoc.length : null
    const centroidLng = withLoc.length
      ? withLoc.reduce((s, c) => s + parseFloat(c.gps_lng), 0) / withLoc.length : null

    const centroidLatStr = centroidLat != null ? String(centroidLat) : null
    const centroidLngStr = centroidLng != null ? String(centroidLng) : null

    const { rows: [report] } = await client.query(
      `INSERT INTO reports
         (entity_id, ingestion_source, element_id, element_label, status, description,
          gps_lat, gps_lng, created_by, location)
       VALUES ($1,'media_upload',$2,$3,'draft',$4,$5::double precision,$6::double precision,$7,
         CASE
           WHEN $5::double precision IS NOT NULL
           AND $6::double precision IS NOT NULL
           THEN ST_SetSRID(
             ST_MakePoint(
               $6::double precision,
               $5::double precision
             ),
             4326
           )
           ELSE NULL
         END)
       RETURNING *`,
      [entityId, elementType, elementLabel, description, centroidLatStr, centroidLngStr, req.user.id],
    )

    await client.query(
      `UPDATE detection_candidates SET
         review_status = 'grouped', reviewed_by = $1, reviewed_at = NOW(),
         group_id = $2, group_confirmed_at = NOW(), group_confirmed_by = $1,
         report_id = $3, updated_at = NOW()
       WHERE id = ANY($4::uuid[])`,
      [req.user.id, groupId, report.id, candidateIds],
    )

    await audit('report', report.id, 'created', req.user,
      { source: 'grouped_media', groupId, candidateIds, memberCount: candidateIds.length }, client)

    await client.query('COMMIT')
    await enrichReportSpatially(report.id, report.location, entityId)
    res.status(201).json({ success: true, reportId: report.id, groupId, groupedCount: candidateIds.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[ingestion] group confirm error:', err)
    res.status(500).json({ error: 'Failed to confirm group' })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GIS IMPORT
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ingestion/gis/upload
// Upload a GIS file → validate geometry → create import_job with preview.
// Does NOT import features yet — user must review and confirm.
router.post('/gis/upload', requirePermission('create_report'), gisUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No GIS file uploaded' })

  const entityId = req.user.entityId ?? req.body.entity_id
  if (!entityId) return res.status(400).json({ error: 'entity_id is required' })

  const ext     = path.extname(req.file.originalname).toLowerCase()
  const jobType = GIS_TYPE_MAP[ext]
  if (!jobType) {
    return res.status(400).json({
      error:     `Unsupported format: ${ext}`,
      supported: Object.keys(GIS_TYPE_MAP).join(', '),
    })
  }

  const fieldMapping   = req.body.field_mapping ? JSON.parse(req.body.field_mapping) : {}
  const sourceCrs      = req.body.source_crs ?? null
  const layerType      = req.body.layer_type || 'reports'
  const layerName      = req.body.layer_name
  const governanceRole = req.body.governance_role ?? null
  const ownershipType  = req.body.ownership_type ?? null

  let spatialLayerId = null
  if (layerType !== 'reports') {
    if (!layerName) {
      return res.status(400).json({ error: 'layer_name is required for spatial layers' })
    }
    const { rows: [layer] } = await query(
      `INSERT INTO spatial_layers
         (entity_id, layer_name, layer_type, governance_role, ownership_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [entityId, layerName, layerType, governanceRole, ownershipType, req.user.id],
    )
    spatialLayerId = layer.id
  }

  const { rows: [job] } = await query(
    `INSERT INTO import_jobs
       (entity_id, created_by, job_type, layer_type, spatial_layer_id,
        file_name, file_path, file_size_bytes, source_crs, field_mapping, status, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'validating',NOW())
     RETURNING *`,
    [entityId, req.user.id, jobType, layerType, spatialLayerId,
     req.file.originalname, req.file.path, req.file.size, sourceCrs, JSON.stringify(fieldMapping)],
  )

  // Fire-and-forget — client polls for status
  runGISValidation(job, req.file, fieldMapping).catch(err =>
    console.error('[ingestion/gis] validation error for job', job.id, err.message)
  )

  res.status(202).json({
    jobId:   job.id,
    status:  'validating',
    message: 'GIS file received. Validation in progress — poll GET /api/ingestion/gis/jobs/:id for status.',
  })
})

// ─── GIS Validation timeout: 10 minutes ──────────────────────────────────────
const VALIDATION_TIMEOUT_MS = 10 * 60 * 1000

async function runGISValidation(job, file, fieldMapping) {
  // Hard timeout — marks the job failed if processing exceeds limit.
  const timeoutHandle = setTimeout(async () => {
    console.error('[ingestion/gis] timeout for job', job.id)
    await query(
      `UPDATE import_jobs SET status='failed',
         processing_error='تجاوز وقت المعالجة الحد المسموح (10 دقائق) — يُرجى تبسيط الملف أو تقليل عدد العناصر',
         updated_at=NOW()
       WHERE id=$1 AND status IN ('validating','importing')`,
      [job.id],
    ).catch(() => {})
  }, VALIDATION_TIMEOUT_MS)

  try {
    let result
    if (job.job_type === 'geojson')        result = await processGeoJSON(file.path, fieldMapping)
    else if (job.job_type === 'shapefile') result = await processShapefile(file.path, fieldMapping)
    else {
      await query(
        `UPDATE import_jobs SET status='failed', processing_error=$1, updated_at=NOW() WHERE id=$2`,
        [`${job.job_type} غير مدعوم — استخدم GeoJSON أو Shapefile`, job.id],
      )
      return
    }

    if (job.layer_type === 'reports') {
      // ── Bulk-insert import_features in a single transaction ──────────────────
      const client = await getClient()
      try {
        await client.query('BEGIN')
        for (const f of result.features) {
          const geomJson = (f.isValidGeometry && f.geometry) ? JSON.stringify(f.geometry) : null
          await client.query(
            `INSERT INTO import_features
               (import_job_id, entity_id, source_feature_id, feature_index, geometry, geometry_type,
                source_attributes, mapped_element_type, mapped_description,
                mapped_location_name, mapped_district, is_valid_geometry, geometry_error,
                mapped_operational, raster_images, import_status)
             VALUES ($1,$2,$3,$4,
               CASE
                 WHEN $5::text IS NOT NULL
                 THEN ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($5::text)), 4326)
                 ELSE NULL
               END,
               $6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,
               CASE WHEN $12 THEN 'validated' ELSE 'rejected' END)`,
            [
              job.id, job.entity_id, f.sourceFeatureId, f.featureIndex, geomJson, f.geometryType,
              JSON.stringify(f.sourceAttributes), f.mappedElementType, f.mappedDescription,
              f.mappedLocationName, f.mappedDistrict, f.isValidGeometry, f.geometryError,
              JSON.stringify(f.mappedOperational ?? {}), JSON.stringify(f.rasterImages ?? []),
            ],
          )
        }
        await client.query('COMMIT')
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {})
        throw txErr
      } finally {
        client.release()
      }

      const previewFeatures = result.features.filter(f => f.isValidGeometry).slice(0, 10)

      await query(
        `UPDATE import_jobs SET
           status = 'preview_ready',
           total_features = $1, valid_features = $2, invalid_features = $3,
           validation_errors = $4, preview_data = $5::jsonb,
           source_crs = COALESCE(source_crs, $6), updated_at = NOW()
         WHERE id = $7`,
        [
          result.totalCount, result.validCount, result.invalidCount,
          JSON.stringify(result.errors.slice(0, 50)),
          JSON.stringify({ features: previewFeatures, detectedCrs: result.detectedCrs }),
          result.detectedCrs, job.id,
        ],
      )

      await audit('import_job', job.id, 'gis_validated', { id: job.created_by, entityId: job.entity_id },
        { total: result.totalCount, valid: result.validCount, invalid: result.invalidCount })

    } else {
      // ── Bulk-insert spatial_layer_features in a single transaction ────────────
      const client = await getClient()
      let importedCount = 0
      try {
        await client.query('BEGIN')
        for (const f of result.features) {
          if (!f.isValidGeometry) continue
          const mo       = f.mappedOperational || {}
          const sa       = f.sourceAttributes  || {}
          const geomJson = JSON.stringify(f.geometry)

          // Feature name resolution (priority order):
          //   1. featureName if auto-detected or manually mapped
          //   2. municipality/district (Arabic: اسم_البلدية maps to municipality synonym)
          //   3. raw 'name' property — standard GeoJSON convention
          //   4. direct Arabic property names
          //   5. index fallback
          const featureName = (
            mo.featureName ||
            mo.municipality || mo.district || mo.locationName ||
            mo.description  ||
            sa.name || sa.NAME || sa.Name ||
            sa['اسم_البلدية'] || sa['اسم_الحي'] || sa['اسم_المنطقة'] || sa['اسم_العقد'] || sa['اسم'] ||
            `Feature ${f.featureIndex}`
          )
          const featureLabel  = mo.featureLabel || null
          const priorityLevel = mo.priorityLevel != null ? (parseInt(mo.priorityLevel, 10) || null) : null
          const slaHours      = mo.slaHours      != null ? (parseInt(mo.slaHours,      10) || null) : null
          const contractId    = mo.contractId    || null
          const neighborhood  = mo.district      || null
          const operNotes     = mo.remarks       || null

          await client.query(
            `INSERT INTO spatial_layer_features
               (spatial_layer_id, entity_id, feature_name, feature_label, feature_type,
                geometry, attributes,
                priority_level, sla_hours, contract_id, neighborhood, operational_notes)
             VALUES ($1, $2, $3, $4, $5,
                     ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($6::text)), 4326), $7,
                     $8::integer, $9::integer, $10, $11, $12)`,
            [
              job.spatial_layer_id, job.entity_id,
              featureName, featureLabel, f.geometryType,
              geomJson, JSON.stringify(sa),
              priorityLevel, slaHours, contractId, neighborhood, operNotes,
            ],
          )
          importedCount++
        }
        await client.query('COMMIT')
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {})
        throw txErr
      } finally {
        client.release()
      }

      await query(
        `UPDATE import_jobs SET
           status = 'completed',
           total_features = $1, imported_features = $2, completed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [result.totalCount, importedCount, job.id],
      )

      await audit('spatial_layer', job.spatial_layer_id, 'layer_imported',
        { id: job.created_by, entityId: job.entity_id },
        { total: result.totalCount, imported: importedCount },
      )
    }
  } catch (err) {
    await query(
      `UPDATE import_jobs SET status='failed', processing_error=$1, updated_at=NOW() WHERE id=$2`,
      [err.message, job.id],
    ).catch(() => {})
  } finally {
    clearTimeout(timeoutHandle)
  }
}

// GET /api/ingestion/gis/jobs
router.get('/gis/jobs', requirePermission('view_reports'), async (req, res) => {
  const scope  = buildReportScope(req.user)
  const { status, page = 1, limit = 20 } = req.query
  const offset = (page - 1) * limit

  const params = []
  let sql = `SELECT ij.*, u.full_name AS created_by_name, COUNT(*) OVER() AS total_count
             FROM import_jobs ij JOIN users u ON u.id = ij.created_by WHERE 1=1`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND ij.entity_id = $${params.length}` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND ij.created_by = $${params.length}` }
  if (status)                  { params.push(status);         sql += ` AND ij.status = $${params.length}` }

  params.push(Number(limit), Number(offset))
  sql += ` ORDER BY ij.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  res.json({ jobs: rows, total: Number(rows[0]?.total_count ?? 0), page: Number(page), limit: Number(limit) })
})

// GET /api/ingestion/gis/jobs/:id
router.get('/gis/jobs/:id', requirePermission('view_reports'), async (req, res) => {
  const { rows } = await query(
    `SELECT ij.*, u.full_name AS created_by_name
     FROM import_jobs ij JOIN users u ON u.id = ij.created_by WHERE ij.id = $1`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Import job not found' })

  const job   = rows[0]
  const scope = buildReportScope(req.user)
  if (scope.type === 'entity' && job.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  res.json({ job })
})

// GET /api/ingestion/gis/jobs/:id/features
router.get('/gis/jobs/:id/features', requirePermission('view_reports'), async (req, res) => {
  const { import_status, page = 1, limit = 50 } = req.query
  const offset = (page - 1) * limit

  const params = [req.params.id]
  let sql = `SELECT id, source_feature_id, feature_index, geometry_type,
               source_attributes, mapped_element_type, mapped_description,
               mapped_location_name, mapped_district,
               is_valid_geometry, geometry_error, import_status, report_id,
               ST_AsGeoJSON(geometry)::json AS geometry_geojson,
               COUNT(*) OVER() AS total_count
             FROM import_features WHERE import_job_id = $1`

  if (import_status) { params.push(import_status); sql += ` AND import_status = $${params.length}` }

  params.push(Number(limit), Number(offset))
  sql += ` ORDER BY feature_index ASC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  res.json({ features: rows, total: Number(rows[0]?.total_count ?? 0), page: Number(page), limit: Number(limit) })
})

// PATCH /api/ingestion/gis/features/:id/reject
router.patch('/gis/features/:id/reject', requirePermission('create_report'), async (req, res) => {
  const { reason } = req.body ?? {}
  const { rows } = await query(
    `UPDATE import_features SET import_status='rejected', updated_at=NOW()
     WHERE id=$1 AND import_status='validated' RETURNING id, import_job_id, entity_id`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Feature not found or cannot be rejected' })
  await audit('import_feature', req.params.id, 'gis_feature_rejected', req.user, { reason })
  res.json({ success: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// GIS INTAKE QUEUE — per-feature human review before report creation
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ingestion/gis/intake
// Returns import_features with status='validated' that have not yet been converted
// to reports (report_id IS NULL). These are the "GIS candidates" awaiting human review.
router.get('/gis/intake', requirePermission('view_reports'), async (req, res) => {
  const scope = buildReportScope(req.user)
  const { import_job_id, page = 1, limit = 50 } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  const params = []
  let sql = `
    SELECT imf.*,
           ij.file_name     AS job_file_name,
           ij.layer_type    AS job_layer_type,
           ij.field_mapping AS job_field_mapping,
           ij.created_at    AS job_created_at,
           u.full_name      AS job_created_by_name,
           ST_AsGeoJSON(imf.geometry)::json AS geometry_geojson,
           ST_Y(ST_Centroid(imf.geometry))  AS centroid_lat,
           ST_X(ST_Centroid(imf.geometry))  AS centroid_lng,
           COUNT(*) OVER()  AS total_count
    FROM import_features imf
    JOIN import_jobs ij ON ij.id = imf.import_job_id
    JOIN users u        ON u.id  = ij.created_by
    WHERE imf.import_status = 'validated'
      AND imf.report_id IS NULL
      AND ij.layer_type = 'reports'
  `

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND ij.entity_id = $${params.length}` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND ij.created_by = $${params.length}` }
  if (import_job_id)           { params.push(import_job_id);  sql += ` AND imf.import_job_id = $${params.length}` }

  params.push(Number(limit), offset)
  sql += ` ORDER BY ij.created_at DESC, imf.feature_index ASC
           LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await query(sql, params)
  res.json({
    features: rows,
    total: Number(rows[0]?.total_count ?? 0),
    page: Number(page),
    limit: Number(limit),
  })
})

// POST /api/ingestion/gis/features/:id/confirm
// Human confirms a single GIS feature → creates one draft report.
// Mirrors the media candidate confirm flow.
router.post('/gis/features/:id/confirm', requirePermission('create_report'), async (req, res) => {
  const { elementType, elementLabel, description, notes } = req.body
  const client = await getClient()

  try {
    await client.query('BEGIN')

    const { rows: [feature] } = await client.query(
      `SELECT imf.*, ij.entity_id AS job_entity_id, ij.layer_type
       FROM import_features imf
       JOIN import_jobs ij ON ij.id = imf.import_job_id
       WHERE imf.id = $1 FOR UPDATE OF imf`,
      [req.params.id],
    )
    if (!feature) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Feature not found' })
    }
    if (feature.import_status !== 'validated') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Feature is not in validated state', status: feature.import_status })
    }
    if (feature.report_id) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Feature already has a report' })
    }

    const scope = buildReportScope(req.user)
    if (scope.type === 'entity' && feature.job_entity_id !== scope.entityId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Forbidden', code: 'ENTITY_MISMATCH' })
    }

    // Compute centroid from PostGIS
    const { rows: [geo] } = await client.query(
      `SELECT ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lng
       FROM import_features WHERE id = $1`,
      [feature.id],
    )
    const latitude  = geo?.lat != null ? String(geo.lat)  : null
    const longitude = geo?.lng != null ? String(geo.lng) : null

    const mo = feature.mapped_operational || {}
    const reportNumber = await nextReportNumber(client)
    const { rows: [report] } = await client.query(
      `INSERT INTO reports
         (entity_id, import_feature_id, ingestion_source, element_id, element_label,
          status, description, location_name, district, gps_lat, gps_lng, created_by,
          gis_external_id, gis_contractor, gis_agency, gis_severity,
          gis_violation_type, gis_observation_date, gis_notes, gis_operational_metadata,
          report_number, municipality, priority,
          location)
       VALUES ($1,$2,'gis_import',$3,$4,'draft',$5,$6,$7,
               $8::double precision,$9::double precision,$10,
               $11,$12,$13,$14,$15,$16,$17,$18::jsonb,
               $19,$20,$21,
         CASE
           WHEN $8::double precision IS NOT NULL AND $9::double precision IS NOT NULL
           THEN ST_SetSRID(ST_MakePoint($9::double precision,$8::double precision),4326)
           ELSE NULL
         END)
       RETURNING id, location`,
      [
        feature.job_entity_id, feature.id,
        elementType ?? feature.mapped_element_type,
        elementLabel ?? feature.mapped_element_type,
        description ?? feature.mapped_description,
        feature.mapped_location_name, feature.mapped_district,
        latitude, longitude, req.user.id,
        mo.externalId || null, mo.contractor || null, mo.agency || null, mo.severity || null,
        mo.violationCategory || mo.violationType || null,
        mo.observationDate || null, mo.remarks || null,
        JSON.stringify(mo),
        reportNumber, mo.municipality || null, mo.priorityLevel || null,
      ],
    )

    await client.query(
      `UPDATE import_features SET import_status='imported', report_id=$1, updated_at=NOW() WHERE id=$2`,
      [report.id, feature.id],
    )

    await audit('import_feature', feature.id, 'gis_feature_confirmed', req.user,
      { reportId: report.id, reportNumber, elementType: elementType ?? feature.mapped_element_type, notes }, client)
    await audit('report', report.id, 'created', req.user,
      { source: 'gis_import', importFeatureId: feature.id, reviewedIndividually: true }, client)

    await client.query('COMMIT')
    await enrichReportSpatially(report.id, report.location, feature.job_entity_id)
    await attachRasterImages(report.id, feature.raster_images, req.user.id, null)
    res.status(201).json({ success: true, reportId: report.id, reportNumber, report })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[ingestion/gis] feature confirm error:', err)
    res.status(500).json({ error: 'Failed to confirm GIS feature' })
  } finally {
    client.release()
  }
})

// POST /api/ingestion/gis/features/bulk-confirm
// Bulk-confirm multiple validated GIS features → creates one report per feature.
router.post('/gis/features/bulk-confirm', requirePermission('create_report'), async (req, res) => {
  const { featureIds } = req.body
  if (!Array.isArray(featureIds) || featureIds.length === 0) {
    return res.status(400).json({ error: 'featureIds array is required' })
  }

  const scope = buildReportScope(req.user)
  const { rows: features } = await query(
    `SELECT imf.*, ij.entity_id AS job_entity_id
     FROM import_features imf
     JOIN import_jobs ij ON ij.id = imf.import_job_id
     WHERE imf.id = ANY($1::uuid[]) AND imf.import_status = 'validated' AND imf.report_id IS NULL`,
    [featureIds],
  )

  let confirmed = 0
  const errors = []

  for (const feature of features) {
    if (scope.type === 'entity' && feature.job_entity_id !== scope.entityId) continue

    const client = await getClient()
    try {
      await client.query('BEGIN')

      const { rows: [geo] } = await client.query(
        `SELECT ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lng
         FROM import_features WHERE id = $1`, [feature.id],
      )
      const lat = geo?.lat != null ? String(geo.lat) : null
      const lng = geo?.lng != null ? String(geo.lng) : null

      const bmo = feature.mapped_operational || {}
      const bulkReportNumber = await nextReportNumber(client)
      const { rows: [report] } = await client.query(
        `INSERT INTO reports
           (entity_id, import_feature_id, ingestion_source, element_id, element_label,
            status, description, location_name, district, gps_lat, gps_lng, created_by,
            gis_external_id, gis_contractor, gis_agency, gis_severity,
            gis_violation_type, gis_observation_date, gis_notes, gis_operational_metadata,
            report_number, municipality, priority,
            location)
         VALUES ($1,$2,'gis_import',$3,$4,'draft',$5,$6,$7,
                 $8::double precision,$9::double precision,$10,
                 $11,$12,$13,$14,$15,$16,$17,$18::jsonb,
                 $19,$20,$21,
           CASE WHEN $8::double precision IS NOT NULL AND $9::double precision IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint($9::double precision,$8::double precision),4326)
                ELSE NULL END)
         RETURNING id, location`,
        [feature.job_entity_id, feature.id, feature.mapped_element_type, feature.mapped_element_type,
         feature.mapped_description, feature.mapped_location_name, feature.mapped_district,
         lat, lng, req.user.id,
         bmo.externalId || null, bmo.contractor || null, bmo.agency || null, bmo.severity || null,
         bmo.violationCategory || bmo.violationType || null,
         bmo.observationDate || null, bmo.remarks || null,
         JSON.stringify(bmo),
         bulkReportNumber, bmo.municipality || null, bmo.priorityLevel || null],
      )

      await client.query(
        `UPDATE import_features SET import_status='imported', report_id=$1, updated_at=NOW() WHERE id=$2`,
        [report.id, feature.id],
      )
      await audit('report', report.id, 'created', req.user,
        { source: 'gis_import', importFeatureId: feature.id, bulkConfirmed: true, reportNumber: bulkReportNumber }, client)

      await client.query('COMMIT')
      await enrichReportSpatially(report.id, report.location, feature.job_entity_id)
      await attachRasterImages(report.id, feature.raster_images, req.user.id, null)
      confirmed++
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      errors.push({ featureId: feature.id, error: err.message })
    } finally {
      client.release()
    }
  }

  await audit('import_feature', randomUUID(), 'gis_bulk_confirmed', req.user,
    { confirmed, errors: errors.length, total: featureIds.length, featureIds })

  res.json({
    success: true,
    confirmed,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    message: `${confirmed} بلاغ مسودة تم إنشاؤه من مراجعة قائمة GIS.`,
  })
})

// POST /api/ingestion/gis/features/bulk-reject
// Soft-reject multiple validated GIS features (marks as 'rejected', keeps audit trail).
router.post('/gis/features/bulk-reject', requirePermission('create_report'), async (req, res) => {
  const { featureIds, reason } = req.body
  if (!Array.isArray(featureIds) || featureIds.length === 0) {
    return res.status(400).json({ error: 'featureIds array is required' })
  }

  const scope = buildReportScope(req.user)
  const params = [featureIds]
  let sql = `UPDATE import_features AS imf
             SET import_status = 'rejected', updated_at = NOW()
             FROM import_jobs AS ij
             WHERE imf.import_job_id = ij.id
               AND imf.id          = ANY($1::uuid[])
               AND imf.import_status = 'validated'
               AND imf.report_id   IS NULL`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND ij.entity_id = $${params.length}::uuid` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND ij.created_by = $${params.length}::uuid` }
  sql += ' RETURNING imf.id'

  const { rows } = await query(sql, params)

  if (rows.length > 0) {
    await audit('import_feature', randomUUID(), 'gis_bulk_rejected', req.user,
      { reason, rejected: rows.length, featureIds: rows.map(r => r.id) })
  }

  res.json({ success: true, rejected: rows.length })
})

// POST /api/ingestion/gis/features/bulk-delete
// Hard-delete multiple GIS intake features before any report has been created.
// Only removes features where report_id IS NULL (never deletes confirmed features).
router.post('/gis/features/bulk-delete', requirePermission('create_report'), async (req, res) => {
  const { featureIds } = req.body
  if (!Array.isArray(featureIds) || featureIds.length === 0) {
    return res.status(400).json({ error: 'featureIds array is required' })
  }

  const scope = buildReportScope(req.user)
  const params = [featureIds]
  let sql = `DELETE FROM import_features AS imf
             USING import_jobs AS ij
             WHERE imf.import_job_id = ij.id
               AND imf.id          = ANY($1::uuid[])
               AND imf.report_id   IS NULL`

  if (scope.type === 'entity') { params.push(scope.entityId); sql += ` AND ij.entity_id = $${params.length}::uuid` }
  if (scope.type === 'user')   { params.push(scope.userId);   sql += ` AND ij.created_by = $${params.length}::uuid` }
  sql += ' RETURNING imf.id'

  const { rows } = await query(sql, params)

  if (rows.length > 0) {
    await audit('import_feature', randomUUID(), 'gis_bulk_deleted', req.user,
      { deleted: rows.length, featureIds: rows.map(r => r.id) })
  }

  res.json({ success: true, deleted: rows.length })
})

// PATCH /api/ingestion/gis/jobs/:id/remap
// Re-applies a new field mapping to all validated features of a job.
// Called when the user adjusts field assignments after seeing the preview.
// Does NOT re-upload or re-validate geometry — only recalculates mapped values.
router.patch('/gis/jobs/:id/remap', requirePermission('create_report'), async (req, res) => {
  const { fieldMapping } = req.body
  if (!fieldMapping || typeof fieldMapping !== 'object') {
    return res.status(400).json({ error: 'fieldMapping object is required' })
  }

  const { rows: [job] } = await query(`SELECT * FROM import_jobs WHERE id = $1`, [req.params.id])
  if (!job) return res.status(404).json({ error: 'Import job not found' })

  const scope = buildReportScope(req.user)
  if (scope.type === 'entity' && job.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  if (job.status !== 'preview_ready') {
    return res.status(409).json({ error: 'يمكن إعادة تعيين الحقول فقط في مرحلة المعاينة', status: job.status })
  }

  // Persist updated field_mapping on the job
  await query(`UPDATE import_jobs SET field_mapping=$1::jsonb, updated_at=NOW() WHERE id=$2`,
    [JSON.stringify(fieldMapping), job.id])

  // Re-process all validated features of this job
  const { rows: features } = await query(
    `SELECT id, source_attributes FROM import_features WHERE import_job_id=$1 AND import_status='validated'`,
    [job.id],
  )

  let updated = 0
  for (const feat of features) {
    const props = typeof feat.source_attributes === 'string'
      ? JSON.parse(feat.source_attributes)
      : (feat.source_attributes ?? {})

    const effectiveMapping  = buildEffectiveMapping(props, fieldMapping)
    const mapped            = applyFieldMapping(props, effectiveMapping)
    const rasterImages      = extractRasterAttributes(props)

    await query(
      `UPDATE import_features SET
         mapped_element_type=$1, mapped_description=$2, mapped_location_name=$3,
         mapped_district=$4, mapped_operational=$5::jsonb, raster_images=$6::jsonb,
         updated_at=NOW()
       WHERE id=$7`,
      [
        mapped.elementType, mapped.description, mapped.locationName,
        mapped.district, JSON.stringify(mapped), JSON.stringify(rasterImages),
        feat.id,
      ],
    )
    updated++
  }

  // Rebuild preview_data with freshly-mapped features (up to 10)
  const { rows: previewFeats } = await query(
    `SELECT feature_index, geometry_type, source_attributes,
            mapped_element_type, mapped_description, is_valid_geometry
     FROM import_features
     WHERE import_job_id=$1 AND import_status='validated' AND is_valid_geometry=true
     ORDER BY feature_index ASC LIMIT 10`,
    [job.id],
  )

  await query(
    `UPDATE import_jobs SET preview_data=jsonb_set(COALESCE(preview_data,'{}'), '{features}', $1::jsonb), updated_at=NOW() WHERE id=$2`,
    [JSON.stringify(previewFeats), job.id],
  )

  await audit('import_job', job.id, 'gis_remapped', req.user, { fieldMapping, updated })
  res.json({ success: true, updated, message: `تم إعادة تعيين ${updated} عنصر بالتعيين الجديد` })
})

// POST /api/ingestion/gis/jobs/:id/import
// Import validated GIS features as draft reports.
// GIS imports are operational spatial datasets — each feature becomes a governable draft report.
router.post('/gis/jobs/:id/import', requirePermission('create_report'), async (req, res) => {
  const { featureIds, importAll = true, importLimit, importOffset = 0 } = req.body

  const { rows: [job] } = await query(`SELECT * FROM import_jobs WHERE id = $1`, [req.params.id])
  if (!job) return res.status(404).json({ error: 'Import job not found' })
  if (job.status !== 'preview_ready') {
    return res.status(409).json({ error: 'Import job not ready for import', status: job.status })
  }

  const scope = buildReportScope(req.user)
  if (scope.type === 'entity' && job.entity_id !== scope.entityId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  await query(`UPDATE import_jobs SET status='importing', updated_at=NOW() WHERE id=$1`, [job.id])

  const params = [job.id]
  let featureSql = `SELECT * FROM import_features
                    WHERE import_job_id = $1 AND import_status = 'validated' AND is_valid_geometry = true`
  if (!importAll && Array.isArray(featureIds) && featureIds.length > 0) {
    params.push(featureIds)
    featureSql += ` AND id = ANY($${params.length}::uuid[])`
  } else if (!importAll && importLimit != null) {
    const lim = Math.max(1, Number(importLimit))
    const off = Math.max(0, Number(importOffset))
    params.push(lim, off)
    featureSql += ` ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`
  }

  const { rows: features } = await query(featureSql, params)

  let importedCount = 0
  const importErrors = []

  for (const feature of features) {
    try {
      // Compute centroid inside PostgreSQL for consistency with geometry column
      const { rows: [geo] } = await query(
        `SELECT ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lng
         FROM import_features WHERE id = $1`,
        [feature.id],
      )

      const latitude = geo?.lat != null ? String(geo.lat) : null
      const longitude = geo?.lng != null ? String(geo.lng) : null

      const jmo = feature.mapped_operational || {}
      const jobReportNumber = await nextReportNumber(null)
      const { rows: [report] } = await query(
        `INSERT INTO reports
           (entity_id, import_feature_id, ingestion_source, element_id, element_label,
            status, description, location_name, district, gps_lat, gps_lng, created_by,
            gis_external_id, gis_contractor, gis_agency, gis_severity,
            gis_violation_type, gis_observation_date, gis_notes, gis_operational_metadata,
            report_number, municipality, priority,
            location)
         VALUES ($1,$2,'gis_import',$3,$3,'draft',$4,$5,$6,
                 $7::double precision,$8::double precision,$9,
                 $10,$11,$12,$13,$14,$15,$16,$17::jsonb,
                 $18,$19,$20,
           CASE
             WHEN $7::double precision IS NOT NULL AND $8::double precision IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint($8::double precision,$7::double precision),4326)
             ELSE NULL
           END)
         RETURNING id, location`,
        [
          job.entity_id, feature.id,
          feature.mapped_element_type, feature.mapped_description,
          feature.mapped_location_name, feature.mapped_district,
          latitude, longitude, job.created_by,
          jmo.externalId || null, jmo.contractor || null, jmo.agency || null, jmo.severity || null,
          jmo.violationCategory || jmo.violationType || null,
          jmo.observationDate || null, jmo.remarks || null,
          JSON.stringify(jmo),
          jobReportNumber, jmo.municipality || null, jmo.priorityLevel || null,
        ],
      )

      await enrichReportSpatially(report.id, report.location, job.entity_id)
      await attachRasterImages(report.id, feature.raster_images, job.created_by, null)

      await query(
        `UPDATE import_features SET import_status='imported', report_id=$1, updated_at=NOW() WHERE id=$2`,
        [report.id, feature.id],
      )

      await audit('report', report.id, 'created', req.user,
        { source: 'gis_import', importJobId: job.id, featureId: feature.id, reportNumber: jobReportNumber })
      importedCount++
    } catch (err) {
      console.error('[ingestion/gis] feature import error:', feature.id, err.message)
      importErrors.push({ featureId: feature.id, error: err.message })
      await query(
        `UPDATE import_features SET import_status='rejected', updated_at=NOW() WHERE id=$1`,
        [feature.id],
      ).catch(() => {})
    }
  }

  await query(
    `UPDATE import_jobs SET status='completed', imported_features=$1, completed_at=NOW(), updated_at=NOW()
     WHERE id=$2`,
    [importedCount, job.id],
  )

  await audit('import_job', job.id, 'gis_imported', req.user, {
    importedCount, errorCount: importErrors.length,
  })

  res.json({
    success:       true,
    importedCount,
    errorCount:    importErrors.length,
    errors:        importErrors.slice(0, 10),
    message:       `${importedCount} draft report(s) created from GIS import. Review in Reports Basket.`,
  })
})

// GET /api/ingestion/spatial-layers
// Returns all active spatial layers with their features as GeoJSON FeatureCollections.
// Used by the interactive map to dynamically render imported operational layers.
router.get('/spatial-layers', requirePermission('view_reports'), async (req, res) => {
  const scope = buildReportScope(req.user)

  const params = []
  let sql = `
    SELECT sl.*,
           COUNT(slf.id) FILTER (WHERE slf.id IS NOT NULL) AS feature_count,
           COALESCE(
             json_agg(
               json_build_object(
                 'type', 'Feature',
                 'geometry', ST_AsGeoJSON(slf.geometry)::json,
                 'properties', json_build_object(
                   'id',                slf.id,
                   'feature_name',      slf.feature_name,
                   'feature_type',      slf.feature_type,
                   'attributes',        slf.attributes,
                   'priority_level',    slf.priority_level,
                   'contract_id',       slf.contract_id,
                   'sla_hours',         slf.sla_hours,
                   'operational_notes', slf.operational_notes
                 )
               ) ORDER BY slf.id
             ) FILTER (WHERE slf.id IS NOT NULL),
             '[]'::json
           ) AS features
    FROM spatial_layers sl
    LEFT JOIN spatial_layer_features slf
      ON slf.spatial_layer_id = sl.id AND slf.is_active = true
    WHERE sl.is_active = true
  `

  if (scope.type === 'entity') {
    params.push(scope.entityId)
    sql += ` AND sl.entity_id = $${params.length}`
  } else if (scope.type === 'user') {
    params.push(scope.userId)
    sql += ` AND sl.entity_id = (SELECT entity_id FROM users WHERE id = $${params.length})`
  }

  sql += ` GROUP BY sl.id ORDER BY sl.layer_priority DESC, sl.created_at DESC`

  const { rows } = await query(sql, params)

  const layers = rows.map(l => ({
    id:              l.id,
    name:            l.layer_name,
    type:            l.layer_type,
    governanceRole:  l.governance_role,
    ownershipType:   l.ownership_type,
    priority:        l.layer_priority,
    description:     l.description,
    featureCount:    Number(l.feature_count ?? 0),
    createdAt:       l.created_at,
    entityId:        l.entity_id,
    featureCollection: {
      type: 'FeatureCollection',
      features: l.features ?? [],
    },
  }))

  res.json({ layers, total: layers.length })
})

// DELETE /api/ingestion/spatial-layers/:id
// Admin-only: hard-deletes a single spatial layer and all its features.
router.delete('/spatial-layers/:id', requirePermission('view_reports'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_ONLY' })
  }

  const { rows } = await query(
    `SELECT id, layer_name FROM spatial_layers WHERE id = $1`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Layer not found' })

  await query(`UPDATE import_jobs SET spatial_layer_id = NULL WHERE spatial_layer_id = $1`, [req.params.id])
  await query(`DELETE FROM spatial_layer_features WHERE spatial_layer_id = $1`, [req.params.id])
  await query(`DELETE FROM spatial_layers WHERE id = $1`, [req.params.id])

  await audit('spatial_layer', req.params.id, 'deleted', req.user, { layer_name: rows[0].layer_name })
  res.json({ success: true, id: req.params.id })
})

// DELETE /api/ingestion/spatial-layers
// Admin-only: bulk-deletes all spatial layers, or a specific set by `ids` array in body.
router.delete('/spatial-layers', requirePermission('view_reports'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_ONLY' })
  }

  const { ids } = req.body ?? {}
  let layerIds

  if (Array.isArray(ids) && ids.length > 0) {
    const { rows } = await query(
      `SELECT id FROM spatial_layers WHERE id = ANY($1::uuid[])`,
      [ids],
    )
    layerIds = rows.map(r => r.id)
  } else {
    const { rows } = await query(`SELECT id FROM spatial_layers`, [])
    layerIds = rows.map(r => r.id)
  }

  if (!layerIds.length) return res.json({ success: true, deleted: 0 })

  await query(`UPDATE import_jobs SET spatial_layer_id = NULL WHERE spatial_layer_id = ANY($1::uuid[])`, [layerIds])
  await query(`DELETE FROM spatial_layer_features WHERE spatial_layer_id = ANY($1::uuid[])`, [layerIds])
  await query(`DELETE FROM spatial_layers WHERE id = ANY($1::uuid[])`, [layerIds])

  await audit('spatial_layer', randomUUID(), 'bulk_deleted', req.user, { count: layerIds.length, ids: layerIds })
  res.json({ success: true, deleted: layerIds.length })
})

export default router
