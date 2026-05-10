import { Router }   from 'express'
import multer        from 'multer'
import path          from 'path'
import { mkdir }     from 'fs/promises'
import { randomUUID } from 'crypto'
import { requirePermission, buildReportScope } from '../middleware/auth.js'
import { query, getClient } from '../services/db.js'
import { extractMetadata, classifyFileType }   from '../services/ingestion/mediaProcessor.js'
import { processGeoJSON, processShapefile }    from '../services/ingestion/gisProcessor.js'
import { suggestGroups, describeGroup }        from '../services/ingestion/candidateGrouper.js'
import { enrichReportSpatially } from '../services/spatialGovernance.js'

const router = Router()

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
// Human reviews and confirms a candidate → creates a draft report.
// This is the ONLY path from candidate to report for media-based ingestion.
router.patch('/candidates/:id/confirm', requirePermission('create_report'), async (req, res) => {
  const { elementType, elementLabel, description, notes } = req.body
  const client = await getClient()

  try {
    await client.query('BEGIN')

    const { rows: [candidate] } = await client.query(
      `SELECT * FROM detection_candidates WHERE id = $1 FOR UPDATE`,
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

async function runGISValidation(job, file, fieldMapping) {
  try {
    let result
    if (job.job_type === 'geojson')   result = await processGeoJSON(file.path, fieldMapping)
    else if (job.job_type === 'shapefile') result = await processShapefile(file.path, fieldMapping)
    else {
      await query(
        `UPDATE import_jobs SET status='failed', processing_error=$1, updated_at=NOW() WHERE id=$2`,
        [`${job.job_type} is not yet supported. Use GeoJSON (.geojson) or Shapefile (.shp).`, job.id],
      )
      return
    }

    if (job.layer_type === 'reports') {
      // Insert to import_features for report creation workflow
      for (const f of result.features) {
        const geomJson = (f.isValidGeometry && f.geometry) ? JSON.stringify(f.geometry) : null
        await query(
          `INSERT INTO import_features
             (import_job_id, entity_id, source_feature_id, feature_index, geometry, geometry_type,
              source_attributes, mapped_element_type, mapped_description,
              mapped_location_name, mapped_district, is_valid_geometry, geometry_error, import_status)
           VALUES ($1,$2,$3,$4,
             CASE
               WHEN $5::text IS NOT NULL
               THEN ST_SetSRID(
                 ST_Force2D(ST_GeomFromGeoJSON($5::text)),
                 4326
               )
               ELSE NULL
             END,
             $6,$7,$8,$9,$10,$11,$12,$13,
             CASE WHEN $12 THEN 'validated' ELSE 'rejected' END)`,
          [
            job.id, job.entity_id, f.sourceFeatureId, f.featureIndex, geomJson, f.geometryType,
            JSON.stringify(f.sourceAttributes), f.mappedElementType, f.mappedDescription,
            f.mappedLocationName, f.mappedDistrict, f.isValidGeometry, f.geometryError,
          ],
        )
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
      // Insert directly to spatial_layer_features for operational layers
      let importedCount = 0
      for (const f of result.features) {
        if (!f.isValidGeometry) continue
        const geomJson = JSON.stringify(f.geometry)
        await query(
          `INSERT INTO spatial_layer_features
             (spatial_layer_id, entity_id, feature_name, feature_type, geometry, attributes)
           VALUES ($1, $2, $3, $4, ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($5::text)), 4326), $6)`,
          [
            job.spatial_layer_id, job.entity_id,
            f.mappedDescription || f.sourceAttributes.name || `Feature ${f.featureIndex}`,
            f.geometryType, geomJson, JSON.stringify(f.sourceAttributes),
          ],
        )
        importedCount++
      }

      await query(
        `UPDATE import_jobs SET
           status = 'completed',
           total_features = $1, imported_features = $2, completed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [result.totalCount, importedCount, job.id],
      )

      await audit('spatial_layer', job.spatial_layer_id, 'layer_imported', { id: job.created_by, entityId: job.entity_id },
        { total: result.totalCount, imported: importedCount })
    }
  } catch (err) {
    await query(
      `UPDATE import_jobs SET status='failed', processing_error=$1, updated_at=NOW() WHERE id=$2`,
      [err.message, job.id],
    )
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
  const { rows } = await query(
    `UPDATE import_features SET import_status='rejected', updated_at=NOW()
     WHERE id=$1 AND import_status='validated' RETURNING id`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Feature not found or cannot be rejected' })
  res.json({ success: true })
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

      const { rows: [report] } = await query(
        `INSERT INTO reports
           (entity_id, import_feature_id, ingestion_source, element_id, element_label,
            status, description, location_name, district, gps_lat, gps_lng, created_by,
            location)
         VALUES ($1,$2,'gis_import',$3,$3,'draft',$4,$5,$6,$7::double precision,$8::double precision,$9,
           CASE
             WHEN $7::double precision IS NOT NULL
             AND $8::double precision IS NOT NULL
             THEN ST_SetSRID(
               ST_MakePoint(
                 $8::double precision,
                 $7::double precision
               ),
               4326
             )
             ELSE NULL
           END)
         RETURNING id, location`,
        [
          job.entity_id, feature.id,
          feature.mapped_element_type, feature.mapped_description,
          feature.mapped_location_name, feature.mapped_district,
          latitude, longitude, job.created_by,
        ],
      )

      await enrichReportSpatially(report.id, report.location, job.entity_id)

      await query(
        `UPDATE import_features SET import_status='imported', report_id=$1, updated_at=NOW() WHERE id=$2`,
        [report.id, feature.id],
      )

      await audit('report', report.id, 'created', req.user,
        { source: 'gis_import', importJobId: job.id, featureId: feature.id })
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

  await audit('spatial_layer', 'bulk', 'deleted', req.user, { count: layerIds.length, ids: layerIds })
  res.json({ success: true, deleted: layerIds.length })
})

export default router
