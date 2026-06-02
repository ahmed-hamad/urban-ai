import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { useMapContext } from '@/context/MapContext'
import { useChatSession } from '@/hooks/useChatSession'
import {
  Shield, AlertCircle, Map, TrendingUp, TrendingDown, Minus,
  Loader2, Zap, Bot, Copy, Check,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

// ─── Suggested queries ────────────────────────────────────────────────────────
const SAMPLE_QUERIES = [
  'ما ملخص البلاغات لهذا الشهر؟',
  'ما أداء مراقبي الجهات هذا الربع؟',
  'اعرض بلاغات حفريات الشوارع على الخريطة',
  'ما التحليل المالي للمخالفات؟',
  'اعرض خريطة كثافة البلاغات',
  'ما أكثر عناصر التشوه رصداً؟',
  'قارن معدلات الإغلاق حسب الجهة',
  'ما إحصاءات التكرار بين مصادر الرصد؟',
]

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color || '#3B82F6' }} className="font-bold">
          {typeof p.value === 'number' && p.value > 10000
            ? `${Number(p.value).toLocaleString('ar-SA')} ريال`
            : Number(p.value)?.toLocaleString?.('ar-SA') ?? p.value}
        </p>
      ))}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, unit, trend, trendUp }) {
  const TrendIcon = trendUp === true ? TrendingUp : trendUp === false ? TrendingDown : Minus
  const trendColor = trendUp === true ? 'text-emerald-400' : trendUp === false ? 'text-red-400' : 'text-gray-500'
  return (
    <div className="bg-gray-800/80 border border-gray-700/50 rounded-xl p-3 flex-shrink-0 min-w-[110px]">
      <p className="text-xs text-gray-500 mb-1 leading-relaxed">{label}</p>
      <p className="text-xl font-bold text-white leading-none">
        {typeof value === 'number' ? Number(value).toLocaleString('ar-SA') : value}
        {unit && <span className="text-xs text-gray-400 font-normal mr-1">{unit}</span>}
      </p>
      {trend && (
        <div className={`flex items-center gap-1 mt-1.5 ${trendColor}`}>
          <TrendIcon size={11} />
          <span className="text-xs font-medium">{trend}</span>
        </div>
      )}
    </div>
  )
}

