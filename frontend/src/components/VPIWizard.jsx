// VPI Import Wizard — 4-step guided import
// Step 1: Select file + dataset type
// Step 2: Column mapping (auto-suggested + manual correction)
// Step 3: Month discovery + conflict handling
// Step 4: Import execution + results

import { useState, useRef, useCallback } from 'react'
import {
  Upload, ChevronRight, ChevronLeft, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, FileText, Layers, Search,
  BookTemplate, Save, Trash2, Info, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

// ─── Field definitions ────────────────────────────────────────────────────────

const OBS_FIELDS = [
  { key: 'month',              label: 'حقل الشهر',             required: true,  hint: 'قيم مثل: 1–12 أو يناير أو January' },
  { key: 'year',               label: 'حقل السنة',             required: false, hint: 'قيم مثل: 2026، 2025. يمكن ضبطها يدوياً إن لم توجد.' },
  { key: 'municipality_name',  label: 'اسم البلدية',           required: true,  hint: 'اسم البلدية أو المنطقة الإدارية' },
  { key: 'priority_zone_name', label: 'منطقة الأولوية',       required: false, hint: 'اختياري — اسم منطقة الأولوية' },
  { key: 'element_name',       label: 'عنصر التشوه البصري',   required: true,  hint: 'نوع المخالفة أو العنصر' },
  { key: 'units_count',        label: 'عدد الوحدات',           required: true,  hint: 'قيمة رقمية' },
  { key: 'cluster_id',         label: 'ClusterId (معرف المجموعة)', required: false, hint: 'مفتاح ربط GIS المستقبلي — احتفظ به دائماً' },
]

const COV_FIELDS = [
  { key: 'month',              label: 'حقل الشهر',             required: true,  hint: 'قيم مثل: 1–12 أو يناير' },
  { key: 'year',               label: 'حقل السنة',             required: false, hint: 'يمكن ضبطها يدوياً' },
  { key: 'municipality_name',  label: 'اسم البلدية',           required: true,  hint: '' },
  { key: 'priority_zone_name', label: 'منطقة الأولوية',       required: false, hint: 'اختياري' },
  { key: 'zone_area_km2',      label: 'مساحة المنطقة (كم²)',  required: false, hint: 'بيانات مرجعية — تُستخدم لنسبة التغطية' },
  { key: 'covered_area_km2',   label: 'المساحة المغطاة (كم²)', required: true,  hint: 'الحقل الرسمي لحساب VPI — "المساحة (كم2)"' },
  { key: 'coverage_rate',      label: 'نسبة التغطية (%)',      required: false, hint: 'اختياري — يُحسب آلياً إن لم يوجد' },
]

function confBadge(conf) {
  if (!conf) return null
  const cfg = {
    high:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    low:    'bg-red-100 dark:bg-red-900/30 text-red-500',
  }
  const lbl = { high: 'ثقة عالية', medium: 'ثقة متوسطة', low: 'ثقة منخفضة' }
  return <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg[conf] || cfg.low}`}>{lbl[conf] || conf}</span>
}

function FieldSelect({ columns, value, onChange, placeholder = 'اختر عمود...' }) {
  return (
    <div className="relative">
      <select value={value || ''} onChange={e => onChange(e.target.value || null)}
        className="w-full appearance-none bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
        <option value="">{placeholder}</option>
        {columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function VPIWizard({ onComplete }) {
  const { user } = useAuth()
  const fileRef  = useRef()

  const [step,        setStep]        = useState(1)
  const [dataType,    setDataType]    = useState('observations')  // 'observations' | 'coverage'
  const [file,        setFile]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  // Step 2 state
  const [inspection,  setInspection]  = useState(null)     // { columns, columnSamples, sampleRows, totalRows }
  const [mapping,     setMapping]     = useState({})       // { field → column }
  const [confidence,  setConfidence]  = useState({})
  const [templates,   setTemplates]   = useState([])
  const [defaultYear, setDefaultYear] = useState(new Date().getFullYear())
  const [templateName, setTemplateName] = useState('')
  const [savingTmpl,  setSavingTmpl]  = useState(false)
  const [tmplSaved,   setTmplSaved]   = useState(false)

  // Step 3 state
  const [discovered,      setDiscovered]      = useState([])    // [{ month, rowCount, unitSum, obsExists, covExists }]
  const [existingAction,  setExistingAction]  = useState('skip')
  const [discoverStats,   setDiscoverStats]   = useState(null)

  // Step 4 state
  const [importResults, setImportResults] = useState([])
  const [importSummary, setImportSummary] = useState(null)

  const fields = dataType === 'observations' ? OBS_FIELDS : COV_FIELDS

  // ── Step 1 → 2: inspect file ──────────────────────────────────────────────

  async function handleFileSelect(f) {
    if (!f) return
    setFile(f)
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      form.append('dataset_type', dataType)

      const res  = await fetch(`${API}/api/vpi/wizard/inspect`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل التحليل')

      setInspection(json.inspection)
      setMapping(json.suggestedMapping || {})
      setConfidence(json.confidence || {})
      setTemplates(json.templates || [])
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2 → 3: discover months ───────────────────────────────────────────

  async function handleDiscover() {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mapping', JSON.stringify(mapping))
      if (defaultYear) form.append('default_year', String(defaultYear))

      const res  = await fetch(`${API}/api/vpi/wizard/discover`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل اكتشاف الأشهر')

      if (!json.months?.length) throw new Error('لم يُكتشف أي شهر. تحقق من ضبط حقول الشهر والسنة.')

      setDiscovered(json.months)
      setDiscoverStats({ total: json.totalRows, skipped: json.skippedRows })
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3 → 4: execute import ────────────────────────────────────────────

  async function handleImport() {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mapping', JSON.stringify(mapping))
      form.append('dataset_type', dataType)
      form.append('existing_action', existingAction)
      if (defaultYear) form.append('default_year', String(defaultYear))

      const res  = await fetch(`${API}/api/vpi/wizard/import`, {
        method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'فشل الاستيراد')

      setImportResults(json.results || [])
      setImportSummary(json.summary)
      setStep(4)
      if (json.summary?.kpiCalculated) onComplete?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Save mapping template ─────────────────────────────────────────────────

  async function saveTemplate() {
    if (!templateName.trim()) return
    setSavingTmpl(true)
    try {
      const res = await fetch(`${API}/api/vpi/wizard/templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, dataset_type: dataType, mapping }),
      })
      if (res.ok) { setTmplSaved(true); setTemplateName('') }
    } finally { setSavingTmpl(false) }
  }

  function applyTemplate(tmpl) {
    setMapping(typeof tmpl.mapping === 'string' ? JSON.parse(tmpl.mapping) : tmpl.mapping)
    setConfidence({})
  }

  function reset() {
    setStep(1); setFile(null); setMapping({}); setConfidence({})
    setDiscovered([]); setImportResults([]); setImportSummary(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const hasConflicts = discovered.some(m => (dataType === 'observations' ? m.obsExists : m.covExists))
  const importableMonths = existingAction === 'skip'
    ? discovered.filter(m => !(dataType === 'observations' ? m.obsExists : m.covExists))
    : discovered

  // ─── Step 1: File Selection ───────────────────────────────────────────────

  if (step === 1) return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-800 dark:text-white mb-1">اختر نوع البيانات</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { type: 'observations', label: 'بيانات الرصد', desc: 'المخالفات · العناصر · الوحدات · ClusterId', Icon: FileText },
            { type: 'coverage',     label: 'بيانات التغطية', desc: 'المساحات · نسب التغطية', Icon: Layers },
          ].map(({ type, label, desc, Icon }) => (
            <button key={type} onClick={() => setDataType(type)}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-right transition-all ${
                dataType === type
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-gray-700 hover:border-blue-300'
              }`}>
              <Icon size={18} className={dataType === type ? 'text-blue-600 dark:text-blue-400 mt-0.5' : 'text-slate-400 mt-0.5'} />
              <div>
                <p className={`text-sm font-semibold ${dataType === type ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-gray-200'}`}>{label}</p>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 dark:text-white mb-2">ارفع ملف Excel</h3>
        <label className={`block w-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          loading ? 'opacity-60 cursor-wait' : 'border-slate-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
        }`}>
          {loading
            ? <RefreshCw size={28} className="mx-auto mb-2 text-blue-500 animate-spin" />
            : <Upload size={28} className="mx-auto mb-2 text-slate-400" />
          }
          <p className="text-sm font-medium text-slate-600 dark:text-gray-300">
            {loading ? 'جاري تحليل الملف...' : 'اسحب ملف Excel هنا أو انقر للاختيار'}
          </p>
          <p className="text-xs text-slate-400 mt-1">.xlsx أو .xls</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => handleFileSelect(e.target.files[0] || null)} />
        </label>
      </div>

      {error && <ErrBox msg={error} />}
    </div>
  )

  // ─── Step 2: Column Mapping ───────────────────────────────────────────────

  if (step === 2) return (
    <div className="space-y-5">
      <StepHeader step={2} total={4} title={`ضبط حقول البيانات — ${file?.name}`}
        subtitle={`${inspection?.totalRows?.toLocaleString('en-US')} صف مكتشف · ${inspection?.columns?.length} عمود`} />

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1.5">
            <BookTemplate size={14} /> قوالب محفوظة
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t)}
                className="text-xs bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Field mapping table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800 grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase">
          <span>الحقل</span><span>الحقل في الملف</span><span>الثقة</span><span>قيم نموذجية</span>
        </div>
        {fields.map(f => {
          const samples = mapping[f.key] ? (inspection?.columnSamples?.[mapping[f.key]] || []) : []
          return (
            <div key={f.key} className="grid grid-cols-[1fr_1.4fr_0.8fr_1fr] gap-3 items-center px-4 py-3 border-t border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/40">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{f.label}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {f.required && <span className="text-xs text-red-500 font-medium">مطلوب</span>}
                  {f.hint && <span className="text-xs text-slate-400 dark:text-gray-600 truncate">{f.hint}</span>}
                </div>
              </div>
              <FieldSelect columns={inspection?.columns || []} value={mapping[f.key]}
                onChange={v => setMapping(m => ({ ...m, [f.key]: v }))}
                placeholder={f.required ? 'اختر عمود...' : 'اختياري'} />
              <div>{confBadge(confidence[f.key])}</div>
              <div className="flex flex-wrap gap-1">
                {samples.slice(0, 3).map((s, i) => (
                  <span key={i} className="text-xs bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 px-1.5 py-0.5 rounded truncate max-w-[80px]">{String(s)}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Year override (if year field not mapped) */}
      {!mapping.year && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
            <AlertTriangle size={14} /> حقل السنة غير محدد
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">جميع السجلات ستُسند لهذه السنة:</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-gray-400">السنة الافتراضية:</span>
            <input type="number" min="2020" max="2035" value={defaultYear}
              onChange={e => setDefaultYear(parseInt(e.target.value))}
              className="w-24 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>
      )}

      {/* Sample data preview */}
      {inspection?.sampleRows?.length > 0 && (
        <details className="bg-slate-50 dark:bg-gray-800/50 rounded-xl border border-slate-200 dark:border-gray-700">
          <summary className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-gray-300 cursor-pointer flex items-center gap-2">
            <Search size={14} /> عرض أول 5 صفوف من الملف
          </summary>
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="text-xs w-full">
              <thead><tr>{inspection.columns.map(c => <th key={c} className="px-2 py-1.5 text-right text-slate-400 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
                {inspection.sampleRows.map((row, i) => (
                  <tr key={i}>{inspection.columns.map(c => <td key={c} className="px-2 py-1.5 text-slate-600 dark:text-gray-300 whitespace-nowrap">{String(row[c] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Save template */}
      <div className="flex items-center gap-2">
        <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
          placeholder="احفظ هذا الضبط كقالب..."
          className="flex-1 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={saveTemplate} disabled={!templateName.trim() || savingTmpl}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-300 text-sm font-medium disabled:opacity-40 transition-colors">
          <Save size={13} />{tmplSaved ? '✓ محفوظ' : 'حفظ قالب'}
        </button>
      </div>

      {error && <ErrBox msg={error} />}

      <WizardNav
        onBack={() => { setStep(1); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
        onNext={handleDiscover}
        nextLabel="اكتشاف الأشهر →"
        nextDisabled={loading || fields.filter(f => f.required).some(f => !mapping[f.key])}
        loading={loading}
      />
    </div>
  )

  // ─── Step 3: Month Discovery ──────────────────────────────────────────────

  if (step === 3) return (
    <div className="space-y-5">
      <StepHeader step={3} total={4} title="الأشهر المكتشفة"
        subtitle={`${discovered.length} شهر · ${discoverStats?.total?.toLocaleString('en-US')} صف إجمالي${discoverStats?.skipped ? ` · ${discoverStats.skipped} صف مُهمل (شهر/سنة مفقود)` : ''}`} />

      {/* Months table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800 grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 text-xs font-semibold text-slate-500 dark:text-gray-500 uppercase">
          <span>#</span><span>الشهر</span><span>البلاغات</span><span>الوحدات</span><span>الحالة</span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
          {discovered.map((m, i) => {
            const exists = dataType === 'observations' ? m.obsExists : m.covExists
            return (
              <div key={m.month} className={`grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-2.5 ${exists ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                <span className="text-xs text-slate-400">{i + 1}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-white">{m.month}</span>
                <span className="text-sm tabular-nums text-slate-600 dark:text-gray-300">{m.rowCount.toLocaleString('en-US')}</span>
                <span className="text-sm tabular-nums text-slate-600 dark:text-gray-300">{m.unitSum.toLocaleString('en-US')}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  exists
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                }`}>{exists ? 'موجود' : 'جديد'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الأشهر', value: discovered.length },
          { label: 'إجمالي البلاغات', value: discovered.reduce((s, m) => s + m.rowCount, 0).toLocaleString('en-US') },
          { label: 'إجمالي الوحدات', value: discovered.reduce((s, m) => s + m.unitSum, 0).toLocaleString('en-US') },
        ].map(({ label, value }) => (
          <div key={label} className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-0.5">{label}</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{value}</p>
          </div>
        ))}
      </div>

      {/* Conflict handling */}
      {hasConflicts && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle size={14} /> {discovered.filter(m => dataType === 'observations' ? m.obsExists : m.covExists).length} أشهر موجودة مسبقاً
          </p>
          <div className="space-y-2">
            {[
              { val: 'skip',    label: 'تجاهل الأشهر الموجودة',  desc: `سيتم استيراد ${importableMonths.length} شهر جديد فقط` },
              { val: 'replace', label: 'استبدال الأشهر الموجودة', desc: 'سيتم حذف البيانات القديمة واستبدالها' },
            ].map(opt => (
              <label key={opt.val} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                existingAction === opt.val
                  ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/30'
                  : 'border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/10'
              }`}>
                <input type="radio" value={opt.val} checked={existingAction === opt.val}
                  onChange={() => setExistingAction(opt.val)} className="mt-0.5 accent-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{opt.label}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <ErrBox msg={error} />}

      <WizardNav
        onBack={() => setStep(2)}
        onNext={handleImport}
        nextLabel={`استيراد ${importableMonths.length} شهر →`}
        loading={loading}
      />
    </div>
  )

  // ─── Step 4: Results ──────────────────────────────────────────────────────

  if (step === 4) return (
    <div className="space-y-5">
      <StepHeader step={4} total={4} title="نتيجة الاستيراد" subtitle="" />

      {importSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'مستورد', value: importSummary.imported, color: 'emerald' },
            { label: 'مُهمل',  value: importSummary.skipped,  color: 'amber' },
            { label: 'فشل',   value: importSummary.failed,   color: 'red' },
            { label: 'KPI محسوب', value: importSummary.kpiCalculated ? '✓' : '—', color: 'blue' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-4 text-center bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-800`}>
              <p className={`text-xs font-medium text-${color}-500 mb-1`}>{label}</p>
              <p className={`text-2xl font-bold text-${color}-700 dark:text-${color}-300`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800 grid grid-cols-[1fr_auto_auto_1fr] gap-3 text-xs font-semibold text-slate-500 uppercase">
          <span>الشهر</span><span>الصفوف</span><span>KPI</span><span>الحالة</span>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
          {importResults.map(r => (
            <div key={r.month} className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 items-center px-4 py-2.5">
              <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-white">{r.month}</span>
              <span className="text-sm tabular-nums text-slate-500">{r.rowCount || '—'}</span>
              <span className="text-sm">
                {r.kpiCalculated ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-xs text-slate-400">—</span>}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${
                r.status === 'imported' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                r.status === 'skipped'  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                                          'bg-red-100 dark:bg-red-900/30 text-red-500'
              }`}>
                {r.status === 'imported' ? 'مستورد' : r.status === 'skipped' ? 'مُهمل' : `فشل: ${r.error || ''}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!importSummary?.kpiCalculated && importSummary?.imported > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
          <Info size={15} className="flex-shrink-0 mt-0.5" />
          لم يُحسب VPI لأن الملف المكمّل غير مرفوع بعد.
          {dataType === 'observations' ? ' ارفع بيانات التغطية لنفس الأشهر لإكمال حساب المؤشرات.' : ' ارفع بيانات الرصد لنفس الأشهر لإكمال حساب المؤشرات.'}
        </div>
      )}

      <button onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
        <Upload size={14} /> استيراد ملف جديد
      </button>
    </div>
  )

  return null
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StepHeader({ step, total, title, subtitle }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {[...Array(total)].map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < step ? 'bg-blue-500' : 'bg-slate-200 dark:bg-gray-700'}`} />
        ))}
      </div>
      <p className="text-xs text-slate-400 dark:text-gray-600 font-medium">خطوة {step} من {total}</p>
      <h3 className="text-base font-bold text-slate-800 dark:text-white mt-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function WizardNav({ onBack, onNext, nextLabel = 'التالي →', nextDisabled = false, loading = false }) {
  return (
    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-gray-800">
      <button onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 text-sm font-medium transition-colors">
        <ChevronLeft size={14} /> رجوع
      </button>
      <button onClick={onNext} disabled={nextDisabled || loading}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors">
        {loading ? <RefreshCw size={14} className="animate-spin" /> : <ChevronRight size={14} />}
        {loading ? 'جاري المعالجة...' : nextLabel}
      </button>
    </div>
  )
}

function ErrBox({ msg }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
      <XCircle size={15} className="flex-shrink-0 mt-0.5" />
      {msg}
    </div>
  )
}
