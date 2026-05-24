import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { Bell, Sun, Moon, Plus, ChevronDown, X, CheckCheck } from 'lucide-react'

const breadcrumbs = {
  '/': 'لوحة التحكم', '/reports': 'سلة البلاغات', '/map': 'الخريطة الذكية',
  '/financial': 'التوقع المالي', '/users': 'المستخدمون',
  '/audit': 'سجل التدقيق', '/analyze': 'تحليل المرئيات', '/violations': 'اللائحة والغرامات',
}

const TYPE_ICON = {
  report_submitted:      '📋',
  report_assigned:       '👤',
  quality_review_needed: '🔍',
  report_rejected:       '❌',
  report_closed:         '✅',
  inspector_closed:      '🔒',
  report_under_review:   '👁️',
  duplicate_detected:    '🔗',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  const d = Math.floor(h / 24)
  return `منذ ${d} يوم`
}

function useNotifications() {
  const { user, authFetch } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const intervalRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!user?.token) return
    try {
      const res = await authFetch('/api/notifications')
      if (!res?.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnread(data.unread || 0)
    } catch {}
  }, [user?.token, authFetch])

  useEffect(() => {
    if (!user?.token) { setNotifications([]); setUnread(0); return }
    refresh()
    intervalRef.current = setInterval(refresh, 30000)
    return () => clearInterval(intervalRef.current)
  }, [user?.token, refresh])

  const markAllRead = useCallback(async () => {
    try {
      await authFetch('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {}
  }, [authFetch])

  const markOneRead = useCallback(async (id) => {
    try {
      await authFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    } catch {}
  }, [authFetch])

  return { notifications, unread, markAllRead, markOneRead, refresh }
}

export default function Header({ sidebarWidth }) {
  const { isDark, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showNotif, setShowNotif] = useState(false)
  const [showUser, setShowUser] = useState(false)
  const { notifications, unread, markAllRead, markOneRead } = useNotifications()

  const page = breadcrumbs[location.pathname] || 'الصفحة'
  const close = () => { setShowNotif(false); setShowUser(false) }

  const handleNotifClick = async (n) => {
    if (!n.is_read) await markOneRead(n.id)
    if (n.link) {
      close()
      navigate(n.link)
    }
  }

  return (
    <header
      className="fixed top-0 left-0 h-16 z-30 flex items-center px-5 gap-4 transition-all duration-300 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-slate-200 dark:border-gray-800"
      style={{ right: sidebarWidth }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400 dark:text-gray-600">أمانة الباحة</span>
        <span className="text-slate-300 dark:text-gray-700">/</span>
        <span className="text-slate-700 dark:text-white font-medium">{page}</span>
      </div>

      <div className="flex-1" />

      {/* Date */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-gray-500 bg-slate-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-700">
        {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>

      {/* New Report */}
      <Link
        to="/reports?new=true"
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3.5 py-2 rounded-lg font-medium transition-colors"
      >
        <Plus size={15} />
        <span className="hidden sm:inline">بلاغ جديد</span>
      </Link>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white transition-all"
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* ── Notifications ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => { setShowNotif(p => !p); setShowUser(false) }}
          className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white transition-all relative"
        >
          <Bell size={15} />
          {unread > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {showNotif && (
          <div className="absolute left-0 top-12 w-80 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-800 dark:text-white text-sm">الإشعارات</h3>
                {unread > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                    {unread} جديد
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    title="تحديد الكل كمقروء"
                    className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <CheckCheck size={13} />
                    <span className="hidden sm:inline">قراءة الكل</span>
                  </button>
                )}
                <button onClick={close}><X size={14} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300" /></button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell size={24} className="mx-auto mb-2 text-slate-300 dark:text-gray-700" />
                  <p className="text-xs text-slate-400 dark:text-gray-600">لا توجد إشعارات</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`w-full text-right px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/60 flex gap-3 transition-colors ${!n.is_read ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                      <span className="text-sm leading-none">{TYPE_ICON[n.type] || '🔔'}</span>
                      {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className={`text-xs font-medium leading-snug truncate ${!n.is_read ? 'text-slate-800 dark:text-gray-100' : 'text-slate-500 dark:text-gray-400'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-[10px] text-slate-300 dark:text-gray-700 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-gray-800 text-center">
                <p className="text-[10px] text-slate-300 dark:text-gray-700">يتحدث كل 30 ثانية</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── User Menu ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => { setShowUser(p => !p); setShowNotif(false) }}
          className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 transition-all"
        >
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.avatar || 'م'}
          </div>
          <span className="text-sm text-slate-600 dark:text-gray-300 hidden sm:block font-medium">
            {user?.name?.split(' ')[0]}
          </span>
          <ChevronDown size={13} className="text-slate-400" />
        </button>

        {showUser && (
          <div className="absolute left-0 top-12 w-56 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800">
              <p className="font-semibold text-slate-800 dark:text-white text-sm">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">{user?.email}</p>
              <span className="mt-2 inline-flex text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-full">
                {user?.roleLabel}
              </span>
            </div>
            <div className="p-1.5">
              <button
                onClick={logout}
                className="w-full text-right px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
