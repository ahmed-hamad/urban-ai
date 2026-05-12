import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  Layers, Upload, FileJson, Map, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Database, Settings2, Eye, Clock, ChevronRight, X,
  Trash2, ShieldAlert, ArrowLeft,
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

const GIS_EXTENSIONS = new Set(['.geojson', '.json', '.shp', '.kml', '.gpkg', '.zip'])

const FORMAT_INFO = [
  { ext: '.geojson', label: 'GeoJSON',   ready: true  },
  { ext: '.json',    label: 'JSON',      ready: true  },
  { ext: '.shp',     label: 'Shapefile', ready: true  },
  { ext: '.kml',     label: 'KML',       ready: false },
  { ext: '.gpkg',    label: 'GeoPackage',ready: false },
]

const LAYER_TYPE_OPTIONS = [
  { value: 'reports',                     label: 'بلاغات — إنشاء مسودة تقارير' },
  { value: 'municipalities',              label: 'حدود البلديات' },
  { value: 'districts',                   label: 'أحياء' },
  { value: 'neighborhoods',               label: 'أحياء سكنية' },
  { value: 'priority_zones',              label: 'مناطق الأولوية' },
  { value: 'maintenance_contracts',       label: 'عقود الصيانة' },
  { value: 'cleaning_contracts',          label: 'عقود النظافة' },
  { value: 'service_areas',               label: 'مناطق الخدمة' },
  { value: 'assets',                      label: 'الأصول' },
  { value: 'operational_layers',          label: 'طبقات تشغيلية' },
  { value: 'external_jurisdiction_zones', label: 'مناطق الاختصاص الخارجية' },
]

const GOVERNANCE_ROLE_OPTIONS = [
  { value: 'jurisdiction', label: 'اختصاص قضائي — نطاق البلدية' },
  { value: 'contract',     label: 'عقدي — تغطية المقاول' },
  { value: 'ownership',    label: 'ملكية — أصول البلدية' },
  { value: 'priority',     label: 'أولوية — مناطق SLA مرتفع' },
  { value: 'operational',  label: 'تشغيلي — بيانات مرجعية' },
]

const OWNERSHIP_TYPE_OPTIONS = [
  { value: 'internal',   label: 'بلدية' },
  { value: 'contracted', label: 'مقاول' },
  { value: 'external',   label: 'جهة خارجية' },
  { value: 'shared',     label: 'مسؤولية مشتركة' },
]

const ENTERPRISE_FIELD_CATEGORIES = [
  {
    category: 'basic',
    label: 'الحقول الأساسية',
    fields: [
      { key: 'elementType',  label: 'نوع العنصر *' },
      { key: 'description',  label: 'الوصف *' },
      { key: 'locationName', label: 'اسم الموقع *' },
    ],
  },
  {
    category: 'geographic',
    label: 'الحقول الجغرافية والإدارية',
    fields: [
      { key: 'district',      label: 'الحي / المنطقة *' },
      { key: 'municipality',  label: 'البلدية' },
      { key: 'subdistrict',   label: 'الحي الفرعي' },
      { key: 'street',        label: 'الشارع' },
    ],
  },
  {
    category: 'identity',
    label: 'الهوية والمرجعية',
    fields: [
      { key: 'externalId',     label: 'المعرف الخارجي' },
      { key: 'sourceSystemId', label: 'معرف النظام المصدر' },
      { key: 'referenceNo',    label: 'رقم المرجع' },
    ],
  },
  {
    category: 'operational',
    label: 'المعلومات التشغيلية',
    fields: [
      { key: 'contractor', label: 'المقاول' },
      { key: 'contractId', label: 'رقم العقد' },
      { key: 'agency',     label: 'الجهة المسؤولة' },
      { key: 'assetId',    label: 'رقم الأصل' },
    ],
  },
  {
    category: 'violation',
    label: 'بيانات المخالفة',
    fields: [
      { key: 'violationType',     label: 'نوع المخالفة' },
      { key: 'violationCategory', label: 'فئة المخالفة' },
      { key: 'severity',          label: 'الخطورة' },
      { key: 'fineAmount',        label: 'مبلغ الغرامة' },
      { key: 'priorityLevel',     label: 'مستوى الأولوية' },
      { key: 'sourceStatus',      label: 'الحالة في المصدر' },
    ],
  },
  {
    category: 'dates',
    label: 'التواريخ',
    fields: [
      { key: 'observationDate', label: 'تاريخ الرصد' },
      { key: 'inspectionDate',  label: 'تاريخ المعاينة' },
      { key: 'deadlineDate',    label: 'تاريخ الاستحقاق' },
    ],
  },
  {
    category: 'additional',
    label: 'بيانات إضافية',
    fields: [
      { key: 'ownerName',     label: 'اسم المالك' },
      { key: 'ownerContact',  label: 'بيانات التواصل' },
      { key: 'inspectorName', label: 'اسم المفتش' },
      { key: 'remarks',       label: 'ملاحظات إضافية' },
    ],
  },
]

