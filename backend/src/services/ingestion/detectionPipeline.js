// AI Detection Pipeline — Claude Vision implementation
//
// Architecture:
//   Upload → Save file → analyzeImage() → Claude Vision API
//     → detection_candidates (one per detected element) → Human Review Queue
//
// Governance rules (enforced here):
//   - AI never creates reports — only detection_candidates
//   - Every candidate requires human confirmation before a report is created
//   - Entity assignment is done by the human reviewer, not by AI
//   - AI confidence scores are advisory only
//
// Future evolution:
//   - Replace analyzeImage() with YOLO Python microservice (drop-in swap)
//   - Add frame extraction for video ingestion
//   - Fine-tune model on confirmed/rejected candidate history (audit log)

import { readFile } from 'fs/promises'
import { query } from '../db.js'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const DETECTION_MODEL = 'claude-haiku-4-5-20251001'

export const PIPELINE_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  COMPLETED:      'completed',
  NO_DETECTIONS:  'no_detections',
  FAILED:         'failed',
})

// Regulation violation categories — must stay in sync with frontend regulationData
const VIOLATION_TYPES = [
  { id: 'construction_waste',          name: 'مخلفات البناء' },
  { id: 'construction_site_fencing',   name: 'تسوير مواقع الأعمال الإنشائية' },
  { id: 'temp_barriers',               name: 'الحواجز المؤقتة في مواقع العمل' },
  { id: 'building_under_construction', name: 'تغطية المباني تحت الإنشاء' },
  { id: 'lighting_poles',              name: 'أعمدة الإنارة' },
  { id: 'abandoned_vehicles',          name: 'المركبات المهملة والتالفة' },
  { id: 'commercial_signs',            name: 'اللوحات التجارية' },
  { id: 'restaurant_vents',            name: 'مداخن التهوية في المطاعم' },
  { id: 'street_furniture',            name: 'أثاث الشوارع' },
  { id: 'wall_graffiti',               name: 'الكتابات المشوهة للجدران' },
  { id: 'waste_containers',            name: 'الحاويات وتكدس النفايات' },
  { id: 'street_excavation',           name: 'حفر الشوارع والطرق' },
  { id: 'directional_signs',           name: 'اللوحات الإرشادية' },
  { id: 'sidewalks',                   name: 'الأرصفة المتهالكة' },
  { id: 'general_cleanliness',         name: 'النظافة العامة' },
  { id: 'illegal_storage',             name: 'التشوين' },
  { id: 'material_transport',          name: 'نقل مواد البناء' },
  { id: 'roof_hangars',                name: 'الهناجر المخالفة فوق السطوح' },
  { id: 'building_cladding',           name: 'تكسيات المباني المتهالكة' },
  { id: 'ac_pipes',                    name: 'مجاري وتمديدات التكييف' },
  { id: 'satellite_dishes',            name: 'أطباق الأقمار الاصطناعية' },
  { id: 'canopies',                    name: 'المظلات والخيام' },
  { id: 'balcony_coverage',            name: 'تغطية الشرفات' },
  { id: 'advertising_boards',          name: 'اللوحات الإعلانية' },
  { id: 'street_vendors',              name: 'البائعين الجائلين' },
  { id: 'warning_signs',              name: 'اللوحات التحذيرية' },
]

const VIOLATION_TYPE_IDS = new Set(VIOLATION_TYPES.map(t => t.id))

function buildDetectionPrompt() {
  const typeList = VIOLATION_TYPES.map(t => `  ${t.id} — ${t.name}`).join('\n')
  return `أنت نظام كشف مخالفات بصرية لمنصة أمانة الباحة للرصد البلدي الميداني.

حلّل هذه الصورة الميدانية وحدّد أي مخالفات أو تشوهات بصرية واضحة فيها.

أنواع المخالفات المعتمدة (استخدم ID بالضبط):
${typeList}

لكل مخالفة مكتشفة في الصورة أعد كائن JSON بهذا الشكل الدقيق:
{"element_type": "<id>", "label": "<وصف قصير بالعربية للمخالفة>", "confidence": <0.0-1.0>, "notes": "<ملاحظة اختيارية>"}

القواعد:
- أعد فقط JSON array صالح، لا نص إضافي
- إذا لم تجد مخالفات واضحة أعد: []
- لا تُدرج مخالفات بثقة أقل من 0.4
- يمكن إدراج أكثر من مخالفة في نفس الصورة`
}

