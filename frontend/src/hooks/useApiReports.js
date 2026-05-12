import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

// Maps a numeric priority_level (1–4) to the string key used by UI config
const PRIORITY_MAP = { 4: 'critical', 3: 'high', 2: 'medium', 1: 'low' }

// Build an absolute URL for a file stored under the uploads directory.
function uploadUrl(filePath) {
  if (!filePath) return null
  const relative = String(filePath).replace(/^uploads[/\\]/, '')
  return `${API}/uploads/${relative}`
}

// Normalize a DB report row into the shape expected by map/basket/detail components.
export function normalizeApiReport(r) {
  const hasCoords = r.gps_lat != null && r.gps_lng != null
  const priority = r.priority_level != null
    ? (PRIORITY_MAP[r.priority_level] ?? 'medium')
    : null

  // ── Build media array ────────────────────────────────────────────────────
  // Primary source: report_media entries (set for confirmed media candidates)
  const attachments = Array.isArray(r.media_attachments) ? r.media_attachments : []
  const beforeMedia = attachments
    .filter(m => m.phase !== 'after')
    .map(m => ({ url: uploadUrl(m.file_path), file_type: m.file_type, phase: m.phase }))

  const afterMedia = attachments
    .filter(m => m.phase === 'after')
    .map(m => ({ url: uploadUrl(m.file_path), file_type: m.file_type, phase: 'after' }))

  // Fallback: if no report_media yet, surface the candidate's source file (images only)
  if (beforeMedia.length === 0 && r.candidate_file_path && r.candidate_file_type === 'image') {
    beforeMedia.push({
      url: uploadUrl(r.candidate_file_path),
      file_type: 'image',
      phase: 'before',
    })
  }

  // ── GIS source attributes (raw) ──────────────────────────────────────────
  const gisAttributes = r.gis_source_attributes
    ? (typeof r.gis_source_attributes === 'string'
        ? JSON.parse(r.gis_source_attributes)
        : r.gis_source_attributes)
    : null

  // ── GIS mapped operational fields ────────────────────────────────────────
  const gisMapped = r.gis_mapped_operational
    ? (typeof r.gis_mapped_operational === 'string'
        ? JSON.parse(r.gis_mapped_operational)
        : r.gis_mapped_operational)
    : null

  const gisOpMeta = r.gis_operational_metadata
    ? (typeof r.gis_operational_metadata === 'string'
        ? JSON.parse(r.gis_operational_metadata)
        : r.gis_operational_metadata)
    : gisMapped

  return {
    // identity
    id:            r.id,
    fromApi:       true,

    // display labels
    title:         r.element_label || r.element_id || 'بلاغ مستورد',
    elementName:   r.element_label || r.element_id || 'بلاغ مستورد',
    element:       r.element_id    || '',
    elementLabel:  r.element_label || '',
    elementColor:  '#3B82F6',

    // location
    coords:        hasCoords ? [parseFloat(r.gps_lat), parseFloat(r.gps_lng)] : null,
    district:      r.district      || r.location_name || '',
    locationName:  r.location_name || '',

    // status / workflow
    status:        r.status,
    closureType:   r.closure_type  || null,
    closureNotes:  r.closure_notes || '',
    source:        r.ingestion_source,
    ingestion_source: r.ingestion_source,

    // assignment
    entity:        r.entity_id     || '',
    entityId:      r.entity_id     || '',
    assignedTo:    r.assigned_to   || null,
    assignedToName: r.assigned_to_name || '',
    created_by_name: r.created_by_name || '',

    // spatial enrichment
    municipalityId: r.municipality_id || null,
    districtId:    r.district_id   || null,
    neighborhood:  r.neighborhood  || '',
    contractId:    r.contract_id   || null,
    priority:      priority,
    priorityLevel: r.priority_level != null ? Number(r.priority_level) : null,
    slaHours:      r.sla_hours != null ? Number(r.sla_hours) : null,

    // fine / violation
    estimatedFine: r.estimated_fine ? parseFloat(r.estimated_fine) : 0,
    violationCount: 0,
    articles:      [],

    // content
    description:   r.description   || '',
    notes:         r.closure_notes || '',

    // ── media (images/video attached to this report) ─────────────────────
    media:         beforeMedia,
    afterPhotos:   afterMedia,

    // ── GIS provenance ────────────────────────────────────────────────────
    gisSourceAttributes:    gisAttributes,
    gisElementType:         r.gis_element_type  || null,
    gisDescription:         r.gis_description   || null,
    gisGeometry:            r.gis_geometry_geojson || null,
    gisMappedOperational:   gisMapped,

    // ── GIS operational enterprise fields ─────────────────────────────────
    gisExternalId:          r.gis_external_id      || gisMapped?.externalId      || null,
    gisContractor:          r.gis_contractor        || gisMapped?.contractor       || null,
    gisAgency:              r.gis_agency            || gisMapped?.agency           || null,
    gisSeverity:            r.gis_severity          || gisMapped?.severity         || null,
    gisViolationType:       r.gis_violation_type    || gisMapped?.violationType    || null,
    gisObservationDate:     r.gis_observation_date  || gisMapped?.observationDate  || null,
    gisNotes:               r.gis_notes             || gisMapped?.remarks          || null,
    gisOperationalMetadata: gisOpMeta,

    // ── Capture timestamp (from candidate media) ──────────────────────────
    captureTimestamp: r.candidate_capture_timestamp || null,

    // timestamps
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

/**
 * Fetches a paginated list of reports from the backend API.
 * @param {object} params  Query-string filters, e.g. { status: 'draft', ingestion_source: 'gis_import' }
 */
export function useApiReports(params = {}) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const paramKey = JSON.stringify(params)

  useEffect(() => {
    if (!user?.token) { setReports([]); return }

    let cancelled = false
    setLoading(true)

    const qs = new URLSearchParams({ limit: '200', ...params }).toString()
    fetch(`${API}/api/reports?${qs}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (!cancelled) {
          setReports(data.reports ?? [])
          setError(null)
        }
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token, paramKey])

  return { reports, loading, error }
}

/**
 * Fetches a single report by ID from the backend API.
 * Pass refreshKey to trigger a manual re-fetch (increment it).
 * Pass null as id to skip fetching.
 */
export function useApiReportById(id, refreshKey = 0) {
  const { user } = useAuth()
  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!id || !user?.token) { setReport(null); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`${API}/api/reports/${id}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (!cancelled && data.report) setReport(normalizeApiReport(data.report))
      })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [id, user?.token, refreshKey])

  return { report, loading, error }
}

/**
 * Fetches the audit log for a single report from the backend API.
 * Pass null as id to skip fetching.
 */
export function useApiReportAudit(id, refreshKey = 0) {
  const { user } = useAuth()
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id || !user?.token) { setLogs([]); return }

    let cancelled = false
    setLoading(true)

    fetch(`${API}/api/reports/${id}/audit`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setLogs(data.logs ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [id, user?.token, refreshKey])

  return { logs, loading }
}

/**
 * Fetches active spatial layers (with GeoJSON features) from the backend API.
 * Used by GISMap to dynamically render imported operational layers.
 */
export function useApiSpatialLayers() {
  const { user } = useAuth()
  const [layers, setLayers]   = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.token) { setLayers([]); return }

    let cancelled = false
    setLoading(true)

    fetch(`${API}/api/ingestion/spatial-layers`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setLayers(data.layers ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [user?.token])

  return { layers, loading }
}
