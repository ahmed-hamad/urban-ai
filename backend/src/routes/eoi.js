// EOI Routes — ذكاء الرصد الخارجي (External Observation Intelligence)
// All VPI values here are ESTIMATED/FORECAST — never official.

import { Router } from 'express'
import multer     from 'multer'
import { requireRole } from '../middleware/auth.js'
import {
  inspectExcelEOI,
  autoDetectMappingEOI,
  discoverEOIMonths,
  importMappedEOI,
  saveEOITemplate,
  getEOITemplates,
  deleteEOITemplate,
  _recalcLiveVPI,
} from '../services/eoiImportService.js'
import {
  getAvailableEOIMonths,
  getOperationalSummary,
  getStatusBreakdown,
  getVisitStatusAnalysis,
  getVisitDrill,
  getInProgressAnalysis,
  getRepeatedAnalysis,
  getClosureQuality,
  getOperationalTrend,
  getLiveVPI,
  getEarlyWarning,
  generateEOISummary,
  getUnitRules,
  upsertUnitRule,
  getUploadHistory,
  deleteUploadJobs,
  getEOIMapPoints,
  getEOIVPIAnalysis,
} from '../services/eoiService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

function muniScope(req, requested) {
  if (['admin', 'executive', 'auditor'].includes(req.user.role)) return requested || null
  return req.user.entityName || req.user.entity || requested || null
}

// ─── Import Wizard ────────────────────────────────────────────────────────────

router.post('/wizard/inspect',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' })
    try {
      const inspection = inspectExcelEOI(req.file.buffer)
      const { mapping, confidence } = autoDetectMappingEOI(inspection.columns, inspection.columnSamples)
      const templates = await getEOITemplates()
      res.json({ inspection, suggestedMapping: mapping, confidence, templates })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
)

router.post('/wizard/discover',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' })
    try {
      const mapping = JSON.parse(req.body.mapping || '{}')
      const result  = discoverEOIMonths(req.file.buffer, mapping)
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
)

router.post('/wizard/import',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' })
    try {
      const mapping        = JSON.parse(req.body.mapping        || '{}')
      const existingAction = req.body.existing_action || 'skip'
      const results        = await importMappedEOI(req.file.buffer, mapping, existingAction, req.user.id)
      const imported       = results.filter(r => r.status === 'imported')
      const skipped        = results.filter(r => r.status === 'skipped')
      const failed         = results.filter(r => r.status === 'failed')
      res.json({ success: true, results, summary: { total: results.length, imported: imported.length, skipped: skipped.length, failed: failed.length } })
    } catch (err) {
      console.error('[eoi wizard] import:', err.message)
      res.status(400).json({ error: err.message })
    }
  }
)

router.get('/wizard/templates',
  requireRole('admin', 'executive', 'manager'),
  async (_req, res) => res.json({ templates: await getEOITemplates() })
)

router.post('/wizard/templates',
  requireRole('admin', 'executive', 'manager'),
  async (req, res) => {
    const { name, mapping } = req.body
    if (!name || !mapping) return res.status(400).json({ error: 'name و mapping مطلوبان' })
    res.json({ template: await saveEOITemplate(name, mapping, req.user.id) })
  }
)

router.delete('/wizard/templates/:id',
  requireRole('admin', 'executive', 'manager'),
  async (req, res) => {
    await deleteEOITemplate(req.params.id)
    res.json({ success: true })
  }
)

// ─── Metadata ─────────────────────────────────────────────────────────────────

router.get('/months', async (_req, res) => {
  res.json({ months: await getAvailableEOIMonths() })
})

// ─── Operational Analytics ────────────────────────────────────────────────────

router.get('/analytics/summary', async (req, res) => {
  const { month, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: null })
  res.json({ month: m, data: await getOperationalSummary({ month: m, municipalityName: muni }) })
})

router.get('/analytics/breakdown', async (req, res) => {
  const { month, municipality, group_by = 'municipality' } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: [] })
  res.json({ month: m, data: await getStatusBreakdown({ month: m, municipalityName: muni, groupBy: group_by }) })
})

router.get('/analytics/visit-status', async (req, res) => {
  const { month, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: null })
  res.json({ month: m, data: await getVisitStatusAnalysis({ month: m, municipalityName: muni }) })
})