// Analyze a single image file with Claude Vision.
// Creates detection_candidates in the DB for each detected violation.
// Returns immediately — does NOT block the HTTP response chain in the caller.
export async function analyzeImage(mediaIngestionId, filePath, options = {}) {
  const isConfigured = ANTHROPIC_KEY &&
    !ANTHROPIC_KEY.startsWith('sk-ant-...') &&
    ANTHROPIC_KEY.length > 20

  if (!isConfigured) {
    return {
      status:  PIPELINE_STATUS.NOT_CONFIGURED,
      message: 'ANTHROPIC_API_KEY غير مضبوط — يُنشأ مرشح يدوي واحد للمراجعة',
      candidateIds: [],
    }
  }

  const mimeType = options.mimeType ?? 'image/jpeg'

  // Only JPEG/PNG/WEBP supported by Claude Vision
  const SUPPORTED_VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  if (!SUPPORTED_VISION_MIME.has(mimeType)) {
    return {
      status:  PIPELINE_STATUS.NOT_CONFIGURED,
      message: `نوع الملف ${mimeType} غير مدعوم بتحليل الذكاء الاصطناعي`,
      candidateIds: [],
    }
  }

  try {
    const fileBuffer = await readFile(filePath)
    const base64 = fileBuffer.toString('base64')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      DETECTION_MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text',  text: buildDetectionPrompt() },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`)
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text?.trim() ?? '[]'

    // Extract JSON array from response (guard against markdown code fences)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error(`AI returned non-JSON response: ${raw.slice(0, 100)}`)

    const detections = JSON.parse(jsonMatch[0])
    if (!Array.isArray(detections)) throw new Error('AI returned non-array response')

    if (detections.length === 0) {
      await query(
        `UPDATE media_ingestions SET processing_status = 'processed', processed_at = NOW() WHERE id = $1`,
        [mediaIngestionId],
      )
      return { status: PIPELINE_STATUS.NO_DETECTIONS, candidateIds: [] }
    }

    const candidateIds = []
    for (const det of detections) {
      // Validate element_type against known types to reject hallucinations
      if (!VIOLATION_TYPE_IDS.has(det.element_type)) {
        console.warn(`[detection] Unknown element_type "${det.element_type}" — skipped`)
        continue
      }

      const conf = typeof det.confidence === 'number'
        ? String(Math.min(1, Math.max(0, det.confidence)))
        : null

      const { rows: [candidate] } = await query(
        `INSERT INTO detection_candidates
           (media_ingestion_id, detection_source, detection_model, detection_confidence,
            suggested_element_type, suggested_element_label,
            gps_lat, gps_lng, location)
         VALUES ($1, 'ai_vision', $2, $3::decimal,
                 $4, $5,
                 $6::double precision, $7::double precision,
                 CASE
                   WHEN $6::double precision IS NOT NULL
                    AND $7::double precision IS NOT NULL
                   THEN ST_SetSRID(ST_MakePoint($7::double precision, $6::double precision), 4326)
                   ELSE NULL
                 END)
         RETURNING id`,
        [
          mediaIngestionId,
          DETECTION_MODEL,
          conf,
          det.element_type,
          det.label ?? VIOLATION_TYPES.find(t => t.id === det.element_type)?.name,
          options.gpsLat ?? null,
          options.gpsLng ?? null,
        ],
      )
      candidateIds.push(candidate.id)
    }

    await query(
      `UPDATE media_ingestions SET processing_status = 'processed', processed_at = NOW() WHERE id = $1`,
      [mediaIngestionId],
    )

    return {
      status:       PIPELINE_STATUS.COMPLETED,
      candidateIds,
      candidateCount: candidateIds.length,
      model:        DETECTION_MODEL,
    }
  } catch (err) {
    console.error('[detection] Claude Vision error:', err.message)
    await query(
      `UPDATE media_ingestions
       SET processing_status = 'failed', processing_error = $2
       WHERE id = $1`,
      [mediaIngestionId, err.message],
    ).catch(() => {})
    return { status: PIPELINE_STATUS.FAILED, error: err.message, candidateIds: [] }
  }
}

// Stub kept for future YOLO/queue integration
export async function submitForDetection(mediaIngestionId, options = {}) {
  return {
    status:          PIPELINE_STATUS.NOT_CONFIGURED,
    message:         'Queue-based pipeline not yet configured.',
    mediaIngestionId,
    queueJobId:      null,
  }
}

export async function extractVideoFrames(mediaIngestionId, options = {}) {
  return {
    status:          PIPELINE_STATUS.NOT_CONFIGURED,
    message:         'Video frame extraction not yet configured.',
    mediaIngestionId,
    frameCount:      0,
    framePaths:      [],
  }
}
