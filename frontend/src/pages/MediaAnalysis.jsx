import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  Camera, Video, X, Tag, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Brain, MapPin, AlertTriangle, RotateCcw, ExternalLink, Loader2, ScanSearch,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

// Must stay in sync with backend VIOLATION_TYPES
const ELEMENT_TYPES = [
  { id: 'construction_waste',          name: 'مخلفات البناء' },
  { id: 'construction_site_fencing',   name: 'تسوير مواقع الأعمال' },
  { id: 'temp_barriers',               name: 'الحواجز المؤقتة' },
  { id: 'building_under_construction', name: 'تغطية المباني تحت الإنشاء' },
  { id: 'lighting_poles',              name: 'أعمدة الإنارة' },
  { id: 'abandoned_vehicles',          name: 'المركبات المهملة' },
  { id: 'commercial_signs',            name: 'اللوحات التجارية' },
  { id: 'restaurant_vents',            name: 'مداخن التهوية' },
  { id: 'street_furniture',            name: 'أثاث الشوارع' },
  { id: 'wall_graffiti',               name: 'الكتابات المشوهة' },
  { id: 'waste_containers',            name: 'الحاويات والنفايات' },
  { id: 'street_excavation',           name: 'حفر الشوارع' },
  { id: 'directional_signs',           name: 'اللوحات الإرشادية' },
  { id: 'sidewalks',                   name: 'الأرصفة المتهالكة' },
  { id: 'general_cleanliness',         name: 'النظافة العامة' },
  { id: 'illegal_storage',             name: 'التشوين' },
  { id: 'material_transport',          name: 'نقل مواد البناء' },
  { id: 'roof_hangars',                name: 'الهناجر فوق السطوح' },
  { id: 'building_cladding',           name: 'تكسيات المباني' },
  { id: 'ac_pipes',                    name: 'مجاري التكييف' },
  { id: 'satellite_dishes',            name: 'أطباق الأقمار الاصطناعية' },
  { id: 'canopies',                    name: 'المظلات والخيام' },
  { id: 'balcony_coverage',            name: 'تغطية الشرفات' },
  { id: 'advertising_boards',          name: 'اللوحات الإعلانية' },
  { id: 'street_vendors',              name: 'البائعين الجائلين' },
  { id: 'warning_signs',               name: 'اللوحات التحذيرية' },
]

const TAG_COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
]

function buildUploadUrl(path) {
  if (!path) return null
  const rel = path.replace(/^uploads[/\\]/, '')
  return `${API}/uploads/${rel}`
}

