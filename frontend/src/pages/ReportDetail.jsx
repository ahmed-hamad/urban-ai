import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import {
  ArrowRight, MapPin, CheckCircle2, Clock, Lock, XCircle,
  RefreshCw, AlertCircle, Building2, Camera, Upload,
  FileText, Shield, User, AlertTriangle, GitBranch, UserCheck, ChevronLeft,
} from 'lucide-react'
import { regulationData } from '@/data/mockData'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import { canAccessReport } from '@/hooks/useReportScope'
import { useApiReportById, useApiReportAudit } from '@/hooks/useApiReports'
import {
  STATUS_TRANSITIONS, TRANSITION_PERMISSIONS, REQUIRES_REASON, REQUIRES_CLOSURE_FORM,
  CLOSURE_TYPES, CLOSURE_STATUSES, BASKET_CONFIG, AUDIT_ACTIONS, getStatusCfg, normalizeStatus,
} from '@/data/caseConfig'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl'

// ─── Image Viewer ─────────────────────────────────────────────────────────────
function ImageViewer({ images, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex)
  const [scale, setScale] = useState(1)

  const prev = useCallback(() => { setIndex(i => Math.max(0, i - 1)); setScale(1) }, [])
  const next = useCallback(() => { setIndex(i => Math.min(images.length - 1, i + 1)); setScale(1) }, [images.length])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') next()
      else if (e.key === 'ArrowRight') prev()
      else if (e.key === 'Escape') onClose()
      else if ((e.key === '+' || e.key === '=') && !e.ctrlKey) setScale(s => Math.min(4, +(s + 0.5).toFixed(1)))
      else if (e.key === '-' && !e.ctrlKey) setScale(s => Math.max(1, +(s - 0.5).toFixed(1)))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev, onClose])

  const handleWheel = (e) => {
    e.preventDefault()
    setScale(s => e.deltaY < 0 ? Math.min(4, +(s + 0.25).toFixed(2)) : Math.max(1, +(s - 0.25).toFixed(2)))
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/97 flex flex-col select-none" dir="ltr">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b border-white/10">
        <span className="text-white/60 text-sm">{index + 1} / {images.length}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setScale(s => Math.max(1, +(s - 0.5).toFixed(1)))}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center transition-colors">−</button>
          <span className="text-white/60 text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(4, +(s + 0.5).toFixed(1)))}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center transition-colors">+</button>
          <button onClick={() => setScale(1)}
            className="px-3 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-xs transition-colors">إعادة ضبط</button>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-red-500/60 text-white text-lg flex items-center justify-center transition-colors">✕</button>
        </div>
      </div>

      {/* Main image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative"
        onWheel={handleWheel}>
        <img
          src={images[index]?.url || images[index]}
          alt=""
          style={{ transform: `scale(${scale})`, transition: scale === 1 ? 'transform 0.2s' : 'none', maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', cursor: scale > 1 ? 'zoom-out' : 'zoom-in' }}
          onClick={() => setScale(s => s > 1 ? 1 : 2)}
          draggable={false}
        />
        {images.length > 1 && (
          <>
            <button onClick={prev} disabled={index === 0}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 disabled:opacity-20 text-white text-2xl flex items-center justify-center transition-all">‹</button>
            <button onClick={next} disabled={index === images.length - 1}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 disabled:opacity-20 text-white text-2xl flex items-center justify-center transition-all">›</button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 justify-center border-t border-white/10">
          {images.map((img, i) => (
            <button key={i} onClick={() => { setIndex(i); setScale(1) }}
              className={`w-14 h-14 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${i === index ? 'border-white opacity-100' : 'border-transparent opacity-40 hover:opacity-70'}`}>
              <img src={img?.url || img} alt="" className="w-full h-full object-cover" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const mapIcon = (color) => L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
})

const PRIORITY_CONFIG = {
  critical: { label: 'حرجة',    color: 'text-red-600 dark:text-red-400' },
  high:     { label: 'عالية',   color: 'text-orange-600 dark:text-orange-400' },
  medium:   { label: 'متوسطة', color: 'text-amber-600 dark:text-amber-400' },
  low:      { label: 'منخفضة', color: 'text-slate-500 dark:text-slate-400' },
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = getStatusCfg(status)
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

// ─── Rejection / Reopen Modal ─────────────────────────────────────────────────
function ReasonModal({ title, placeholder, confirmLabel, confirmClass, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
            <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h3>
        </div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder={placeholder || 'اكتب السبب هنا...'}
          className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-red-400 resize-none" />
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            {'إلغاء'}
          </button>
          <button onClick={() => onConfirm(reason)} disabled={!reason.trim()}
            className={`flex-1 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors ${confirmClass || 'bg-red-600 hover:bg-red-700'}`}>
            {confirmLabel || 'تأكيد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Closure Form Modal ───────────────────────────────────────────────────────
function ClosureModal({ onConfirm, onCancel }) {
  const [closureType, setClosureType] = useState('')
  const [afterPhotos, setAfterPhotos] = useState([])
  const [noticeDuration, setNoticeDuration] = useState(7)
  const [letterNumber, setLetterNumber] = useState('')
  const [letterPhoto, setLetterPhoto] = useState(null)

  const canSubmit = closureType && afterPhotos.length > 0 &&
    (closureType !== 'unknown_offender' || letterNumber.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 dark:border-gray-700 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-500/10 flex items-center justify-center">
            <Lock size={18} className="text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">{'إغلاق البلاغ'}</h3>
            <p className="text-xs text-slate-400 dark:text-gray-500">{'يلزم رفع صورة بعد المعالجة وتحديد نوع الإجراء'}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-gray-400">{'نوع الإجراء المتخذ *'}</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CLOSURE_TYPES).map(([k, v]) => (
              <button key={k} onClick={() => setClosureType(k)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-right transition-all ${closureType === k ? 'border-2' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}
                style={closureType === k ? { borderColor: v.color, background: v.color + '15' } : {}}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: v.color }} />
                <span className="text-xs font-medium text-slate-700 dark:text-gray-200">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-gray-400">{'صور بعد المعالجة *'}</p>
          <label className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-xl p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
            <Camera size={20} className="text-slate-400 dark:text-gray-500" />
            <span className="text-xs text-slate-500 dark:text-gray-400">{'انقر لاختيار صور'}</span>
            <input type="file" multiple accept="image/*" className="hidden"
              onChange={async e => {
                const toB64 = f => new Promise(res => { const r = new FileReader(); r.onload = () => res({ name: f.name, url: r.result }); r.readAsDataURL(f) })
                setAfterPhotos(await Promise.all(Array.from(e.target.files).map(toB64)))
              }} />
          </label>
          {afterPhotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {afterPhotos.map((f, i) => (
                <img key={i} src={f.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-slate-200 dark:border-gray-700" />
              ))}
            </div>
          )}
        </div>

        {closureType === 'notice_posted' && (
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">{'مدة الإشعار (أيام) *'}</p>
            <input type="number" min={1} max={90} value={noticeDuration} onChange={e => setNoticeDuration(Number(e.target.value))}
              className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500" />
          </div>
        )}

        {closureType === 'unknown_offender' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">{'رقم الخطاب الرسمي *'}</p>
              <input value={letterNumber} onChange={e => setLetterNumber(e.target.value)} placeholder={'مثال: 2024/1234'}
                className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500" />
            </div>
            <label className="flex items-center gap-2 border border-dashed border-slate-200 dark:border-gray-700 rounded-xl p-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors">
              <Upload size={14} className="text-slate-400 dark:text-gray-500" />
              <span className="text-xs text-slate-500 dark:text-gray-400">{'إرفاق صورة الخطاب (اختياري)'}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={async e => {
                if (e.target.files[0]) {
                  const f = e.target.files[0]
                  const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })
                  setLetterPhoto({ name: f.name, url })
                }
              }} />
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            {'إلغاء'}
          </button>
          <button disabled={!canSubmit}
            onClick={() => onConfirm({ closureType, afterPhotos, noticeDuration, letterNumber, letterPhoto })}
            className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
            {'تأكيد الإغلاق'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────
function AssignModal({ allUsers, currentEntity, onConfirm, onCancel }) {
  const entityOptions = [...new Set(allUsers.map(u => u.entity || u.dept).filter(Boolean))]
  const [entity, setEntity] = useState(currentEntity || '')
  const [assignee, setAssignee] = useState('')

  const entityUsers = entity
    ? allUsers.filter(u => (u.entity || u.dept || '') === entity || (u.entity || '') === entity)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200 dark:border-gray-700 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
            <Building2 size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">{'إسناد البلاغ للجهة'}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-500 mb-1.5 block">{'الجهة المسؤولة *'}</label>
            <select value={entity} onChange={e => { setEntity(e.target.value); setAssignee('') }}
              className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-amber-400">
              <option value="">{'اختر الجهة'}</option>
              {entityOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          {entity && (
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-500 mb-1.5 block">
                {'المستخدم المسؤول'} {entityUsers.length === 0 && '(لا يوجد مستخدمون لهذه الجهة)'}
              </label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)} disabled={entityUsers.length === 0}
                className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-amber-400 disabled:opacity-50">
                <option value="">{'بدون إسناد لمستخدم'}</option>
                {entityUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            {'إلغاء'}
          </button>
          <button onClick={() => onConfirm(entity, assignee)} disabled={!entity}
            className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
            {'تأكيد الإسناد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Audit Timeline ───────────────────────────────────────────────────────────
function AuditTimeline({ logs }) {
  if (!logs.length) return (
    <div className="text-center py-6">
      <p className="text-xs text-slate-400 dark:text-gray-600">{'لا توجد سجلات بعد'}</p>
    </div>
  )

  const icons = {
    created:       <CheckCircle2 size={12} className="text-emerald-500" />,
    status_change: <RefreshCw size={12} className="text-blue-500" />,
    assigned:      <User size={12} className="text-amber-500" />,
    closure:       <Lock size={12} className="text-cyan-500" />,
    quality_pass:  <Shield size={12} className="text-emerald-500" />,
    quality_fail:  <XCircle size={12} className="text-red-500" />,
    rejected:      <XCircle size={12} className="text-red-500" />,
    reopened:      <RefreshCw size={12} className="text-orange-500" />,
    comment:       <FileText size={12} className="text-slate-400" />,
    enforcement:   <AlertTriangle size={12} className="text-amber-500" />,
  }

  return (
    <div className="space-y-3">
      {logs.map((log, i) => (
        <div key={log.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
              {icons[log.action] || <Clock size={12} className="text-slate-400" />}
            </div>
            {i < logs.length - 1 && <div className="w-px flex-1 bg-slate-100 dark:bg-gray-800 my-1" />}
          </div>
          <div className="flex-1 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700 dark:text-gray-200">
                  {AUDIT_ACTIONS[log.action] || log.action}
                </p>
                {log.details && (
                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5 leading-relaxed">{log.details}</p>
                )}
                {log.fromStatus && log.toStatus && (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <StatusBadge status={log.fromStatus} />
                    <span className="text-slate-300 dark:text-gray-600 text-xs">{'←'}</span>
                    <StatusBadge status={log.toStatus} />
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-slate-400 dark:text-gray-600">
                  {new Date(log.timestamp).toLocaleDateString('ar-SA')}
                </p>
                <p className="text-xs text-slate-400 dark:text-gray-600">
                  {new Date(log.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {log.userName && (
                  <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">{log.userName}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { reports, users, auditLogs, updateReport } = useData()
  const { user } = useAuth()

  // ── Try mock/localStorage data first (for manually-created reports) ─────────
  const mockReport = reports.find(r => r.id === id)

  // ── If not in mock data, fetch from the backend API ─────────────────────────
  const [apiRefreshKey, setApiRefreshKey] = useState(0)
  const { report: fetchedApiReport, loading: apiLoading } = useApiReportById(
    mockReport ? null : id,
    apiRefreshKey,
  )
  const { logs: apiRawLogs } = useApiReportAudit(
    mockReport ? null : id,
    apiRefreshKey,
  )

  const report    = mockReport || fetchedApiReport
  const isApiReport = !mockReport && report?.fromApi === true

  // Normalize backend audit_logs into the shape AuditTimeline expects
  const apiLogs = useMemo(() =>
    apiRawLogs.map(l => ({
      id:         l.id,
      action:     l.action,
      timestamp:  l.created_at,
      details:    l.metadata?.reason || l.metadata?.details || '',
      fromStatus: l.metadata?.fromStatus ?? l.from_status ?? null,
      toStatus:   l.metadata?.toStatus   ?? l.to_status   ?? null,
      userName:   l.performed_by_name    || '',
    })),
    [apiRawLogs],
  )

  const reportLogs = useMemo(() => {
    if (isApiReport) return apiLogs
    return auditLogs
      .filter(l => l.reportId === id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [isApiReport, apiLogs, auditLogs, id])

  const [modal, setModal] = useState(null)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [viewer, setViewer] = useState(null) // { images, index }

  // Show loading skeleton while fetching an API report
  if (!mockReport && apiLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
      <RefreshCw size={32} className="text-slate-300 dark:text-gray-600 animate-spin" />
      <p className="text-slate-500 dark:text-gray-400">{'جاري تحميل البلاغ…'}</p>
    </div>
  )

  if (!report) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
      <AlertCircle size={40} className="text-slate-300 dark:text-gray-600" />
      <p className="text-slate-500 dark:text-gray-400">{'البلاغ غير موجود'}</p>
      <Link to="/reports" className="text-blue-600 dark:text-blue-400 text-sm hover:underline">{'العودة للبلاغات'}</Link>
    </div>
  )

  // Ownership / entity access check — must be declared before the !authorized guard below
  const authorized = canAccessReport(user, report)

  if (!authorized) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
      <Lock size={40} className="text-slate-300 dark:text-gray-600" />
      <p className="text-slate-700 dark:text-gray-300 font-semibold">{'غير مصرح بالوصول'}</p>
      <p className="text-slate-400 dark:text-gray-600 text-sm text-center max-w-xs">
        {'هذا البلاغ خارج نطاق صلاحياتك. تواصل مع مديرك إذا كنت بحاجة للوصول.'}
      </p>
      <Link to="/reports" className="text-blue-600 dark:text-blue-400 text-sm hover:underline">{'العودة للبلاغات'}</Link>
    </div>
  )

  // Permission helper — uses centralized TRANSITION_PERMISSIONS from caseConfig
  const hasPerm = (perm) => !perm || user?.role === 'admin' || !!(user?.permissions?.includes(perm))

  const currentStatus = normalizeStatus(report.status)
  const rawTransitions = STATUS_TRANSITIONS[currentStatus] || []
  // Filter transitions using centralized RBAC map (SOP §10.3)
  const transitions = rawTransitions.filter(t => {
    const cfg = TRANSITION_PERMISSIONS[t]
    return cfg ? hasPerm(cfg.permission) : true
  })
  const el = regulationData.find(e => e.id === report.element)
  const selectedArticles = el?.articles.map(a => {
    const item = (report.articles || []).find(item => item.id === a.id)
    return item ? { ...a, count: item.count } : null
  }).filter(Boolean) || []
  const closureInfo = report.closureType ? CLOSURE_TYPES[report.closureType] : null
  const basketInfo = closureInfo?.basket ? BASKET_CONFIG[closureInfo.basket] : null

  // Sub-cases linked to this report
  const subCases = reports.filter(r => r.parentId === report.id)

  // Notice deadline tracking
  const noticeDeadline = report.closureType === 'notice_posted' && report.noticeDeadline
    ? new Date(report.noticeDeadline) : null
  const noticeOverdue = noticeDeadline && noticeDeadline < new Date()
  const noticeUrgent = noticeDeadline && !noticeOverdue && (noticeDeadline - new Date()) < 3 * 86400000

  // Special governance actions
  const showOffenderIdentified = report.closureType === 'unknown_offender' &&
    ['closed_inspector', 'quality_review', 'closed_final'].includes(currentStatus)
  const showCreateSubCase = report.closureType === 'fine_issued' &&
    ['closed_inspector', 'quality_review', 'closed_final'].includes(currentStatus)

  // ── Transition logic ─────────────────────────────────────────────────────
  const initiateTransition = (toStatus) => {
    setPendingStatus(toStatus)
    if (REQUIRES_CLOSURE_FORM.has(toStatus)) {
      setModal('closure')
    } else if (toStatus === 'rejected' && REQUIRES_REASON.has('rejected')) {
      setModal('rejection')
    } else if (toStatus === 'submitted' && currentStatus === 'quality_review') {
      setModal('reopen')
    } else if (toStatus === 'assigned') {
      setModal('assign')
    } else {
      applyTransition(toStatus, {})
    }
  }

  const handleOffenderIdentifiedConfirm = (details) => {
    if (isApiReport) {
      applyTransition('in_progress', {
        closureType:  null,
        closureNotes: null,
        details: `تم التعرف على المخالف: ${details}`,
      })
      return
    }
    updateReport(report.id, {
      closureType: null,
      status: 'in_progress',
    }, {
      action: 'reopened',
      fromStatus: currentStatus,
      toStatus: 'in_progress',
      userId:   user?.id    || 'system',
      userName: user?.name  || 'النظام',
      entity:   user?.entity || report.entity || '',
      details: `تم التعرف على المخالف: ${details}`,
    })
    setModal(null)
  }

  const applyTransition = async (toStatus, extra) => {
    if (isApiReport) {
      try {
        const res = await fetch(`${API_BASE}/api/reports/${id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            toStatus,
            reason:       extra.rejectionReason || extra.qualityNotes || extra.details || '',
            closureType:  extra.closureType  ?? undefined,
            closureNotes: extra.closureNotes ?? undefined,
            assignedTo:   extra.assignedTo   ?? undefined,
          }),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          alert(errData.error || 'فشل تغيير الحالة')
          return
        }
        // Refetch report + audit logs to reflect persisted state
        setApiRefreshKey(k => k + 1)
      } catch (err) {
        console.error('[ReportDetail] transition error:', err)
        alert('حدث خطأ أثناء تغيير الحالة')
        return
      } finally {
        setModal(null)
        setPendingStatus(null)
      }
      return
    }

    // ── Mock/localStorage path ──────────────────────────────────────────────
    const actionMap = {
      rejected:     'rejected',
      closed_final: 'quality_pass',
      assigned:     'assigned',
    }
    const action = (toStatus === 'submitted' && currentStatus === 'quality_review')
      ? 'quality_fail'
      : CLOSURE_STATUSES.has(toStatus) ? 'closure'
      : actionMap[toStatus] || 'status_change'

    updateReport(report.id, { status: toStatus, ...extra }, {
      action,
      fromStatus: currentStatus,
      toStatus,
      userId:   user?.id    || 'system',
      userName: user?.name  || 'النظام',
      entity:   user?.entity || report.entity || '',
      details:  extra.rejectionReason || extra.qualityNotes || extra.details || '',
    })
    setModal(null)
    setPendingStatus(null)
  }

  const handleClosureConfirm = ({ closureType, afterPhotos, noticeDuration, letterNumber, letterPhoto }) => {
    // Auto-route to enforcement/notice/quality based on closureType (SOP §8.8–8.10)
    const targetStatus = CLOSURE_TYPES[closureType]?.nextStatus || 'quality_review'
    const noticeDeadline = closureType === 'notice_posted' && noticeDuration
      ? new Date(Date.now() + noticeDuration * 86400000).toISOString()
      : null
    applyTransition(targetStatus, {
      closureType, afterPhotos, noticeDuration, noticeDeadline, letterNumber, letterPhoto,
      details: `${CLOSURE_TYPES[closureType]?.label} — ${afterPhotos.length} صور مرفقة`,
    })
  }

  const handleAssignConfirm = (entityName, userId) => {
    const assignedUser = users.find(u => u.id === userId)
    applyTransition('assigned', {
      entity: entityName,
      assignedTo: userId,
      details: `مُسند إلى: ${assignedUser?.name || 'بدون مستخدم'} (${entityName})`,
    })
  }

  const btnStyle = (toStatus) => {
    if (toStatus === 'rejected') return 'border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
    if (CLOSURE_STATUSES.has(toStatus)) return 'border border-cyan-200 dark:border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10'
    if (toStatus === 'closed_final') return 'bg-emerald-600 hover:bg-emerald-700 text-white'
    if (toStatus === 'submitted' && currentStatus === 'quality_review') return 'border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10'
    return 'border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800'
  }

  const btnLabel = (toStatus) => ({
    submitted:           currentStatus === 'quality_review' ? 'إعادة فتح' : 'تقديم البلاغ',
    ai_classified:       'تأكيد تصنيف الذكاء الاصطناعي',
    under_review:        'بدء المراجعة',
    assigned:            'إسناد للجهة',
    in_progress:         'بدء المعالجة',
    closed_inspector:    'إغلاق المراقب',
    pending_enforcement: 'إغلاق المراقب',
    pending_notice:      'إغلاق المراقب',
    unknown_offender:    'إغلاق المراقب',
    quality_review:      'إرسال لمراجعة الجودة',
    closed_final:        'اعتماد الإغلاق النهائي',
    rejected:            'رفض البلاغ',
  }[toStatus] || toStatus)

  return (
    <>
      {/* Image Viewer */}
      {viewer && (
        <ImageViewer images={viewer.images} startIndex={viewer.index} onClose={() => setViewer(null)} />
      )}

      {/* Modals */}
      {modal === 'rejection' && (
        <ReasonModal title={'سبب رفض البلاغ (إلزامي)'} placeholder={'وضّح سبب الرفض...'}
          confirmLabel={'تأكيد الرفض'} confirmClass={'bg-red-600 hover:bg-red-700'}
          onConfirm={reason => applyTransition('rejected', { rejectionReason: reason })}
          onCancel={() => { setModal(null); setPendingStatus(null) }} />
      )}
      {modal === 'reopen' && (
        <ReasonModal title={'ملاحظات إعادة الفتح (إلزامي)'} placeholder={'وضّح ملاحظات مراجعة الجودة...'}
          confirmLabel={'إعادة الفتح'} confirmClass={'bg-orange-500 hover:bg-orange-600'}
          onConfirm={reason => applyTransition('submitted', { qualityNotes: reason, details: `إعادة فتح: ${reason}` })}
          onCancel={() => { setModal(null); setPendingStatus(null) }} />
      )}
      {modal === 'closure' && (
        <ClosureModal onConfirm={handleClosureConfirm} onCancel={() => { setModal(null); setPendingStatus(null) }} />
      )}
      {modal === 'offender_identified' && (
        <ReasonModal title={'تفاصيل التعرف على المخالف (إلزامي)'}
          placeholder={'سجِّل اسم المخالف أو رقم الهوية أو أي معلومات مؤكدة...'}
          confirmLabel={'إعادة فتح البلاغ'} confirmClass={'bg-blue-600 hover:bg-blue-700'}
          onConfirm={handleOffenderIdentifiedConfirm}
          onCancel={() => setModal(null)} />
      )}
      {modal === 'assign' && (
        <AssignModal allUsers={users} currentEntity={report.entity}
          onConfirm={handleAssignConfirm} onCancel={() => { setModal(null); setPendingStatus(null) }} />
      )}

      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/reports')}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <ArrowRight size={20} />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: report.elementColor || '#3B82F6' }} />
            <h1 className="text-lg font-bold text-slate-800 dark:text-white truncate">
              {report.elementName || report.title}
            </h1>
          </div>
          <StatusBadge status={currentStatus} />
          <span className="text-xs font-mono text-slate-400 dark:text-gray-500 bg-slate-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
            {report.id}
          </span>
        </div>

        {/* Basket notice */}
        {basketInfo && (
          <div className={`rounded-xl p-3 flex items-center gap-3 border ${basketInfo.border} ${basketInfo.bg}`}>
            <AlertTriangle size={15} className={basketInfo.color} />
            <div className="flex-1">
              <p className={`text-xs font-semibold ${basketInfo.color}`}>{basketInfo.label}</p>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-0.5">{basketInfo.desc}</p>
            </div>
            <span className="text-xs font-medium" style={{ color: closureInfo.color }}>{closureInfo.label}</span>
          </div>
        )}

        {/* Notice deadline warning */}
        {noticeOverdue && (
          <div className="rounded-xl p-3 flex items-center gap-3 border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">{'⚠️ مدة الإشعار منتهية'}</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {'انتهت في:'} {noticeDeadline.toLocaleDateString('ar-SA')} {'— يجب اتخاذ إجراء فوري أو إعادة البلاغ للسلة الرئيسية'}
              </p>
            </div>
          </div>
        )}
        {noticeUrgent && (
          <div className="rounded-xl p-3 flex items-center gap-3 border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10">
            <Clock size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{'تنبيه: اقتراب موعد انتهاء الإشعار'}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {'ينتهي في:'} {noticeDeadline.toLocaleDateString('ar-SA')}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-12 gap-5">
          {/* Left — main */}
          <div className="col-span-12 lg:col-span-8 space-y-4">

            {/* Workflow actions */}
            {(transitions.length > 0 || showOffenderIdentified || showCreateSubCase) && (
              <div className={`${card} p-4`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  {'الإجراءات المتاحة'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {transitions.map(toStatus => (
                    <button key={toStatus} onClick={() => initiateTransition(toStatus)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${btnStyle(toStatus)}`}>
                      {btnLabel(toStatus)}
                    </button>
                  ))}
                  {showOffenderIdentified && (
                    <button onClick={() => setModal('offender_identified')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all">
                      <UserCheck size={14} />
                      {'تم التعرف على المخالف'}
                    </button>
                  )}
                  {showCreateSubCase && (
                    <button
                      onClick={() => navigate(`/reports/new?parentId=${report.id}&element=${report.element}&repeat=true`)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-orange-200 dark:border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-all">
                      <GitBranch size={14} />
                      {'إنشاء بلاغ متابعة'}
                    </button>
                  )}
                </div>
                {currentStatus === 'quality_review' && (
                  <p className="text-xs text-slate-400 dark:text-gray-600 mt-2">
                    {"اعتماد الإغلاق = إغلاق نهائي لا رجعة فيه · إعادة فتح = يعود للمقدِّم مع ملاحظة"}
                  </p>
                )}
              </div>
            )}

            {/* Rejection reason display */}
            {report.rejectionReason && (
              <div className="rounded-xl p-3 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 flex items-start gap-2">
                <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">{'سبب الرفض'}</p>
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{report.rejectionReason}</p>
                </div>
              </div>
            )}

            {/* Map */}
            {report.coords && (
              <div className={`${card} overflow-hidden`} style={{ height: '220px' }}>
                <MapContainer center={report.coords} zoom={15} style={{ width: '100%', height: '100%' }} zoomControl={false}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <Marker position={report.coords} icon={mapIcon(report.elementColor || '#EF4444')} />
                </MapContainer>
              </div>
            )}

            {/* GIS Operational Fields — shown for gis_import reports with enterprise mapping */}
            {report.ingestion_source === 'gis_import' && (
              report.gisExternalId || report.gisContractor || report.gisAgency ||
              report.gisSeverity || report.gisViolationType || report.gisObservationDate || report.gisNotes
            ) && (
              <div className={`${card} p-4 space-y-3`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin size={12} className="text-indigo-500" />
                  {'البيانات التشغيلية المستوردة من GIS'}
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: 'المعرف الخارجي',    value: report.gisExternalId },
                    { label: 'المقاول',            value: report.gisContractor },
                    { label: 'الجهة المسؤولة',    value: report.gisAgency },
                    { label: 'الخطورة',            value: report.gisSeverity },
                    { label: 'نوع المخالفة',       value: report.gisViolationType },
                    { label: 'تاريخ الرصد',        value: report.gisObservationDate },
                    { label: 'ملاحظات GIS',        value: report.gisNotes },
                  ].filter(row => row.value).map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-xs gap-3">
                      <span className="text-slate-500 dark:text-gray-500 flex-shrink-0">{label}</span>
                      <span className="text-slate-700 dark:text-gray-200 text-right break-all">{value}</span>
                    </div>
                  ))}
                </div>
                {/* Remaining mapped fields from operational metadata */}
                {report.gisOperationalMetadata && Object.keys(report.gisOperationalMetadata).filter(k =>
                  !['externalId','contractor','agency','severity','violationType','observationDate','remarks',
                    'elementType','description','locationName','district'].includes(k) &&
                  report.gisOperationalMetadata[k]
                ).length > 0 && (
                  <details className="text-xs">
                    <summary className="text-slate-400 dark:text-gray-500 cursor-pointer hover:text-slate-600 dark:hover:text-gray-300">
                      {'حقول إضافية مستوردة'}
                    </summary>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-2 border-t border-slate-100 dark:border-gray-800">
                      {Object.entries(report.gisOperationalMetadata)
                        .filter(([k, v]) =>
                          !['externalId','contractor','agency','severity','violationType','observationDate','remarks',
                            'elementType','description','locationName','district'].includes(k) && v
                        )
                        .map(([k, v]) => (
                          <div key={k} className="flex flex-col">
                            <span className="text-slate-400 dark:text-gray-500 font-mono">{k}</span>
                            <span className="text-slate-700 dark:text-gray-200 break-all">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* GIS Source Attributes — raw original properties from GIS file */}
            {report.gisSourceAttributes && Object.keys(report.gisSourceAttributes).length > 0 && (
              <div className={`${card} p-4 space-y-3`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <MapPin size={12} className="text-teal-500" />
                  {'بيانات المصدر الجغرافي الأصلية'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 max-h-60 overflow-y-auto">
                  {Object.entries(report.gisSourceAttributes).map(([k, v]) => (
                    v != null && String(v).trim() !== '' && (
                      <div key={k} className="flex flex-col">
                        <span className="text-xs text-slate-400 dark:text-gray-500 font-mono">{k}</span>
                        <span className="text-xs text-slate-700 dark:text-gray-200 break-all">{String(v)}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Media: before + after */}
            {(report.media?.length > 0 || report.afterPhotos?.length > 0) && (
              <div className={`${card} p-4 space-y-4`}>
                {report.media?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">{'صور قبل المعالجة'}</p>
                    <div className="flex flex-wrap gap-2">
                      {report.media.map((m, i) => (
                        <button key={i} onClick={() => setViewer({ images: report.media, index: i })}
                          className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group relative flex-shrink-0">
                          <img src={m.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">عرض</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {report.afterPhotos?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-2">{'صور بعد المعالجة'}</p>
                    <div className="flex flex-wrap gap-2">
                      {report.afterPhotos.map((m, i) => (
                        <button key={i} onClick={() => setViewer({ images: report.afterPhotos, index: i })}
                          className="w-24 h-24 rounded-xl overflow-hidden border border-cyan-200 dark:border-cyan-500/30 hover:border-cyan-400 dark:hover:border-cyan-400 transition-colors group relative flex-shrink-0">
                          <img src={m.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">عرض</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Articles */}
            {selectedArticles.length > 0 && (
              <div className={`${card} p-4 space-y-2`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">{'البنود المخالفة'}</p>
                {selectedArticles.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-gray-800 last:border-0">
                    <div className="flex-1">
                      <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">{a.text}</p>
                      {a.count > 1 && (
                        <p className="text-xs text-slate-400 dark:text-gray-600 mt-1">{'العد: '}{a.count}</p>
                      )}
                    </div>
                    {a.fineAmana > 0 && (
                      <div className="text-left">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block">
                          {(a.fineAmana * a.count).toLocaleString('ar-SA')} {'﷼'}
                        </span>
                        {a.count > 1 && (
                          <span className="text-xs text-slate-400 dark:text-gray-600">
                            {a.fineAmana.toLocaleString('ar-SA')} {'﷼ × '}{a.count}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            {report.description && (
              <div className={`${card} p-4`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">{'وصف المخالفة'}</p>
                <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">{report.description}</p>
              </div>
            )}

            {/* Sub-cases */}
            {subCases.length > 0 && (
              <div className={`${card} p-4 space-y-2`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <GitBranch size={12} className="text-orange-500" />
                  {'بلاغات المتابعة'} ({subCases.length})
                </p>
                {subCases.map(sc => {
                  const scCfg = getStatusCfg(sc.status)
                  return (
                    <Link key={sc.id} to={`/reports/${sc.id}`}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-gray-800 last:border-0 hover:bg-slate-50 dark:hover:bg-gray-800/50 rounded-lg px-2 transition-colors">
                      <div>
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{sc.id}</p>
                        <p className="text-xs text-slate-600 dark:text-gray-300 mt-0.5">{sc.elementName || sc.title}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${scCfg.bg} ${scCfg.text} ${scCfg.border}`}>{scCfg.label}</span>
                        <ChevronLeft size={12} className="text-slate-400 dark:text-gray-600" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Audit timeline */}
            <div className={`${card} p-4`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-4">{'سجل التدقيق والحركة'}</p>
              <AuditTimeline logs={reportLogs} />
            </div>
          </div>

          {/* Right — meta */}
          <div className="col-span-12 lg:col-span-4 space-y-4">

            {/* Fine */}
            <div className={`${card} p-4 text-center`}>
              <p className="text-xs text-slate-400 dark:text-gray-500 mb-1">{'الغرامة المتوقعة'}</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {(report.estimatedFine || 0).toLocaleString('ar-SA')}
              </p>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{'ريال سعودي'}</p>
              {selectedArticles.length > 0 && (
                <p className="text-xs text-slate-400 dark:text-gray-600 mt-1">
                  {selectedArticles.reduce((s, a) => s + a.count, 0)} {'مخالفة'} · {selectedArticles.length} {'بند'}
                </p>
              )}
            </div>

            {/* Assignment */}
            <div className={`${card} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">{'الإسناد'}</p>
              {[
                { label: 'نوع الجهة', value: report.entityType === 'internal' ? 'داخلية' : report.entityType === 'external' ? 'خارجية' : '—' },
                { label: 'الجهة', value: report.entity || '—' },
                { label: 'المسند إليه', value: report.assignedToName || users.find(u => u.id === report.assignedTo)?.name || '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-gray-500">{label}</span>
                  <span className="text-slate-700 dark:text-gray-200 font-medium text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>

            {/* Report details */}
            <div className={`${card} p-4 space-y-2`}>
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">{'تفاصيل'}</p>
              {[
                { label: 'المنطقة', value: report.district || report.locationName || '—' },
                { label: 'الأولوية', value: PRIORITY_CONFIG[report.priority]?.label || '—' },
                { label: 'المصدر', value: { ai: 'ذكاء اصطناعي', manual: 'يدوي', mobile: 'جوّال', drone: 'طائرة', gis_import: 'استيراد GIS', media_upload: 'رفع وسائط' }[report.source || report.ingestion_source] || 'يدوي' },
                { label: 'الإنشاء', value: report.createdAt ? new Date(report.createdAt).toLocaleDateString('ar-SA') : '—' },
                { label: 'آخر تحديث', value: report.updatedAt ? new Date(report.updatedAt).toLocaleDateString('ar-SA') : '—' },
                ...(report.captureTimestamp ? [{ label: 'وقت التقاط الوسائط', value: new Date(report.captureTimestamp).toLocaleString('ar-SA') }] : []),
                ...(report.slaHours ? [{ label: 'SLA', value: `${report.slaHours} ساعة` }] : []),
                ...(report.neighborhood ? [{ label: 'الحي', value: report.neighborhood }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-gray-500">{label}</span>
                  <span className="text-slate-700 dark:text-gray-200 font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Closure details */}
            {report.closureType && closureInfo && (
              <div className={`${card} p-4 space-y-2`}>
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">{'تفاصيل الإغلاق'}</p>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: closureInfo.color }} />
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-200">{closureInfo.label}</span>
                </div>
                {report.noticeDuration && (
                  <p className="text-xs text-slate-500 dark:text-gray-500">
                    {'المدة:'} {report.noticeDuration} {'يوم'}
                    {report.noticeDeadline && ` · ينتهي ${new Date(report.noticeDeadline).toLocaleDateString('ar-SA')}`}
                  </p>
                )}
                {report.letterNumber && (
                  <p className="text-xs text-slate-500 dark:text-gray-500">{'رقم الخطاب:'} {report.letterNumber}</p>
                )}
              </div>
            )}

            {/* Location */}
            {report.coords && (
              <div className={`${card} p-3 flex items-center gap-2`}>
                <MapPin size={13} className="text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-gray-500">{'الإحداثيات'}</p>
                  <p className="text-xs font-mono text-slate-700 dark:text-gray-200">
                    {report.coords[0].toFixed(5)}, {report.coords[1].toFixed(5)}
                  </p>
                </div>
              </div>
            )}

            {/* Parent report link */}
            {report.parentId && (
              <Link to={`/reports/${report.parentId}`}
                className={`${card} p-3 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors`}>
                <GitBranch size={13} className="text-orange-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-gray-500">{'البلاغ الأصلي'}</p>
                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate">{report.parentId}</p>
                </div>
                <ChevronLeft size={12} className="text-slate-400 dark:text-gray-600 flex-shrink-0" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
