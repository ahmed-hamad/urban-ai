import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'urban-ai-dev-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Verify JWT and attach decoded user to req.user
export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    return res.status(401).json({ error: 'Unauthorized', code })
  }
}

// Middleware factory: require one of the given roles
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'INSUFFICIENT_ROLE',
        required: roles,
        actual: req.user.role,
      })
    }
    next()
  }
}

// Middleware factory: require a specific permission string
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const perms = req.user.permissions || []
    if (!perms.includes(permission) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'MISSING_PERMISSION',
        required: permission,
      })
    }
    next()
  }
}

// Build a scope descriptor based on the authenticated user's role.
// Intended for use in DB query layer to enforce row-level security.
export function buildReportScope(user) {
  if (!user) return null
  switch (user.role) {
    case 'admin':
    case 'executive':
    case 'auditor':
      return { type: 'unrestricted' }
    case 'manager':
      return { type: 'entity', entityId: user.entityId, entity: user.entity }
    default: // monitor / inspector
      return { type: 'user', userId: user.id }
  }
}
