// Analytics Service — UrbanAI Spatial Operations Copilot
// All queries are RBAC-scoped: entity scope, user scope, or unrestricted (admin).
// All parameters are fully parameterized — no string interpolation of user data.

import { query } from './db.js'

// ─── Period helpers ───────────────────────────────────────────────────────────

const PERIOD_SQL = {
  today:    `NOW() - INTERVAL '1 day'`,
  week:     `NOW() - INTERVAL '7 days'`,
  month:    `NOW() - INTERVAL '30 days'`,
  '3months': `NOW() - INTERVAL '90 days'`,
  year:     `NOW() - INTERVAL '365 days'`,
}

// ─── RBAC scope helpers ───────────────────────────────────────────────────────

function addScopeFilter(where, params, scope, alias = 'r') {
  if (!scope) return
  if (scope.type === 'entity') {
    params.push(scope.entityId)
    where.push(`${alias}.entity_id = $${params.length}::uuid`)
  } else if (scope.type === 'user') {
    params.push(scope.userId)
    where.push(`(${alias}.created_by = $${params.length}::uuid OR ${alias}.assigned_to = $${params.length}::uuid)`)
  }
  // unrestricted — no filter
}

function addPeriodFilter(where, period) {
  const sql = PERIOD_SQL[period]
  if (sql) where.push(`r.created_at >= ${sql}`)
}

// ─── Report Statistics ────────────────────────────────────────────────────────

export async function getReportStats({ period, group_by, status, element_type, scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`]

  addScopeFilter(where, params, scope)
  addPeriodFilter(where, period)
  if (status)       { params.push(status);       where.push(`r.status = $${params.length}`) }
  if (element_type) { params.push(element_type); where.push(`r.element_id = $${params.length}`) }

  const whereClause = where.join(' AND ')

  const GROUP_EXPRS = {
    element:          `COALESCE(r.element_label, r.element_id, 'أخرى')`,
    status:           `r.status`,
    entity:           `COALESCE(e.name, r.entity_id::text, 'غير محدد')`,
    district:         `COALESCE(r.district, 'غير محدد')`,
    month:            `TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM')`,
    ingestion_source: `r.ingestion_source`,
  }

  const groupExpr = GROUP_EXPRS[group_by]

  if (groupExpr) {
    const { rows } = await query(`
      SELECT ${groupExpr} AS group_key,
             COUNT(*) AS count,
             COUNT(*) FILTER (WHERE r.status = 'closed_final') AS closed,
             COALESCE(SUM(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS total_fines
      FROM reports r
      LEFT JOIN entities e ON e.id = r.entity_id
      WHERE ${whereClause}
      GROUP BY ${groupExpr}
      ORDER BY count DESC
      LIMIT 20
    `, params)
    return { groups: rows, group_by, period }
  }

  const { rows: [stats] } = await query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE r.status NOT IN ('closed_final','rejected','deleted')) AS open_count,
      COUNT(*) FILTER (WHERE r.status = 'closed_final') AS closed_count,
      COUNT(*) FILTER (WHERE r.status = 'rejected') AS rejected_count,
      COUNT(*) FILTER (WHERE r.status = 'draft') AS draft_count,
      COUNT(*) FILTER (WHERE r.closure_type = 'fine_issued') AS fines_issued,
      COALESCE(SUM(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS total_fines,
      COALESCE(AVG(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS avg_fine,
      ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'closed_final') / NULLIF(COUNT(*), 0), 1) AS closure_rate
    FROM reports r
    WHERE ${whereClause}
  `, params)

  return { summary: stats, period }
}

// ─── Inspector / Monitor Performance ─────────────────────────────────────────

export async function getInspectorPerformance({ period, entity_name, inspector_name, top_n = 10, scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`, `r.assigned_to IS NOT NULL`]

  addScopeFilter(where, params, scope)
  addPeriodFilter(where, period)

  if (entity_name) {
    params.push(`%${entity_name}%`)
    where.push(`e.name ILIKE $${params.length}`)
  }

  if (inspector_name) {
    params.push(`%${inspector_name}%`)
    where.push(`u.full_name ILIKE $${params.length}`)
  }

  params.push(Math.min(Number(top_n) || 10, 50))

  const { rows } = await query(`
    SELECT u.full_name AS name,
           e.name AS entity_name,
           COUNT(*) AS total_reports,
           COUNT(*) FILTER (WHERE r.status = 'closed_final') AS closed_reports,
           COUNT(*) FILTER (WHERE r.status NOT IN ('closed_final','rejected','deleted')) AS open_reports,
           ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'closed_final') / NULLIF(COUNT(*), 0), 1) AS closure_rate,
           ROUND(AVG(EXTRACT(EPOCH FROM (r.updated_at - r.created_at)) / 3600.0)
                 FILTER (WHERE r.status = 'closed_final'), 1) AS avg_resolution_hours
    FROM reports r
    JOIN users u ON u.id = r.assigned_to
    LEFT JOIN entities e ON e.id = u.entity_id
    WHERE ${where.join(' AND ')}
    GROUP BY u.id, u.full_name, e.name
    ORDER BY total_reports DESC
    LIMIT $${params.length}
  `, params)

  return { inspectors: rows, period, entity_name }
}

