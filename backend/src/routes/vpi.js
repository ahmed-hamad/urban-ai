// VPI Routes — مؤشر التشوه البصري (Visual Pollution Index)
// Upload monthly Excel datasets → ETL → KPI storage → Executive dashboards

import { Router } from 'express'
import multer     from 'multer'
import { requireRole } from '../middleware/auth.js'
import pool from '../services/db.js'
import {
  inspectExcel,
  autoDetectMapping,
  discoverMonths,
  importMappedObservations,
  importMappedCoverage,
  saveMappingTemplate,
  getMappingTemplates,
  deleteMappingTemplate,
} from '../services/vpiImportService.js'
import {
  checkMonthExists,
  getAvailableMonths,
  getAmanahDashboard,
  getMunicipalityDashboard,
  getTopMunicipalities,
  getTopElements,
  getTopZones,
  getReportsVsUnits,
  getPriorityZoneAnalytics,
  getHistoricalTrend,
  getUploadHistory,
  getMunicipalityList,
  getAllTargets,
  upsertTarget,
  generateExecutiveSummary,
} from '../services/vpiService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// Municipality scope for managers
function muniScope(req, requested) {
  if (['admin', 'executive', 'auditor'].includes(req.user.role)) return requested || null
  return req.user.entityName || req.user.entity || requested || null
}

function isRestricted(req) {
  return !['admin', 'executive', 'auditor', 'manager'].includes(req.user.role)
}

// ─── Wizard Endpoints ─────────────────────────────────────────────────────────

router.post('/wizard/inspect',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' })
    const { dataset_type = 'observations' } = req.body
    try {
      const inspection = inspectExcel(req.file.buffer)
      const { mapping, confidence } = autoDetectMapping(inspection.columns, inspection.columnSamples, dataset_type)
      const templates = await getMappingTemplates(dataset_type)
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
      const mapping     = JSON.parse(req.body.mapping || '{}')
      const defaultYear = req.body.default_year ? parseInt(req.body.default_year) : null
      const result      = discoverMonths(req.file.buffer, mapping, defaultYear)
      const months      = await Promise.all(result.months.map(async m => ({
        ...m,
        obsExists: await checkMonthExists(m.month, 'observations'),
        covExists: await checkMonthExists(m.month, 'coverage'),
      })))
      res.json({ ...result, months })
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
      const datasetType    = req.body.dataset_type    || 'observations'
      const existingAction = req.body.existing_action || 'skip'
      const defaultYear    = req.body.default_year ? parseInt(req.body.default_year) : null
      const fn             = datasetType === 'observations' ? importMappedObservations : importMappedCoverage
      const results        = await fn(req.file.buffer, mapping, defaultYear, existingAction, req.user.id)
      const imported = results.filter(r => r.status === 'imported')
      const skipped  = results.filter(r => r.status === 'skipped')
      const failed   = results.filter(r => r.status === 'failed')
      res.json({
        success: true, results,
        summary: { total: results.length, imported: imported.length, skipped: skipped.length, failed: failed.length, kpiCalculated: imported.some(r => r.kpiCalculated) },
      })
    } catch (err) {
      console.error('[vpi wizard] import:', err.message)
      res.status(400).json({ error: err.message })
    }
  }
)

router.get('/wizard/templates', requireRole('admin', 'executive', 'manager'), async (req, res) => {
  res.json({ templates: await getMappingTemplates(req.query.dataset_type || 'observations') })
})

router.post('/wizard/templates', requireRole('admin', 'executive', 'manager'), async (req, res) => {
  const { name, dataset_type, mapping } = req.body
  if (!name || !dataset_type || !mapping) return res.status(400).json({ error: 'name, dataset_type, mapping مطلوبة' })
  res.json({ template: await saveMappingTemplate(name, dataset_type, mapping, req.user.id) })
})

router.delete('/wizard/templates/:id', requireRole('admin', 'executive', 'manager'), async (req, res) => {
  await deleteMappingTemplate(req.params.id)
  res.json({ success: true })
})

