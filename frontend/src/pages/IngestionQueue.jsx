import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  Inbox, Image, Video, Upload, MapPin, Clock, CheckCircle2, XCircle,
  Layers, RefreshCw, AlertTriangle, ScanSearch, Cpu, X, Plus,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

const REVIEW_TABS = [
  { key: 'pending_review', label: 'بانتظار المراجعة', dotColor: 'bg-amber-500' },
  { key: 'confirmed',      label: 'مؤكدة',             dotColor: 'bg-emerald-500' },
  { key: 'rejected',       label: 'مرفوضة',            dotColor: 'bg-red-500' },
  { key: 'grouped',        label: 'مجمّعة',             dotColor: 'bg-indigo-500' },
]

const SOURCE_META = {
  manual:           { label: 'يدوي',           cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  yolo:             { label: 'YOLO AI',         cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  frame_extraction: { label: 'إطار فيديو',      cls: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  drone:            { label: 'طائرة مسيّرة',    cls: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' },
}

const ALLOWED_MEDIA = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'image/tiff', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo',
]

// ─── API helpers ──────────────────────────────────────────────────────────────

function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

async function apiFetch(path, token, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeader(token), ...(opts.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function uploadMediaXHR(files, token, entityId, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    if (entityId) form.append('entity_id', entityId)

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        const body = JSON.parse(xhr.responseText || '{}')
        reject(new Error(body.error ?? `HTTP ${xhr.status}`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.open('POST', `${API}/api/ingestion/media`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(form)
  })
}

// ─── No-token guard ───────────────────────────────────────────────────────────

function NoTokenBanner() {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-6 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">لم يتم التحقق من الهوية</h3>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        منصة إنشاء البلاغات من الوسائط تتطلب تسجيل دخول موثقاً عبر خادم الـ API. <br />
        يرجى تشغيل سكريبت الـ seed ثم تسجيل الدخول بأحد الحسابات التجريبية:
      </p>
      <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 rounded-lg px-3 py-2 text-amber-900 dark:text-amber-200 font-mono leading-relaxed">
        node database/seed.js<br />
        ثم: admin@urban-ai.sa / Admin@1234
      </code>
    </div>
  )
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFiles }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDrag(false)
    const picked = [...e.dataTransfer.files].filter(f => ALLOWED_MEDIA.includes(f.type))
    if (picked.length) onFiles(picked)
  }

  function handlePick(e) {
    const picked = [...e.target.files]
    if (picked.length) onFiles(picked)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 py-8 px-4 ${
        drag
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-slate-300 dark:border-gray-700 hover:border-blue-400 hover:bg-slate-50/60 dark:hover:bg-gray-800/40'
      }`}
    >
      <input ref={inputRef} type="file" multiple hidden
        accept="image/*,video/*" onChange={handlePick} />
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${drag ? 'bg-blue-100 dark:bg-blue-800/40' : 'bg-slate-100 dark:bg-gray-800'}`}>
        <Upload size={22} className={drag ? 'text-blue-600' : 'text-slate-400 dark:text-gray-500'} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          اسحب الصور أو الفيديو هنا، أو انقر للاختيار
        </p>
        <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
          JPEG · PNG · HEIC · MP4 — حتى 200 MB للملف
        </p>
      </div>
    </div>
  )
}

// ─── Upload queue row ─────────────────────────────────────────────────────────

function UploadRow({ file, status, progress, error, onRemove }) {
  const isImg = file.type.startsWith('image/')
  const mb    = (file.size / 1024 / 1024).toFixed(1)

  return (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
        {isImg ? <Image size={15} className="text-blue-500" /> : <Video size={15} className="text-purple-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{file.name}</p>
        <p className="text-xs text-slate-400 dark:text-gray-500">{mb} MB</p>
        {status === 'uploading' && (
          <div className="mt-1 h-1 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-0.5 truncate">{error}</p>}
      </div>
      <div className="flex-shrink-0">
        {status === 'idle'      && <span className="text-xs text-slate-400">في الانتظار</span>}
        {status === 'uploading' && <span className="text-xs text-blue-500">{progress}%</span>}
        {status === 'done'      && <CheckCircle2 size={16} className="text-emerald-500" />}
        {status === 'error'     && <XCircle      size={16} className="text-red-500" />}
        {status === 'idle'      && (
          <button onClick={() => onRemove(file)} className="mr-2 text-slate-300 dark:text-gray-600 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmModal({ candidate, onConfirm, onClose }) {
  const [elementType, setElementType] = useState(candidate.suggested_element_type ?? '')
  const [description, setDescription] = useState('')
  const [notes, setNotes]             = useState('')
  const [busy, setBusy]               = useState(false)
  const [err, setErr]                 = useState(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try { await onConfirm({ elementType, description, notes }) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">تأكيد المرشح → بلاغ مسودة</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">نوع العنصر</label>
            <input value={elementType} onChange={e => setElementType(e.target.value)}
              placeholder="مثال: لافتة مخالفة"
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الوصف</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} resize="none"
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ملاحظات المراجع</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={busy}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {busy ? 'جارٍ الإنشاء…' : 'تأكيد وإنشاء بلاغ مسودة'}
          </button>
          <button onClick={onClose} disabled={busy}
            className="px-4 text-sm text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

function RejectModal({ onReject, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState(null)

  async function submit() {
    setBusy(true)
    setErr(null)
    try { await onReject(reason) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">رفض المرشح</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="سبب الرفض (اختياري)"
          className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-3">
          <button onClick={submit} disabled={busy}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {busy ? 'جارٍ الرفض…' : 'تأكيد الرفض'}
          </button>
          <button onClick={onClose} disabled={busy}
            className="px-4 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Candidate card ───────────────────────────────────────────────────────────

// Strip the leading 'uploads/' prefix before joining with API origin
function buildUploadUrl(filePath) {
  if (!filePath) return null
  const relative = filePath.replace(/^uploads[/\\]/, '')
  return `${API}/uploads/${relative}`
}

function CandidateCard({ c, isPending, onConfirm, onReject }) {
  const src    = SOURCE_META[c.detection_source] ?? SOURCE_META.manual
  const hasGPS = c.gps_lat != null && c.gps_lng != null

  // Prefer thumbnail, fall back to original file for images
  const previewUrl = c.thumbnail_path
    ? buildUploadUrl(c.thumbnail_path)
    : c.file_type === 'image' && c.file_path
      ? buildUploadUrl(c.file_path)
      : null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="h-36 bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
        {previewUrl
          ? <img src={previewUrl} alt="" className="w-full h-full object-cover"
              onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling?.removeAttribute('hidden') }} />
          : null}
        <div className={`flex flex-col items-center gap-1.5 text-slate-400 dark:text-gray-600 ${previewUrl ? 'hidden' : ''}`}>
          {c.file_type === 'video' ? <Video size={28} /> : <Image size={28} />}
          <span className="text-xs text-center px-2 truncate max-w-[120px]">{c.file_name}</span>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {/* Source badge + element suggestion */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${src.cls}`}>{src.label}</span>
          {c.detection_confidence != null && (
            <span className="text-xs text-slate-400 dark:text-gray-500 self-center">
              {(c.detection_confidence * 100).toFixed(0)}% ثقة
            </span>
          )}
          {c.suggested_element_type && (
            <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
              {c.suggested_element_type}
            </span>
          )}
        </div>

        {/* GPS */}
        <div className={`flex items-center gap-1.5 text-xs ${hasGPS ? 'text-slate-500 dark:text-gray-400' : 'text-amber-500'}`}>
          <MapPin size={11} />
          {hasGPS
            ? `${parseFloat(c.gps_lat).toFixed(5)}, ${parseFloat(c.gps_lng).toFixed(5)}`
            : 'لا توجد إحداثيات GPS'
          }
        </div>

        {/* Timestamp */}
        {c.capture_timestamp && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500">
            <Clock size={11} />
            {new Date(c.capture_timestamp).toLocaleString('ar-SA')}
          </div>
        )}

        {/* File name */}
        <p className="text-xs text-slate-300 dark:text-gray-700 truncate">{c.file_name}</p>

        {/* Actions — pending only */}
        {isPending && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => onConfirm(c)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold py-2 rounded-lg transition-colors">
              <CheckCircle2 size={13} /> تأكيد
            </button>
            <button onClick={() => onReject(c)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold py-2 rounded-lg transition-colors">
              <XCircle size={13} /> رفض
            </button>
          </div>
        )}

        {/* Status badge — non-pending */}
        {!isPending && (
          <div className={`text-center text-xs font-semibold py-1.5 rounded-lg ${
            c.review_status === 'confirmed' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
            c.review_status === 'rejected'  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
            'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
          }`}>
            {c.review_status === 'confirmed' ? 'مؤكد — بلاغ مسودة مُنشأ' :
             c.review_status === 'rejected'  ? 'مرفوض' : 'مجمّع'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium text-white ${
      type === 'error' ? 'bg-red-600' : type === 'info' ? 'bg-blue-600' : 'bg-emerald-600'
    }`}>
      {type === 'error' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
      {msg}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IngestionQueue() {
  const { user } = useAuth()

  // Upload state
  const [pendingFiles, setPendingFiles]   = useState([])    // [{file, status, progress, error}]
  const [uploading, setUploading]         = useState(false)
  const [uploadSummary, setUploadSummary] = useState(null)  // {created, failed}

  // Candidate review state
  const [activeTab, setActiveTab]           = useState('pending_review')
  const [candidates, setCandidates]         = useState([])
  const [total, setTotal]                   = useState(0)
  const [loading, setLoading]               = useState(false)
  const [loadErr, setLoadErr]               = useState(null)

  // Dialog state
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [rejectTarget, setRejectTarget]   = useState(null)

  // Grouping state
  const [grouping, setGrouping]       = useState(false)
  const [groupSuggestions, setGroupSuggestions] = useState(null)

  const [toast, setToast] = useState(null)

  const hasToken = !!user?.token

  // ── Load candidates ────────────────────────────────────────────────────────

  const loadCandidates = useCallback(async () => {
    if (!hasToken) return
    setLoading(true)
    setLoadErr(null)
    try {
      const data = await apiFetch(
        `/api/ingestion/candidates?review_status=${activeTab}&limit=50`,
        user.token,
      )
      setCandidates(data.candidates ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setLoadErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeTab, user?.token, hasToken])

  useEffect(() => { loadCandidates() }, [loadCandidates])

  // ── File selection ─────────────────────────────────────────────────────────

  function addFiles(files) {
    const entries = files.map(f => ({ file: f, status: 'idle', progress: 0, error: null }))
    setPendingFiles(prev => [...prev, ...entries])
    setUploadSummary(null)
  }

  function removeFile(file) {
    setPendingFiles(prev => prev.filter(e => e.file !== file))
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function handleUpload() {
    const files = pendingFiles.filter(e => e.status === 'idle').map(e => e.file)
    if (!files.length || uploading) return

    setUploading(true)
    setUploadSummary(null)

    // Mark all as uploading
    setPendingFiles(prev => prev.map(e =>
      e.status === 'idle' ? { ...e, status: 'uploading', progress: 0 } : e
    ))

    try {
      const result = await uploadMediaXHR(
        files,
        user.token,
        user.entityId,
        (pct) => {
          setPendingFiles(prev => prev.map(e =>
            e.status === 'uploading' ? { ...e, progress: pct } : e
          ))
        },
      )

      // Mark successes / failures based on API result
      setPendingFiles(prev => prev.map(e => {
        if (e.status !== 'uploading') return e
        const failed = result.errors?.find(r => r.fileName === e.file.name)
        return failed
          ? { ...e, status: 'error', error: failed.error }
          : { ...e, status: 'done', progress: 100 }
      }))

      setUploadSummary({ created: result.created, failed: result.failed })

      if (result.created > 0) {
        showToast(`تم إنشاء ${result.created} مرشح كشف. راجعها أدناه.`)
        // Switch to pending tab and reload
        setActiveTab('pending_review')
        setTimeout(loadCandidates, 400)
      }
      if (result.failed > 0) {
        showToast(`فشل رفع ${result.failed} ملف`, 'error')
      }
    } catch (uploadErr) {
      setPendingFiles(prev => prev.map(entry =>
        entry.status === 'uploading' ? { ...entry, status: 'error', error: uploadErr.message } : entry
      ))
      showToast(uploadErr.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  function clearDone() {
    setPendingFiles(prev => prev.filter(e => e.status !== 'done'))
  }

  // ── Confirm candidate ──────────────────────────────────────────────────────

  async function submitConfirm(fields) {
    const res = await apiFetch(
      `/api/ingestion/candidates/${confirmTarget.id}/confirm`,
      user.token,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) },
    )
    showToast(`بلاغ مسودة مُنشأ — ID: ${res.report?.id?.slice(0, 8)}`)
    setConfirmTarget(null)
    loadCandidates()
  }

  // ── Reject candidate ───────────────────────────────────────────────────────

  async function submitReject(reason) {
    await apiFetch(
      `/api/ingestion/candidates/${rejectTarget.id}/reject`,
      user.token,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) },
    )
    showToast('تم رفض المرشح')
    setRejectTarget(null)
    loadCandidates()
  }

  // ── Suggest groups ─────────────────────────────────────────────────────────

  async function suggestGroups() {
    setGrouping(true)
    try {
      const data = await apiFetch('/api/ingestion/candidates/suggest-groups', user.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proximityMeters: 50, timeWindowMinutes: 30 }),
      })
      setGroupSuggestions(data.suggestedGroups)
      if (data.groupCount === 0) showToast('لا توجد مجموعات مقترحة وفق المعايير الحالية', 'info')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setGrouping(false)
    }
  }

  async function confirmGroup(candidateIds) {
    try {
      const res = await apiFetch('/api/ingestion/candidates/confirm-group', user.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds }),
      })
      showToast(`بلاغ مجمّع مُنشأ من ${res.groupedCount} مرشحات`)
      setGroupSuggestions(null)
      loadCandidates()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
  }

  const isPending = activeTab === 'pending_review'

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6" dir="rtl">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Inbox size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">إنشاء بلاغات من الصور والفيديو</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400">رفع وسائط → تحقق بشري → بلاغ مسودة محكوم</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPending && hasToken && (
            <button onClick={suggestGroups} disabled={grouping}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              <Layers size={14} />
              {grouping ? 'جارٍ التحليل…' : 'اقتراح تجميع'}
            </button>
          )}
          <button onClick={loadCandidates} disabled={!hasToken}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* No-token banner */}
      {!hasToken && <NoTokenBanner />}

      {/* ── UPLOAD SECTION ─────────────────────────────────────────────────── */}
      {hasToken && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-slate-500 dark:text-gray-400" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">رفع وسائط جديدة</h2>
            <span className="text-xs text-slate-400 dark:text-gray-500 mr-auto">
              كل ملف يُنشئ مرشح كشف مستقل — لا يُنشأ بلاغ تلقائياً
            </span>
          </div>

          {/* AI pipeline note */}
          <div className="flex items-start gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 rounded-xl px-3 py-2.5">
            <Cpu size={13} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              عند تفعيل خط YOLO، ستظهر مرشحات الكشف التلقائي هنا تلقائياً. كل مرشح يتطلب تأكيداً بشرياً.
            </p>
          </div>

          <UploadZone onFiles={addFiles} />

          {/* Pending file list */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {pendingFiles.length} ملف(ات)
                </span>
                {pendingFiles.some(e => e.status === 'done') && (
                  <button onClick={clearDone} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                    مسح المكتملة
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {pendingFiles.map((entry, i) => (
                  <UploadRow key={i} file={entry.file} status={entry.status}
                    progress={entry.progress} error={entry.error}
                    onRemove={removeFile} />
                ))}
              </div>
              {pendingFiles.some(e => e.status === 'idle') && (
                <button onClick={handleUpload} disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  {uploading
                    ? <><RefreshCw size={14} className="animate-spin" /> جارٍ الرفع…</>
                    : <><Upload size={14} /> رفع {pendingFiles.filter(e => e.status === 'idle').length} ملف(ات)</>
                  }
                </button>
              )}
            </div>
          )}

          {/* Upload summary */}
          {uploadSummary && (
            <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${
              uploadSummary.failed === 0
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
            }`}>
              <CheckCircle2 size={15} />
              {uploadSummary.created} مرشح مُنشأ.
              {uploadSummary.failed > 0 && ` ${uploadSummary.failed} فشلت.`}
              {' '}راجع المرشحات أدناه.
            </div>
          )}
        </div>
      )}

      {/* ── GROUP SUGGESTIONS ──────────────────────────────────────────────── */}
      {groupSuggestions?.length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
              <Layers size={14} /> {groupSuggestions.length} مجموعة مقترحة
            </h3>
            <button onClick={() => setGroupSuggestions(null)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">إغلاق</button>
          </div>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            اقتراحات فقط بناءً على القرب الجغرافي والزمني. التأكيد بشري إلزامي.
          </p>
          <div className="space-y-2">
            {groupSuggestions.map((g, i) => (
              <div key={i} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-xl p-3 border border-indigo-100 dark:border-indigo-500/20">
                <div className="text-sm">
                  <span className="font-semibold text-slate-800 dark:text-white">{g.description?.memberCount} مرشحات</span>
                  {g.description?.centerPoint && (
                    <span className="text-xs text-slate-400 dark:text-gray-500 mr-2">
                      ({g.description.centerPoint.lat.toFixed(4)}, {g.description.centerPoint.lng.toFixed(4)})
                    </span>
                  )}
                  {g.description?.elementTypes?.length > 0 && (
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full mr-2">
                      {g.description.elementTypes.join('، ')}
                    </span>
                  )}
                </div>
                <button onClick={() => confirmGroup(g.candidateIds)}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors">
                  تأكيد المجموعة
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── REVIEW QUEUE ───────────────────────────────────────────────────── */}
      {hasToken && (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
            {REVIEW_TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-gray-900 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                }`}>
                {tab.label}
                {activeTab === tab.key && total > 0 && (
                  <span className={`w-5 h-5 rounded-full ${tab.dotColor} text-white text-xs flex items-center justify-center font-bold`}>
                    {total > 99 ? '99+' : total}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Error */}
          {loadErr && (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">خطأ في تحميل المرشحات</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{loadErr}</p>
              </div>
              <button onClick={loadCandidates} className="mr-auto text-xs text-red-600 hover:underline">إعادة المحاولة</button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400 dark:text-gray-600">
              <RefreshCw size={18} className="animate-spin" />
              <span className="text-sm">جارٍ التحميل…</span>
            </div>
          )}

          {/* Empty */}
          {!loading && !loadErr && candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 dark:text-gray-600">
              <ScanSearch size={40} strokeWidth={1} />
              <p className="text-sm font-medium">لا توجد مرشحات في هذه الحالة</p>
              {isPending && <p className="text-xs">ارفع وسائط من القسم أعلاه لبدء الاستيعاب</p>}
            </div>
          )}

          {/* Candidate grid */}
          {!loading && !loadErr && candidates.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {candidates.map(c => (
                <CandidateCard
                  key={c.id} c={c} isPending={isPending}
                  onConfirm={setConfirmTarget} onReject={setRejectTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmTarget && (
        <ConfirmModal
          candidate={confirmTarget}
          onConfirm={submitConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <RejectModal
          onReject={submitReject}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}
