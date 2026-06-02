import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import {
  Activity, TrendingUp, TrendingDown, Upload, RefreshCw, AlertTriangle,
  Building2, Layers, BarChart2, FileText, MapPin, CheckCircle2, XCircle,
  Clock, ChevronDown, Info, Target, Settings, Minus, ArrowUpRight, ArrowDownRight,
  Lightbulb, ShieldAlert, Star, AlertCircle,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import VPIWizard from '@/components/VPIWizard'

const API   = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'
const C     = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#84CC16','#F97316','#EC4899','#6366F1']

const TABS = [
  { id: 'executive', label: 'لوحة القيادة',      Icon: Star,      roles: ['admin','executive','auditor'] },
  { id: 'amanah',    label: 'الأمانة',            Icon: Activity,  roles: ['admin','executive','auditor'] },
  { id: 'muni',      label: 'البلدية',            Icon: Building2, roles: null },
  { id: 'top-munis', label: 'أعلى البلديات',      Icon: BarChart2, roles: ['admin','executive','auditor'] },
  { id: 'top-elems', label: 'أعلى العناصر',       Icon: Layers,    roles: null },
  { id: 'top-zones', label: 'أعلى المناطق',       Icon: MapPin,    roles: ['admin','executive','auditor'] },
  { id: 'rv-units',  label: 'بلاغات ووحدات',     Icon: FileText,  roles: null },
  { id: 'zones',     label: 'مناطق الأولوية',    Icon: MapPin,    roles: null },
  { id: 'targets',   label: 'الأهداف',           Icon: Target,    roles: ['admin','executive'] },
  { id: 'upload',    label: 'رفع البيانات',       Icon: Upload,    roles: ['admin','executive','manager'] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v, dec = 1) {
  if (v == null || v === '') return '—'
  const f = parseFloat(v)
  if (isNaN(f)) return '—'
  return f.toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
}
function pct(v) { return v == null ? '—' : `${parseFloat(v).toFixed(1)}%` }

function diffPct(cur, prev) {
  if (!cur || !prev || parseFloat(prev) === 0) return null
  return ((parseFloat(cur) - parseFloat(prev)) / Math.abs(parseFloat(prev))) * 100
}

function achievePct(cur, target, lowerBetter = true) {
  if (!cur || !target) return null
  const c = parseFloat(cur), t = parseFloat(target)
  return lowerBetter ? ((t - c) / t + 1) * 100 : (c / t) * 100
}

function TrendBadge({ value, lowerBetter = false, label }) {
  if (value == null) return null
  const good = lowerBetter ? value < 0 : value > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${good ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
      {good ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
      {Math.abs(value).toFixed(1)}% {label}
    </span>
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

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  )
}
function Empty({ msg }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-gray-600">
      <BarChart2 size={36} className="mb-3 opacity-30" />
      <p className="text-sm text-center max-w-xs">{msg}</p>
    </div>
  )
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm shadow-2xl text-white min-w-[120px]">
      <p className="text-gray-400 mb-1.5 text-xs">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill || '#60A5FA' }} className="font-medium">
          {p.name}: {n(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── KPI Hero Card ────────────────────────────────────────────────────────────

function HeroCard({ label, value, unit, prev, target, targetLabel, lowerBetter = true, color = 'blue', icon: Icon }) {
  const mom     = diffPct(value, prev)
  const achieve = achievePct(value, target, lowerBetter)
  const achieved = achieve != null && (lowerBetter ? parseFloat(value) <= parseFloat(target) : parseFloat(value) >= parseFloat(target))

  const palette = {
    blue:   { bg: 'from-blue-600 to-blue-700',     text: 'text-white' },
    green:  { bg: 'from-emerald-500 to-emerald-700', text: 'text-white' },
    amber:  { bg: 'from-amber-500 to-amber-600',   text: 'text-white' },
    purple: { bg: 'from-purple-600 to-purple-700', text: 'text-white' },
  }
  const p = palette[color] || palette.blue

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${p.bg} p-5 ${p.text} shadow-lg`}>
      <div className="flex items-start justify-between mb-3">
        <div className="opacity-80 text-xs font-medium uppercase tracking-wide">{label}</div>
        {Icon && <Icon size={18} className="opacity-70" />}
      </div>
      <div className="text-3xl font-bold mb-0.5">{n(value)}</div>
      {unit && <div className="text-xs opacity-70 mb-3">{unit}</div>}

      <div className="flex flex-wrap gap-2 mt-2">
        {mom != null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            (lowerBetter ? mom < 0 : mom > 0) ? 'bg-white/20' : 'bg-white/10 opacity-80'
          }`}>
            {mom > 0 ? '+' : ''}{mom.toFixed(1)}% شهرياً
          </span>
        )}
        {achieve != null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${achieved ? 'bg-white/25' : 'bg-white/10'}`}>
            {achieve.toFixed(1)}% من المستهدف
          </span>
        )}
        {target != null && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 opacity-70">
            {targetLabel || 'المستهدف'}: {n(target, 1)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ type, title, body }) {
  const cfg = {
    success:     { bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', icon: CheckCircle2, ic: 'text-emerald-500' },
    warning:     { bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',         icon: AlertTriangle, ic: 'text-amber-500' },
    alert:       { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',                 icon: ShieldAlert,   ic: 'text-red-500' },
    improvement: { bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',             icon: TrendingDown,  ic: 'text-blue-500' },
    info:        { bg: 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700',              icon: Lightbulb,     ic: 'text-slate-500' },
  }
  const s = cfg[type] || cfg.info
  const IconC = s.icon
  return (
    <div className={`rounded-xl border ${s.bg} p-4 flex gap-3`}>
      <IconC size={16} className={`flex-shrink-0 mt-0.5 ${s.ic}`} />
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white mb-0.5">{title}</p>
        <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

// ─── Target Comparison Row ────────────────────────────────────────────────────

function TargetRow({ label, current, prev, target, unit = '', lowerBetter = true }) {
  const c = parseFloat(current)
  const t = parseFloat(target)
  const achieved = !isNaN(c) && !isNaN(t) && (lowerBetter ? c <= t : c >= t)
  const achieve  = (!isNaN(c) && !isNaN(t) && t > 0) ? (lowerBetter ? ((t - c) / t + 1) * 100 : (c / t) * 100) : null
  const mom      = diffPct(current, prev)

  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{label}</p>
      </div>
      <div className="text-center w-24">
        <p className="text-lg font-bold text-slate-800 dark:text-white">{n(current)}</p>
        <p className="text-xs text-slate-400">{unit}</p>
      </div>
      <div className="text-center w-20">
        {prev != null ? (
          <>
            <p className="text-sm text-slate-500 dark:text-gray-400">{n(prev)}</p>
            {mom != null && <TrendBadge value={mom} lowerBetter={lowerBetter} />}
          </>
        ) : <p className="text-xs text-slate-300">—</p>}
      </div>
      <div className="text-center w-20">
        <p className="text-sm text-slate-500 dark:text-gray-400">{target != null ? n(target, 1) : '—'}</p>
      </div>
      <div className="text-center w-24">
        {achieve != null ? (
          <span className={`text-sm font-semibold ${achieved ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {achieve.toFixed(1)}%
          </span>
        ) : <p className="text-xs text-slate-300">—</p>}
      </div>
      <div className="w-6">
        {achieved ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-400" />}
      </div>
    </div>
  )
}

