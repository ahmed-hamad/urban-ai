import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { requirePermission } from '../middleware/auth.js'
import { query } from '../services/db.js'

const ROLE_DEFAULT_PERMISSIONS = {
  admin:     ['create_report', 'view_reports', 'edit_report', 'assign_report',
              'close_inspector', 'quality_review', 'close_final', 'reject_report',
              'manage_users', 'manage_entities', 'reset_password',
              'view_financials', 'view_audit_log', 'gis_access', 'ai_access'],
  executive: ['view_reports', 'assign_report', 'reject_report',
              'manage_users', 'manage_entities', 'view_financials', 'view_audit_log', 'gis_access'],
  manager:   ['create_report', 'view_reports', 'edit_report', 'assign_report',
              'view_financials', 'view_audit_log', 'gis_access', 'reset_password'],
  auditor:   ['view_reports', 'quality_review', 'close_final', 'reject_report', 'view_audit_log'],
  monitor:   ['create_report', 'view_reports', 'close_inspector', 'gis_access', 'ai_access'],
}

async function audit(subjectType, subjectId, action, actor, meta = {}) {
  await query(
    `INSERT INTO audit_logs (subject_type, subject_id, action, performed_by, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [subjectType, subjectId, action, actor.id, actor.entityId, JSON.stringify(meta)],
  )
}

const router = Router()

const USER_SELECT = `
  SELECT u.id, u.full_name AS name, u.email, u.role, u.status,
         u.entity_id, u.avatar, u.join_date, u.created_at,
         u.permissions, u.phone, e.name AS entity_name
  FROM users u
  LEFT JOIN entities e ON e.id = u.entity_id`

// GET /api/users — scoped by role
router.get('/', requirePermission('view_reports'), async (req, res) => {
  const { role: actorRole, entityId, entity } = req.user
  const params = []
  let where = `WHERE u.status != 'inactive'`

  if (actorRole === 'manager') {
    const eid = entityId || entity
    if (eid) {
      params.push(eid)
      where += ` AND u.entity_id = $${params.length}::uuid`
    }
  }

  const { rows } = await query(`${USER_SELECT} ${where} ORDER BY u.full_name`, params)
  res.json({ users: rows })
})

// GET /api/users/entities — returns all active entities (for admin entity selector)
// MUST be defined before /:id to avoid "entities" being treated as a user ID
router.get('/entities', requirePermission('manage_entities'), async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, type, code FROM entities WHERE is_active = true ORDER BY name ASC`,
  )
  res.json({ entities: rows })
})

// GET /api/users/:id
router.get('/:id', requirePermission('view_reports'), async (req, res) => {
  const { role: actorRole, entityId, id: actorId } = req.user
  const targetId = req.params.id

  if (actorRole !== 'admin' && actorRole !== 'executive' && targetId !== actorId && actorRole !== 'manager') {
    return res.status(403).json({ error: 'Forbidden', code: 'PROFILE_ACCESS_DENIED' })
  }

  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [targetId])
  if (!rows.length) return res.status(404).json({ error: 'User not found' })

  res.json({ user: rows[0] })
})

// POST /api/users — requires manage_users permission
router.post('/', requirePermission('manage_users'), async (req, res) => {
  const { name, email, role, entityId, password, permissions, phone } = req.body
  const actorRole = req.user.role

  if (!name || !email || !role || !password) {
    return res.status(400).json({ error: 'الاسم والبريد والدور وكلمة المرور مطلوبة', code: 'MISSING_FIELDS' })
  }

  if (actorRole === 'manager' && ['admin', 'executive'].includes(role)) {
    return res.status(403).json({ error: 'Forbidden', code: 'PRIVILEGE_ESCALATION' })
  }

  if (role !== 'admin' && !entityId) {
    return res.status(400).json({ error: 'الجهة التنظيمية إلزامية لهذا الدور', code: 'ENTITY_REQUIRED' })
  }

  const finalPerms = Array.isArray(permissions) && permissions.length > 0
    ? permissions
    : (ROLE_DEFAULT_PERMISSIONS[role] || [])

  const hash = await bcrypt.hash(password, 12)
  const avatar = name.trim().slice(0, 2)

  try {
    const { rows: [user] } = await query(
      `INSERT INTO users (full_name, email, role, entity_id, password_hash, avatar, permissions, phone)
       VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8)
       RETURNING id, full_name AS name, email, role, entity_id, status, avatar, join_date, permissions, phone`,
      [name.trim(), email.toLowerCase().trim(), role, entityId || null, hash, avatar, finalPerms, phone || null],
    )

    await audit('user', user.id, 'created', req.user, { role, entityId })
    res.status(201).json({ user })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل', code: 'EMAIL_CONFLICT' })
    }
    throw err
  }
})

