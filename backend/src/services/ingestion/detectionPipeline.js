// AI Detection Pipeline
//
// Orchestrates:
//   File → AI Gateway (provider-agnostic) → Element Mapping → detection_candidates (DB)
//
// Governance rules (enforced here):
//   - AI never creates reports — only detection_candidates
//   - Every candidate requires human confirmation before a report is created
//   - Entity assignment is done by the human reviewer, not by AI
//   - AI confidence scores are advisory only
//   - All detections pass through element_detection_mapping before DB insertion
//
// Provider selection: set AI_VISION_PROVIDER in .env
//   claude_vision  (default) — Anthropic Claude Vision API
//   yolo           (Phase 2) — Python FastAPI + YOLOv8 ONNX microservice

import { query } from '../db.js'
import { detectViolations, getActiveProviderKey, getActiveModel } from '../ai/aiGateway.js'
import { applyMappings } from './elementMappingService.js'

export const PIPELINE_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  COMPLETED:      'completed',
  NO_DETECTIONS:  'no_detections',
  FAILED:         'failed',
})

// Analyze a single image file using the active AI provider.
// Applies element mapping to every detection before writing to DB.
// Creates one detection_candidate per detected element.
// Returns immediately — does NOT block the HTTP response chain in the caller.
export async function analyzeImage(mediaIngestionId, filePath, options = {}) {
  const providerKey = getActiveProviderKey()
  const model       = getActiveModel()
  const mimeType    = options.mimeType ?? 'image/jpeg'

  let rawDetections
  try {
    rawDetections = await detectViolations(filePath, mimeType, options)
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED' || err.code === 'UNSUPPORTED_MIME') {
      return {
        status:       PIPELINE_STATUS.NOT_CONFIGURED,
        message:      err.message,
        candidateIds: [],
      }
    }
    console.error('[detection] provider error:', err.message)
    await query(
      `UPDATE media_ingestions SET processing_status = 'failed', processing_error = $2 WHERE id = $1`,
      [mediaIngestionId, err.message],
    ).catch(() => {})
    return { status: PIPELINE_STATUS.FAILED, error: err.message, candidateIds: [] }
  }

  if (rawDetections.length === 0) {
    await query(
      `UPDATE media_ingestions SET processing_status = 'processed', processed_at = NOW() WHERE id = $1`,
      [mediaIngestionId],
    )
    return { status: PIPELINE_STATUS.NO_DETECTIONS, candidateIds: [] }
  }

  // Apply element mapping layer: AI labels → UrbanAI elements → regulatory elements
  const detections = await applyMappings(rawDetections, providerKey)

  const candidateIds = []
  for (const det of detections) {
    const conf = det.confidence != null ? String(det.confidence) : null

    // Validate and normalise bbox: [x%, y%, w%, h%] all 0–100
    let bbox = null
    if (Array.isArray(det.bbox) && det.bbox.length === 4 &&
        det.bbox.every(v => typeof v === 'number' && v >= 0 && v <= 100)) {
      bbox = det.bbox.map(v => Math.round(v * 10) / 10)
    }

    try {
      const { rows: [candidate] } = await query(
        `INSERT INTO detection_candidates
           (media_ingestion_id, detection_source, detection_model, detection_confidence,
            ai_provider,
            suggested_element_type, suggested_element_label,
            mapping_id, mapped_urban_element_id, mapped_urban_element_label,
            mapped_regulatory_element_id,
            gps_lat, gps_lng, location)
         VALUES ($1, $2, $3, $4::decimal,
                 $5,
                 $6, $7,
                 $8, $9, $10,
                 $11,
                 $12::double precision, $13::double precision,
                 CASE
                   WHEN $12::double precision IS NOT NULL
                    AND $13::double precision IS NOT NULL
                   THEN ST_SetSRID(ST_MakePoint($13::double precision, $12::double precision), 4326)
                   ELSE NULL
                 END)
         RETURNING id`,
        [
          mediaIngestionId,
          providerKey === 'claude_vision' ? 'ai_vision' : providerKey,
          model,
          conf,
          providerKey,
          det.element_type,
          det.label,
          det.mapping_id,
          det.mapped_urban_element_id,
          det.mapped_urban_element_label,
          det.mapped_regulatory_element_id,
          options.gpsLat ?? null,
          options.gpsLng ?? null,
        ],
      )

      // Store bbox in a separate UPDATE for forward-compatibility
      if (bbox !== null) {
        await query(
          `UPDATE detection_candidates SET detection_bbox = $1::jsonb WHERE id = $2`,
          [JSON.stringify(bbox), candidate.id],
        ).catch(() => {})
      }

      candidateIds.push(candidate.id)
    } catch (err) {
      console.error('[detection] candidate insert error:', err.message, det)
    }
  }

  await query(
    `UPDATE media_ingestions SET processing_status = 'processed', processed_at = NOW() WHERE id = $1`,
    [mediaIngestionId],
  )

  return {
    status:         PIPELINE_STATUS.COMPLETED,
    candidateIds,
    candidateCount: candidateIds.length,
    model,
    provider:       providerKey,
  }
}

// Stub kept for future queue-based integration (e.g., Celery, BullMQ)
export async function submitForDetection(mediaIngestionId, _options = {}) {
  return {
    status:          PIPELINE_STATUS.NOT_CONFIGURED,
    message:         'Queue-based pipeline not yet configured.',
    mediaIngestionId,
    queueJobId:      null,
  }
}

// Stub kept for future server-side video frame extraction pipeline
export async function extractVideoFrames(mediaIngestionId, _options = {}) {
  return {
    status:       PIPELINE_STATUS.NOT_CONFIGURED,
    message:      'Video frame extraction not yet configured.',
    mediaIngestionId,
    frameCount:   0,
    framePaths:   [],
  }
}
