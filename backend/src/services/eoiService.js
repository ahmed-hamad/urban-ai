// EOI Service — ذكاء الرصد الخارجي
// Analytics Engine: Operational KPIs · Visit Analysis · In-Progress · Live VPI · Forecast
// IMPORTANT: All VPI values here are ESTIMATED/FORECAST — never official values.

import pool from './db.js'
import { _recalcLiveVPI } from './eoiImportService.js'

const ARABIC_MONTHS = {
  '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو',
  '07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر',
}
function monthLabel(m) {
  const [y, mo] = m.split('-')
  return `${ARABIC_MONTHS[mo] || mo} ${y}`
}

// ─── Available Months ─────────────────────────────────────────────────────────

export async function getAvailableEOIMonths() {
  const { rows } = await pool.query(
    `SELECT DISTINCT observation_month AS month FROM eoi_observations ORDER BY observation_month DESC`
  )
  return rows.map(r => r.month)
}

// ─── Scope helper ─────────────────────────────────────────────────────────────

function scopeWhere(municipalityName) {
  return municipalityName ? `AND municipality_name ILIKE '%${municipalityName.replace(/'/g,"''")}%'` : ''
}

// ─── Operational Summary ──────────────────────────────────────────────────────

export async function getOperationalSummary({ month, municipalityName } = {}) {
  const mw = month        ? `AND observation_month=$1` : ''
  const sw = scopeWhere(municipalityName)
  const params = month ? [month] : []

  const { rows: [s] } = await pool.query(`
    SELECT
      COUNT(*)::int AS total_reports,

      -- Closed manually: closure_status indicates closed (not auto)
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')
                          AND closure_status NOT ILIKE '%آلي%')::int AS closed_reports,

      -- Auto closed: closure_status OR report_status indicates automatic closure
      COUNT(*) FILTER (WHERE closure_status ILIKE '%آلي%'
                          OR report_status  ILIKE '%آلي%')::int AS auto_closed_reports,

      -- In progress: closure_status OR report_status indicates in-progress
      COUNT(*) FILTER (WHERE closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%'
                          OR report_status  ILIKE '%تنفيذ%' OR report_status  ILIKE '%progress%')::int AS in_progress_reports,

      -- Open: not closed, not in-progress
      COUNT(*) FILTER (WHERE closure_status NOT ILIKE '%مغلق%' AND closure_status NOT ILIKE '%تنفيذ%'
                          AND closure_status NOT ILIKE '%closed%' AND closure_status NOT ILIKE '%progress%'
                          AND closure_status NOT ILIKE '%آلي%'
                          AND (report_status IS NULL OR (
                               report_status NOT ILIKE '%مغلق%' AND report_status NOT ILIKE '%تنفيذ%'
                           AND report_status NOT ILIKE '%closed%' AND report_status NOT ILIKE '%progress%'
                           AND report_status NOT ILIKE '%آلي%')))::int AS open_reports,

      COUNT(*) FILTER (WHERE visit_status IS NOT NULL AND visit_status NOT ILIKE '%لم%' AND visit_status != '')::int AS visited_reports,
      COUNT(*) FILTER (WHERE repeated_count > 0)::int AS repeated_reports,
      COALESCE(SUM(estimated_units),0)                AS estimated_units,
      COUNT(DISTINCT municipality_name)::int          AS municipality_count,
      COUNT(DISTINCT element_name)::int               AS element_count
    FROM eoi_observations
    WHERE 1=1 ${mw} ${sw}
  `, params)

  const totalClosed = (s.closed_reports || 0) + (s.auto_closed_reports || 0)
  return {
    total_reports:        s.total_reports,
    closed_reports:       s.closed_reports,
    auto_closed_reports:  s.auto_closed_reports,
    total_closed_reports: totalClosed,
    in_progress_reports:  s.in_progress_reports,
    open_reports:         s.open_reports,
    visited_reports:      s.visited_reports,
    repeated_reports:     s.repeated_reports,
    estimated_units:      parseFloat(s.estimated_units),
    municipality_count:   s.municipality_count,
    element_count:        s.element_count,
    visit_compliance_rate:  s.total_reports > 0 ? (s.visited_reports      / s.total_reports * 100) : 0,
    closure_rate:           s.total_reports > 0 ? (totalClosed            / s.total_reports * 100) : 0,
    manual_closure_rate:    s.total_reports > 0 ? (s.closed_reports       / s.total_reports * 100) : 0,
    auto_closure_rate:      s.total_reports > 0 ? (s.auto_closed_reports  / s.total_reports * 100) : 0,
    in_progress_rate:       s.total_reports > 0 ? (s.in_progress_reports  / s.total_reports * 100) : 0,
  }
}

