import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Bot, FileText, TrendingUp, ChevronRight, ChevronLeft, Send, Layers, Plus, Settings, X, KeyRound, Lock } from 'lucide-react'
import { statusConfig } from '@/data/mockData'
import { OPEN_STATUSES } from '@/data/caseConfig'
import { useReportScope } from '@/hooks/useReportScope'
import { useApiReports, normalizeApiReport } from '@/hooks/useApiReports'

// ─── helpers ────────────────────────────────────────────────────────────────
const createIcon = (color) => L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  className: '', iconSize: [12, 12], iconAnchor: [6, 6], popupAnchor: [0, -8],
})

const statusLabels = {
  new: 'جديد', reviewing: 'قيد التدقيق', assigned: 'مُسند',
  in_progress: 'قيد المعالجة', closed: 'مغلق', rejected: 'مرفوض',
}

// ─── Claude API integration ──────────────────────────────────────────────────
const AI_SUGGESTIONS = [
  'ما أكثر عناصر التشوه البصري المرصودة؟',
  'ما هو إجمالي التوقع المالي للغرامات؟',
  'كيف أداء الجهات المسؤولة؟',
  'ما توزيع البلاغات على المناطق؟',
  'كم نسبة البلاغات المغلقة؟',
]

function buildSystemPrompt(stats, reports) {
  const topElements = stats.byElement.slice(0, 5).map(e => `  - ${e.name}: ${e.count} بلاغ (غرامة ${e.fine.toLocaleString('ar-SA')} ر.س)`).join('\n')
  const topDistricts = stats.byDistrict.slice(0, 5).map(d => `  - ${d.district}: ${d.count} بلاغ`).join('\n')
  const topEntities = stats.byEntity.slice(0, 5).map(e => `  - ${e.dept}: نسبة إغلاق ${e.rate}%`).join('\n')
  const byStatus = stats.byStatus.map(s => `  - ${statusLabels[s.status] || s.status}: ${s.count}`).join('\n')

  return `أنت مساعد ذكاء اصطناعي متخصص في تحليل بيانات منصة رصد التشوه البصري لأمانة الباحة. أجب بالعربية دائماً بأسلوب مختصر ومهني بناءً على البيانات التالية فقط.

## بيانات النظام الحالية (Real-time):
- إجمالي البلاغات: ${stats.totalReports}
- مفتوحة: ${stats.openReports}
- مغلقة: ${stats.closedReports}
- جديدة: ${stats.newReports}
- رُصد بالذكاء الاصطناعي: ${stats.aiDetected}
- إجمالي الغرامات المتوقعة: ${stats.totalFineEstimate.toLocaleString('ar-SA')} ر.س
- متوسط وقت الإغلاق: ${stats.avgCloseTime} أيام

## توزيع حسب الحالة:
${byStatus || '  - لا يوجد'}

## أكثر العناصر رصداً:
${topElements || '  - لا يوجد بعد'}

## توزيع حسب المنطقة:
${topDistricts || '  - لا يوجد بعد'}

## أداء الجهات:
${topEntities || '  - لا يوجد إسناد بعد'}

لا تخترع بيانات. إذا كانت البيانات فارغة فأخبر المستخدم بذلك بوضوح.`
}

