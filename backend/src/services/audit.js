import { query } from './db.js'

export async function audit(subjectType, subjectId, action, actor, meta = {}) {
  await query(
    `INSERT INTO audit_logs (subject_type, subject_id, action, performed_by, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [subjectType, subjectId, action, actor.id, actor.entityId, JSON.stringify(meta)],
  )
}