// ─── Upload: Observations ─────────────────────────────────────────────────────

router.post('/upload/observations',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ملف Excel مطلوب' })
    const { month } = req.body
    const replace   = req.body.replace === 'true'

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM' })
    }

    let jobId
    try {
      const exists = await checkMonthExists(month, 'observations')
      if (exists && !replace) {
        return res.status(409).json({ error: `بيانات الرصد لشهر ${month} موجودة مسبقاً`, code: 'MONTH_EXISTS', month })
      }

      const rows = parseObservationsExcel(req.file.buffer)
      if (!rows.length) return res.status(400).json({ error: 'الملف فارغ أو لا يحتوي بيانات صالحة' })

      const stamped = rows.map(r => ({ ...r, month }))

      const { rows: [job] } = await pool.query(
        `INSERT INTO vpi_upload_jobs (month,upload_type,status,uploaded_by,file_name,row_count)
         VALUES ($1,'observations','processing',$2,$3,$4) RETURNING id`,
        [month, req.user.id, req.file.originalname, stamped.length]
      )
      jobId = job.id

      if (exists && replace) await pool.query(`DELETE FROM vpi_observations WHERE month=$1`, [month])
      await importObservations(jobId, stamped)

      const hasCov  = await checkMonthExists(month, 'coverage')
      const kpiResult = hasCov ? await recalculateKPIs(month) : null

      await pool.query(`UPDATE vpi_upload_jobs SET status='completed' WHERE id=$1`, [jobId])
      res.json({ success: true, jobId, month, rowCount: stamped.length, kpiCalculated: !!kpiResult, kpi: kpiResult })
    } catch (err) {
      if (jobId) await pool.query(`UPDATE vpi_upload_jobs SET status='failed',error_message=$1 WHERE id=$2`, [err.message, jobId])
      console.error('[vpi] obs upload:', err.message)
      res.status(400).json({ error: err.message })
    }
  }
)

// ─── Upload: Coverage ─────────────────────────────────────────────────────────

router.post('/upload/coverage',
  requireRole('admin', 'executive', 'manager'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ملف Excel مطلوب' })
    const { month } = req.body
    const replace   = req.body.replace === 'true'

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'الشهر مطلوب بصيغة YYYY-MM' })
    }

    let jobId
    try {
      const exists = await checkMonthExists(month, 'coverage')
      if (exists && !replace) {
        return res.status(409).json({ error: `بيانات التغطية لشهر ${month} موجودة مسبقاً`, code: 'MONTH_EXISTS', month })
      }

      const rows = parseCoverageExcel(req.file.buffer)
      if (!rows.length) return res.status(400).json({ error: 'الملف فارغ أو لا يحتوي بيانات صالحة' })

      const stamped = rows.map(r => ({ ...r, month }))

      const { rows: [job] } = await pool.query(
        `INSERT INTO vpi_upload_jobs (month,upload_type,status,uploaded_by,file_name,row_count)
         VALUES ($1,'coverage','processing',$2,$3,$4) RETURNING id`,
        [month, req.user.id, req.file.originalname, stamped.length]
      )
      jobId = job.id

      if (exists && replace) await pool.query(`DELETE FROM vpi_coverage WHERE month=$1`, [month])
      await importCoverage(jobId, stamped)

      const hasObs    = await checkMonthExists(month, 'observations')
      const kpiResult = hasObs ? await recalculateKPIs(month) : null

      await pool.query(`UPDATE vpi_upload_jobs SET status='completed' WHERE id=$1`, [jobId])
      res.json({ success: true, jobId, month, rowCount: stamped.length, kpiCalculated: !!kpiResult, kpi: kpiResult })
    } catch (err) {
      if (jobId) await pool.query(`UPDATE vpi_upload_jobs SET status='failed',error_message=$1 WHERE id=$2`, [err.message, jobId])
      console.error('[vpi] cov upload:', err.message)
      res.status(400).json({ error: err.message })
    }
  }
)