// ─── Status Breakdown (by municipality / element / zone) ─────────────────────

export async function getStatusBreakdown({ month, municipalityName, groupBy = 'municipality' } = {}) {
  const groupCol = groupBy === 'element' ? 'element_name' :
                   groupBy === 'zone'    ? 'priority_zone_name' :
                                          'municipality_name'

  const params = []
  let where = 'WHERE 1=1'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  const { rows } = await pool.query(`
    SELECT
      ${groupCol} AS group_name,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')
                          AND closure_status NOT ILIKE '%آلي%')::int AS closed,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%آلي%'
                          OR report_status  ILIKE '%آلي%')::int      AS auto_closed,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%'
                          OR report_status  ILIKE '%تنفيذ%' OR report_status  ILIKE '%progress%')::int AS in_progress,
      COUNT(*) FILTER (WHERE visit_status IS NOT NULL AND visit_status NOT ILIKE '%لم%' AND visit_status != '')::int AS visited,
      COUNT(*) FILTER (WHERE repeated_count > 0)::int                AS repeated,
      COALESCE(SUM(estimated_units),0)                               AS estimated_units
    FROM eoi_observations ${where}
    GROUP BY ${groupCol}
    HAVING COUNT(*) > 0
    ORDER BY total DESC
    LIMIT 20
  `, params)
  return rows
}

// ─── Visit Status Analysis ────────────────────────────────────────────────────

export async function getVisitStatusAnalysis({ month, municipalityName } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  // Visit status distribution
  const { rows: byVisit } = await pool.query(`
    SELECT
      COALESCE(NULLIF(visit_status,''), 'غير محدد') AS visit_status,
      COUNT(*)::int AS total
    FROM eoi_observations ${where}
    GROUP BY visit_status ORDER BY total DESC
  `, params)

  // Cross-analysis: visit_status × closure_status
  const { rows: cross } = await pool.query(`
    SELECT
      COALESCE(NULLIF(visit_status,''), 'غير محدد')   AS visit_status,
      COALESCE(NULLIF(closure_status,''), 'غير محدد') AS closure_status,
      COUNT(*)::int AS count
    FROM eoi_observations ${where}
    GROUP BY visit_status, closure_status
    ORDER BY count DESC
  `, params)

  // Alerts: closed without visit
  const { rows: [alertRow] } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')
                         AND (visit_status ILIKE '%لم%' OR visit_status IS NULL OR visit_status = ''))::int AS closed_no_visit,
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%')
                         AND (visit_status ILIKE '%لم%' OR visit_status IS NULL OR visit_status = ''))::int AS inprogress_no_visit
    FROM eoi_observations ${where}
  `, params)

  return { byVisit, cross, alerts: alertRow }
}

// ─── In-Progress Analysis ─────────────────────────────────────────────────────

export async function getInProgressAnalysis({ month, municipalityName, stalledDays = 30 } = {}) {
  const params = []
  let where = `WHERE (closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%')`
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  // Age buckets (days since observation_date)
  const { rows: buckets } = await pool.query(`
    SELECT
      CASE
        WHEN CURRENT_DATE - observation_date BETWEEN 0  AND 7  THEN '0-7 أيام'
        WHEN CURRENT_DATE - observation_date BETWEEN 8  AND 30 THEN '8-30 يوم'
        WHEN CURRENT_DATE - observation_date BETWEEN 31 AND 60 THEN '31-60 يوم'
        WHEN CURRENT_DATE - observation_date BETWEEN 61 AND 90 THEN '61-90 يوم'
        ELSE '90+ يوم'
      END AS age_bucket,
      COUNT(*)::int AS count
    FROM eoi_observations ${where}
    GROUP BY age_bucket
    ORDER BY MIN(CURRENT_DATE - observation_date)
  `, params)

  // Top delayed municipalities
  const { rows: topMunis } = await pool.query(`
    SELECT municipality_name,
           COUNT(*)::int AS total,
           AVG(CURRENT_DATE - observation_date)::int AS avg_age_days,
           MAX(CURRENT_DATE - observation_date)::int AS max_age_days
    FROM eoi_observations ${where}
    GROUP BY municipality_name ORDER BY total DESC LIMIT 10
  `, params)

  // Top delayed elements
  const { rows: topElems } = await pool.query(`
    SELECT element_name,
           COUNT(*)::int AS total,
           AVG(CURRENT_DATE - observation_date)::int AS avg_age_days
    FROM eoi_observations ${where}
    GROUP BY element_name ORDER BY total DESC LIMIT 10
  `, params)

  // Stalled = in_progress AND age > stalledDays
  const { rows: [stalledRow] } = await pool.query(`
    SELECT COUNT(*)::int AS stalled_count
    FROM eoi_observations ${where} AND (CURRENT_DATE - observation_date) > $${params.length+1}
  `, [...params, stalledDays])

  return { buckets, topMunis, topElems, stalledCount: stalledRow.stalled_count, stalledThreshold: stalledDays }
}

