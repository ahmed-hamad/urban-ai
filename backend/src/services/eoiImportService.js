// EOI Import Service — ذكاء الرصد الخارجي
// Excel inspection → auto-mapping → multi-date batch import

import * as XLSX from 'xlsx'
import pool from './db.js'

// ─── Field aliases for auto-detection ────────────────────────────────────────

const EOI_ALIASES = {
  observation_date:   ['date','تاريخ','التاريخ','observationdate','observation_date','tarikh','تاريخالرصد'],
  municipality_name:  ['municipality','بلدية','البلدية','اسمبلدية','municipalityname'],
  element_name:       ['element','عنصر','العنصر','elementname','visualelement'],
  visit_status:       ['visitstatus','حالةزيارة','حالةالزيارة','visit','زيارة'],
  closure_status:     ['closurestatus','حالةاغلاق','حالةالإغلاق','حالةاقفال','closingstatus'],
  report_status:      ['حالةالبلاغ','حالةبلاغ','حالةالبلاغات','حالةالطلب','reportstatus','report_status',
                       'حالةالتقرير','statusreport','حالةبلاغات'],
  priority_zone_name: ['priorityzone','منطقة','zone','priorityzonename','منطقةالأولوية'],
  cluster_id:         ['clusterid','cluster','clusterid','مجموعة'],
  report_number:      ['reportnumber','reportno','رقمالبلاغ','رقمبلاغ','بلاغ','رقم'],
  crm_number:         ['crm','crmnumber','crmno','رقمcrm','رقمالطلب'],
  closure_date:       ['closuredate','تاريخاغلاق','تاريخالإغلاق','تاريخاقفال'],
  repeated_count:     ['repeated','تكرار','عدداتكرار','repeatedcount','repetitions'],
  lat:                ['lat','latitude','خطالعرض','y'],
  lng:                ['lng','lon','longitude','خطالطول','x'],
  processing_info:    ['processing','معالجة','info','ملاحظات'],
}

function norm(s) {
  return String(s).toLowerCase().replace(/[\s\-_()​]/g, '').replace(/[^a-zأ-ي0-9]/g, '')
}

// ─── Excel Inspector ──────────────────────────────────────────────────────────

export function inspectExcelEOI(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (!rows.length) throw new Error('الملف فارغ')

  const columns = Object.keys(rows[0])
  const columnSamples = {}
  for (const col of columns) {
    columnSamples[col] = [...new Set(
      rows.slice(0, 30).map(r => String(r[col] ?? '')).filter(v => v !== '')
    )].slice(0, 5)
  }
  return { totalRows: rows.length, columns, columnSamples, sampleRows: rows.slice(0, 5) }
}

// ─── Auto-detect mapping ──────────────────────────────────────────────────────

export function autoDetectMappingEOI(columns, columnSamples) {
  const mapping = {}, confidence = {}

  for (const [field, hints] of Object.entries(EOI_ALIASES)) {
    // Pass 1: exact/strong match
    for (const col of columns) {
      const cn = norm(col)
      if (hints.some(h => norm(h) === cn || cn.includes(norm(h)) || norm(h).includes(cn))) {
        if (!mapping[field]) { mapping[field] = col; confidence[field] = 'high' }
      }
    }
    // Pass 2: partial
    if (!mapping[field]) {
      for (const col of columns) {
        const cn = norm(col)
        if (hints.some(h => { const hn = norm(h); return cn.startsWith(hn.substring(0, 4)) || hn.startsWith(cn.substring(0, 4)) })) {
          mapping[field] = col; confidence[field] = 'medium'; break
        }
      }
    }
  }

  // Detect date column by sample values
  if (!mapping.observation_date) {
    for (const col of columns) {
      const samples = columnSamples[col] || []
      if (samples.some(s => /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s))) {
        mapping.observation_date = col; confidence.observation_date = 'medium'; break
      }
    }
  }

  return { mapping, confidence }
}

