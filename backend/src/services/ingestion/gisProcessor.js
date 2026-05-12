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

// ─── Known synonyms for each semantic field ───────────────────────────────────
// Order matters: first match wins. Arabic and English variants both listed.
const FIELD_SYNONYMS = {
  elementType: [
    'عنصر_التشوه', 'عنصر التشوه', 'نوع_التشوه', 'نوع التشوه', 'العنصر',
    'element_type', 'elementtype', 'violation_element', 'element', 'type',
  ],
  violationCategory: [
    'تصنيف_الجهة', 'تصنيف الجهة', 'نوع_الجهة', 'نوع الجهة', 'تصنيف',
    'entity_type', 'entity_class', 'entity_classification',
    'violation_category', 'violationcategory', 'category',
  ],
  agency: [
    'الوكالة', 'الجهة', 'اسم_الجهة', 'اسم الجهة', 'الجهة_المسؤولة',
    'agency', 'responsible_party', 'responsible_entity', 'owner',
  ],
  municipality: [
    'البلدية', 'المنطقة', 'اسم_البلدية', 'اسم البلدية',
    'municipality', 'region', 'area', 'admin_area', 'municipality_name',
  ],
  priorityLevel: [
    'منطقة_الأولوية', 'منطقة الأولوية', 'الأولوية', 'مستوى_الأولوية',
    'priority_zone', 'priority_level', 'priority', 'prioritylevel',
  ],
  description: [
    'الوصف', 'وصف', 'وصف_المخالفة', 'تفاصيل',
    'description', 'notes', 'remarks', 'comment',
  ],
  locationName: [
    'اسم_الموقع', 'الموقع', 'العنوان', 'الشارع',
    'location_name', 'location', 'address', 'street_name',
  ],
  district: [
    'الحي', 'حي', 'المنطقة_الفرعية',
    'district', 'neighborhood', 'subdistrict',
  ],
  externalId: [
    'المعرف_الخارجي', 'الرقم_المرجعي', 'رقم_مرجعي',
    'external_id', 'external_ref', 'ref_no', 'source_id', 'id',
  ],
  severity: [
    'الخطورة', 'درجة_الخطورة', 'الشدة',
    'severity', 'severity_level', 'risk_level',
  ],
  contractor: [
    'المقاول', 'المقاول_المسؤول', 'اسم_المقاول',
    'contractor', 'contractor_name',
  ],
  observationDate: [
    'تاريخ_الرصد', 'تاريخ_المشاهدة', 'تاريخ_الإخطار',
    'observation_date', 'date_observed', 'report_date', 'date',
  ],
  inspectorName: [
    'اسم_المفتش', 'المفتش', 'المراقب',
    'inspector_name', 'inspector', 'observer',
  ],
  remarks: [
    'ملاحظات', 'ملاحظة', 'إضافات',
    'remarks', 'additional_notes', 'extra_notes',
  ],
  // ── Spatial layer governance fields (municipalities, districts, priority_zones, contracts) ──
  featureName: [
    'اسم_البلدية', 'اسم البلدية', 'اسم_الحي', 'اسم الحي',
    'اسم_المنطقة', 'اسم المنطقة', 'اسم_العقد', 'اسم العقد', 'اسم',
    'name', 'feature_name', 'layer_name', 'zone_name', 'title', 'label',
  ],
  featureLabel: [
    'الاسم_الرسمي', 'الاسم الرسمي', 'الاسم_المعتمد',
    'feature_label', 'display_name', 'official_name', 'alt_name',
  ],
  slaHours: [
    'ساعات_SLA', 'ساعات SLA', 'ساعات_الاستجابة', 'ساعات الاستجابة', 'مدة_SLA',
    'sla_hours', 'sla', 'response_hours', 'response_time_hours',
  ],
  contractId: [
    'رقم_العقد', 'رقم العقد', 'معرف_العقد', 'مرجع_العقد',
    'contract_id', 'contract_no', 'contract_ref', 'contract_number',
  ],
}

