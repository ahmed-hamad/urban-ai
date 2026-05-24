import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { AUDIT_ACTIONS, getStatusCfg } from '@/data/caseConfig'
import { Shield, Search, Printer, Lock, AlertTriangle } from 'lucide-react'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'

const ACTION_STYLE = {
  created:       { label: 'إنشاء',        bg: 'bg-blue-50 dark:bg-blue-500/10',      text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-500/30' },
  status_change: { label: 'تغيير حالة',   bg: 'bg-slate-100 dark:bg-slate-700/40',   text: 'text-slate-500 dark:text-slate-400',    border: 'border-slate-200 dark:border-slate-600' },
  assigned:      { label: 'إسناد',         bg: 'bg-amber-50 dark:bg-amber-500/10',    text: 'text-amber-600 dark:text-amber-400',    border: 'border-amber-200 dark:border-amber-500/30' },
  closure:       { label: 'إغلاق مراقب',  bg: 'bg-cyan-50 dark:bg-cyan-500/10',      text: 'text-cyan-600 dark:text-cyan-400',      border: 'border-cyan-200 dark:border-cyan-500/30' },
  quality_pass:  { label: 'اعتماد جودة',  bg: 'bg-emerald-50 dark:bg-emerald-500/10',text: 'text-emerald-600 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-500/30' },
  quality_fail:  { label: 'إعادة فتح',    bg: 'bg-orange-50 dark:bg-orange-500/10',  text: 'text-orange-600 dark:text-orange-400',  border: 'border-orange-200 dark:border-orange-500/30' },
  rejected:      { label: 'رفض',          bg: 'bg-red-50 dark:bg-red-500/10',        text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-500/30' },
  reopened:      { label: 'إعادة فتح',    bg: 'bg-orange-50 dark:bg-orange-500/10',  text: 'text-orange-600 dark:text-orange-400',  border: 'border-orange-200 dark:border-orange-500/30' },
  enforcement:   { label: 'إنفاذ',        bg: 'bg-amber-50 dark:bg-amber-500/10',    text: 'text-amber-600 dark:text-amber-400',    border: 'border-amber-200 dark:border-amber-500/30' },
  comment:       { label: 'ملاحظة',       bg: 'bg-slate-50 dark:bg-slate-700/30',    text: 'text-slate-500 dark:text-slate-400',    border: 'border-slate-200 dark:border-slate-600' },
  deleted:       { label: 'حذف بلاغ',     bg: 'bg-red-50 dark:bg-red-500/10',        text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-500/30' },
  restored:      { label: 'استعادة',      bg: 'bg-emerald-50 dark:bg-emerald-500/10',text: 'text-emerald-600 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-500/30' },
  user_created:  { label: 'مستخدم جديد', bg: 'bg-blue-50 dark:bg-blue-500/10',      text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-500/30' },
  user_updated:  { label: 'تعديل مستخدم', bg: 'bg-violet-50 dark:bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400',  border: 'border-violet-200 dark:border-violet-500/30' },
  user_deactivated:{ label: 'تعطيل حساب', bg: 'bg-red-50 dark:bg-red-500/10',        text: 'text-red-600 dark:text-red-400',        border: 'border-red-200 dark:border-red-500/30' },
}

// ─── Professional print engine ────────────────────────────────────────────────
function buildPrintHTML({ logs, user, scopeLabel, filterLabel, printDate, printTime }) {
  const statusAr = {
    submitted: 'مُقدَّم', ai_classified: 'ذكاء اصطناعي', under_review: 'قيد المراجعة',
    assigned: 'مُسند', in_progress: 'قيد المعالجة', closed_inspector: 'مغلق (مراقب)',
    pending_enforcement: 'قيد الإنفاذ', pending_notice: 'قيد الإشعار',
    unknown_offender: 'مجهول المخالف', quality_review: 'مراجعة الجودة',
    closed_final: 'مغلق نهائياً', rejected: 'مرفوض', draft: 'مسودة',
  }
  const actionAr = Object.fromEntries(
    Object.entries(ACTION_STYLE).map(([k, v]) => [k, v.label])
  )

  const rows = logs.map((log, i) => {
    const fromSt = log.fromStatus ? (statusAr[log.fromStatus] || log.fromStatus) : ''
    const toSt   = log.toStatus   ? (statusAr[log.toStatus]   || log.toStatus)   : ''
    const stateChange = fromSt && toSt ? `${fromSt} ← ${toSt}` : (toSt || fromSt || '')
    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
        <td style="padding:5px 6px;text-align:center;color:#888;font-size:8pt">${i + 1}</td>
        <td style="padding:5px 6px">
          <span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:7.5pt;font-weight:600;background:#f0f4ff;border:1px solid #c7d7fd;color:#3b5bdb">
            ${actionAr[log.action] || log.action || '—'}
          </span>
        </td>
        <td style="padding:5px 6px;font-family:monospace;font-size:8pt;color:#1d4ed8">${log.reportId || '—'}</td>
        <td style="padding:5px 6px;font-size:8.5pt">${log.userName || '—'}</td>
        <td style="padding:5px 6px;font-size:8pt;color:#555">${log.entity || '—'}</td>
        <td style="padding:5px 6px;font-size:8pt;color:#444;max-width:220px">
          <div>${log.details || AUDIT_ACTIONS[log.action] || '—'}</div>
          ${stateChange ? `<div style="margin-top:3px;font-size:7.5pt;color:#888;direction:ltr">${stateChange}</div>` : ''}
        </td>
        <td style="padding:5px 6px;font-size:8pt;white-space:nowrap">
          ${new Date(log.timestamp).toLocaleDateString('ar-SA')}
        </td>
        <td style="padding:5px 6px;font-size:8pt;white-space:nowrap;color:#888">
          ${new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>سجل التدقيق — أمانة منطقة الباحة</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family:'Segoe UI',Arial,sans-serif; direction:rtl; font-size:10pt; color:#1a1a1a; background:#fff }
    .header { text-align:center; padding:18px 24px 14px; border-bottom:3px double #166534 }
    .org-logo { display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; background:#166534; color:#fff; font-weight:bold; font-size:13pt; border-radius:10px; margin-bottom:8px }
    .org-name { font-size:17pt; font-weight:800; color:#166534; letter-spacing:0.3px }
    .org-sub  { font-size:9pt; color:#555; margin-top:3px }
    .doc-title { font-size:14pt; font-weight:700; margin-top:6px; color:#111 }
    .confidential { display:inline-block; border:1px solid #dc2626; color:#dc2626; padding:2px 12px; border-radius:3px; font-size:8pt; font-weight:600; margin-top:6px }
    .meta-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:10px 20px; background:#f8fafb; border:1px solid #e2e8f0; border-radius:6px; margin:14px 0 }
    .meta-item { text-align:center }
    .meta-label { font-size:7.5pt; color:#666; margin-bottom:2px }
    .meta-value { font-weight:700; font-size:9pt; color:#1a1a1a }
    .scope-bar { background:#fefce8; border:1px solid #fde047; border-radius:4px; padding:6px 14px; font-size:8.5pt; color:#713f12; margin-bottom:12px; display:flex; align-items:center; gap:6px }
    table { width:100%; border-collapse:collapse }
    thead tr { background:#166534 }
    th { color:#fff; padding:8px 6px; text-align:right; font-size:8.5pt; font-weight:700 }
    td { border-bottom:1px solid #e5e7eb; vertical-align:top }
    .footer { margin-top:18px; padding-top:10px; border-top:2px solid #166534; text-align:center; font-size:7.5pt; color:#666 }
    .footer-seal { display:inline-block; border:1px solid #166534; color:#166534; padding:1px 10px; border-radius:3px; font-size:7.5pt; margin-bottom:4px }
    @page { margin:1.4cm; size:A4 }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact } }
  </style>
</head>
<body>
  <div class="header">
    <div><div class="org-logo">عب</div></div>
    <div class="org-name">أمانة منطقة الباحة</div>
    <div class="org-sub">إدارة الرقابة والتفتيش — منصة الرصد الذكي للمخالفات</div>
    <div class="doc-title">سجل التدقيق والمراجعة الرسمي</div>
    <div><span class="confidential">🔒 وثيقة رسمية — للاستخدام الداخلي فقط</span></div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">تاريخ الطباعة</div>
      <div class="meta-value">${printDate}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">وقت الطباعة</div>
      <div class="meta-value">${printTime}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">إجمالي السجلات المطبوعة</div>
      <div class="meta-value">${logs.length} سجل</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">طُبع بواسطة</div>
      <div class="meta-value">${user?.name || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">الصلاحية</div>
      <div class="meta-value">${scopeLabel}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">الفلتر المطبق</div>
      <div class="meta-value">${filterLabel}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:4%">#</th>
        <th style="width:10%">النشاط</th>
        <th style="width:12%">رقم البلاغ</th>
        <th style="width:13%">المنفذ</th>
        <th style="width:12%">الجهة</th>
        <th style="width:30%">التفاصيل والحالة</th>
        <th style="width:10%">التاريخ</th>
        <th style="width:9%">الوقت</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <div><span class="footer-seal">✓ وثيقة موثقة إلكترونياً</span></div>
    <p>صادرة تلقائياً من منصة الرصد الذكي — أمانة منطقة الباحة</p>
    <p style="margin-top:3px">متوافق مع معايير هيئة الأمن السيبراني السعودية (NCA-ECC-1:2018) · جميع الأنشطة مُسجَّلة ومحمية بختم الوقت</p>
  </div>
</body>
</html>`
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AuditLog() {
  const { auditLogs, reports } = useData()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')

  // ── Scope: compute authorized log set based on role ──────────────────────
  const scopedLogs = useMemo(() => {
    if (!user) return []
    const role = user.role

    // Unrestricted roles see everything
    if (['admin', 'executive', 'auditor'].includes(role)) return auditLogs

    if (role === 'manager') {
      // Manager sees logs for reports belonging to their entity
      const entityName = user.entity || user.dept || ''
      const entityReportIds = new Set(
        reports.filter(r => r.entity === entityName).map(r => r.id)
      )
      return auditLogs.filter(log => log.reportId && entityReportIds.has(log.reportId))
    }

    // Monitor: only logs for reports assigned to them
    const myReportIds = new Set(
      reports.filter(r => r.assignedTo === user.id).map(r => r.id)
    )
    return auditLogs.filter(log => log.reportId && myReportIds.has(log.reportId))
  }, [user, auditLogs, reports])

  const scopeLabel = useMemo(() => {
    if (!user) return ''
    if (['admin', 'executive', 'auditor'].includes(user.role)) return 'جميع السجلات'
    if (user.role === 'manager') return `جهة: ${user.entity || 'جهتك'}`
    return `بلاغاتي المسندة`
  }, [user])

  const scopeDescription = useMemo(() => {
    if (!user) return ''
    if (['admin', 'executive', 'auditor'].includes(user.role)) return null
    if (user.role === 'manager') return `تعرض سجلات بلاغات جهة "${user.entity || '—'}" فقط`
    return 'تعرض سجلات البلاغات المسندة إليك فقط وفق صلاحيات دورك'
  }, [user])

  const filterLabel = filterAction === 'all'
    ? 'كل الأنشطة'
    : (ACTION_STYLE[filterAction]?.label || filterAction)

  const filtered = scopedLogs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (l.reportId || '').toLowerCase().includes(q) ||
        (l.userName || '').toLowerCase().includes(q) ||
        (l.entity || '').toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)
    }
    return true
  })

  // ── Professional print ───────────────────────────────────────────────────
  const handlePrint = () => {
    const now = new Date()
    const printDate = now.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
    const printTime = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    const html = buildPrintHTML({ logs: filtered, user, scopeLabel, filterLabel, printDate, printTime })
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) { alert('يرجى السماح للنافذة المنبثقة في المتصفح'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">سجل التدقيق</h1>
            {user && !['admin', 'executive', 'auditor'].includes(user.role) && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                <Lock size={9} />{scopeLabel}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">تتبع الأنشطة والعمليات في نطاق صلاحيتك</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={filtered.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all bg-white dark:bg-gray-900">
          <Printer size={14} />
          طباعة السجل ({filtered.length})
        </button>
      </div>

      {/* Security / scope badge */}
      <div className="rounded-xl p-4 flex items-start gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
        <Shield size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">النظام متوافق مع معايير الأمن السيبراني</p>
          <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">
            جميع الأنشطة مسجلة تلقائياً · متوافق مع هيئة الأمن السيبراني السعودية (NCA)
            {scopeDescription && ` · ${scopeDescription}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{scopedLogs.length}</p>
          <p className="text-xs text-slate-400 dark:text-gray-600">في نطاقك</p>
        </div>
      </div>

      {/* Scope restriction notice for monitor/manager */}
      {scopeDescription && (
        <div className="rounded-xl p-3 flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">{scopeDescription}</p>
        </div>
      )}

      {/* Filters */}
      <div className={`${card} rounded-xl p-3 flex flex-wrap items-center gap-3`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2">
          <Search size={13} className="text-slate-400 dark:text-gray-500 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم البلاغ، المستخدم، الجهة، التفاصيل..."
            className="flex-1 bg-transparent text-sm text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none min-w-0" />
        </div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="all">كل الأنشطة</option>
          {Object.entries(ACTION_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-xs text-slate-400 dark:text-gray-500 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2">
          {filtered.length} سجل
        </span>
      </div>

      {/* Empty */}
      {scopedLogs.length === 0 && (
        <div className={`${card} rounded-xl py-16 text-center`}>
          <Shield size={36} className="mx-auto mb-3 text-slate-300 dark:text-gray-700" />
          <p className="text-slate-400 dark:text-gray-500 font-medium">لا توجد سجلات في نطاقك بعد</p>
          <p className="text-slate-400 dark:text-gray-600 text-sm mt-1">تظهر السجلات تلقائياً عند تنفيذ أي عملية على البلاغات المسندة إليك</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className={`${card} rounded-xl overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50">
                {['النشاط', 'البلاغ', 'المنفذ', 'الجهة', 'التفاصيل', 'التاريخ والوقت'].map(h => (
                  <th key={h} className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {filtered.map(log => {
                const style = ACTION_STYLE[log.action] || ACTION_STYLE.comment
                return (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.reportId ? (
                        <Link to={`/reports/${log.reportId}`}
                          className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-lg inline-block">
                          {log.reportId}
                        </Link>
                      ) : <span className="text-xs text-slate-400 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-xs text-blue-600 dark:text-blue-400 font-bold flex-shrink-0">
                          {(log.userName || '?').charAt(0)}
                        </div>
                        <span className="text-xs text-slate-700 dark:text-gray-200">{log.userName || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500 dark:text-gray-400">{log.entity || '—'}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-xs text-slate-500 dark:text-gray-400">{log.details || AUDIT_ACTIONS[log.action] || '—'}</p>
                      {log.fromStatus && log.toStatus && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {[log.fromStatus, log.toStatus].map((s, i) => {
                            const cfg = getStatusCfg(s)
                            return (
                              <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                {cfg.label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-slate-600 dark:text-gray-300 font-medium">
                        {new Date(log.timestamp).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
