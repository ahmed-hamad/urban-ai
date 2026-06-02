// VPI Service — مؤشر التشوه البصري (Visual Pollution Index)
// ETL: Excel → DB  |  KPI Engine: VPI, Coverage, Contribution  |  Executive Analytics

import * as XLSX from 'xlsx'
import pool from './db.js'

// ─── Arabic constants ─────────────────────────────────────────────────────────

const ARABIC_MONTHS = {
  '01': 'يناير', '02': 'فبراير', '03': 'مارس',    '04': 'أبريل',
  '05': 'مايو',  '06': 'يونيو',  '07': 'يوليو',   '08': 'أغسطس',
  '09': 'سبتمبر','10': 'أكتوبر', '11': 'نوفمبر', '12': 'ديسمبر',
}

function monthLabel(month) {
  const [y, m] = month.split('-')
  return `${ARABIC_MONTHS[m] || m} ${y}`
}

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// ─── Excel Column Finder ──────────────────────────────────────────────────────

function findCol(row, aliases) {
  for (const alias of aliases) {
    const a = alias.toLowerCase().replace(/\s+/g, '').replace(/[^a-zأ-ي0-9]/g, '')
    for (const key of Object.keys(row)) {
      const k = String(key).toLowerCase().replace(/\s+/g, '').replace(/[^a-zأ-ي0-9]/g, '')
      if (k === a || k.includes(a) || a.includes(k)) {
        const val = row[key]
        if (val !== null && val !== undefined && val !== '') return val
      }
    }
  }
  return null
}

// ─── Excel Parsers ────────────────────────────────────────────────────────────

export function parseObservationsExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return rows
    .map((row, i) => {
      const month  = String(findCol(row, ['month','الشهر','شهر']) || '').trim()
      const muni   = String(findCol(row, ['municipality','بلدية','البلدية','اسمالبلدية','municipalityname']) || '').trim()
      const zone   = String(findCol(row, ['priorityzone','منطقةالأولوية','المنطقة','منطقة','zone','priorityzonename']) || '').trim()
      const elem   = String(findCol(row, ['element','عنصر','العنصر','عنصرالتشوهالبصري','visualpollutionelement','visualdistortionelement','elementname']) || '').trim()
      const units  = parseFloat(findCol(row, ['units','وحدات','الوحدات','عدد','عددالوحدات','unitscount']) || 0)
      const clust  = String(findCol(row, ['clusterid','cluster','مجموعة']) || '').trim()

      if (!muni || !elem) throw new Error(`الصف ${i + 2}: اسم البلدية والعنصر مطلوبان`)

      return {
        month,
        municipality_name:  muni,
        priority_zone_name: zone  || null,
        element_name:       elem,
        units_count:        isNaN(units) ? 0 : units,
        cluster_id:         clust || null,
      }
    })
    .filter(r => r.municipality_name && r.element_name)
}

export function parseCoverageExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return rows
    .map((row, i) => {
      const month     = String(findCol(row, ['month','الشهر','شهر']) || '').trim()
      const muni      = String(findCol(row, ['municipality','بلدية','البلدية','اسمالبلدية','municipalityname']) || '').trim()
      const zone      = String(findCol(row, ['priorityzone','منطقةالأولوية','المنطقة','منطقة','zone','priorityzonename']) || '').trim()
      // zone_area_km2: reference metadata (المساحة الكلية)
      const zoneArea  = parseFloat(findCol(row, ['zonearea','مساحةالمنطقة','المساحةالكلية','zoneareak','مساحةكلية']) || 0)
      // covered_area_km2: "المساحة (كم2)" — official VPI measurement
      const covArea   = parseFloat(findCol(row, ['coveredarea','المساحةكم','المساحة','مساحةمغطاة','coveredareak','coveredareakm2','مغطاة']) || 0)
      const covPct    = parseFloat(findCol(row, ['coveragepercent','نسبةالتغطية','نسبةتغطية','coverage','تغطية']) || 0)

      if (!muni) throw new Error(`الصف ${i + 2}: اسم البلدية مطلوب`)

      return {
        month,
        municipality_name:  muni,
        priority_zone_name: zone    || null,
        zone_area_km2:      isNaN(zoneArea) ? null : zoneArea,
        covered_area_km2:   isNaN(covArea)  ? 0    : covArea,
        coverage_rate:      isNaN(covPct)   ? null : covPct,
      }
    })
    .filter(r => r.municipality_name)
}

