// Claude Vision Provider — wraps Anthropic Vision API for violation detection.
//
// Interface contract (all providers must return the same shape):
//   detect(filePath, mimeType, options) → Promise<Detection[]>
//
// Detection shape:
//   { element_type, label, confidence, bbox, notes }
//
// Returns [] when no violations are detected.
// Throws on unrecoverable errors (API key missing, network failure, etc.).

import { readFile } from 'fs/promises'

export const PROVIDER_ID = 'claude_vision'

const MODEL = process.env.CLAUDE_VISION_MODEL ?? 'claude-haiku-4-5-20251001'

const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

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

const VIOLATION_TYPE_IDS  = new Set(VIOLATION_TYPES.map(t => t.id))
const VIOLATION_LABEL_MAP = Object.fromEntries(VIOLATION_TYPES.map(t => [t.id, t.name]))

function buildPrompt() {
  const typeList = VIOLATION_TYPES.map(t => `  ${t.id} — ${t.name}`).join('\n')
  return `أنت نظام كشف عناصر التشوه البصري لمنصة أمانة الباحة للرصد البلدي الميداني.

حلّل هذه الصورة الميدانية وحدّد أي عناصر تشوه بصري واضحة فيها.

أنواع العناصر المعتمدة (استخدم ID بالضبط):
${typeList}

لكل عنصر مكتشف في الصورة أعد كائن JSON بهذا الشكل الدقيق:
{"element_type": "<id>", "label": "<وصف قصير بالعربية>", "confidence": <0.0-1.0>, "bbox": [<x%>, <y%>, <w%>, <h%>], "notes": "<ملاحظة اختيارية>"}

حقل bbox إلزامي: يحدد موضع العنصر في الصورة كنسبة مئوية (0–100):
- x%: المسافة من اليسار للحافة اليسرى للعنصر
- y%: المسافة من الأعلى للحافة العلوية للعنصر
- w%: عرض العنصر
- h%: ارتفاع العنصر
مثال: عنصر يشغل الربع العلوي الأيسر: [0, 0, 50, 50]

القواعد:
- أعد فقط JSON array صالح، لا نص إضافي
- إذا لم تجد عناصر واضحة أعد: []
- لا تُدرج عناصر بثقة أقل من 0.4
- يمكن إدراج أكثر من عنصر في نفس الصورة
- كن دقيقاً في تحديد bbox لكل عنصر بشكل مستقل`
}

function isConfigured() {
  const key = process.env.ANTHROPIC_API_KEY
  return key && !key.startsWith('sk-ant-...') && key.length > 20
}

function normalizeBbox(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  if (!raw.every(v => typeof v === 'number' && v >= 0 && v <= 100)) return null
  return raw.map(v => Math.round(v * 10) / 10)
}

export async function detect(filePath, mimeType, _options = {}) {
  if (!isConfigured()) {
    throw Object.assign(
      new Error('ANTHROPIC_API_KEY غير مضبوط'),
      { code: 'NOT_CONFIGURED' },
    )
  }

  if (!SUPPORTED_MIME.has(mimeType)) {
    throw Object.assign(
      new Error(`نوع الملف ${mimeType} غير مدعوم بـ Claude Vision`),
      { code: 'UNSUPPORTED_MIME' },
    )
  }

  const fileBuffer = await readFile(filePath)
  const base64 = fileBuffer.toString('base64')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text',  text: buildPrompt() },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const raw  = data.content?.[0]?.text?.trim() ?? '[]'

  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`Claude Vision returned non-JSON: ${raw.slice(0, 100)}`)

  const detections = JSON.parse(jsonMatch[0])
  if (!Array.isArray(detections)) throw new Error('Claude Vision returned non-array')

  return detections
    .filter(d => VIOLATION_TYPE_IDS.has(d.element_type))
    .map(d => ({
      element_type: d.element_type,
      label:        d.label ?? VIOLATION_LABEL_MAP[d.element_type] ?? d.element_type,
      confidence:   typeof d.confidence === 'number'
        ? Math.min(1, Math.max(0, d.confidence))
        : null,
      bbox:         normalizeBbox(d.bbox),
      notes:        d.notes ?? null,
    }))
}

export const model = MODEL
