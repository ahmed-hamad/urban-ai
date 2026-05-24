import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Upload, RefreshCw, Layers, Search, Trash2, Play, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

function useObservationLayers() {
  const { user } = useAuth()
  const [layers, setLayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const fetch_ = useCallback(async () => {
    if (!user?.token) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/api/observations`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      const d = await r.json()
      setLayers(d.layers ?? [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [user?.token])

  useEffect(() => { fetch_() }, [fetch_])
  return { layers, loading, error, refresh: fetch_ }
}

const STATUS_BADGE = {
  active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export default function ObservationLayers() {
  const { user } = useAuth()
  const { layers, loading, error, refresh } = useObservationLayers()

  const [showUpload, setShowUpload]   = useState(false)
  const [file, setFile]               = useState(null)
  const [layerName, setLayerName]     = useState('')
  const [sourceName, setSourceName]   = useState('')
  const [distThreshold, setDistThreshold] = useState(20)
  const [timeThreshold, setTimeThreshold] = useState(30)
  const [uploading, setUploading]     = useState(false)
  const [uploadMsg, setUploadMsg]     = useState(null)
  const [scanning, setScanning]       = useState({})

  async function handleUpload(e) {
    e.preventDefault()
    if (!file || !layerName.trim()) return

    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', layerName.trim())
    if (sourceName.trim()) fd.append('sourceName', sourceName.trim())
    fd.append('distanceThreshold', String(distThreshold))
    fd.append('timeThreshold', String(timeThreshold))

    setUploading(true)
    setUploadMsg(null)
    try {
      const r = await fetch(`${API}/api/observations/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setUploadMsg({ type: 'success', text: `تم استيراد ${d.imported} مشاهدة (${d.valid} صالحة)` })
      setFile(null); setLayerName(''); setSourceName('')
      setShowUpload(false)
      refresh()
    } catch (err) {
      setUploadMsg({ type: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  async function triggerScan(layerId) {
    setScanning(s => ({ ...s, [layerId]: true }))
    try {
      await fetch(`${API}/api/observations/${layerId}/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      })
      setTimeout(() => { refresh(); setScanning(s => ({ ...s, [layerId]: false })) }, 3000)
    } catch {
      setScanning(s => ({ ...s, [layerId]: false }))
    }
  }

  async function archiveLayer(layerId) {
    await fetch(`${API}/api/observations/${layerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user.token}` },
    })
    refresh()
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">طبقات المشاهدة الخارجية</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">
            استيراد بيانات مشاهدات خارجية (عدسة بلدي، مسوحات ميدانية) لتحليل التكرار مع البلاغات
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh}
            className="p-2 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-gray-800">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Upload size={14} />
            رفع طبقة جديدة
          </button>
        </div>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-slate-800 dark:text-white mb-4">رفع بيانات مشاهدات</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">اسم الطبقة *</label>
                <input value={layerName} onChange={e => setLayerName(e.target.value)}
                  className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-800 dark:text-white"
                  placeholder="مثال: مسح ميداني مايو 2025" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">المصدر</label>
                <input value={sourceName} onChange={e => setSourceName(e.target.value)}
                  className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-800 dark:text-white"
                  placeholder="مثال: عدسة بلدي" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">
                  نطاق المسافة المكاني (متر) — الافتراضي: 20
                </label>
                <input type="number" value={distThreshold} min={1} max={5000}
                  onChange={e => setDistThreshold(Number(e.target.value))}
                  className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-800 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">
                  نطاق الفترة الزمنية (يوم) — الافتراضي: 30
                </label>
                <input type="number" value={timeThreshold} min={1} max={365}
                  onChange={e => setTimeThreshold(Number(e.target.value))}
                  className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-800 dark:text-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">
                الملف (GeoJSON أو Shapefile) *
              </label>
              <input type="file" accept=".geojson,.json,.shp"
                onChange={e => setFile(e.target.files[0] || null)}
                className="w-full text-sm text-slate-600 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-400" />
            </div>
            {uploadMsg && (
              <p className={`text-sm rounded-lg px-3 py-2 ${uploadMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                {uploadMsg.text}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-sm border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800">
                إلغاء
              </button>
              <button type="submit" disabled={uploading || !file || !layerName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">
                {uploading ? 'جارٍ الرفع…' : 'رفع واستيراد'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Layers table */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {loading && !layers.length ? (
        <div className="text-center py-12 text-slate-400">جارٍ التحميل…</div>
      ) : layers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-gray-500">
          <Layers size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد طبقات مشاهدات بعد</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50">
                {['الاسم', 'المصدر', 'المشاهدات', 'متطابقة', 'المسافة', 'المدة', 'الحالة', ''].map((h, i) => (
                  <th key={i} className="text-right text-xs font-semibold text-slate-500 dark:text-gray-400 px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {layers.map(layer => (
                <tr key={layer.id} className="hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{layer.name}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-gray-400">{layer.source_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-gray-300">{layer.total_count.toLocaleString('ar-SA')}</td>
                  <td className="px-4 py-3">
                    {layer.matched_count > 0 ? (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {layer.matched_count.toLocaleString('ar-SA')}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-gray-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-gray-400">{layer.distance_threshold_m}م</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-gray-400">{layer.time_threshold_days} يوم</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[layer.status] || ''}`}>
                      {layer.status === 'active' ? 'نشطة' : 'مؤرشفة'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => triggerScan(layer.id)} disabled={scanning[layer.id]}
                        title="تشغيل تحليل التكرار"
                        className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-40">
                        <Play size={13} className={scanning[layer.id] ? 'animate-pulse' : ''} />
                      </button>
                      <Link to={`/duplicates?layerId=${layer.id}`}
                        title="عرض نتائج التحليل"
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800">
                        <Eye size={13} />
                      </Link>
                      <button onClick={() => archiveLayer(layer.id)}
                        title="أرشفة الطبقة"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