// ─── Date parser ──────────────────────────────────────────────────────────────

function parseDate(raw) {
  if (raw == null || raw === '') return null

  // Excel serial number
  if (typeof raw === 'number' && raw > 10000) {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }

  const s = String(raw).trim()

  // ISO: YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10))

  const y4 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s|$)/)
  if (y4) {
    const part1 = parseInt(y4[1], 10)
    const part2 = parseInt(y4[2], 10)
    const year = parseInt(y4[3], 10)

    if (part2 > 12 && part1 <= 12) {
      return new Date(year, part1 - 1, part2)
    }
    if (part1 > 12 && part2 <= 12) {
      return new Date(year, part2 - 1, part1)
    }

    return new Date(year, part2 - 1, part1)
  }

  const y2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})(?:\s|$)/)
  if (y2) {
    const part1 = parseInt(y2[1], 10)
    const part2 = parseInt(y2[2], 10)
    const year = 2000 + parseInt(y2[3], 10)

    if (part2 > 12 && part1 <= 12) {
      return new Date(year, part1 - 1, part2)
    }
    if (part1 > 12 && part2 <= 12) {
      return new Date(year, part2 - 1, part1)
    }

    return new Date(year, part2 - 1, part1)
  }

  const d = new Date(s)
  return isNaN(d) ? null : d
}

function toDateStr(d) {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMonthStr(d) {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Preview: discover date range + month breakdown ──────────────────────────

export function discoverEOIMonths(buffer, mapping) {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const buckets = {}
  let skipped = 0

  for (const row of rows) {
    const rawDate = mapping.observation_date ? row[mapping.observation_date] : null
    const d       = parseDate(rawDate)
    if (!d) { skipped++; continue }

    const mKey = toMonthStr(d)
    if (!buckets[mKey]) buckets[mKey] = { rowCount: 0 }
    buckets[mKey].rowCount++
  }

  const months = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, s]) => ({ month, rowCount: s.rowCount }))

  return { months, skippedRows: skipped, totalRows: rows.length }
}

// ─── Get unit conversion factor for an element ───────────────────────────────

async function getUnitFactor(elementName, rulesCache) {
  for (const rule of rulesCache) {
    if (!rule.is_active) continue
    if (rule.match_type === 'exact' && rule.element_pattern === elementName) return parseFloat(rule.factor)
    if (rule.match_type === 'contains' && elementName.includes(rule.element_pattern)) return parseFloat(rule.factor)
  }
  return 1.0
}

// ─── Main Import ──────────────────────────────────────────────────────────────

