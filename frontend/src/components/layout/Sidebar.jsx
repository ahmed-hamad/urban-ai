import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, MapPin, TrendingUp,
  Users, Shield, ChevronRight, ChevronLeft, FileText, ScanSearch, LogOut, Circle, Network,
  Inbox, Layers,
} from 'lucide-react'
import { useData } from '@/context/DataContext'
import { useReportScope } from '@/hooks/useReportScope'
import { OPEN_STATUSES } from '@/data/caseConfig'

// allowedRoles: null = all authenticated roles; array = restricted
const NAV_ITEMS = [
  { path: '/',           label: 'لوحة التحكم',      Icon: LayoutDashboard, desc: 'النظرة العامة + المساعد الذكي', allowedRoles: null },
  { path: '/reports',    label: 'سلة البلاغات',     Icon: ClipboardList,   desc: 'إدارة البلاغات',               badgeKey: 'openReports', allowedRoles: null },
  { path: '/map',        label: 'الخريطة الذكية',   Icon: MapPin,          desc: 'GIS · خرائط حرارية',           allowedRoles: null },
  { path: '/analyze',    label: 'تحليل المرئيات',   Icon: ScanSearch,      desc: 'رصد بالذكاء الاصطناعي',       allowedRoles: null },
  { path: '/violations', label: 'اللائحة والغرامات', Icon: FileText,        desc: 'لائحة التشوه البصري',          allowedRoles: null },
  { path: '/financial',  label: 'التوقع المالي',    Icon: TrendingUp,      desc: 'تحليل الغرامات',               allowedRoles: ['admin', 'executive', 'auditor', 'manager'] },
  { path: '/entities',   label: 'الهيكل التنظيمي',  Icon: Network,         desc: 'إدارة الجهات والوحدات',        allowedRoles: ['admin', 'executive', 'auditor', 'manager'] },
  { path: '/users',      label: 'المستخدمون',       Icon: Users,           desc: 'إدارة الفريق',                 allowedRoles: ['admin', 'executive', 'manager'] },
  { path: '/audit',      label: 'سجل التدقيق',      Icon: Shield,          desc: 'تتبع الأنشطة',                 allowedRoles: ['admin', 'executive', 'auditor', 'manager', 'monitor'] },
  { path: '/ingestion',  label: 'قائمة الاستيعاب',  Icon: Inbox,           desc: 'مراجعة مرشحات الكشف',          allowedRoles: ['admin', 'executive', 'manager', 'monitor'] },
  { path: '/gis-import', label: 'استيراد GIS',       Icon: Layers,          desc: 'Shapefile · GeoJSON → بلاغات', allowedRoles: ['admin', 'executive', 'manager'] },
]

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { stats } = useData()
  const { scopedReports } = useReportScope()

  // Badge for reports: open count within current user's authorized scope
  const scopedOpenCount = useMemo(
    () => scopedReports.filter(r => OPEN_STATUSES.has(r.status)).length,
    [scopedReports]
  )

  return (
    <aside className={cn(
      'fixed right-0 top-0 h-screen z-40 flex flex-col transition-all duration-300',
      'bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-800',
      collapsed ? 'w-[70px]' : 'w-[260px]'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-4 border-b border-slate-200 dark:border-gray-800',
        collapsed && 'justify-center px-2'
      )}>
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow">
          عب
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-800 dark:text-white text-sm">أمانة الباحة</p>
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">منصة الرصد الذكي</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="text-slate-400 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800"
        >
          {collapsed
            ? <ChevronLeft size={14} />
            : <ChevronRight size={14} />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.filter(item => !item.allowedRoles || item.allowedRoles.includes(user?.role)).map(({ path, label, Icon, desc, badgeKey }) => {
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
          const badge = badgeKey === 'openReports'
            ? (scopedOpenCount > 0 ? scopedOpenCount : null)
            : (badgeKey && stats[badgeKey] > 0 ? stats[badgeKey] : null)
          return (
            <Link
              key={path}
              to={path}
              title={collapsed ? label : ''}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-gray-800/60',
                collapsed && 'justify-center px-2'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
              )}
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-600 leading-tight mt-0.5">{desc}</p>
                  </div>
                  {badge && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                      {badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Status + User */}
      <div className="border-t border-slate-200 dark:border-gray-800 p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Circle size={7} className="text-emerald-500 fill-emerald-500 flex-shrink-0" />
            <span className="text-xs text-slate-400 dark:text-gray-500">المحرك الذكي نشط</span>
          </div>
        )}
        <div className={cn(
          'flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer transition-colors',
          collapsed && 'justify-center'
        )}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.avatar || 'م'}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-slate-400 dark:text-gray-500 truncate">{user?.roleLabel}</p>
              </div>
              <button onClick={logout} className="text-slate-400 dark:text-gray-600 hover:text-red-500 transition-colors">
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
