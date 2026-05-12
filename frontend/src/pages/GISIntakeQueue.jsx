import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, GeoJSON, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useAuth } from '@/context/AuthContext'
import {
  Map, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Layers, ChevronRight, ScanSearch, Filter, CheckSquare, Square,
  Trash2, Settings2, Eye, EyeOff,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

function authHeader(token) { return { Authorization: `Bearer ${token}` } }

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

function parseAttrs(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  return typeof raw === 'object' ? raw : {}
}

const mapIcon = () => L.divIcon({
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#14b8a6;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
  className: '', iconSize: [12, 12], iconAnchor: [6, 6],
})

// ─── Feature map preview ──────────────────────────────────────────────────────
function FeatureMap({ feature }) {
  const center = feature.centroid_lat && feature.centroid_lng
    ? [parseFloat(feature.centroid_lat), parseFloat(feature.centroid_lng)]
    : null

  if (!center && !feature.geometry_geojson) {
    return (
      <div className="h-32 bg-slate-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <Map size={20} className="text-slate-400 dark:text-gray-600" />
      </div>
    )
  }

  return (
    <div className="h-32 rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700">
      <MapContainer
        center={center ?? [24.68, 46.68]}
        zoom={center ? 14 : 10}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {feature.geometry_geojson && (
          <GeoJSON
            key={feature.id}
            data={feature.geometry_geojson}
            style={{ color: '#14b8a6', weight: 2, fillOpacity: 0.25 }}
          />
        )}
        {center && <Marker position={center} icon={mapIcon()} />}
      </MapContainer>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
function ConfirmModal({ feature, onConfirm, onClose }) {
  const [elementType, setElementType] = useState(feature.mapped_element_type ?? '')
  const [description, setDescription] = useState(feature.mapped_description ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState(null)

  async function submit() {
    setBusy(true); setErr(null)
    try { await onConfirm({ elementType, description }) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">تأكيد العنصر → بلاغ مسودة</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">نوع العنصر</label>
            <input value={elementType} onChange={e => setElementType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">الوصف</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
          </div>
        </div>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={submit} disabled={busy}
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
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
function RejectModal({ title, onReject, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState(null)

  async function submit() {
    setBusy(true); setErr(null)
    try { await onReject(reason) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800 dark:text-white">{title ?? 'رفض العنصر'}</h3>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="سبب الرفض (اختياري)"
          className="w-full rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-800 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-3">
          <button onClick={submit} disabled={busy}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
            {busy ? 'جارٍ التنفيذ…' : 'تأكيد الرفض'}
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

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4500); return () => clearTimeout(t) }, [onDismiss])
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl shadow-xl text-sm font-medium text-white ${
      type === 'error' ? 'bg-red-600' : type === 'info' ? 'bg-blue-600' : 'bg-emerald-600'
    }`}>
      {type === 'error' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
      {msg}
    </div>
  )
}

// ─── Field visibility panel ───────────────────────────────────────────────────
function FieldVisibilityPanel({ allKeys, visibleFields, onToggle, onShowAll, onHideAll }) {
  if (!allKeys.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">تحكم في الحقول المعروضة</p>
        <div className="flex gap-3">
          <button onClick={onShowAll} className="text-xs text-teal-600 dark:text-teal-400 hover:underline">
            عرض الكل
          </button>
          <button onClick={onHideAll} className="text-xs text-slate-400 dark:text-gray-500 hover:underline">
            إخفاء الكل
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-y-2 gap-x-4">
        {allKeys.map(key => {
          const isVisible = !visibleFields || visibleFields.has(key)
          return (
            <label key={key} className="flex items-center gap-2 cursor-pointer group min-w-0">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => onToggle(key)}
                className="flex-shrink-0 rounded border-slate-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
              />
              <span className={`text-xs font-mono truncate transition-colors ${
                isVisible
                  ? 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                  : 'text-slate-300 dark:text-gray-700'
              }`}>{key}</span>
            </label>
          )
        })}
      </div>
      <p className="text-xs text-slate-400 dark:text-gray-600">
        {visibleFields ? `${visibleFields.size} من ${allKeys.length} حقل معروض` : `${allKeys.length} حقل — الكل معروض`}
      </p>
    </div>
  )
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ feature, selected, onSelect, onConfirm, onReject, visibleFields }) {
  const attrs = parseAttrs(feature.source_attributes)

  const attrEntries = Object.entries(attrs).filter(([k, v]) => {
    if (v == null || String(v).trim() === '') return false
    if (visibleFields && !visibleFields.has(k)) return false
    return true
  })

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden transition-all ${
      selected
        ? 'border-teal-400 dark:border-teal-500 shadow-md ring-1 ring-teal-400/30'
        : 'border-slate-200 dark:border-gray-800 hover:shadow-sm'
    }`}>
      {/* Map preview */}
      <div className="relative">
        <FeatureMap feature={feature} />
        {/* Select checkbox */}
        <button
          onClick={() => onSelect(feature.id)}
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded-md bg-white/90 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-700 flex items-center justify-center transition-colors hover:border-teal-500">
          {selected
            ? <CheckSquare size={14} className="text-teal-600" />
            : <Square      size={14} className="text-slate-400" />
          }
        </button>
        {/* Feature index badge */}
        <span className="absolute top-2 left-2 z-10 text-xs font-mono bg-black/50 text-white px-1.5 py-0.5 rounded">
          #{feature.feature_index ?? '—'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Element type + geometry badges */}
        <div className="flex flex-wrap gap-1.5">
          {feature.mapped_element_type && (
            <span className="text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full font-medium">
              {feature.mapped_element_type}
            </span>
          )}
          <span className="text-xs bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
            {feature.geometry_type ?? '—'}
          </span>
        </div>

        {/* Description */}
        {feature.mapped_description && (
          <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed line-clamp-2">
            {feature.mapped_description}
          </p>
        )}

        {/* Source job */}
        <p className="text-xs text-slate-400 dark:text-gray-600 truncate">
          {feature.job_file_name}
        </p>

        {/* Source attributes (filtered by visibleFields) */}
        {attrEntries.length > 0 && (
          <div className="space-y-0.5 border-t border-slate-100 dark:border-gray-800 pt-2">
            {attrEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-slate-400 dark:text-gray-600 font-mono shrink-0 w-24 truncate" title={k}>{k}</span>
                <span className="text-slate-600 dark:text-gray-300 truncate" title={String(v)}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {attrEntries.length === 0 && Object.keys(attrs).length > 0 && (
          <p className="text-xs text-slate-300 dark:text-gray-700 italic border-t border-slate-100 dark:border-gray-800 pt-2">
            جميع الحقول مخفية — غيّر الإعدادات أعلاه
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={() => onConfirm(feature)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-xs font-semibold py-2 rounded-lg transition-colors">
            <CheckCircle2 size={13} /> تأكيد
          </button>
          <button onClick={() => onReject(feature)}
            className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold py-2 rounded-lg transition-colors">
            <XCircle size={13} /> رفض
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function GISIntakeQueue() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const jobFilter = searchParams.get('job') ?? ''

  const [features, setFeatures]   = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [loadErr, setLoadErr]     = useState(null)
  const [selected, setSelected]   = useState(new Set())

  // Modals
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [rejectTarget,  setRejectTarget]  = useState(null)
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false)

  // Bulk operation busy states
  const [bulkConfirmBusy, setBulkConfirmBusy] = useState(false)
  const [bulkRejectBusy,  setBulkRejectBusy]  = useState(false)
  const [bulkDeleteBusy,  setBulkDeleteBusy]  = useState(false)

  // Field visibility
  const [showFieldPanel, setShowFieldPanel] = useState(false)
  const [visibleFields,  setVisibleFields]  = useState(null) // null = show all

  const [toast, setToast] = useState(null)
  const hasToken = !!user?.token

  // ── Compute all unique attribute keys across loaded features ──────────────
  const allFieldKeys = useMemo(() => {
    const keys = new Set()
    features.forEach(f => {
      const attrs = parseAttrs(f.source_attributes)
      Object.keys(attrs).forEach(k => keys.add(k))
    })
    return [...keys].sort()
  }, [features])

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!hasToken) return
    setLoading(true)
    setLoadErr(null)
    try {
      const qs = new URLSearchParams({ limit: '50', ...(jobFilter ? { import_job_id: jobFilter } : {}) })
      const data = await apiFetch(`/api/ingestion/gis/intake?${qs}`, user.token)
      setFeatures(data.features ?? [])
      setTotal(data.total ?? 0)
      setSelected(new Set())
    } catch (e) {
      setLoadErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [hasToken, user?.token, jobFilter])

  useEffect(() => { load() }, [load])

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev =>
      prev.size === features.length ? new Set() : new Set(features.map(f => f.id))
    )
  }

  // ── Field visibility helpers ──────────────────────────────────────────────
  function toggleField(key) {
    setVisibleFields(prev => {
      const current = prev ?? new Set(allFieldKeys)
      const next = new Set(current)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function showAllFields() { setVisibleFields(null) }

  function hideAllFields() { setVisibleFields(new Set()) }

  // ── Per-feature actions ───────────────────────────────────────────────────
  async function submitConfirm({ elementType, description }) {
    await apiFetch(`/api/ingestion/gis/features/${confirmTarget.id}/confirm`, user.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementType, description }),
    })
    showToast('بلاغ مسودة تم إنشاؤه من عنصر GIS')
    setConfirmTarget(null)
    load()
  }

  async function submitReject(reason) {
    await apiFetch(`/api/ingestion/gis/features/${rejectTarget.id}/reject`, user.token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    showToast('تم رفض العنصر')
    setRejectTarget(null)
    load()
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  async function bulkConfirm() {
    if (!selected.size || bulkConfirmBusy) return
    setBulkConfirmBusy(true)
    try {
      const res = await apiFetch('/api/ingestion/gis/features/bulk-confirm', user.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureIds: [...selected] }),
      })
      showToast(`${res.confirmed} بلاغ تم إنشاؤه من العناصر المحددة`)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBulkConfirmBusy(false)
    }
  }

  async function submitBulkReject(reason) {
    setBulkRejectBusy(true)
    try {
      const res = await apiFetch('/api/ingestion/gis/features/bulk-reject', user.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureIds: [...selected], reason }),
      })
      showToast(`${res.rejected} عنصر تم رفضه`)
      setBulkRejectOpen(false)
      load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBulkRejectBusy(false)
    }
  }

  async function bulkDelete() {
    if (!selected.size || bulkDeleteBusy) return
    setBulkDeleteBusy(true)
    try {
      const res = await apiFetch('/api/ingestion/gis/features/bulk-delete', user.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureIds: [...selected] }),
      })
      showToast(`${res.deleted} عنصر تم حذفه من القائمة`, 'info')
      load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBulkDeleteBusy(false)
    }
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }) }

  const allSelected = features.length > 0 && selected.size === features.length
  const anyBulkBusy = bulkConfirmBusy || bulkRejectBusy || bulkDeleteBusy

  return (
    <div className="p-6 space-y-4" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
            <Layers size={20} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">قائمة مراجعة عناصر GIS</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              مراجعة العناصر المستوردة → تأكيد → بلاغ مسودة محكوم
            </p>
          </div>
          {total > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-semibold">
              {total.toLocaleString()} عنصر بانتظار المراجعة
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={load} disabled={!hasToken || loading}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Toolbar: selection + bulk actions + field visibility ── */}
      {features.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-gray-800/60 rounded-xl px-3 py-2.5">
          {/* Select all toggle */}
          <button onClick={toggleAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-gray-700 rounded-lg transition-colors bg-white dark:bg-gray-900">
            {allSelected ? <CheckSquare size={13} className="text-teal-600" /> : <Square size={13} />}
            {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>

          {selected.size > 0 && (
            <>
              <span className="text-xs text-slate-400 dark:text-gray-600">
                {selected.size} محدد
              </span>

              {/* Bulk confirm */}
              <button onClick={bulkConfirm} disabled={anyBulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                {bulkConfirmBusy
                  ? <><RefreshCw size={12} className="animate-spin" /> جارٍ التأكيد…</>
                  : <><CheckCircle2 size={12} /> تأكيد المحدد ({selected.size})</>
                }
              </button>

              {/* Bulk reject */}
              <button onClick={() => setBulkRejectOpen(true)} disabled={anyBulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-500/30 transition-colors disabled:opacity-50">
                {bulkRejectBusy
                  ? <><RefreshCw size={12} className="animate-spin" /> جارٍ الرفض…</>
                  : <><XCircle size={12} /> رفض المحدد ({selected.size})</>
                }
              </button>

              {/* Bulk delete */}
              <button onClick={bulkDelete} disabled={anyBulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-400 text-xs font-semibold rounded-lg border border-slate-200 dark:border-gray-700 transition-colors disabled:opacity-50">
                {bulkDeleteBusy
                  ? <><RefreshCw size={12} className="animate-spin" /> جارٍ الحذف…</>
                  : <><Trash2 size={12} /> حذف من القائمة ({selected.size})</>
                }
              </button>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Field visibility toggle */}
          {allFieldKeys.length > 0 && (
            <button
              onClick={() => setShowFieldPanel(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                showFieldPanel
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                  : 'bg-white dark:bg-gray-900 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-700 hover:text-slate-700 dark:hover:text-white'
              }`}
            >
              {showFieldPanel ? <EyeOff size={13} /> : <Eye size={13} />}
              الحقول المرئية
              {visibleFields && (
                <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-full px-1.5 py-0.5 text-xs font-bold">
                  {visibleFields.size}/{allFieldKeys.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* ── Field visibility panel ── */}
      {showFieldPanel && allFieldKeys.length > 0 && (
        <FieldVisibilityPanel
          allKeys={allFieldKeys}
          visibleFields={visibleFields}
          onToggle={toggleField}
          onShowAll={showAllFields}
          onHideAll={hideAllFields}
        />
      )}

      {/* ── Job filter indicator ── */}
      {jobFilter && (
        <div className="flex items-center gap-2 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-500/30 rounded-xl px-4 py-2.5 text-xs text-teal-700 dark:text-teal-300">
          <Filter size={12} />
          عرض عناصر مهمة الاستيراد: <strong className="font-mono">{jobFilter.slice(0, 8)}…</strong>
          <button onClick={() => navigate('/gis-intake')} className="mr-auto text-teal-600 dark:text-teal-400 hover:underline">
            عرض الكل
          </button>
        </div>
      )}

      {/* ── Governance note ── */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          كل عنصر يتطلب مراجعة وتأكيد بشري قبل إنشاء البلاغ. التأكيد ينشئ بلاغ مسودة يدخل دورة العمل الحوكمية.
          الرفض يُسجَّل في سجل التدقيق. الحذف يُزيل العنصر نهائياً من قائمة الانتظار (قبل التأكيد فقط).
        </p>
      </div>

      {/* ── Error ── */}
      {loadErr && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 flex-1">{loadErr}</p>
          <button onClick={load} className="text-xs text-red-600 hover:underline">إعادة المحاولة</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-400 dark:text-gray-600">
          <RefreshCw size={18} className="animate-spin" />
          <span className="text-sm">جارٍ تحميل عناصر GIS…</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !loadErr && features.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 dark:text-gray-600">
          <ScanSearch size={44} strokeWidth={1} />
          <p className="text-sm font-medium">لا توجد عناصر GIS بانتظار المراجعة</p>
          <p className="text-xs text-center max-w-xs">
            يتم عرض العناصر هنا بعد استيراد ملف GIS بنوع "بلاغات" من صفحة استيراد GIS.
          </p>
          <button onClick={() => navigate('/gis-import')}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <ChevronRight size={14} /> انتقل إلى استيراد GIS
          </button>
        </div>
      )}

      {/* ── Feature grid ── */}
      {!loading && !loadErr && features.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {features.map(f => (
            <FeatureCard
              key={f.id}
              feature={f}
              selected={selected.has(f.id)}
              onSelect={toggleSelect}
              onConfirm={setConfirmTarget}
              onReject={setRejectTarget}
              visibleFields={visibleFields}
            />
          ))}
        </div>
      )}

      {/* ── Per-feature confirm dialog ── */}
      {confirmTarget && (
        <ConfirmModal
          feature={confirmTarget}
          onConfirm={submitConfirm}
          onClose={() => setConfirmTarget(null)}
        />
      )}

      {/* ── Per-feature reject dialog ── */}
      {rejectTarget && (
        <RejectModal
          title="رفض العنصر"
          onReject={submitReject}
          onClose={() => setRejectTarget(null)}
        />
      )}

      {/* ── Bulk reject dialog ── */}
      {bulkRejectOpen && (
        <RejectModal
          title={`رفض ${selected.size} عنصر محدد`}
          onReject={submitBulkReject}
          onClose={() => setBulkRejectOpen(false)}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}