router.get('/analytics/visit-drill', async (req, res) => {
  const { month, visit_status, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ data: [] })
  try {
    res.json({ data: await getVisitDrill({ month: m, visitStatus: visit_status, municipalityName: muni }) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/analytics/visit-export', async (req, res) => {
  const { month, visit_status, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.status(400).json({ error: 'لا توجد بيانات' })
  try {
    const rows = await getVisitDrill({ month: m, visitStatus: visit_status, municipalityName: muni })
    const XLSX = (await import('xlsx')).default
    const wsData = [
      ['اسم العنصر', 'البلدية', 'خط العرض', 'خط الطول', 'تاريخ الرصد', 'تاريخ الإغلاق', 'رقم البلاغ', 'حالة الزيارة', 'حالة الإغلاق'],
      ...rows.map(r => [r.element_name, r.municipality_name, r.lat, r.lng, r.observation_date, r.closure_date, r.report_number, r.visit_status, r.closure_status]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'الزيارات')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const fname = `visit_${m}${visit_status ? '_' + visit_status.replace(/\s+/g,'_') : ''}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`)
    res.send(buf)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/analytics/in-progress', async (req, res) => {
  const { month, municipality, stalled_days = 30 } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: null })
  res.json({ month: m, data: await getInProgressAnalysis({ month: m, municipalityName: muni, stalledDays: parseInt(stalled_days) }) })
})

router.get('/analytics/repeated', async (req, res) => {
  const { month, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: null })
  res.json({ month: m, data: await getRepeatedAnalysis({ month: m, municipalityName: muni }) })
})

router.get('/analytics/closure-quality', async (req, res) => {
  const { month, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: [] })
  res.json({ month: m, data: await getClosureQuality({ month: m, municipalityName: muni }) })
})

router.get('/analytics/trend', async (req, res) => {
  const { month, municipality, group_by = 'day' } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: [] })
  res.json({ month: m, data: await getOperationalTrend({ month: m, municipalityName: muni, groupBy: group_by }) })
})

// ─── Live VPI & Forecast ──────────────────────────────────────────────────────

router.get('/live-vpi', async (req, res) => {
  const months = await getAvailableEOIMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: null })
  res.json({ month, data: await getLiveVPI(month) })
})

router.post('/live-vpi/recalculate', requireRole('admin', 'executive'), async (req, res) => {
  const months = await getAvailableEOIMonths()
  const results = []
  for (const m of months) {
    try { await _recalcLiveVPI(m); results.push({ month: m, status: 'ok' }) }
    catch (err) { results.push({ month: m, status: 'error', error: err.message }) }
  }
  res.json({ results })
})

router.get('/early-warning', async (req, res) => {
  const months = await getAvailableEOIMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: null })
  res.json({ month, data: await getEarlyWarning(month) })
})

router.get('/executive-summary', async (req, res) => {
  const months = await getAvailableEOIMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, summary: null, insights: [] })
  res.json(await generateEOISummary(month))
})

// ─── Unit Conversion Rules ────────────────────────────────────────────────────

router.get('/unit-rules', async (_req, res) => {
  res.json({ rules: await getUnitRules() })
})

router.post('/unit-rules', requireRole('admin', 'executive'), async (req, res) => {
  const { element_pattern, match_type, factor, description } = req.body
  if (!element_pattern || factor == null) return res.status(400).json({ error: 'element_pattern و factor مطلوبان' })
  res.json({ rule: await upsertUnitRule(element_pattern, match_type, parseFloat(factor), description, req.user.id) })
})

// ─── VPI Estimated Analysis ───────────────────────────────────────────────────

router.get('/analytics/vpi-analysis', async (req, res) => {
  const { month, municipality } = req.query
  const muni = muniScope(req, municipality)
  const months = await getAvailableEOIMonths()
  const m = month || months[0]
  if (!m) return res.json({ month: null, data: null })
  try {
    res.json({ month: m, data: await getEOIVPIAnalysis({ month: m, municipalityName: muni }) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Map Points ───────────────────────────────────────────────────────────────

router.get('/map-points', async (req, res) => {
  const months = req.query.months
    ? (Array.isArray(req.query.months) ? req.query.months : req.query.months.split(','))
    : []
  const includeSystemReports = req.query.include_system === 'true'
  try {
    res.json(await getEOIMapPoints({ months, includeSystemReports }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Upload History ───────────────────────────────────────────────────────────

router.get('/uploads/history', requireRole('admin', 'executive', 'manager'), async (_req, res) => {
  res.json({ data: await getUploadHistory() })
})

// Body: { ids: [1,2,3] } or { ids: 'all' }
router.delete('/uploads', requireRole('admin', 'executive', 'manager'), async (req, res) => {
  const { ids } = req.body
  if (!ids) return res.status(400).json({ error: 'ids مطلوب' })
  try {
    const result = await deleteUploadJobs(ids)
    for (const month of result.affectedMonths) {
      try { await _recalcLiveVPI(month) } catch (_) {}
    }
    res.json({ success: true, affectedMonths: result.affectedMonths })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
