// AI Copilot — Spatial Operations Assistant
// Architecture: User → Intent Analysis → Tool Selection → DB/PostGIS → Structured Response
//
// RBAC: All tool executions are scope-enforced (entity/user/unrestricted).
// AI is advisory only — never authoritative, never bypasses governance.

import { Router } from 'express'
import { requirePermission, buildReportScope } from '../middleware/auth.js'
import {
  getReportStats,
  getInspectorPerformance,
  getSpatialReports,
  getFinancialForecast,
  getHeatmapData,
  getReportDetail,
  getElementTypes,
} from '../services/analyticsService.js'
import { getDuplicateStats } from '../services/duplicateDetection.js'

const router  = Router()
const API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL   = 'claude-sonnet-4-6'

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_report_stats',
    description: 'Retrieve aggregate report statistics from the database. Use for general questions about counts, closure rates, trends, and breakdowns. Always call this before answering statistical questions.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'week', 'month', '3months', 'year', 'all'],
          description: '"month" = last 30 days, "3months" = last 90 days.',
        },
        group_by: {
          type: 'string',
          enum: ['element', 'status', 'entity', 'district', 'month', 'ingestion_source'],
          description: 'Dimension to aggregate by. Omit for summary totals.',
        },
        status:       { type: 'string', description: 'Filter by specific workflow status' },
        element_type: { type: 'string', description: 'Filter by element type ID (e.g. street_excavation, waste_containers)' },
      },
    },
  },
  {
    name: 'get_inspector_performance',
    description: 'Performance metrics for field inspectors/monitors: report counts, closure rates, resolution time. Use for team performance questions, entity comparisons, individual KPIs.',
    input_schema: {
      type: 'object',
      properties: {
        period:         { type: 'string', enum: ['week', 'month', '3months', 'year'] },
        entity_name:    { type: 'string', description: 'Entity/agency name in Arabic (partial match)' },
        inspector_name: { type: 'string', description: 'Inspector or monitor full name in Arabic (partial match). Use when user asks about a specific employee.' },
        top_n:          { type: 'integer', description: 'Top N performers to return', default: 10 },
      },
    },
  },
  {
    name: 'get_spatial_reports',
    description: 'Reports in a specific geographic area. Use when user mentions a municipality, district, or area name, or asks to "show on map".',
    input_schema: {
      type: 'object',
      properties: {
        municipality: { type: 'string', description: 'Municipality or area name in Arabic (partial match)' },
        district:     { type: 'string', description: 'District or neighborhood name in Arabic' },
        element_type: { type: 'string', description: 'Filter by element type ID' },
        status:       { type: 'string', description: 'Filter by status' },
        limit:        { type: 'integer', default: 100, description: 'Max reports to return' },
      },
    },
  },
  {
    name: 'get_financial_forecast',
    description: 'Financial analysis: actual fines collected, revenue potential, breakdown by element/entity/month. Use for revenue projections and fine statistics.',
    input_schema: {
      type: 'object',
      properties: {
        period:   { type: 'string', enum: ['month', '3months', 'year', 'all'] },
        group_by: { type: 'string', enum: ['element', 'month', 'entity', 'district'] },
      },
    },
  },
  {
    name: 'get_duplicate_stats',
    description: 'Duplicate/overlap analysis: how many reports appear in multiple monitoring sources, confidence scores, pending reviews.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_heatmap_data',
    description: 'Geographic density data for heat maps. Use for density analysis, hotspot questions, spatial distribution requests.',
    input_schema: {
      type: 'object',
      properties: {
        element_type: { type: 'string', description: 'Filter by element type (optional)' },
        period:       { type: 'string', enum: ['week', 'month', '3months', 'year', 'all'] },
        municipality: { type: 'string', description: 'Limit to a municipality (optional)' },
      },
    },
  },
  {
    name: 'get_report_detail',
    description: 'Get full details and complete audit trail (history of all status changes, actions, actors) for a single report. Use when the user asks about a specific report, its tracking log, history, or workflow journey. Also use for "البلاغ الأول" (first), "البلاغ الأخير" (last), or any specific report number.',
    input_schema: {
      type: 'object',
      properties: {
        report_id:     { type: 'string', description: 'UUID of the report (if known)' },
        report_number: {
          type: 'string',
          description: 'Report number (e.g. RPT-2024-001), OR the special values: "first" (oldest report), "last" (newest report). Use "first" when user says "البلاغ الأول" or "أول بلاغ".',
        },
      },
    },
  },
  {
    name: 'get_element_types',
    description: 'Returns all element types (تشوه بصري categories) currently in the database with their IDs and Arabic labels. ALWAYS call this first when the user mentions an element by a common Arabic name (like "تسوير المباني", "حفريات", "لافتات") to find the correct element_id before querying other tools.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
]

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(user, scope) {
  const scopeDesc =
    scope.type === 'unrestricted' ? 'وصول كامل لجميع البيانات' :
    scope.type === 'entity'       ? `محدود بجهة: ${user.entityName || scope.entityId}` :
                                    `محدود ببيانات المستخدم: ${user.name}`

  return `أنت مساعد عمليات مكاني متخصص لمنصة UrbanAI لإدارة بلاغات التشوه البصري في أمانة الباحة.

## المستخدم الحالي
- الاسم: ${user.name || 'مستخدم'} | الدور: ${user.role} | الجهة: ${user.entityName || 'غير محدد'}
- نطاق البيانات: ${scopeDesc}

## مصدر البيانات — مهم جداً
بياناتك تأتي **حصراً من قاعدة البيانات PostgreSQL** (المصدر الرسمي).
واجهة لوحة التحكم قد تعرض بلاغات محلية لم تُحفظ في قاعدة البيانات بعد، مما يسبب فروقاً ظاهرية في الأرقام. بياناتك هي المرجع الصحيح.

## حالات البلاغات (Status) في النظام
- draft: مسودة | submitted: مُقدَّم | ai_classified: صُنِّف بالذكاء الاصطناعي
- under_review: قيد المراجعة | assigned: مُسند | in_progress: قيد المعالجة
- closed_inspector: مغلق (مراقب) | pending_enforcement: قيد الإنفاذ
- pending_notice: قيد الإشعار | unknown_offender: مجهول المخالف
- quality_review: مراجعة الجودة | closed_final: مغلق نهائياً | rejected: مرفوض
البلاغات "المفتوحة" = كل ما عدا closed_final و rejected و deleted.

## قواعد استخدام الأدوات

### تحديد العنصر (element_type)
- إذا ذكر المستخدم اسم عنصر بالعربية مثل "تسوير المباني" أو "حفريات الشوارع" أو "لافتات":
  1. استدعِ get_element_types أولاً للحصول على قائمة العناصر المتاحة مع معرّفاتها
  2. طابق الاسم العربي مع القائمة
  3. إن وجدت تطابقاً واحداً واضحاً: تابع الاستعلام
  4. إن وجدت تطابقات متعددة: اسأل المستخدم: "هل تقصد [عنصر أ] أم [عنصر ب]؟"
  5. إن لم تجد أي تطابق: أخبر المستخدم بالعناصر المتاحة

### البلاغ الأول / الأخير / بعينه
- "البلاغ الأول" أو "أول بلاغ" → استدعِ get_report_detail بـ report_number: "first"
- "البلاغ الأخير" أو "آخر بلاغ" → استدعِ get_report_detail بـ report_number: "last"
- رقم بلاغ محدد → استدعِ get_report_detail بـ report_number: الرقم
- سجل التتبع / التاريخ / الحالات السابقة → استخدم get_report_detail دائماً

### الموظف المحدد
- عندما يسأل مدير النظام عن موظف بالاسم → استدعِ get_inspector_performance بـ inspector_name: الاسم

## قواعد صارمة
1. لا تولّد أرقاماً أو بيانات من عندك — استخدم الأدوات دائماً
2. لا تتجاوز نطاق صلاحيات المستخدم
3. إذا لم تتوفر بيانات كافية: وضّح ذلك واقترح سؤالاً بديلاً
4. أنت مساعد تحليلي فقط — القرارات النهائية تعود للمستخدم المختص

## تنسيق الرد — حصراً

<RESPONSE>
{
  "text": "نص الرد الكامل بالعربية",
  "kpis": [{"label": "العنوان", "value": "123", "unit": "بلاغ", "trend": "+15%", "trendUp": true}],
  "chart": {"type": "bar", "title": "عنوان", "data": [{"name": "اسم", "value": 123, "fill": "#3B82F6"}]},
  "mapCommand": {"action": "filterAndZoom", "params": {"element": "id", "status": "status", "bounds": {"south": 0, "north": 0, "west": 0, "east": 0}, "label": "وصف"}},
  "table": {"columns": ["العمود1", "العمود2"], "rows": [["قيمة1", "قيمة2"]]}
}
</RESPONSE>

- chart.type: bar | pie | line
- mapCommand.action: filterAndZoom | showHeatmap | filterByElement | focusMunicipality | highlightReports
- ألوان مقترحة: #3B82F6 أزرق | #10B981 أخضر | #EF4444 أحمر | #F59E0B برتقالي | #8B5CF6 بنفسجي
- ضع null للحقول غير المناسبة — لا تضع نقاط الخريطة في text أو kpis`
}

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name, input, scope) {
  try {
    switch (name) {
      case 'get_report_stats':
        return await getReportStats({ ...input, scope })
      case 'get_inspector_performance':
        return await getInspectorPerformance({ ...input, scope })
      case 'get_spatial_reports':
        return await getSpatialReports({ ...input, scope })
      case 'get_financial_forecast':
        return await getFinancialForecast({ ...input, scope })
      case 'get_duplicate_stats':
        return await getDuplicateStats(scope.type !== 'unrestricted' ? scope.entityId : null)
      case 'get_heatmap_data':
        return await getHeatmapData({ ...input, scope })
      case 'get_report_detail':
        return await getReportDetail({ ...input, scope })
      case 'get_element_types':
        return await getElementTypes({ scope })
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    console.error(`[assistant] tool ${name} error:`, err.message)
    return { error: err.message, tool: name }
  }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseStructuredResponse(raw) {
  const match = raw.match(/<RESPONSE>\s*([\s\S]*?)\s*<\/RESPONSE>/i)
  if (!match) return { text: raw }
  try {
    return JSON.parse(match[1])
  } catch {
    // JSON parse failed — return raw text without the tags
    return { text: raw.replace(/<\/?RESPONSE>/gi, '').trim() }
  }
}

// ─── Claude API caller ────────────────────────────────────────────────────────

async function callClaude(messages, systemPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1400,
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Anthropic API ${response.status}: ${err.slice(0, 300)}`)
  }
  return response.json()
}

// ─── POST /api/assistant/query ────────────────────────────────────────────────

router.post('/query', requirePermission('view_reports'), async (req, res) => {
  if (!API_KEY || API_KEY.length < 20) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY غير مضبوط', code: 'AI_NOT_CONFIGURED' })
  }

  const { message, history = [] } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'الرسالة مطلوبة' })

  const scope  = buildReportScope(req.user)
  const system = buildSystemPrompt(req.user, scope)

  // Build messages: keep last 6 (= 3 user+assistant turns)
  const messages = [
    ...history.slice(-6).filter(m => m.role && m.content),
    { role: 'user', content: message.trim() },
  ]

  // Tool-use loop — max 3 rounds
  let lastResponse
  const MAX_ROUNDS = 3

  for (let round = 0; round < MAX_ROUNDS; round++) {
    lastResponse = await callClaude(messages, system)

    if (lastResponse.stop_reason !== 'tool_use') break

    const toolUseBlocks = lastResponse.content.filter(b => b.type === 'tool_use')

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const result = await executeTool(block.name, block.input, scope)
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
      }),
    )

    messages.push({ role: 'assistant', content: lastResponse.content })
    messages.push({ role: 'user',      content: toolResults })
  }

  // Extract and parse final text response
  const textBlocks = (lastResponse?.content ?? []).filter(b => b.type === 'text')
  const rawText    = textBlocks.map(b => b.text).join('\n')
  const structured = parseStructuredResponse(rawText)

  res.json({
    text:       structured.text       ?? rawText,
    chart:      structured.chart      ?? null,
    kpis:       structured.kpis       ?? null,
    mapCommand: structured.mapCommand ?? null,
    table:      structured.table      ?? null,
  })
})

export default router
