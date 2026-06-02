// VDI Service — مؤشر التشوه البصري
// KPI Engine: ETL (Excel → DB) + KPI Calculation + Historical Analytics

import * as XLSX from 'xlsx'
import pool from './db.js'

// ─── Excel Parsers ────────────────────────────────────────────────────────────

function norm(h) {
  return String(h).trim().toLowerCase().replace(/\s+/g, '_')
}

// Find a cell value by checking multiple Arabic/English column name aliases
function col(row, ...aliases) {
  for (const alias of aliases) {
    const a = norm(alias)
    const key = Object.keys(row).find(k => norm(k).includes(a) || a.includes(norm(k).substring(0, 4)))
    if (key !== undefined && row[key] !== '' && row[key] !== null && row[key] !== undefined) {
      return row[key]
    }
  }
  return null
}

export function parseObservationsExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return rows
    .map((row, i) => {
      const month      = String(col(row, 'month', 'الشهر', 'شهر') || '').trim()
      const muni       = String(col(row, 'municipality', 'بلدية', 'البلدية', 'municipality_name', 'اسم_البلدية') || '').trim()
      const zone       = String(col(row, 'priority_zone', 'منطقة', 'zone', 'priority zone name', 'priority_zone_name', 'منطقة_الأولوية') || '').trim()
      const element    = String(col(row, 'element', 'عنصر', 'العنصر', 'visual_distortion', 'visual distortion element', 'element_name', 'عنصر_التشوه') || '').trim()
      const units      = parseFloat(col(row, 'units', 'وحدة', 'الوحدات', 'units_count', 'units count', 'عدد_الوحدات') || 0)
      const cluster    = String(col(row, 'cluster', 'clusterid', 'cluster_id', 'مجموعة') || '').trim()

      if (!muni || !element) {
        throw new Error(`الصف ${i + 2}: اسم البلدية والعنصر مطلوبان`)
      }

      return {
        month,
        municipality_name:  muni,
        priority_zone_name: zone  || null,
        element_name:       element,
        units_count:        isNaN(units) ? 0 : units,
        cluster_id:         cluster || null,
      }
    })
    .filter(r => r.municipality_name && r.element_name)
}

export function parseCoverageExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return rows
    .map((row, i) => {
      const month      = String(col(row, 'month', 'الشهر', 'شهر') || '').trim()
      const muni       = String(col(row, 'municipality', 'بلدية', 'البلدية', 'municipality_name', 'اسم_البلدية') || '').trim()
      const zone       = String(col(row, 'priority_zone', 'منطقة', 'zone', 'priority zone name', 'priority_zone_name', 'منطقة_الأولوية') || '').trim()
      const zoneArea   = parseFloat(col(row, 'zone_area', 'مساحة_المنطقة', 'zone area', 'مساحة المنطقة') || 0)
      const covArea    = parseFloat(col(row, 'covered_area', 'المساحة_المغطاة', 'covered area', 'مساحة مغطاة', 'مغطاة') || 0)
      const covPct     = parseFloat(col(row, 'coverage_percentage', 'نسبة_التغطية', 'coverage percentage', 'نسبة التغطية', 'نسبة') || 0)

      if (!muni) throw new Error(`الصف ${i + 2}: اسم البلدية مطلوب`)

      return {
        month,
        municipality_name:  muni,
        priority_zone_name: zone    || null,
        zone_area:          isNaN(zoneArea) ? null : zoneArea,
        covered_area:       isNaN(covArea)  ? 0    : covArea,
        coverage_percentage: isNaN(covPct)  ? null : covPct,
      }
    })
    .filter(r => r.municipality_name)
}

// ─── Month Existence Check ────────────────────────────────────────────────────

export async function checkMonthExists(month, uploadType) {
  const table = uploadType === 'observations' ? 'vdi_observations' : 'vdi_coverage'
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE month = $1`,
    [month]
  )
  return parseInt(res.rows[0].cnt) > 0
}

// ─── Import Functions ─────────────────────────────────────────────────────────

export async function importObservations(jobId, rows) {
  if (!rows.length) return 0
  // Batch insert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const vals  = chunk.map((_, j) => {
      const b = j * 7
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`
    }).join(',')
    const params = chunk.flatMap(r => [
      jobId, r.month, r.municipality_name, r.priority_zone_name,
      r.element_name, r.units_count, r.cluster_id,
    ])
    await pool.query(
      `INSERT INTO vdi_observations
         (upload_job_id,month,municipality_name,priority_zone_name,element_name,units_count,cluster_id)
       VALUES ${vals}`,
      params
    )
  }
  return rows.length
}