// PATCH /api/users/:id — requires manage_users
router.patch('/:id', requirePermission('manage_users'), async (req, res) => {
  const { role: actorRole, id: actorId } = req.user
  const targetId = req.params.id
  const { role: newRole, entityId, status, name, password, permissions, phone } = req.body

  if (actorRole !== 'admin' && newRole && ['admin', 'executive'].includes(newRole)) {
    return res.status(403).json({ error: 'Forbidden', code: 'PRIVILEGE_ESCALATION' })
  }

  const setClauses = ['updated_at = NOW()']
  const params = []

  if (name)                     { params.push(name.trim());   setClauses.push(`full_name = $${params.length}`) }
  if (newRole)                  { params.push(newRole);       setClauses.push(`role = $${params.length}`) }
  if (entityId !== undefined)   { params.push(entityId || null); setClauses.push(`entity_id = $${params.length}::uuid`) }
  if (status)                   { params.push(status);        setClauses.push(`status = $${params.length}`) }
  if (phone !== undefined)      { params.push(phone || null); setClauses.push(`phone = $${params.length}`) }
  if (Array.isArray(permissions)) {
    params.push(permissions)
    setClauses.push(`permissions = $${params.length}`)
  }
  if (password) {
    const hash = await bcrypt.hash(password, 12)
    params.push(hash); setClauses.push(`password_hash = $${params.length}`)
  }

  if (params.length === 0) return res.status(400).json({ error: 'لا توجد حقول للتحديث', code: 'NO_FIELDS' })

  params.push(targetId)
  const { rows } = await query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING id, full_name AS name, email, role, entity_id, status, avatar, permissions, phone`,
    params,
  )

  if (!rows.length) return res.status(404).json({ error: 'User not found' })

  await audit('user', targetId, 'updated', req.user, req.body)
  res.json({ success: true, user: rows[0] })
})

// DELETE /api/users/:id — soft delete, requires manage_users
router.delete('/:id', requirePermission('manage_users'), async (req, res) => {
  const { id: actorId } = req.user
  const targetId = req.params.id

  if (targetId === actorId) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص', code: 'SELF_DELETE' })
  }

  const { rows } = await query(
    `UPDATE users SET status = 'inactive', updated_at = NOW()
     WHERE id = $1 AND status != 'inactive' RETURNING id`,
    [targetId],
  )

  if (!rows.length) return res.status(404).json({ error: 'User not found or already inactive' })

  await audit('user', targetId, 'deactivated', req.user, {})
  res.json({ success: true, deactivated: targetId })
})

// PATCH /api/users/:id/reactivate
router.patch('/:id/reactivate', requirePermission('manage_users'), async (req, res) => {
  const targetId = req.params.id

  const { rows } = await query(
    `UPDATE users SET status = 'active', updated_at = NOW()
     WHERE id = $1 AND status = 'inactive' RETURNING id`,
    [targetId],
  )

  if (!rows.length) return res.status(404).json({ error: 'User not found or already active' })

  await audit('user', targetId, 'reactivated', req.user, {})
  res.json({ success: true, reactivated: targetId })
})

export default router