// ─── Repeated Observations ────────────────────────────────────────────────────

export async function getRepeatedAnalysis({ month, municipalityName } = {}) {
  const params = []
  let where = 'WHERE repeated_count > 0'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  const [elements, munis, zones] = await Promise.all([
    pool.query(`
      SELECT element_name,
             COUNT(*)::int AS reports,
             SUM(repeated_count)::int AS total_repetitions,
             AVG(repeated_count)::numeric(5,1) AS avg_repetitions
      FROM eoi_observations ${where}
      GROUP BY element_name ORDER BY total_repetitions DESC LIMIT 10
    `, params),
    pool.query(`
      SELECT municipality_name,
             COUNT(*)::int AS reports,
             SUM(repeated_count)::int AS total_repetitions
      FROM eoi_observations ${where}
      GROUP BY municipality_name ORDER BY total_repetitions DESC LIMIT 10
    `, params),
    pool.query(`
      SELECT priority_zone_name,
             municipality_name,
             COUNT(*)::int AS reports,
             SUM(repeated_count)::int AS total_repetitions
      FROM eoi_observations ${where} AND priority_zone_name IS NOT NULL
      GROUP BY priority_zone_name, municipality_name ORDER BY total_repetitions DESC LIMIT 10
    `, params),
  ])
  return { elements: elements.rows, municipalities: munis.rows, zones: zones.rows }
}

// ─── Closure Quality KPIs ─────────────────────────────────────────────────────

export async function getClosureQuality({ month, municipalityName } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  const { rows } = await pool.query(`
    SELECT
      municipality_name,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')::int AS total_closed,
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%') AND repeated_count = 0)::int AS closed_no_reobs,
      CASE WHEN COUNT(*) FILTER (WHERE closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%') > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%') AND repeated_count = 0)::numeric /
          NULLIF(COUNT(*) FILTER (WHERE closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%'), 0) * 100, 1
        )
        ELSE NULL
      END AS closure_quality_pct
    FROM eoi_observations ${where}
    GROUP BY municipality_name
    HAVING COUNT(*) FILTER (WHERE closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%') > 0
    ORDER BY closure_quality_pct DESC
  `, params)
  return rows
}

// ─── Operational Trend ────────────────────────────────────────────────────────