// ─── Spatial Reports ──────────────────────────────────────────────────────────
// Tries PostGIS spatial intersection against governance layers first;
// falls back to text matching on municipality/district/location_name.

export async function getSpatialReports({ municipality, district, element_type, status, limit = 100, scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`]

  addScopeFilter(where, params, scope)
  if (status)       { params.push(status);       where.push(`r.status = $${params.length}`) }
  if (element_type) { params.push(element_type); where.push(`r.element_id = $${params.length}`) }

  if (municipality) {
    params.push(`%${municipality}%`)
    const p = params.length
    where.push(`(
      r.municipality ILIKE $${p} OR r.district ILIKE $${p} OR r.location_name ILIKE $${p}
      OR (r.location IS NOT NULL AND EXISTS (
        SELECT 1 FROM spatial_layer_features slf
        JOIN spatial_layers sl ON sl.id = slf.spatial_layer_id
        WHERE sl.is_active = true
          AND sl.layer_type IN ('municipalities','districts','neighborhoods')
          AND (slf.feature_name ILIKE $${p} OR slf.feature_label ILIKE $${p})
          AND ST_Intersects(r.location, slf.geometry)
        LIMIT 1
      ))
    )`)
  } else if (district) {
    params.push(`%${district}%`)
    where.push(`(r.district ILIKE $${params.length} OR r.location_name ILIKE $${params.length})`)
  }

  params.push(Math.min(Number(limit) || 100, 500))

  const { rows } = await query(`
    SELECT r.id, r.report_number, r.element_id, r.element_label, r.status,
           r.gps_lat::double precision AS lat, r.gps_lng::double precision AS lng,
           r.district, r.location_name, r.municipality,
           r.estimated_fine::numeric AS estimated_fine,
           r.created_at, r.ingestion_source,
           e.name AS entity_name
    FROM reports r
    LEFT JOIN entities e ON e.id = r.entity_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.created_at DESC
    LIMIT $${params.length}
  `, params)

  // Build bounding box for map zoom
  const withCoords = rows.filter(r => r.lat != null && r.lng != null)
  let bbox = null
  if (withCoords.length > 0) {
    const lats = withCoords.map(r => parseFloat(r.lat))
    const lngs = withCoords.map(r => parseFloat(r.lng))
    bbox = {
      south: Math.min(...lats), north: Math.max(...lats),
      west:  Math.min(...lngs), east:  Math.max(...lngs),
    }
    // Add padding so markers aren't at the edge
    const latPad = (bbox.north - bbox.south) * 0.15 || 0.01
    const lngPad = (bbox.east  - bbox.west)  * 0.15 || 0.01
    bbox.south -= latPad; bbox.north += latPad
    bbox.west  -= lngPad; bbox.east  += lngPad
  }

  return { reports: rows, count: rows.length, bbox, filters: { municipality, district, element_type, status } }
}

// ─── Financial Forecast ───────────────────────────────────────────────────────

export async function getFinancialForecast({ period, group_by, scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`]

  addScopeFilter(where, params, scope)
  addPeriodFilter(where, period)

  const GROUP_EXPRS = {
    element:  `COALESCE(r.element_label, r.element_id, 'أخرى')`,
    month:    `TO_CHAR(DATE_TRUNC('month', r.created_at), 'YYYY-MM')`,
    entity:   `COALESCE(e.name, 'غير محدد')`,
    district: `COALESCE(r.district, 'غير محدد')`,
  }
  const groupExpr = GROUP_EXPRS[group_by] || GROUP_EXPRS.element

  const [groupedRes, summaryRes] = await Promise.all([
    query(`
      SELECT ${groupExpr} AS group_key,
             COUNT(*) AS total_reports,
             COUNT(*) FILTER (WHERE r.closure_type = 'fine_issued') AS fines_issued,
             COALESCE(SUM(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS total_fines,
             COALESCE(AVG(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS avg_fine
      FROM reports r
      LEFT JOIN entities e ON e.id = r.entity_id
      WHERE ${where.join(' AND ')}
      GROUP BY ${groupExpr}
      ORDER BY total_fines DESC
      LIMIT 20
    `, params),
    query(`
      SELECT
        COALESCE(SUM(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS total_collected,
        COALESCE(SUM(r.estimated_fine::numeric) FILTER (WHERE r.estimated_fine IS NOT NULL), 0) AS total_potential,
        COUNT(*) FILTER (WHERE r.closure_type = 'fine_issued') AS fines_issued,
        COALESCE(AVG(r.estimated_fine::numeric) FILTER (WHERE r.closure_type = 'fine_issued'), 0) AS avg_fine
      FROM reports r
      WHERE ${where.join(' AND ')}
    `, params),
  ])

  return { groups: groupedRes.rows, summary: summaryRes.rows[0], period, group_by }
}

