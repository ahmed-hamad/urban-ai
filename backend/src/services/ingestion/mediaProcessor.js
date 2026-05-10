// Media Ingestion Processor
// Extracts EXIF metadata and GPS from uploaded images/videos.
// Videos return empty metadata — frame extraction is handled by detectionPipeline.js.

let exifr = null
try {
  const mod = await import('exifr')
  exifr = mod.default
} catch {
  console.warn('[mediaProcessor] exifr not installed — EXIF/GPS extraction disabled')
}

const SKIP_EXIF_FIELDS = new Set(['MakerNote', 'UserComment', 'ThumbnailBuffer', 'JpegIFOffset', 'JpegIFByteCount'])

export async function extractMetadata(filePath, mimeType) {
  const result = {
    captureTimestamp: null,
    gpsLat: null,
    gpsLng: null,
    gpsAltitude: null,
    exifData: null,
  }

  if (!mimeType?.startsWith('image/') || !exifr) return result

  try {
    const data = await exifr.parse(filePath, {
      gps:  true,
      tiff: true,
      exif: true,
      iptc: false,
      xmp:  false,
    })

    if (!data) return result

    result.exifData = sanitizeExif(data)

    if (data.latitude  != null) result.gpsLat      = data.latitude
    if (data.longitude != null) result.gpsLng      = data.longitude
    if (data.GPSAltitude != null) result.gpsAltitude = data.GPSAltitude

    result.captureTimestamp =
      data.DateTimeOriginal ??
      data.CreateDate        ??
      data.ModifyDate        ??
      null

    // Validate coordinate ranges
    if (result.gpsLat != null && (result.gpsLat < -90  || result.gpsLat > 90))  result.gpsLat = null
    if (result.gpsLng != null && (result.gpsLng < -180 || result.gpsLng > 180)) result.gpsLng = null

  } catch (err) {
    console.error('[mediaProcessor] EXIF extraction failed:', err.message)
  }

  return result
}

function sanitizeExif(data) {
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (SKIP_EXIF_FIELDS.has(k)) continue
    if (v instanceof Uint8Array || v instanceof ArrayBuffer) continue
    out[k] = typeof v === 'object' && v !== null && !(v instanceof Date) ? String(v) : v
  }
  return out
}

export function classifyFileType(mimeType) {
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType?.startsWith('video/')) return 'video'
  if (mimeType?.startsWith('audio/')) return 'audio'
  return 'image'
}
