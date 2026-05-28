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
        period:      { type: 'string', enum: ['week', 'month', '3months', 'year'] },
        entity_name: { type: 'string', description: 'Entity/agency name in Arabic (partial match)' },
        top_n:       { type: 'integer', description: 'Top N performers to return', default: 10 },
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
]

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(user, scope) {
  const scopeDesc =
    scope.type === 'unrestricted' ? 'وصول كامل لجميع البيانات' :
    scope.type === 'entity'       ? `محدود بجهة: ${user.entityName || scope.entityId}` :
                                    `محدود ببيانات المستخدم: ${user.name}`

  return `أنت مساعد عمليات مكاني متخصص لمنصة UrbanAI لإدارة البلاغات الميدانية في أمانة الباحة.

معلومات المستخدم:
- الاسم: ${user.name || 'مستخدم'}، الدور: ${user.role}، الجهة: ${user.entityName || 'غير محدد'}
- نطاق البيانات: ${scopeDesc}

مهامك:
- تحليل أسئلة المستخدم حول البلاغات والمخالفات والأداء التشغيلي والتحليل المكاني
- استخدام الأدوات المتاحة دائماً لاسترداد بيانات حقيقية من قاعدة البيانات
- تقديم إجابات دقيقة وموثوقة باللغة العربية فقط
- اقتراح التمثيل البياني أو الخريطة المناسبة

قواعد صارمة:
1. لا تولّد أرقاماً أو إحصاءات من تلقاء نفسك — استخدم الأدوات دائماً
2. لا تتجاوز نطاق صلاحيات المستخدم
3. إذا لم تتوفر بيانات كافية، وضّح ذلك
4. أنت مساعد تحليلي فقط — القرارات النهائية تعود للمستخدم المختص

بعد جمع البيانات من الأدوات، أعد ردًا بهذا التنسيق حصراً:

<RESPONSE>
{
  "text": "نص الرد الكامل بالعربية",
  "kpis": [
    {"label": "العنوان", "value": "123", "unit": "بلاغ", "trend": "+15%", "trendUp": true}
  ],
  "chart": {
    "type": "bar",
    "title": "عنوان الرسم البياني",
    "data": [{"name": "اسم", "value": 123, "fill": "#3B82F6"}]
  },
  "mapCommand": {
    "action": "filterAndZoom",
    "params": {"element": "id", "status": "status", "bounds": {"south": 0, "north": 0, "west": 0, "east": 0}, "label": "وصف"}
  },
  "table": {
    "columns": ["العمود1", "العمود2"],
    "rows": [["قيمة1", "قيمة2"]]
  }
}
</RESPONSE>

أنواع mapCommand المتاحة:
- filterAndZoom: لعرض بلاغات منطقة / نوع عنصر معين على الخريطة
- showHeatmap: لعرض خريطة حرارية (ضع النقاط في params.points)
- filterByElement: تصفية الخريطة حسب نوع العنصر فقط
- focusMunicipality: التركيز على منطقة دون تغيير الفلاتر

ملاحظات التنسيق:
- استخدم فقط الحقول ذات الصلة؛ ضع null للحقول غير المناسبة
- chart.type يمكن أن يكون: bar, pie, line
- ألوان chart.data.fill المقترحة: #3B82F6 (أزرق), #10B981 (أخضر), #EF4444 (أحمر), #F59E0B (برتقالي), #8B5CF6 (بنفسجي)
- لا تضع بيانات النقاط الكاملة في kpis أو text — ضعها في mapCommand.params أو chart فقط`
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
      max_tokens: 2048,
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