// ─── Month Existence Check ────────────────────────────────────────────────────

export async function checkMonthExists(month, uploadType) {
  const table = uploadType === 'observations' ? 'vpi_observations' : 'vpi_coverage'
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int cnt FROM ${table} WHERE month=$1`, [month]
  )
  return parseInt(rows[0].cnt) > 0
}

// ─── Batch Import ─────────────────────────────────────────────────────────────

export async function importObservations(jobId, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk  = rows.slice(i, i + 500)
    const vals   = chunk.map((_, j) => { const b = j * 7; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})` }).join(',')
    const params = chunk.flatMap(r => [jobId, r.month, r.municipality_name, r.priority_zone_name, r.element_name, r.units_count, r.cluster_id])
    await pool.query(
      `INSERT INTO vpi_observations (upload_job_id,month,municipality_name,priority_zone_name,element_name,units_count,cluster_id) VALUES ${vals}`,
      params
    )
  }
  return rows.length
}

export async function importCoverage(jobId, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk  = rows.slice(i, i + 500)
    const vals   = chunk.map((_, j) => { const b = j * 7; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})` }).join(',')
    const params = chunk.flatMap(r => [jobId, r.month, r.municipality_name, r.priority_zone_name, r.zone_area_km2, r.covered_area_km2, r.coverage_rate])
    await pool.query(
      `INSERT INTO vpi_coverage (upload_job_id,month,municipality_name,priority_zone_name,zone_area_km2,covered_area_km2,coverage_rate) VALUES ${vals}`,
      params
    )
  }
  return rows.length
}

// ─── KPI Recalculation ────────────────────────────────────────────────────────
// All calculations use covered_area_km2 (المساحة (كم2))
// Coverage Rate = covered_area / zone_area * 100
// VPI = total_units / covered_area_km2
// Contribution % = entity_units / amanah_units * 100

export async function recalculateKPIs(month) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Municipality aggregates ──
    const { rows: obsRows } = await client.query(`
      SELECT municipality_name,
             COUNT(*)::int    AS report_count,
             SUM(units_count) AS total_units
      FROM vpi_observations WHERE month=$1
      GROUP BY municipality_name
    `, [month])

    const { rows: covRows } = await client.query(`
      SELECT municipality_name,
             SUM(covered_area_km2) AS covered_area_km2,
             SUM(zone_area_km2)    AS zone_area_km2
      FROM vpi_coverage WHERE month=$1
      GROUP BY municipality_name
    `, [month])

    const covMap = {}
    covRows.forEach(r => {
      const cov  = parseFloat(r.covered_area_km2) || 0
      const zone = r.zone_area_km2 ? parseFloat(r.zone_area_km2) : null
      covMap[r.municipality_name] = {
        covered_area_km2: cov,
        zone_area_km2:    zone,
        coverage_rate:    (zone && zone > 0) ? (cov / zone * 100) : null,
      }
    })

    // ── Amanah totals ──
    const amanahUnits   = obsRows.reduce((s, r) => s + parseFloat(r.total_units), 0)
    const amanahCovered = Object.values(covMap).reduce((s, c) => s + c.covered_area_km2, 0)
    const amanahZone    = Object.values(covMap).every(c => c.zone_area_km2 != null)
      ? Object.values(covMap).reduce((s, c) => s + (c.zone_area_km2 || 0), 0)
      : null
    const amanahVPI     = amanahCovered > 0 ? amanahUnits / amanahCovered : 0
    const amanahCovRate = (amanahZone && amanahZone > 0) ? (amanahCovered / amanahZone * 100) : null
    const amanahReports = obsRows.reduce((s, r) => s + r.report_count, 0)

    // ── Store Amanah KPI ──
    await client.query(`
      INSERT INTO vpi_amanah_kpi
        (month, total_units, total_covered_area_km2, total_zone_area_km2, vpi, coverage_rate, report_count, municipality_count, calculated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (month) DO UPDATE SET
        total_units            = EXCLUDED.total_units,
        total_covered_area_km2 = EXCLUDED.total_covered_area_km2,
        total_zone_area_km2    = EXCLUDED.total_zone_area_km2,
        vpi                    = EXCLUDED.vpi,
        coverage_rate          = EXCLUDED.coverage_rate,
        report_count           = EXCLUDED.report_count,
        municipality_count     = EXCLUDED.municipality_count,
        calculated_at          = NOW()
    `, [month, amanahUnits, amanahCovered, amanahZone, amanahVPI, amanahCovRate, amanahReports, obsRows.length])

    // ── Store Municipality KPIs ──
    for (const row of obsRows) {
      const c           = covMap[row.municipality_name] || { covered_area_km2: 0, zone_area_km2: null, coverage_rate: null }
      const muniVPI     = c.covered_area_km2 > 0 ? parseFloat(row.total_units) / c.covered_area_km2 : 0
      const contribPct  = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vpi_municipality_kpi
          (month, municipality_name, report_count, total_units, covered_area_km2, zone_area_km2,
           vpi, coverage_rate, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (month, municipality_name) DO UPDATE SET
          report_count      = EXCLUDED.report_count,
          total_units       = EXCLUDED.total_units,
          covered_area_km2  = EXCLUDED.covered_area_km2,
          zone_area_km2     = EXCLUDED.zone_area_km2,
          vpi               = EXCLUDED.vpi,
          coverage_rate     = EXCLUDED.coverage_rate,
          amanah_units      = EXCLUDED.amanah_units,
          contribution_pct  = EXCLUDED.contribution_pct,
          calculated_at     = NOW()
      `, [month, row.municipality_name, row.report_count, row.total_units,
          c.covered_area_km2, c.zone_area_km2, muniVPI, c.coverage_rate, amanahUnits, contribPct])
    }

    // ── Element KPIs — Amanah-wide (municipality=NULL, zone=NULL) ──
    const { rows: elemRows } = await client.query(`
      SELECT element_name, COUNT(*)::int AS report_count, SUM(units_count) AS total_units
      FROM vpi_observations WHERE month=$1
      GROUP BY element_name ORDER BY total_units DESC
    `, [month])

    await client.query(`DELETE FROM vpi_element_kpi WHERE month=$1 AND municipality_name IS NULL AND priority_zone_name IS NULL`, [month])
    for (const row of elemRows) {
      const elemVPI    = amanahCovered > 0 ? parseFloat(row.total_units) / amanahCovered : 0
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vpi_element_kpi
          (month, element_name, municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, vpi, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT DO NOTHING
      `, [month, row.element_name, row.report_count, row.total_units, amanahCovered, elemVPI, amanahUnits, contribPct])
    }

    // ── Element KPIs — Municipality-level ──
    const { rows: elemMuniRows } = await client.query(`
      SELECT municipality_name, element_name,
             COUNT(*)::int AS report_count, SUM(units_count) AS total_units
      FROM vpi_observations WHERE month=$1
      GROUP BY municipality_name, element_name
    `, [month])

    await client.query(`DELETE FROM vpi_element_kpi WHERE month=$1 AND municipality_name IS NOT NULL AND priority_zone_name IS NULL`, [month])
    const muniUnitsMap = {}
    obsRows.forEach(r => { muniUnitsMap[r.municipality_name] = parseFloat(r.total_units) })

    for (const row of elemMuniRows) {
      const c          = covMap[row.municipality_name] || { covered_area_km2: 0 }
      const elemVPI    = c.covered_area_km2 > 0 ? parseFloat(row.total_units) / c.covered_area_km2 : 0
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vpi_element_kpi
          (month, element_name, municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, vpi, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT DO NOTHING
      `, [month, row.element_name, row.municipality_name, row.report_count, row.total_units,
          c.covered_area_km2, elemVPI, amanahUnits, contribPct])
    }

    // ── Priority Zone KPIs ──
    const { rows: zoneObsRows } = await client.query(`
      SELECT municipality_name, priority_zone_name,
             COUNT(*)::int AS report_count, SUM(units_count) AS total_units
      FROM vpi_observations WHERE month=$1 AND priority_zone_name IS NOT NULL
      GROUP BY municipality_name, priority_zone_name
    `, [month])

    const { rows: zoneCovRows } = await client.query(`
      SELECT municipality_name, priority_zone_name,
             SUM(covered_area_km2) AS covered_area_km2, SUM(zone_area_km2) AS zone_area_km2
      FROM vpi_coverage WHERE month=$1 AND priority_zone_name IS NOT NULL
      GROUP BY municipality_name, priority_zone_name
    `, [month])

    const zoneCovMap = {}
    zoneCovRows.forEach(r => {
      const cov  = parseFloat(r.covered_area_km2) || 0
      const zone = r.zone_area_km2 ? parseFloat(r.zone_area_km2) : null
      zoneCovMap[`${r.municipality_name}__${r.priority_zone_name}`] = {
        covered_area_km2: cov,
        zone_area_km2:    zone,
        coverage_rate:    (zone && zone > 0) ? (cov / zone * 100) : null,
      }
    })

    await client.query(`DELETE FROM vpi_zone_kpi WHERE month=$1`, [month])
    for (const row of zoneObsRows) {
      const key        = `${row.municipality_name}__${row.priority_zone_name}`
      const c          = zoneCovMap[key] || { covered_area_km2: 0, zone_area_km2: null, coverage_rate: null }
      const zoneVPI    = c.covered_area_km2 > 0 ? parseFloat(row.total_units) / c.covered_area_km2 : 0
      const muniUnits  = muniUnitsMap[row.municipality_name] || 0
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vpi_zone_kpi
          (month, municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, zone_area_km2, vpi, coverage_rate, amanah_units,
           municipality_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      `, [month, row.municipality_name, row.priority_zone_name,
          row.report_count, row.total_units, c.covered_area_km2, c.zone_area_km2,
          zoneVPI, c.coverage_rate, amanahUnits, muniUnits, contribPct])
    }

    // ── Zone-level Element KPIs ──
    const { rows: elemZoneRows } = await client.query(`
      SELECT municipality_name, priority_zone_name, element_name,
             COUNT(*)::int AS report_count, SUM(units_count) AS total_units
      FROM vpi_observations WHERE month=$1 AND priority_zone_name IS NOT NULL
      GROUP BY municipality_name, priority_zone_name, element_name
    `, [month])

    await client.query(`DELETE FROM vpi_element_kpi WHERE month=$1 AND priority_zone_name IS NOT NULL`, [month])
    for (const row of elemZoneRows) {
      const key        = `${row.municipality_name}__${row.priority_zone_name}`
      const c          = zoneCovMap[key] || { covered_area_km2: 0 }
      const elemVPI    = c.covered_area_km2 > 0 ? parseFloat(row.total_units) / c.covered_area_km2 : 0
      const contribPct = amanahUnits > 0 ? (parseFloat(row.total_units) / amanahUnits) * 100 : 0
      await client.query(`
        INSERT INTO vpi_element_kpi
          (month, element_name, municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, vpi, amanah_units, contribution_pct, calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT DO NOTHING
      `, [month, row.element_name, row.municipality_name, row.priority_zone_name,
          row.report_count, row.total_units, c.covered_area_km2, elemVPI, amanahUnits, contribPct])
    }

    await client.query('COMMIT')
    return { amanahVPI, amanahUnits, amanahCovered, municipalityCount: obsRows.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Targets ──────────────────────────────────────────────────────────────────

export async function getTargetForMonth(month) {
  const year = parseInt(month.split('-')[0])
  const { rows } = await pool.query(
    `SELECT * FROM vpi_targets WHERE year=$1`, [year]
  )
  return rows[0] || null
}

export async function getAllTargets() {
  const { rows } = await pool.query(`SELECT * FROM vpi_targets ORDER BY year DESC`)
  return rows
}

export async function upsertTarget(year, vpiTarget, coverageTarget, notes, userId) {
  const { rows } = await pool.query(`
    INSERT INTO vpi_targets (year, vpi_target, coverage_target, notes, created_by, updated_at)
    VALUES ($1,$2,$3,$4,$5,NOW())
    ON CONFLICT (year) DO UPDATE SET
      vpi_target      = EXCLUDED.vpi_target,
      coverage_target = EXCLUDED.coverage_target,
      notes           = EXCLUDED.notes,
      updated_at      = NOW()
    RETURNING *
  `, [year, vpiTarget, coverageTarget, notes || null, userId || null])
  return rows[0]
}

// ─── Dashboard Queries ────────────────────────────────────────────────────────

export async function getAvailableMonths() {
  const { rows } = await pool.query(
    `SELECT DISTINCT month FROM vpi_amanah_kpi ORDER BY month DESC`
  )
  return rows.map(r => r.month)
}

export async function getAmanahDashboard(month) {
  const [current, prev, trend, target] = await Promise.all([
    pool.query(`SELECT * FROM vpi_amanah_kpi WHERE month=$1`, [month]),
    pool.query(`SELECT * FROM vpi_amanah_kpi WHERE month=$1`, [prevMonth(month)]),
    pool.query(
      `SELECT month, vpi, total_units, report_count, coverage_rate, municipality_count
       FROM vpi_amanah_kpi WHERE month LIKE $1 ORDER BY month ASC`,
      [`${month.substring(0, 4)}-%`]
    ),
    getTargetForMonth(month),
  ])
  if (!current.rows.length) return null
  return {
    current:  current.rows[0],
    previous: prev.rows[0] || null,
    trend:    trend.rows,
    target,
  }
}

export async function getMunicipalityDashboard(municipalityName, month) {
  const current = await pool.query(
    `SELECT * FROM vpi_municipality_kpi WHERE month=$1 AND municipality_name ILIKE $2`,
    [month, `%${municipalityName}%`]
  )
  if (!current.rows.length) return null
  const kpi = current.rows[0]

  const [prev, trend, target] = await Promise.all([
    pool.query(
      `SELECT * FROM vpi_municipality_kpi WHERE month=$1 AND municipality_name=$2`,
      [prevMonth(month), kpi.municipality_name]
    ),
    pool.query(
      `SELECT month, vpi, total_units, report_count, contribution_pct, coverage_rate
       FROM vpi_municipality_kpi WHERE month LIKE $1 AND municipality_name=$2 ORDER BY month ASC`,
      [`${month.substring(0, 4)}-%`, kpi.municipality_name]
    ),
    getTargetForMonth(month),
  ])
  return { current: kpi, previous: prev.rows[0] || null, trend: trend.rows, target }
}

export async function getTopMunicipalities(month, limit = 5) {
  const { rows } = await pool.query(`
    SELECT municipality_name, report_count, total_units, covered_area_km2,
           zone_area_km2, vpi, coverage_rate, contribution_pct
    FROM vpi_municipality_kpi WHERE month=$1
    ORDER BY total_units DESC LIMIT $2
  `, [month, limit])
  return rows
}

export async function getTopElements(month, limit = 5, municipalityName = null, zoneName = null) {
  const params = [month]
  let where = `WHERE month=$1 AND municipality_name IS NULL AND priority_zone_name IS NULL`
  if (municipalityName && !zoneName) {
    where = `WHERE month=$1 AND municipality_name ILIKE $2 AND priority_zone_name IS NULL`
    params.push(`%${municipalityName}%`)
  } else if (municipalityName && zoneName) {
    where = `WHERE month=$1 AND municipality_name ILIKE $2 AND priority_zone_name ILIKE $3`
    params.push(`%${municipalityName}%`, `%${zoneName}%`)
  }
  params.push(limit)
  const { rows } = await pool.query(`
    SELECT element_name, municipality_name, priority_zone_name,
           report_count, total_units, covered_area_km2, vpi, contribution_pct
    FROM vpi_element_kpi ${where}
    ORDER BY total_units DESC LIMIT $${params.length}
  `, params)
  return rows
}

export async function getTopZones(month, limit = 5) {
  const { rows } = await pool.query(`
    SELECT municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, zone_area_km2, vpi, coverage_rate, contribution_pct
    FROM vpi_zone_kpi WHERE month=$1
    ORDER BY total_units DESC LIMIT $2
  `, [month, limit])
  return rows
}

export async function getReportsVsUnits(month, municipalityName = null) {
  const params = [month]
  let where = 'WHERE month=$1'
  if (municipalityName) {
    where += ` AND municipality_name ILIKE $2`
    params.push(`%${municipalityName}%`)
  }
  const { rows } = await pool.query(`
    SELECT municipality_name, element_name,
           COUNT(*)::int                   AS report_count,
           SUM(units_count)                AS total_units,
           AVG(units_count)::numeric(10,2) AS avg_units_per_report,
           COUNT(DISTINCT cluster_id) FILTER (WHERE cluster_id IS NOT NULL) AS distinct_clusters
    FROM vpi_observations ${where}
    GROUP BY municipality_name, element_name
    ORDER BY total_units DESC
  `, params)
  return rows
}

export async function getPriorityZoneAnalytics(month, municipalityName = null) {
  const params = [month]
  let where = 'WHERE month=$1'
  if (municipalityName) {
    where += ` AND municipality_name ILIKE $2`
    params.push(`%${municipalityName}%`)
  }
  const { rows } = await pool.query(`
    SELECT municipality_name, priority_zone_name, report_count, total_units,
           covered_area_km2, zone_area_km2, vpi, coverage_rate, contribution_pct
    FROM vpi_zone_kpi ${where}
    ORDER BY total_units DESC
  `, params)
  return rows
}

export async function getHistoricalTrend(months = 12) {
  const { rows } = await pool.query(`
    SELECT month, vpi, total_units, total_covered_area_km2, report_count,
           municipality_count, coverage_rate
    FROM vpi_amanah_kpi ORDER BY month DESC LIMIT $1
  `, [months])
  return rows.reverse()
}

export async function getMunicipalityList() {
  const { rows } = await pool.query(
    `SELECT DISTINCT municipality_name FROM vpi_municipality_kpi ORDER BY municipality_name`
  )
  return rows.map(r => r.municipality_name)
}

export async function getUploadHistory() {
  const { rows } = await pool.query(`
    SELECT j.id, j.month, j.upload_type, j.status, j.file_name,
           j.row_count, j.error_message, j.created_at, u.full_name AS uploaded_by_name
    FROM vpi_upload_jobs j
    LEFT JOIN users u ON u.id = j.uploaded_by
    ORDER BY j.created_at DESC LIMIT 30
  `)
  return rows
}

// ─── Executive Summary Engine ─────────────────────────────────────────────────

export async function generateExecutiveSummary(month) {
  const [dashboard, topMunis, topElems, topZones] = await Promise.all([
    getAmanahDashboard(month),
    getTopMunicipalities(month, 3),
    getTopElements(month, 3),
    getTopZones(month, 3),
  ])

  if (!dashboard?.current) return { summary: null, insights: [] }

  const { current: kpi, previous, target } = dashboard
  const vpi     = parseFloat(kpi.vpi)
  const covRate = kpi.coverage_rate ? parseFloat(kpi.coverage_rate) : null
  const label   = monthLabel(month)
  const lines   = []

  // VPI headline
  let vpiLine = `بلغ مؤشر التشوه البصري (VPI) للأمانة خلال شهر ${label} عدد ${vpi.toFixed(1)} مخالفة/كم²`
  if (target) {
    const t = parseFloat(target.vpi_target)
    const diff = Math.abs(((vpi - t) / t) * 100).toFixed(1)
    vpiLine += vpi < t
      ? `، وهو أفضل من المستهدف السنوي البالغ ${t} مخالفة/كم² بنسبة ${diff}%`
      : `، وهو أعلى من المستهدف السنوي البالغ ${t} مخالفة/كم² بنسبة ${diff}%`
  }
  lines.push(vpiLine + '.')

  // MoM change
  if (previous) {
    const prevVPI = parseFloat(previous.vpi)
    if (prevVPI > 0) {
      const change = ((vpi - prevVPI) / prevVPI) * 100
      lines.push(
        change < 0
          ? `تحسَّن المؤشر بنسبة ${Math.abs(change).toFixed(1)}% مقارنةً بالشهر السابق (${prevVPI.toFixed(1)} مخالفة/كم²).`
          : `ارتفع المؤشر بنسبة ${Math.abs(change).toFixed(1)}% مقارنةً بالشهر السابق (${prevVPI.toFixed(1)} مخالفة/كم²).`
      )
    }
  }

  // Coverage
  if (covRate != null) {
    let covLine = `بلغت نسبة التغطية المكانية ${covRate.toFixed(1)}%`
    if (target) {
      const tc = parseFloat(target.coverage_target)
      covLine += covRate >= tc
        ? `، متجاوزةً المستهدف البالغ ${tc}%`
        : `، دون المستهدف البالغ ${tc}%`
    }
    lines.push(covLine + '.')
  }

  // Top municipality
  if (topMunis.length > 0) {
    const top = topMunis[0]
    lines.push(
      `ساهمت بلدية ${top.municipality_name} بنسبة ${parseFloat(top.contribution_pct).toFixed(1)}% من إجمالي الوحدات المرصودة بالأمانة، بواقع ${parseInt(top.total_units).toLocaleString('ar-SA')} وحدة.`
    )
  }

  // Top element
  if (topElems.length > 0) {
    const top = topElems[0]
    lines.push(
      `كان عنصر "${top.element_name}" الأكثر تأثيراً على المؤشر بنسبة مساهمة ${parseFloat(top.contribution_pct).toFixed(1)}%.`
    )
  }

  // Top zone
  if (topZones.length > 0) {
    const top = topZones[0]
    lines.push(
      `سجَّلت منطقة أولوية "${top.priority_zone_name}" في بلدية ${top.municipality_name} أعلى تأثير على المؤشر هذا الشهر (VPI = ${parseFloat(top.vpi).toFixed(1)}).`
    )
  }

  // ── Insights ──
  const insights = await generateInsights(month, kpi, previous, target, topMunis, topElems)

  return { summary: lines.join(' '), insights }
}

async function generateInsights(month, kpi, previous, target, topMunis, topElems) {
  const insights = []
  const vpi      = parseFloat(kpi.vpi)

  // Target achievement
  if (target) {
    const t = parseFloat(target.vpi_target)
    insights.push({
      type:    vpi <= t ? 'success' : 'warning',
      title:   vpi <= t ? 'تحقيق المستهدف' : 'تجاوز المستهدف',
      body:    vpi <= t
        ? `المؤشر (${vpi.toFixed(1)}) أفضل من المستهدف السنوي (${t})`
        : `المؤشر (${vpi.toFixed(1)}) أعلى من المستهدف السنوي (${t}) — يستلزم المتابعة`,
    })

    const covRate = kpi.coverage_rate ? parseFloat(kpi.coverage_rate) : null
    const tc      = parseFloat(target.coverage_target)
    if (covRate != null) {
      insights.push({
        type:  covRate >= tc ? 'success' : 'warning',
        title: covRate >= tc ? 'تغطية ممتازة' : 'تغطية دون المستهدف',
        body:  `نسبة التغطية ${covRate.toFixed(1)}% — المستهدف ${tc}%`,
      })
    }
  }

  // MoM trend
  if (previous) {
    const prevVPI = parseFloat(previous.vpi)
    if (prevVPI > 0) {
      const change = ((vpi - prevVPI) / prevVPI) * 100
      insights.push({
        type:  change < 0 ? 'improvement' : 'alert',
        title: change < 0 ? 'تحسن شهري' : 'ارتفاع شهري',
        body:  `تغير المؤشر ${change > 0 ? '+' : ''}${change.toFixed(1)}% مقارنةً بالشهر السابق`,
      })
    }
  }

  // Top contributor alert
  if (topMunis.length > 0) {
    const top = topMunis[0]
    if (parseFloat(top.contribution_pct) > 30) {
      insights.push({
        type:  'alert',
        title: 'تركيز عالٍ في بلدية واحدة',
        body:  `بلدية ${top.municipality_name} تمثل ${parseFloat(top.contribution_pct).toFixed(1)}% من الوحدات — يُستحسن مراجعة الأسباب`,
      })
    }
  }

  // Municipalities below coverage target
  if (target) {
    const { rows: belowCov } = await pool.query(`
      SELECT municipality_name, coverage_rate
      FROM vpi_municipality_kpi
      WHERE month=$1 AND coverage_rate IS NOT NULL AND coverage_rate < $2
      ORDER BY coverage_rate ASC LIMIT 3
    `, [month, parseFloat(target.coverage_target)])

    if (belowCov.length > 0) {
      insights.push({
        type:  'warning',
        title: 'بلديات دون مستهدف التغطية',
        body:  belowCov.map(r => `${r.municipality_name} (${parseFloat(r.coverage_rate).toFixed(1)}%)`).join(' · '),
      })
    }
  }

  // Top element dominance
  if (topElems.length > 0 && parseFloat(topElems[0].contribution_pct) > 25) {
    insights.push({
      type:  'info',
      title: 'عنصر مهيمن على المؤشر',
      body:  `عنصر "${topElems[0].element_name}" يساهم بـ ${parseFloat(topElems[0].contribution_pct).toFixed(1)}% — يحتاج خطة تدخل مستهدفة`,
    })
  }

  return insights
}

// ─── AI Copilot Query ─────────────────────────────────────────────────────────

export async function getVPIForAI({ month, municipalityName, queryType = 'summary' }) {
  const months      = await getAvailableMonths()
  const targetMonth = month || months[0]
  if (!targetMonth) return { error: 'لا توجد بيانات VPI متاحة بعد' }

  if (queryType === 'trend') return { month: targetMonth, trend: await getHistoricalTrend(12) }
  if (queryType === 'zones') return { month: targetMonth, zones: await getTopZones(targetMonth, 10) }
  if (queryType === 'elements') return { month: targetMonth, elements: await getTopElements(targetMonth, 10) }
  if (queryType === 'municipalities') return { month: targetMonth, municipalities: await getTopMunicipalities(targetMonth, 10) }

  if (municipalityName) {
    return { month: targetMonth, municipality: municipalityName, data: await getMunicipalityDashboard(municipalityName, targetMonth) }
  }

  const [amanah, topMunis, topElems, topZones, target] = await Promise.all([
    getAmanahDashboard(targetMonth),
    getTopMunicipalities(targetMonth, 5),
    getTopElements(targetMonth, 5),
    getTopZones(targetMonth, 5),
    getTargetForMonth(targetMonth),
  ])
  return { month: targetMonth, amanah, topMunicipalities: topMunis, topElements: topElems, topZones, target }
}
