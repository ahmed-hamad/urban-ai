/**
 * Notification service — inserts rows into the notifications table.
 * All functions are fire-and-forget (errors are logged, never propagated).
 */
import { query } from './db.js'

async function insertNotification(userId, type, title, body, link, reportId) {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, link, report_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, title, body || null, link || null, reportId || null],
    )
  } catch (err) {
    // Never crash the main request — notifications are best-effort
    console.error('[notify] insert failed:', err.message)
  }
}

// Notify a specific list of user IDs (skip the actor who triggered the event)
async function notifyUsers(userIds, actorId, payload) {
  const targets = [...new Set(userIds)].filter(id => id && id !== actorId)
  await Promise.all(targets.map(uid =>
    insertNotification(uid, payload.type, payload.title, payload.body, payload.link, payload.reportId),
  ))
}

// Fetch all active user IDs matching a WHERE condition (reusable helper)
async function fetchUserIds(whereClause, params) {
  try {
    const { rows } = await query(
      `SELECT id FROM users WHERE status = 'active' AND ${whereClause}`, params,
    )
    return rows.map(r => r.id)
  } catch {
    return []
  }
}

// ── Public event emitters ──────────────────────────────────────────────────────

/**
 * A new report was created (draft → submitted or direct create).
 * Notifies all managers and executives in the same entity, plus admins.
 */
export async function onReportCreated({ reportId, reportNumber, elementLabel, entityId, actorId }) {
  const title = `بلاغ جديد: ${elementLabel || reportNumber}`
  const body  = `رقم البلاغ ${reportNumber}`
  const link  = `/reports/${reportId}`

  const ids = await fetchUserIds(
    `(role IN ('admin', 'executive') OR (role = 'manager' AND entity_id = $1::uuid))`,
    [entityId],
  )
  await notifyUsers(ids, actorId, { type: 'report_submitted', title, body, link, reportId })
}

/**
 * Report assigned to a specific user.
 */
export async function onReportAssigned({ reportId, reportNumber, elementLabel, assignedToId, actorId }) {
  if (!assignedToId) return
  await notifyUsers([assignedToId], actorId, {
    type:     'report_assigned',
    title:    `تم إسناد بلاغ إليك`,
    body:     `البلاغ ${reportNumber}${elementLabel ? ' — ' + elementLabel : ''}`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Report moved to quality_review — notify all auditors in the entity.
 */
export async function onQualityReviewNeeded({ reportId, reportNumber, entityId, actorId }) {
  const ids = await fetchUserIds(
    `(role = 'auditor' OR (role = 'admin')) AND (entity_id = $1::uuid OR role = 'admin')`,
    [entityId],
  )
  await notifyUsers(ids, actorId, {
    type:     'quality_review_needed',
    title:    `بلاغ يحتاج مراجعة جودة`,
    body:     `البلاغ ${reportNumber} جاهز للمراجعة النهائية`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Report rejected — notify the creator.
 */
export async function onReportRejected({ reportId, reportNumber, createdBy, actorId }) {
  if (!createdBy) return
  await notifyUsers([createdBy], actorId, {
    type:     'report_rejected',
    title:    `رُفض البلاغ`,
    body:     `تم رفض البلاغ ${reportNumber}`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Report closed_final — notify creator and assigned user.
 */
export async function onReportClosed({ reportId, reportNumber, createdBy, assignedTo, actorId }) {
  const ids = [createdBy, assignedTo].filter(Boolean)
  await notifyUsers(ids, actorId, {
    type:     'report_closed',
    title:    `أُغلق البلاغ نهائياً`,
    body:     `البلاغ ${reportNumber} تم إغلاقه واعتماده`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Inspector closed the report (pending management review).
 * Notify managers and executives in the entity.
 */
export async function onInspectorClosed({ reportId, reportNumber, elementLabel, entityId, actorId }) {
  const ids = await fetchUserIds(
    `(role IN ('admin', 'executive', 'manager') AND (entity_id = $1::uuid OR role IN ('admin','executive')))`,
    [entityId],
  )
  await notifyUsers(ids, actorId, {
    type:     'inspector_closed',
    title:    `إغلاق المراقب: ${elementLabel || reportNumber}`,
    body:     `البلاغ ${reportNumber} أُغلق من المراقب ويحتاج مراجعة`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Report moved to under_review — notify creator.
 */
export async function onReportUnderReview({ reportId, reportNumber, createdBy, actorId }) {
  if (!createdBy) return
  await notifyUsers([createdBy], actorId, {
    type:     'report_under_review',
    title:    `بلاغك قيد المراجعة`,
    body:     `البلاغ ${reportNumber} تحت المراجعة من قبل الإدارة`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}

/**
 * Duplicate group detected — notify all involved parties.
 */
export async function onDuplicateDetected({ reportId, reportNumber, duplicateCount, entityId, actorId }) {
  const ids = await fetchUserIds(
    `role IN ('admin', 'executive', 'manager') AND (entity_id = $1::uuid OR role IN ('admin','executive'))`,
    [entityId],
  )
  await notifyUsers(ids, actorId, {
    type:     'duplicate_detected',
    title:    `تكرار بلاغ مكتشف`,
    body:     `البلاغ ${reportNumber} مكرر في ${duplicateCount} مصدر رصد`,
    link:     `/reports/${reportId}`,
    reportId,
  })
}
