// VPI Import Service — Data Mapping Wizard + Historical ETL
// Inspection → Auto-mapping → Month discovery → Multi-month batch import

import * as XLSX from 'xlsx'
import pool from './db.js'
import { importObservations, importCoverage, recalculateKPIs, checkMonthExists } from './vpiService.js'

// ─── Arabic / English month lookup ───────────────────────────────────────────

const MONTH_LOOKUP = {
  // Arabic
  'يناير': '01', 'فبراير': '02', 'مارس': '03', 'أبريل': '04',
  'مايو':  '05', 'يونيو':  '06', 'يوليو': '07', 'أغسطس': '08',
  'سبتمبر':'09', 'أكتوبر': '10', 'نوفمبر': '11', 'ديسمبر': '12',
  // English
  'january':'01', 'february':'02', 'march': '03', 'april':   '04',
  'may':    '05', 'june':    '06', 'july':  '07', 'august':  '08',
  'september':'09','october':'10', 'november':'11','december':'12',
  // Short English
  'jan':'01','feb':'02','mar':'03','apr':'04',
  'jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12',
}

// ─── Field aliases for auto-detection ────────────────────────────────────────

const OBS_ALIASES = {
  month:              ['month','شهر','الشهر','refreshmonth','refresh_month','calendar'],
  year:               ['year','سنة','السنة','عام','العام'],
  municipality_name:  ['municipality','بلدية','البلدية','اسمبلدية','municipalityname','اسمالبلدية'],
  priority_zone_name: ['priorityzone','منطقة','المنطقة','منطقةالأولوية','zone','priorityzonename'],
  element_name:       ['element','عنصر','العنصر','عنصرالتشوه','visualelement','visualpollutionelement','elementname'],
  units_count:        ['units','وحدات','الوحدات','عدد','عددالوحدات','unitscount','unitcount','count'],
  cluster_id:         ['clusterid','cluster','clusterid','مجموعة','clusterno','clusterid'],
}

const COV_ALIASES = {
  month:              ['month','شهر','الشهر','refreshmonth','refresh_month'],
  year:               ['year','سنة','السنة','عام','العام'],
  municipality_name:  ['municipality','بلدية','البلدية','municipalityname','اسمالبلدية'],
  priority_zone_name: ['priorityzone','منطقة','zone','priorityzonename'],
  zone_area_km2:      ['zonearea','مساحةالمنطقة','المساحةالكلية','totalarea','zoneareakm','مساحةكلية'],
  covered_area_km2:   ['coveredarea','المساحة','مساحة','coveredareakm','مساحةكم','المساحةكم'],
  coverage_rate:      ['coveragepercentage','coveragepercent','نسبةتغطية','نسبةالتغطية','coverage'],
}

function norm(s) {
  return String(s).toLowerCase().replace(/[\s\-_()²]/g, '').replace(/[^a-zأ-ي0-9]/g, '')
}

// ─── Excel Inspector ──────────────────────────────────────────────────────────

export function inspectExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  if (!rows.length) throw new Error('الملف فارغ أو لا يحتوي بيانات')

  const columns = Object.keys(rows[0])

  // Collect distinct sample values per column (up to 5)
  const columnSamples = {}
  for (const col of columns) {
    const vals = [...new Set(
      rows.slice(0, 30).map(r => String(r[col] ?? '')).filter(v => v !== '')
    )].slice(0, 5)
    columnSamples[col] = vals
  }

  return {
    totalRows: rows.length,
    columns,
    columnSamples,
    sampleRows: rows.slice(0, 5).map(r => {
      const out = {}
      columns.forEach(c => { out[c] = r[c] })
      return out
    }),
  }
}

// ─── Auto-detect mapping ──────────────────────────────────────────────────────

