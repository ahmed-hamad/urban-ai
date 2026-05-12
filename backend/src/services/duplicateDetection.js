// Duplicate Detection Service
// Finds spatial + temporal + semantic duplicates between:
//   (a) observations (external datasets) and reports
//   (b) reports vs reports (cross-source internal duplicates)
// Uses PostGIS ST_DWithin for spatial matching — no frontend geometry.

import { randomUUID } from 'crypto'
import { query, getClient } from './db.js'

// ─── Matching rule loader ─────────────────────────────────────────────────────

async function getMatchRules(entityId) {
  const { rows } = await query(
    `SELECT * FROM duplicate_match_rules
     WHERE entity_id = $1::uuid OR is_default = TRUE
     ORDER BY entity_id NULLS LAST
     LIMIT 1`,
    [entityId || null],
  )
  const r = rows[0] ?? {
    distance_threshold_m: 20,
    time_threshold_days:  30,
    min_confidence:       0.5,
    weight_distance:      0.50,
    weight_time:          0.35,
    weight_element:       0.15,
  }
  return {
    distanceM:       Number(r.distance_threshold_m),
    timeDays:        Number(r.time_threshold_days),
    minConfidence:   Number(r.min_confidence),
    wDistance:       Number(r.weight_distance),
    wTime:           Number(r.weight_time),
    wElement:        Number(r.weight_element),
  }
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function calcDistanceScore(distM, thresholdM) {
  if (distM == null || distM > thresholdM) return 0
  return 1 - distM / thresholdM
}

function calcTimeScore(diffDays, thresholdDays) {
  if (diffDays == null || diffDays > thresholdDays) return 0
  return 1 - diffDays / thresholdDays
}

function calcElementScore(obsElement, reportElement) {
  if (!obsElement || !reportElement) return 0
  return obsElement.toLowerCase().trim() === reportElement.toLowerCase().trim() ? 1 : 0
}

function calcConfidence(distanceScore, timeScore, elementScore, weights) {
  return (
    weights.wDistance * distanceScore +
    weights.wTime     * timeScore     +
    weights.wElement  * elementScore
  )
}

// ─── Scan observation layer against all reports ───────────────────────────────

export async function scanObservationLayer(layerId, entityId) {
  const rules   = await getMatchRules(entityId)
  const scanId  = randomUUID()
  let inserted  = 0
  let matchedObs = new Set()

  const { rows: observations } = await query(
    `SELECT id, element_type, observed_at,
            ST_X(ST_Centroid(geometry)) AS lng,
            ST_Y(ST_Centroid(geometry)) AS lat
     FROM observations WHERE layer_id = $1`,
    [layerId],
  )

  for (const obs of observations) {
    if (obs.lat == null || obs.lng == null) continue

    // Find reports within spatial + temporal window
    const { rows: candidates } = await query(
      `SELECT
         r.id,
         r.element_id,
         r.created_at,
         ST_Distance(
           ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)::geography,
           ST_SetSRID(ST_MakePoint(r.gps_lng::double precision, r.gps_lat::double precision), 4326)::geography
         ) AS distance_m,
         EXTRACT(EPOCH FROM ABS(r.created_at - $3::timestamptz)) / 86400.0 AS time_diff_days
       FROM reports r
       WHERE r.gps_lat IS NOT NULL AND r.gps_lng IS NOT NULL
         AND r.status NOT IN ('rejected')
         AND ST_DWithin(
           ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)::geography,
           ST_SetSRID(ST_MakePoint(r.gps_lng::double precision, r.gps_lat::double precision), 4326)::geography,
           $4::double precision
         )
         AND ($3::timestamptz IS NULL OR
              ABS(EXTRACT(EPOCH FROM r.created_at - $3::timestamptz)) / 86400.0 <= $5::double precision)`,
      [obs.lng, obs.lat, obs.observed_at || null, rules.distanceM, rules.timeDays],
    )

    for (const cand of candidates) {
      const distScore    = calcDistanceScore(Number(cand.distance_m), rules.distanceM)
      const timeScore    = calcTimeScore(Number(cand.time_diff_days ?? 0), rules.timeDays)
      const elemScore    = calcElementScore(obs.element_type, cand.element_id)
      const confidence   = calcConfidence(distScore, timeScore, elemScore, rules)

      if (confidence < rules.minConfidence) continue

      await query(
        `INSERT INTO duplicate_candidates
           (source_type, source_observation_id, matched_report_id,
            confidence, distance_score, time_score, element_score,
            distance_m, time_diff_days, scan_id)
         VALUES ('observation', $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source_observation_id, source_report_id, matched_report_id) DO UPDATE
           SET confidence = EXCLUDED.confidence,
               distance_score = EXCLUDED.distance_score,
               time_score = EXCLUDED.time_score,
               element_score = EXCLUDED.element_score,
               scan_id = EXCLUDED.scan_id,
               scanned_at = NOW()`,
        [obs.id, cand.id, confidence, distScore, timeScore, elemScore,
         cand.distance_m, cand.time_diff_days ?? 0, scanId],
      )
      inserted++
      matchedObs.add(obs.id)
    }
  }

  // Update per-observation best confidence
  await query(
    `UPDATE observations o
     SET best_confidence   = sub.best_conf,
         matched_report_id = sub.report_id
     FROM (
       SELECT source_observation_id AS oid,
              MAX(confidence)       AS best_conf,
              (array_agg(matched_report_id ORDER BY confidence DESC))[1] AS report_id
       FROM duplicate_candidates
       WHERE source_type = 'observation'
         AND source_observation_id IN (
           SELECT id FROM observations WHERE layer_id = $1
         )
       GROUP BY source_observation_id
     ) sub
     WHERE o.id = sub.oid`,
    [layerId],
  )

  // Update layer match count
  await query(
    `UPDATE observation_layers
     SET matched_count = $1, updated_at = NOW()
     WHERE id = $2`,
    [matchedObs.size, layerId],
  )

  return { scanId, candidatesInserted: inserted, matchedObservations: matchedObs.size }
}

// ─── Scan internal report duplicates (cross-source) ──────────────────────────

export async function scanInternalDuplicates(entityId) {
  const rules  = await getMatchRules(entityId)
  const scanId = randomUUID()
  let inserted = 0

  // Compare each report against reports from different sources within window
  const { rows } = await query(
    `SELECT
       r1.id AS src_id,
       r1.element_id AS src_element,
       r1.created_at AS src_created,
       r1.ingestion_source AS src_source,
       r2.id AS match_id,
       r2.element_id AS match_element,
       r2.ingestion_source AS match_source,
       ST_Distance(
         ST_SetSRID(ST_MakePoint(r1.gps_lng::double precision, r1.gps_lat::double precision), 4326)::geography,
         ST_SetSRID(ST_MakePoint(r2.gps_lng::double precision, r2.gps_lat::double precision), 4326)::geography
       ) AS distance_m,
       EXTRACT(EPOCH FROM ABS(r1.created_at - r2.created_at)) / 86400.0 AS time_diff_days
     FROM reports r1
     JOIN reports r2
       ON r1.id < r2.id
       AND r1.ingestion_source != r2.ingestion_source
       AND r1.gps_lat IS NOT NULL AND r1.gps_lng IS NOT NULL
       AND r2.gps_lat IS NOT NULL AND r2.gps_lng IS NOT NULL
       AND r1.status NOT IN ('rejected') AND r2.status NOT IN ('rejected')
       AND ST_DWithin(
         ST_SetSRID(ST_MakePoint(r1.gps_lng::double precision, r1.gps_lat::double precision), 4326)::geography,
         ST_SetSRID(ST_MakePoint(r2.gps_lng::double precision, r2.gps_lat::double precision), 4326)::geography,
         $1::double precision
       )
       AND ABS(EXTRACT(EPOCH FROM r1.created_at - r2.created_at)) / 86400.0 <= $2::double precision
     WHERE ($3::uuid IS NULL OR r1.entity_id = $3::uuid)`,
    [rules.distanceM, rules.timeDays, entityId || null],
  )

  for (const row of rows) {
    const distScore  = calcDistanceScore(Number(row.distance_m), rules.distanceM)
    const timeScore  = calcTimeScore(Number(row.time_diff_days), rules.timeDays)
    const elemScore  = calcElementScore(row.src_element, row.match_element)
    const confidence = calcConfidence(distScore, timeScore, elemScore, rules)

    if (confidence < rules.minConfidence) continue

    await query(
      `INSERT INTO duplicate_candidates
         (source_type, source_report_id, matched_report_id,
          confidence, distance_score, time_score, element_score,
          distance_m, time_diff_days, scan_id)
       VALUES ('report', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source_observation_id, source_report_id, matched_report_id) DO UPDATE
         SET confidence = EXCLUDED.confidence,
             scan_id = EXCLUDED.scan_id,
             scanned_at = NOW()`,
      [row.src_id, row.match_id, confidence, distScore, timeScore, elemScore,
       row.distance_m, row.time_diff_days, scanId],
    )
    inserted++
  }

  return { scanId, candidatesInserted: inserted }
}

// ─── Public query helpers used by routes ─────────────────────────────────────

export async function listDuplicateCandidates({ entityId, status, layerId, limit = 50, offset = 0 }) {
  const params = []
  const where  = ['1=1']

  if (status) { params.push(status); where.push(`dc.status = $${params.length}`) }
  if (layerId) {
    params.push(layerId)
    where.push(`dc.source_observation_id IN (SELECT id FROM observations WHERE layer_id = $${params.length})`)
  }

  params.push(limit, offset)

  const { rows } = await query(
    `SELECT
       dc.id, dc.source_type, dc.source_observation_id, dc.source_report_id,
       dc.matched_report_id, dc.confidence,
       dc.distance_score, dc.time_score, dc.element_score,
       dc.distance_m, dc.time_diff_days,
       dc.status, dc.reviewed_by, dc.reviewed_at, dc.review_notes,
       dc.scanned_at,
       -- source report info (for report-vs-report)
       sr.element_id   AS src_element,
       sr.location_name AS src_location,
       sr.created_at   AS src_created,
       sr.ingestion_source AS src_source,
       -- matched report info
       mr.element_id   AS match_element,
       mr.location_name AS match_location,
       mr.status       AS match_status,
       mr.gps_lat      AS match_lat,
       mr.gps_lng      AS match_lng,
       mr.ingestion_source AS match_source,
       -- observation info (for obs-vs-report)
       obs.element_type AS obs_element,
       obs.location_name AS obs_location,
       obs.observed_at   AS obs_observed_at,
       ol.name          AS obs_layer_name,
       ol.source_name   AS obs_source_name
     FROM duplicate_candidates dc
     LEFT JOIN reports    sr  ON sr.id  = dc.source_report_id
     LEFT JOIN reports    mr  ON mr.id  = dc.matched_report_id
     LEFT JOIN observations obs ON obs.id = dc.source_observation_id
     LEFT JOIN observation_layers ol ON ol.id = obs.layer_id
     WHERE ${where.join(' AND ')}
     ORDER BY dc.confidence DESC, dc.scanned_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return rows
}

export async function getDuplicateStats(entityId) {
  const [totals, byStatus] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'confirmed_duplicate') AS confirmed,
              COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
              AVG(confidence) AS avg_confidence
       FROM duplicate_candidates`,
    ),
    query(
      `SELECT status, COUNT(*) AS count
       FROM duplicate_candidates
       GROUP BY status`,
    ),
  ])
  return {
    total:      Number(totals.rows[0].total),
    pending:    Number(totals.rows[0].pending),
    confirmed:  Number(totals.rows[0].confirmed),
    rejected:   Number(totals.rows[0].rejected),
    avgConfidence: totals.rows[0].avg_confidence ? Number(totals.rows[0].avg_confidence).toFixed(2) : null,
    byStatus:   byStatus.rows,
  }
}
