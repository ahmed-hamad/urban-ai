import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, LineChart, Line, PieChart, Pie,
} from 'recharts'
import {
  Bot, FileText, TrendingUp, TrendingDown, Minus,
  ChevronRight, ChevronLeft, Send, Layers, Plus, Lock,
  Loader2, Map, Zap, Copy, Check,
} from 'lucide-react'
import { statusConfig } from '@/data/mockData'
import { OPEN_STATUSES } from '@/data/caseConfig'
import { useReportScope } from '@/hooks/useReportScope'
import { useApiReports, normalizeApiReport } from '@/hooks/useApiReports'
import { useAuth } from '@/context/AuthContext'
import { useMapContext } from '@/context/MapContext'
import { useChatSession } from '@/hooks/useChatSession'

// ─── helpers ────────────────────────────────────────────────────────────────
const createIcon = (color) => L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  className: '', iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8],
})

const statusLabels = {
  new: 'جديد', reviewing: 'قيد التدقيق', assigned: 'مُسند',
  in_progress: 'قيد المعالجة', closed: 'مغلق', rejected: 'مرفوض',
}

// ─── Dashboard AI suggestions ─────────────────────────────────────────────────
const AI_SUGGESTIONS = [
  'ما ملخص البلاغات لهذا الشهر؟',
  'اعرض بلاغات حفريات الشوارع على الخريطة',
  'قارن أداء المراقبين هذا الربع',
  'اعرض خريطة كثافة البلاغات',
]

// ─── Viewport controller (inside MapContainer) ───────────────────────────────
function FitBoundsController({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    map.fitBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]], { padding: [30, 30], animate: true })
  }, [bounds, map])
  return null
}

