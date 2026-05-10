import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { regulationData } from '@/data/mockData'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { useReportScope } from '@/hooks/useReportScope'
import { getStatusCfg, BASKET_CONFIG, CLOSURE_TYPES, normalizeStatus } from '@/data/caseConfig'
import { useApiReports, normalizeApiReport } from '@/hooks/useApiReports'
import {
  Plus, Search, Grid3X3, List, ChevronLeft, AlertTriangle, Clock,
  Shield, Lock, Trash2, RefreshCw, CheckCircle2, KeyRound, AlertCircle,
  XCircle, FileText, Database,
} from 'lucide-react'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'

const sourceLabels = {
  ai:           { label: 'ذكاء اصطناعي', style: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30' },
  manual:       { label: 'يدوي',          style: 'bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600' },
  mobile:       { label: 'جوّال',         style: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30' },
  drone:        { label: 'طائرة مسيّرة', style: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30' },
  gis_import:   { label: 'استيراد GIS',  style: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-500/30' },
  media_upload: { label: 'رفع وسائط',    style: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/30' },
}

const priorityConfig = {
  critical: { label: 'حرجة',    dot: 'bg-red-500' },
  high:     { label: 'عالية',   dot: 'bg-orange-500' },
  medium:   { label: 'متوسطة', dot: 'bg-amber-400' },
  low:      { label: 'منخفضة', dot: 'bg-slate-400' },
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = getStatusCfg(status)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ report, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${card} rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">حذف البلاغ</p>
            <p className="text-xs text-slate-500 dark:text-gray-500">سيُنقل إلى سلة المحذوفات · يمكن الاستعادة لاحقاً</p>
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{report.id}</p>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{report.elementName || report.title}</p>
          {report.district && <p className="text-xs text-slate-400 dark:text-gray-500">{report.district}</p>}
        </div>
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            البلاغات المغلقة نهائياً لا يمكن حذفها · هذا الإجراء مُسجَّل في سجل التدقيق
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={() => onConfirm(report)}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Trash2 size={14} />نقل للمحذوفات
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Restore Request Modal (manager submits justification) ────────────────────
function RestoreRequestModal({ report, onSubmit, onCancel }) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${card} rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <RefreshCw size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">طلب استعادة بلاغ مكتمل</p>
            <p className="text-xs text-slate-500 dark:text-gray-500">سيُرفع الطلب لمدير النظام للاعتماد بالرقم السري</p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{report.id}</p>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{report.elementName || report.title}</p>
          {report.entity && <p className="text-xs text-slate-400 dark:text-gray-500">{report.entity}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
            سبب طلب الاستعادة <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            placeholder="اذكر المسوّغات الموجبة لإعادة فتح هذا البلاغ..."
            className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            الاستعادة تستلزم موافقة مدير النظام بالرقم السري · تُسجَّل العملية كاملاً في سجل التدقيق
          </p>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={() => reason.trim() && onSubmit(report, reason.trim())} disabled={!reason.trim()}
            className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <FileText size={14} />رفع الطلب
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Restore Approval Modal (admin reviews request + PIN) ─────────────────────
function RestoreApprovalModal({ request, onApprove, onReject, onCancel }) {
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [mode, setMode] = useState('review') // 'review' | 'approve' | 'reject'

  const handleApprove = () => {
    if (!pin.trim()) { setPinError('يرجى إدخال الرقم السري'); return }
    onApprove(request.id, pin.trim(), (err) => {
      setPinError(err)
      setPin('')
    })
  }

  const handleReject = () => {
    if (!rejectNote.trim()) return
    onReject(request.id, rejectNote.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${card} rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">مراجعة طلب استعادة بلاغ مكتمل</p>
            <p className="text-xs text-slate-500 dark:text-gray-500">اعتماد الطلب أو رفضه — يُسجَّل القرار في سجل التدقيق</p>
          </div>
        </div>

        {/* Request details */}
        <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{request.reportId}</p>
            <span className="text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">طلب معلق</span>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{request.reportTitle}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400 dark:text-gray-600 mb-0.5">مقدم الطلب</p>
              <p className="font-medium text-slate-700 dark:text-gray-300">{request.requesterName}</p>
            </div>
            <div>
              <p className="text-slate-400 dark:text-gray-600 mb-0.5">الجهة</p>
              <p className="font-medium text-slate-700 dark:text-gray-300">{request.requesterEntity || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 dark:text-gray-600 mb-0.5">تاريخ الطلب</p>
              <p className="font-medium text-slate-700 dark:text-gray-300">
                {new Date(request.createdAt).toLocaleDateString('ar-SA')}
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-gray-700">
            <p className="text-xs text-slate-400 dark:text-gray-600 mb-1">سبب الطلب</p>
            <p className="text-sm text-slate-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{request.reason}</p>
          </div>
        </div>

        {mode === 'review' && (
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
              لاحقاً
            </button>
            <button onClick={() => setMode('reject')}
              className="flex-1 py-2.5 rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5">
              <XCircle size={14} />رفض الطلب
            </button>
            <button onClick={() => setMode('approve')}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} />اعتماد
            </button>
          </div>
        )}

        {mode === 'approve' && (
          <div className="space-y-3">
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3 flex items-start gap-2">
              <KeyRound size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                يتطلب الاعتماد إدخال الرقم السري لمدير النظام · ستنتقل الحالة إلى «مراجعة الجودة» للمراجعة مجدداً
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                الرقم السري <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={pin}
                onChange={e => { setPin(e.target.value); setPinError('') }}
                placeholder="أدخل الرقم السري لمدير النظام"
                className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              {pinError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle size={11} />{pinError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMode('review'); setPin(''); setPinError('') }}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                رجوع
              </button>
              <button onClick={handleApprove} disabled={!pin.trim()}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
                <CheckCircle2 size={14} />تأكيد الاعتماد
              </button>
            </div>
          </div>
        )}

        {mode === 'reject' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1.5">
                سبب الرفض <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                placeholder="وضّح مسوّغ رفض طلب الاستعادة..."
                className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMode('review')}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                رجوع
              </button>
              <button onClick={handleReject} disabled={!rejectNote.trim()}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
                <XCircle size={14} />تأكيد الرفض
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Basket tab bar ───────────────────────────────────────────────────────────
function BasketTabs({ activeBasket, setActiveBasket, counts, isAdmin, pendingRestoreCount }) {
  const tabs = [
    { id: 'all',            label: 'جميع البلاغات',  count: counts.all,            icon: null },
    { id: 'quality_review', label: 'مراجعة الجودة',  count: counts.quality_review, icon: <Shield size={12} /> },
    { id: 'enforcement',    label: 'سلة الإنفاذ',    count: counts.enforcement,    icon: <AlertTriangle size={12} /> },
    { id: 'notice',         label: 'سلة الإشعارات',  count: counts.notice,         icon: <Clock size={12} /> },
    { id: 'unidentified',   label: 'مجهول المخالف',  count: counts.unidentified,   icon: null },
    { id: 'closed_final',   label: 'مكتملة',          count: counts.closed_final,   icon: <CheckCircle2 size={12} />, pendingCount: isAdmin ? pendingRestoreCount : 0 },
    ...(isAdmin ? [{ id: 'deleted', label: 'المحذوفات', count: counts.deleted, icon: <Trash2 size={12} /> }] : []),
  ]

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {tabs.map(t => {
        const isDelTab = t.id === 'deleted'
        const isActive = activeBasket === t.id
        return (
          <button key={t.id} onClick={() => setActiveBasket(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              isActive
                ? isDelTab ? 'bg-red-600 text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'
                : isDelTab
                  ? 'bg-white dark:bg-gray-900 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                  : 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800'
            }`}>
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                isActive ? 'bg-white/20 text-white' :
                isDelTab ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400'
              }`}>
                {t.count}
              </span>
            )}
            {/* Pending restore requests badge (admin only, closed_final tab) */}
            {t.pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                {t.pendingCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Report thumbnail ─────────────────────────────────────────────────────────
function Thumbnail({ media, color }) {
  if (media?.length > 0 && media[0].url) {
    return (
      <img src={media[0].url} alt=""
        className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-gray-700 flex-shrink-0" />
    )
  }
  return (
    <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center border border-slate-200 dark:border-gray-700"
      style={{ background: (color || '#3B82F6') + '18' }}>
      <div className="w-4 h-4 rounded-full" style={{ background: color || '#3B82F6' }} />
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────
function ReportRow({ r, onDelete, onRestore, onRequestRestore, hasPendingRestore }) {
  const isDeleted = !!r.isDeleted
  const status = normalizeStatus(r.status)
  const canDelete = !!onDelete && !isDeleted && status !== 'closed_final' && !r.fromApi
  const src = sourceLabels[r.source] || sourceLabels.manual
  const pri = priorityConfig[r.priority] || priorityConfig.medium
  const closureInfo = r.closureType ? CLOSURE_TYPES[r.closureType] : null
  const noticeDeadline = r.closureType === 'notice_posted' && r.noticeDeadline ? new Date(r.noticeDeadline) : null
  const noticeOverdue = noticeDeadline && noticeDeadline < new Date()
  const noticeUrgent = noticeDeadline && !noticeOverdue && (noticeDeadline - new Date()) < 3 * 86400000

  const inner = (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-gray-800 last:border-0 transition-colors ${isDeleted ? 'bg-red-50/30 dark:bg-red-500/5 opacity-70' : 'hover:bg-slate-50 dark:hover:bg-gray-800/50 group'}`}>

      {isDeleted
        ? <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <Trash2 size={16} className="text-red-400 dark:text-red-500" />
          </div>
        : <Thumbnail media={r.media} color={r.elementColor} />
      }

      <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-4 min-w-0">
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-0.5">{r.id}</p>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate leading-tight">
            {r.elementName || r.title}
          </p>
          {r.district && <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5 truncate">{r.district}</p>}
        </div>

        <div className="col-span-3 flex flex-col gap-1">
          <StatusBadge status={status} />
          {closureInfo && (
            <span className="text-xs font-medium" style={{ color: closureInfo.color }}>{closureInfo.label}</span>
          )}
          {noticeOverdue && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
              <Clock size={10} />منتهية
            </span>
          )}
          {noticeUrgent && !noticeOverdue && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock size={10} />قريبة
            </span>
          )}
          {isDeleted && (
            <span className="text-xs font-medium text-red-500 dark:text-red-400 flex items-center gap-1">
              <Trash2 size={10} />محذوف
            </span>
          )}
        </div>

        <div className="col-span-3 hidden md:block">
          <p className="text-xs text-slate-600 dark:text-gray-400 truncate">{r.entity || '—'}</p>
          <p className="text-xs text-slate-400 dark:text-gray-600 truncate mt-0.5">
            {r.assignedTo ? `مُسند: ${r.assignedTo}` : 'غير مُسند'}
          </p>
        </div>

        <div className="col-span-2 text-right">
          <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
            {(r.estimatedFine || 0).toLocaleString('ar-SA')}
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-600">ر.س</p>
          <div className="flex items-center gap-1 justify-end mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} />
            <span className="text-xs text-slate-400 dark:text-gray-600">{pri.label}</span>
          </div>
        </div>
      </div>

      {isDeleted ? (
        <div className="flex-shrink-0 text-right hidden sm:block w-28">
          <span className="inline-flex text-xs px-1.5 py-0.5 rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">محذوف</span>
          {r.deletedAt && (
            <p className="text-xs text-slate-400 dark:text-gray-600 mt-1">
              {new Date(r.deletedAt).toLocaleDateString('ar-SA')}
            </p>
          )}
        </div>
      ) : (
        <div className="flex-shrink-0 text-right hidden sm:block w-24">
          <span className={`inline-flex text-xs px-1.5 py-0.5 rounded-md ${src.style}`}>{src.label}</span>
          <p className="text-xs text-slate-400 dark:text-gray-600 mt-1">
            {new Date(r.createdAt).toLocaleDateString('ar-SA')}
          </p>
        </div>
      )}

      {/* Action buttons */}
      {canDelete && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(r) }}
          title="حذف البلاغ"
          className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">
          <Trash2 size={13} />
        </button>
      )}
      {isDeleted && onRestore && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onRestore(r) }}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
          <RefreshCw size={10} />استعادة
        </button>
      )}
      {/* Manager: request restore for closed_final */}
      {!isDeleted && status === 'closed_final' && onRequestRestore && (
        hasPendingRestore
          ? <span className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <Clock size={10} />معلق
            </span>
          : <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onRequestRestore(r) }}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors opacity-0 group-hover:opacity-100">
              <RefreshCw size={10} />طلب استعادة
            </button>
      )}
      {!isDeleted && (
        <ChevronLeft size={14} className="text-slate-300 dark:text-gray-700 flex-shrink-0 group-hover:text-slate-500 dark:group-hover:text-gray-400 transition-colors" />
      )}
    </div>
  )

  if (isDeleted) return inner
  return <Link to={`/reports/${r.id}`} className="block">{inner}</Link>
}

// ─── Card view ────────────────────────────────────────────────────────────────
function ReportCard({ r, onDelete, onRestore, onRequestRestore, hasPendingRestore }) {
  const isDeleted = !!r.isDeleted
  const status = normalizeStatus(r.status)
  const canDelete = !!onDelete && !isDeleted && status !== 'closed_final' && !r.fromApi
  const closureInfo = r.closureType ? CLOSURE_TYPES[r.closureType] : null

  const inner = (
    <div className={`${card} rounded-xl p-4 space-y-3 ${isDeleted ? 'opacity-70 bg-red-50/30 dark:bg-red-500/5' : 'hover:shadow-md'} transition-all`}>
      <div className="flex items-start gap-3">
        {isDeleted
          ? <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <Trash2 size={16} className="text-red-400" />
            </div>
          : <Thumbnail media={r.media} color={r.elementColor} />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{r.id}</p>
          <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 leading-tight mt-0.5 line-clamp-2">
            {r.elementName || r.title}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <StatusBadge status={status} />
        {closureInfo && (
          <span className="text-xs font-medium" style={{ color: closureInfo.color }}>{closureInfo.label}</span>
        )}
        {isDeleted && (
          <span className="text-xs font-medium text-red-500 dark:text-red-400 flex items-center gap-1">
            <Trash2 size={10} />محذوف
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 dark:text-gray-500">{r.district || '—'}</span>
        <span className="font-bold text-amber-600 dark:text-amber-400">
          {(r.estimatedFine || 0).toLocaleString('ar-SA')} ر.س
        </span>
      </div>
      <p className="text-xs text-slate-400 dark:text-gray-600 truncate">{r.entity || 'غير مُسند'}</p>

      {(canDelete || (isDeleted && onRestore) || (!isDeleted && status === 'closed_final' && onRequestRestore)) && (
        <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-gray-800">
          {canDelete && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(r) }}
              className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors">
              <Trash2 size={11} />حذف
            </button>
          )}
          {isDeleted && onRestore && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onRestore(r) }}
              className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-2 py-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors">
              <RefreshCw size={10} />استعادة
            </button>
          )}
          {!isDeleted && status === 'closed_final' && onRequestRestore && (
            hasPendingRestore
              ? <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2 py-1 rounded-lg">
                  <Clock size={10} />طلب معلق
                </span>
              : <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onRequestRestore(r) }}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                  <RefreshCw size={10} />طلب استعادة
                </button>
          )}
        </div>
      )}
    </div>
  )

  if (isDeleted) return inner
  return <Link to={`/reports/${r.id}`} className="block group">{inner}</Link>
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ basket }) {
  if (basket === 'all') {
    return (
      <div className={`${card} rounded-xl py-20 text-center`}>
        <p className="text-slate-400 dark:text-gray-500 text-lg font-medium mb-2">لا توجد بلاغات بعد</p>
        <p className="text-slate-400 dark:text-gray-600 text-sm mb-5">ابدأ بإنشاء أول بلاغ في المنصة</p>
        <Link to="/reports/new"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={15} />إنشاء أول بلاغ
        </Link>
      </div>
    )
  }
  if (basket === 'closed_final') {
    return (
      <div className={`${card} rounded-xl py-16 text-center`}>
        <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-300 dark:text-emerald-700" />
        <p className="text-lg font-medium mb-2 text-emerald-600 dark:text-emerald-400">لا توجد بلاغات مكتملة</p>
        <p className="text-slate-400 dark:text-gray-600 text-sm">البلاغات التي اجتازت مراجعة الجودة النهائية تظهر هنا</p>
      </div>
    )
  }
  if (basket === 'deleted') {
    return (
      <div className={`${card} rounded-xl py-16 text-center`}>
        <Trash2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-gray-600" />
        <p className="text-lg font-medium mb-2 text-slate-500 dark:text-gray-400">سلة المحذوفات فارغة</p>
        <p className="text-slate-400 dark:text-gray-600 text-sm">البلاغات المحذوفة قابلة للاستعادة بالكامل</p>
      </div>
    )
  }
  const cfg = BASKET_CONFIG[basket]
  return (
    <div className={`${card} rounded-xl py-16 text-center`}>
      <p className={`text-lg font-medium mb-2 ${cfg?.color || 'text-slate-400 dark:text-gray-500'}`}>
        {cfg?.label || 'لا توجد بلاغات'}
      </p>
      <p className="text-slate-400 dark:text-gray-600 text-sm">{cfg?.desc || ''}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReportsBasket() {
  const { reports: allReports, deleteReport, restoreReport, restoreRequests, requestRestore, approveRestoreRequest, rejectRestoreRequest } = useData()
  const { user } = useAuth()
  const { scopedReports, isRestricted, scopeLabel } = useReportScope()
  const [searchParams] = useSearchParams()

  const isAdmin = user?.role === 'admin' || user?.isSystemAdmin
  const isManager = user?.role === 'manager' && !isAdmin

  const [search, setSearch] = useState('')
  const [filterEl, setFilterEl] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [activeBasket, setActiveBasket] = useState(searchParams.get('basket') || 'all')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [restoreRequestTarget, setRestoreRequestTarget] = useState(null) // closed_final report manager wants to restore
  const [approvalTarget, setApprovalTarget] = useState(null)             // pending restore request admin is reviewing

  // API-backed reports (GIS imports, media uploads, manually created via API)
  const { reports: rawApiReports, loading: apiLoading } = useApiReports({ limit: '500' })
  const localIds = useMemo(() => new Set(allReports.map(r => r.id)), [allReports])
  const mergedApiReports = useMemo(
    () => rawApiReports
      .filter(r => !localIds.has(r.id))
      .map(normalizeApiReport),
    [rawApiReports, localIds],
  )

  const deletedReports = useMemo(
    () => isAdmin ? allReports.filter(r => r.isDeleted) : [],
    [isAdmin, allReports]
  )

  const pendingRestoreCount = useMemo(
    () => isAdmin ? restoreRequests.filter(q => q.status === 'pending').length : 0,
    [isAdmin, restoreRequests]
  )

  // Report IDs that have a pending restore request
  const pendingRestoreReportIds = useMemo(
    () => new Set(restoreRequests.filter(q => q.status === 'pending').map(q => q.reportId)),
    [restoreRequests]
  )

  const usedElements = regulationData.filter(el => scopedReports.some(r => r.element === el.id))

  // Merge API reports into the active list (except deleted basket which is localStorage-only)
  const baseList = useMemo(
    () => activeBasket === 'deleted' ? deletedReports : [...scopedReports, ...mergedApiReports],
    [activeBasket, deletedReports, scopedReports, mergedApiReports],
  )

  const basketFilter = (r) => {
    if (activeBasket === 'all') return true
    if (activeBasket === 'quality_review') return normalizeStatus(r.status) === 'quality_review'
    if (activeBasket === 'closed_final') return normalizeStatus(r.status) === 'closed_final'
    if (BASKET_CONFIG[activeBasket]) return BASKET_CONFIG[activeBasket].filter(r)
    return true
  }

  const filtered = baseList
    .filter(r => activeBasket === 'deleted' || basketFilter(r))
    .filter(r => filterEl === 'all' || r.element === filterEl)
    .filter(r => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (r.id || '').toLowerCase().includes(q) ||
        (r.elementName || r.title || '').toLowerCase().includes(q) ||
        (r.district || '').toLowerCase().includes(q) ||
        (r.entity || '').toLowerCase().includes(q)
    })

  const allActive = [...scopedReports, ...mergedApiReports]
  const counts = {
    all:            allActive.length,
    quality_review: allActive.filter(r => normalizeStatus(r.status) === 'quality_review').length,
    enforcement:    allActive.filter(r => r.closureType === 'fine_issued').length,
    notice:         allActive.filter(r => r.closureType === 'notice_posted').length,
    unidentified:   allActive.filter(r => r.closureType === 'unknown_offender').length,
    closed_final:   allActive.filter(r => normalizeStatus(r.status) === 'closed_final').length,
    deleted:        deletedReports.length,
  }

  const handleDeleteConfirm = (r) => {
    deleteReport(r.id, user)
    setConfirmDelete(null)
  }

  const handleRestore = (r) => {
    restoreReport(r.id, user)
  }

  const handleRequestRestore = (report, reason) => {
    requestRestore(report.id, reason, user)
    setRestoreRequestTarget(null)
  }

  const handleApproveRestore = (requestId, pin, onError) => {
    const result = approveRestoreRequest(requestId, pin, user)
    if (!result.success) {
      onError(result.error)
    } else {
      setApprovalTarget(null)
    }
  }

  const handleRejectRestore = (requestId, note) => {
    rejectRestoreRequest(requestId, note, user)
    setApprovalTarget(null)
  }

  const onDelete = (isAdmin && activeBasket !== 'deleted') ? (r) => setConfirmDelete(r) : null
  const onRestore = (isAdmin && activeBasket === 'deleted') ? handleRestore : null
  const onRequestRestore = isManager ? (r) => setRestoreRequestTarget(r) : null

  // Pending restore requests visible to admin in closed_final basket
  const pendingRequests = useMemo(
    () => isAdmin ? restoreRequests.filter(q => q.status === 'pending') : [],
    [isAdmin, restoreRequests]
  )

  return (
    <div className="space-y-4">
      {/* Modals */}
      {confirmDelete && (
        <DeleteConfirmModal
          report={confirmDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      {restoreRequestTarget && (
        <RestoreRequestModal
          report={restoreRequestTarget}
          onSubmit={handleRequestRestore}
          onCancel={() => setRestoreRequestTarget(null)}
        />
      )}
      {approvalTarget && (
        <RestoreApprovalModal
          request={approvalTarget}
          onApprove={handleApproveRestore}
          onReject={handleRejectRestore}
          onCancel={() => setApprovalTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">سلة البلاغات</h1>
            {isRestricted && scopeLabel && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                <Lock size={9} />{scopeLabel}
              </span>
            )}
            {activeBasket === 'deleted' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                <Trash2 size={9} />سلة المحذوفات
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">
            {allActive.length} بلاغ ·{' '}
            {allActive.filter(r => !['closed_final', 'rejected'].includes(r.status)).length} مفتوح ·{' '}
            {allActive.filter(r => r.status === 'closed_final').length} مكتمل
            {isAdmin && deletedReports.length > 0 && ` · ${deletedReports.length} محذوف`}
            {mergedApiReports.length > 0 && (
              <span className="inline-flex items-center gap-1 mr-1 text-teal-600 dark:text-teal-400">
                · <Database size={11} className="inline" /> {mergedApiReports.length} مستورد
              </span>
            )}
          </p>
        </div>
        <Link to="/reports/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={15} />بلاغ جديد
        </Link>
      </div>

      {/* Basket tabs */}
      <BasketTabs
        activeBasket={activeBasket}
        setActiveBasket={setActiveBasket}
        counts={counts}
        isAdmin={isAdmin}
        pendingRestoreCount={pendingRestoreCount}
      />

      {/* Basket description banners */}
      {activeBasket === 'deleted' && (
        <div className="rounded-xl p-3 flex items-center gap-3 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10">
          <Trash2 size={14} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300">
            البلاغات المحذوفة لا تظهر في أي سلة أخرى · يمكن لمدير النظام استعادتها · جميع عمليات الحذف مُسجَّلة في سجل التدقيق
          </p>
        </div>
      )}
      {activeBasket === 'closed_final' && (
        <div className="rounded-xl p-3 flex items-center gap-3 border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10">
          <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            البلاغات المكتملة محمية من الحذف المباشر · الاستعادة تستلزم طلباً رسمياً من مدير الجهة واعتماداً من مدير النظام بالرقم السري
          </p>
        </div>
      )}
      {activeBasket !== 'all' && activeBasket !== 'deleted' && activeBasket !== 'closed_final' && BASKET_CONFIG[activeBasket] && (
        <div className={`rounded-xl p-3 flex items-center gap-3 border ${BASKET_CONFIG[activeBasket].border} ${BASKET_CONFIG[activeBasket].bg}`}>
          <AlertTriangle size={14} className={BASKET_CONFIG[activeBasket].color} />
          <p className={`text-xs ${BASKET_CONFIG[activeBasket].color}`}>{BASKET_CONFIG[activeBasket].desc}</p>
        </div>
      )}

      {/* Imported reports info banner */}
      {activeBasket === 'all' && mergedApiReports.length > 0 && (
        <div className="rounded-xl p-3 flex items-center gap-3 border border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10">
          <Database size={14} className="text-teal-600 dark:text-teal-400 flex-shrink-0" />
          <p className="text-xs text-teal-700 dark:text-teal-300">
            {mergedApiReports.length} بلاغ مستورد من قاعدة البيانات (GIS / وسائط) · مدرجة في القائمة مع شارة المصدر
            {apiLoading && ' · جارٍ التحديث...'}
          </p>
        </div>
      )}

      {/* Admin: pending restore requests panel (closed_final basket only) */}
      {isAdmin && activeBasket === 'closed_final' && pendingRequests.length > 0 && (
        <div className={`${card} rounded-xl overflow-hidden`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-gray-800 bg-amber-50 dark:bg-amber-500/10">
            <RefreshCw size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              طلبات الاستعادة المعلقة ({pendingRequests.length})
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-gray-800">
            {pendingRequests.map(req => (
              <div key={req.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/50">
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{req.reportId}</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">{req.reportTitle}</p>
                  </div>
                  <div className="col-span-3 hidden md:block">
                    <p className="text-xs text-slate-600 dark:text-gray-400 truncate">{req.requesterName}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-600 truncate">{req.requesterEntity || '—'}</p>
                  </div>
                  <div className="col-span-3 hidden md:block">
                    <p className="text-xs text-slate-500 dark:text-gray-400 line-clamp-2">{req.reason}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-slate-400 dark:text-gray-600">
                      {new Date(req.createdAt).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setApprovalTarget(req)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  <Shield size={11} />مراجعة
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={`${card} rounded-xl p-3 flex flex-wrap items-center gap-3`}>
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2">
          <Search size={13} className="text-slate-400 dark:text-gray-500 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالرقم، العنصر، الحي..."
            className="flex-1 bg-transparent text-sm text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none min-w-0" />
        </div>

        {activeBasket !== 'deleted' && (
          <select value={filterEl} onChange={e => setFilterEl(e.target.value)}
            className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer">
            <option value="all">كل العناصر</option>
            {usedElements.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}

        <div className="flex gap-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-0.5">
          <button onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-slate-700 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>
            <List size={14} />
          </button>
          <button onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 shadow-sm text-slate-700 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>
            <Grid3X3 size={14} />
          </button>
        </div>

        <span className="text-xs text-slate-400 dark:text-gray-500 mr-auto">
          {filtered.length} نتيجة
        </span>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState basket={activeBasket} />
      ) : viewMode === 'list' ? (
        <div className={`${card} rounded-xl overflow-hidden`}>
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50 dark:bg-gray-800/50 border-b border-slate-200 dark:border-gray-800 text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide items-center">
            <div className="col-span-1" />
            <div className="col-span-4">البلاغ</div>
            <div className="col-span-3">الحالة</div>
            <div className="col-span-3">الجهة</div>
            <div className="col-span-1 text-right">الغرامة</div>
          </div>
          {filtered.map(r => (
            <ReportRow
              key={r.id} r={r}
              onDelete={onDelete}
              onRestore={onRestore}
              onRequestRestore={onRequestRestore}
              hasPendingRestore={pendingRestoreReportIds.has(r.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <ReportCard
              key={r.id} r={r}
              onDelete={onDelete}
              onRestore={onRestore}
              onRequestRestore={onRequestRestore}
              hasPendingRestore={pendingRestoreReportIds.has(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
