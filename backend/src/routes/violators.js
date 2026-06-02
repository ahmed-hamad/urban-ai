// Violator Registry — persistent lookup by establishment/contractor/beneficiary identifier
// Enables pre-filling future reports and tracking repeat violators.

import { Router } from 'express'
import { requirePermission } from '../middleware/auth.js'
import { query }            from '../services/db.js'

const router = Router()

// ─── Lookup by identifier ─────────────────────────────────────────────────────
// GET /api/violators/lookup?type=establishment&key=<commercial_reg_or_license>
router.get('/lookup', requirePermission('view_reports'), async (req, res) => {
  const { type, key } = req.query
  if (!type || !key?.trim()) return res.status(400).json({ error: 'type و key مطلوبان' })

  const { rows } = await query(
    `SELECT id, type, name, data, report_count, created_at
     FROM violators WHERE type=$1 AND lookup_key=$2 LIMIT 1`,
    [type, key.trim()]
  )
  if (!rows.length) return res.json({ found: false })

  // Also pull previous report numbers for this violator
  const { rows: rpts } = await query(
    `SELECT report_number, element_label, status, created_at
     FROM reports
     WHERE violations_data->>'violatorLookupKey' = $1
     ORDER BY created_at DESC LIMIT 5`,
    [key.trim()]
  )

  res.json({ found: true, violator: rows[0], previousReports: rpts })
})

// ─── Upsert violator ──────────────────────────────────────────────────────────
// POST /api/violators/upsert
// Body: { type, lookupKey, name, data }
router.post('/upsert', requirePermission('view_reports'), async (req, res) => {
  const { type, lookupKey, name, data = {} } = req.body
  if (!type || !lookupKey?.trim()) return res.status(400).json({ error: 'type و lookupKey مطلوبان' })

  const { rows } = await query(`
    INSERT INTO violators (type, lookup_key, name, data)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (type, lookup_key) DO UPDATE SET
      name         = COALESCE(EXCLUDED.name, violators.name),
      data         = violators.data || EXCLUDED.data,
      report_count = violators.report_count + 1,
      updated_at   = NOW()
    RETURNING id, type, name, report_count
  `, [type, lookupKey.trim(), name || null, JSON.stringify(data)])

  res.json({ violator: rows[0] })
})

// ─── Stats for a violator (repeat violations) ─────────────────────────────────
router.get('/:type/:key/history', requirePermission('view_reports'), async (req, res) => {
  const { type, key } = req.params
  const { rows } = await query(
    `SELECT id, name, data, report_count FROM violators WHERE type=$1 AND lookup_key=$2`,
    [type, key]
  )
  if (!rows.length) return res.json({ found: false })

  const { rows: rpts } = await query(
    `SELECT id, report_number, element_label, element_id, status, created_at,
            estimated_fine, closure_type
     FROM reports
     WHERE violations_data->>'violatorLookupKey' = $1
     ORDER BY created_at DESC LIMIT 20`,
    [key]
  )
  res.json({ found: true, violator: rows[0], reports: rpts })
})

export default router