export async function importMappedEOI(buffer, mapping, existingAction = 'skip', userId) {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  // Load conversion rules once
  const { rows: rules } = await pool.query(`SELECT * FROM eoi_unit_rules WHERE is_active=true`)

  // Group rows by month
  const groups = {}
  for (const row of rows) {
    const rawDate = mapping.observation_date ? row[mapping.observation_date] : null
    const d       = parseDate(rawDate)
    if (!d) continue
    const mKey = toMonthStr(d)
    if (!groups[mKey]) groups[mKey] = []

    const muni    = String(row[mapping.municipality_name] || '').trim()
    const element = String(row[mapping.element_name]      || '').trim()
    if (!muni || !element) continue

    const factor = await getUnitFactor(element, rules)

    groups[mKey].push({
      cluster_id:         mapping.cluster_id         ? String(row[mapping.cluster_id]         || '').trim() || null : null,
      report_number:      mapping.report_number       ? String(row[mapping.report_number]       || '').trim() || null : null,
      municipality_name:  muni,
      priority_zone_name: mapping.priority_zone_name  ? String(row[mapping.priority_zone_name]  || '').trim() || null : null,
      element_name:       element,
      observation_date:   toDateStr(d),
      observation_month:  mKey,
      visit_status:       mapping.visit_status        ? String(row[mapping.visit_status]        || '').trim() || null : null,
      closure_status:     mapping.closure_status      ? String(row[mapping.closure_status]      || '').trim() || null : null,
      report_status:      mapping.report_status       ? String(row[mapping.report_status]       || '').trim() || null : null,
      closure_date:       mapping.closure_date        ? toDateStr(parseDate(row[mapping.closure_date])) : null,
      crm_number:         mapping.crm_number          ? String(row[mapping.crm_number]          || '').trim() || null : null,
      repeated_count:     mapping.repeated_count      ? (parseInt(row[mapping.repeated_count])  || 0)         : 0,
      lat:                mapping.lat                 ? (parseFloat(row[mapping.lat])            || null)      : null,
      lng:                mapping.lng                 ? (parseFloat(row[mapping.lng])            || null)      : null,
      processing_info:    mapping.processing_info     ? String(row[mapping.processing_info]     || '').trim() || null : null,
      estimated_units:    factor,
    })
  }

  const results = []
  for (const [monthKey, monthRows] of Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))) {
    const exists = await _monthExists(monthKey)

    if (exists && existingAction === 'skip') {
      results.push({ month: monthKey, status: 'skipped', rowCount: 0 })
      continue
    }
    if (exists && existingAction === 'replace') {
      await pool.query(`DELETE FROM eoi_observations WHERE observation_month=$1`, [monthKey])
    }

    const { rows: [job] } = await pool.query(
      `INSERT INTO eoi_upload_jobs (status,uploaded_by,row_count) VALUES ('processing',$1,$2) RETURNING id`,
      [userId || null, monthRows.length]
    )

    try {
      await _batchInsert(job.id, monthRows)
      await _recalcLiveVPI(monthKey)
      await pool.query(`UPDATE eoi_upload_jobs SET status='completed', date_range=$1 WHERE id=$2`, [monthKey, job.id])
      results.push({ month: monthKey, status: 'imported', rowCount: monthRows.length })
    } catch (err) {
      await pool.query(`UPDATE eoi_upload_jobs SET status='failed', error_message=$1 WHERE id=$2`, [err.message, job.id])
      results.push({ month: monthKey, status: 'failed', error: err.message, rowCount: monthRows.length })
    }
  }
  return results
}

async function _monthExists(month) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int cnt FROM eoi_observations WHERE observation_month=$1`, [month])
  return parseInt(rows[0].cnt) > 0
}

async function _batchInsert(jobId, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const vals  = chunk.map((_, j) => {
      const b = j * 17
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17})`
    }).join(',')
    const params = chunk.flatMap(r => [
      jobId, r.cluster_id, r.report_number, r.municipality_name, r.priority_zone_name,
      r.element_name, r.observation_date, r.observation_month,
      r.visit_status, r.closure_status, r.report_status, r.closure_date, r.crm_number,
      r.repeated_count, r.lat, r.lng, r.estimated_units,
    ])
    await pool.query(
      `INSERT INTO eoi_observations
         (upload_job_id,cluster_id,report_number,municipality_name,priority_zone_name,
          element_name,observation_date,observation_month,
          visit_status,closure_status,report_status,closure_date,crm_number,
          repeated_count,lat,lng,estimated_units)
       VALUES ${vals}`,
      params
    )
  }
}

// ─── Live VPI recalculation ───────────────────────────────────────────────────

