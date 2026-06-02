// VDI Routes — مؤشر التشوه البصري
// Upload Excel datasets → ETL → KPI storage → Dashboard queries

import { Router }  from 'express'
import multer      from 'multer'
import { requireRole } from '../middleware/auth.js'
import pool from '../services/db.js'
import {
  parseObservationsExcel,
  parseCoverageExcel,
  checkMonthExists,
  importObservations,
  importCoverage,
  recalculateKPIs,
  getAvailableMonths,
  getAmanahDashboard,
  getMunicipalityDashboard,
  getTopMunicipalities,
  getTopElements,
  getReportsVsUnits,
  getPriorityZoneAnalytics,
  getHistoricalTrend,
  getUploadHistory,
  getMunicipalityList,
} from '../services/vdiService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// RBAC: managers see only their scoped data; admins/executives/auditors see all
function muniFilter(req, requestedMuni) {
  if (['admin', 'executive', 'auditor'].includes(req.user.role)) return requestedMuni || null
  return req.user.entityName || req.user.entity || requestedMuni || null
}

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
        return res.status(409).json({
          error: `بيانات الرصد لشهر ${month} موجودة مسبقاً`,
          code: 'MONTH_EXISTS',
          month,
        })
      }

      const rows = parseObservationsExcel(req.file.buffer)
      if (!rows.length) return res.status(400).json({ error: 'الملف فارغ أو لا يحتوي بيانات صالحة' })

      // Stamp month on each row (from request, overrides any month in the file)
      const stamped = rows.map(r => ({ ...r, month }))

      const { rows: [job] } = await pool.query(
        `INSERT INTO vdi_upload_jobs (month, upload_type, status, uploaded_by, file_name, row_count)
         VALUES ($1,'observations','processing',$2,$3,$4) RETURNING id`,
        [month, req.user.id, req.file.originalname, stamped.length]
      )
      jobId = job.id

      if (exists && replace) {
        await pool.query(`DELETE FROM vdi_observations WHERE month=$1`, [month])
      }

      await importObservations(jobId, stamped)

      // Re-calculate KPIs if coverage data is also available for this month
      const hasCoverage = await checkMonthExists(month, 'coverage')
      const kpiResult   = hasCoverage ? await recalculateKPIs(month) : null

      await pool.query(`UPDATE vdi_upload_jobs SET status='completed' WHERE id=$1`, [jobId])

      res.json({
        success: true, jobId, month,
        rowCount: stamped.length,
        kpiCalculated: !!kpiResult,
        kpi: kpiResult,
      })
    } catch (err) {
      if (jobId) {
        await pool.query(
          `UPDATE vdi_upload_jobs SET status='failed', error_message=$1 WHERE id=$2`,
          [err.message, jobId]
        )
      }
      console.error('[vdi] obs upload error:', err.message)
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
        return res.status(409).json({
          error: `بيانات التغطية لشهر ${month} موجودة مسبقاً`,
          code: 'MONTH_EXISTS',
          month,
        })
      }

      const rows = parseCoverageExcel(req.file.buffer)
      if (!rows.length) return res.status(400).json({ error: 'الملف فارغ أو لا يحتوي بيانات صالحة' })

      const stamped = rows.map(r => ({ ...r, month }))

      const { rows: [job] } = await pool.query(
        `INSERT INTO vdi_upload_jobs (month, upload_type, status, uploaded_by, file_name, row_count)
         VALUES ($1,'coverage','processing',$2,$3,$4) RETURNING id`,
        [month, req.user.id, req.file.originalname, stamped.length]
      )
      jobId = job.id

      if (exists && replace) {
        await pool.query(`DELETE FROM vdi_coverage WHERE month=$1`, [month])
      }

      await importCoverage(jobId, stamped)

      const hasObs    = await checkMonthExists(month, 'observations')
      const kpiResult = hasObs ? await recalculateKPIs(month) : null

      await pool.query(`UPDATE vdi_upload_jobs SET status='completed' WHERE id=$1`, [jobId])

      res.json({
        success: true, jobId, month,
        rowCount: stamped.length,
        kpiCalculated: !!kpiResult,
        kpi: kpiResult,
      })
    } catch (err) {
      if (jobId) {
        await pool.query(
          `UPDATE vdi_upload_jobs SET status='failed', error_message=$1 WHERE id=$2`,
          [err.message, jobId]
        )
      }
      console.error('[vdi] cov upload error:', err.message)
      res.status(400).json({ error: err.message })
    }
  }
)

// ─── Query Endpoints ──────────────────────────────────────────────────────────

router.get('/months', async (_req, res) => {
  const months = await getAvailableMonths()
  res.json({ months })
})

router.get('/municipalities', async (_req, res) => {
  const list = await getMunicipalityList()
  res.json({ municipalities: list })
})

router.get('/dashboard/amanah', async (req, res) => {
  if (!['admin', 'executive', 'auditor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'لوحة الأمانة للمديرين فقط' })
  }
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: null })

  const data = await getAmanahDashboard(month)
  res.json({ month, data })
})

router.get('/dashboard/municipality', async (req, res) => {
  const months    = await getAvailableMonths()
  const month     = req.query.month || months[0]
  const muniName  = muniFilter(req, req.query.municipality)

  if (!month)    return res.json({ month: null, data: null })
  if (!muniName) return res.status(400).json({ error: 'اسم البلدية مطلوب' })

  const data = await getMunicipalityDashboard(muniName, month)
  res.json({ month, municipality: muniName, data })
})

router.get('/top/municipalities', async (req, res) => {
  const months  = await getAvailableMonths()
  const month   = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })

  const data = await getTopMunicipalities(month, parseInt(req.query.limit) || 5)
  res.json({ month, data })
})

router.get('/top/elements', async (req, res) => {
  const months  = await getAvailableMonths()
  const month   = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })

  const data = await getTopElements(month, parseInt(req.query.limit) || 5)
  res.json({ month, data })
})

router.get('/analytics/reports-vs-units', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })

  const muni = muniFilter(req, req.query.municipality)
  const data = await getReportsVsUnits(month, muni)
  res.json({ month, data })
})

router.get('/analytics/zones', async (req, res) => {
  const months = await getAvailableMonths()
  const month  = req.query.month || months[0]
  if (!month) return res.json({ month: null, data: [] })

  const muni = muniFilter(req, req.query.municipality)
  const data = await getPriorityZoneAnalytics(month, muni)
  res.json({ month, data })
})

router.get('/analytics/trend', async (req, res) => {
  const data = await getHistoricalTrend(parseInt(req.query.months) || 12)
  res.json({ data })
})

router.get('/uploads/history', requireRole('admin', 'executive', 'manager'), async (_req, res) => {
  const data = await getUploadHistory()
  res.json({ data })
})

export default router
