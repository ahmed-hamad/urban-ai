import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { signToken, authMiddleware } from '../middleware/auth.js'
import { query } from '../services/db.js'

const router = Router()

const ROLE_LABELS = {
  admin:     'مدير النظام',
  executive: 'مدير تنفيذي',
  manager:   'مدير إدارة',
  auditor:   'مدقق',
  monitor:   'مراقب ميداني',
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' })
  }

  try {
    const { rows } = await query(
      `SELECT u.*, e.name AS entity_name
       FROM users u
       LEFT JOIN entities e ON e.id = u.entity_id
       WHERE u.email = $1 AND u.status = 'active'`,
      [email.toLowerCase().trim()],
    )

    if (!rows.length) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة', code: 'INVALID_CREDENTIALS' })
    }

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة', code: 'INVALID_CREDENTIALS' })
    }

    const tokenPayload = {
      id:          user.id,
      email:       user.email,
      role:        user.role,
      entityId:    user.entity_id,
      entityName:  user.entity_name,
      permissions: user.permissions ?? [],
      name:        user.full_name,
    }

    const token = signToken(tokenPayload)

    return res.json({
      token,
      user: {
        id:          user.id,
        email:       user.email,
        name:        user.full_name,
        role:        user.role,
        roleLabel:   ROLE_LABELS[user.role] ?? user.role,
        entityId:    user.entity_id,
        entityName:  user.entity_name,
        permissions: user.permissions ?? [],
        avatar:      user.avatar ?? user.full_name?.[0] ?? 'م',
        token,
      },
    })
  } catch (err) {
    console.error('[auth/login]', err.message)
    return res.status(500).json({ error: 'خطأ في الخادم' })
  }
})

// POST /api/auth/logout
router.post('/logout', authMiddleware, (_req, res) => {
  // Token revocation handled client-side; add Redis blacklist here in production
  res.json({ success: true })
})

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const { iat, exp, ...profile } = req.user
  res.json({ user: profile, expiresAt: new Date(exp * 1000).toISOString() })
})

export default router