// Derives the same stats shape as DataContext but from an arbitrary reports slice
function computeStats(reports) {
  const isClosed = r => r.status === 'closed_final'
  const isOpen = r => OPEN_STATUSES.has(r.status)
  return {
    totalReports: reports.length,
    openReports: reports.filter(isOpen).length,
    closedReports: reports.filter(isClosed).length,
    newReports: reports.filter(r => r.status === 'submitted').length,
    aiDetected: reports.filter(r => r.source === 'ai').length,
    totalFineEstimate: reports.reduce((s, r) => s + (r.estimatedFine || 0), 0),
    avgCloseTime: (() => {
      const closed = reports.filter(isClosed)
      if (!closed.length) return 0
      return Math.round(closed.reduce((s, r) =>
        s + (new Date(r.updatedAt) - new Date(r.createdAt)) / 86400000, 0) / closed.length)
    })(),
    byElement: Object.values(reports.reduce((acc, r) => {
      if (!r.element) return acc
      if (!acc[r.element]) acc[r.element] = { id: r.element, name: r.elementName || r.element, color: r.elementColor || '#3B82F6', count: 0, fine: 0 }
      acc[r.element].count++
      acc[r.element].fine += r.estimatedFine || 0
      return acc
    }, {})).sort((a, b) => b.count - a.count),
    byDistrict: Object.entries(reports.reduce((acc, r) => {
      if (r.district) acc[r.district] = (acc[r.district] || 0) + 1
      return acc
    }, {})).map(([district, count]) => ({ district, count })).sort((a, b) => b.count - a.count),
    byStatus: Object.entries(reports.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {})).map(([status, count]) => ({ status, count })),
    byEntity: Object.entries(reports.reduce((acc, r) => {
      if (r.entity) {
        if (!acc[r.entity]) acc[r.entity] = { total: 0, closed: 0 }
        acc[r.entity].total++
        if (isClosed(r)) acc[r.entity].closed++
      }
      return acc
    }, {})).map(([dept, { total, closed }]) => ({
      dept, rate: total ? Math.round((closed / total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate),
    monthlyReports: (() => {
      const months = [...Array(6)].map((_, i) => {
        const d = new Date()
        d.setMonth(d.getMonth() - (5 - i))
        return { month: d.toLocaleString('ar-SA', { month: 'short' }), y: d.getFullYear(), m: d.getMonth() }
      })
      return months.map(({ month, y, m }) => ({
        month,
        reports: reports.filter(r => { const d = new Date(r.createdAt); return d.getFullYear() === y && d.getMonth() === m }).length,
        closed:  reports.filter(r => { const d = new Date(r.createdAt); return isClosed(r) && d.getFullYear() === y && d.getMonth() === m }).length,
      }))
    })(),
  }
}

const Tip = ({ active, payload, label }) => active && payload?.length ? (
  <div className="bg-gray-800 text-white rounded-lg p-2.5 text-xs shadow-xl">
    <p className="text-gray-400 mb-1">{label || payload[0]?.name}</p>
    {payload.map((p, i) => <p key={i} style={{ color: p.fill || p.color }} className="font-semibold">{p.value?.toLocaleString('ar-SA')}</p>)}
  </div>
) : null

// ─── AI Panel (unified — calls backend /api/assistant/query) ─────────────────
const DASHBOARD_AI_WELCOME = {
  role: 'assistant',
  text: 'مرحباً! أنا المساعد المكاني الذكي.\nأقرأ بيانات حقيقية من قاعدة البيانات وأتحكم في خريطة لوحة التحكم مباشرة.',
}

function AIPanel() {
  const { authFetch } = useAuth()
  const { applyMapCommand } = useMapContext()

  const [msgs, setMsgs, clearMsgs, historyRef] = useChatSession('dashboard', DASHBOARD_AI_WELCOME)
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [copiedKey, setCopiedKey] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = useCallback(async (text) => {
    const q = (text || input).trim()
    if (!q || loading) return

    setMsgs(p => [...p, { role: 'user', text: q }])
    setInput('')
    setLoading(true)

    const history = historyRef.current.slice(-6).map(m => ({
      role:    m.role,
      content: m.text,
    }))

    try {
      const res = await authFetch('/api/assistant/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: q, history }),
      })

      if (!res?.ok) {
        const d = await res?.json().catch(() => ({}))
        throw new Error(d?.error || `خطأ (${res?.status})`)
      }

      const data = await res.json()

      if (data.mapCommand) applyMapCommand(data.mapCommand)

      setMsgs(p => [...p, {
        role: 'assistant', text: data.text || '',
        chart: data.chart, kpis: data.kpis,
        table: data.table, mapCommand: data.mapCommand,
      }])

      historyRef.current = [
        ...historyRef.current,
        { role: 'user',      text: q },
        { role: 'assistant', text: data.text || '' },
      ].slice(-12)

    } catch (err) {
      setMsgs(p => [...p, { role: 'assistant', text: `⚠️ ${err.message}` }])
    }
    setLoading(false)
  }, [input, loading, authFetch, applyMapCommand])

  const copyData = useCallback((key, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }, [])

  const renderText = (text) => {
    if (!text) return null

    const segments = []
    let textLines = []
    for (const line of text.split('\n')) {
      if (line.trim().startsWith('|')) {
        if (textLines.length) { segments.push({ type: 'text', lines: textLines }); textLines = [] }
        const prev = segments[segments.length - 1]
        if (prev?.type === 'table') prev.lines.push(line.trim())
        else segments.push({ type: 'table', lines: [line.trim()] })
      } else {
        textLines.push(line)
      }
    }
    if (textLines.length) segments.push({ type: 'text', lines: textLines })

    return segments.map((seg, si) => {
      if (seg.type === 'table') {
        const dataRows = seg.lines
          .filter(l => !l.match(/^\|[\s\-:|]+\|$/))
          .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
        if (dataRows.length < 1) return null
        const [headers, ...bodyRows] = dataRows
        return (
          <div key={si} className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700 my-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-gray-700 bg-slate-100 dark:bg-gray-800">
                  {headers.map((h, j) => (
                    <th key={j} className="text-right px-2 py-1.5 text-slate-600 dark:text-gray-300 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, j) => (
                  <tr key={j} className="border-b border-slate-100 dark:border-gray-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-gray-800/50">
                    {row.map((cell, k) => (
                      <td key={k} className="px-2 py-1.5 text-slate-600 dark:text-gray-300 whitespace-nowrap">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      return seg.lines.map((line, i) => {
        const key = `${si}-${i}`
        if (!line.trim()) return <br key={key} />
        if (line.match(/^#{1,3}\s/))
          return <p key={key} className="text-xs font-semibold text-slate-800 dark:text-white mt-1.5 mb-0.5">{line.replace(/^#{1,3}\s+/, '')}</p>
        if (line.match(/^---+$/))
          return <hr key={key} className="border-slate-200 dark:border-gray-700 my-1" />
        if (line.includes('**')) {
          const parts = line.split(/\*\*(.*?)\*\*/g)
          return (
            <p key={key} className="text-xs leading-relaxed text-slate-600 dark:text-gray-300">
              {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-slate-800 dark:text-white">{p}</strong> : p)}
            </p>
          )
        }
        if (line.startsWith('⚠️') || line.startsWith('ℹ️'))
          return <p key={key} className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">{line}</p>
        return <p key={key} className="text-xs leading-relaxed text-slate-600 dark:text-gray-300">{line}</p>
      })
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Engine badge */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-lg px-2.5 py-1.5">
          <Zap size={10} className="text-blue-500" />
          <span className="text-xs text-blue-600 dark:text-blue-400">Claude Sonnet · PostGIS · RBAC</span>
        </div>
      </div>

      {/* Suggestions */}
      <div className="px-3 pb-2 space-y-1.5 flex-shrink-0">
        {AI_SUGGESTIONS.map((q, i) => (
          <button key={i} onClick={() => send(q)} disabled={loading}
            className="w-full text-right text-xs text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 transition-colors leading-relaxed disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${m.role === 'assistant' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-gray-700'}`}>
              {m.role === 'assistant' ? <Bot size={12} className="text-white" /> : <span className="text-xs text-slate-600 dark:text-white">أ</span>}
            </div>
            <div className={`flex-1 min-w-0 space-y-2 ${m.role === 'user' ? 'items-end flex flex-col' : ''}`}>

              {/* Bubble */}
              <div className={`rounded-xl p-3 ${m.role === 'assistant' ? 'bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700' : 'bg-blue-600'}`}>
                {m.role === 'assistant'
                  ? <div className="space-y-0.5">{renderText(m.text)}</div>
                  : <p className="text-xs text-white">{m.text}</p>}
              </div>

              {/* KPI cards (compact 2-col) */}
              {m.kpis?.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  {m.kpis.map((kpi, j) => {
                    const TIcon = kpi.trendUp === true ? TrendingUp : kpi.trendUp === false ? TrendingDown : Minus
                    const tColor = kpi.trendUp === true ? 'text-emerald-500' : kpi.trendUp === false ? 'text-red-500' : 'text-slate-400'
                    return (
                      <div key={j} className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-2">
                        <p className="text-xs text-slate-400 dark:text-gray-500 leading-tight mb-1 truncate">{kpi.label}</p>
                        <p className="text-sm font-bold text-slate-800 dark:text-white leading-none">
                          {typeof kpi.value === 'number' ? Number(kpi.value).toLocaleString('ar-SA') : kpi.value}
                          {kpi.unit && <span className="text-xs font-normal text-slate-400 mr-0.5">{kpi.unit}</span>}
                        </p>
                        {kpi.trend && (
                          <div className={`flex items-center gap-0.5 mt-1 ${tColor}`}>
                            <TIcon size={9} />
                            <span className="text-xs">{kpi.trend}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Chart (compact height) */}
              {m.chart && (
                <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-3 w-full">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-500 dark:text-gray-400 truncate">{m.chart.title}</p>
                    <button
                      onClick={() => copyData(`${i}-chart`, [m.chart.title, ...m.chart.data.map(d => `${d.name}\t${d.value}`)].join('\n'))}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0 mr-1"
                      title="نسخ البيانات">
                      {copiedKey === `${i}-chart` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} className="text-slate-400 dark:text-gray-500" />}
                    </button>
                  </div>
                  {m.chart.type === 'bar' && (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={m.chart.data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<Tip />} />
                        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                          {m.chart.data.map((d, j) => <Cell key={j} fill={d.fill || '#3B82F6'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  {m.chart.type === 'pie' && (
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={m.chart.data} cx="50%" cy="50%" outerRadius={55} innerRadius={22} dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {m.chart.data.map((d, j) => <Cell key={j} fill={d.fill || d.color || '#3B82F6'} />)}
                        </Pie>
                        <Tooltip content={<Tip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  {m.chart.type === 'line' && (
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={m.chart.data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<Tip />} />
                        <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {/* Data table */}
              {m.table?.columns?.length > 0 && (
                <div className="w-full space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-gray-500">جدول البيانات</span>
                    <button
                      onClick={() => copyData(`${i}-table`, [m.table.columns.join('\t'), ...m.table.rows.map(r => r.join('\t'))].join('\n'))}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
                      title="نسخ الجدول">
                      {copiedKey === `${i}-table` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} className="text-slate-400 dark:text-gray-500" />}
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-gray-700 bg-slate-100 dark:bg-gray-800">
                          {m.table.columns.map((col, j) => (
                            <th key={j} className="text-right px-2 py-1.5 text-slate-500 dark:text-gray-400 font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.table.rows.map((row, j) => (
                          <tr key={j} className="border-b border-slate-100 dark:border-gray-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-gray-800/50">
                            {row.map((cell, k) => (
                              <td key={k} className="px-2 py-1.5 text-slate-600 dark:text-gray-300">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Map button — zooms/filters THIS page's map, no navigation */}
              {m.mapCommand && (
                <button onClick={() => applyMapCommand(m.mapCommand)}
                  className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg px-3 py-1.5 transition-all hover:bg-blue-100 dark:hover:bg-blue-500/20">
                  <Map size={11} />
                  اعرض على الخريطة
                  {m.mapCommand.params?.label && <span className="text-blue-400 dark:text-blue-500">— {m.mapCommand.params.label}</span>}
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Bot size={12} className="text-white" />
            </div>
            <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-1.5">
                <Loader2 size={11} className="text-blue-500 animate-spin" />
                <span className="text-xs text-slate-400 dark:text-gray-500">يستعلم من قاعدة البيانات...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
            placeholder="اسأل عن البلاغات، الخرائط، الأداء..."
            className="flex-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center justify-center transition-colors flex-shrink-0">
            {loading ? <Loader2 size={12} className="text-white animate-spin" /> : <Send size={12} className="text-white" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reports Panel ────────────────────────────────────────────────────────────
function ReportsPanel({ reports, onSelectReport }) {
  if (reports.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-400 dark:text-gray-600 mb-3">{'لا توجد بلاغات بعد'}</p>
        <Link to="/reports/new" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{'إنشاء أول بلاغ'}</Link>
      </div>
    )
  }
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide">{'آخر البلاغات'}</p>
        <Link to="/reports" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{'عرض الكل'}</Link>
      </div>
      {reports.slice(0, 8).map(r => {
        const s = statusConfig[r.status] || statusConfig.new
        return (
          <button key={r.id} onClick={() => onSelectReport(r)}
            className="w-full text-right bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 rounded-lg p-3 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.elementColor || '#3B82F6' }} />
                <p className="text-xs font-medium text-slate-700 dark:text-gray-200 leading-relaxed line-clamp-2">{r.elementName || r.title}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-gray-600">
              <span>{r.district || '—'}</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{(r.estimatedFine || 0).toLocaleString('ar-SA')} ر.س</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Performance Panel ────────────────────────────────────────────────────────
function PerformancePanel({ stats }) {
  return (
    <div className="p-3 space-y-5">
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide mb-3">{'أداء الجهات المسؤولة'}</p>
        {stats.byEntity.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-gray-600 text-center py-4">{'لم يتم إسناد بلاغات لجهات بعد'}</p>
        ) : (
          stats.byEntity.slice(0, 6).map((d, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-600 dark:text-gray-400 truncate">{d.dept}</span>
                <span className="text-xs font-bold text-slate-800 dark:text-white">{d.rate}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1.5">
                <div className="h-1.5 rounded-full" style={{ width: `${d.rate}%`, background: d.rate >= 85 ? '#10B981' : d.rate >= 75 ? '#F59E0B' : '#EF4444' }} />
              </div>
            </div>
          ))
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide mb-3">{'البلاغات الشهرية'}</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats.monthlyReports}>
            <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<Tip />} />
            <Bar dataKey="reports" fill="#3B82F6" name={'جديدة'} radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="closed" fill="#10B981" name={'مغلقة'} radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Financial Panel ──────────────────────────────────────────────────────────
function FinancialPanel({ stats }) {
  const total = stats.totalFineEstimate
  const byEl = stats.byElement.slice(0, 5)
  return (
    <div className="p-3 space-y-4">
      <p className="text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide">{'التوقع المالي'}</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'إجمالي الغرامات', value: `${(total / 1000).toFixed(1)}k ﷼`, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'سيناريو التكرار', value: `${(total * 2 / 1000).toFixed(1)}k ﷼`, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'إجمالي البلاغات', value: stats.totalReports, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'متوسط الغرامة', value: stats.totalReports > 0 ? `${Math.round(total / stats.totalReports).toLocaleString('ar-SA')} ﷼` : '0', color: 'text-slate-700 dark:text-white' },
        ].map((s, i) => (
          <div key={i} className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-3">
            <p className="text-xs text-slate-400 dark:text-gray-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>
      {byEl.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-gray-500 font-medium">{'حسب العنصر'}</p>
          {byEl.map((e, i) => {
            const pct = total > 0 ? Math.round((e.fine / total) * 100) : 0
            return (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 dark:text-gray-400 truncate">{e.name}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{(e.fine / 1000).toFixed(1)}k</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1">
                  <div className="h-1 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Link to="/financial" className="block w-full text-center text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
        {'التقرير المالي الكامل'}
      </Link>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const PANELS = [
  { id: 'reports', label: 'البلاغات', Icon: FileText },
  { id: 'performance', label: 'الأداء', Icon: TrendingUp },
  { id: 'financial', label: 'المالي', Icon: TrendingUp },
  { id: 'ai', label: 'المساعد الذكي', Icon: Bot },
]

export default function Dashboard() {
  const { scopedReports: reports, isRestricted, scopeLabel } = useReportScope()
  const { reports: rawApiReports } = useApiReports()
  const { aiFilters, aiBounds, heatmapPoints, aiMapLabel, clearAiMapState } = useMapContext()

  // Merge local (DataContext) + API-only reports for map — deduplicate by id
  const allMapReports = useMemo(() => {
    const localIds = new Set(reports.map(r => r.id))
    const apiNormalized = rawApiReports
      .map(normalizeApiReport)
      .filter(r => !localIds.has(r.id) && r.coords != null)
    return [...reports, ...apiNormalized]
  }, [reports, rawApiReports])

  // Use merged reports (local + API/DB) for stats so numbers match the AI assistant
  const stats = useMemo(() => computeStats(allMapReports), [allMapReports])
  const [panel, setPanel] = useState('reports')
  const [panelOpen, setPanelOpen] = useState(true)
  const [filterEl, setFilterEl] = useState('all')
  const [showHeat, setShowHeat] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [selectedReport, setSelectedReport] = useState(null)

  // AI filter overrides local dropdown; changing dropdown clears AI override
  const effectiveFilterEl = aiFilters.element || filterEl

  const tiles = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }

  const filtered = allMapReports.filter(r => effectiveFilterEl === 'all' || r.element === effectiveFilterEl)
  const usedElements = stats.byElement

  return (
    <div className="-m-5 flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

      {/* KPI Strip */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 flex-shrink-0 overflow-x-auto">
        {[
          { label: 'إجمالي البلاغات', value: stats.totalReports, color: 'text-slate-800 dark:text-white' },
          { label: 'مفتوحة', value: stats.openReports, color: 'text-red-600 dark:text-red-400' },
          { label: 'مغلقة', value: stats.closedReports, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'رُصد بالذكاء الاصطناعي', value: stats.aiDetected, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'التوقع المالي', value: `${(stats.totalFineEstimate / 1000).toFixed(1)}k ريال`, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'متوسط الإغلاق', value: stats.avgCloseTime > 0 ? `${stats.avgCloseTime} أيام` : '—', color: 'text-slate-700 dark:text-gray-200' },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 flex-shrink-0">
            <div>
              <p className="text-xs text-slate-400 dark:text-gray-500 leading-none mb-1 whitespace-nowrap">{s.label}</p>
              <span className={`text-base font-bold ${s.color}`}>{s.value}</span>
            </div>
          </div>
        ))}
        <div className="flex-1" />
        {isRestricted && (
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-lg px-3 py-2 text-xs font-medium flex-shrink-0">
            <Lock size={11} />
            <span>{scopeLabel}</span>
          </div>
        )}
        <Link to="/reports/new"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0">
          <Plus size={14} />
          {'بلاغ جديد'}
        </Link>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer center={[20.0131, 41.4677]} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
            <TileLayer url={tiles[mapStyle]} attribution="&copy; CartoDB" />

            {/* AI viewport controller */}
            <FitBoundsController bounds={aiBounds} />

            {allMapReports.length > 0 && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={55} showCoverageOnHover={false}>
                {filtered.map(r => (
                  <Marker key={r.id} position={r.coords || [20.0131, 41.4677]}
                    icon={createIcon(r.elementColor || '#3B82F6')}
                    eventHandlers={{ click: () => { setSelectedReport(r); setPanelOpen(true) } }}>
                    <Popup>
                      <div style={{ fontFamily: 'Tajawal,sans-serif', direction: 'rtl', minWidth: '180px' }}>
                        <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 3px', fontFamily: 'monospace' }}>{r.id}</p>
                        <p style={{ fontSize: '12px', fontWeight: '600', margin: '0 0 4px', color: '#1e293b' }}>{r.elementName || r.title}</p>
                        <p style={{ fontSize: '11px', fontWeight: '700', color: '#d97706', margin: '0' }}>{(r.estimatedFine || 0).toLocaleString('ar-SA')} {'ريال'}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* Manual heat layer */}
            {showHeat && filtered.map(r => (
              <Circle key={`h-${r.id}`} center={r.coords || [20.0131, 41.4677]} radius={700}
                pathOptions={{ fillColor: r.elementColor || '#3B82F6', fillOpacity: 0.07, color: r.elementColor || '#3B82F6', weight: 1, opacity: 0.2 }} />
            ))}

            {/* AI-driven heatmap points */}
            {heatmapPoints?.map((pt, i) => (
              <Circle key={`ai-${i}`} center={[pt.lat, pt.lng]} radius={600}
                pathOptions={{ fillColor: '#EF4444', fillOpacity: 0.12, color: '#EF4444', weight: 0.5, opacity: 0.3 }} />
            ))}
          </MapContainer>

          {/* Map top controls */}
          <div className="absolute top-3 right-3 z-[500] flex flex-col gap-2">
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-1.5 shadow-lg space-y-1">
              {[['dark', 'داكن'], ['light', 'فاتح'], ['satellite', 'صور']].map(([k, v]) => (
                <button key={k} onClick={() => setMapStyle(k)}
                  className={`block w-full text-right px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${mapStyle === k ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800'}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => setShowHeat(!showHeat)}
              className={`bg-white dark:bg-gray-900 border rounded-xl p-2.5 shadow-lg transition-colors ${showHeat ? 'border-red-300 dark:border-red-500/50 text-red-600 dark:text-red-400' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400'}`}>
              <Layers size={15} />
            </button>
          </div>

          {/* Filter overlay + AI badge */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2">
            <select
              value={effectiveFilterEl}
              onChange={e => { setFilterEl(e.target.value); if (aiFilters.element) clearAiMapState() }}
              className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-gray-200 shadow-lg focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="all">{'كل العناصر'}</option>
              {usedElements.map(e => <option key={e.id} value={e.id}>{e.name} ({e.count})</option>)}
            </select>
            {(aiMapLabel || aiFilters.element || heatmapPoints?.length > 0) && (
              <button onClick={clearAiMapState}
                className="flex items-center gap-1.5 bg-indigo-600/90 hover:bg-indigo-700/90 text-white text-xs rounded-xl px-2.5 py-2 shadow-lg backdrop-blur-sm transition-colors">
                <Bot size={11} />
                <span>{aiMapLabel || 'AI'}</span>
                <span className="opacity-60">×</span>
              </button>
            )}
          </div>

          {/* Map stats overlay */}
          <div className="absolute bottom-4 right-3 z-[500] flex flex-col gap-1.5">
            {[['الكل', filtered.length, 'text-slate-800 dark:text-white'],
              ['مفتوح', filtered.filter(r => !['closed', 'rejected'].includes(r.status)).length, 'text-amber-600 dark:text-amber-400'],
              ['مغلق', filtered.filter(r => r.status === 'closed').length, 'text-emerald-600 dark:text-emerald-400'],
            ].map(([l, v, c]) => (
              <div key={l} className="bg-white/90 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-center shadow backdrop-blur-sm">
                <div className={`text-sm font-bold ${c}`}>{v}</div>
                <div className="text-xs text-slate-400 dark:text-gray-500">{l}</div>
              </div>
            ))}
          </div>

          {/* Empty map message */}
          {reports.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-[400] pointer-events-none">
              <div className="bg-white/90 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-700 rounded-xl p-6 text-center shadow-xl pointer-events-auto">
                <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">{'لا توجد بلاغات على الخريطة'}</p>
                <Link to="/reports/new" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{'إضافة أول بلاغ'}</Link>
              </div>
            </div>
          )}

          {/* Selected report card */}
          {selectedReport && !panelOpen && (
            <div className="absolute bottom-4 left-4 z-[500] w-72 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-4 shadow-xl">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{selectedReport.id}</span>
                <button onClick={() => setSelectedReport(null)} className="text-slate-400 text-xs">{'✕'}</button>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white mb-1 leading-relaxed">{selectedReport.elementName || selectedReport.title}</p>
              <p className="text-xs text-slate-500 dark:text-gray-500 mb-3">{selectedReport.district}</p>
              <Link to={`/reports/${selectedReport.id}`} className="block text-center bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg text-xs font-medium transition-colors">{'عرض التفاصيل'}</Link>
            </div>
          )}
        </div>

        {/* Right Panel */}
        {panelOpen ? (
          <div className="w-[360px] flex-shrink-0 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800 flex flex-col">
            <div className="flex border-b border-slate-200 dark:border-gray-800 flex-shrink-0">
              {PANELS.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setPanel(id)}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium border-b-2 transition-all ${panel === id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300'}`}>
                  <Icon size={13} />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
              <button onClick={() => setPanelOpen(false)} className="px-3 text-slate-400 hover:text-slate-600 dark:hover:text-white border-b-2 border-transparent transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {panel === 'reports' && <ReportsPanel reports={reports} onSelectReport={r => setSelectedReport(r)} />}
              {panel === 'performance' && <PerformancePanel stats={stats} />}
              {panel === 'financial' && <FinancialPanel stats={stats} />}
              {panel === 'ai' && <AIPanel />}
            </div>
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)}
            className="flex-shrink-0 w-9 bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft size={14} className="text-slate-400" />
            <span className="text-xs text-slate-400" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>{'اللوحة'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