// Image attribute names — values are extracted as raster attachments
const IMAGE_ATTR_NAMES = new Set([
  'صورة', 'صور', 'تصوير', 'الصورة', 'المرفق', 'رابط_الصورة',
  'صورة_المخالفة', 'صورة_الموقع', 'مرفق_صورة',
  'image', 'photo', 'picture', 'image_url', 'photo_url',
  'raster', 'attachment', 'media', 'thumbnail', 'photo_link',
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
  const name = data?.crs?.properties?.name
  if (name) return name
  return 'EPSG:4326'
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
    return 'EPSG:4326'
  }
}

// Build an effective fieldMapping by merging explicit mapping with auto-detected synonyms.
// Auto-detection only fills keys that are not already explicitly mapped.
function buildEffectiveMapping(properties, explicitMapping) {
  const keys = Object.keys(properties).map(k => k.trim())
  const effective = { ...explicitMapping }

  for (const [semanticKey, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (effective[semanticKey]) continue  // explicit mapping wins

    for (const synonym of synonyms) {
      // Case-insensitive, whitespace-tolerant match
      const match = keys.find(k =>
        k.toLowerCase().replace(/\s+/g, '_') === synonym.toLowerCase().replace(/\s+/g, '_')
      )
      if (match) {
        effective[semanticKey] = match
        break
      }
    }
  }

  return effective
}

// Extract any raster/image attribute values from feature properties.
// Returns array of { attrName, value } for URL-valued image attributes.
export function extractRasterAttributes(properties) {
  const images = []
  for (const [key, value] of Object.entries(properties)) {
    const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_')
    if (!IMAGE_ATTR_NAMES.has(normalizedKey) && !IMAGE_ATTR_NAMES.has(key.trim())) continue
    if (typeof value !== 'string' || !value.trim()) continue
    const val = value.trim()
    if (val.startsWith('http://') || val.startsWith('https://')) {
      images.push({ attrName: key, url: val })
    }
  }
  return images
}

function buildResults(features, fieldMapping, detectedCrs) {
  const results    = []
  const errors     = []
  let   validCount = 0
  let   invalidCount = 0

  // Compute field mapping once — all features in the same file share the same property schema.
  // Calling buildEffectiveMapping per-feature is O(N × synonyms × keys); this is O(1).
  const firstProps = features[0]?.properties ?? {}
  const effectiveMapping = buildEffectiveMapping(firstProps, fieldMapping)

  for (let i = 0; i < features.length; i++) {
    const feature    = features[i]
    const props      = feature.properties ?? {}
    const validation = validateGeometry(feature.geometry)
    const mapped     = applyFieldMapping(props, effectiveMapping)
    const rasterImages = extractRasterAttributes(props)
    const centroid   = validation.valid ? extractCentroid(feature.geometry) : null

    if (validation.valid) validCount++
    else {
      invalidCount++
      errors.push({ featureIndex: i, error: validation.error })
    }

    results.push({
      featureIndex:       i,
      sourceFeatureId:    String(feature.id ?? props?.id ?? i),
      geometry:           feature.geometry,
      geometryType:       feature.geometry?.type ?? null,
      sourceAttributes:   props,
      mappedElementType:  mapped.elementType,
      mappedDescription:  mapped.description,
      mappedLocationName: mapped.locationName,
      mappedDistrict:     mapped.district,
      mappedOperational:  mapped,
      rasterImages,
      isValidGeometry:    validation.valid,
      geometryError:      validation.error ?? null,
      centroidLat:        centroid?.lat ?? null,
      centroidLng:        centroid?.lng ?? null,
      effectiveMapping,
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
    // Spatial layer governance fields
    featureName:       get(fieldMapping.featureName),
    featureLabel:      get(fieldMapping.featureLabel),
    slaHours:          get(fieldMapping.slaHours),
    contractId:        get(fieldMapping.contractId),
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

export { validateGeometry, extractCentroid, buildEffectiveMapping, applyFieldMapping }