// ─── Executive Dashboard Tab ──────────────────────────────────────────────────

function ExecutiveTab({ month, months, onMonthChange, authFetch }) {
  const [amanah,   setAmanah]   = useState(null)
  const [summary,  setSummary]  = useState(null)
  const [insights, setInsights] = useState([])
  const [topMunis, setTopMunis] = useState([])
  const [topElems, setTopElems] = useState([])
  const [topZones, setTopZones] = useState([])
  const [loading,  setLoading]  = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    try {
      const [a, s, m, e, z] = await Promise.all([
        authFetch(`/api/vpi/dashboard/amanah?month=${month}`).then(r => r?.json()),
        authFetch(`/api/vpi/executive/summary?month=${month}`).then(r => r?.json()),
        authFetch(`/api/vpi/top/municipalities?month=${month}&limit=5`).then(r => r?.json()),
        authFetch(`/api/vpi/top/elements?month=${month}&limit=5`).then(r => r?.json()),
        authFetch(`/api/vpi/top/zones?month=${month}&limit=5`).then(r => r?.json()),
      ])
      setAmanah(a?.data)
      setSummary(s?.summary)
      setInsights(s?.insights || [])
      setTopMunis(m?.data || [])
      setTopElems(e?.data || [])
      setTopZones(z?.data || [])
    } finally { setLoading(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!amanah?.current) return <Empty msg="لا توجد بيانات لهذا الشهر. ارفع ملفي الرصد والتغطية أولاً." />

  const { current: kpi, previous, target, trend } = amanah

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">لوحة القيادة التنفيذية — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {/* KPI Hero Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroCard label="مؤشر VPI الأمانة" value={kpi.vpi} unit="مخالفة/كم²"
          prev={previous?.vpi} target={target?.vpi_target} targetLabel="المستهدف"
          lowerBetter color="blue" icon={Activity} />
        <HeroCard label="نسبة التغطية" value={kpi.coverage_rate} unit="%"
          prev={previous?.coverage_rate} target={target?.coverage_target} targetLabel="المستهدف"
          lowerBetter={false} color="green" icon={MapPin} />
        <HeroCard label="إجمالي البلاغات" value={kpi.report_count} unit="بلاغ"
          prev={previous?.report_count} lowerBetter={false} color="amber" icon={FileText} />
        <HeroCard label="إجمالي الوحدات" value={kpi.total_units} unit="وحدة"
          prev={previous?.total_units} lowerBetter={false} color="purple" icon={Layers} />
      </div>

      {/* Target Comparison Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5">
        <h3 className="font-semibold text-slate-700 dark:text-gray-200 mb-4">مقارنة بالمستهدف السنوي</h3>
        <div className="flex items-center gap-4 pb-2 text-xs font-medium text-slate-400 dark:text-gray-600 border-b border-slate-100 dark:border-gray-800 mb-1">
          <div className="flex-1">المؤشر</div>
          <div className="w-24 text-center">الحالي</div>
          <div className="w-20 text-center">الشهر السابق</div>
          <div className="w-20 text-center">المستهدف</div>
          <div className="w-24 text-center">نسبة التحقيق</div>
          <div className="w-6" />
        </div>
        <TargetRow label="مؤشر التشوه البصري VPI" current={kpi.vpi} prev={previous?.vpi} target={target?.vpi_target} unit="مخالفة/كم²" lowerBetter />
        <TargetRow label="نسبة التغطية المكانية" current={kpi.coverage_rate} prev={previous?.coverage_rate} target={target?.coverage_target} unit="%" lowerBetter={false} />
      </div>

      {/* Top spots row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'أعلى بلدية مساهمة',    items: topMunis, key: 'municipality_name', valKey: 'contribution_pct', vpiKey: 'vpi', valLabel: 'مساهمة' },
          { title: 'أكثر عنصر تأثيراً',     items: topElems, key: 'element_name',      valKey: 'contribution_pct', vpiKey: 'vpi', valLabel: 'مساهمة' },
          { title: 'أعلى منطقة أولوية',     items: topZones, key: 'priority_zone_name', valKey: 'contribution_pct', vpiKey: 'vpi', valLabel: 'مساهمة' },
        ].map(({ title, items, key, valKey, vpiKey, valLabel }) => (
          <div key={title} className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-4">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase mb-3">{title}</h4>
            {items.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-gray-800/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0"
                    style={{ background: C[i] }}>{i + 1}</span>
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate">{item[key]}</span>
                </div>
                <div className="text-right flex-shrink-0 mr-2">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{pct(item[valKey])}</p>
                  <p className="text-xs text-slate-400">VPI: {n(item[vpiKey])}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Executive Summary */}
      {summary && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-blue-800 dark:text-blue-300">الملخص التنفيذي</h3>
          </div>
          <p className="text-sm leading-8 text-slate-700 dark:text-gray-200">{summary}</p>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-500" /> رؤى وتنبيهات ذكية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
          </div>
        </div>
      )}

      {/* Mini trend chart */}
      {trend?.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">
            اتجاه VPI خلال العام {month.substring(0, 4)}
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="vpiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.12} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
              <Tooltip content={<ChartTip />} />
              {target && <ReferenceLine y={parseFloat(target.vpi_target)} stroke="#EF4444" strokeDasharray="4 2" label={{ value: `مستهدف ${target.vpi_target}`, position: 'insideTopRight', fill: '#EF4444', fontSize: 10 }} />}
              <Area type="monotone" dataKey="vpi" name="VPI" stroke="#3B82F6" fill="url(#vpiGrad)" strokeWidth={2.5} dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Amanah Dashboard Tab ─────────────────────────────────────────────────────

function AmanahTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]   = useState(null)
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/vpi/dashboard/amanah?month=${month}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data?.current) return <Empty msg="لا توجد بيانات لهذا الشهر." />

  const { current: k, previous, trend, target } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل الأمانة — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'VPI', value: k.vpi, unit: 'مخالفة/كم²', prev: previous?.vpi, t: target?.vpi_target, lb: true, col: 'blue' },
          { label: 'التغطية', value: k.coverage_rate, unit: '%', prev: previous?.coverage_rate, t: target?.coverage_target, lb: false, col: 'green' },
          { label: 'الوحدات', value: k.total_units, prev: previous?.total_units, lb: false, col: 'amber' },
          { label: 'البلاغات', value: k.report_count, prev: previous?.report_count, lb: false, col: 'purple' },
        ].map(({ label, value, unit, prev, t, lb, col }) => {
          const mom = diffPct(value, prev)
          const achieve = achievePct(value, t, lb)
          const color = { blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300', green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300', amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300', purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300' }[col]
          return (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
              <p className="text-2xl font-bold">{n(value)}</p>
              {unit && <p className="text-xs opacity-60">{unit}</p>}
              <div className="flex flex-wrap gap-1 mt-2">
                {mom != null && <TrendBadge value={mom} lowerBetter={lb} label="شهرياً" />}
                {achieve != null && <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/50 dark:bg-gray-800 font-medium">{achieve.toFixed(1)}% من المستهدف</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Trend charts */}
      {trend.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">اتجاه VPI مقابل المستهدف</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTip />} />
                {target && <ReferenceLine y={parseFloat(target.vpi_target)} stroke="#EF4444" strokeDasharray="4 2" label={{ value: `${target.vpi_target}`, fill: '#EF4444', fontSize: 10 }} />}
                <Line type="monotone" dataKey="vpi" name="VPI" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">إجمالي الوحدات والبلاغات شهرياً</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="total_units" name="الوحدات" fill="#F59E0B" radius={[3,3,0,0]} />
                <Bar dataKey="report_count" name="البلاغات" fill="#8B5CF6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Municipality Dashboard Tab ───────────────────────────────────────────────

function MuniTab({ month, months, onMonthChange, authFetch, user }) {
  const [data,     setData]     = useState(null)
  const [loading,  setLoad]     = useState(false)
  const [munis,    setMunis]    = useState([])
  const [selMuni,  setSelMuni]  = useState('')
  const isManager = user?.role === 'manager'

  useEffect(() => {
    if (isManager) return
    authFetch('/api/vpi/municipalities').then(r => r?.json()).then(j => setMunis(j?.municipalities || []))
  }, [authFetch, isManager])

  const load = useCallback(async () => {
    const muni = isManager ? '' : selMuni
    if (!month || (!isManager && !muni)) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muni && { municipality: muni }) })
      const res = await authFetch(`/api/vpi/dashboard/municipality?${qs}`)
      if (res?.ok) setData((await res.json()).data)
    } finally { setLoad(false) }
  }, [month, selMuni, isManager, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل البلدية</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        {!isManager && munis.length > 0 && (
          <div className="relative">
            <select value={selMuni} onChange={e => setSelMuni(e.target.value)}
              className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">اختر البلدية</option>
              {munis.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && !data && <Empty msg="اختر بلدية وشهراً لعرض المؤشرات." />}
      {!loading && data && (() => {
        const { current: k, previous, trend, target } = data
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <HeroCard label="VPI البلدية" value={k.vpi} unit="مخالفة/كم²" prev={previous?.vpi} target={target?.vpi_target} lowerBetter color="blue" icon={Activity} />
              <HeroCard label="المساهمة في الأمانة" value={k.contribution_pct ? `${parseFloat(k.contribution_pct).toFixed(1)}` : null} unit="%" lowerBetter={false} color="amber" icon={BarChart2} />
              <HeroCard label="التغطية" value={k.coverage_rate} unit="%" prev={previous?.coverage_rate} target={target?.coverage_target} lowerBetter={false} color="green" icon={MapPin} />
              <HeroCard label="الوحدات" value={k.total_units} unit="وحدة" prev={previous?.total_units} lowerBetter={false} color="purple" icon={Layers} />
            </div>

            {trend.length > 1 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">
                  اتجاه VPI — {k.municipality_name}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip content={<ChartTip />} />
                    {target && <ReferenceLine y={parseFloat(target.vpi_target)} stroke="#EF4444" strokeDasharray="4 2" />}
                    <Line type="monotone" dataKey="vpi" name="VPI" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="contribution_pct" name="المساهمة %" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─── Generic Top-5 Tab ────────────────────────────────────────────────────────

function TopTab({ month, months, onMonthChange, authFetch, endpoint, title, nameKey, extraCols = [] }) {
  const [data, setData]    = useState([])
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`${endpoint}?month=${month}&limit=5`)
      if (res?.ok) setData((await res.json()).data || [])
    } finally { setLoad(false) }
  }, [month, authFetch, endpoint])

  useEffect(() => { load() }, [load])

  const chartData = data.map((d, i) => ({
    name: d[nameKey]?.length > 16 ? d[nameKey].substring(0, 16) + '…' : d[nameKey],
    fullName: d[nameKey],
    'الوحدات': parseFloat(d.total_units),
    fill: C[i % C.length],
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{title} — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-4">المساهمة في وحدات الأمانة</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="الوحدات" radius={[0,4,4,0]}>
                    {chartData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase mb-4">التوزيع النسبي</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={data} dataKey="total_units" nameKey={nameKey} cx="50%" cy="50%" outerRadius={85}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {data.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => [n(v), 'الوحدات']} />
                  <Legend formatter={v => v?.length > 14 ? v.substring(0, 14) + '…' : v} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-right font-medium w-12">#</th>
                  <th className="px-4 py-3 text-right font-medium">{nameKey === 'municipality_name' ? 'البلدية' : nameKey === 'element_name' ? 'العنصر' : 'المنطقة'}</th>
                  {nameKey === 'priority_zone_name' && <th className="px-4 py-3 text-right font-medium">البلدية</th>}
                  <th className="px-4 py-3 text-right font-medium">البلاغات</th>
                  <th className="px-4 py-3 text-right font-medium">الوحدات</th>
                  <th className="px-4 py-3 text-right font-medium">التغطية كم²</th>
                  <th className="px-4 py-3 text-right font-medium">VPI</th>
                  <th className="px-4 py-3 text-right font-medium">المساهمة %</th>
                  {extraCols.map(c => <th key={c.key} className="px-4 py-3 text-right font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3">
                      <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: C[i % C.length] }}>{i + 1}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{row[nameKey]}</td>
                    {nameKey === 'priority_zone_name' && <td className="px-4 py-3 text-slate-500 dark:text-gray-400 text-xs">{row.municipality_name}</td>}
                    <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-gray-300">{n(row.report_count, 0)}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-700 dark:text-gray-200">{n(row.total_units)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{n(row.covered_area_km2)}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-blue-600 dark:text-blue-400">{n(row.vpi)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 min-w-[40px]">
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(row.contribution_pct || 0), 100)}%`, background: C[i % C.length] }} />
                        </div>
                        <span className="text-xs font-medium whitespace-nowrap">{pct(row.contribution_pct)}</span>
                      </div>
                    </td>
                    {extraCols.map(c => <td key={c.key} className="px-4 py-3 tabular-nums text-slate-500">{c.render ? c.render(row) : n(row[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Reports vs Units Tab ─────────────────────────────────────────────────────

function RVUnitsTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]       = useState([])
  const [loading, setLoad]    = useState(false)
  const [muniFilter, setFilt] = useState('')

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muniFilter && { municipality: muniFilter }) })
      const res = await authFetch(`/api/vpi/analytics/reports-vs-units?${qs}`)
      if (res?.ok) setData((await res.json()).data || [])
    } finally { setLoad(false) }
  }, [month, muniFilter, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل البلاغات والوحدات</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        <input type="text" placeholder="فلتر بلدية..." value={muniFilter} onChange={e => setFilt(e.target.value)}
          className="border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
              <tr>
                {['البلدية','العنصر','عدد البلاغات','إجمالي الوحدات','متوسط الوحدات/بلاغ','عدد المجموعات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium">{row.municipality_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{row.element_name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{n(row.report_count, 0)}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-blue-600 dark:text-blue-400">{n(row.total_units)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{n(row.avg_units_per_report)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-400">{row.distinct_clusters || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Priority Zone Analytics Tab ──────────────────────────────────────────────

function ZonesTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]       = useState([])
  const [loading, setLoad]    = useState(false)
  const [muniFilter, setFilt] = useState('')

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muniFilter && { municipality: muniFilter }) })
      const res = await authFetch(`/api/vpi/analytics/zones?${qs}`)
      if (res?.ok) setData((await res.json()).data || [])
    } finally { setLoad(false) }
  }, [month, muniFilter, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل مناطق الأولوية</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        <input type="text" placeholder="فلتر بلدية..." value={muniFilter} onChange={e => setFilt(e.target.value)}
          className="border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
              <tr>
                {['البلدية','المنطقة','البلاغات','الوحدات','كم² مغطى','VPI','نسبة التغطية','المساهمة %'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium">{row.municipality_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{row.priority_zone_name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{n(row.report_count, 0)}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-medium">{n(row.total_units)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-500">{n(row.covered_area_km2)}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-blue-600 dark:text-blue-400">{n(row.vpi)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{pct(row.coverage_rate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5 min-w-[40px]">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(parseFloat(row.contribution_pct || 0), 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium whitespace-nowrap">{pct(row.contribution_pct)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Targets Tab ──────────────────────────────────────────────────────────────

function TargetsTab({ authFetch, user }) {
  const [targets,  setTargets]  = useState([])
  const [loading,  setLoad]     = useState(false)
  const [form,     setForm]     = useState({ year: new Date().getFullYear() + 1, vpi: 27, coverage: 95, notes: '' })
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState(null)

  const load = useCallback(async () => {
    setLoad(true)
    try {
      const res = await authFetch('/api/vpi/targets')
      if (res?.ok) setTargets((await res.json()).targets || [])
    } finally { setLoad(false) }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await authFetch('/api/vpi/targets', {
        method: 'POST',
        body: JSON.stringify({ year: form.year, vpi_target: form.vpi, coverage_target: form.coverage, notes: form.notes }),
      })
      if (res?.ok) { setMsg({ type: 'success', text: 'تم حفظ المستهدفات بنجاح' }); load() }
      else { const j = await res?.json(); setMsg({ type: 'error', text: j?.error || 'خطأ في الحفظ' }) }
    } finally { setSaving(false) }
  }

  const canEdit = ['admin', 'executive'].includes(user?.role)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">إدارة المستهدفات السنوية</h2>

      {canEdit && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold text-slate-700 dark:text-gray-200">إضافة / تعديل مستهدف</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'السنة', key: 'year', type: 'number', hint: '' },
              { label: 'مستهدف VPI (مخالفة/كم²)', key: 'vpi', type: 'number', hint: '' },
              { label: 'مستهدف التغطية (%)', key: 'coverage', type: 'number', hint: '' },
            ].map(f => (
              <div key={f.key} className={f.key === 'year' ? 'col-span-2' : ''}>
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">ملاحظات</label>
              <input type="text" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))}
                className="w-full border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {msg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${msg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>
              {msg.text}
            </div>
          )}
          <button onClick={save} disabled={saving}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
            {saving ? 'جاري الحفظ...' : 'حفظ المستهدف'}
          </button>
        </div>
      )}

      {loading && <Spinner />}
      {!loading && targets.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden max-w-2xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
              <tr>
                {['السنة','مستهدف VPI (مخالفة/كم²)','مستهدف التغطية %','ملاحظات'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {targets.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-bold text-blue-600 dark:text-blue-400">{t.year}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{n(t.vpi_target, 1)}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{n(t.coverage_target, 1)}%</td>
                  <td className="px-4 py-3 text-slate-400 dark:text-gray-500 text-xs">{t.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Upload Tab — Powered by VPIWizard ───────────────────────────────────────

function UploadTab({ onUploaded }) {
  const [history, setHistory]  = useState([])
  const { authFetch }          = useAuth()

  useEffect(() => {
    authFetch('/api/vpi/uploads/history').then(r => r?.json()).then(j => setHistory(j?.data || []))
  }, [authFetch])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">رفع البيانات الشهرية</h2>
        <p className="text-xs text-slate-400 dark:text-gray-500">معالج الاستيراد المتقدم — يدعم الرسم البياني والاستيراد التاريخي متعدد الأشهر</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6">
        <VPIWizard onComplete={onUploaded} />
      </div>

      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-300">سجل الرفع</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-400">
                <tr>{['الشهر','النوع','الصفوف','الحالة','المستخدم','التاريخ'].map(h => (
                  <th key={h} className="px-4 py-2 text-right font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2 font-semibold tabular-nums">{h.month}</td>
                    <td className="px-4 py-2">{h.upload_type === 'observations' ? 'رصد' : 'تغطية'}</td>
                    <td className="px-4 py-2 tabular-nums">{h.row_count ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        h.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                        h.status === 'failed'    ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                                                   'bg-amber-100 dark:bg-amber-900/30 text-amber-700'
                      }`}>{h.status === 'completed' ? 'مكتمل' : h.status === 'failed' ? 'فشل' : 'معالجة'}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-400">{h.uploaded_by_name || '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-400">{new Date(h.created_at).toLocaleDateString('en-US')}</td>
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

// ─── Main VPI Page ────────────────────────────────────────────────────────────

export default function VPI() {
  const { user, authFetch } = useAuth()
  const [activeTab, setActive] = useState(() =>
    ['admin', 'executive', 'auditor'].includes(user?.role) ? 'executive' : 'muni'
  )
  const [months,   setMonths]  = useState([])
  const [month,    setMonth]   = useState('')
  const [loadingM, setLoadingM] = useState(true)

  const loadMonths = useCallback(async () => {
    setLoadingM(true)
    try {
      const res  = await authFetch('/api/vpi/months')
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
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Activity size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">مؤشر التشوه البصري — VPI</h1>
            <p className="text-xs text-slate-400 dark:text-gray-500">محرك KPI التنفيذي · أمانة الباحة</p>
          </div>
          {loadingM && <Clock size={14} className="text-blue-400 animate-spin mr-auto" />}
        </div>
        {!loadingM && months.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 w-fit">
            <AlertTriangle size={14} />
            لا توجد بيانات — ابدأ برفع ملفي الرصد والتغطية من تبويب "رفع البيانات"
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-1.5 overflow-x-auto">
        {visibleTabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800'
            }`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'executive' && <ExecutiveTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'amanah'    && <AmanahTab    month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'muni'      && <MuniTab      month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} user={user} />}
      {activeTab === 'top-munis' && <TopTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} endpoint="/api/vpi/top/municipalities" title="أعلى 5 بلديات مساهمة" nameKey="municipality_name" extraCols={[{ key: 'coverage_rate', label: 'التغطية %', render: r => pct(r.coverage_rate) }]} />}
      {activeTab === 'top-elems' && <TopTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} endpoint="/api/vpi/top/elements"       title="أعلى 5 عناصر تأثيراً"  nameKey="element_name" />}
      {activeTab === 'top-zones' && <TopTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} endpoint="/api/vpi/top/zones"          title="أعلى 5 مناطق أولوية" nameKey="priority_zone_name" />}
      {activeTab === 'rv-units'  && <RVUnitsTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'zones'     && <ZonesTab    month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />}
      {activeTab === 'targets'   && <TargetsTab  authFetch={authFetch} user={user} />}
      {activeTab === 'upload'    && <UploadTab   onUploaded={loadMonths} />}
    </div>
  )
}