function confColor(c) {
  if (c >= 0.8) return 'text-emerald-600 dark:text-emerald-400'
  if (c >= 0.6) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function EditModal({ candidate, onSave, onClose }) {
  const [elementType, setElementType] = useState(candidate.suggested_element_type || '')
  const [saving, setSaving] = useState(false)

  const handle = async () => {
    if (!elementType) return
    setSaving(true)
    await onSave(candidate.id, elementType, ELEMENT_TYPES.find(e => e.id === elementType)?.name)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">تعديل التصنيف</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
          التصنيف الحالي:{' '}
          <span className="font-medium text-slate-700 dark:text-gray-200">
            {candidate.suggested_element_label || candidate.suggested_element_type || '—'}
          </span>
        </p>
        <select
          value={elementType}
          onChange={e => setElementType(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— اختر التصنيف —</option>
          {ELEMENT_TYPES.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={handle} disabled={!elementType || saving}
            className="flex-1 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Tag size={13} />}
            حفظ
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ candidate, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handle = async () => {
    setSaving(true)
    await onConfirm(candidate.id, reason)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">رفض الاكتشاف</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
          سيتم رفض هذا الاكتشاف ولن يُحوَّل إلى بلاغ.
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="سبب الرفض (اختياري)"
          rows={3}
          className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-3 py-2 text-sm mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={handle} disabled={saving}
            className="flex-1 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            رفض
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ candidate, user, onConfirm, onClose }) {
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const entityId = user?.entityId || user?.entity_id || null
  const needsEntity = !entityId
  const [manualEntityId, setManualEntityId] = useState('')

  const handle = async () => {
    if (needsEntity && !manualEntityId) return
    setSaving(true)
    await onConfirm(candidate.id, {
      description,
      entityId: entityId || manualEntityId || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">إنشاء بلاغ</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 mb-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">العنصر: </span>
            {candidate.suggested_element_label || candidate.suggested_element_type}
          </div>
          {needsEntity && (
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400 block mb-1">
                معرّف الجهة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={manualEntityId}
                onChange={e => setManualEntityId(e.target.value)}
                placeholder="أدخل معرّف الجهة"
                className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400 block mb-1">وصف المخالفة</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="وصف اختياري للمخالفة..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={handle} disabled={saving || (needsEntity && !manualEntityId)}
            className="flex-1 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium transition-colors flex items-center justify-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            إنشاء البلاغ
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MediaAnalysis() {
  const { user, authFetch }     = useAuth()
  const navigate                = useNavigate()
  const fileRef                 = useRef()
  const token                   = user?.token

  const [phase, setPhase]       = useState('idle')   // 'idle' | 'uploading' | 'reviewing'
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState(null)

  const [uploadResults, setUploadResults] = useState([])  // [{ingestionId, fileName, fileType, localUrl, mediaType}]
  const [fileIdx, setFileIdx]             = useState(0)

  const [candidates, setCandidates]               = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [selectedId, setSelectedId]               = useState(null)

  const [editModal,    setEditModal]    = useState(null)
  const [rejectModal,  setRejectModal]  = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)
  const [createdReports, setCreatedReports] = useState([])

  const currentFile = uploadResults[fileIdx]

  // Load candidates for ingestionId
  const loadCandidates = useCallback(async (ingestionId) => {
    if (!ingestionId) return
    setLoadingCandidates(true)
    setCandidates([])
    setSelectedId(null)
    try {
      const res = await authFetch(
        `/api/ingestion/candidates?media_ingestion_id=${ingestionId}&review_status=pending_review&limit=50`
      )
      if (res?.ok) {
        const data = await res.json()
        const list = data.candidates || []
        setCandidates(list)
        if (list.length > 0) setSelectedId(list[0].id)
      }
    } finally {
      setLoadingCandidates(false)
    }
  }, [authFetch])

  useEffect(() => {
    if (phase === 'reviewing' && currentFile?.ingestionId) {
      loadCandidates(currentFile.ingestionId)
    }
  }, [phase, fileIdx, currentFile?.ingestionId, loadCandidates])

  // Upload handler
  const handleFiles = useCallback((files) => {
    if (!files?.length) return
    setPhase('uploading')
    setProgress(0)
    setError(null)
    setCreatedReports([])

    const localUrls = files.map(f => ({
      name:      f.name,
      url:       URL.createObjectURL(f),
      mediaType: f.type.startsWith('video/') ? 'video' : 'image',
    }))

    const form = new FormData()
    files.forEach(f => form.append('files', f))

    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        const mapped = (data.results || []).map((r, i) => ({
          ingestionId: r.ingestionId,
          fileName:    r.fileName,
          fileType:    r.fileType,
          localUrl:    localUrls[i]?.url,
          mediaType:   localUrls[i]?.mediaType ?? 'image',
        }))
        setUploadResults(mapped)
        setFileIdx(0)
        setPhase('reviewing')
      } else {
        const body = JSON.parse(xhr.responseText || '{}')
        setError(body.error || 'فشل الرفع')
        setPhase('idle')
      }
    })
    xhr.addEventListener('error', () => { setError('خطأ في الشبكة'); setPhase('idle') })
    xhr.open('POST', `${API}/api/ingestion/media`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(form)
  }, [token])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type.startsWith('video/')
    )
    if (files.length) handleFiles(files)
  }, [handleFiles])

  // Edit tag
  const handleSaveEdit = useCallback(async (candidateId, elementType, elementLabel) => {
    const res = await authFetch(`/api/ingestion/candidates/${candidateId}/tag`, {
      method:  'PATCH',
      body:    JSON.stringify({ elementType, elementLabel }),
    })
    if (res?.ok) {
      setCandidates(prev => prev.map(c =>
        c.id === candidateId
          ? { ...c, suggested_element_type: elementType, suggested_element_label: elementLabel }
          : c
      ))
    }
  }, [authFetch])

  // Reject
  const handleReject = useCallback(async (candidateId, reason) => {
    const res = await authFetch(`/api/ingestion/candidates/${candidateId}/reject`, {
      method: 'PATCH',
      body:   JSON.stringify({ reason }),
    })
    if (res?.ok) {
      setCandidates(prev => {
        const next = prev.filter(c => c.id !== candidateId)
        setSelectedId(next[0]?.id ?? null)
        return next
      })
    }
  }, [authFetch])

  // Confirm → create report
  const handleConfirm = useCallback(async (candidateId, { description, entityId }) => {
    const res = await authFetch(`/api/ingestion/candidates/${candidateId}/confirm`, {
      method: 'PATCH',
      body:   JSON.stringify({ description, entityId }),
    })
    if (res?.ok) {
      const data = await res.json()
      setCreatedReports(prev => [
        ...prev,
        { id: data.reportId, number: data.report?.report_number },
      ])
      setCandidates(prev => {
        const next = prev.filter(c => c.id !== candidateId)
        setSelectedId(next[0]?.id ?? null)
        return next
      })
    }
  }, [authFetch])

  const reset = useCallback(() => {
    setPhase('idle')
    setUploadResults([])
    setCandidates([])
    setError(null)
    setCreatedReports([])
    setFileIdx(0)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">تحليل المرئيات</h1>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">
            رصد عناصر التشوه البصري بالذكاء الاصطناعي
          </p>
        </div>
        {phase !== 'idle' && (
          <button onClick={reset}
            className="flex items-center gap-2 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            <RotateCcw size={13} /> تحليل جديد
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── Idle: upload zone ── */}
      {phase === 'idle' && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-16 text-center cursor-pointer transition-all
              ${dragOver
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/5'
                : 'hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-slate-50 dark:hover:bg-gray-800/40'
              }`}
          >
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
              onChange={e => handleFiles(Array.from(e.target.files))} />
            <div className="flex justify-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <Camera size={24} className="text-blue-500" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                <Video size={24} className="text-purple-500" />
              </div>
            </div>
            <p className="text-slate-700 dark:text-gray-200 font-semibold text-lg mb-1">
              أسقط صور أو فيديو هنا
            </p>
            <p className="text-slate-400 dark:text-gray-600 text-sm">
              JPG · PNG · MP4 · MOV — حتى 100MB — متعدد الملفات
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['صور بدقة عالية',  'الحد الأدنى 720px للحصول على نتائج دقيقة'],
              ['فيديو واضح',       'تصوير مستقر بإضاءة جيدة يرفع دقة الكشف'],
              ['زوايا متعددة',     'التقط من عدة زوايا لتغطية كافة عناصر المنطقة'],
            ].map(([t, d]) => (
              <div key={t} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-1">{t}</p>
                <p className="text-xs text-slate-400 dark:text-gray-500">{d}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Uploading ── */}
      {phase === 'uploading' && (
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-10 text-center space-y-4">
          <ScanSearch size={48} className="text-blue-500 mx-auto animate-pulse" />
          <div>
            <p className="text-slate-700 dark:text-gray-200 font-semibold mb-1">
              جارٍ الرفع والتحليل الذكي...
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-500">
              يتم رفع الملف وتحليل عناصر التشوه البصري بالذكاء الاصطناعي
            </p>
          </div>
          <div className="max-w-sm mx-auto bg-slate-100 dark:bg-gray-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 dark:text-gray-600">{progress}%</p>
        </div>
      )}

      {/* ── Reviewing ── */}
      {phase === 'reviewing' && currentFile && (
        <div className="space-y-4">

          {/* Multi-file nav */}
          {uploadResults.length > 1 && (
            <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-2.5">
              <button
                onClick={() => setFileIdx(i => Math.max(0, i - 1))}
                disabled={fileIdx === 0}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors">
                <ChevronRight size={16} />
              </button>
              <span className="text-sm text-slate-600 dark:text-gray-300">
                <span className="font-semibold text-slate-800 dark:text-white">{fileIdx + 1}</span>
                {' / '}{uploadResults.length} — {currentFile.fileName}
              </span>
              <button
                onClick={() => setFileIdx(i => Math.min(uploadResults.length - 1, i + 1))}
                disabled={fileIdx === uploadResults.length - 1}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors">
                <ChevronLeft size={16} />
              </button>
            </div>
          )}

          {/* Created reports summary */}
          {createdReports.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 size={15} />
                  تم إنشاء {createdReports.length} بلاغ — الحالة: مسودة
                </div>
                <button
                  onClick={() => navigate('/reports')}
                  className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                  <ExternalLink size={12} /> عرض جميع البلاغات
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {createdReports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/reports/${r.id}`)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 font-medium transition-colors flex items-center gap-1">
                    <ExternalLink size={10} />
                    {r.number ? `بلاغ #${r.number}` : `فتح البلاغ`} ← تقديم للمراجعة
                  </button>
                ))}
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">
                افتح البلاغ واضغط "تقديم" لبدء دورة العمل الكاملة
              </p>
            </div>
          )}

          {/* Main review layout */}
          <div className="grid grid-cols-12 gap-4">

            {/* Image with bbox overlays — col 8 */}
            <div className="col-span-8 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
              {currentFile.mediaType === 'image' ? (
                <div className="relative select-none">
                  <img
                    src={currentFile.localUrl}
                    alt=""
                    className="w-full object-contain"
                    style={{ maxHeight: 520, background: '#0f172a' }}
                  />

                  {/* Bbox tag overlays */}
                  {candidates.map((c, i) => {
                    const bbox = c.detection_bbox
                    if (!Array.isArray(bbox) || bbox.length < 4) return null
                    const [bx, by, bw, bh] = bbox
                    const color     = TAG_COLORS[i % TAG_COLORS.length]
                    const isActive  = c.id === selectedId
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        className="absolute cursor-pointer transition-all duration-150"
                        style={{
                          left:    `${bx}%`,
                          top:     `${by}%`,
                          width:   `${bw}%`,
                          height:  `${bh}%`,
                          border:  `2px solid ${color}`,
                          borderRadius: 6,
                          background: isActive ? `${color}28` : `${color}0d`,
                          boxShadow: isActive ? `0 0 0 2px ${color}50` : 'none',
                        }}
                      >
                        {/* AI tag label */}
                        <span
                          className="absolute -top-6 right-0 text-white text-xs px-1.5 py-0.5 rounded-md font-medium flex items-center gap-1 whitespace-nowrap shadow-sm"
                          style={{ background: color }}
                        >
                          <Brain size={9} />
                          {c.suggested_element_label || c.suggested_element_type}
                          {c.detection_confidence && (
                            <span className="opacity-80">
                              {' '}{Math.round(parseFloat(c.detection_confidence) * 100)}%
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })}

                  <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-sm flex items-center gap-1.5">
                    <Brain size={11} />
                    {candidates.length} اكتشاف ذكي
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <video
                    src={currentFile.localUrl}
                    controls
                    className="w-full"
                    style={{ maxHeight: 520, background: '#0f172a' }}
                  />
                  <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-sm">
                    فيديو — {candidates.length} اكتشاف
                  </div>
                </div>
              )}
            </div>

            {/* Candidate panel — col 4 */}
            <div
              className="col-span-4 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto"
              style={{ maxHeight: 556 }}
            >
              <div className="flex items-center justify-between flex-shrink-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">نتائج الكشف</p>
                <span className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Brain size={10} /> ذكاء اصطناعي
                </span>
              </div>

              {loadingCandidates ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                  <Loader2 size={24} className="animate-spin" />
                  <p className="text-xs">جاري تحميل نتائج التحليل...</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                  <CheckCircle2 size={28} className="text-emerald-400" />
                  <p className="text-xs text-center text-slate-500 dark:text-gray-400">
                    تمت مراجعة جميع الاكتشافات
                  </p>
                </div>
              ) : (
                candidates.map((c, i) => {
                  const color     = TAG_COLORS[i % TAG_COLORS.length]
                  const conf      = parseFloat(c.detection_confidence) || 0
                  const isActive  = c.id === selectedId
                  const hasBbox   = Array.isArray(c.detection_bbox) && c.detection_bbox.length === 4

                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`border rounded-xl p-3 cursor-pointer transition-all ${
                        isActive
                          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {/* Row 1: color dot + label + confidence */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-sm font-medium text-slate-700 dark:text-gray-200 flex-1 truncate">
                          {c.suggested_element_label || c.suggested_element_type || '—'}
                        </span>
                        {conf > 0 && (
                          <span className={`text-xs font-bold tabular-nums ${confColor(conf)}`}>
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </div>

                      {/* Confidence bar */}
                      {conf > 0 && (
                        <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1 mb-2">
                          <div
                            className="h-1 rounded-full transition-all"
                            style={{ width: `${conf * 100}%`, background: color }}
                          />
                        </div>
                      )}

                      {/* Badges row */}
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {c.detection_source === 'ai_vision' && (
                          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                            <Brain size={9} /> تحليل ذكي
                          </span>
                        )}
                        {hasBbox && (
                          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                            موقع محدد
                          </span>
                        )}
                      </div>

                      {/* GPS */}
                      {c.gps_lat != null && (
                        <p className="text-xs text-slate-400 dark:text-gray-500 flex items-center gap-1 mb-2">
                          <MapPin size={9} />
                          {parseFloat(c.gps_lat).toFixed(5)}, {parseFloat(c.gps_lng).toFixed(5)}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={e => { e.stopPropagation(); setEditModal(c) }}
                          className="flex-1 text-xs py-1.5 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-1">
                          <Tag size={10} /> تعديل
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setRejectModal(c) }}
                          className="flex-1 text-xs py-1.5 rounded-lg border border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1">
                          <XCircle size={10} /> رفض
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmModal(c) }}
                          className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-1">
                          <CheckCircle2 size={10} /> بلاغ
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {editModal && (
        <EditModal
          candidate={editModal}
          onSave={handleSaveEdit}
          onClose={() => setEditModal(null)}
        />
      )}
      {rejectModal && (
        <RejectModal
          candidate={rejectModal}
          onConfirm={handleReject}
          onClose={() => setRejectModal(null)}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          candidate={confirmModal}
          user={user}
          onConfirm={handleConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
