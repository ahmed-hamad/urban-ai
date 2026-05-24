import { useState, useRef, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useReportScope } from '@/hooks/useReportScope'
import { aiSampleQueries } from '@/data/mockData'
import { Shield, AlertCircle } from 'lucide-react'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }} className="font-bold">
          {typeof p.value === 'number' && p.value > 10000
            ? `${p.value.toLocaleString('ar-SA')} ريال`
            : p.value?.toLocaleString?.('ar-SA') ?? p.value}
        </p>
      ))}
    </div>
  )
}

export default function AgentAI() {
  const { users, entities, auditLogs } = useData()
  const { user } = useAuth()
  const { scopedReports, isRestricted, scopeLabel } = useReportScope()

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: `مرحباً! أنا المساعد التحليلي لمنصة رصد التشوهات البصرية في أمانة الباحة.\n\nأقرأ من بيانات النظام الفعلية${isRestricted && scopeLabel ? ` (${scopeLabel})` : ''}.\n\nيمكنني مساعدتك في:\n- تحليل إحصائيات البلاغات\n- التوقع المالي والغرامات\n- أداء المستخدمين والجهات\n- تحليل العناصر والمخالفات\n\n⚠️ تنبيه: المساعد يقترح تحليلات فقط. القرارات النهائية تعود للمستخدم المختص.`,
      chart: null,
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Real data computation based on RBAC-scoped reports
  const generateResponse = useCallback((query) => {
    const q = query.toLowerCase()
    const r = scopedReports
    const scopeSuffix = isRestricted && scopeLabel ? ` (${scopeLabel})` : ''

    if (r.length === 0) {
      return {
        text: `لا توجد بيانات في نطاق صلاحياتك${scopeSuffix} لتحليلها حالياً.`,
        chart: null,
      }
    }

    // Pre-compute real stats
    const total = r.length
    const openReports = r.filter(x => !['closed_final', 'rejected'].includes(x.status))
    const closed = r.filter(x => x.status === 'closed_final')
    const open = openReports.length
    const closureRate = total ? Math.round((closed.length / total) * 100) : 0
    const fineIssued = r.filter(x => x.closureType === 'fine_issued')
    const totalFines = fineIssued.reduce((s, x) => s + (x.estimatedFine || 0), 0)
    const avgFine = fineIssued.length ? Math.round(totalFines / fineIssued.length) : 0

    // By element
    const byElement = Object.values(
      r.reduce((acc, x) => {
        const k = x.elementName || x.element || 'أخرى'
        if (!acc[k]) acc[k] = { name: k, count: 0, color: x.elementColor || '#3B82F6', fines: 0 }
        acc[k].count++
        if (x.closureType === 'fine_issued') acc[k].fines += x.estimatedFine || 0
        return acc
      }, {})
    ).sort((a, b) => b.count - a.count)

    // By entity
    const byEntity = Object.entries(
      r.reduce((acc, x) => {
        if (!x.entity) return acc
        if (!acc[x.entity]) acc[x.entity] = { total: 0, closed: 0 }
        acc[x.entity].total++
        if (x.status === 'closed_final') acc[x.entity].closed++
        return acc
      }, {})
    ).map(([name, { total: t, closed: c }]) => ({
      name, total: t, closed: c,
      rate: t ? Math.round((c / t) * 100) : 0
    })).sort((a, b) => b.rate - a.rate)

    // Monthly last 6 months
    const monthlyStats = [...Array(6)].map((_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (5 - i))
      const y = d.getFullYear(), m = d.getMonth()
      const label = d.toLocaleString('ar-SA', { month: 'short' })
      const monthReports = r.filter(x => { const dd = new Date(x.createdAt); return dd.getFullYear() === y && dd.getMonth() === m })
      const monthFines = r.filter(x => {
        if (x.closureType !== 'fine_issued') return false
        const dd = new Date(x.updatedAt); return dd.getFullYear() === y && dd.getMonth() === m
      })
      return {
        name: label,
        بلاغات: monthReports.length,
        مغلق: monthReports.filter(x => x.status === 'closed_final').length,
        value: monthFines.reduce((s, x) => s + (x.estimatedFine || 0), 0),
        fill: '#3B82F6',
      }
    })

    // ── Response dispatch ────────────────────────────────────────────────────
    if (q.includes('مفتوح') || q.includes('مفتوحة') || q.includes('ملخص') || q.includes('إجمالي')) {
      const byStatus = r.reduce((acc, x) => {
        const key = x.status; acc[key] = (acc[key] || 0) + 1; return acc
      }, {})
      return {
        text: `**ملخص البلاغات${scopeSuffix}:**\n\n- إجمالي البلاغات: **${total}**\n- البلاغات المفتوحة: **${open}** (${total ? Math.round((open/total)*100) : 0}%)\n- البلاغات المغلقة: **${closed.length}**\n- معدل الإغلاق: **${closureRate}%**\n- بلاغات بغرامة مُحررة: **${fineIssued.length}**`,
        chart: {
          type: 'bar', title: 'توزيع حالات البلاغات',
          data: Object.entries(byStatus).map(([k, v]) => ({ name: k, value: v, fill: '#3B82F6' }))
        }
      }
    }

    if (q.includes('عنصر') || q.includes('أكثر') || q.includes('نوع')) {
      const top = byElement.slice(0, 7)
      return {
        text: `**أكثر العناصر رصداً${scopeSuffix}:**\n\n${top.map((e, i) => `${i + 1}. ${e.name}: **${e.count}** بلاغ`).join('\n')}\n\nإجمالي العناصر المرصودة: ${byElement.length} نوع`,
        chart: {
          type: 'bar', title: 'توزيع العناصر المرصودة',
          data: top.map(e => ({ name: e.name, value: e.count, fill: e.color }))
        }
      }
    }

    if (q.includes('مالي') || q.includes('غرام') || q.includes('تحصيل') || q.includes('توقع')) {
      if (fineIssued.length === 0) {
        return {
          text: `لا توجد بلاغات مغلقة بغرامة بعد${scopeSuffix}. يتطلب الحساب المالي وجود بلاغات مُغلقة بنوع إجراء "تحرير مخالفة مالية".`,
          chart: null
        }
      }
      return {
        text: `**التوقع المالي${scopeSuffix}:**\n\n- إجمالي الغرامات المحصّلة: **${totalFines.toLocaleString('ar-SA')} ريال**\n- عدد المخالفات: **${fineIssued.length}** بلاغ\n- متوسط الغرامة: **${avgFine.toLocaleString('ar-SA')} ريال**\n- سيناريو التكرار: **${(totalFines * 2).toLocaleString('ar-SA')} ريال**\n\n⚠️ هذه بيانات فعلية من النظام. البلاغات بدون تحرير مخالفة لا تحتسب.`,
        chart: {
          type: 'bar', title: 'الغرامات المحصّلة حسب العنصر',
          data: byElement.filter(e => e.fines > 0).map(e => ({ name: e.name, value: e.fines, fill: e.color }))
        }
      }
    }

    if (q.includes('أداء') || q.includes('جهة') || q.includes('بلدية') || q.includes('مقارنة')) {
      if (byEntity.length === 0) {
        return {
          text: `لا توجد بيانات جهات مرتبطة بالبلاغات${scopeSuffix} حتى الآن.`,
          chart: null
        }
      }
      return {
        text: `**أداء الجهات${scopeSuffix}:**\n\n${byEntity.slice(0, 5).map((e, i) => `${i + 1}. ${e.name}: ${e.rate}% إغلاق (${e.closed}/${e.total})`).join('\n')}\n\nأفضل جهة: **${byEntity[0]?.name}** بمعدل إغلاق **${byEntity[0]?.rate}%**`,
        chart: {
          type: 'bar', title: 'معدل الإغلاق حسب الجهة',
          data: byEntity.slice(0, 6).map(e => ({
            name: e.name.slice(0, 12),
            value: e.rate,
            fill: e.rate >= 80 ? '#10B981' : e.rate >= 60 ? '#F59E0B' : '#EF4444'
          }))
        }
      }
    }

    if (q.includes('شهر') || q.includes('شهرية') || q.includes('اتجاه') || q.includes('تقرير')) {
      return {
        text: `**التقرير الشهري${scopeSuffix}:**\n\n${monthlyStats.map(m => `- ${m.name}: **${m['بلاغات']}** بلاغ، أُغلق منها **${m['مغلق']}**`).join('\n')}\n\nإجمالي 6 أشهر: **${monthlyStats.reduce((s, m) => s + m['بلاغات'], 0)}** بلاغ`,
        chart: {
          type: 'bar', title: 'البلاغات الشهرية - آخر 6 أشهر',
          data: monthlyStats.map(m => ({ ...m, value: m['بلاغات'] }))
        }
      }
    }

    // Default: general summary
    return {
      text: `**ملخص النظام${scopeSuffix}:**\n\n- إجمالي البلاغات: **${total}**\n- نسبة الإغلاق: **${closureRate}%**\n- البلاغات بغرامة: **${fineIssued.length}**\n- إجمالي الغرامات: **${totalFines.toLocaleString('ar-SA')} ريال**\n\n${isRestricted ? `🔒 تعرض فقط بيانات ${scopeLabel} · للوصول الكامل تواصل مع المدير\n\n` : ''}جرّب أسئلة مثل: "ما أكثر العناصر رصداً؟" أو "ما التوقع المالي؟"`,
      chart: null
    }
  }, [scopedReports, isRestricted, scopeLabel])

  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText || loading) return

    setMessages(prev => [...prev, { role: 'user', text: userText, timestamp: new Date() }])
    setInput('')
    setLoading(true)

    await new Promise(r => setTimeout(r, 600 + Math.random() * 600))

    const response = generateResponse(userText)
    setMessages(prev => [...prev, { role: 'assistant', ...response, timestamp: new Date() }])
    setLoading(false)
  }

  const renderText = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-bold text-white my-1">{line.replace(/\*\*/g, '')}</p>
      }
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return <p key={i} className="text-gray-300 text-sm leading-relaxed">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}</p>
      }
      if (line.startsWith('- ')) {
        return <li key={i} className="text-gray-300 text-sm mr-4 leading-relaxed">{line.slice(2)}</li>
      }
      if (line.startsWith('⚠️') || line.startsWith('🔒')) {
        return <p key={i} className="text-amber-400 text-xs bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20 my-1">{line}</p>
      }
      if (line.trim() === '') return <br key={i} />
      return <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>
    })
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-130px)]">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-white text-sm mb-1">المساعد التحليلي</h3>
          <p className="text-xs text-gray-500">يقرأ من بيانات النظام الفعلية</p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <div>
            <p className="text-xs font-medium text-emerald-300">{scopedReports.length} بلاغ في نطاقك</p>
            <p className="text-xs text-emerald-400/60">{isRestricted ? scopeLabel : 'وصول كامل'}</p>
          </div>
        </div>

        {isRestricted && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <Shield size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/80">
              المساعد يرد فقط على بيانات نطاقك المصرح به.
            </p>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-500 mb-3 font-medium">أسئلة مقترحة:</p>
          <div className="space-y-2">
            {aiSampleQueries.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q)} disabled={loading}
                className="w-full text-right text-xs text-gray-400 hover:text-white bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-3 transition-all leading-relaxed disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto">
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
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20'
                  : 'bg-gray-700'
              }`}>
                {msg.role === 'assistant' ? '📊' : '👤'}
              </div>

              <div className={`flex-1 max-w-[85%] space-y-3 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
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

                {msg.chart && (
                  <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-4 w-full">
                    <p className="text-xs font-medium text-gray-400 mb-3">{msg.chart.title}</p>
                    {msg.chart.type === 'bar' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={msg.chart.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {msg.chart.data.map((d, j) => <Cell key={j} fill={d.fill || '#3B82F6'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {msg.chart.type === 'pie' && (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={msg.chart.data} cx="50%" cy="50%" outerRadius={70} innerRadius={30} dataKey="value">
                            {msg.chart.data.map((d, j) => <Cell key={j} fill={d.color || d.fill} />)}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-600 px-1">{msg.timestamp.toLocaleTimeString('ar-SA')}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-base">📊</div>
              <div className="bg-gray-800 border border-gray-700/50 rounded-2xl rounded-tr-sm p-4">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map(d => (
                    <div key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                  <span className="text-xs text-gray-500 mr-2">يحلل البيانات...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-3 items-end">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-3 focus-within:border-blue-500 transition-all">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="اسأل عن البلاغات، الإحصائيات، التوقع المالي..." rows={2}
                className="w-full bg-transparent text-white placeholder-gray-600 text-sm resize-none focus:outline-none leading-relaxed" />
            </div>
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className="w-12 h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/20 flex-shrink-0">
              <span className="text-white text-lg">↑</span>
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            البيانات من النظام الفعلي فقط · محدودة بنطاق صلاحياتك · AI مساعدة، ليست قراراً نهائياً
          </p>
        </div>
      </div>
    </div>
  )
}
