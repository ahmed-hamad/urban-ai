import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts'
import { useData } from '@/context/DataContext'
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm shadow-xl">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {p.value?.toLocaleString('ar-SA')} ريال
        </p>
      ))}
    </div>
  )
}

function fmt(n) { return n.toLocaleString('ar-SA') }
function fmtM(n) { return `${(n / 1000000).toFixed(2)}م` }

export default function Financial() {
  const { reports } = useData()
  const [scenario, setScenario] = useState('base')

  // Only fine_issued cases contribute to financial projections
  const fineReports = useMemo(
    () => reports.filter(r => r.closureType === 'fine_issued'),
    [reports]
  )

  const totalFines = useMemo(
    () => fineReports.reduce((s, r) => s + (r.estimatedFine || 0), 0),
    [fineReports]
  )

  // Group by element
  const byElement = useMemo(() => {
    const map = {}
    fineReports.forEach(r => {
      const key = r.elementName || r.element || 'أخرى'
      if (!map[key]) map[key] = { element: key, color: r.elementColor || '#3B82F6', violations: 0, baseTotal: 0, recurrenceTotal: 0 }
      map[key].violations++
      map[key].baseTotal += r.estimatedFine || 0
      map[key].recurrenceTotal += (r.estimatedFine || 0) * 2
    })
    return Object.values(map).sort((a, b) => b.baseTotal - a.baseTotal)
  }, [fineReports])

  // Last 6 months of actual collected fines (by closure date = updatedAt)
  const monthlyData = useMemo(() => {
    const months = [...Array(6)].map((_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (5 - i))
      return { label: d.toLocaleString('ar-SA', { month: 'short' }), y: d.getFullYear(), m: d.getMonth() }
    })
    return months.map(({ label, y, m }) => {
      const base = fineReports
        .filter(r => { const d = new Date(r.updatedAt); return d.getFullYear() === y && d.getMonth() === m })
        .reduce((s, r) => s + (r.estimatedFine || 0), 0)
      return { month: label, base, recurrence: base * 2 }
    })
  }, [fineReports])

  const totalBase = byElement.reduce((s, e) => s + e.baseTotal, 0)
  const totalRecurrence = byElement.reduce((s, e) => s + e.recurrenceTotal, 0)
  const avgFine = fineReports.length > 0 ? Math.round(totalFines / fineReports.length) : 0

  // Month-over-month trend
  const lastTwo = monthlyData.slice(-2)
  const trend = lastTwo.length === 2 && lastTwo[0].base > 0
    ? Math.round(((lastTwo[1].base - lastTwo[0].base) / lastTwo[0].base) * 100)
    : null

  if (fineReports.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">التوقع المالي</h1>
          <p className="text-gray-500 text-sm mt-1">بيانات الغرامات المحصّلة من البلاغات المُنجزة</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-4">
          <AlertCircle size={40} className="text-gray-600" />
          <p className="text-gray-400 font-medium">لا توجد بلاغات مغلقة بغرامة بعد</p>
          <p className="text-gray-600 text-sm text-center max-w-md">
            تظهر البيانات المالية فقط عند إغلاق بلاغات بنوع إجراء "تحرير مخالفة مالية". أغلق بلاغات من نوع هذا لتفعيل لوحة التحليل المالي.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">التوقع المالي</h1>
          <p className="text-gray-500 text-sm mt-1">
            مبني على {fineReports.length} بلاغ مُغلق بغرامة فعلية · بيانات حية من النظام
          </p>
        </div>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {[
            { k: 'base', label: 'الأساسي' },
            { k: 'recurrence', label: 'التكرار' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setScenario(k)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${scenario === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: '📋', label: 'مخالفات صدرت بغرامة', value: fmt(fineReports.length),
            sub: `من إجمالي ${reports.length} بلاغ`, color: 'bg-blue-500/10',
          },
          {
            icon: '💰', label: 'إجمالي الغرامات المحصّلة', value: `${fmtM(totalFines)} ريال`,
            sub: 'غرامات فعلية مؤكدة', color: 'bg-emerald-500/10',
            trend: trend !== null ? (trend >= 0 ? `+${trend}%` : `${trend}%`) : null,
            up: trend !== null ? trend >= 0 : null,
          },
          {
            icon: '🔁', label: 'سيناريو التكرار الكامل', value: `${fmtM(totalRecurrence)} ريال`,
            sub: 'بتضعيف الغرامة عند التكرار', color: 'bg-amber-500/10',
          },
          {
            icon: '📊', label: 'متوسط الغرامة لكل بلاغ', value: `${fmt(avgFine)} ريال`,
            sub: 'بناءً على البلاغات المُغلقة', color: 'bg-violet-500/10',
          },
        ].map((card, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all">
            <div className={`w-11 h-11 ${card.color} rounded-xl flex items-center justify-center text-xl mb-4`}>
              {card.icon}
            </div>
            <div className="text-2xl font-black text-white mb-1">{card.value}</div>
            <div className="text-sm text-gray-500">{card.label}</div>
            {card.sub && <div className="text-xs text-gray-600 mt-1">{card.sub}</div>}
            {card.trend !== undefined && card.trend !== null && (
              <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium ${card.up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {card.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {card.trend}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-white">الغرامات الشهرية — آخر 6 أشهر</h2>
            <p className="text-xs text-gray-500 mt-0.5">مبني على تواريخ إغلاق البلاغات الفعلية</p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-3 h-0.5 bg-emerald-500 rounded" />الغرامة الأساسية
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-3 h-0.5 bg-amber-500 rounded" />سيناريو التكرار
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="base" stroke="#10B981" strokeWidth={2.5}
              dot={{ r: 4, fill: '#10B981' }} name="الأساسي" />
            <Line type="monotone" dataKey="recurrence" stroke="#F59E0B" strokeWidth={2.5}
              dot={{ r: 4, fill: '#F59E0B' }} name="التكرار" strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* By element */}
      {byElement.length > 0 && (
        <div className="grid grid-cols-12 gap-5">
          {/* Bar chart */}
          <div className="col-span-12 lg:col-span-7 bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="mb-5">
              <h2 className="font-bold text-white">الغرامات حسب نوع العنصر</h2>
              <p className="text-xs text-gray-500 mt-0.5">المبالغ الفعلية من بلاغات تحرير المخالفة</p>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, byElement.length * 44)}>
              <BarChart data={byElement} layout="vertical" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="element" tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  axisLine={false} tickLine={false} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="baseTotal" fill="#10B981" name="الأساسي" radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="recurrenceTotal" fill="#F59E0B" name="التكرار" radius={[0, 4, 4, 0]} maxBarSize={14} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="col-span-12 lg:col-span-5 bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="font-bold text-white mb-4">تفاصيل الغرامات</h2>
            <div className="space-y-3 max-h-[340px] overflow-y-auto">
              {byElement.map((e, i) => {
                const pct = totalBase > 0 ? Math.round((e.baseTotal / totalBase) * 100) : 0
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                        <span className="text-xs text-gray-300 font-medium">{e.element}</span>
                        <span className="text-xs text-gray-600">({e.violations})</span>
                      </div>
                      <span className="text-xs font-bold text-amber-400">{fmt(e.baseTotal)}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-l from-amber-500 to-amber-600"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-600">{pct}% من الإجمالي</span>
                      <span className="text-xs text-red-400">تكرار: {fmt(e.recurrenceTotal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white">الإجمالي الأساسي</span>
                <span className="text-lg font-black text-emerald-400">{fmt(totalBase)} ريال</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white">إجمالي التكرار</span>
                <span className="text-lg font-black text-amber-400">{fmt(totalRecurrence)} ريال</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenarios */}
      <div className="bg-gradient-to-l from-amber-900/20 via-gray-900 to-emerald-900/20 border border-amber-500/20 rounded-2xl p-5">
        <h2 className="font-bold text-white mb-5">سيناريوهات التحصيل المالي</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'السيناريو الأساسي', desc: 'إجمالي الغرامات المحصّلة فعلياً', value: totalBase, color: 'emerald', icon: '✅' },
            { label: 'سيناريو التكرار (50%)', desc: '50% من المخالفين يكررون المخالفة', value: Math.round(totalBase * 1.5), color: 'amber', icon: '⚠️' },
            { label: 'سيناريو التكرار الكامل', desc: 'جميع المخالفين يكررون والغرامة تتضاعف', value: totalRecurrence, color: 'red', icon: '🔴' },
          ].map((s, i) => (
            <div key={i} className={`bg-gray-800/50 border border-${s.color}-500/20 rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{s.icon}</span>
                <div>
                  <p className={`text-sm font-bold text-${s.color}-300`}>{s.label}</p>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                </div>
              </div>
              <div className={`text-2xl font-black text-${s.color}-400`}>{fmtM(s.value)}م</div>
              <div className="text-xs text-gray-500 mt-1">{fmt(s.value)} ريال</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-4 text-center">
          * البيانات مستخرجة فقط من البلاغات المغلقة بنوع إجراء "تحرير مخالفة مالية" — لا تُستخدم بيانات افتراضية
        </p>
      </div>
    </div>
  )
}