export async function getOperationalTrend({ month, municipalityName, groupBy = 'day' } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  const trunc = groupBy === 'month' ? "DATE_TRUNC('month', observation_date)::date"
              : groupBy === 'week'  ? "DATE_TRUNC('week',  observation_date)::date"
              :                       'observation_date'

  const { rows } = await pool.query(`
    SELECT
      ${trunc} AS period,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')::int AS closed,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%')::int AS in_progress,
      COALESCE(SUM(estimated_units),0) AS estimated_units
    FROM eoi_observations ${where}
    GROUP BY period ORDER BY period
  `, params)
  return rows
}

// ─── Live VPI ─────────────────────────────────────────────────────────────────

export async function getLiveVPI(month) {
  const { rows } = await pool.query(
    `SELECT * FROM eoi_live_vpi WHERE observation_month=$1`, [month]
  )
  if (!rows.length) {
    // Try to calculate on the fly
    await _recalcLiveVPI(month)
    const { rows: r2 } = await pool.query(`SELECT * FROM eoi_live_vpi WHERE observation_month=$1`, [month])
    return r2[0] || null
  }
  return rows[0]
}

// ─── Early Warning Center ─────────────────────────────────────────────────────

export async function getEarlyWarning(month) {
  const [liveVPI, opsData, topMunis, topElems] = await Promise.all([
    getLiveVPI(month),
    getOperationalSummary({ month }),
    getStatusBreakdown({ month, groupBy: 'municipality' }),
    getStatusBreakdown({ month, groupBy: 'element' }),
  ])

  // Get official VPI target for this year
  const year = parseInt(month.split('-')[0])
  const { rows: [target] } = await pool.query(`SELECT * FROM vpi_targets WHERE year=$1`, [year])

  // Get most recent official VPI at or before the selected month
  const { rows: [official] } = await pool.query(
    `SELECT month, vpi FROM vpi_amanah_kpi WHERE month <= $1 ORDER BY month DESC LIMIT 1`,
    [month]
  )

  // Get official VPI for the same month (if already measured)
  const { rows: [officialSameMonth] } = await pool.query(
    `SELECT month, vpi FROM vpi_amanah_kpi WHERE month = $1 LIMIT 1`,
    [month]
  )

  return {
    month,
    liveVPI,
    officialLastVPI:      official         || null,
    officialSameMonthVPI: officialSameMonth || null,
    target:               target            || null,
    operational:          opsData,
    topMunicipalities:    topMunis.slice(0, 5),
    topElements:          topElems.slice(0, 5),
    warnings:             _buildWarnings(liveVPI, official, target, opsData),
  }
}

function _buildWarnings(liveVPI, official, target, ops) {
  const warnings = []
  if (liveVPI?.estimated_vpi && target?.vpi_target) {
    const est = parseFloat(liveVPI.estimated_vpi)
    const tgt = parseFloat(target.vpi_target)
    if (est > tgt) warnings.push({ level: 'danger', msg: `المؤشر التقديري الحالي ${est.toFixed(1)} يتجاوز المستهدف ${tgt}` })
  }
  if (liveVPI?.confidence_score === 'low') {
    warnings.push({ level: 'info', msg: 'بيانات الشهر الحالي قليلة — مستوى الثقة منخفض (أقل من 30% من أيام الشهر)' })
  }
  if (ops.in_progress_rate > 40) {
    warnings.push({ level: 'warning', msg: `${ops.in_progress_rate.toFixed(1)}% من البلاغات قيد التنفيذ — نسبة مرتفعة` })
  }
  if (ops.visit_compliance_rate < 60) {
    warnings.push({ level: 'warning', msg: `نسبة الامتثال للزيارات ${ops.visit_compliance_rate.toFixed(1)}% — دون المستهدف` })
  }
  return warnings
}

// ─── Executive Summary ────────────────────────────────────────────────────────

