import { createContext, useContext, useState } from 'react'

const AuthContext = createContext()

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

const ROLE_LABELS = {
  admin:     'مدير النظام',
  executive: 'مدير تنفيذي',
  manager:   'مدير إدارة',
  auditor:   'مدقق',
  monitor:   'مراقب ميداني',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('urban-user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  const login = (userData) => {
    setUser(userData)
    localStorage.setItem('urban-user', JSON.stringify(userData))
  }

  /**
   * Primary login: calls the backend API, gets a real JWT.
   * Falls back to localStorage-only auth if the backend is unreachable.
   */
  const loginWithPassword = async (email, password) => {
    // ── Try backend API first ──────────────────────────────────────────────
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      if (res.ok) {
        const { user: apiUser } = await res.json()
        login(apiUser)
        return true
      }
      // 401 = wrong credentials (don't fall through to localStorage)
      if (res.status === 401) return false
      // Other errors (500, network etc.) → fall through to localStorage
    } catch {
      // Backend unreachable — fall through to localStorage
    }

    // ── Fallback: localStorage auth (no JWT — ingestion APIs won't work) ──
    try {
      const stored = JSON.parse(localStorage.getItem('ua_users') || '[]')
      const found = stored.find(
        u => u.email?.toLowerCase() === email?.toLowerCase().trim()
          && u.password === password
          && u.status !== 'inactive'
      )
      if (found) {
        const { password: _pw, ...safeUser } = found
        login({
          ...safeUser,
          roleLabel: ROLE_LABELS[safeUser.role] ?? safeUser.role,
          token: null,   // no JWT available in fallback mode
        })
        return true
      }
    } catch { /* ignore */ }

    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('urban-user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loginWithPassword, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