export function autoDetectMapping(columns, columnSamples, datasetType) {
  const aliases   = datasetType === 'observations' ? OBS_ALIASES : COV_ALIASES
  const mapping    = {}
  const confidence = {}  // 'high' | 'medium' | 'low'

  for (const [field, hints] of Object.entries(aliases)) {
    // Pass 1: exact or strong match
    for (const col of columns) {
      const cn = norm(col)
      if (hints.some(h => norm(h) === cn || cn.includes(norm(h)) || norm(h).includes(cn))) {
        if (!mapping[field]) { mapping[field] = col; confidence[field] = 'high' }
        break
      }
    }
    // Pass 2: partial match by first 4 chars
    if (!mapping[field]) {
      for (const col of columns) {
        const cn = norm(col)
        if (hints.some(h => { const hn = norm(h); return cn.startsWith(hn.substring(0, 4)) || hn.startsWith(cn.substring(0, 4)) })) {
          mapping[field] = col
          confidence[field] = 'medium'
          break
        }
      }
    }
  }

  // Bonus: detect year column by sample values (e.g. 2024, 2025, 2026)
  if (!mapping.year) {
    for (const col of columns) {
      const samples = columnSamples[col] || []
      if (samples.every(s => /^\d{4}$/.test(s.trim()) && parseInt(s) >= 2020 && parseInt(s) <= 2035)) {
        mapping.year = col
        confidence.year = 'medium'
        break
      }
    }
  }

  // Bonus: detect month column by sample values (1-12)
  if (!mapping.month) {
    for (const col of columns) {
      const samples = columnSamples[col] || []
      if (samples.length > 0 && samples.every(s => {
        const n = parseInt(s)
        return !isNaN(n) && n >= 1 && n <= 12
      })) {
        mapping.month = col
        confidence.month = 'medium'
        break
      }
    }
  }

  return { mapping, confidence }
}

// ─── Month / Year parsers ─────────────────────────────────────────────────────

function parseMonthValue(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim().toLowerCase()

  const num = parseInt(s)
  if (!isNaN(num) && num >= 1 && num <= 12) return String(num).padStart(2, '0')

  if (MONTH_LOOKUP[s]) return MONTH_LOOKUP[s]

  // ISO date strings: YYYY-MM or YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})/)
  if (iso) return iso[2]

  return null
}

function parseYearValue(raw) {
  if (raw == null || raw === '') return null
  const n = parseInt(String(raw).trim())
  return (!isNaN(n) && n >= 2000 && n <= 2099) ? n : null
}

// ─── Month Discovery (pre-import analysis) ───────────────────────────────────

export function discoverMonths(buffer, mapping, defaultYear = null) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const buckets = {}  // 'YYYY-MM' → { rowCount, unitSum }
  let skipped = 0

  for (const row of rows) {
    const rawMonth = mapping.month ? row[mapping.month] : null
    const rawYear  = mapping.year  ? row[mapping.year]  : null

    const mm = parseMonthValue(rawMonth)
    const yy = parseYearValue(rawYear) ?? defaultYear

    if (!mm || !yy) { skipped++; continue }

    const key = `${yy}-${mm}`
    if (!buckets[key]) buckets[key] = { rowCount: 0, unitSum: 0 }
    buckets[key].rowCount++

    if (mapping.units_count) {
      const u = parseFloat(row[mapping.units_count] || 0)
      if (!isNaN(u)) buckets[key].unitSum += u
    }
  }

  const months = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, s]) => ({ month, rowCount: s.rowCount, unitSum: Math.round(s.unitSum) }))

  return { months, skippedRows: skipped, totalRows: rows.length }
}

// ─── Mapped Import — Observations ────────────────────────────────────────────

export async function importMappedObservations(buffer, mapping, defaultYear, existingAction = 'skip', userId) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // Group rows by month key
  const groups = {}
  for (const row of rows) {
    const mm = parseMonthValue(mapping.month ? row[mapping.month] : null)
    const yy = parseYearValue(mapping.year  ? row[mapping.year]  : null) ?? defaultYear
    if (!mm || !yy) continue

    const key = `${yy}-${mm}`
    if (!groups[key]) groups[key] = []

    const muni    = String(row[mapping.municipality_name] || '').trim()
    const element = String(row[mapping.element_name]      || '').trim()
    const units   = parseFloat(row[mapping.units_count]   || 0)
    const zone    = mapping.priority_zone_name ? String(row[mapping.priority_zone_name] || '').trim() : ''
    const cluster = mapping.cluster_id         ? String(row[mapping.cluster_id]         || '').trim() : ''

    if (!muni || !element) continue
    groups[key].push({
      month: key, municipality_name: muni,
      priority_zone_name: zone    || null,
      element_name:       element,
      units_count:        isNaN(units) ? 0 : units,
      cluster_id:         cluster || null,
    })
  }

  return _runGroupedImport(groups, 'observations', existingAction, userId)
}

