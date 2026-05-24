import { createContext, useContext, useState, useCallback } from 'react'

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

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('urban-user')
  }, [])

  const loginWithPassword = async (email, password) => {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })

      if (res.ok) {
        const { user: apiUser } = await res.json()
        login({
          ...apiUser,
          roleLabel: ROLE_LABELS[apiUser.role] ?? apiUser.role,
        })
        return { success: true }
      }

      if (res.status === 401) {
        return { success: false, error: 'بيانات الدخول غير صحيحة' }
      }

      return { success: false, error: 'خطأ في الخادم، حاول مجدداً' }
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم' }
    }
  }

  // Authenticated fetch helper — automatically attaches Bearer token.
  // Returns null and logs out on 401.
  const authFetch = useCallback(async (endpoint, options = {}) => {
    const token = user?.token
    const res = await fetch(`${API}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
    if (res.status === 401) {
      logout()
      return null
    }
    return res
  }, [user?.token, logout])

  return (
    <AuthContext.Provider value={{ user, login, logout, loginWithPassword, authFetch, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