// ─── Data table ───────────────────────────────────────────────────────────────
function DataTable({ columns, rows }) {
  if (!columns?.length || !rows?.length) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-700/50">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-700/50 bg-gray-800/50">
            {columns.map((col, i) => (
              <th key={i} className="text-right px-3 py-2 text-gray-400 font-medium">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-700/30 last:border-0 hover:bg-gray-800/40 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Text renderer — handles bold, lists, headings, alerts, markdown tables ────
function renderText(text) {
  if (!text) return null

  // Split into segments: markdown-table blocks vs regular text
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
      // Filter separator rows (e.g. |:---:|:---|) and parse
      const dataRows = seg.lines
        .filter(l => !l.match(/^\|[\s\-:|]+\|$/))
        .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
      if (dataRows.length < 1) return null
      const [headers, ...bodyRows] = dataRows
      return (
        <div key={si} className="overflow-x-auto rounded-xl border border-gray-700/50 my-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700/50 bg-gray-800/60">
                {headers.map((h, j) => (
                  <th key={j} className="text-right px-3 py-2 text-gray-300 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, j) => (
                <tr key={j} className="border-b border-gray-700/30 last:border-0 hover:bg-gray-800/40 transition-colors">
                  {row.map((cell, k) => (
                    <td key={k} className="px-3 py-2 text-gray-300 whitespace-nowrap">{cell}</td>
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
        return <p key={key} className="font-semibold text-white text-sm mt-2 mb-0.5">{line.replace(/^#{1,3}\s+/, '')}</p>
      if (line.match(/^---+$/))
        return <hr key={key} className="border-gray-700/50 my-2" />
      if (line.startsWith('**') && line.endsWith('**'))
        return <p key={key} className="font-bold text-white my-1">{line.replace(/\*\*/g, '')}</p>
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return (
          <p key={key} className="text-gray-300 text-sm leading-relaxed">
            {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}
          </p>
        )
      }
      if (line.startsWith('- ') || line.match(/^\d+\.\s/))
        return <li key={key} className="text-gray-300 text-sm mr-4 leading-relaxed">{line.replace(/^[-\d]+\.?\s/, '')}</li>
      if (line.startsWith('⚠️') || line.startsWith('🔒') || line.startsWith('ℹ️'))
        return <p key={key} className="text-amber-400 text-xs bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20 my-1">{line}</p>
      return <p key={key} className="text-gray-300 text-sm leading-relaxed">{line}</p>
    })
  })
}

// ─── Welcome message (stable module-level constant) ───────────────────────────
const AGENT_WELCOME_MSG = {
  role: 'assistant',
  text: `مرحباً! أنا المساعد المكاني الذكي لمنصة UrbanAI.\n\nأقرأ بيانات حقيقية من قاعدة البيانات وأقدم تحليلات مكانية وتشغيلية متقدمة.\n\nيمكنني مساعدتك في:\n- **إحصاءات البلاغات** والأداء التشغيلي\n- **التحليل المكاني** وعرض النتائج على الخريطة\n- **التحليل المالي** وتوقعات الغرامات\n- **أداء المراقبين** والجهات\n- **تحليل التكرار** بين مصادر الرصد\n\n⚠️ المساعد يقترح تحليلات فقط. القرارات النهائية تعود للمستخدم المختص.`,
  timestamp: null,
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AgentAI() {
  const { user, authFetch } = useAuth()
  const { applyMapCommand } = useMapContext()
  const navigate = useNavigate()

  const [messages, setMessages, clearMessages, historyRef] = useChatSession('agent', AGENT_WELCOME_MSG)
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [copiedKey, setCopiedKey] = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return

    const userMsg = { role: 'user', text: userText, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    // Build history payload: only role + content for API
    const history = historyRef.current.slice(-6).map(m => ({
      role:    m.role,
      content: m.text,
    }))

    try {
      const res  = await authFetch('/api/assistant/query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userText, history }),
      })

      if (res?.status === 503) {
        const d = await res.json()
        throw new Error(d.error || 'خدمة الذكاء الاصطناعي غير متاحة حالياً')
      }
      if (!res?.ok) {
        const d = await res?.json().catch(() => ({}))
        throw new Error(d?.error || `خطأ في الخادم (${res?.status})`)
      }

      const data = await res.json()

      // Apply map command if present (stores in MapContext for GISMap to consume)
      if (data.mapCommand) {
        // For heatmap: embed the points from heatmap tool result
        applyMapCommand(data.mapCommand)
      }

      const assistantMsg = {
        role:       'assistant',
        text:       data.text || '',
        chart:      data.chart || null,
        kpis:       data.kpis  || null,
        table:      data.table || null,
        mapCommand: data.mapCommand || null,
        timestamp:  new Date(),
      }

      setMessages(prev => [...prev, assistantMsg])

      // Update history ref
      historyRef.current = [
        ...historyRef.current,
        { role: 'user',      text: userText },
        { role: 'assistant', text: data.text || '' },
      ].slice(-12)

    } catch (err) {
      setError(err.message)
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠️ حدث خطأ: ${err.message}`,
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, authFetch, applyMapCommand])

  const copyData = useCallback((key, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }, [])

  return (
    <div className="flex gap-5 h-[calc(100vh-130px)]">

      {/* ── Sidebar ── */}
      <div className="w-72 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-4">

        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot size={16} className="text-blue-400" />
            <h3 className="font-bold text-white text-sm">المساعد المكاني الذكي</h3>
          </div>
          <p className="text-xs text-gray-500">يقرأ من قاعدة البيانات مباشرة</p>
        </div>

        {/* AI engine status */}
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
          <Zap size={12} className="text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-300">Claude Sonnet — أدوات تحليلية</p>
            <p className="text-xs text-blue-400/60">PostGIS · RBAC · Analytics</p>
          </div>
        </div>

        {/* RBAC scope */}
        {user?.role !== 'admin' && user?.role !== 'executive' && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <Shield size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/80">
              التحليل محدود بنطاق صلاحياتك ({user?.entityName || user?.role}).
            </p>
          </div>
        )}

        {/* Sample queries */}
        <div className="flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 mb-3 font-medium">أسئلة مقترحة:</p>
          <div className="space-y-2">
            {SAMPLE_QUERIES.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q)} disabled={loading}
                className="w-full text-right text-xs text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-3 transition-all leading-relaxed disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Clear conversation */}
        <button onClick={clearMessages}
          className="w-full text-right text-xs text-gray-500 hover:text-red-400 border border-gray-700/40 hover:border-red-500/30 rounded-xl px-3 py-2 transition-all">
          مسح المحادثة
        </button>

        {/* Governance notice */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={11} className="text-amber-400" />
            <p className="text-xs text-amber-400 font-medium">AI مساعدة فقط</p>
          </div>
          <p className="text-xs text-amber-400/70 leading-relaxed">
            المساعد يقترح تحليلات. القرارات النهائية تعود للمستخدم المختص.
          </p>
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

              {/* Avatar */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-sm ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20'
                  : 'bg-gray-700'
              }`}>
                {msg.role === 'assistant' ? <Bot size={18} className="text-white" /> : '👤'}
              </div>

              <div className={`flex-1 max-w-[90%] space-y-3 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>

                {/* Bubble */}
                <div className={`rounded-2xl p-4 ${
                  msg.role === 'assistant'
                    ? 'bg-gray-800 border border-gray-700/50 rounded-tr-sm'
                    : 'bg-blue-600 text-white rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="space-y-1">{renderText(msg.text)}</div>
                  ) : (
                    <p className="text-sm">{msg.text}</p>
                  )}
                </div>

                {/* KPI cards */}
                {msg.kpis?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {msg.kpis.map((kpi, j) => <KpiCard key={j} {...kpi} />)}
                  </div>
                )}

                {/* Chart */}
                {msg.chart && (
                  <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-4 w-full">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-gray-400">{msg.chart.title}</p>
                      <button
                        onClick={() => copyData(`${i}-chart`, [msg.chart.title, ...msg.chart.data.map(d => `${d.name}\t${d.value}`)].join('\n'))}
                        className="p-1 rounded hover:bg-gray-700 transition-colors flex-shrink-0"
                        title="نسخ البيانات">
                        {copiedKey === `${i}-chart` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-gray-500" />}
                      </button>
                    </div>
                    {msg.chart.type === 'bar' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={msg.chart.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {msg.chart.data.map((d, j) => <Cell key={j} fill={d.fill || '#3B82F6'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {msg.chart.type === 'pie' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={msg.chart.data} cx="50%" cy="50%" outerRadius={70} innerRadius={28} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                            {msg.chart.data.map((d, j) => <Cell key={j} fill={d.fill || d.color || '#3B82F6'} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                    {msg.chart.type === 'line' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={msg.chart.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                {/* Data table */}
                {msg.table?.columns?.length > 0 && (
                  <div className="w-full space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">جدول البيانات</span>
                      <button
                        onClick={() => copyData(`${i}-table`, [msg.table.columns.join('\t'), ...msg.table.rows.map(r => r.join('\t'))].join('\n'))}
                        className="p-1 rounded hover:bg-gray-700 transition-colors"
                        title="نسخ الجدول">
                        {copiedKey === `${i}-table` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-gray-500" />}
                      </button>
                    </div>
                    <DataTable columns={msg.table.columns} rows={msg.table.rows} />
                  </div>
                )}

                {/* Map command action button */}
                {msg.mapCommand && (
                  <button
                    onClick={() => { applyMapCommand(msg.mapCommand); navigate('/map') }}
                    className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 hover:border-blue-400/60 text-blue-300 text-xs font-medium px-4 py-2 rounded-xl transition-all">
                    <Map size={13} />
                    اعرض على الخريطة
                    {msg.mapCommand.params?.label && (
                      <span className="text-blue-400/60">— {msg.mapCommand.params.label}</span>
                    )}
                  </button>
                )}

                <p className="text-xs text-gray-600 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString('ar-SA')}
                </p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <div className="bg-gray-800 border border-gray-700/50 rounded-2xl rounded-tr-sm p-4">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-blue-400 animate-spin" />
                  <span className="text-xs text-gray-500">يستعلم من قاعدة البيانات...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div className="p-4 border-t border-gray-800">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}
          <div className="flex gap-3 items-end">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-3 focus-within:border-blue-500 transition-all">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="اسأل عن البلاغات، الخرائط، الأداء، التحليل المالي..." rows={2}
                className="w-full bg-transparent text-white placeholder-gray-600 text-sm resize-none focus:outline-none leading-relaxed" />
            </div>
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className="w-12 h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/20 flex-shrink-0">
              {loading ? <Loader2 size={18} className="text-white animate-spin" /> : <span className="text-white text-lg">↑</span>}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            بيانات حقيقية من قاعدة البيانات · محدودة بنطاق صلاحياتك · AI مساعدة، ليست قراراً نهائياً
          </p>
        </div>
      </div>
    </div>
  )
}