const FIELD_OPTIONS_OPERATIONAL = [
  { key: 'featureName',    label: 'اسم العنصر / المنطقة / الحي  ★' },
  { key: 'featureLabel',   label: 'الاسم الرسمي (عرض بديل)' },
  { key: 'priorityLevel',  label: 'مستوى الأولوية (رقم 1–5) ★' },
  { key: 'slaHours',       label: 'ساعات SLA ★' },
  { key: 'contractId',     label: 'رقم العقد ★' },
  { key: 'contractor',     label: 'اسم المقاول' },
  { key: 'municipality',   label: 'البلدية (نص مرجعي)' },
  { key: 'district',       label: 'الحي (نص مرجعي)' },
  { key: 'description',    label: 'الوصف / ملاحظات الطبقة' },
  { key: 'remarks',        label: 'ملاحظات إضافية' },
]

const STATUS_CFG = {
  pending:       { label: 'في الانتظار',   icon: Clock,         cls: 'text-slate-500',   bg: 'bg-slate-50 dark:bg-gray-800' },
  validating:    { label: 'جارٍ التحقق',   icon: RefreshCw,     cls: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-900/20', spin: true },
  preview_ready: { label: 'جاهز للمعاينة', icon: Eye,           cls: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-900/20' },
  importing:     { label: 'جارٍ الاستيراد',icon: RefreshCw,     cls: 'text-indigo-600',  bg: 'bg-indigo-50 dark:bg-indigo-900/20', spin: true },
  completed:     { label: 'مكتمل',          icon: CheckCircle2,  cls: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  failed:        { label: 'فشل',            icon: XCircle,       cls: 'text-red-600',     bg: 'bg-red-50 dark:bg-red-900/20' },
}

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

function uploadGISXHR(file, token, entityId, fieldMapping, sourceCrs, layerConfig, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    if (entityId) form.append('entity_id', entityId)
    if (sourceCrs) form.append('source_crs', sourceCrs)
    if (Object.keys(fieldMapping).length) form.append('field_mapping', JSON.stringify(fieldMapping))
    form.append('layer_type', layerConfig.layerType)
    if (layerConfig.layerType !== 'reports') {
      if (layerConfig.layerName)      form.append('layer_name',       layerConfig.layerName)
      if (layerConfig.governanceRole) form.append('governance_role',   layerConfig.governanceRole)
      if (layerConfig.ownershipType)  form.append('ownership_type',    layerConfig.ownershipType)
    }

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
    xhr.open('POST', `${API}/api/ingestion/gis/upload`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(form)
  })
}

// ─── Layer configuration ──────────────────────────────────────────────────────

function LayerConfig({ layerType, setLayerType, layerName, setLayerName, governanceRole, setGovernanceRole, ownershipType, setOwnershipType }) {
  const isReports = layerType === 'reports'
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 size={15} className="text-slate-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">تهيئة الطبقة</h3>
        <span className="text-xs text-slate-400 dark:text-gray-500 mr-auto">حدد نوع الطبقة وسلوك الاستيراد</span>
      </div>

      <div className="space-y-3">
        {/* Layer Type */}
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">نوع الطبقة *</label>
          <select
            value={layerType}
            onChange={e => setLayerType(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {LAYER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Import behavior hint */}
        <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
          isReports
            ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
            : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
        }`}>
          <Database size={13} className="mt-0.5 flex-shrink-0" />
          {isReports
            ? 'كل عنصر صالح سيُنشئ بلاغ مسودة قابلاً للمراجعة والتفعيل عبر دورة الحوكمة.'
            : 'سيتم تسجيل الطبقة مباشرةً في قاعدة البيانات المكانية لأغراض الحوكمة والإثراء التلقائي للبلاغات.'}
        </div>

        {/* Layer Name — required for non-reports */}
        {!isReports && (
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">
              اسم الطبقة <span className="text-red-500">*</span>
            </label>
            <input
              value={layerName}
              onChange={e => setLayerName(e.target.value)}
              placeholder="مثال: حدود البلديات 2025"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        )}

        {/* Governance Role + Ownership Type — side by side for non-reports */}
        {!isReports && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">الدور الحوكمي</label>
              <select
                value={governanceRole}
                onChange={e => setGovernanceRole(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {GOVERNANCE_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">نوع الملكية</label>
              <select
                value={ownershipType}
                onChange={e => setOwnershipType(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {OWNERSHIP_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── No-token banner ──────────────────────────────────────────────────────────

function NoTokenBanner() {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-bold text-amber-800 dark:text-amber-200">يلزم تسجيل الدخول عبر API</h3>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-300">
        صفحة استيراد GIS تتطلب JWT موثق من الخادم.
      </p>
      <code className="block text-xs bg-amber-100 dark:bg-amber-900/40 rounded-lg px-3 py-2 font-mono text-amber-900 dark:text-amber-200">
        node database/seed.js → admin@urban-ai.sa / Admin@1234
      </code>
    </div>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFile }) {
  const ref  = useRef(null)
  const [drag, setDrag] = useState(false)

  function pick(file) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!GIS_EXTENSIONS.has(ext)) return
    onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]) }}
      onClick={() => ref.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 py-10 px-4 ${
        drag
          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
          : 'border-slate-300 dark:border-gray-700 hover:border-teal-400 hover:bg-slate-50 dark:hover:bg-gray-800/40'
      }`}
    >
      <input ref={ref} type="file" hidden
        accept=".geojson,.json,.shp,.kml,.gpkg,.zip"
        onChange={e => { if (e.target.files[0]) pick(e.target.files[0]); e.target.value = '' }} />

      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${drag ? 'bg-teal-100 dark:bg-teal-800/40' : 'bg-slate-100 dark:bg-gray-800'}`}>
        <Upload size={24} className={drag ? 'text-teal-600' : 'text-slate-400 dark:text-gray-500'} />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">اسحب ملف GIS هنا أو انقر للاختيار</p>
        <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">حتى 500 MB</p>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {FORMAT_INFO.map(f => (
          <span key={f.ext} className={`text-xs px-2.5 py-1 rounded-full border font-mono ${
            f.ready
              ? 'border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-slate-200 dark:border-gray-700 text-slate-400 dark:text-gray-600'
          }`}>
            {f.ext}{!f.ready && ' (قريباً)'}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Field mapping ────────────────────────────────────────────────────────────

function FieldSelect({ fieldKey, label, sourceFields, fieldMapping, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={fieldMapping[fieldKey] ?? ''}
        onChange={e => {
          const updated = { ...fieldMapping }
          if (e.target.value) updated[fieldKey] = e.target.value
          else delete updated[fieldKey]
          onChange(updated)
        }}
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <option value="">— غير مرتبط —</option>
        {sourceFields.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
    </div>
  )
}

function FieldMapping({ sourceFields, fieldMapping, onChange, fieldCategories, fieldOptions }) {
  const [openCategories, setOpenCategories] = useState(() => new Set(['basic', 'geographic']))

  if (!sourceFields.length) return null

  function toggleCategory(cat) {
    setOpenCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const mappedCount = Object.keys(fieldMapping).filter(k => fieldMapping[k]).length

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 size={15} className="text-slate-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">تعيين الحقول</h3>
        {mappedCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
            {mappedCount} مرتبط
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-gray-500 mr-auto">اربط حقول الملف بحقول النظام</span>
      </div>

      {/* Enterprise categorized layout */}
      {fieldCategories ? (
        <div className="space-y-2">
          {fieldCategories.map(cat => {
            const isOpen = openCategories.has(cat.category)
            const catMapped = cat.fields.filter(f => fieldMapping[f.key]).length
            return (
              <div key={cat.category} className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.category)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-gray-800/60 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-right"
                >
                  <ChevronRight size={13} className={`text-slate-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200 flex-1">{cat.label}</span>
                  {catMapped > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                      {catMapped}/{cat.fields.length}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
                    {cat.fields.map(f => (
                      <FieldSelect key={f.key} fieldKey={f.key} label={f.label}
                        sourceFields={sourceFields} fieldMapping={fieldMapping} onChange={onChange} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat layout for operational layers */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(fieldOptions ?? []).map(opt => (
            <FieldSelect key={opt.key} fieldKey={opt.key} label={opt.label}
              sourceFields={sourceFields} fieldMapping={fieldMapping} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Preview panel ────────────────────────────────────────────────────────────

function Preview({ job }) {
  const preview      = job.preview_data?.features ?? []
  const detectedCrs  = job.preview_data?.detectedCrs ?? job.source_crs ?? 'EPSG:4326'
  const validCount   = job.valid_features ?? 0
  const invalidCount = job.invalid_features ?? 0
  const errors       = job.validation_errors ?? []

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Eye size={15} className="text-slate-400 dark:text-gray-500" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">معاينة ما قبل الاستيراد</h3>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي العناصر', value: job.total_features ?? 0, cls: 'text-slate-700 dark:text-slate-300' },
          { label: 'صالحة',          value: validCount,               cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'غير صالحة',      value: invalidCount,             cls: invalidCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-gray-600' },
        ].map(s => (
          <div key={s.label} className="bg-slate-50 dark:bg-gray-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* CRS */}
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
        <Map size={12} />
        نظام الإسقاط المُكتشف:
        <strong className="text-slate-700 dark:text-slate-300">{detectedCrs}</strong>
        {detectedCrs !== 'EPSG:4326' && (
          <span className="text-amber-500 flex items-center gap-1">
            <AlertTriangle size={11} /> سيتم تحويله إلى WGS84
          </span>
        )}
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 max-h-28 overflow-y-auto space-y-0.5">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">أخطاء التحقق ({errors.length})</p>
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 dark:text-red-400">
              العنصر {e.featureIndex}: {e.error}
            </p>
          ))}
        </div>
      )}

      {/* Feature sample */}
      {preview.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-slate-50 dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            عينة (أول {preview.length} عناصر)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  {['#', 'نوع الهندسة', 'نوع العنصر', 'صالح'].map(h => (
                    <th key={h} className="text-right px-3 py-2 font-medium text-slate-500 dark:text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((f, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-gray-800 last:border-0">
                    <td className="px-3 py-2 text-slate-400 tabular-nums">{f.featureIndex ?? i}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{f.geometryType ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{f.mappedElementType ?? '—'}</td>
                    <td className="px-3 py-2">
                      {f.isValidGeometry
                        ? <CheckCircle2 size={13} className="text-emerald-500" />
                        : <XCircle     size={13} className="text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Job status bar ───────────────────────────────────────────────────────────

function JobStatus({ job }) {
  const cfg  = STATUS_CFG[job.status] ?? STATUS_CFG.pending
  const Icon = cfg.icon
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-gray-800 p-4 ${cfg.bg}`}>
      <div className="w-9 h-9 rounded-xl bg-white/60 dark:bg-gray-900/60 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={`${cfg.cls} ${cfg.spin ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{job.file_name}</p>
        <p className={`text-xs font-semibold ${cfg.cls}`}>{cfg.label}</p>
      </div>
      <span className="text-xs text-slate-400 dark:text-gray-500">
        {(job.file_size_bytes / 1024 / 1024).toFixed(1)} MB
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const POLL_INTERVAL = 2000  // ms

const LAYER_TYPE_LABELS = {
  reports:                     'بلاغات',
  municipalities:              'بلديات',
  districts:                   'أحياء',
  neighborhoods:               'أحياء سكنية',
  priority_zones:              'مناطق أولوية',
  maintenance_contracts:       'عقود صيانة',
  cleaning_contracts:          'عقود نظافة',
  service_areas:               'مناطق خدمة',
  assets:                      'أصول',
  operational_layers:          'تشغيلية',
  external_jurisdiction_zones: 'اختصاص خارجي',
}

// ─── Spatial Layers Manager (admin only) ─────────────────────────────────────

function SpatialLayersManager({ token }) {
  const [layers, setLayers]       = useState([])
  const [loading, setLoading]     = useState(false)
  const [selected, setSelected]   = useState(new Set())
  const [confirm, setConfirm]     = useState(null)   // { label, ids } | null
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState(null)

  async function fetchLayers() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/ingestion/spatial-layers', token)
      setLayers(data.layers ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLayers() }, [token])  // eslint-disable-line react-hooks/exhaustive-deps

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === layers.length ? new Set() : new Set(layers.map(l => l.id)))
  }

  async function runDelete(ids) {
    setDeleting(true)
    setError(null)
    try {
      if (ids.length === 1) {
        await apiFetch(`/api/ingestion/spatial-layers/${ids[0]}`, token, { method: 'DELETE' })
      } else {
        const deleteAll = ids.length === layers.length
        await apiFetch('/api/ingestion/spatial-layers', token, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(deleteAll ? {} : { ids }),
        })
      }
      setSelected(new Set())
      setConfirm(null)
      await fetchLayers()
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const allChecked  = layers.length > 0 && selected.size === layers.length
  const someChecked = selected.size > 0 && !allChecked

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-slate-400 dark:text-gray-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-white">
            الطبقات المكانية المستوردة
          </h2>
          {!loading && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
              {layers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLayers}
            disabled={loading}
            title="تحديث"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setConfirm({
                label: `حذف ${selected.size} طبقة محددة`,
                ids: [...selected],
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors">
              <Trash2 size={12} />حذف المحدد ({selected.size})
            </button>
          )}
          {layers.length > 0 && selected.size === 0 && (
            <button
              onClick={() => setConfirm({
                label: `حذف جميع الطبقات (${layers.length})`,
                ids: layers.map(l => l.id),
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
              <Trash2 size={12} />حذف الكل
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle size={13} className="flex-shrink-0" />{error}
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-white text-sm">تأكيد الحذف</p>
                <p className="text-xs text-slate-500 dark:text-gray-500">{confirm.label}</p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                سيتم حذف الطبقة والعناصر المكانية المرتبطة بها بشكل نهائي من قاعدة البيانات. هذا الإجراء مُسجَّل في سجل التدقيق.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button
                onClick={() => runDelete(confirm.ids)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {deleting
                  ? <><RefreshCw size={13} className="animate-spin" />جارٍ الحذف…</>
                  : <><Trash2 size={13} />تأكيد الحذف</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && !layers.length ? (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-400 dark:text-gray-500">
          <RefreshCw size={14} className="animate-spin" />جارٍ التحميل…
        </div>
      ) : layers.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400 dark:text-gray-500">
          لا توجد طبقات مكانية مستوردة
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 dark:bg-gray-800/50 border-b border-slate-200 dark:border-gray-800 text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide items-center">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked }}
                onChange={toggleAll}
                className="rounded border-slate-300 dark:border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer"
              />
            </div>
            <div className="col-span-4">اسم الطبقة</div>
            <div className="col-span-3">النوع</div>
            <div className="col-span-2">العناصر</div>
            <div className="col-span-1">تاريخ الاستيراد</div>
            <div className="col-span-1 text-right">حذف</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100 dark:divide-gray-800">
            {layers.map(layer => (
              <div key={layer.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-gray-800/50 ${selected.has(layer.id) ? 'bg-red-50/50 dark:bg-red-500/5' : ''}`}>

                <input
                  type="checkbox"
                  checked={selected.has(layer.id)}
                  onChange={() => toggleOne(layer.id)}
                  className="rounded border-slate-300 dark:border-gray-600 text-red-600 focus:ring-red-500 cursor-pointer flex-shrink-0"
                />

                <div className="flex-1 min-w-0 grid md:grid-cols-12 gap-2 items-center">
                  <div className="md:col-span-4 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">
                      {layer.name || '—'}
                    </p>
                    <p className="text-xs font-mono text-slate-400 dark:text-gray-600 truncate">{layer.id}</p>
                  </div>

                  <div className="md:col-span-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/30">
                      {LAYER_TYPE_LABELS[layer.type] ?? layer.type}
                    </span>
                  </div>

                  <div className="md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-gray-200 tabular-nums">
                      {(layer.featureCount ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-gray-600 mr-1">عنصر</span>
                  </div>

                  <div className="md:col-span-1 hidden md:block">
                    <p className="text-xs text-slate-400 dark:text-gray-600">
                      {layer.createdAt ? new Date(layer.createdAt).toLocaleDateString('ar-SA') : '—'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setConfirm({ label: `حذف طبقة: ${layer.name || layer.id}`, ids: [layer.id] })}
                  title="حذف الطبقة"
                  className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GISImport() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const hasToken = !!user?.token

  // For admins with no entity_id: load entity list so they can pick a target
  const [entities, setEntities]         = useState([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const needsEntitySelect = hasToken && !user?.entityId

  useEffect(() => {
    if (!needsEntitySelect) return
    apiFetch('/api/users/entities', user.token)
      .then(d => {
        const list = d.entities ?? []
        setEntities(list)
        if (list.length > 0) setSelectedEntityId(list[0].id)
      })
      .catch(() => {})
  }, [needsEntitySelect, user?.token])  // eslint-disable-line

  // Resolved entity to use for uploads
  const effectiveEntityId = user?.entityId || selectedEntityId || null

  // Layer configuration state
  const [layerType, setLayerType]           = useState('reports')
  const [layerName, setLayerName]           = useState('')
  const [governanceRole, setGovernanceRole] = useState('operational')
  const [ownershipType, setOwnershipType]   = useState('internal')

  // Step state
  const [file, setFile]                = useState(null)
  const [sourceCrs, setSourceCrs]      = useState('')
  const [fieldMapping, setFieldMapping]= useState({})

  // Upload / job state
  const [uploadPct, setUploadPct]   = useState(0)
  const [uploading, setUploading]   = useState(false)
  const [job, setJob]               = useState(null)
  const [polling, setPolling]       = useState(false)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError]           = useState(null)
  const [importMode, setImportMode]   = useState('all')
  const [importLimit, setImportLimit] = useState('')
  const [importOffset, setImportOffset] = useState('')
  const [remapping, setRemapping]     = useState(false)
  const [remapMsg, setRemapMsg]       = useState(null)

  const pollRef = useRef(null)

  // Source fields extracted from preview
  const sourceFields = (() => {
    const feats = job?.preview_data?.features ?? []
    if (!feats.length) return []
    return Object.keys(feats[0].sourceAttributes ?? feats[0].source_attributes ?? {})
  })()

  // ── Polling ───────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setPolling(false)
  }, [])

  const startPolling = useCallback((jobId) => {
    setPolling(true)
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/ingestion/gis/jobs/${jobId}`, user.token)
        setJob(data.job)
        const done = ['preview_ready', 'completed', 'failed', 'cancelled']
        if (done.includes(data.job?.status)) stopPolling()
      } catch (e) {
        stopPolling()
        setError(e.message)
      }
    }, POLL_INTERVAL)
  }, [user?.token, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  // ── File selection ─────────────────────────────────────────────────────────

  function selectFile(f) {
    setFile(f)
    setJob(null)
    setImportResult(null)
    setError(null)
    setFieldMapping({})
    setUploadPct(0)
    stopPolling()
  }

  function reset() {
    stopPolling()
    setFile(null); setJob(null); setImportResult(null); setError(null)
    setFieldMapping({}); setSourceCrs(''); setUploadPct(0)
    setImportMode('all'); setImportLimit(''); setImportOffset('')
    setLayerType('reports'); setLayerName(''); setGovernanceRole('operational'); setOwnershipType('internal')
    setRemapping(false); setRemapMsg(null)
  }

  // ── Re-apply mapping ─────────────────────────────────────────────────────
  async function handleRemap() {
    if (!job || remapping) return
    setRemapping(true)
    setRemapMsg(null)
    setError(null)
    try {
      const res = await apiFetch(`/api/ingestion/gis/jobs/${job.id}/remap`, user.token, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fieldMapping }),
      })
      setRemapMsg(res.message ?? `تم تحديث ${res.updated} عنصر`)
      // Refresh job to show updated preview
      const updated = await apiFetch(`/api/ingestion/gis/jobs/${job.id}`, user.token)
      setJob(updated.job)
    } catch (e) {
      setError(e.message)
    } finally {
      setRemapping(false)
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file || uploading) return
    if (!effectiveEntityId) {
      setError('يرجى تحديد الجهة المستهدفة للاستيراد')
      return
    }
    if (layerType !== 'reports' && !layerName.trim()) {
      setError('اسم الطبقة مطلوب للطبقات المكانية غير البلاغات')
      return
    }
    setUploading(true)
    setError(null)
    setUploadPct(0)
    try {
      const res = await uploadGISXHR(
        file, user.token, effectiveEntityId,
        fieldMapping, sourceCrs || null,
        { layerType, layerName: layerName.trim(), governanceRole, ownershipType },
        setUploadPct,
      )
      // Immediately fetch job state
      const jobData = await apiFetch(`/api/ingestion/gis/jobs/${res.jobId}`, user.token)
      setJob(jobData.job)
      const done = ['preview_ready', 'completed', 'failed']
      if (!done.includes(jobData.job?.status)) startPolling(res.jobId)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!job || importing) return
    const isAll = importMode === 'all'
    const lim   = Number(importLimit)
    if (!isAll && (!lim || lim < 1)) { setError('أدخل عدداً صحيحاً أكبر من صفر'); return }
    setImporting(true)
    setError(null)
    try {
      const body = isAll
        ? { importAll: true }
        : { importAll: false, importLimit: lim, importOffset: Math.max(0, Number(importOffset) || 0) }
      const res = await apiFetch(`/api/ingestion/gis/jobs/${job.id}/import`, user.token, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      setImportResult(res)
      // Refresh job to show completed state
      const updated = await apiFetch(`/api/ingestion/gis/jobs/${job.id}`, user.token)
      setJob(updated.job)
    } catch (e) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const isPreviewReady = job?.status === 'preview_ready'
  const isCompleted    = job?.status === 'completed'
  const isFailed       = job?.status === 'failed'

  return (
    <div className="p-6 space-y-6 max-w-3xl" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
          <Layers size={20} className="text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">استيراد بيانات GIS</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400">Shapefile · GeoJSON → عناصر مكانية → بلاغات / طبقات حوكمة</p>
        </div>
        {(file || job) && (
          <button onClick={reset} className="mr-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X size={12} /> بدء من جديد
          </button>
        )}
      </div>

      {/* No-token banner */}
      {!hasToken && <NoTokenBanner />}

      {hasToken && (
        <>
          {/* Architecture note */}
          <div className="flex items-start gap-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-500/30 rounded-xl px-4 py-3">
            <Database size={14} className="text-teal-500 dark:text-teal-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-teal-700 dark:text-teal-300">
              الهندسات المستوردة تُخزَّن في PostGIS. البلاغات تُنشئ مسودات خاضعة للحوكمة. الطبقات التشغيلية تُسجَّل للإثراء المكاني التلقائي.
            </p>
          </div>

          {/* ── STEP 1: File selection ──────────────────────────────────────── */}
          {!job && (
            <div className="space-y-4">
              <DropZone onFile={selectFile} />

              {file && (
                <>
                  {/* Selected file info */}
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                    <FileJson size={18} className="text-teal-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-400 dark:text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button onClick={reset} className="text-slate-300 dark:text-gray-600 hover:text-red-400 transition-colors">
                      <X size={15} />
                    </button>
                  </div>

                  {/* Entity selector — shown only for admins without a fixed entity */}
                  {needsEntitySelect && (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-4 space-y-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-white">
                        الجهة المستهدفة <span className="text-red-500">*</span>
                        <span className="text-slate-400 dark:text-gray-500 font-normal mr-1">(مدير النظام — حدد الجهة التي سيُضاف إليها الاستيراد)</span>
                      </label>
                      {entities.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-gray-500">جارٍ تحميل الجهات…</p>
                      ) : (
                        <select
                          value={selectedEntityId}
                          onChange={e => setSelectedEntityId(e.target.value)}
                          className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                          {entities.map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Layer configuration */}
                  <LayerConfig
                    layerType={layerType}         setLayerType={setLayerType}
                    layerName={layerName}         setLayerName={setLayerName}
                    governanceRole={governanceRole} setGovernanceRole={setGovernanceRole}
                    ownershipType={ownershipType}  setOwnershipType={setOwnershipType}
                  />

                  {/* Optional CRS */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      نظام الإسقاط المصدر <span className="text-slate-400 font-normal">(اختياري — يُكتشف تلقائياً)</span>
                    </label>
                    <input value={sourceCrs} onChange={e => setSourceCrs(e.target.value)}
                      placeholder="مثال: EPSG:2318"
                      className="w-full text-sm rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-800 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                      <AlertTriangle size={14} className="flex-shrink-0" /> {error}
                    </div>
                  )}

                  {/* Upload button */}
                  <div className="space-y-2">
                    {uploading && uploadPct > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 dark:text-gray-400 mb-1">
                          <span>جارٍ الرفع…</span><span>{uploadPct}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                        </div>
                      </div>
                    )}
                    <button onClick={handleUpload} disabled={uploading}
                      className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                      {uploading
                        ? <><RefreshCw size={15} className="animate-spin" /> جارٍ الرفع والتحقق…</>
                        : <><Upload size={15} /> رفع وبدء التحقق</>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STEP 2: Job progress + preview ─────────────────────────────── */}
          {job && (
            <div className="space-y-4">
              <JobStatus job={job} />

              {/* Polling indicator */}
              {polling && (
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-gray-500">
                  <RefreshCw size={11} className="animate-spin" />
                  التحقق جارٍ في الخلفية — يتحدث تلقائياً…
                </div>
              )}

              {/* Processing error */}
              {isFailed && job.processing_error && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{job.processing_error}</span>
                </div>
              )}

              {/* Field mapping (once preview is ready) */}
              {isPreviewReady && sourceFields.length > 0 && (
                <>
                  <FieldMapping
                    sourceFields={sourceFields}
                    fieldMapping={fieldMapping}
                    onChange={setFieldMapping}
                    fieldCategories={job?.layer_type === 'reports' ? ENTERPRISE_FIELD_CATEGORIES : null}
                    fieldOptions={job?.layer_type !== 'reports' ? FIELD_OPTIONS_OPERATIONAL : null}
                  />

                  {/* Apply mapping button */}
                  <div className="space-y-2">
                    {remapMsg && (
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 size={13} className="flex-shrink-0" />
                        {remapMsg}
                      </div>
                    )}
                    <button
                      onClick={handleRemap}
                      disabled={remapping || Object.keys(fieldMapping).length === 0}
                      className="w-full flex items-center justify-center gap-2 border border-teal-400 dark:border-teal-500 text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40"
                    >
                      {remapping
                        ? <><RefreshCw size={14} className="animate-spin" /> جارٍ تطبيق التعيين…</>
                        : <><Settings2 size={14} /> تطبيق التعيين الجديد على العناصر</>}
                    </button>
                    <p className="text-xs text-center text-slate-400 dark:text-gray-600">
                      يُعيد حساب حقول العناصر المحققة دون إعادة رفع الملف
                    </p>
                  </div>
                </>
              )}

              {/* Preview */}
              {(isPreviewReady || isCompleted) && <Preview job={job} />}

              {/* Operational layer — auto-completed during validation */}
              {isCompleted && !importResult && job?.layer_type !== 'reports' && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-200">الطبقة المكانية سُجِّلت بنجاح</h3>
                  </div>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    تم استيراد <strong>{(job.imported_features ?? 0).toLocaleString()}</strong> عنصر مكاني إلى قاعدة البيانات.
                    ستُستخدم هذه الطبقة لإثراء البلاغات مكانياً وتحديد الاختصاص والحوكمة تلقائياً.
                  </p>
                  {job.layer_type && (
                    <p className="text-xs text-indigo-500 dark:text-indigo-400">
                      النوع: {LAYER_TYPE_OPTIONS.find(o => o.value === job.layer_type)?.label ?? job.layer_type}
                    </p>
                  )}
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-200">اكتمل الاستيراد</h3>
                  </div>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">{importResult.message}</p>
                  {importResult.errorCount > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      تعذّر استيراد {importResult.errorCount} عنصر(ات).
                    </p>
                  )}
                </div>
              )}

              {/* Governance gate — report layers go through GIS Intake Queue, not direct bulk import */}
              {isPreviewReady && !importResult && job?.layer_type === 'reports' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-500/30 rounded-2xl p-4">
                    <Database size={16} className="text-teal-500 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                        {(job.valid_features ?? 0).toLocaleString()} عنصر بانتظار المراجعة في قائمة استيراد GIS
                      </p>
                      <p className="text-xs text-teal-700 dark:text-teal-300">
                        تقتضي حوكمة المنصة مراجعة كل عنصر GIS بشكل فردي قبل إنشاء البلاغ المقابل.
                        يمكنك تأكيد العناصر بشكل فردي أو جماعي عبر قائمة المراجعة.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/gis-intake?job=${job.id}`)}
                    className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors">
                    <ArrowLeft size={15} />
                    انتقل إلى قائمة مراجعة عناصر GIS ({(job.valid_features ?? 0).toLocaleString()} عنصر)
                  </button>
                  <p className="text-xs text-center text-slate-400 dark:text-gray-500">
                    العناصر غير الصالحة ({job.invalid_features ?? 0}) مستبعدة تلقائياً.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Spatial Layers Manager (admin only) ─────────────────────────────── */}
      {hasToken && user?.role === 'admin' && (
        <>
          <div className="border-t border-slate-200 dark:border-gray-800 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert size={14} className="text-red-500 dark:text-red-400 flex-shrink-0" />
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                إدارة الطبقات — صلاحية المدير فقط
              </p>
            </div>
            <SpatialLayersManager token={user.token} />
          </div>
        </>
      )}
    </div>
  )
}
