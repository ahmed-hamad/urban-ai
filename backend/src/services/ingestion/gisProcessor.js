// GIS Ingestion Processor
// Parses GeoJSON and Shapefile formats, validates geometries, applies field mapping.
// All output uses WGS84 (EPSG:4326). PostGIS handles reprojection for other CRS.

import { readFile } from 'fs/promises'

let shapefile = null
try {
  const mod = await import('shapefile')
  shapefile = mod.default ?? mod
} catch {
  console.warn('[gisProcessor] shapefile package not installed — .shp support disabled')
}

const VALID_GEOMETRY_TYPES = new Set([
  'Point', 'MultiPoint',
  'LineString', 'MultiLineString',
  'Polygon', 'MultiPolygon',
  'GeometryCollection',
])

// ─── Public API ───────────────────────────────────────────────────────────────

export async function processGeoJSON(filePath, fieldMapping = {}) {
  const raw = await readFile(filePath, 'utf-8')

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('GeoJSON file contains invalid JSON')
  }

  let features = normalizeToFeatures(data)
  const detectedCrs = detectGeoJSONCRS(data)

  return buildResults(features, fieldMapping, detectedCrs)
}

export async function processShapefile(shpPath, fieldMapping = {}) {
  if (!shapefile) {
    throw new Error('Shapefile support requires the "shapefile" npm package')
  }

  const features = []
  const source = await shapefile.open(shpPath)

  while (true) {
    const { done, value } = await source.read()
    if (done) break
    features.push({
      type: 'Feature',
      geometry:   value.geometry,
      properties: value.properties ?? {},
    })
  }

  const detectedCrs = await detectShapefileCRS(shpPath)
  return buildResults(features, fieldMapping, detectedCrs)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeToFeatures(data) {
  if (data.type === 'FeatureCollection') return data.features ?? []
  if (data.type === 'Feature')           return [data]
  if (VALID_GEOMETRY_TYPES.has(data.type)) {
    return [{ type: 'Feature', geometry: data, properties: {} }]
  }
  throw new Error(`Unsupported GeoJSON root type: ${data.type}`)
}

function detectGeoJSONCRS(data) {
  // Old GeoJSON spec (pre-RFC 7946) may include a crs member
  const name = data?.crs?.properties?.name
  if (name) return name
  return 'EPSG:4326' // RFC 7946 mandates WGS84
}

async function detectShapefileCRS(shpPath) {
  const prjPath = shpPath.replace(/\.shp$/i, '.prj')
  try {
    const wkt = await readFile(prjPath, 'utf-8')
    if (wkt.includes('WGS_1984') || wkt.includes('GCS_WGS_1984') || wkt.includes('WGS84')) {
      return 'EPSG:4326'
    }
    return `WKT:${wkt.trim().slice(0, 80)}`
  } catch {
    return 'EPSG:4326' // assume WGS84 when no .prj
  }
}

function buildResults(features, fieldMapping, detectedCrs) {
  const results    = []
  const errors     = []
  let   validCount = 0
  let   invalidCount = 0

  for (let i = 0; i < features.length; i++) {
    const feature    = features[i]
    const validation = validateGeometry(feature.geometry)
    const mapped     = applyFieldMapping(feature.properties ?? {}, fieldMapping)
    const centroid   = validation.valid ? extractCentroid(feature.geometry) : null

    if (validation.valid) validCount++
    else {
      invalidCount++
      errors.push({ featureIndex: i, error: validation.error })
    }

    results.push({
      featureIndex:       i,
      sourceFeatureId:    String(feature.id ?? feature.properties?.id ?? i),
      geometry:           feature.geometry,
      geometryType:       feature.geometry?.type ?? null,
      sourceAttributes:   feature.properties ?? {},
      mappedElementType:  mapped.elementType,
      mappedDescription:  mapped.description,
      mappedLocationName: mapped.locationName,
      mappedDistrict:     mapped.district,
      mappedOperational:  mapped,
      isValidGeometry:    validation.valid,
      geometryError:      validation.error ?? null,
      centroidLat:        centroid?.lat ?? null,
      centroidLng:        centroid?.lng ?? null,
    })
  }

  return { features: results, totalCount: features.length, validCount, invalidCount, errors, detectedCrs }
}

function validateGeometry(geom) {
  if (!geom)                         return { valid: false, error: 'Missing geometry' }
  if (!VALID_GEOMETRY_TYPES.has(geom.type))
    return { valid: false, error: `Unknown geometry type: ${geom.type}` }
  if (!geom.coordinates && geom.type !== 'GeometryCollection')
    return { valid: false, error: 'Missing coordinates' }
  if (!Array.isArray(geom.coordinates))
    return { valid: false, error: 'Coordinates must be an array' }

  if (geom.type === 'Point') {
    if (geom.coordinates.length < 2)
      return { valid: false, error: 'Point requires [lng, lat]' }
    const [lng, lat] = geom.coordinates
    if (lat < -90  || lat > 90)  return { valid: false, error: `Invalid latitude: ${lat}` }
    if (lng < -180 || lng > 180) return { valid: false, error: `Invalid longitude: ${lng}` }
  }

  return { valid: true, error: null }
}

function applyFieldMapping(properties, fieldMapping) {
  const get = (key) => (key && properties[key] != null ? String(properties[key]) : null)
  return {
    // Basic — dedicated columns in import_features
    elementType:       get(fieldMapping.elementType),
    description:       get(fieldMapping.description),
    locationName:      get(fieldMapping.locationName),
    district:          get(fieldMapping.district),
    // Identity
    externalId:        get(fieldMapping.externalId),
    sourceSystemId:    get(fieldMapping.sourceSystemId),
    referenceNo:       get(fieldMapping.referenceNo),
    // Geographic / Administrative
    municipality:      get(fieldMapping.municipality),
    subdistrict:       get(fieldMapping.subdistrict),
    street:            get(fieldMapping.street),
    // Operational
    contractor:        get(fieldMapping.contractor),
    contractId:        get(fieldMapping.contractId),
    agency:            get(fieldMapping.agency),
    assetId:           get(fieldMapping.assetId),
    // Violation
    violationType:     get(fieldMapping.violationType),
    violationCategory: get(fieldMapping.violationCategory),
    severity:          get(fieldMapping.severity),
    fineAmount:        get(fieldMapping.fineAmount),
    priorityLevel:     get(fieldMapping.priorityLevel),
    sourceStatus:      get(fieldMapping.sourceStatus),
    // Dates
    observationDate:   get(fieldMapping.observationDate),
    inspectionDate:    get(fieldMapping.inspectionDate),
    deadlineDate:      get(fieldMapping.deadlineDate),
    // Additional
    ownerName:         get(fieldMapping.ownerName),
    ownerContact:      get(fieldMapping.ownerContact),
    inspectorName:     get(fieldMapping.inspectorName),
    remarks:           get(fieldMapping.remarks),
  }
}

function extractCentroid(geom) {
  if (!geom?.coordinates) return null

  switch (geom.type) {
    case 'Point':
      return { lng: geom.coordinates[0], lat: geom.coordinates[1] }

    case 'MultiPoint':
    case 'LineString': {
      const pts = geom.coordinates
      if (!pts.length) return null
      const mid = pts[Math.floor(pts.length / 2)]
      return { lng: mid[0], lat: mid[1] }
    }

    case 'Polygon': {
      const ring = geom.coordinates[0]
      if (!ring?.length) return null
      const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length
      return { lng, lat }
    }

    case 'MultiPolygon': {
      const firstRing = geom.coordinates[0]?.[0]
      if (!firstRing?.length) return null
      const lng = firstRing.reduce((s, p) => s + p[0], 0) / firstRing.length
      const lat = firstRing.reduce((s, p) => s + p[1], 0) / firstRing.length
      return { lng, lat }
    }

    default:
      return null
  }
}

export { validateGeometry, extractCentroid }