export async function generateEOISummary(month) {
  const [ops, liveVPI, topMunis, topElems, topZones, inProg] = await Promise.all([
    getOperationalSummary({ month }),
    getLiveVPI(month),
    getStatusBreakdown({ month, groupBy: 'municipality' }),
    getStatusBreakdown({ month, groupBy: 'element' }),
    getStatusBreakdown({ month, groupBy: 'zone' }),
    getInProgressAnalysis({ month }),
  ])

  const label = monthLabel(month)
  const lines = []

  // Total reports
  lines.push(`بلغ عدد البلاغات المرصودة من المصادر الخارجية خلال ${label} ${ops.total_reports.toLocaleString('en-US')} بلاغاً.`)

  // Top municipality
  if (topMunis.length > 0) {
    const topM = topMunis[0]
    const pct  = ops.total_reports > 0 ? (topM.total / ops.total_reports * 100).toFixed(1) : 0
    lines.push(`تشكّل بلدية ${topM.group_name} ${pct}% من إجمالي البلاغات المرصودة.`)
  }

  // Top element
  if (topElems.length > 0) {
    const topE = topElems[0]
    const pct  = ops.total_reports > 0 ? (topE.total / ops.total_reports * 100).toFixed(1) : 0
    lines.push(`يمثّل عنصر "${topE.group_name}" أعلى عنصر تأثيراً بنسبة ${pct}%.`)
  }

  // Operational KPIs
  lines.push(`بلغت نسبة الإغلاق ${ops.closure_rate.toFixed(1)}%، ونسبة الامتثال للزيارات ${ops.visit_compliance_rate.toFixed(1)}%.`)

  // In-progress
  if (inProg.stalledCount > 0) {
    lines.push(`تُصنَّف ${inProg.stalledCount} بلاغاً متعثرة (قيد التنفيذ أكثر من ${inProg.stalledThreshold} يوماً).`)
  }

  // Live VPI
  if (liveVPI?.estimated_vpi != null) {
    const estVPI = parseFloat(liveVPI.estimated_vpi).toFixed(1)
    let vpiLine  = `يبلغ مؤشر VPI التقديري الحالي ${estVPI} مخالفة/كم² (قيمة تقديرية من بيانات الرصد الخارجي).`
    if (liveVPI.forecast_vpi_eom != null) {
      const fVPI = parseFloat(liveVPI.forecast_vpi_eom).toFixed(1)
      vpiLine += ` ويُتوقع أن يصل إلى ${fVPI} مخالفة/كم² بنهاية الشهر.`
    }
    lines.push(vpiLine)

    const confLabel = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' }[liveVPI.confidence_score] || ''
    if (liveVPI.covered_area_km2) {
      lines.push(`نسبة التغطية المتاحة ${(liveVPI.data_days / liveVPI.days_in_month * 100).toFixed(0)}%، مستوى الثقة في التوقع: ${confLabel}.`)
    }
  }

  // Insights
  const insights = _buildInsights(ops, liveVPI, topMunis, topElems, inProg)

  return { summary: lines.join(' '), insights, month }
}

function _buildInsights(ops, liveVPI, topMunis, topElems, inProg) {
  const insights = []

  if (topMunis.length > 0 && ops.total_reports > 0) {
    const top   = topMunis[0]
    const pct   = (top.total / ops.total_reports * 100).toFixed(1)
    const level = parseFloat(pct) > 35 ? 'warning' : 'info'
    insights.push({ type: level, title: 'أعلى بلدية تأثيراً', body: `${top.group_name} — ${pct}% من إجمالي البلاغات (${top.total.toLocaleString('en-US')} بلاغ)` })
  }

  if (topElems.length > 0) {
    insights.push({ type: 'info', title: 'أكثر عنصر رصداً', body: `"${topElems[0].group_name}" — ${topElems[0].total.toLocaleString('en-US')} بلاغ` })
  }

  if (ops.visit_compliance_rate < 60) {
    insights.push({ type: 'warning', title: 'نسبة زيارات منخفضة', body: `نسبة الزيارات ${ops.visit_compliance_rate.toFixed(1)}% — يُستحسن تكثيف جولات التفتيش` })
  } else {
    insights.push({ type: 'success', title: 'امتثال جيد للزيارات', body: `${ops.visit_compliance_rate.toFixed(1)}% من البلاغات تمت زيارتها` })
  }

  if (inProg.stalledCount > 0) {
    insights.push({ type: 'alert', title: 'بلاغات متعثرة', body: `${inProg.stalledCount} بلاغ قيد التنفيذ منذ أكثر من ${inProg.stalledThreshold} يوماً` })
  }

  if (liveVPI?.confidence_score === 'high' && liveVPI?.estimated_vpi != null) {
    insights.push({ type: 'success', title: 'توقع موثوق', body: `بيانات كافية — مستوى ثقة مرتفع (${(liveVPI.data_days / liveVPI.days_in_month * 100).toFixed(0)}% من أيام الشهر)` })
  }

  return insights
}