// ─── Mapped Import — Coverage ─────────────────────────────────────────────────

export async function importMappedCoverage(buffer, mapping, defaultYear, existingAction = 'skip', userId) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const groups = {}
  for (const row of rows) {
    const mm = parseMonthValue(mapping.month ? row[mapping.month] : null)
    const yy = parseYearValue(mapping.year  ? row[mapping.year]  : null) ?? defaultYear
    if (!mm || !yy) continue

    const key = `${yy}-${mm}`
    if (!groups[key]) groups[key] = []

    const muni     = String(row[mapping.municipality_name] || '').trim()
    const zone     = mapping.priority_zone_name ? String(row[mapping.priority_zone_name] || '').trim() : ''
    const zArea    = mapping.zone_area_km2    ? parseFloat(row[mapping.zone_area_km2]    || 0) : null
    const covArea  = mapping.covered_area_km2 ? parseFloat(row[mapping.covered_area_km2] || 0) : 0
    const covPct   = mapping.coverage_rate    ? parseFloat(row[mapping.coverage_rate]    || 0) : null

    if (!muni) continue
    groups[key].push({
      month: key, municipality_name: muni,
      priority_zone_name: zone     || null,
      zone_area_km2:      (zArea  != null && !isNaN(zArea))  ? zArea  : null,
      covered_area_km2:   isNaN(covArea) ? 0 : covArea,
      coverage_rate:      (covPct != null && !isNaN(covPct)) ? covPct : null,
    })
  }

  return _runGroupedImport(groups, 'coverage', existingAction, userId)
}

// ─── Shared import runner ─────────────────────────────────────────────────────

async function _runGroupedImport(groups, datasetType, existingAction, userId) {
  const results = []

  for (const [monthKey, monthRows] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    const exists = await checkMonthExists(monthKey, datasetType)

    if (exists) {
      if (existingAction === 'skip') {
        results.push({ month: monthKey, status: 'skipped', reason: 'month_exists', rowCount: 0 })
        continue
      }
      if (existingAction === 'replace') {
        const tbl = datasetType === 'observations' ? 'vpi_observations' : 'vpi_coverage'
        await pool.query(`DELETE FROM ${tbl} WHERE month=$1`, [monthKey])
      }
    }

    const { rows: [job] } = await pool.query(
      `INSERT INTO vpi_upload_jobs (month,upload_type,status,uploaded_by,row_count)
       VALUES ($1,$2,'processing',$3,$4) RETURNING id`,
      [monthKey, datasetType, userId || null, monthRows.length]
    )

    try {
      if (datasetType === 'observations') await importObservations(job.id, monthRows)
      else                                await importCoverage(job.id, monthRows)

      // Recalculate KPIs if both datasets are now available
      const otherType = datasetType === 'observations' ? 'coverage' : 'observations'
      const hasOther  = await checkMonthExists(monthKey, otherType)
      const kpiResult = hasOther ? await recalculateKPIs(monthKey) : null

      await pool.query(`UPDATE vpi_upload_jobs SET status='completed' WHERE id=$1`, [job.id])
      results.push({ month: monthKey, status: 'imported', rowCount: monthRows.length, kpiCalculated: !!kpiResult })
    } catch (err) {
      await pool.query(
        `UPDATE vpi_upload_jobs SET status='failed', error_message=$1 WHERE id=$2`,
        [err.message, job.id]
      )
      results.push({ month: monthKey, status: 'failed', rowCount: monthRows.length, error: err.message })
    }
  }

  return results
}

// ─── Mapping Templates ────────────────────────────────────────────────────────

export async function saveMappingTemplate(name, datasetType, mapping, userId) {
  const { rows } = await pool.query(`
    INSERT INTO vpi_mapping_templates (name, dataset_type, mapping, created_by)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [name, datasetType, JSON.stringify(mapping), userId || null])
  return rows[0]
}

export async function getMappingTemplates(datasetType) {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.dataset_type, t.mapping, t.created_at, u.full_name AS created_by_name
    FROM vpi_mapping_templates t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.dataset_type = $1
    ORDER BY t.created_at DESC
  `, [datasetType])
  return rows
}

export async function deleteMappingTemplate(id) {
  await pool.query(`DELETE FROM vpi_mapping_templates WHERE id=$1`, [id])
}