async function callClaudeAPI(apiKey, systemPrompt, question) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${resp.status}`)
  }
  const data = await resp.json()
  return data.content?.[0]?.text || ''
}

function localFallback(q, stats) {
  const text = q.toLowerCase()
  if (stats.totalReports === 0) {
    return 'لا توجد بلاغات في النظام حتى الآن.\nقم بإضافة أول بلاغ من زر **"بلاغ جديد"** في الأعلى.'
  }
  if (text.includes('مفتوح') || text.includes('نسبة')) {
    return `البلاغات المفتوحة: **${stats.openReports}** من ${stats.totalReports}\nنسبة الإغلاق: ${Math.round(stats.closedReports / stats.totalReports * 100)}%`
  }
  if (text.includes('أكثر') || text.includes('عنصر')) {
    const top = stats.byElement.slice(0, 5)
    return top.length > 0
      ? `أكثر العناصر رصداً:\n${top.map((e, i) => `${i + 1}. ${e.name}: **${e.count}** بلاغ`).join('\n')}`
      : 'لا توجد بيانات كافية بعد.'
  }
  if (text.includes('مالي') || text.includes('غرام')) {
    return `التوقع المالي:\n- إجمالي: **${stats.totalFineEstimate.toLocaleString('ar-SA')} ر.س**\n- متوسط لكل بلاغ: **${Math.round(stats.totalFineEstimate / stats.totalReports).toLocaleString('ar-SA')} ر.س**`
  }
  if (text.includes('منطقة') || text.includes('حي')) {
    const top = stats.byDistrict.slice(0, 5)
    return top.length > 0
      ? `توزيع البلاغات على المناطق:\n${top.map((d, i) => `${i + 1}. ${d.district}: **${d.count}** بلاغ`).join('\n')}`
      : 'لم يتم تحديد مناطق بعد.'
  }
  if (text.includes('أداء') || text.includes('جهة') || text.includes('بلدية')) {
    const top = stats.byEntity.slice(0, 5)
    return top.length > 0
      ? `أداء الجهات:\n${top.map((e, i) => `${i + 1}. ${e.dept}: **${e.rate}%** إغلاق`).join('\n')}`
      : 'لم يتم إسناد بلاغات لجهات بعد.'
  }
  return `ملخص المنصة:\n- إجمالي البلاغات: **${stats.totalReports}**\n- المفتوحة: **${stats.openReports}**\n- المغلقة: **${stats.closedReports}**\n- التوقع المالي: **${stats.totalFineEstimate.toLocaleString('ar-SA')} ر.س**`
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

// ─── AI Panel ────────────────────────────────────────────────────────────────
function AIPanel({ stats, reports }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ua_claude_key') || '')
  const [showSettings, setShowSettings] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [msgs, setMsgs] = useState([{
    role: 'ai',
    text: 'مرحباً، أنا المساعد الذكي للمنصة.\nيمكنني تحليل البلاغات الفعلية، الغرامات، والأداء بلغة طبيعية.',
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const saveKey = () => {
    const k = keyInput.trim()
    if (k) {
      localStorage.setItem('ua_claude_key', k)
      setApiKey(k)
    }
    setShowSettings(false)
    setKeyInput('')
  }

  const clearKey = () => {
    localStorage.removeItem('ua_claude_key')
    setApiKey('')
    setKeyInput('')
    setShowSettings(false)
  }

  const send = async (text) => {
    const q = text || input.trim()
    if (!q || loading) return
    setMsgs(p => [...p, { role: 'user', text: q }])
    setInput('')
    setLoading(true)
    try {
      let responseText
      if (apiKey) {
        const systemPrompt = buildSystemPrompt(stats, reports)
        responseText = await callClaudeAPI(apiKey, systemPrompt, q)
      } else {
        await new Promise(r => setTimeout(r, 400 + Math.random() * 300))
        responseText = localFallback(q, stats)
      }
      setMsgs(p => [...p, { role: 'ai', text: responseText }])
    } catch (err) {
      setMsgs(p => [...p, { role: 'ai', text: `حدث خطأ: ${err.message}` }])
    }
    setLoading(false)
  }

  const renderText = (text) => text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />
    const parts = line.split(/\*\*(.*?)\*\*/g)
    return (
      <p key={i} className="text-xs leading-relaxed text-slate-600 dark:text-gray-300">
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-slate-800 dark:text-white">{p}</strong> : p)}
      </p>
    )
  })

  return (
    <div className="flex flex-col h-full relative">
      {/* Settings modal */}
      {showSettings && (
        <div className="absolute inset-0 z-10 bg-white dark:bg-gray-900 flex flex-col p-4 gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-blue-600" />
              <span className="text-sm font-semibold text-slate-800 dark:text-white">Claude API Key</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">
            {'أدخل مفتاح Claude API لتفعيل المساعد الذكي بالكامل. يُخزّن في المتصفح فقط ولا يغادر الجهاز.'}
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
            placeholder="sk-ant-..."
            className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
          />
          <div className="flex gap-2">
            <button onClick={saveKey} disabled={!keyInput.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg py-2 text-xs font-medium transition-colors">
              {'حفظ'}
            </button>
            {apiKey && (
              <button onClick={clearKey}
                className="flex-1 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg py-2 text-xs font-medium transition-colors">
                {'حذف المفتاح'}
              </button>
            )}
          </div>
          {apiKey && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center">
              {'✓ مفتاح محفوظ — Claude AI مفعّل'}
            </p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${apiKey ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-gray-600'}`} />
          <span className="text-xs text-slate-500 dark:text-gray-400">
            {apiKey ? 'Claude AI' : 'تحليل محلي'}
          </span>
        </div>
        <button onClick={() => { setKeyInput(''); setShowSettings(true) }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-gray-800">
          <Settings size={13} />
        </button>
      </div>

      {/* Suggestions */}
      <div className="p-3 border-b border-slate-100 dark:border-gray-800 space-y-1.5 flex-shrink-0">
        <p className="text-xs text-slate-400 dark:text-gray-500 font-medium mb-2">{'أسئلة مقترحة'}</p>
        {AI_SUGGESTIONS.slice(0, 4).map((q, i) => (
          <button key={i} onClick={() => send(q)} disabled={loading}
            className="w-full text-right text-xs text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 transition-colors leading-relaxed disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${m.role === 'ai' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-white'}`}>
              {m.role === 'ai' ? <Bot size={12} /> : 'أ'}
            </div>
            <div className={`flex-1 max-w-[90%] ${m.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              <div className={`rounded-xl p-3 ${m.role === 'ai' ? 'bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700' : 'bg-blue-600 text-white'}`}>
                {m.role === 'ai'
                  ? <div className="space-y-0.5">{renderText(m.text)}</div>
                  : <p className="text-xs">{m.text}</p>}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center"><Bot size={12} className="text-white" /></div>
            <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-3">
              <div className="flex gap-1">{[1, 2, 3].map(d => <div key={d} className="w-1.5 h-1.5 bg-blue-400 rounded-full typing-dot" />)}</div>
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
            placeholder={'اسأل عن البلاغات أو الغرامات...'}
            className="flex-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center justify-center transition-colors flex-shrink-0">
            <Send size={13} className="text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-1.5">
          {apiKey ? '⚡ Claude AI · يقرأ من البيانات الفعلية' : '\u{1F4CA} تحليل محلي · أضف مفتاح API لتفعيل Claude'}
        </p>
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

  // Merge local (DataContext) + API-only reports for map — deduplicate by id
  const allMapReports = useMemo(() => {
    const localIds = new Set(reports.map(r => r.id))
    const apiNormalized = rawApiReports
      .map(normalizeApiReport)
      .filter(r => !localIds.has(r.id) && r.coords != null)
    return [...reports, ...apiNormalized]
  }, [reports, rawApiReports])

  const stats = useMemo(() => computeStats(reports), [reports])
  const [panel, setPanel] = useState('reports')
  const [panelOpen, setPanelOpen] = useState(true)
  const [filterEl, setFilterEl] = useState('all')
  const [showHeat, setShowHeat] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [selectedReport, setSelectedReport] = useState(null)

  const tiles = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }

  const filtered = allMapReports.filter(r => filterEl === 'all' || r.element === filterEl)
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
            {showHeat && filtered.map(r => (
              <Circle key={`h-${r.id}`} center={r.coords || [20.0131, 41.4677]} radius={700}
                pathOptions={{ fillColor: r.elementColor || '#3B82F6', fillOpacity: 0.07, color: r.elementColor || '#3B82F6', weight: 1, opacity: 0.2 }} />
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

          {/* Filter overlay */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500]">
            <select value={filterEl} onChange={e => setFilterEl(e.target.value)}
              className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-gray-200 shadow-lg focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="all">{'كل العناصر'}</option>
              {usedElements.map(e => <option key={e.id} value={e.id}>{e.name} ({e.count})</option>)}
            </select>
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
              {panel === 'ai' && <AIPanel stats={stats} reports={reports} />}
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