// ─── AI Copilot Query ─────────────────────────────────────────────────────────

export async function getEOIForAI({ month, municipalityName, queryType = 'summary' } = {}) {
  const months     = await getAvailableEOIMonths()
  const target     = month || months[0]
  if (!target) return { error: 'لا توجد بيانات رصد خارجي بعد' }

  switch (queryType) {
    case 'visit_status':    return { month: target, data: await getVisitStatusAnalysis({ month: target, municipalityName }) }
    case 'in_progress':     return { month: target, data: await getInProgressAnalysis({ month: target, municipalityName }) }
    case 'repeated':        return { month: target, data: await getRepeatedAnalysis({ month: target, municipalityName }) }
    case 'early_warning':   return { month: target, data: await getEarlyWarning(target) }
    case 'breakdown':       return { month: target, data: await getStatusBreakdown({ month: target, municipalityName, groupBy: 'municipality' }) }
    case 'live_vpi':        return { month: target, data: await getLiveVPI(target) }
    default: {
      const [ops, liveVPI, early] = await Promise.all([
        getOperationalSummary({ month: target, municipalityName }),
        getLiveVPI(target),
        getEarlyWarning(target),
      ])
      return { month: target, operational: ops, liveVPI, earlyWarning: early }
    }
  }
}

// ─── Conversion Rules ─────────────────────────────────────────────────────────

export async function getUnitRules() {
  const { rows } = await pool.query(`SELECT * FROM eoi_unit_rules ORDER BY created_at`)
  return rows
}

export async function upsertUnitRule(elementPattern, matchType, factor, description, userId) {
  const { rows } = await pool.query(`
    INSERT INTO eoi_unit_rules (element_pattern, match_type, factor, description)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (element_pattern) DO UPDATE SET
      match_type  = EXCLUDED.match_type,
      factor      = EXCLUDED.factor,
      description = EXCLUDED.description,
      is_active   = TRUE
    RETURNING *
  `, [elementPattern, matchType || 'exact', factor, description || null])
  return rows[0]
}

export async function getUploadHistory() {
  const { rows } = await pool.query(`
    SELECT j.*, u.full_name AS uploaded_by_name
    FROM eoi_upload_jobs j
    LEFT JOIN users u ON u.id = j.uploaded_by
    ORDER BY j.created_at DESC LIMIT 30
  `)
  return rows
}

// ids: array of job IDs, or 'all' to delete everything
export async function deleteUploadJobs(ids) {
  let affectedMonths = []

  if (ids === 'all') {
    const { rows } = await pool.query(`SELECT DISTINCT observation_month FROM eoi_observations`)
    affectedMonths = rows.map(r => r.observation_month)
    await pool.query(`DELETE FROM eoi_observations`)
    await pool.query(`DELETE FROM eoi_upload_jobs`)
  } else {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error('لم يتم تحديد أي سجلات')
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const { rows } = await pool.query(
      `SELECT DISTINCT observation_month FROM eoi_observations WHERE upload_job_id IN (${placeholders})`,
      ids
    )
    affectedMonths = rows.map(r => r.observation_month)
    await pool.query(`DELETE FROM eoi_observations WHERE upload_job_id IN (${placeholders})`, ids)
    await pool.query(`DELETE FROM eoi_upload_jobs WHERE id IN (${placeholders})`, ids)
  }

  return { affectedMonths: [...new Set(affectedMonths)] }
}