export async function _recalcLiveVPI(month) {
  // Total estimated units for this month (all observations)
  const { rows: [agg] } = await pool.query(`
    SELECT COUNT(*)::int          AS total_reports,
           SUM(estimated_units)   AS total_units,
           COUNT(DISTINCT observation_date)::int AS data_days,
           MIN(observation_date)  AS first_date,
           MAX(observation_date)  AS last_date
    FROM eoi_observations WHERE observation_month=$1
  `, [month])

  const totalReports = agg.total_reports || 0
  const totalUnits   = parseFloat(agg.total_units) || 0
  const dataDays     = agg.data_days || 0

  // Adjusted: exclude observations flagged as false reports.
  // NULL-safe: NOT ILIKE returns NULL (not FALSE) for NULL inputs, so use IS NULL guard.
  const { rows: [adjAgg] } = await pool.query(`
    SELECT COUNT(*)::int          AS adj_reports,
           SUM(estimated_units)   AS adj_units
    FROM eoi_observations
    WHERE observation_month=$1
      AND (visit_status IS NULL OR visit_status NOT ILIKE '%خاطئ%')
  `, [month])

  const adjReports = adjAgg.adj_reports || 0
  const adjUnits   = parseFloat(adjAgg.adj_units) || 0

  // Get covered area from official VPI coverage (same month)
  const { rows: covRows } = await pool.query(`
    SELECT SUM(covered_area_km2) AS covered
    FROM vpi_coverage WHERE month=$1
  `, [month])
  const covered = covRows[0]?.covered ? parseFloat(covRows[0].covered) : null

  // Calculate live VPI (full) and adjusted VPI
  const liveVPI = (covered && covered > 0) ? totalUnits / covered : null
  const adjVPI  = (covered && covered > 0) ? adjUnits   / covered : null

  // Forecast: daily rate * days in month (using full dataset)
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const dailyRate   = dataDays > 0 ? totalUnits / dataDays : 0
  const forecastUnits = dataDays > 0 ? dailyRate * daysInMonth : null
  const forecastVPI   = (forecastUnits != null && covered && covered > 0) ? forecastUnits / covered : null

  // Confidence: based on % of month with data
  const coverage   = dataDays / daysInMonth
  const confidence = coverage < 0.30 ? 'low' : coverage < 0.60 ? 'medium' : 'high'

  await pool.query(`
    INSERT INTO eoi_live_vpi
      (observation_month, total_reports, total_estimated_units, covered_area_km2,
       estimated_vpi, data_days, days_in_month, forecast_units_eom, forecast_vpi_eom,
       confidence_score, adj_total_reports, adj_total_units, adj_estimated_vpi,
       last_updated)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
    ON CONFLICT (observation_month) DO UPDATE SET
      total_reports         = EXCLUDED.total_reports,
      total_estimated_units = EXCLUDED.total_estimated_units,
      covered_area_km2      = EXCLUDED.covered_area_km2,
      estimated_vpi         = EXCLUDED.estimated_vpi,
      data_days             = EXCLUDED.data_days,
      days_in_month         = EXCLUDED.days_in_month,
      forecast_units_eom    = EXCLUDED.forecast_units_eom,
      forecast_vpi_eom      = EXCLUDED.forecast_vpi_eom,
      confidence_score      = EXCLUDED.confidence_score,
      adj_total_reports     = EXCLUDED.adj_total_reports,
      adj_total_units       = EXCLUDED.adj_total_units,
      adj_estimated_vpi     = EXCLUDED.adj_estimated_vpi,
      last_updated          = NOW()
  `, [month, totalReports, totalUnits, covered, liveVPI,
      dataDays, daysInMonth, forecastUnits, forecastVPI, confidence,
      adjReports, adjUnits, adjVPI])
}

// ─── Mapping Templates ────────────────────────────────────────────────────────

export async function saveEOITemplate(name, mapping, userId) {
  const { rows } = await pool.query(
    `INSERT INTO eoi_mapping_templates (name, mapping, created_by) VALUES ($1,$2,$3) RETURNING *`,
    [name, JSON.stringify(mapping), userId || null]
  )
  return rows[0]
}

export async function getEOITemplates() {
  const { rows } = await pool.query(`
    SELECT t.*, u.full_name AS created_by_name
    FROM eoi_mapping_templates t
    LEFT JOIN users u ON u.id = t.created_by
    ORDER BY t.created_at DESC
  `)
  return rows
}

export async function deleteEOITemplate(id) {
  await pool.query(`DELETE FROM eoi_mapping_templates WHERE id=$1`, [id])
}
