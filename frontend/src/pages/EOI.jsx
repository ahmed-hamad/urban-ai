// EOI Page — ذكاء الرصد الخارجي (External Observation Intelligence)
// All VPI values displayed here are ESTIMATED/FORECAST — clearly labeled throughout.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Eye, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw,
  TrendingUp, TrendingDown, Upload, ChevronDown, Activity,
  Layers, Building2, BarChart2, FileText, Target, Settings,
  Lightbulb, ShieldAlert, ArrowUpRight, ArrowDownRight, Info,
  Star, MapPin, Repeat2, Shield, Trash2, Bot, Map,
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import { useAuth } from '@/context/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'
const C   = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#84CC16','#F97316','#EC4899','#6366F1']
const BLUE_GRADIENT = ['#1e3a8a','#1e40af','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#dbeafe','#eff6ff']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v, dec = 1) {
  if (v == null || v === '') return '—'
  const f = parseFloat(v)
  if (isNaN(f)) return '—'
  return f.toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
}
function pct(v) { return v == null ? '—' : `${parseFloat(v).toFixed(1)}%` }

function Spinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
}
function Empty({ msg }) {
  return <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-gray-600"><Eye size={36} className="mb-3 opacity-30" /><p className="text-sm text-center max-w-xs">{msg}</p></div>
}
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm text-white shadow-2xl">
      <p className="text-gray-400 mb-1.5 text-xs">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color || p.fill || '#60A5FA' }} className="font-medium">{p.name}: {n(p.value)}</p>)}
    </div>
  )
}

