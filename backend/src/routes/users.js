import { Router } from 'express'
import { requirePermission, requireRole } from '../middleware/auth.js'

const router = Router()

// GET /api/users — scoped by role
router.get('/', requirePermission('view_reports'), async (req, res) => {
  const { role: actorRole, entityId, entity } = req.user

  // Managers can only see users in their own entity
  // Admin/executive can see all
  let entityFilter = null
  if (actorRole === 'manager') {
    entityFilter = entityId || entity
  }

  // TODO: query DB
  // let sql = `SELECT id, name, email, role, entity, entity_id, status, join_date FROM users WHERE status != 'inactive'`
  // if (entityFilter) sql += ` AND entity_id = '${entityFilter}'`
  // sql += ` ORDER BY name`

  res.json({ users: [], entityFilter })
})

// GET /api/users/:id
router.get('/:id', requirePermission('view_reports'), async (req, res) => {
  const { role: actorRole, entityId, id: actorId } = req.user
  const targetId = req.params.id

  // Users can always view their own profile
  // Managers can view users in their entity
  // Admin can view anyone
  if (actorRole !== 'admin' && actorRole !== 'executive' && targetId !== actorId) {
    if (actorRole !== 'manager') {
      return res.status(403).json({ error: 'Forbidden', code: 'PROFILE_ACCESS_DENIED' })
    }
    // TODO: verify target user belongs to manager's entity
  }

  res.json({ user: null })
})

// POST /api/users — requires manage_users permission
router.post('/', requirePermission('manage_users'), async (req, res) => {
  const { name, email, role, entityId, password } = req.body
  const actorRole = req.user.role

  // Privilege escalation check: managers cannot create admins
  if (actorRole === 'manager' && ['admin', 'executive'].includes(role)) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'PRIVILEGE_ESCALATION',
      message: 'لا يمكن للمدير إنشاء مستخدمين بصلاحيات أعلى منه',
    })
  }

  // Entity assignment required for non-admin roles
  if (role !== 'admin' && !entityId) {
    return res.status(400).json({
      error: 'الجهة التنظيمية إلزامية لهذا الدور',
      code: 'ENTITY_REQUIRED',
    })
  }

  // TODO: hash password with bcrypt, persist to DB
  // const hash = await bcrypt.hash(password, 12)
  // const user = await db.users.create({ name, email, role, entityId, passwordHash: hash, createdBy: req.user.id })

  res.status(201).json({ user: { ...req.body, id: `USR-${Date.now()}`, createdBy: req.user.id } })
})

// PATCH /api/users/:id — requires manage_users
router.patch('/:id', requirePermission('manage_users'), async (req, res) => {
  const { role: actorRole, id: actorId } = req.user
  const targetId = req.params.id
  const { role: newRole } = req.body

  // Prevent privilege escalation
  if (actorRole !== 'admin' && newRole && ['admin', 'executive'].includes(newRole)) {
    return res.status(403).json({ error: 'Forbidden', code: 'PRIVILEGE_ESCALATION' })
  }

  // Cannot modify system admins unless you are admin
  // TODO: check isSystemAdmin in DB
  if (actorRole !== 'admin' && req.body.isSystemAdmin) {
    return res.status(403).json({ error: 'Forbidden', code: 'SYSTEM_ADMIN_PROTECTED' })
  }

  // TODO: update in DB, log audit
  res.json({ success: true, updatedBy: actorId })
})

// DELETE /api/users/:id — soft delete, requires manage_users
router.delete('/:id', requirePermission('manage_users'), async (req, res) => {
  const { id: actorId, role: actorRole } = req.user
  const targetId = req.params.id

  // Cannot delete yourself
  if (targetId === actorId) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص', code: 'SELF_DELETE' })
  }

  // TODO: fetch target, check isSystemAdmin, apply soft delete
  // const target = await db.users.findById(targetId)
  // if (target.isSystemAdmin) return res.status(403).json({ error: 'Forbidden', code: 'SYSTEM_ADMIN_PROTECTED' })
  // await db.users.update(targetId, { status: 'inactive', deletedAt: new Date(), deletedBy: actorId })
  // await db.auditLogs.create({ action: 'user_deactivated', actorId, targetId, timestamp: new Date() })

  res.json({ success: true, deactivated: targetId, by: actorId })
})

export default router