// ─── VPI Estimated Analysis (per municipality + per element) ─────────────────

export async function getEOIVPIAnalysis({ month, municipalityName } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  if (month)            { where += ` AND observation_month=$${params.length+1}`; params.push(month) }
  if (municipalityName) { where += ` AND municipality_name ILIKE $${params.length+1}`; params.push(`%${municipalityName}%`) }

  // Get covered area for this month (official dataset)
  const covParams = month ? [month] : []
  const covWhere  = month ? 'WHERE month=$1' : ''
  const { rows: [covRow] } = await pool.query(
    `SELECT SUM(covered_area_km2) AS covered FROM vpi_coverage ${covWhere}`,
    covParams
  )
  const coveredArea = covRow?.covered ? parseFloat(covRow.covered) : null

  // Totals for the month (full + adjusted)
  const { rows: [totals] } = await pool.query(`
    SELECT
      COUNT(*)::int                    AS total_reports,
      COALESCE(SUM(estimated_units),0) AS total_units,
      -- Adjusted: exclude visit_status containing 'خاطئ' (NULL-safe)
      COUNT(*) FILTER (WHERE visit_status IS NULL OR visit_status NOT ILIKE '%خاطئ%')::int AS adj_reports,
      COALESCE(SUM(estimated_units) FILTER (WHERE visit_status IS NULL OR visit_status NOT ILIKE '%خاطئ%'), 0) AS adj_units
    FROM eoi_observations ${where}
  `, params)

  const totalUnits    = parseFloat(totals.total_units)  || 0
  const totalReports  = totals.total_reports             || 0
  const adjUnits      = parseFloat(totals.adj_units)     || 0
  const adjReports    = totals.adj_reports               || 0
  const overallVPI    = (coveredArea && coveredArea > 0) ? totalUnits / coveredArea : null
  const adjOverallVPI = (coveredArea && coveredArea > 0) ? adjUnits   / coveredArea : null

  // By municipality (with adj units)
  const { rows: byMuni } = await pool.query(`
    SELECT
      municipality_name,
      COUNT(*)::int                    AS total_reports,
      COALESCE(SUM(estimated_units),0) AS estimated_units,
      COALESCE(SUM(estimated_units) FILTER (WHERE visit_status IS NULL OR visit_status NOT ILIKE '%خاطئ%'), 0) AS adj_units,
      COUNT(*) FILTER (WHERE (closure_status ILIKE '%مغلق%' OR closure_status ILIKE '%closed%')
                          AND closure_status NOT ILIKE '%آلي%')::int AS closed,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%آلي%'
                          OR report_status  ILIKE '%آلي%')::int      AS auto_closed,
      COUNT(*) FILTER (WHERE closure_status ILIKE '%تنفيذ%' OR closure_status ILIKE '%progress%'
                          OR report_status  ILIKE '%تنفيذ%' OR report_status  ILIKE '%progress%')::int AS in_progress
    FROM eoi_observations ${where}
    GROUP BY municipality_name
    HAVING COUNT(*) > 0
    ORDER BY estimated_units DESC
  `, params)

  // Per municipality: get covered area per municipality (if available)
  const { rows: muniCov } = await pool.query(`
    SELECT municipality_name, SUM(covered_area_km2) AS covered
    FROM vpi_coverage
    ${month ? 'WHERE month=$1' : ''}
    GROUP BY municipality_name
  `, covParams)
  const muniCovMap = {}
  muniCov.forEach(r => { muniCovMap[r.municipality_name] = parseFloat(r.covered) })

  const muniRows = byMuni.map(r => {
    const units      = parseFloat(r.estimated_units) || 0
    const adjU       = parseFloat(r.adj_units)       || 0
    const mCovered   = muniCovMap[r.municipality_name] || null
    const muniVPI    = (mCovered && mCovered > 0) ? units / mCovered : null
    const muniAdjVPI = (mCovered && mCovered > 0) ? adjU  / mCovered : null
    const unitsPct   = totalUnits > 0 ? units / totalUnits * 100 : 0
    const vpiContrib = (overallVPI && overallVPI > 0) ? (muniVPI != null ? muniVPI / overallVPI * 100 : null) : null
    return {
      municipality_name: r.municipality_name,
      total_reports:     r.total_reports,
      estimated_units:   units,
      adj_units:         adjU,
      units_pct:         unitsPct,
      covered_area_km2:  mCovered,
      estimated_vpi:     muniVPI,
      adj_estimated_vpi: muniAdjVPI,
      vpi_contribution:  vpiContrib,
      closed:            r.closed,
      auto_closed:       r.auto_closed,
      in_progress:       r.in_progress,
    }
  })

  // By element (with adj units)
  const { rows: byElem } = await pool.query(`
    SELECT
      element_name,
      COUNT(*)::int                    AS total_reports,
      COALESCE(SUM(estimated_units),0) AS estimated_units,
      COALESCE(SUM(estimated_units) FILTER (WHERE visit_status IS NULL OR visit_status NOT ILIKE '%خاطئ%'), 0) AS adj_units,
      AVG(estimated_units)::numeric(10,4) AS avg_factor
    FROM eoi_observations ${where}
    GROUP BY element_name
    HAVING COUNT(*) > 0
    ORDER BY estimated_units DESC
  `, params)

  const elemRows = byElem.map(r => {
    const units    = parseFloat(r.estimated_units) || 0
    const adjU     = parseFloat(r.adj_units)       || 0
    const unitsPct = totalUnits > 0 ? units / totalUnits * 100 : 0
    const elemVPI    = (coveredArea && coveredArea > 0) ? units / coveredArea : null
    const elemAdjVPI = (coveredArea && coveredArea > 0) ? adjU  / coveredArea : null
    return {
      element_name:      r.element_name,
      total_reports:     r.total_reports,
      estimated_units:   units,
      adj_units:         adjU,
      units_pct:         unitsPct,
      avg_factor:        parseFloat(r.avg_factor),
      estimated_vpi:     elemVPI,
      adj_estimated_vpi: elemAdjVPI,
    }
  })

  return {
    month,
    covered_area_km2: coveredArea,
    total_reports:    totalReports,
    total_units:      totalUnits,
    adj_reports:      adjReports,
    adj_units:        adjUnits,
    overall_vpi:      overallVPI,
    adj_overall_vpi:  adjOverallVPI,
    by_municipality:  muniRows,
    by_element:       elemRows,
  }
}

// ─── Map Points ───────────────────────────────────────────────────────────────

export async function getEOIMapPoints({ months, includeSystemReports = false }) {
  let where = 'WHERE lat IS NOT NULL AND lng IS NOT NULL'
  const params = []

  if (months?.length) {
    const placeholders = months.map((_, i) => `$${i + 1}`).join(',')
    where += ` AND observation_month IN (${placeholders})`
    params.push(...months)
  }

  const { rows: observations } = await pool.query(`
    SELECT
      id, lat, lng, observation_month, municipality_name, element_name,
      closure_status, report_status, visit_status, report_number, repeated_count,
      observation_date
    FROM eoi_observations ${where}
    ORDER BY observation_month DESC
    LIMIT 5000
  `, params)

  let systemReports = []
  if (includeSystemReports) {
    const { rows } = await pool.query(`
      SELECT
        id, gps_lat AS lat, gps_lng AS lng,
        element_label AS element_name,
        municipality AS municipality_name,
        status AS closure_status,
        created_at::date::text AS observation_date
      FROM reports
      WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL
        AND status NOT IN ('rejected')
      ORDER BY created_at DESC
      LIMIT 3000
    `)
    systemReports = rows
  }

  return { observations, systemReports }
}
