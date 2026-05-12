import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Search, Filter } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

function ConfidenceBadge({ value }) {
  const pct = Math.round((value ?? 0) * 100)
  const color = pct >= 80 ? 'text-red-600 dark:text-red-400'
              : pct >= 60 ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-gray-400'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-blue-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
    </div>
  )
}

const STATUS_LABELS = {
  pending:              { label: 'بانتظار المراجعة', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  confirmed_duplicate:  { label: 'مؤكّد تكرار',     color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  rejected:             { label: 'ليس تكراراً',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  merged:               { label: 'مدمج',             color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

export default function DuplicateAnalysis() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const presetLayer = searchParams.get('layerId')

  const [candidates, setCandidates] = useState([])
  const [stats, setStats]           = useState(null)
  const [loading, setLoading]       = useState(false)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [reviewing, setReviewing]   = useState(null)    // { id, decision }
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const load = useCallback(async () => {
    if (!user?.token) return
    setLoading(true)
    const qs = new URLSearchParams({ limit: '100' })
    if (filterStatus) qs.set('status', filterStatus)
    if (presetLayer)  qs.set('layerId', presetLayer)

    try {
      const [candRes, statsRes] = await Promise.all([
        fetch(`${API}/api/duplicates?${qs}`, { headers: { Authorization: `Bearer ${user.token}` } }),
        fetch(`${API}/api/duplicates/stats`, { headers: { Authorization: `Bearer ${user.token}` } }),
      ])
      const [candData, statsData] = await Promise.all([candRes.json(), statsRes.json()])
      setCandidates(candData.candidates ?? [])
      setStats(statsData.stats ?? null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user?.token, filterStatus, presetLayer])

  useEffect(() => { load() }, [load])

  async function submitReview(id, decision) {
    setReviewLoading(true)
    try {
      await fetch(`${API}/api/duplicates/${id}/review`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision, notes: reviewNotes }),
      })
      setReviewing(null)
      setReviewNotes('')
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setReviewLoading(false)
    }
  }

  async function triggerInternalScan() {
    await fetch(`${API}/api/duplicates/scan/internal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
    })
    setTimeout(load, 4000)
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">تحليل التكرار</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">
            مطابقة البلاغات والمشاهدات الخارجية وفق نطاق مكاني وزمني وعنصر مشترك
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={triggerInternalScan}
            className="flex items-center gap-2 text-sm border border-slate-200 dark:border-gray-700 px-3 py-2 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800">
            <Search size={14} />
            مسح داخلي
          </button>
          <button onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-gray-800">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'إجمالي المرشحين', value: stats.total,     color: 'text-slate-800 dark:text-white' },
            { label: 'بانتظار المراجعة', value: stats.pending,   color: 'text-amber-600 dark:text-amber-400' },
            { label: 'مؤكّد تكرار',      value: stats.confirmed, color: 'text-red-600 dark:text-red-400' },
            { label: 'ليس تكراراً',      value: stats.rejected,  color: 'text-emerald-600 dark:text-emerald-400' },
          ].map((s, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-400 dark:text-gray-500 mb-1">{s.label}</p>
              <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-slate-400" />
        {['pending', 'confirmed_duplicate', 'rejected', ''].map(s => (
          <button key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700'
            }`}>
            {s === '' ? 'الكل' : STATUS_LABELS[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Candidates list */}
      {loading && !candidates.length ? (
        <div className="text-center py-12 text-slate-400">جارٍ التحميل…</div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-gray-500">
          <AlertTriangle size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد مرشحات لهذا الفلتر</p>
          {presetLayer && (
            <p className="text-xs mt-1">
              قم بتشغيل التحليل من{' '}
              <Link to="/observations" className="text-blue-500 hover:underline">صفحة طبقات المشاهدة</Link>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map(c => (
            <div key={c.id}
              className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              {/* Row header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[c.status]?.color}`}>
                    {STATUS_LABELS[c.status]?.label ?? c.status}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-gray-500">
                    {c.source_type === 'observation' ? 'مشاهدة ← بلاغ' : 'بلاغ ← بلاغ'}
                  </span>
                </div>
                <ConfidenceBadge value={c.confidence} />
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Source side */}
                <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 mb-2">
                    {c.source_type === 'observation' ? 'المشاهدة' : 'البلاغ المصدر'}
                  </p>
                  <p className="text-slate-700 dark:text-gray-300">
                    {c.obs_element || c.src_element || '—'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-gray-500">
                    {c.obs_location || c.src_location || '—'}
                  </p>
                  {c.obs_layer_name && (
                    <p className="text-xs text-blue-500 dark:text-blue-400">{c.obs_layer_name}</p>
                  )}
                  {c.src_source && (
                    <p className="text-xs text-slate-400 dark:text-gray-500">{c.src_source}</p>
                  )}
                </div>

                {/* Matched report */}
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 space-y-1 border border-blue-100 dark:border-blue-800/30">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">البلاغ المطابق</p>
                  <p className="text-slate-700 dark:text-gray-300">{c.match_element || '—'}</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500">{c.match_location || '—'}</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500">{c.match_source || '—'}</p>
                  <Link to={`/reports/${c.matched_report_id}`}
                    className="text-xs text-blue-500 hover:underline">
                    عرض البلاغ ←
                  </Link>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-gray-400">
                <span>مسافة: {c.distance_m != null ? `${Number(c.distance_m).toFixed(1)}م` : '—'}</span>
                <span>فرق زمني: {c.time_diff_days != null ? `${Number(c.time_diff_days).toFixed(1)} يوم` : '—'}</span>
                <span>درجة المسافة: {Math.round((c.distance_score ?? 0) * 100)}%</span>
                <span>درجة الزمن: {Math.round((c.time_score ?? 0) * 100)}%</span>
                <span>تطابق العنصر: {Math.round((c.element_score ?? 0) * 100)}%</span>
              </div>

              {/* Review actions (only for pending) */}
              {c.status === 'pending' && (
                reviewing?.id === c.id ? (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-gray-800">
                    <input
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      placeholder="ملاحظات (اختياري)"
                      className="flex-1 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300"
                    />
                    <button
                      disabled={reviewLoading}
                      onClick={() => submitReview(c.id, reviewing.decision)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                      {reviewLoading ? '…' : 'تأكيد'}
                    </button>
                    <button onClick={() => setReviewing(null)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400">
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-gray-800">
                    <button
                      onClick={() => { setReviewing({ id: c.id, decision: 'confirmed_duplicate' }); setReviewNotes('') }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30">
                      <CheckCircle2 size={12} />
                      تأكيد تكرار
                    </button>
                    <button
                      onClick={() => { setReviewing({ id: c.id, decision: 'rejected' }); setReviewNotes('') }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30">
                      <XCircle size={12} />
                      ليس تكراراً
                    </button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