// ─── Metadata Endpoints ───────────────────────────────────────────────────────

router.get('/months',        async (_req, res) => res.json({ months:         await getAvailableMonths() }))
router.get('/municipalities', async (_req, res) => res.json({ municipalities: await getMunicipalityList() }))

// ─── Executive Summary ────────────────────────────────────────────────────────

router.get('/executive/summary', async (req, res) => {
  if (isRestricted(req)) return res.status(403).json({ error: 'Forbidden' })
  const months      = await getAvailableMonths()
  const month       = req.query.month || months[0]
  if (!month) return res.json({ month: null, summary: null, insights: [] })
  const result = await generateExecutiveSummary(month)
  res.json({ month, ...result })
})

// ─── Dashboards ───────────────────────────────────────────────────────────────

router.get('/dashboard/amanah', async (req, res) => {
  if (!['admin', 'executive', 'auditor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'لوحة الأمانة للمديرين التنفيذيين فقط' })
  }
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: null })
  res.json({ month, data: await getAmanahDashboard(month) })
})

router.get('/dashboard/municipality', async (req, res) => {
  const months   = await getAvailableMonths()
  const month    = req.query.month || months[0]
  const muniName = muniScope(req, req.query.municipality)
  if (!month)    return res.json({ month: null, data: null })
  if (!muniName) return res.status(400).json({ error: 'اسم البلدية مطلوب' })
  res.json({ month, municipality: muniName, data: await getMunicipalityDashboard(muniName, month) })
})

// ─── Top Impact ───────────────────────────────────────────────────────────────

router.get('/top/municipalities', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })
  res.json({ month, data: await getTopMunicipalities(month, parseInt(req.query.limit) || 5) })
})

router.get('/top/elements', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })
  const muni = req.query.municipality || null
  const zone = req.query.zone         || null
  res.json({ month, data: await getTopElements(month, parseInt(req.query.limit) || 5, muni, zone) })
})

router.get('/top/zones', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })
  res.json({ month, data: await getTopZones(month, parseInt(req.query.limit) || 5) })
})

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get('/analytics/reports-vs-units', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })
  res.json({ month, data: await getReportsVsUnits(month, muniScope(req, req.query.municipality)) })
})

router.get('/analytics/zones', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })
  res.json({ month, data: await getPriorityZoneAnalytics(month, muniScope(req, req.query.municipality)) })
})

router.get('/analytics/trend', async (req, res) => {
  res.json({ data: await getHistoricalTrend(parseInt(req.query.months) || 12) })
})

// ─── Targets ─────────────────────────────────────────────────────────────────

router.get('/targets', async (_req, res) => {
  res.json({ targets: await getAllTargets() })
})

router.post('/targets', requireRole('admin', 'executive'), async (req, res) => {
  const { year, vpi_target, coverage_target, notes } = req.body
  if (!year || !vpi_target || !coverage_target) {
    return res.status(400).json({ error: 'السنة والمستهدفات مطلوبة' })
  }
  const result = await upsertTarget(year, vpi_target, coverage_target, notes, req.user.id)
  res.json({ target: result })
})

// ─── Upload History ───────────────────────────────────────────────────────────

// Recalculate KPIs for all months that have both obs + coverage data
router.post('/recalculate', requireRole('admin', 'executive'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT o.month
      FROM vpi_observations o
      WHERE EXISTS (SELECT 1 FROM vpi_coverage c WHERE c.month = o.month)
      ORDER BY o.month
    `)
    const results = []
    for (const { month } of rows) {
      try {
        const r = await recalculateKPIs(month)
        results.push({ month, status: 'ok', vpi: r.amanahVPI?.toFixed(4) })
      } catch (err) {
        results.push({ month, status: 'error', error: err.message })
      }
    }
    res.json({ results, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/uploads/history', requireRole('admin', 'executive', 'manager'), async (_req, res) => {
  res.json({ data: await getUploadHistory() })
})

export default router