function MonthSelect({ months, value, onChange, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <ChevronDown size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

// KPI card used in operational dashboard
function KPICard({ label, value, unit, rate, rateLabel, color = 'blue', icon: Icon, estimated }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    teal:   'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300',
    amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    red:    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
    slate:  'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium opacity-70">{label}</p>
        {Icon && <Icon size={14} className="opacity-50" />}
      </div>
      <p className="text-2xl font-bold">{n(value, 0)}</p>
      {unit  && <p className="text-xs opacity-60 mt-0.5">{unit}</p>}
      {rate  != null && <p className="text-xs mt-1.5 font-medium">{rateLabel || 'نسبة'}: {pct(rate)}</p>}
      {estimated && <p className="text-xs mt-1 opacity-50 italic">تقديري</p>}
    </div>
  )
}

function InsightCard({ type, title, body }) {
  const cfg = {
    success:     { bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', Icon: CheckCircle2, ic: 'text-emerald-500' },
    warning:     { bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',         Icon: AlertTriangle, ic: 'text-amber-500' },
    alert:       { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',                 Icon: ShieldAlert,   ic: 'text-red-500' },
    info:        { bg: 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700',              Icon: Lightbulb,     ic: 'text-slate-400' },
    improvement: { bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',             Icon: TrendingDown,  ic: 'text-blue-500' },
  }
  const s = cfg[type] || cfg.info
  return (
    <div className={`rounded-xl border ${s.bg} p-4 flex gap-3`}>
      <s.Icon size={16} className={`flex-shrink-0 mt-0.5 ${s.ic}`} />
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white mb-0.5">{title}</p>
        <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

// ─── TABS definition ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'operations', label: 'لوحة التشغيل',         Icon: BarChart2,  roles: null },
  { id: 'visit',      label: 'الزيارات',              Icon: Eye,        roles: null },
  { id: 'inprogress', label: 'قيد التنفيذ',          Icon: Clock,      roles: null },
  { id: 'repeated',   label: 'المتكررة',              Icon: Repeat2,    roles: null },
  { id: 'quality',    label: 'جودة الإغلاق',         Icon: Shield,     roles: ['admin','executive','auditor'] },
  { id: 'warning',    label: 'مركز الإنذار',         Icon: ShieldAlert, roles: ['admin','executive','auditor'] },
  { id: 'summary',    label: 'الملخص التنفيذي',      Icon: Star,       roles: ['admin','executive','auditor'] },
  { id: 'vpi',        label: 'التحليل التقديري',      Icon: Target,     roles: ['admin','executive','auditor'] },
  { id: 'map',        label: 'خريطة الرصد',          Icon: Map,        roles: ['admin','executive','auditor','manager'] },
  { id: 'rules',      label: 'قواعد التحويل',        Icon: Settings,   roles: ['admin','executive'] },
  { id: 'upload',     label: 'رفع البيانات',         Icon: Upload,     roles: ['admin','executive','manager'] },
]

// ─── Operations Tab ───────────────────────────────────────────────────────────

function OperationsTab({ month, months, onMonthChange, authFetch, user }) {
  const [data, setData]       = useState(null)
  const [breakdown, setBD]    = useState([])
  const [trend, setTrend]     = useState([])
  const [loading, setLoad]    = useState(false)
  const [groupBy, setGroupBy] = useState('municipality')

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const muni = user?.role === 'manager' ? '' : ''
      const [s, b, t] = await Promise.all([
        authFetch(`/api/eoi/analytics/summary?month=${month}`).then(r => r?.json()),
        authFetch(`/api/eoi/analytics/breakdown?month=${month}&group_by=${groupBy}`).then(r => r?.json()),
        authFetch(`/api/eoi/analytics/trend?month=${month}&group_by=day`).then(r => r?.json()),
      ])
      setData(s?.data)
      setBD(b?.data || [])
      setTrend(t?.data || [])
    } finally { setLoad(false) }
  }, [month, groupBy, authFetch, user])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات لهذا الشهر. ارفع ملف الرصد الخارجي أولاً." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">لوحة التشغيل — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard label="إجمالي البلاغات"  value={data.total_reports}        color="blue"   icon={FileText} />
        <KPICard label="مغلقة يدوياً"      value={data.closed_reports}       color="green"  icon={CheckCircle2} rate={data.manual_closure_rate}    rateLabel="نسبة الإغلاق اليدوي" />
        <KPICard label="مغلق آلياً"        value={data.auto_closed_reports}  color="teal"   icon={Bot}          rate={data.auto_closure_rate}       rateLabel="نسبة الإغلاق الآلي" />
        <KPICard label="قيد التنفيذ"       value={data.in_progress_reports}  color="amber"  icon={Clock}        rate={data.in_progress_rate}        rateLabel="نسبة التنفيذ" />
        <KPICard label="مفتوحة"            value={data.open_reports}         color="slate"  icon={Activity} />
        <KPICard label="تمت الزيارة"       value={data.visited_reports}      color="purple" icon={Eye}          rate={data.visit_compliance_rate}   rateLabel="نسبة الزيارة" />
        <KPICard label="متكررة"            value={data.repeated_reports}     color="red"    icon={Repeat2} />
        <KPICard label="مخالفات تقديرية"   value={data.estimated_units}      color="slate"  icon={Layers} estimated />
      </div>

      {/* Trend chart */}
      {trend.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">مسار البلاغات اليومي</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="total" name="البلاغات" fill="#3B82F6" radius={[2,2,0,0]} />
              <Bar dataKey="closed" name="مغلقة" fill="#10B981" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400">توزيع البلاغات</h3>
          <div className="flex gap-2">
            {[['municipality','البلديات'],['element','العناصر'],['zone','المناطق']].map(([v, l]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                className={`text-xs px-3 py-1 rounded-lg transition-all ${groupBy === v ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-600'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {breakdown.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={breakdown.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis type="category" dataKey="group_name" width={90} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="total" name="البلاغات" radius={[0,3,3,0]}>
                  {breakdown.slice(0,8).map((_,i) => <Cell key={i} fill={C[i%C.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
                  <tr>{['الجهة','الإجمالي','مغلق يدوي','مغلق آلياً','قيد التنفيذ','زيارات'].map(h => <th key={h} className="px-3 py-2 text-right font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {breakdown.slice(0,10).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                      <td className="px-3 py-2 font-medium truncate max-w-[100px]">{row.group_name || '—'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{n(row.total, 0)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-600">{n(row.closed, 0)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-teal-600">{n(row.auto_closed, 0)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-amber-600">{n(row.in_progress, 0)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-blue-600">{n(row.visited, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : <Empty msg="لا توجد بيانات." />}
      </div>
    </div>
  )
}

// ─── Visit Status Tab ─────────────────────────────────────────────────────────

function VisitTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]   = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/analytics/visit-status?month=${month}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات لهذا الشهر." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل الزيارات — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {/* Alerts */}
      {(data.alerts?.closed_no_visit > 0 || data.alerts?.inprogress_no_visit > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.alerts.closed_no_visit > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div><p className="text-sm font-semibold text-red-700 dark:text-red-300">بلاغات مغلقة دون زيارة</p><p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{n(data.alerts.closed_no_visit, 0)} بلاغ مغلق لم تُسجَّل له زيارة</p></div>
            </div>
          )}
          {data.alerts.inprogress_no_visit > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div><p className="text-sm font-semibold text-amber-700 dark:text-amber-300">قيد التنفيذ دون زيارة</p><p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{n(data.alerts.inprogress_no_visit, 0)} بلاغ قيد التنفيذ لم تُسجَّل له زيارة</p></div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Visit distribution */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">توزيع حالات الزيارة</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.byVisit} dataKey="total" nameKey="visit_status" cx="50%" cy="50%" outerRadius={80}
                label={({ name, percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                {data.byVisit.map((_,i) => <Cell key={i} fill={C[i%C.length]} />)}
              </Pie>
              <Tooltip formatter={v => [n(v,0), 'بلاغ']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cross table: visit × closure */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">تقاطع الزيارة × الإغلاق</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
                <tr><th className="px-3 py-2 text-right">حالة الزيارة</th><th className="px-3 py-2 text-right">حالة الإغلاق</th><th className="px-3 py-2 text-center">العدد</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {data.cross.slice(0, 15).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                    <td className="px-3 py-2">{row.visit_status}</td>
                    <td className="px-3 py-2">{row.closure_status}</td>
                    <td className="px-3 py-2 text-center font-semibold tabular-nums">{n(row.count, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── In Progress Tab ──────────────────────────────────────────────────────────

function InProgressTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]   = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/analytics/in-progress?month=${month}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات." />

  const AGE_COLORS = { '0-7 أيام': '#10B981', '8-30 يوم': '#F59E0B', '31-60 يوم': '#EF4444', '61-90 يوم': '#8B5CF6', '90+ يوم': '#374151' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل قيد التنفيذ — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {data.stalledCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3">
          <ShieldAlert size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {n(data.stalledCount, 0)} بلاغ متعثر (قيد التنفيذ أكثر من {data.stalledThreshold} يوماً)
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Age buckets */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">توزيع الأعمار</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
              <XAxis dataKey="age_bucket" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="count" name="البلاغات" radius={[3,3,0,0]}>
                {data.buckets.map((b, i) => <Cell key={i} fill={AGE_COLORS[b.age_bucket] || '#3B82F6'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top delayed municipalities */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">أعلى بلديات تأخيراً</h3>
          <div className="space-y-2">
            {data.topMunis.slice(0, 8).map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: C[i%C.length] }}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate">{row.municipality_name}</span>
                    <span className="text-xs text-slate-400 ml-2 flex-shrink-0">{n(row.total,0)} · متوسط {row.avg_age_days} يوم</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-gray-700 rounded-full h-1 mt-1">
                    <div className="h-1 rounded-full" style={{ width: `${Math.min(row.avg_age_days / 90 * 100, 100)}%`, background: C[i%C.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top delayed elements */}
      {data.topElems.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-3">أعلى عناصر تأخيراً</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
                <tr>{['العنصر','الإجمالي','متوسط الأيام'].map(h => <th key={h} className="px-4 py-2 text-right font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {data.topElems.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2 font-medium">{row.element_name}</td>
                    <td className="px-4 py-2 tabular-nums">{n(row.total,0)}</td>
                    <td className="px-4 py-2 tabular-nums">{row.avg_age_days} يوم</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Repeated Tab ─────────────────────────────────────────────────────────────

function RepeatedTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]    = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/analytics/repeated?month=${month}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات متكررة." />

  const Section = ({ title, rows, nameKey }) => (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800 text-sm font-semibold text-slate-700 dark:text-gray-200">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
          <tr><th className="px-4 py-2 text-right font-medium">{nameKey === 'element_name' ? 'العنصر' : nameKey === 'priority_zone_name' ? 'المنطقة' : 'البلدية'}</th><th className="px-4 py-2 text-center font-medium">البلاغات</th><th className="px-4 py-2 text-center font-medium">إجمالي التكرار</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
              <td className="px-4 py-2 font-medium">{row[nameKey]}</td>
              <td className="px-4 py-2 text-center tabular-nums">{n(row.reports,0)}</td>
              <td className="px-4 py-2 text-center tabular-nums font-semibold text-red-600 dark:text-red-400">{n(row.total_repetitions,0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">البلاغات المتكررة — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Section title="أكثر العناصر تكراراً" rows={data.elements} nameKey="element_name" />
        <Section title="أكثر البلديات تكراراً" rows={data.municipalities} nameKey="municipality_name" />
        <Section title="أكثر المناطق تكراراً" rows={data.zones} nameKey="priority_zone_name" />
      </div>
    </div>
  )
}

// ─── Closure Quality Tab ──────────────────────────────────────────────────────

function QualityTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]    = useState([])
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/analytics/closure-quality?month=${month}`)
      if (res?.ok) setData((await res.json()).data || [])
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data.length) return <Empty msg="لا توجد بيانات إغلاق." />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">جودة الإغلاق — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300 flex gap-2">
        <Info size={15} className="flex-shrink-0 mt-0.5" />
        جودة الإغلاق = البلاغات المغلقة التي لم تُرصد مجدداً ÷ إجمالي البلاغات المغلقة × 100
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
            <tr>{['البلدية','مغلقة','مغلقة دون تكرار','جودة الإغلاق'].map(h => <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3 font-medium">{row.municipality_name}</td>
                <td className="px-4 py-3 tabular-nums text-center">{n(row.total_closed,0)}</td>
                <td className="px-4 py-3 tabular-nums text-center">{n(row.closed_no_reobs,0)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(parseFloat(row.closure_quality_pct)||0,100)}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{pct(row.closure_quality_pct)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Early Warning Tab ────────────────────────────────────────────────────────

function WarningTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]    = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/early-warning?month=${month}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات كافية." />

  const lv   = data.liveVPI
  const tgt  = data.target
  const conf = { low: { label: 'منخفض', color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
                 medium: { label: 'متوسط', color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
                 high:   { label: 'مرتفع', color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' } }
  const confCfg = conf[lv?.confidence_score] || conf.low

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">مركز الإنذار المبكر — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {/* Estimated label banner */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <AlertTriangle size={13} className="flex-shrink-0" />
        جميع قيم VPI في هذه اللوحة <strong>تقديرية</strong> مستمدة من الرصد الخارجي — لا تُعبّر عن مؤشرات VPI الرسمية
      </div>

      {/* Warning cards */}
      {data.warnings?.length > 0 && (
        <div className="space-y-2">
          {data.warnings.map((w, i) => (
            <div key={i} className={`rounded-xl border p-3 flex gap-2 text-sm ${
              w.level === 'danger'  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 dark:text-red-300' :
              w.level === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 text-amber-700 dark:text-amber-300' :
                                      'bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700 dark:text-blue-300'
            }`}>
              {w.level === 'danger' ? <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />}
              {w.msg}
            </div>
          ))}
        </div>
      )}

      {/* VPI Comparison Cards */}
      {lv && (() => {
        const officialSame = data.officialSameMonthVPI
        const delta = (officialSame && lv.estimated_vpi != null)
          ? (parseFloat(lv.estimated_vpi) - parseFloat(officialSame.vpi))
          : null
        const deltaColor = delta == null ? 'slate' : delta > 0 ? 'red' : 'green'
        const deltaValue = delta != null ? delta : null
        const deltaSub   = delta != null ? `تقديري − رسمي (${officialSame.month})` : null

        return (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'آخر VPI رسمي متاح',     value: data.officialLastVPI?.vpi, sub: data.officialLastVPI?.month, color: 'blue',       badge: 'رسمي' },
            { label: 'VPI التقديري الحالي',   value: lv.estimated_vpi,         sub: 'مخالفة/كم²',               color: 'amber',      badge: 'تقديري' },
            { label: 'الفارق عن الرسمي',      value: deltaValue,                sub: deltaSub,                   color: deltaColor,   badge: 'مقارنة', noMeasure: !officialSame },
            { label: 'المستهدف السنوي',       value: tgt?.vpi_target,          sub: `مستهدف ${tgt?.year || ''}`, color: 'slate',     badge: 'مستهدف' },
          ].map(({ label, value, sub, color, badge, noMeasure }) => {
            const palette = {
              blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
              amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
              green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
              red:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
              slate: 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200',
            }
            return (
              <div key={label} className={`rounded-xl border p-4 ${palette[color]}`}>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs font-medium opacity-70">{label}</p>
                  <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded font-medium">{badge}</span>
                </div>
                {noMeasure ? (
                  <p className="text-sm font-semibold opacity-60 mt-1">لم يحن موعد القياس</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold">
                      {value != null
                        ? (delta != null && value > 0 ? '+' : '') + n(value)
                        : '—'}
                    </p>
                    {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Calculation methodology note */}
        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2">
          <Info size={12} className="flex-shrink-0 mt-0.5 text-slate-400" />
          <span>
            <strong className="text-slate-600 dark:text-gray-300">آلية الاحتساب:</strong>{' '}
            يُحسب المؤشر التقديري بقسمة <strong>تقدير عدد الوحدات</strong> للبلاغات الموثقة في تقرير مختصر بوابة البلاغات
            على <strong>إجمالي المساحة المغطاة</strong> خلال الشهر (كم²).
          </span>
        </div>

        {/* ── Adjusted VPI section ── */}
        {lv.adj_estimated_vpi != null && (() => {
          const fullVPI     = parseFloat(lv.estimated_vpi)        || 0
          const adjVPI      = parseFloat(lv.adj_estimated_vpi)
          const fullUnits   = parseFloat(lv.total_estimated_units) || 0
          const adjUnits    = parseFloat(lv.adj_total_units)       || 0
          const fullReports = lv.total_reports                     || 0
          const adjReports  = lv.adj_total_reports                 || 0
          const excluded    = fullReports - adjReports
          const exclUnits   = fullUnits   - adjUnits
          const reduction   = fullVPI > 0 ? ((fullVPI - adjVPI) / fullVPI * 100) : 0
          const adjBarW     = fullVPI > 0 ? Math.min((adjVPI / fullVPI) * 100, 100) : 0

          return (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center gap-2">
                <Shield size={14} className="text-teal-500 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    VPI التقديري المعدّل — بعد استبعاد البلاغات الخاطئة
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                    تم استبعاد البلاغات التي حالة زيارتها «منتهية بلاغ خاطئ»
                  </p>
                </div>
                <span className="mr-auto text-xs px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700 rounded-full font-medium">
                  تقديري — معدّل
                </span>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl border bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 p-4 text-teal-700 dark:text-teal-300">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-medium opacity-70">VPI التقديري المعدّل</p>
                      <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded font-medium">معدّل</span>
                    </div>
                    <p className="text-2xl font-bold">{n(adjVPI)}</p>
                    <p className="text-xs opacity-60 mt-0.5">مخالفة/كم²</p>
                    {reduction > 0 && (
                      <p className="text-xs mt-2 font-semibold text-emerald-600 dark:text-emerald-400">
                        ↓ {n(reduction, 1)}% أقل من الكلي
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 p-4 text-slate-700 dark:text-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-medium opacity-70">البلاغات المستبعدة</p>
                      <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded font-medium">استبعاد</span>
                    </div>
                    <p className="text-2xl font-bold">{n(excluded, 0)}</p>
                    <p className="text-xs opacity-60 mt-0.5">
                      من أصل {n(fullReports, 0)} بلاغ ({pct(fullReports > 0 ? excluded / fullReports * 100 : 0)})
                    </p>
                  </div>

                  <div className="rounded-xl border bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 p-4 text-slate-700 dark:text-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-medium opacity-70">الوحدات المستبعدة</p>
                      <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded font-medium">استبعاد</span>
                    </div>
                    <p className="text-2xl font-bold">{n(exclUnits)}</p>
                    <p className="text-xs opacity-60 mt-0.5">
                      من أصل {n(fullUnits)} وحدة ({pct(fullUnits > 0 ? exclUnits / fullUnits * 100 : 0)})
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                    <span>المقارنة البصرية بين VPI الكلي والمعدّل</span>
                    <span className="tabular-nums">{n(adjVPI)} / {n(fullVPI)} وحدة/كم²</span>
                  </div>
                  <div className="relative h-6 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="absolute inset-0 flex items-center">
                      <div className="h-full w-full bg-amber-200/60 dark:bg-amber-700/30 rounded-full" />
                    </div>
                    <div className="absolute inset-y-0 right-0 flex items-center transition-all duration-500"
                         style={{ width: `${adjBarW}%` }}>
                      <div className="h-full w-full bg-teal-500 dark:bg-teal-400 rounded-full" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                      <span className="text-xs font-bold text-white drop-shadow">معدّل {n(adjVPI)}</span>
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">كلي {n(fullVPI)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-gray-500 text-center">
                    الشريط التيلي = VPI بعد الاستبعاد · الشريط الكامل = VPI الكلي
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
        </>
        )
      })()}

      {/* Coverage & Confidence */}
      {lv && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">معلومات التغطية والثقة</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'أيام البيانات',      value: `${lv.data_days} / ${lv.days_in_month} يوم` },
              { label: 'نسبة تغطية البيانات', value: pct(lv.data_days / lv.days_in_month * 100) },
              { label: 'المساحة المغطاة',    value: lv.covered_area_km2 ? `${n(lv.covered_area_km2)} كم²` : 'غير متاح' },
              { label: 'مستوى الثقة',       value: (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${confCfg.bg} ${confCfg.color}`}>
                  {confCfg.label}
                </span>
              )},
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-slate-50 dark:bg-gray-800 p-3">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <div className="font-semibold text-slate-700 dark:text-gray-200">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Executive Summary Tab ────────────────────────────────────────────────────

function SummaryTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]    = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/eoi/executive-summary?month=${month}`)
      if (res?.ok) setData(await res.json())
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data?.summary) return <Empty msg="لا توجد بيانات كافية للملخص." />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">الملخص التنفيذي — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} className="text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-blue-800 dark:text-blue-300">ملخص تنفيذي — ذكاء الرصد الخارجي</h3>
          <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-full">قيم تقديرية</span>
        </div>
        <p className="text-sm leading-8 text-slate-700 dark:text-gray-200">{data.summary}</p>
      </div>
      {data.insights?.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Lightbulb size={15} className="text-amber-500" /> رؤى وتنبيهات تشغيلية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── VPI Analysis Tab ─────────────────────────────────────────────────────────

function VPIAnalysisTab({ month, months, onMonthChange, authFetch }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [view,    setView]    = useState('municipality') // 'municipality' | 'element'

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    try {
      const res  = await authFetch(`/api/eoi/analytics/vpi-analysis?month=${month}`)
      const json = await res?.json()
      if (res?.ok) setData(json?.data || null)
    } finally { setLoading(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data)   return <Empty msg="لا توجد بيانات لهذا الشهر." />

  const rows = view === 'municipality' ? data.by_municipality : data.by_element

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">التحليل التقديري لمؤشر التشوه البصري</h2>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
            <AlertTriangle size={11} /> جميع القيم تقديرية — لا تُعدّ مؤشرات VPI رسمية
          </p>
        </div>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'VPI التقديري الكلي',     value: data.overall_vpi,      unit: 'وحدة/كم²',   color: 'amber', badge: 'تقديري' },
          { label: 'VPI التقديري المعدّل',    value: data.adj_overall_vpi,  unit: 'وحدة/كم²',   color: 'teal',  badge: 'معدّل' },
          { label: 'إجمالي الوحدات الكلية',  value: data.total_units,      unit: 'وحدة',       color: 'blue',  badge: '' },
          { label: 'الوحدات بعد الاستبعاد',  value: data.adj_units,        unit: 'وحدة',       color: 'blue',  badge: 'معدّل' },
          { label: 'المساحة المغطاة',         value: data.covered_area_km2, unit: 'كم²',        color: 'green', badge: '' },
          { label: 'إجمالي البلاغات',         value: data.total_reports,   unit: 'بلاغ',       color: 'slate', badge: '' },
        ].map(({ label, value, unit, color, badge }) => {
          const palette = {
            amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
            teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300',
            blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
            green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
            slate: 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200',
          }
          return (
            <div key={label} className={`rounded-xl border p-3 ${palette[color] || palette.slate}`}>
              <div className="flex items-start justify-between mb-1">
                <p className="text-xs font-medium opacity-70 leading-tight">{label}</p>
                {badge && <span className="text-xs px-1 py-0.5 bg-white/50 dark:bg-gray-900/50 rounded font-medium flex-shrink-0 mr-1">{badge}</span>}
              </div>
              <p className="text-xl font-bold">{value != null ? n(value) : '—'}</p>
              {unit && <p className="text-xs opacity-60 mt-0.5">{unit}</p>}
            </div>
          )
        })}
      </div>

      {/* View Toggle */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200">توزيع الوحدات التقديرية والتأثير على المؤشر</h3>
          <div className="flex gap-2">
            {[['municipality','البلديات'],['element','العناصر']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all ${view === v ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Chart + Table side by side */}
        <div className="p-5">
          {rows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bar chart — units contribution */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3">نسبة الوحدات التقديرية (%)</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rows.slice(0, 10)} margin={{ top: 5, bottom: 65, right: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} vertical={false} />
                    <XAxis type="category" dataKey={view === 'municipality' ? 'municipality_name' : 'element_name'} tick={{ fontSize: 9, fill: '#9CA3AF', angle: -35, textAnchor: 'end' }} interval={0} />
                    <YAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip content={<ChartTip />} formatter={(v) => `${n(v)}%`} />
                    <Bar dataKey="units_pct" name="نسبة الوحدات" radius={[3,3,0,0]}>
                      {rows.slice(0,10).map((_,i) => <Cell key={i} fill={BLUE_GRADIENT[Math.min(i, BLUE_GRADIENT.length-1)]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">{view === 'municipality' ? 'البلدية' : 'العنصر'}</th>
                      <th className="px-3 py-2 text-center font-medium">بلاغات</th>
                      <th className="px-3 py-2 text-center font-medium">وحدات</th>
                      <th className="px-3 py-2 text-center font-medium">نسبة%</th>
                      <th className="px-3 py-2 text-center font-medium">VPI تقديري</th>
                      <th className="px-3 py-2 text-center font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400">VPI معدّل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {rows.map((row, i) => {
                      const name = view === 'municipality' ? row.municipality_name : row.element_name
                      const barW = Math.round((row.units_pct || 0))
                      return (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                          <td className="px-3 py-2.5 font-medium truncate max-w-[120px]" title={name}>{name || '—'}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{n(row.total_reports, 0)}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{n(row.estimated_units)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center gap-1.5 justify-end">
                              <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 min-w-[40px]">
                                <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(barW, 100)}%` }} />
                              </div>
                              <span className="tabular-nums text-slate-600 dark:text-gray-400 w-10 text-left">{pct(row.units_pct)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {row.estimated_vpi != null
                              ? <span className="font-semibold text-amber-600 dark:text-amber-400">{n(row.estimated_vpi)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums bg-teal-50/40 dark:bg-teal-900/10">
                            {row.adj_estimated_vpi != null
                              ? <span className="font-semibold text-teal-600 dark:text-teal-400">{n(row.adj_estimated_vpi)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800">
                    <tr>
                      <td className="px-3 py-2.5 font-bold text-slate-700 dark:text-gray-200">الإجمالي</td>
                      <td className="px-3 py-2.5 text-center font-bold tabular-nums">{n(data.total_reports, 0)}</td>
                      <td className="px-3 py-2.5 text-center font-bold tabular-nums">{n(data.total_units)}</td>
                      <td className="px-3 py-2.5 text-center font-bold">100%</td>
                      <td className="px-3 py-2.5 text-center font-bold text-amber-600 dark:text-amber-400 tabular-nums">{n(data.overall_vpi)}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-teal-600 dark:text-teal-400 tabular-nums">{n(data.adj_overall_vpi)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : <Empty msg="لا توجد بيانات." />}
        </div>
      </div>

      {/* VPI contribution chart (municipalities only, when covered area available) */}
      {view === 'municipality' && data.by_municipality.some(r => r.estimated_vpi != null) && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">VPI التقديري لكل بلدية</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.by_municipality.filter(r => r.estimated_vpi != null).slice(0, 10)} margin={{ top: 5, bottom: 65, right: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} vertical={false} />
              <XAxis type="category" dataKey="municipality_name" tick={{ fontSize: 9, fill: '#9CA3AF', angle: -35, textAnchor: 'end' }} interval={0} />
              <YAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={v => n(v)} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="estimated_vpi" name="VPI تقديري" radius={[3,3,0,0]}>
                {data.by_municipality.filter(r => r.estimated_vpi != null).slice(0,10).map((_,i) => (
                  <Cell key={i} fill={BLUE_GRADIENT[Math.min(i, BLUE_GRADIENT.length-1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {!data.covered_area_km2 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={11} />
              المساحة المغطاة غير متاحة لهذا الشهر — VPI البلديات لا يمكن احتسابه بشكل مستقل
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Map Tab ──────────────────────────────────────────────────────────────────

const MONTH_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#84CC16','#F97316','#EC4899','#6366F1','#14B8A6','#F43F5E']

function makeDotIcon(color, size = 12, ring = false) {
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${ring ? '3px solid white' : '2px solid rgba(255,255,255,0.8)'};box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    className: '', iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2],
  })
}

function MapFitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length || !map) return
    const lats = points.map(p => parseFloat(p.lat))
    const lngs = points.map(p => parseFloat(p.lng))
    const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
    try { map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true }) } catch (_) {}
  }, [points.length]) // eslint-disable-line
  return null
}

function MapTab({ months, authFetch }) {
  const [selectedMonths, setSelectedMonths] = useState(() => months.slice(0, 3))
  const [showSystem,     setShowSystem]     = useState(false)
  const [data,           setData]           = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [showDupes,      setShowDupes]      = useState(true)

  const monthColorMap = useMemo(() => {
    const m = {}
    months.forEach((mo, i) => { m[mo] = MONTH_COLORS[i % MONTH_COLORS.length] })
    return m
  }, [months])

  const load = useCallback(async () => {
    if (!selectedMonths.length) { setData(null); return }
    setLoading(true); setError(null)
    try {
      const qs = selectedMonths.map(m => `months=${encodeURIComponent(m)}`).join('&')
      const res = await authFetch(`/api/eoi/map-points?${qs}&include_system=${showSystem}`)
      const json = await res?.json()
      if (!res?.ok) throw new Error(json?.error || 'فشل تحميل النقاط')
      setData(json)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [selectedMonths, showSystem, authFetch])

  useEffect(() => { load() }, [load])

  const dupeKeys = useMemo(() => {
    if (!data?.observations) return new Set()
    const seen = {}, dupes = new Set()
    for (const p of data.observations) {
      if (p.lat == null || p.lng == null) continue
      const k = `${parseFloat(p.lat).toFixed(4)},${parseFloat(p.lng).toFixed(4)}`
      if (seen[k]) dupes.add(k); else seen[k] = true
    }
    return dupes
  }, [data])

  const systemOverlapKeys = useMemo(() => {
    if (!data?.observations?.length || !data?.systemReports?.length) return new Set()
    const eoiKeys = new Set(data.observations.map(p => p.lat != null ? `${parseFloat(p.lat).toFixed(4)},${parseFloat(p.lng).toFixed(4)}` : null).filter(Boolean))
    return new Set(data.systemReports.map(p => p.lat != null ? `${parseFloat(p.lat).toFixed(4)},${parseFloat(p.lng).toFixed(4)}` : null).filter(k => k && eoiKeys.has(k)))
  }, [data])

  const allPoints = useMemo(() => data?.observations?.filter(p => p.lat != null && p.lng != null) || [], [data])
  const sysPoints = useMemo(() => data?.systemReports?.filter(p => p.lat != null && p.lng != null) || [], [data])
  const dupeCount = dupeKeys.size + systemOverlapKeys.size

  function toggleMonth(m) {
    setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">خريطة الرصد الجغرافي</h2>
        {dupeCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 text-xs font-semibold">
            <AlertTriangle size={13} /> {dupeCount} نقطة مكررة أو متطابقة
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-gray-300">تحديد الأشهر</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)} className="rounded border-slate-300 text-blue-600" />
              عرض بلاغات النظام
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={showDupes} onChange={e => setShowDupes(e.target.checked)} className="rounded border-slate-300 text-orange-500" />
              إبراز المكررات
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {months.map((m, i) => (
            <button key={m} onClick={() => toggleMonth(m)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium"
              style={selectedMonths.includes(m)
                ? { background: MONTH_COLORS[i%MONTH_COLORS.length]+'22', borderColor: MONTH_COLORS[i%MONTH_COLORS.length], color: MONTH_COLORS[i%MONTH_COLORS.length] }
                : { background:'transparent', borderColor:'#CBD5E1', color:'#94A3B8' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: MONTH_COLORS[i%MONTH_COLORS.length] }} />
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-gray-800">
          {months.slice(0,4).map((m,i) => (
            <span key={m} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: MONTH_COLORS[i%MONTH_COLORS.length] }} /> {m}
            </span>
          ))}
          {showDupes && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> مكرر</span>}
          {showSystem && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" /> بلاغ نظام</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'نقاط الرصد',     value: allPoints.length.toLocaleString('en-US'), color: 'blue'  },
          { label: 'بلاغات النظام',  value: showSystem ? sysPoints.length.toLocaleString('en-US') : '—', color: 'slate' },
          { label: 'تكرار / تطابق', value: dupeCount > 0 ? dupeCount : 'لا يوجد', color: dupeCount > 0 ? 'amber' : 'slate' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-3 text-center ${color==='amber' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200' : color==='blue' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' : 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700'}`}>
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className="text-xl font-bold text-slate-700 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Map — always rendered, overlay for states */}
      <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden relative" style={{ height: 520 }}>
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm">
            <div className="w-9 h-9 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        )}
        {/* Empty overlay */}
        {!loading && !error && allPoints.length === 0 && selectedMonths.length > 0 && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <MapPin size={36} className="text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">لا توجد نقاط بإحداثيات في الأشهر المحددة</p>
          </div>
        )}
        {/* No month selected overlay */}
        {!loading && selectedMonths.length === 0 && (
          <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <p className="text-sm text-slate-500">اختر شهراً واحداً على الأقل</p>
          </div>
        )}
        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/80 dark:bg-gray-900/80">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <MapContainer
          center={[24.7136, 46.6753]}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
          />

          {allPoints.length > 0 && <MapFitBounds points={allPoints} />}

          {/* EOI observation markers — inside cluster */}
          {allPoints.length > 0 && (
            <MarkerClusterGroup chunkedLoading maxClusterRadius={50} showCoverageOnHover={false}>
              {allPoints.map(p => {
                const k = `${parseFloat(p.lat).toFixed(4)},${parseFloat(p.lng).toFixed(4)}`
                const isOverlap = systemOverlapKeys.has(k)
                const isDupe    = showDupes && (dupeKeys.has(k) || isOverlap)
                const color     = isOverlap ? '#DC2626' : isDupe ? '#F97316' : (monthColorMap[p.observation_month] || '#3B82F6')
                return (
                  <Marker key={`eoi-${p.id}`} position={[parseFloat(p.lat), parseFloat(p.lng)]}
                    icon={makeDotIcon(color, isDupe ? 14 : 10, isDupe)}>
                    <Popup>
                      <div className="text-xs space-y-1" style={{ minWidth: 160 }}>
                        <p style={{ fontWeight: 700 }}>{p.element_name || '—'}</p>
                        <p style={{ color: '#64748B' }}>{p.municipality_name} · {p.observation_date}</p>
                        <p style={{ color: '#64748B' }}>الشهر: {p.observation_month}</p>
                        {p.closure_status && <p>الإغلاق: {p.closure_status}</p>}
                        {p.report_status  && <p>حالة البلاغ: {p.report_status}</p>}
                        {p.visit_status   && <p>الزيارة: {p.visit_status}</p>}
                        {p.repeated_count > 0 && <p style={{ color:'#EF4444' }}>تكرر {p.repeated_count}×</p>}
                        {isDupe && <p style={{ color:'#F97316', fontWeight:600 }}>{isOverlap ? '⚠ تطابق مع بلاغ نظام' : '⚠ إحداثيات مكررة'}</p>}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          )}

          {/* System reports layer */}
          {showSystem && sysPoints.length > 0 && (
            <MarkerClusterGroup chunkedLoading maxClusterRadius={50} showCoverageOnHover={false}>
              {sysPoints.map(p => {
                const k = `${parseFloat(p.lat).toFixed(4)},${parseFloat(p.lng).toFixed(4)}`
                const isOverlap = systemOverlapKeys.has(k)
                const color = isOverlap ? '#DC2626' : '#64748B'
                return (
                  <Marker key={`sys-${p.id}`} position={[parseFloat(p.lat), parseFloat(p.lng)]}
                    icon={makeDotIcon(color, 8)}>
                    <Popup>
                      <div className="text-xs space-y-1" style={{ minWidth: 140 }}>
                        <p style={{ fontWeight:600, color:'#64748B' }}>بلاغ نظام</p>
                        <p>{p.element_name || '—'} · {p.municipality_name || '—'}</p>
                        {p.closure_status && <p>{p.closure_status}</p>}
                        {isOverlap && <p style={{ color:'#DC2626', fontWeight:600 }}>⚠ يتطابق مع نقطة رصد</p>}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          )}
        </MapContainer>
      </div>
    </div>
  )
}

// ─── Unit Rules Tab ───────────────────────────────────────────────────────────

function RulesTab({ authFetch }) {
  const [rules,   setRules]   = useState([])
  const [loading, setLoad]    = useState(false)
  const [form,    setForm]    = useState({ element_pattern: '', match_type: 'exact', factor: '1.0', description: '' })
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState(null)

  const load = useCallback(async () => {
    setLoad(true)
    try {
      const res = await authFetch('/api/eoi/unit-rules')
      if (res?.ok) setRules((await res.json()).rules || [])
    } finally { setLoad(false) }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await authFetch('/api/eoi/unit-rules', {
        method: 'POST',
        body: JSON.stringify({ element_pattern: form.element_pattern, match_type: form.match_type, factor: parseFloat(form.factor), description: form.description }),
      })
      if (res?.ok) { setMsg({ type: 'success', text: 'تم الحفظ' }); load() }
      else { const j = await res?.json(); setMsg({ type: 'error', text: j?.error || 'خطأ' }) }
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">قواعد تحويل الوحدات</h2>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300 flex gap-2">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        الافتراضي: بلاغ واحد = وحدة واحدة (factor = 1.0). العناصر الكبيرة المساحة: factor = 0.02 (أي 50 بلاغ = وحدة).
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5 max-w-lg space-y-4">
        <h3 className="font-semibold text-slate-700 dark:text-gray-200">إضافة / تعديل قاعدة</h3>
        {[
          { label: 'اسم العنصر', key: 'element_pattern', type: 'text', placeholder: 'حفر الشوارع' },
          { label: 'معامل التحويل (factor)', key: 'factor', type: 'number', placeholder: '1.0 أو 0.02' },
          { label: 'ملاحظة', key: 'description', type: 'text', placeholder: 'اختياري' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">{f.label}</label>
            <input type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
              className="w-full border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">نوع المطابقة</label>
          <select value={form.match_type} onChange={e => setForm(s => ({ ...s, match_type: e.target.value }))}
            className="w-full border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="exact">تطابق تام</option>
            <option value="contains">يحتوي على</option>
          </select>
        </div>
        {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>}
        <button onClick={save} disabled={!form.element_pattern || saving}
          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
          {saving ? 'جاري الحفظ...' : 'حفظ القاعدة'}
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500">
              <tr>{['العنصر','النوع','المعامل','الوصف','الحالة'].map(h => <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {rules.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium">{r.element_pattern}</td>
                  <td className="px-4 py-3 text-slate-500">{r.match_type === 'exact' ? 'تطابق تام' : 'يحتوي'}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-blue-600 dark:text-blue-400">{r.factor}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{r.description || '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? 'نشط' : 'معطل'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Upload Tab ───────────────────────────────────────────────────────────────

function UploadTab({ authFetch, user, onUploaded }) {
  const [step,        setStep]       = useState(1)
  const [file,        setFile]       = useState(null)
  const [loading,     setLoading]    = useState(false)
  const [error,       setError]      = useState(null)
  const [inspection,  setInsp]       = useState(null)
  const [mapping,     setMapping]    = useState({})
  const [confidence,  setConf]       = useState({})
  const [templates,   setTemplates]  = useState([])
  const [discovered,  setDisc]       = useState([])
  const [discStats,   setDiscStats]  = useState(null)
  const [existAction, setExistAct]   = useState('skip')
  const [results,     setResults]    = useState([])
  const [tmplName,    setTmplName]   = useState('')
  const [history,     setHistory]    = useState([])
  const [selected,    setSelected]   = useState(new Set())
  const [deleteMode,  setDeleteMode] = useState(null) // 'selected' | 'all'
  const [deleting,    setDeleting]   = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const fileRef = useRef()

  const refreshHistory = () =>
    authFetch('/api/eoi/uploads/history').then(r => r?.json()).then(j => setHistory(j?.data || []))

  useEffect(() => { refreshHistory() }, [authFetch]) // eslint-disable-line

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === history.length ? new Set() : new Set(history.map(h => h.id)))
  }

  async function handleDeleteConfirm() {
    setDeleting(true); setDeleteError(null)
    try {
      const ids = deleteMode === 'all' ? 'all' : [...selected]
      const res  = await authFetch('/api/eoi/uploads', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      })
      const json = await res?.json()
      if (!res?.ok) throw new Error(json?.error || 'فشل الحذف')
      setDeleteMode(null); setSelected(new Set())
      await refreshHistory()
      onUploaded?.()
    } catch (err) { setDeleteError(err.message) }
    finally { setDeleting(false) }
  }

  const EOI_FIELDS = [
    { key: 'observation_date',  label: 'تاريخ الرصد',             required: true,  hint: 'YYYY-MM-DD أو DD/MM/YYYY' },
    { key: 'municipality_name', label: 'اسم البلدية',             required: true,  hint: '' },
    { key: 'element_name',      label: 'عنصر التشوه',             required: true,  hint: '' },
    { key: 'visit_status',      label: 'حالة الزيارة',            required: false, hint: '' },
    { key: 'closure_status',    label: 'حالة الإغلاق',               required: false, hint: 'مغلق · مفتوح' },
    { key: 'report_status',     label: 'حالة البلاغ',                required: false, hint: 'قيد التنفيذ · مغلق آلياً' },
    { key: 'priority_zone_name',label: 'منطقة الأولوية',         required: false, hint: '' },
    { key: 'cluster_id',        label: 'ClusterId',               required: false, hint: 'مفتاح GIS الاستراتيجي' },
    { key: 'report_number',     label: 'رقم البلاغ',              required: false, hint: '' },
    { key: 'closure_date',      label: 'تاريخ الإغلاق',           required: false, hint: '' },
    { key: 'crm_number',        label: 'رقم CRM',                 required: false, hint: '' },
    { key: 'repeated_count',    label: 'عدد مرات التكرار',        required: false, hint: '' },
    { key: 'lat',               label: 'خط العرض (Latitude)',     required: false, hint: '' },
    { key: 'lng',               label: 'خط الطول (Longitude)',    required: false, hint: '' },
  ]

  async function handleFile(f) {
    if (!f) return
    setFile(f); setError(null); setLoading(true)
    try {
      const form = new FormData(); form.append('file', f)
      const res  = await fetch(`${API}/api/eoi/wizard/inspect`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setInsp(json.inspection); setMapping(json.suggestedMapping || {}); setConf(json.confidence || {}); setTemplates(json.templates || [])
      setStep(2)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function discover() {
    setError(null); setLoading(true)
    try {
      const form = new FormData(); form.append('file', file); form.append('mapping', JSON.stringify(mapping))
      const res  = await fetch(`${API}/api/eoi/wizard/discover`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (!json.months?.length) throw new Error('لم يُكتشف أي شهر. تحقق من حقل تاريخ الرصد.')
      setDisc(json.months); setDiscStats({ total: json.totalRows, skipped: json.skippedRows }); setStep(3)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function doImport() {
    setError(null); setLoading(true)
    try {
      const form = new FormData(); form.append('file', file); form.append('mapping', JSON.stringify(mapping)); form.append('existing_action', existAction)
      const res  = await fetch(`${API}/api/eoi/wizard/import`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResults(json.results || []); setStep(4)
      await refreshHistory()
      onUploaded?.()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function saveTemplate() {
    if (!tmplName.trim()) return
    await fetch(`${API}/api/eoi/wizard/templates`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tmplName, mapping }) })
    setTmplName('')
  }

  function reset() { setStep(1); setFile(null); setMapping({}); setDisc([]); setResults([]); setError(null); if (fileRef.current) fileRef.current.value = '' }

  const FieldSel = ({ fkey }) => (
    <div className="relative">
      <select value={mapping[fkey] || ''} onChange={e => setMapping(m => ({ ...m, [fkey]: e.target.value || undefined }))}
        className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-7">
        <option value="">اختياري</option>
        {inspection?.columns?.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <ChevronDown size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )

  // Progress bar helper
  const ProgBar = () => (
    <div className="flex gap-1 mb-4">
      {[1,2,3,4].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-blue-500' : 'bg-slate-200 dark:bg-gray-700'}`} />)}
    </div>
  )

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">رفع بيانات الرصد الخارجي</h2>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6">
        <ProgBar />

        {/* Step 1: File */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">ارفع ملف Excel</p>
            <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${loading ? 'opacity-60 cursor-wait' : 'border-slate-200 dark:border-gray-700 hover:border-blue-400'}`}>
              {loading ? <RefreshCw size={28} className="mx-auto mb-2 text-blue-500 animate-spin" /> : <Upload size={28} className="mx-auto mb-2 text-slate-400" />}
              <p className="text-sm text-slate-500">{loading ? 'جاري التحليل...' : 'اسحب ملف Excel هنا أو انقر للاختيار'}</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            </label>
            {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3 text-sm text-red-600 flex gap-2"><XCircle size={14} className="flex-shrink-0 mt-0.5" />{error}</div>}
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && inspection && (
          <div className="space-y-4">
            <div><p className="text-xs text-slate-400 mb-0.5">خطوة 2 من 4</p><p className="text-sm font-bold text-slate-800 dark:text-white">ضبط حقول البيانات — {file?.name} ({inspection.totalRows?.toLocaleString('en-US')} صف)</p></div>
            {templates.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">قوالب محفوظة</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map(t => <button key={t.id} onClick={() => setMapping(typeof t.mapping === 'string' ? JSON.parse(t.mapping) : t.mapping)} className="text-xs bg-white dark:bg-gray-800 border border-blue-300 rounded-lg px-3 py-1.5 text-blue-600 hover:bg-blue-50 transition-colors">{t.name}</button>)}
                </div>
              </div>
            )}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {EOI_FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-[1fr_1.5fr_0.8fr] gap-3 items-center py-2 border-b border-slate-100 dark:border-gray-800">
                  <div><p className="text-xs font-medium text-slate-700 dark:text-gray-200">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</p>{f.hint && <p className="text-xs text-slate-400">{f.hint}</p>}</div>
                  <FieldSel fkey={f.key} />
                  <div className="flex gap-1 flex-wrap">
                    {mapping[f.key] && (inspection.columnSamples?.[mapping[f.key]] || []).slice(0,2).map((s,i) => <span key={i} className="text-xs bg-slate-100 dark:bg-gray-700 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[60px]">{String(s)}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="احفظ هذا الضبط كقالب..." value={tmplName} onChange={e => setTmplName(e.target.value)}
                className="flex-1 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={saveTemplate} disabled={!tmplName.trim()} className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-300 text-sm disabled:opacity-40">حفظ</button>
            </div>
            {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3 text-sm text-red-600 flex gap-2"><XCircle size={14} className="flex-shrink-0 mt-0.5" />{error}</div>}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-gray-800">
              <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800 text-sm">← رجوع</button>
              <button onClick={discover} disabled={loading || !mapping.observation_date || !mapping.municipality_name || !mapping.element_name}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                {loading ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : null} اكتشاف الأشهر →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Discovery */}
        {step === 3 && (
          <div className="space-y-4">
            <div><p className="text-xs text-slate-400 mb-0.5">خطوة 3 من 4</p><p className="text-sm font-bold text-slate-800 dark:text-white">الأشهر المكتشفة — {discovered.length} شهر</p></div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-700">
              <div className="grid grid-cols-3 px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-gray-800">
                <span>الشهر</span><span className="text-center">البلاغات</span><span className="text-center">الحالة</span>
              </div>
              {discovered.map(m => (
                <div key={m.month} className="grid grid-cols-3 px-4 py-2.5 items-center">
                  <span className="text-sm font-semibold tabular-nums">{m.month}</span>
                  <span className="text-sm tabular-nums text-center">{m.rowCount.toLocaleString('en-US')}</span>
                  <span className="text-center"><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">جديد</span></span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'الأشهر', value: discovered.length },
                { label: 'البلاغات', value: discovered.reduce((s, m) => s + m.rowCount, 0).toLocaleString('en-US') },
                { label: 'صفوف مُهملة', value: discStats?.skipped || 0 },
              ].map(({ label, value }) => (
                <div key={label} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{value}</p>
                </div>
              ))}
            </div>
            {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-gray-800">
              <button onClick={() => setStep(2)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800 text-sm">← رجوع</button>
              <button onClick={doImport} disabled={loading || !discovered.length}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                {loading ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : null} استيراد {discovered.length} شهر →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="space-y-4">
            <div><p className="text-xs text-slate-400 mb-0.5">خطوة 4 من 4</p><p className="text-sm font-bold text-slate-800 dark:text-white">نتيجة الاستيراد</p></div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'مستورد', value: results.filter(r => r.status === 'imported').length, color: 'emerald' },
                { label: 'فشل',   value: results.filter(r => r.status === 'failed').length,   color: 'red' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl p-4 text-center bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-800`}>
                  <p className={`text-xs text-${color}-500 mb-1`}>{label}</p>
                  <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="max-h-52 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
              {results.map(r => (
                <div key={r.month} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-semibold tabular-nums">{r.month}</span>
                  <span className="text-sm tabular-nums text-slate-500">{r.rowCount?.toLocaleString('en-US')} صف</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'imported' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-red-100 dark:bg-red-900/30 text-red-500'}`}>
                    {r.status === 'imported' ? 'مستورد' : r.error || 'فشل'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={reset} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
              <Upload size={14} /> استيراد ملف جديد
            </button>
          </div>
        )}
      </div>

      {/* Upload history */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
          {/* Header row */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-600 dark:text-gray-300">
              سجل الرفع
              {selected.size > 0 && (
                <span className="mr-2 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold">
                  {selected.size} محدد
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  onClick={() => setDeleteMode('selected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  <Trash2 size={12} /> حذف المحدد ({selected.size})
                </button>
              )}
              <button
                onClick={() => setDeleteMode('all')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={12} /> حذف الكل
              </button>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-400">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={history.length > 0 && selected.size === history.length}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {['الصفوف','نطاق التواريخ','الحالة','المستخدم','تاريخ الرفع'].map(h => (
                  <th key={h} className="px-4 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
              {history.map(h => (
                <tr
                  key={h.id}
                  onClick={() => toggleSelect(h.id)}
                  className={`cursor-pointer transition-colors ${selected.has(h.id) ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-gray-800/40'}`}
                >
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(h.id)}
                      onChange={() => toggleSelect(h.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-medium">{h.row_count?.toLocaleString('en-US') ?? '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums">{h.date_range || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : h.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                      {h.status === 'completed' ? 'مكتمل' : h.status === 'failed' ? 'فشل' : 'معالجة'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{h.uploaded_by_name || '—'}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-400">{new Date(h.created_at).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {deleteMode === 'all' ? 'حذف جميع بيانات الرصد' : `حذف ${selected.size} عملية رفع`}
                </p>
                <p className="text-xs text-slate-400">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 text-xs text-red-700 dark:text-red-300 space-y-1.5">
              {deleteMode === 'all' ? (
                <>
                  <p>سيتم حذف <span className="font-bold">جميع</span> سجلات الرصد ({history.reduce((s, h) => s + (h.row_count || 0), 0).toLocaleString('en-US')} سجل) من {history.length} عملية رفع.</p>
                </>
              ) : (
                <>
                  <p>سيتم حذف سجلات الرصد المرتبطة بـ <span className="font-bold">{selected.size}</span> عملية رفع:</p>
                  <p className="font-semibold tabular-nums">
                    {history.filter(h => selected.has(h.id)).reduce((s, h) => s + (h.row_count || 0), 0).toLocaleString('en-US')} سجل إجمالي
                  </p>
                </>
              )}
              <p className="text-red-500">سيتم إعادة احتساب VPI التقديري للأشهر المتأثرة تلقائياً.</p>
            </div>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-600 mb-3 flex items-center gap-1.5">
                <XCircle size={12} /> {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteMode(null); setDeleteError(null) }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main EOI Page ────────────────────────────────────────────────────────────

export default function EOI() {
  const { user, authFetch } = useAuth()
  const [activeTab, setActive] = useState('operations')
  const [months,   setMonths]  = useState([])
  const [month,    setMonth]   = useState('')
  const [loadingM, setLoadingM] = useState(true)

  const loadMonths = useCallback(async () => {
    setLoadingM(true)
    try {
      const res  = await authFetch('/api/eoi/months')
      const json = await res?.json()
      const list = json?.months || []
      setMonths(list)
      if (list.length && !month) setMonth(list[0])
    } finally { setLoadingM(false) }
  }, [authFetch, month])

  useEffect(() => { loadMonths() }, []) // eslint-disable-line

  const visibleTabs = TABS.filter(t => !t.roles || t.roles.includes(user?.role))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg">
            <Eye size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">ذكاء الرصد الخارجي</h1>
            <p className="text-xs text-slate-400 dark:text-gray-500">External Observation Intelligence · بيانات تشغيلية وتقديرية</p>
          </div>
          {loadingM && <RefreshCw size={14} className="text-blue-400 animate-spin mr-auto" />}
        </div>
        {!loadingM && months.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 w-fit">
            <AlertTriangle size={14} /> ارفع ملف الرصد الخارجي من تبويب "رفع البيانات"
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-1.5 overflow-x-auto">
        {visibleTabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800'
            }`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'operations' && <OperationsTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} user={user} />}
      {activeTab === 'visit'      && <VisitTab      month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'inprogress' && <InProgressTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'repeated'   && <RepeatedTab   month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'quality'    && <QualityTab    month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'warning'    && <WarningTab    month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'summary'    && <SummaryTab    month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'vpi'        && <VPIAnalysisTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'map'        && <MapTab        months={months} authFetch={authFetch} />}
      {activeTab === 'rules'      && <RulesTab      authFetch={authFetch} />}
      {activeTab === 'upload'     && <UploadTab     authFetch={authFetch} user={user} onUploaded={loadMonths} />}
    </div>
  )
}
