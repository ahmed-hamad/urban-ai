import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Upload, RefreshCw, AlertTriangle,
  Building2, Layers, BarChart2, FileText, MapPin, CheckCircle2,
  XCircle, Clock, ChevronDown, Activity,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1']

const TABS = [
  { id: 'amanah',    label: 'الأمانة',          Icon: Activity,  roles: ['admin','executive','auditor'] },
  { id: 'muni',      label: 'البلدية',           Icon: Building2, roles: null },
  { id: 'top-munis', label: 'أعلى البلديات',     Icon: BarChart2, roles: null },
  { id: 'top-elems', label: 'أعلى العناصر',      Icon: Layers,    roles: null },
  { id: 'rv-units',  label: 'بلاغات ووحدات',    Icon: FileText,  roles: null },
  { id: 'zones',     label: 'مناطق الأولوية',   Icon: MapPin,    roles: null },
  { id: 'upload',    label: 'رفع البيانات',      Icon: Upload,    roles: ['admin','executive','manager'] },
]

function fmt(n, dec = 2) {
  if (n == null) return '—'
  return parseFloat(n).toLocaleString('ar-SA', { maximumFractionDigits: dec })
}

function pct(n) {
  if (n == null) return '—'
  return `${parseFloat(n).toFixed(1)}%`
}

function KPICard({ label, value, unit, prev, trendUp, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    green:  'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
  }
  const diff = prev != null && value != null
    ? ((parseFloat(value) - parseFloat(prev)) / Math.abs(parseFloat(prev))) * 100
    : null

  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{fmt(value, 4)}</p>
      {unit && <p className="text-xs opacity-60 mt-0.5">{unit}</p>}
      {diff != null && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${diff >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
          {diff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{Math.abs(diff).toFixed(1)}% عن الشهر السابق</span>
        </div>
      )}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm shadow-2xl text-white">
      <p className="text-gray-400 mb-1 text-xs">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {fmt(p.value, 4)}
        </p>
      ))}
    </div>
  )
}