export async function importCoverage(jobId, rows) {
  if (!rows.length) return 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const vals  = chunk.map((_, j) => {
      const b = j * 7
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`
    }).join(',')
    const params = chunk.flatMap(r => [
      jobId, r.month, r.municipality_name, r.priority_zone_name,
      r.zone_area, r.covered_area, r.coverage_percentage,
    ])
    await pool.query(
      `INSERT INTO vdi_coverage
         (upload_job_id,month,municipality_name,priority_zone_name,zone_area,covered_area,coverage_percentage)
       VALUES ${vals}`,
      params
    )
  }
  return rows.length
}

// ─── KPI Recalculation ────────────────────────────────────────────────────────
// Formulas:
//   Municipality VDI   = municipality_units / municipality_covered_area
//   Amanah VDI         = sum(all_units) / sum(all_covered_area)
//   Contribution %     = municipality_units / amanah_units * 100
//   Element contrib %  = element_units / amanah_units * 100

export async function recalculateKPIs(month) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Aggregate observations per municipality
    const { rows: obsRows } = await client.query(`
      SELECT municipality_name,
             COUNT(*)::int    AS report_count,
             SUM(units_count) AS total_units
      FROM vdi_observations WHERE month = $1
      GROUP BY municipality_name
    `, [month])

    // Aggregate coverage per municipality
    const { rows: covRows } = await client.query(`
      SELECT municipality_name,
             SUM(covered_area) AS covered_area,
             SUM(zone_area)    AS zone_area
      FROM vdi_coverage WHERE month = $1
      GROUP BY municipality_name
    `, [month])

    const covMap = {}
    covRows.forEach(r => {
      covMap[r.municipality_name] = {
        covered_area: parseFloat(r.covered_area) || 0,
        zone_area:    r.zone_area != null ? parseFloat(r.zone_area) : null,
      }
    })

    // Amanah totals
    const amanahUnits   = obsRows.reduce((s, r) => s + parseFloat(r.total_units), 0)
    const amanahCovered = Object.values(covMap).reduce((s, c) => s + c.covered_area, 0)
    const amanahVDI     = amanahCovered > 0 ? amanahUnits / amanahCovered : 0
    const amanahReports = obsRows.reduce((s, r) => s + r.report_count, 0)

    // Upsert Amanah KPI
    await client.query(`
      INSERT INTO vdi_amanah_kpi
        (month, total_units, total_covered_area, vdi, report_count, municipality_count, calculated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (month) DO UPDATE SET
        total_units        = EXCLUDED.total_units,
        total_covered_area = EXCLUDED.total_covered_area,
        vdi                = EXCLUDED.vdi,
        report_count       = EXCLUDED.report_count,
        municipality_count = EXCLUDED.municipality_count,
        calculated_at      = NOW()
    `, [month, amanahUnits, amanahCovered, amanahVDI, amanahReports, obsRows.length])

    // Upsert municipality KPIs
    for (const row of obsRows) {
      const cov        = covMap[row.municipality_name] || { covered_area: 0, zone_area: null }
      const muniVDI    = cov.covered_area > 0 ? parseFloat(row.total_units) / cov.covered_area : 0
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0

      await client.query(`
        INSERT INTO vdi_municipality_kpi
          (month, municipality_name, report_count, total_units, covered_area, zone_area,
           vdi, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (month, municipality_name) DO UPDATE SET
          report_count     = EXCLUDED.report_count,
          total_units      = EXCLUDED.total_units,
          covered_area     = EXCLUDED.covered_area,
          zone_area        = EXCLUDED.zone_area,
          vdi              = EXCLUDED.vdi,
          amanah_units     = EXCLUDED.amanah_units,
          contribution_pct = EXCLUDED.contribution_pct,
          calculated_at    = NOW()
      `, [month, row.municipality_name, row.report_count, row.total_units,
          cov.covered_area, cov.zone_area, muniVDI, amanahUnits, contribPct])
    }

    // Element KPIs (Amanah-wide, municipality_name IS NULL)
    const { rows: elemRows } = await client.query(`
      SELECT element_name,
             COUNT(*)::int    AS report_count,
             SUM(units_count) AS total_units
      FROM vdi_observations WHERE month = $1
      GROUP BY element_name
      ORDER BY total_units DESC
    `, [month])

    await client.query(`DELETE FROM vdi_element_kpi WHERE month=$1 AND municipality_name IS NULL`, [month])
    for (const row of elemRows) {
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vdi_element_kpi
          (month, element_name, municipality_name, report_count, total_units, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,NULL,$3,$4,$5,$6,NOW())
        ON CONFLICT (month, element_name, municipality_name) DO NOTHING
      `, [month, row.element_name, row.report_count, row.total_units, amanahUnits, contribPct])
    }

    // Priority zone KPIs
    const { rows: zoneObsRows } = await client.query(`
      SELECT municipality_name, priority_zone_name,
             COUNT(*)::int    AS report_count,
             SUM(units_count) AS total_units
      FROM vdi_observations
      WHERE month=$1 AND priority_zone_name IS NOT NULL
      GROUP BY municipality_name, priority_zone_name
    `, [month])

    const { rows: zoneCovRows } = await client.query(`
      SELECT municipality_name, priority_zone_name,
             SUM(covered_area) AS covered_area,
             SUM(zone_area)    AS zone_area
      FROM vdi_coverage
      WHERE month=$1 AND priority_zone_name IS NOT NULL
      GROUP BY municipality_name, priority_zone_name
    `, [month])

    const zoneCovMap = {}
    zoneCovRows.forEach(r => {
      zoneCovMap[`${r.municipality_name}__${r.priority_zone_name}`] = {
        covered_area: parseFloat(r.covered_area) || 0,
        zone_area:    r.zone_area != null ? parseFloat(r.zone_area) : null,
      }
    })

    const muniUnitsMap = {}
    obsRows.forEach(r => { muniUnitsMap[r.municipality_name] = parseFloat(r.total_units) })

    await client.query(`DELETE FROM vdi_zone_kpi WHERE month=$1`, [month])
    for (const row of zoneObsRows) {
      const key       = `${row.municipality_name}__${row.priority_zone_name}`
      const cov       = zoneCovMap[key] || { covered_area: 0, zone_area: null }
      const zoneVDI   = cov.covered_area > 0 ? parseFloat(row.total_units) / cov.covered_area : 0
      const muniUnits = muniUnitsMap[row.municipality_name] || 0
      const contribPct = muniUnits > 0 ? (parseFloat(row.total_units) / muniUnits) * 100 : 0

      await client.query(`
        INSERT INTO vdi_zone_kpi
          (month, municipality_name, priority_zone_name, report_count, total_units,
           covered_area, zone_area, vdi, municipality_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      `, [month, row.municipality_name, row.priority_zone_name,
          row.report_count, row.total_units, cov.covered_area, cov.zone_area,
          zoneVDI, muniUnits, contribPct])
    }

    await client.query('COMMIT')
    return { amanahVDI, amanahUnits, amanahCovered, municipalityCount: obsRows.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Dashboard Queries ────────────────────────────────────────────────────────

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export async function getAvailableMonths() {
  const res = await pool.query(
    `SELECT DISTINCT month FROM vdi_amanah_kpi ORDER BY month DESC`
  )
  return res.rows.map(r => r.month)
}

export async function getAmanahDashboard(month) {
  const [current, prev, trend] = await Promise.all([
    pool.query(`SELECT * FROM vdi_amanah_kpi WHERE month=$1`, [month]),
    pool.query(`SELECT * FROM vdi_amanah_kpi WHERE month=$1`, [prevMonth(month)]),
    pool.query(
      `SELECT month, vdi, total_units, report_count, municipality_count
       FROM vdi_amanah_kpi
       WHERE month LIKE $1
       ORDER BY month ASC`,
      [`${month.substring(0, 4)}-%`]
    ),
  ])
  return {
    current:  current.rows[0]  || null,
    previous: prev.rows[0]     || null,
    trend:    trend.rows,
  }
}

export async function getMunicipalityDashboard(municipalityName, month) {
  const current = await pool.query(
    `SELECT * FROM vdi_municipality_kpi WHERE month=$1 AND municipality_name ILIKE $2`,
    [month, `%${municipalityName}%`]
  )
  if (!current.rows.length) return null
  const kpi = current.rows[0]

  const [prev, trend] = await Promise.all([
    pool.query(
      `SELECT * FROM vdi_municipality_kpi WHERE month=$1 AND municipality_name=$2`,
      [prevMonth(month), kpi.municipality_name]
    ),
    pool.query(
      `SELECT month, vdi, total_units, report_count, contribution_pct
       FROM vdi_municipality_kpi
       WHERE month LIKE $1 AND municipality_name=$2
       ORDER BY month ASC`,
      [`${month.substring(0, 4)}-%`, kpi.municipality_name]
    ),
  ])
  return { current: kpi, previous: prev.rows[0] || null, trend: trend.rows }
}

export async function getTopMunicipalities(month, limit = 5) {
  const res = await pool.query(
    `SELECT municipality_name, report_count, total_units, covered_area, vdi, contribution_pct
     FROM vdi_municipality_kpi WHERE month=$1
     ORDER BY total_units DESC LIMIT $2`,
    [month, limit]
  )
  return res.rows
}

export async function getTopElements(month, limit = 5) {
  const res = await pool.query(
    `SELECT element_name, report_count, total_units, amanah_units, contribution_pct
     FROM vdi_element_kpi WHERE month=$1 AND municipality_name IS NULL
     ORDER BY total_units DESC LIMIT $2`,
    [month, limit]
  )
  return res.rows
}

export async function getReportsVsUnits(month, municipalityName) {
  const params = [month]
  let where = 'WHERE month=$1'
  if (municipalityName) {
    where += ' AND municipality_name ILIKE $2'
    params.push(`%${municipalityName}%`)
  }
  const res = await pool.query(
    `SELECT municipality_name, element_name,
            COUNT(*)::int        AS report_count,
            SUM(units_count)     AS total_units,
            AVG(units_count)::numeric(10,2) AS avg_units_per_report
     FROM vdi_observations ${where}
     GROUP BY municipality_name, element_name
     ORDER BY total_units DESC`,
    params
  )
  return res.rows
}

export async function getPriorityZoneAnalytics(month, municipalityName) {
  const params = [month]
  let where = 'WHERE month=$1'
  if (municipalityName) {
    where += ' AND municipality_name ILIKE $2'
    params.push(`%${municipalityName}%`)
  }
  const res = await pool.query(
    `SELECT municipality_name, priority_zone_name,
            report_count, total_units, covered_area, zone_area, vdi, contribution_pct
     FROM vdi_zone_kpi ${where}
     ORDER BY total_units DESC`,
    params
  )
  return res.rows
}

export async function getHistoricalTrend(months = 12) {
  const res = await pool.query(
    `SELECT month, vdi, total_units, total_covered_area, report_count, municipality_count
     FROM vdi_amanah_kpi ORDER BY month DESC LIMIT $1`,
    [months]
  )
  return res.rows.reverse()
}

export async function getUploadHistory() {
  const res = await pool.query(
    `SELECT j.id, j.month, j.upload_type, j.status, j.file_name,
            j.row_count, j.error_message, j.created_at,
            u.full_name AS uploaded_by_name
     FROM vdi_upload_jobs j
     LEFT JOIN users u ON u.id = j.uploaded_by
     ORDER BY j.created_at DESC LIMIT 30`
  )
  return res.rows
}

// ─── AI Copilot Query ─────────────────────────────────────────────────────────

export async function getVDIForAI({ month, municipalityName }) {
  const months = await getAvailableMonths()
  const targetMonth = month || months[0]
  if (!targetMonth) return { error: 'لا توجد بيانات VDI بعد' }

  if (municipalityName) {
    const data = await getMunicipalityDashboard(municipalityName, targetMonth)
    return { month: targetMonth, municipality: municipalityName, data }
  }

  const [amanah, topMunis, topElements] = await Promise.all([
    getAmanahDashboard(targetMonth),
    getTopMunicipalities(targetMonth, 5),
    getTopElements(targetMonth, 5),
  ])
  return { month: targetMonth, amanah, topMunicipalities: topMunis, topElements }
}

export async function getMunicipalityList() {
  const res = await pool.query(
    `SELECT DISTINCT municipality_name FROM vdi_municipality_kpi ORDER BY municipality_name`
  )
  return res.rows.map(r => r.municipality_name)
}
