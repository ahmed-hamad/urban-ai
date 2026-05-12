// Observation Analysis Layers API
// External observation datasets (e.g. عدسة بلدي) imported as analysis-only layers.
// These are NOT reports — they are used for duplicate/correlation analysis.

import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { readFile } from 'fs/promises'
import { requirePermission } from '../middleware/auth.js'
import { query, getClient } from '../services/db.js'
import { processGeoJSON, processShapefile } from '../services/ingestion/gisProcessor.js'
import { scanObservationLayer } from '../services/duplicateDetection.js'

const router = Router()

// Returns an ISO string if the value is a parseable date, otherwise null.
function parseSafeDate(val) {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

const upload = multer({
  dest: 'uploads/observations/',
  limits: { fileSize: 50 * 1024 * 1024 },
})

// ─── List layers ──────────────────────────────────────────────────────────────

router.get('/', requirePermission('view_reports'), async (req, res) => {
  const { entityId, role } = req.user
  const params = []
  let where = ''

  if (role !== 'admin' && role !== 'executive' && entityId) {
    params.push(entityId)
    where = `WHERE ol.entity_id = $1::uuid`
  }

  const { rows } = await query(
    `SELECT ol.id, ol.name, ol.source_name, ol.format, ol.total_count,
            ol.matched_count, ol.status, ol.distance_threshold_m, ol.time_threshold_days,
            ol.created_at, ol.updated_at,
            u.full_name AS created_by_name
     FROM observation_layers ol
     LEFT JOIN users u ON u.id = ol.created_by
     ${where}
     ORDER BY ol.created_at DESC`,
    params,
  )
  res.json({ layers: rows })
})

// ─── Get single layer with observation list ───────────────────────────────────

router.get('/:id', requirePermission('view_reports'), async (req, res) => {
  const layerId = req.params.id

  const [layerRes, obsRes] = await Promise.all([
    query(`SELECT * FROM observation_layers WHERE id = $1`, [layerId]),
    query(
      `SELECT id, source_id, element_type, description, location_name,
              district, observed_at, severity,
              centroid_lat, centroid_lng,
              best_confidence, matched_report_id
       FROM observations WHERE layer_id = $1
       ORDER BY best_confidence DESC NULLS LAST`,
      [layerId],
    ),
  ])

  if (!layerRes.rows.length) return res.status(404).json({ error: 'Layer not found' })

  res.json({ layer: layerRes.rows[0], observations: obsRes.rows })
})

// ─── Upload + import observation file ────────────────────────────────────────

router.post('/upload', requirePermission('gis_access'), upload.single('file'), async (req, res) => {
  const { name, sourceName, distanceThreshold, timeThreshold, fieldMapping } = req.body
  const { entityId, id: userId, role } = req.user

  if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' })
  if (!name)     return res.status(400).json({ error: 'اسم الطبقة مطلوب' })

  const resolvedEntityId = (role === 'admin' && req.body.entityId) ? req.body.entityId : entityId
  const fm = fieldMapping ? JSON.parse(fieldMapping) : {}

  const ext = path.extname(req.file.originalname).toLowerCase()
  let result
  try {
    if (ext === '.geojson' || ext === '.json') {
      result = await processGeoJSON(req.file.path, fm)
    } else if (ext === '.shp') {
      result = await processShapefile(req.file.path, fm)
    } else {
      return res.status(400).json({ error: 'الصيغة غير مدعومة. استخدم GeoJSON أو Shapefile' })
    }
  } catch (err) {
    return res.status(422).json({ error: `خطأ في قراءة الملف: ${err.message}` })
  }

  // Persist layer + observations in a transaction
  const client = await getClient()
  let layer
  try {
    await client.query('BEGIN')

    const { rows: [lay] } = await client.query(
      `INSERT INTO observation_layers
         (name, source_name, format, total_count, entity_id, created_by,
          distance_threshold_m, time_threshold_days, file_path)
       VALUES ($1, $2, $3, $4, $5::uuid, $6::uuid, $7, $8, $9)
       RETURNING *`,
      [
        name.trim(),
        sourceName?.trim() || null,
        ext.slice(1),
        result.totalCount,
        resolvedEntityId || null,
        userId,
        Number(distanceThreshold) || 20,
        Number(timeThreshold) || 30,
        req.file.path,
      ],
    )
    layer = lay

    for (const f of result.features) {
      if (!f.isValidGeometry || !f.geometry) continue
      const mo = f.mappedOperational || {}

      await client.query(
        `INSERT INTO observations
           (layer_id, entity_id, geometry, centroid_lat, centroid_lng,
            source_id, element_type, description, location_name, district,
            observed_at, severity, source_attributes)
         VALUES ($1, $2::uuid,
           ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)),
           $4::double precision, $5::double precision,
           $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          layer.id,
          resolvedEntityId || null,
          JSON.stringify(f.geometry),
          f.centroidLat, f.centroidLng,
          mo.externalId || f.sourceFeatureId || null,
          mo.elementType || null,
          mo.description || null,
          mo.locationName || null,
          mo.district || null,
          parseSafeDate(mo.observationDate),
          mo.severity || null,
          JSON.stringify(f.sourceAttributes || {}),
        ],
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
    return res.status(500).json({ error: `فشل الاستيراد: ${err.message}` })
  }
  client.release()

  res.status(201).json({
    layer,
    imported: result.totalCount,
    valid:    result.validCount,
    invalid:  result.invalidCount,
    message:  'تم استيراد الطبقة. يمكنك الآن تشغيل تحليل التكرار.',
  })
})

// ─── Trigger duplicate scan for a layer ──────────────────────────────────────

router.post('/:id/scan', requirePermission('gis_access'), async (req, res) => {
  const layerId = req.params.id
  const { entityId } = req.user

  const { rows } = await query(`SELECT id, entity_id FROM observation_layers WHERE id = $1`, [layerId])
  if (!rows.length) return res.status(404).json({ error: 'Layer not found' })

  const scanEntityId = rows[0].entity_id || entityId

  // Run scan asynchronously — return immediately with scan ID
  const scanPromise = scanObservationLayer(layerId, scanEntityId)
  scanPromise
    .then(r => {
      query(
        `UPDATE observation_layers SET updated_at = NOW() WHERE id = $1`,
        [layerId],
      ).catch(() => {})
    })
    .catch(err => {
      console.error(`[observations] scan failed for layer ${layerId}:`, err.message)
    })

  res.json({ message: 'بدأ التحليل في الخلفية', layerId })
})

// ─── Scan result / status ─────────────────────────────────────────────────────

router.get('/:id/scan-results', requirePermission('view_reports'), async (req, res) => {
  const layerId = req.params.id

  const [layerRes, statsRes] = await Promise.all([
    query(
      `SELECT id, name, total_count, matched_count, updated_at FROM observation_layers WHERE id = $1`,
      [layerId],
    ),
    query(
      `SELECT dc.status, COUNT(*) AS count, AVG(dc.confidence) AS avg_confidence
       FROM duplicate_candidates dc
       JOIN observations obs ON obs.id = dc.source_observation_id
       WHERE obs.layer_id = $1
       GROUP BY dc.status`,
      [layerId],
    ),
  ])

  if (!layerRes.rows.length) return res.status(404).json({ error: 'Layer not found' })

  res.json({ layer: layerRes.rows[0], stats: statsRes.rows })
})

// ─── Archive / delete layer ───────────────────────────────────────────────────

router.delete('/:id', requirePermission('gis_access'), async (req, res) => {
  const { rows } = await query(
    `UPDATE observation_layers SET status = 'archived', updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [req.params.id],
  )
  if (!rows.length) return res.status(404).json({ error: 'Layer not found' })
  res.json({ success: true, archived: req.params.id })
})

export default router