function MonthSelect({ months, value, onChange }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <ChevronDown size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ─── Amanah Dashboard Tab ─────────────────────────────────────────────────────

function AmanahTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoading(true)
    try {
      const res = await authFetch(`/api/vdi/dashboard/amanah?month=${month}`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data)
      }
    } finally { setLoading(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!data?.current) return (
    <Empty msg="لا توجد بيانات لهذا الشهر. ارفع ملفي الرصد والتغطية أولاً." />
  )

  const { current, previous, trend } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">لوحة الأمانة — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="مؤشر التشوه البصري (VDI)" value={current.vdi} unit="وحدة / م²" prev={previous?.vdi} color="blue" />
        <KPICard label="إجمالي الوحدات" value={current.total_units} prev={previous?.total_units} color="amber" />
        <KPICard label="المساحة المغطاة" value={current.total_covered_area} unit="م²" prev={previous?.total_covered_area} color="green" />
        <KPICard label="عدد البلاغات" value={current.report_count} prev={previous?.report_count} color="purple" />
      </div>

      {trend.length > 1 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4">اتجاه المؤشر خلال العام</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="vdi" name="VDI" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trend.length > 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4">إجمالي الوحدات شهرياً</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total_units" name="إجمالي الوحدات" fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {trend.length > 1 && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4">عدد البلاغات شهرياً</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="report_count" name="عدد البلاغات" fill="#8B5CF6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Municipality Dashboard Tab ───────────────────────────────────────────────

function MuniTab({ month, months, onMonthChange, authFetch, user }) {
  const [data, setData]     = useState(null)
  const [loading, setLoad]  = useState(false)
  const [munis, setMunis]   = useState([])
  const [selMuni, setSelMuni] = useState('')

  const isManager = user?.role === 'manager'

  useEffect(() => {
    if (isManager) return
    authFetch('/api/vdi/municipalities').then(r => r?.json()).then(j => {
      if (j?.municipalities) setMunis(j.municipalities)
    })
  }, [authFetch, isManager])

  const load = useCallback(async () => {
    const muni = isManager ? '' : selMuni
    if (!month || (!isManager && !muni)) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muni && { municipality: muni }) })
      const res = await authFetch(`/api/vdi/dashboard/municipality?${qs}`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data)
      }
    } finally { setLoad(false) }
  }, [month, selMuni, isManager, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">لوحة البلدية</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        {!isManager && munis.length > 0 && (
          <div className="relative">
            <select
              value={selMuni}
              onChange={e => setSelMuni(e.target.value)}
              className="appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 pr-8 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">اختر البلدية</option>
              {munis.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <ChevronDown size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && !data && (
        <Empty msg="اختر بلدية وشهراً لعرض المؤشرات." />
      )}
      {!loading && data && (() => {
        const { current, previous, trend } = data
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="مؤشر التشوه البصري (VDI)" value={current.vdi} unit="وحدة / م²" prev={previous?.vdi} color="blue" />
              <KPICard label="إجمالي الوحدات" value={current.total_units} prev={previous?.total_units} color="amber" />
              <KPICard label="المساحة المغطاة" value={current.covered_area} unit="م²" prev={previous?.covered_area} color="green" />
              <KPICard label="نسبة المساهمة في الأمانة" value={`${parseFloat(current.contribution_pct).toFixed(1)}%`} prev={previous ? `${parseFloat(previous.contribution_pct).toFixed(1)}%` : null} color="purple" />
            </div>

            {trend.length > 1 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-4">
                  اتجاه VDI — {current.municipality_name}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="vdi" name="VDI" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 4 }} />
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

// ─── Top Municipalities Tab ───────────────────────────────────────────────────

function TopMunisTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]   = useState([])
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/vdi/top/municipalities?month=${month}&limit=5`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data || [])
      }
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  const chartData = data.map((d, i) => ({
    name: d.municipality_name,
    'المساهمة %': parseFloat(d.contribution_pct).toFixed(2),
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">أعلى 5 بلديات مساهمةً — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">المساهمة في وحدات الأمانة</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} unit="%" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="المساهمة %" radius={[0,4,4,0]}>
                  {chartData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">التوزيع النسبي</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data} dataKey="total_units" nameKey="municipality_name"
                  cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(1)}%`
                  } labelLine={false}
                >
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [fmt(v), 'الوحدات']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
              <tr>
                {['الترتيب','البلدية','البلاغات','الوحدات','المساحة المغطاة','VDI','المساهمة %'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300 dark:bg-gray-700'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{row.municipality_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{fmt(row.report_count, 0)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{fmt(row.total_units)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{fmt(row.covered_area)} م²</td>
                  <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">{fmt(row.vdi, 4)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(row.contribution_pct), 100)}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-xs font-medium text-slate-700 dark:text-gray-300">{pct(row.contribution_pct)}</span>
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

// ─── Top Elements Tab ─────────────────────────────────────────────────────────

function TopElemsTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]    = useState([])
  const [loading, setLoad] = useState(false)

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const res = await authFetch(`/api/vdi/top/elements?month=${month}&limit=5`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data || [])
      }
    } finally { setLoad(false) }
  }, [month, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">أعلى 5 عناصر تشوه — {month}</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
      </div>

      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-gray-400 mb-4">تأثير العناصر على مؤشر التشوه</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.map((d, i) => ({
                name: d.element_name.length > 18 ? d.element_name.substring(0, 18) + '...' : d.element_name,
                fullName: d.element_name,
                'الوحدات': parseFloat(d.total_units),
                fill: COLORS[i % COLORS.length],
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const item = data.find(d => d.element_name.startsWith(label.replace('...', '')))
                  return (
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm text-white">
                      <p className="text-gray-400 mb-1">{item?.element_name || label}</p>
                      {payload.map((p, i) => (
                        <p key={i} style={{ color: p.fill }} className="font-medium">{p.name}: {fmt(p.value)}</p>
                      ))}
                    </div>
                  )
                }} />
                <Bar dataKey="الوحدات" radius={[4,4,0,0]}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
                <tr>
                  {['الترتيب','العنصر','البلاغات','الوحدات','المساهمة %'].map(h => (
                    <th key={h} className="px-4 py-3 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold text-white`}
                        style={{ background: COLORS[i % COLORS.length] }}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{row.element_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{fmt(row.report_count, 0)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{fmt(row.total_units)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(parseFloat(row.contribution_pct), 100)}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                        <span className="text-xs font-medium">{pct(row.contribution_pct)}</span>
                      </div>
                    </td>
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
  const [data, setData]      = useState([])
  const [loading, setLoad]   = useState(false)
  const [muniFilter, setFilt] = useState('')

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muniFilter && { municipality: muniFilter }) })
      const res = await authFetch(`/api/vdi/analytics/reports-vs-units?${qs}`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data || [])
      }
    } finally { setLoad(false) }
  }, [month, muniFilter, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">بلاغات ووحدات لكل عنصر</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        <input
          type="text" placeholder="فلتر بلدية..." value={muniFilter}
          onChange={e => setFilt(e.target.value)}
          className="border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
        />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات." />}
      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
              <tr>
                {['البلدية','العنصر','عدد البلاغات','إجمالي الوحدات','متوسط الوحدات / بلاغ'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-gray-200">{row.municipality_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{row.element_name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{fmt(row.report_count, 0)}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-medium text-blue-600 dark:text-blue-400">{fmt(row.total_units)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(row.avg_units_per_report, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Priority Zones Tab ───────────────────────────────────────────────────────

function ZonesTab({ month, months, onMonthChange, authFetch }) {
  const [data, setData]       = useState([])
  const [loading, setLoad]    = useState(false)
  const [muniFilter, setFilt] = useState('')

  const load = useCallback(async () => {
    if (!month) return
    setLoad(true)
    try {
      const qs  = new URLSearchParams({ month, ...(muniFilter && { municipality: muniFilter }) })
      const res = await authFetch(`/api/vdi/analytics/zones?${qs}`)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data || [])
      }
    } finally { setLoad(false) }
  }, [month, muniFilter, authFetch])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">تحليل مناطق الأولوية</h2>
        <MonthSelect months={months} value={month} onChange={onMonthChange} />
        <input
          type="text" placeholder="فلتر بلدية..." value={muniFilter}
          onChange={e => setFilt(e.target.value)}
          className="border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
        />
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 text-slate-500">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && !data.length && <Empty msg="لا توجد بيانات مناطق أولوية." />}
      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
              <tr>
                {['البلدية','المنطقة','البلاغات','الوحدات','المساحة المغطاة','VDI','المساهمة في البلدية'].map(h => (
                  <th key={h} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-gray-200">{row.municipality_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-gray-300">{row.priority_zone_name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{fmt(row.report_count, 0)}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-medium">{fmt(row.total_units)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-500">{fmt(row.covered_area)} م²</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-blue-600 dark:text-blue-400">{fmt(row.vdi, 4)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(parseFloat(row.contribution_pct), 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium">{pct(row.contribution_pct)}</span>
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

// ─── Upload Tab ───────────────────────────────────────────────────────────────

function UploadTab({ authFetch, user, onUploaded }) {
  const [obsFile,  setObsFile]  = useState(null)
  const [covFile,  setCovFile]  = useState(null)
  const [month,    setMonth]    = useState('')
  const [replace,  setReplace]  = useState(false)
  const [status,   setStatus]   = useState({})   // { obs: {state, msg}, cov: {state, msg} }
  const [history,  setHistory]  = useState([])
  const obsRef = useRef(); const covRef = useRef()

  useEffect(() => {
    authFetch('/api/vdi/uploads/history').then(r => r?.json()).then(j => {
      if (j?.data) setHistory(j.data)
    })
  }, [authFetch])

  async function doUpload(type) {
    const file = type === 'obs' ? obsFile : covFile
    if (!file || !month) return
    setStatus(s => ({ ...s, [type]: { state: 'loading', msg: 'جاري الرفع...' } }))

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('month', month)
      if (replace) form.append('replace', 'true')

      const endpoint = type === 'obs' ? '/upload/observations' : '/upload/coverage'
      const res = await fetch(`${API}/api/vdi${endpoint}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body:    form,
      })
      const json = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setStatus(s => ({ ...s, [type]: { state: 'conflict', msg: json.error, month: json.month } }))
        } else {
          setStatus(s => ({ ...s, [type]: { state: 'error', msg: json.error || 'خطأ في الرفع' } }))
        }
        return
      }

      setStatus(s => ({ ...s, [type]: {
        state: 'success',
        msg: `تم رفع ${json.rowCount} صف بنجاح${json.kpiCalculated ? ' • تم حساب المؤشرات' : ' • في انتظار ملف التغطية'}`,
      }}))

      if (type === 'obs') { setObsFile(null); if (obsRef.current) obsRef.current.value = '' }
      else               { setCovFile(null); if (covRef.current) covRef.current.value = '' }

      // Refresh history
      authFetch('/api/vdi/uploads/history').then(r => r?.json()).then(j => {
        if (j?.data) setHistory(j.data)
      })
      if (json.kpiCalculated) onUploaded?.()
    } catch (err) {
      setStatus(s => ({ ...s, [type]: { state: 'error', msg: err.message } }))
    }
  }

  function forceReplace(type) {
    setReplace(true)
    setTimeout(() => doUpload(type), 50)
  }

  const UploadCard = ({ type, label, hint, file, setFile, fileRef }) => {
    const st = status[type]
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-white">{label}</h3>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{hint}</p>
        </div>

        <label className={`block w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          file ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-gray-700 hover:border-blue-300'
        }`}>
          <Upload size={24} className={`mx-auto mb-2 ${file ? 'text-blue-500' : 'text-slate-400'}`} />
          {file
            ? <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{file.name}</p>
            : <p className="text-sm text-slate-500">اسحب ملف Excel هنا أو انقر للاختيار</p>
          }
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => setFile(e.target.files[0] || null)} />
        </label>

        {st && (
          <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            st.state === 'success'  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' :
            st.state === 'error'    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
            st.state === 'conflict' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' :
                                      'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
          }`}>
            {st.state === 'success'  && <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />}
            {st.state === 'error'    && <XCircle      size={16} className="flex-shrink-0 mt-0.5" />}
            {st.state === 'conflict' && <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
            {st.state === 'loading'  && <RefreshCw    size={16} className="flex-shrink-0 mt-0.5 animate-spin" />}
            <div>
              <p>{st.msg}</p>
              {st.state === 'conflict' && (
                <button onClick={() => forceReplace(type)}
                  className="mt-2 text-xs underline font-semibold">
                  استبدال البيانات الموجودة
                </button>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => doUpload(type)}
          disabled={!file || !month || status[type]?.state === 'loading'}
          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {status[type]?.state === 'loading' ? 'جاري الرفع...' : `رفع ${label}`}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">رفع البيانات الشهرية</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 dark:text-gray-400 font-medium">الشهر:</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value.substring(0, 7))}
            className="border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {!month && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle size={16} /> اختر الشهر أولاً قبل رفع الملفات.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UploadCard
          type="obs" label="بيانات الرصد" fileRef={obsRef} file={obsFile} setFile={setObsFile}
          hint="Excel يحتوي: الشهر · البلدية · المنطقة · العنصر · الوحدات · ClusterId"
        />
        <UploadCard
          type="cov" label="بيانات التغطية" fileRef={covRef} file={covFile} setFile={setCovFile}
          hint="Excel يحتوي: الشهر · البلدية · المنطقة · مساحة المنطقة · المساحة المغطاة · نسبة التغطية"
        />
      </div>

      {/* Upload history */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300">سجل الرفع</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-gray-500">
                <tr>
                  {['الشهر','النوع','الصفوف','الحالة','المستخدم','التاريخ'].map(h => (
                    <th key={h} className="px-4 py-2 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-gray-800">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2 font-medium tabular-nums">{h.month}</td>
                    <td className="px-4 py-2">{h.upload_type === 'observations' ? 'رصد' : 'تغطية'}</td>
                    <td className="px-4 py-2 tabular-nums">{h.row_count ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        h.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                        h.status === 'failed'    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                                   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      }`}>
                        {h.status === 'completed' ? 'مكتمل' : h.status === 'failed' ? 'فشل' : 'معالجة'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{h.uploaded_by_name || '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-400">
                      {new Date(h.created_at).toLocaleDateString('ar-SA')}
                    </td>
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

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  )
}

function Empty({ msg }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-gray-600">
      <BarChart2 size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

// ─── Main VDI Page ────────────────────────────────────────────────────────────

export default function VDI() {
  const { user, authFetch } = useAuth()
  const [activeTab, setActive] = useState(() => {
    if (['admin', 'executive', 'auditor'].includes(user?.role)) return 'amanah'
    return 'muni'
  })
  const [months,   setMonths]   = useState([])
  const [month,    setMonth]    = useState('')
  const [loadingM, setLoadingM] = useState(true)

  const loadMonths = useCallback(async () => {
    setLoadingM(true)
    try {
      const res  = await authFetch('/api/vdi/months')
      const json = await res?.json()
      const list = json?.months || []
      setMonths(list)
      if (list.length && !month) setMonth(list[0])
    } finally { setLoadingM(false) }
  }, [authFetch, month])

  useEffect(() => { loadMonths() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTabs = TABS.filter(t => !t.roles || t.roles.includes(user?.role))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
            <Activity size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">مؤشر التشوه البصري — VDI</h1>
            <p className="text-xs text-slate-400 dark:text-gray-500">محرك KPI الشهري · أمانة الباحة</p>
          </div>
        </div>
        {loadingM && (
          <div className="text-xs text-blue-500 flex items-center gap-1 mt-2">
            <Clock size={12} className="animate-spin" /> جاري تحميل الأشهر المتاحة...
          </div>
        )}
        {!loadingM && months.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 w-fit">
            <AlertTriangle size={14} /> لا توجد بيانات بعد — ابدأ برفع ملف الرصد والتغطية من تبويب "رفع البيانات"
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 p-1.5 overflow-x-auto">
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-transparent">
        {activeTab === 'amanah' && (
          <AmanahTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />
        )}
        {activeTab === 'muni' && (
          <MuniTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} user={user} />
        )}
        {activeTab === 'top-munis' && (
          <TopMunisTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />
        )}
        {activeTab === 'top-elems' && (
          <TopElemsTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />
        )}
        {activeTab === 'rv-units' && (
          <RVUnitsTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />
        )}
        {activeTab === 'zones' && (
          <ZonesTab month={month} months={months} onMonthChange={setMonth} authFetch={authFetch} />
        )}
        {activeTab === 'upload' && (
          <UploadTab authFetch={authFetch} user={user} onUploaded={loadMonths} />
        )}
      </div>
    </div>
  )
}