// ─── Report Detail + Audit Trail ─────────────────────────────────────────────

export async function getReportDetail({ report_id, report_number, scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`]
  addScopeFilter(where, params, scope)

  // Determine lookup strategy
  let orderClause = 'r.created_at ASC'
  const lowerNum  = (report_number || '').toLowerCase()

  if (report_id) {
    params.push(report_id)
    where.push(`r.id = $${params.length}::uuid`)
  } else if (lowerNum === 'first' || lowerNum === 'أول' || lowerNum === 'الأول') {
    orderClause = 'r.created_at ASC'
  } else if (lowerNum === 'last' || lowerNum === 'latest' || lowerNum === 'أخير' || lowerNum === 'الأخير') {
    orderClause = 'r.created_at DESC'
  } else if (report_number) {
    params.push(`%${report_number}%`)
    where.push(`r.report_number ILIKE $${params.length}`)
  }

  const { rows } = await query(`
    SELECT r.id, r.report_number, r.element_id, r.element_label,
           r.status, r.closure_type, r.district, r.municipality, r.location_name,
           r.gps_lat::double precision AS lat, r.gps_lng::double precision AS lng,
           r.ingestion_source, r.estimated_fine::numeric AS estimated_fine,
           r.description, r.created_at, r.updated_at,
           e.name     AS entity_name,
           u_a.full_name AS assigned_to_name,
           u_c.full_name AS created_by_name
    FROM reports r
    LEFT JOIN entities e ON e.id = r.entity_id
    LEFT JOIN users u_a  ON u_a.id = r.assigned_to
    LEFT JOIN users u_c  ON u_c.id = r.created_by
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderClause}
    LIMIT 1
  `, params)

  if (!rows.length) return { error: 'لم يتم العثور على البلاغ ضمن نطاق صلاحياتك' }
  const report = rows[0]

  // Full audit trail
  const { rows: auditRows } = await query(`
    SELECT al.action, al.created_at, al.metadata,
           u.full_name AS performed_by
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.performed_by
    WHERE al.subject_type = 'report' AND al.subject_id = $1::uuid
    ORDER BY al.created_at ASC
    LIMIT 100
  `, [report.id])

  return { report, audit_trail: auditRows }
}

// ─── Element Types ────────────────────────────────────────────────────────────

export async function getElementTypes({ scope } = {}) {
  const params = []
  const where  = [`r.status != 'deleted'`, `r.element_id IS NOT NULL`]
  addScopeFilter(where, params, scope)

  const { rows } = await query(`
    SELECT r.element_id                          AS id,
           COALESCE(r.element_label, r.element_id) AS label,
           COUNT(*)                               AS report_count
    FROM reports r
    WHERE ${where.join(' AND ')}
    GROUP BY r.element_id, r.element_label
    ORDER BY report_count DESC
    LIMIT 60
  `, params)

  return { elements: rows, total: rows.length }
}

// ─── Heatmap Data ─────────────────────────────────────────────────────────────

export async function getHeatmapData({ element_type, period, municipality, scope } = {}) {
  const params = []
  const where  = [
    `r.status != 'deleted'`,
    `r.gps_lat IS NOT NULL`,
    `r.gps_lng IS NOT NULL`,
  ]

  addScopeFilter(where, params, scope)
  addPeriodFilter(where, period)

  if (element_type) {
    params.push(element_type)
    where.push(`r.element_id = $${params.length}`)
  }

  if (municipality) {
    params.push(`%${municipality}%`)
    const p = params.length
    where.push(`(r.municipality ILIKE $${p} OR r.district ILIKE $${p} OR r.location_name ILIKE $${p})`)
  }

  const { rows } = await query(`
    SELECT r.gps_lat::double precision AS lat,
           r.gps_lng::double precision AS lng,
           r.element_id,
           r.status
    FROM reports r
    WHERE ${where.join(' AND ')}
    LIMIT 2000
  `, params)

  return { points: rows, count: rows.length, element_type, period, municipality }
}
