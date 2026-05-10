import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { Bell, Sun, Moon, Plus, Search, ChevronDown, X } from 'lucide-react'

const breadcrumbs = {
  '/': 'لوحة التحكم', '/reports': 'سلة البلاغات', '/map': 'الخريطة الذكية',
  '/financial': 'التوقع المالي', '/users': 'المستخدمون',
  '/audit': 'سجل التدقيق', '/analyze': 'تحليل المرئيات', '/violations': 'اللائحة والغرامات',
}

const notifications = [
  { id: 1, text: 'بلاغ جديد RPT-2024-009 — حواجز خراسانية', time: 'منذ 5 دقائق', read: false },
  { id: 2, text: 'تم اعتماد البلاغ RPT-2024-001', time: 'منذ 20 دقيقة', read: false },
  { id: 3, text: 'تذكير: البلاغ RPT-2024-002 لم يُسند بعد', time: 'منذ ساعة', read: true },
  { id: 4, text: 'تم إغلاق البلاغ RPT-2024-008 بنجاح', time: 'منذ ساعتين', read: true },
]

export default function Header({ sidebarWidth }) {
  const { isDark, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const location = useLocation()
  const [showNotif, setShowNotif] = useState(false)
  const [showUser, setShowUser] = useState(false)

  const unread = notifications.filter(n => !n.read).length
  const page = breadcrumbs[location.pathname] || 'الصفحة'

  const close = () => { setShowNotif(false); setShowUser(false) }

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

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => { setShowNotif(!showNotif); setShowUser(false) }}
          className="w-9 h-9 rounded-lg bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white transition-all relative"
        >
          <Bell size={15} />
          {unread > 0 && (
            <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
              {unread}
            </span>
          )}
        </button>

        {showNotif && (
          <div className="absolute left-0 top-12 w-80 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-white text-sm">الإشعارات</h3>
              <button onClick={close}><X size={14} className="text-slate-400" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 cursor-pointer flex gap-3 ${!n.read ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${!n.read ? 'bg-blue-500' : 'bg-slate-200 dark:bg-gray-700'}`} />
                  <div>
                    <p className={`text-xs leading-relaxed ${!n.read ? 'text-slate-700 dark:text-gray-200' : 'text-slate-500 dark:text-gray-500'}`}>{n.text}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User */}
      <div className="relative">
        <button
          onClick={() => { setShowUser(!showUser); setShowNotif(false) }}
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
          <div className="absolute left-0 top-12 w-56 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
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
                className="w-full text-right px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
              >
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
