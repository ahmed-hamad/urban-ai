import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Upload, MapPin, CheckCircle, ChevronRight, ChevronLeft, X, Building2, Globe, Locate, GitBranch, HardHat, User, AlertCircle, Ban, Gavel } from 'lucide-react'
import { regulationData } from '@/data/mockData'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'
const STEPS = ['رفع المرئيات', 'تحديد العنصر', 'اختيار المخالفات', 'الجهة المسؤولة', 'التفاصيل', 'مراجعة وإرسال']
const DISTRICTS = ['شمال الباحة', 'جنوب الباحة', 'حي الوسط', 'شرق الباحة', 'غرب الباحة', 'المنحنى', 'العقيق']
const PRIORITIES = [
  { id: 'critical', label: 'حرجة',    cls: 'border-red-400 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' },
  { id: 'high',     label: 'عالية',   cls: 'border-orange-400 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  { id: 'medium',   label: 'متوسطة', cls: 'border-amber-400 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { id: 'low',      label: 'منخفضة', cls: 'border-slate-300 bg-slate-50 dark:bg-slate-500/10 text-slate-500 dark:text-slate-400' },
]

const pinIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
})

// ─── EXIF GPS extraction ──────────────────────────────────────────────────────
async function extractExifCoords(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target.result)
        if (view.getUint16(0, false) !== 0xFFD8) { resolve(null); return }
        let offset = 2
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset, false)
          offset += 2
          if (marker === 0xFFE1) {
            const exifLen = view.getUint16(offset, false)
            offset += 2
            const exifStart = offset
            if (view.getUint32(exifStart, false) !== 0x45786966) { resolve(null); return }
            const tiffOffset = exifStart + 6
            const little = view.getUint16(tiffOffset, false) === 0x4949
            const ifdOffset = view.getUint32(tiffOffset + 4, little)
            const numEntries = view.getUint16(tiffOffset + ifdOffset, little)
            let gpsIFDOffset = null
            for (let i = 0; i < numEntries; i++) {
              const entryOffset = tiffOffset + ifdOffset + 2 + i * 12
              const tag = view.getUint16(entryOffset, little)
              if (tag === 0x8825) {
                gpsIFDOffset = view.getUint32(entryOffset + 8, little)
                break
              }
            }
            if (gpsIFDOffset === null) { resolve(null); return }
            const gpsCount = view.getUint16(tiffOffset + gpsIFDOffset, little)
            let lat = null, lng = null, latRef = 'N', lngRef = 'E'
            for (let i = 0; i < gpsCount; i++) {
              const e = tiffOffset + gpsIFDOffset + 2 + i * 12
              const tag = view.getUint16(e, little)
              if (tag === 1) latRef = String.fromCharCode(view.getUint8(e + 8))
              if (tag === 3) lngRef = String.fromCharCode(view.getUint8(e + 8))
              if (tag === 2 || tag === 4) {
                const valOffset = tiffOffset + view.getUint32(e + 8, little)
                const d = view.getUint32(valOffset, little) / view.getUint32(valOffset + 4, little)
                const m = view.getUint32(valOffset + 8, little) / view.getUint32(valOffset + 12, little)
                const s = view.getUint32(valOffset + 16, little) / view.getUint32(valOffset + 20, little)
                const deg = d + m / 60 + s / 3600
                if (tag === 2) lat = deg
                else lng = deg
              }
            }
            if (lat !== null && lng !== null) {
              resolve([
                latRef === 'S' ? -lat : lat,
                lngRef === 'W' ? -lng : lng,
              ])
            } else {
              resolve(null)
            }
            return
          }
          offset += view.getUint16(offset, false)
        }
        resolve(null)
      } catch { resolve(null) }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ─── Map location picker ──────────────────────────────────────────────────────
function ClickHandler({ onChange }) {
  useMapEvents({ click: e => onChange([e.latlng.lat, e.latlng.lng]) })
  return null
}

function LocationPicker({ coords, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-gray-500 flex items-center gap-1.5">
        <MapPin size={12} className="text-blue-500" />
        {'انقر على الخريطة لتحديد موقع البلاغ بدقة *'}
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700" style={{ height: '200px' }}>
        <MapContainer center={coords} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; CartoDB" />
          <ClickHandler onChange={onChange} />
          <Marker position={coords} icon={pinIcon} />
        </MapContainer>
      </div>
      <p className="text-xs font-mono text-slate-400 dark:text-gray-600 text-center">
        {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
      </p>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-500/20' : 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-gray-600'}`}>
              {i < step ? <CheckCircle size={16} /> : i + 1}
            </div>
            <span className={`text-xs mt-1 whitespace-nowrap ${i === step ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400 dark:text-gray-600'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-12 h-0.5 mb-4 mx-1 transition-all ${i < step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const DEFAULT_COORDS = [20.0131, 41.4677]
const coordsChanged = (c) => c[0] !== DEFAULT_COORDS[0] || c[1] !== DEFAULT_COORDS[1]

export default function ReportNew() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { addReport, users, entities, reports, contractors } = useData()
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [exifNote, setExifNote] = useState(null) // 'found' | 'not_found' | null

  const parentId = searchParams.get('parentId') || null
  const isRepeat = searchParams.get('repeat') === 'true'
  const elementFromUrl = searchParams.get('element') || ''
  const parentReport = parentId ? reports.find(r => r.id === parentId) : null

  const [form, setForm] = useState({
    media: [],
    element: elementFromUrl,
    elementConfirmed: !!elementFromUrl, // auto-confirm if pre-filled from URL
    articles: [],
    entityType: parentReport?.entityType || '',
    entity: parentReport?.entity || '',
    entityConfirmed: !!(parentReport?.entity), // auto-confirm if inherited from parent
    assignedTo: '',
    district: parentReport?.district || '',
    description: '',
    priority: 'medium',
    coords: DEFAULT_COORDS,
    source: 'manual',
    violationsApplicable: null,
    violatorType: null,
    violatorData: {
      establishmentName: '', licenseNumber: '', commercialReg: '',
      contractorId: '', contractorName: '', projectName: '', projectStartDate: '', projectEndDate: '', maintenancePeriodEnd: '', projectOwnerType: 'internal', projectEntityName: '',
      beneficiaryName: '', beneficiaryMobile: '', beneficiaryId: '',
    },
    parentId,
    isRepeat,
  })

  const [entitySuggestion, setEntitySuggestion] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedEl = regulationData.find(e => e.id === form.element)
  const fineTotal = form.articles.reduce((s, item) => {
    const a = selectedEl?.articles.find(x => x.id === item.id)
    return s + ((a?.fineAmana || 0) * item.count)
  }, 0)

  // Derive entity lists from DataContext; fall back to defaults
  const internalEntities = entities.filter(e => ['amana', 'municipality', 'agency', 'department'].includes(e.type))
  const externalEntities = entities.filter(e => e.type === 'external')
  const INTERNAL_LIST = internalEntities.length > 0
    ? internalEntities.map(e => e.name)
    : ['إدارة الرقابة الميدانية', 'إدارة التدقيق والجودة', 'بلدية شمال الباحة', 'بلدية جنوب الباحة', 'وكالة الشؤون الهندسية']
  const EXTERNAL_LIST = externalEntities.length > 0
    ? externalEntities.map(e => e.name)
    : ['شركة المياه الوطنية', 'شركة الكهرباء', 'شركة الاتصالات', 'وزارة النقل', 'أمانة منطقة الباحة']

  // Handle media upload with EXIF extraction
  const handleMediaUpload = async (files) => {
    const toBase64 = f => new Promise(res => {
      const r = new FileReader()
      r.onload = () => res({ name: f.name, url: r.result, type: f.type })
      r.readAsDataURL(f)
    })
    const mediaArr = await Promise.all(Array.from(files).map(toBase64))
    set('media', mediaArr)
    // Try EXIF from first image
    const imageFile = Array.from(files).find(f => f.type.startsWith('image/'))
    if (imageFile) {
      const coords = await extractExifCoords(imageFile)
      if (coords) {
        set('coords', coords)
        setExifNote('found')
      } else {
        setExifNote('not_found')
      }
    }
  }

  // Auto-suggest entity when element is chosen
  const handleElementSelect = (elementId) => {
    set('element', elementId)
    set('elementConfirmed', false)
    set('articles', [])
    const defaultEntity = entities.find(e => e.defaultForElement === elementId)
    if (defaultEntity) setEntitySuggestion(defaultEntity.name)
    else setEntitySuggestion(null)
  }

  const canNext = () => {
    if (step === 0) return coordsChanged(form.coords) // location is mandatory
    if (step === 1) return !!form.element && form.elementConfirmed
    if (step === 2) {
      if (form.violationsApplicable === null) return false
      if (form.violationsApplicable === false) return true
      if (form.articles.length === 0) return false
      if (!form.violatorType) return false
      const vd = form.violatorData
      if (form.violatorType === 'establishment') return !!(vd.establishmentName.trim() || vd.licenseNumber.trim())
      if (form.violatorType === 'contractor') return !!(vd.contractorId || vd.contractorName.trim()) && !!vd.projectName.trim()
      if (form.violatorType === 'beneficiary') return !!vd.beneficiaryName.trim() && !!(vd.beneficiaryMobile.trim() || vd.beneficiaryId.trim())
      return false
    }
    if (step === 3) return !!form.entityType && !!form.entity && form.entityConfirmed
    if (step === 4) return !!form.district && !!form.description
    return true
  }

  const handleSubmit = () => {
    const newReport = addReport(form, user)
    setSubmitted(true)
    setTimeout(() => navigate(parentId ? `/reports/${parentId}` : '/reports'), 2000)
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <CheckCircle size={56} className="text-emerald-500" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">{'تم إرسال البلاغ بنجاح'}</h2>
        <p className="text-slate-500 dark:text-gray-500 text-sm">{'جارٍ التحويل إلى سلة البلاغات...'}</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{'إنشاء بلاغ جديد'}</h1>
            {isRepeat && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
                <GitBranch size={10} />
                {'بلاغ متابعة'}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">
            {'الخطوة'} {step + 1} {'من'} {STEPS.length}
            {parentReport && ` · مرتبط بالبلاغ ${parentReport.id}`}
          </p>
        </div>
        <button onClick={() => navigate('/reports')} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <StepIndicator step={step} />

      {/* Step 0: Media + Location */}
      {step === 0 && (
        <div className={`${card} rounded-2xl p-6 space-y-5`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">{'رفع الصور ومقاطع الفيديو'}</h2>

          <div onClick={() => document.getElementById('new-media').click()}
            className="border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-all">
            <Upload size={32} className="mx-auto mb-3 text-slate-300 dark:text-gray-600" />
            <p className="text-slate-500 dark:text-gray-400 font-medium mb-1">{'أسقط الملفات هنا أو انقر للاختيار'}</p>
            <p className="text-xs text-slate-400 dark:text-gray-600">{'صور وفيديو — حتى 10 ملفات · سيتم استخراج GPS تلقائياً إن وُجد'}</p>
            <input id="new-media" type="file" multiple accept="image/*,video/*" className="hidden"
              onChange={e => handleMediaUpload(e.target.files)} />
          </div>

          {form.media.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.media.map((f, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-gray-700">
                  <img src={f.url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => set('media', form.media.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* EXIF note */}
          {exifNote === 'found' && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3 py-2">
              <Locate size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{'تم استخراج الموقع تلقائياً من بيانات الصورة (EXIF GPS)'}</p>
            </div>
          )}
          {exifNote === 'not_found' && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2">
              <MapPin size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">{'لا تحتوي الصورة على بيانات GPS — حدد الموقع يدوياً على الخريطة أدناه'}</p>
            </div>
          )}

          {/* Map picker */}
          <LocationPicker coords={form.coords} onChange={v => set('coords', v)} />

          {!coordsChanged(form.coords) && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center">
              {'⚠️ الموقع إلزامي — انقر على الخريطة لتحديد موقع البلاغ'}
            </p>
          )}
        </div>
      )}

      {/* Step 1: Element Selection */}
      {step === 1 && (
        <div className={`${card} rounded-2xl p-6 space-y-4`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">{'تحديد عنصر التشوه البصري'}</h2>
          
          {/* AI Suggestion */}
          {searchParams.get('element') && !form.elementConfirmed && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">{'اقتراح النظام:'}</p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                {'تم اكتشاف عنصر محتمل: '} <strong>{regulationData.find(e => e.id === searchParams.get('element'))?.name}</strong>
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { handleElementSelect(searchParams.get('element')); set('elementConfirmed', true) }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                  {'تأكيد العنصر'}
                </button>
                <button onClick={() => set('elementConfirmed', true)}
                  className="px-4 py-2 border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                  {'تعديل يدوياً'}
                </button>
              </div>
            </div>
          )}

          {/* Manual Selection */}
          {(form.elementConfirmed || !searchParams.get('element')) && (
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
              {regulationData.map(el => (
                <button key={el.id} onClick={() => { handleElementSelect(el.id); set('elementConfirmed', true) }}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${form.element === el.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: el.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-200">{el.name}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-600">{el.stage} · {el.articles.length} {'بند'}</p>
                  </div>
                  {el.maxFine > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      {'حتى'} {el.maxFine.toLocaleString('ar-SA')} {'﷼'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Violations + Violator Identification */}
      {step === 2 && selectedEl && (
        <div className={`${card} rounded-2xl p-6 space-y-5`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">المخالفات وبيانات المخالف</h2>

          {/* Applicability toggle */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-3">هل ينطبق توقيع المخالفات؟</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { set('violationsApplicable', false); set('articles', []); set('violatorType', null) }}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${form.violationsApplicable === false ? 'border-slate-500 bg-slate-50 dark:bg-slate-700/30 text-slate-700 dark:text-slate-300' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                <Ban size={20} className="flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">لا ينطبق</p>
                  <p className="text-xs opacity-70 mt-0.5">المعالجة من مهام الأمانة أو الجهة</p>
                </div>
              </button>
              <button onClick={() => set('violationsApplicable', true)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${form.violationsApplicable === true ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                <Gavel size={20} className="flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">ينطبق</p>
                  <p className="text-xs opacity-70 mt-0.5">يستوجب توقيع مخالفة أو غرامة</p>
                </div>
              </button>
            </div>
          </div>

          {/* Violations list — only when applicable */}
          {form.violationsApplicable === true && (
            <>
              <div className="border-t border-slate-100 dark:border-gray-800 pt-4">
                <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-3">بنود المخالفة</p>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {selectedEl.articles.map(a => {
                    const existing = form.articles.find(item => item.id === a.id)
                    return (
                      <div key={a.id} className="border border-slate-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">{a.text}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-gray-400">
                              <span>المرجع: {a.ref}</span>
                              <span>المهلة: {a.period}</span>
                            </div>
                          </div>
                          <div className="text-left mr-3 flex-shrink-0">
                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                              {a.fineAmana > 0 ? a.fineAmana.toLocaleString('ar-SA') + ' ﷼' : '—'}
                            </p>
                          </div>
                        </div>
                        {existing && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-600 dark:text-gray-300">العدد:</label>
                            <input type="number" min="1" value={existing.count}
                              onChange={e => set('articles', form.articles.map(item =>
                                item.id === a.id ? { ...item, count: parseInt(e.target.value) || 1 } : item
                              ))}
                              className="w-20 px-2 py-1 border border-slate-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-center" />
                            <span className="text-sm text-slate-500 dark:text-gray-400">
                              المجموع: {(a.fineAmana * existing.count).toLocaleString('ar-SA')} ﷼
                            </span>
                          </div>
                        )}
                        <button onClick={() => {
                          if (existing) {
                            set('articles', form.articles.filter(item => item.id !== a.id))
                          } else {
                            set('articles', [...form.articles, { id: a.id, count: 1 }])
                          }
                        }}
                          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${existing ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'}`}>
                          {existing ? 'إزالة المخالفة' : 'إضافة المخالفة'}
                        </button>
                      </div>
                    )
                  })}
                </div>
                {form.articles.length > 0 && (
                  <div className="mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">إجمالي الغرامات المتوقعة:</span>
                    <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                      {fineTotal.toLocaleString('ar-SA')} ﷼
                    </span>
                  </div>
                )}
              </div>

              {/* Violator identification */}
              {form.articles.length > 0 && (
                <div className="border-t border-slate-100 dark:border-gray-800 pt-4 space-y-4">
                  <p className="text-sm font-medium text-slate-700 dark:text-gray-200">تحديد المخالف</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'establishment', label: 'منشأة', sub: 'ترخيص أو سجل تجاري', Icon: Building2 },
                      { id: 'contractor',    label: 'مقاول',  sub: 'مشروع داخلي أو خارجي',  Icon: HardHat },
                      { id: 'beneficiary',   label: 'مستفيد', sub: 'هوية ومعلومات شخصية',    Icon: User },
                    ].map(({ id, label, sub, Icon }) => (
                      <button key={id} onClick={() => set('violatorType', id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${form.violatorType === id ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                        <Icon size={20} />
                        <p className="font-semibold text-xs">{label}</p>
                        <p className="text-xs opacity-60 text-center leading-tight">{sub}</p>
                      </button>
                    ))}
                  </div>

                  {/* Establishment form */}
                  {form.violatorType === 'establishment' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-gray-800/50 rounded-xl p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">بيانات المنشأة</p>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">اسم المنشأة</label>
                        <input value={form.violatorData.establishmentName}
                          onChange={e => set('violatorData', { ...form.violatorData, establishmentName: e.target.value })}
                          className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                          placeholder="اسم المنشأة التجارية" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">رقم الترخيص</label>
                          <input value={form.violatorData.licenseNumber}
                            onChange={e => set('violatorData', { ...form.violatorData, licenseNumber: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="LIC-XXXX" dir="ltr" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">السجل التجاري</label>
                          <input value={form.violatorData.commercialReg}
                            onChange={e => set('violatorData', { ...form.violatorData, commercialReg: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="CR-XXXX" dir="ltr" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Contractor form */}
                  {form.violatorType === 'contractor' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-gray-800/50 rounded-xl p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">بيانات المقاول والمشروع</p>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">اختيار من قائمة المقاولين</label>
                        <select value={form.violatorData.contractorId}
                          onChange={e => {
                            const c = contractors.find(x => x.id === e.target.value)
                            set('violatorData', { ...form.violatorData, contractorId: e.target.value, contractorName: c?.name || form.violatorData.contractorName })
                          }}
                          className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500">
                          <option value="">— اختر مقاولاً مسجلاً —</option>
                          {contractors.filter(c => c.status === 'active').map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.type === 'internal' ? 'داخلي' : 'خارجي'} — {c.entityName})</option>
                          ))}
                        </select>
                      </div>
                      {!form.violatorData.contractorId && (
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">أو أدخل اسم المقاول يدوياً</label>
                          <input value={form.violatorData.contractorName}
                            onChange={e => set('violatorData', { ...form.violatorData, contractorName: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="اسم شركة أو مؤسسة المقاولات" />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">نوع المشروع</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[['internal','مشروع داخلي (الأمانة / البلدية)'],['external','مشروع جهة خارجية']].map(([v,l]) => (
                            <button key={v} type="button" onClick={() => set('violatorData', { ...form.violatorData, projectOwnerType: v })}
                              className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${form.violatorData.projectOwnerType === v ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400'}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                      {form.violatorData.projectOwnerType === 'external' && (
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">الجهة صاحبة المشروع</label>
                          <input value={form.violatorData.projectEntityName}
                            onChange={e => set('violatorData', { ...form.violatorData, projectEntityName: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="مثال: شركة المياه الوطنية" />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">اسم المشروع *</label>
                        <input value={form.violatorData.projectName}
                          onChange={e => set('violatorData', { ...form.violatorData, projectName: e.target.value })}
                          className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          placeholder="اسم أو رقم المشروع" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">تاريخ البدء</label>
                          <input type="date" value={form.violatorData.projectStartDate}
                            onChange={e => set('violatorData', { ...form.violatorData, projectStartDate: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">تاريخ الانتهاء</label>
                          <input type="date" value={form.violatorData.projectEndDate}
                            onChange={e => set('violatorData', { ...form.violatorData, projectEndDate: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">نهاية الصيانة</label>
                          <input type="date" value={form.violatorData.maintenancePeriodEnd}
                            onChange={e => set('violatorData', { ...form.violatorData, maintenancePeriodEnd: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Beneficiary form */}
                  {form.violatorType === 'beneficiary' && (
                    <div className="space-y-3 bg-slate-50 dark:bg-gray-800/50 rounded-xl p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">بيانات المستفيد</p>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">الاسم الكامل *</label>
                        <input value={form.violatorData.beneficiaryName}
                          onChange={e => set('violatorData', { ...form.violatorData, beneficiaryName: e.target.value })}
                          className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          placeholder="الاسم الرباعي" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">رقم الجوال *</label>
                          <input value={form.violatorData.beneficiaryMobile}
                            onChange={e => set('violatorData', { ...form.violatorData, beneficiaryMobile: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="05XXXXXXXX" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">رقم الهوية</label>
                          <input value={form.violatorData.beneficiaryId}
                            onChange={e => set('violatorData', { ...form.violatorData, beneficiaryId: e.target.value })}
                            className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="1XXXXXXXXX" dir="ltr" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {form.violationsApplicable === false && (
            <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={16} className="text-slate-500 dark:text-gray-400 flex-shrink-0" />
              <p className="text-sm text-slate-600 dark:text-gray-300">
                سيُسجَّل البلاغ بدون مخالفات · المعالجة تتم من خلال مهام الجهة المسؤولة
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Entity */}
      {step === 3 && (
        <div className={`${card} rounded-2xl p-6 space-y-5`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">{'تحديد الجهة المسؤولة'}</h2>

          {/* Auto-suggestion banner */}
          {entitySuggestion && !form.entityConfirmed && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">{'اقتراح النظام:'}</p>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                {'الجهة المسؤولة المقترحة: '} <strong>{entitySuggestion}</strong>
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { 
                  set('entityType', 'internal'); 
                  set('entity', entitySuggestion); 
                  set('entityConfirmed', true);
                  setEntitySuggestion(null);
                }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                  {'تأكيد الجهة'}
                </button>
                <button onClick={() => set('entityConfirmed', true)}
                  className="px-4 py-2 border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                  {'اختيار يدوي'}
                </button>
              </div>
            </div>
          )}

          {/* Manual Selection */}
          {(form.entityConfirmed || !entitySuggestion) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'internal', label: 'جهة داخلية', sub: 'بلدية أو وكالة تابعة للأمانة', Icon: Building2, cls: 'border-blue-400 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' },
                  { id: 'external', label: 'جهة خارجية', sub: 'مياه، كهرباء، اتصالات، وزارة', Icon: Globe, cls: 'border-purple-400 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400' },
                ].map(({ id, label, sub, Icon, cls }) => (
                  <button key={id} onClick={() => { set('entityType', id); set('entity', ''); set('entityConfirmed', true) }}
                    className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${form.entityType === id ? cls : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50 text-slate-600 dark:text-gray-400'}`}>
                    <Icon size={28} />
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs opacity-70">{sub}</p>
                  </button>
                ))}
              </div>

              {form.entityType && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-gray-200 block mb-1.5">
                      {form.entityType === 'internal' ? 'الجهة الداخلية' : 'الجهة الخارجية'}
                    </label>
                    <select value={form.entity} onChange={e => { set('entity', e.target.value); set('entityConfirmed', true) }}
                      className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500">
                      <option value="">{'اختر الجهة'}</option>
                      {(form.entityType === 'internal' ? INTERNAL_LIST : EXTERNAL_LIST).map(e => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-gray-200 block mb-1.5">{'إسناد إلى مستخدم (اختياري)'}</label>
                    <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500">
                      <option value="">{'بدون إسناد'}</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.dept}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 4: Details */}
      {step === 4 && (
        <div className={`${card} rounded-2xl p-6 space-y-4`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">{'تفاصيل البلاغ'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-500 mb-1.5 block">{'الحي / المنطقة *'}</label>
              <select value={form.district} onChange={e => set('district', e.target.value)}
                className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500">
                <option value="">{'اختر المنطقة'}</option>
                {DISTRICTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-500 mb-1.5 block">{'الأولوية'}</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRIORITIES.map(p => (
                  <button key={p.id} onClick={() => set('priority', p.id)}
                    className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${form.priority === p.id ? p.cls : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-500 mb-1.5 block">{'وصف المخالفة *'}</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={4} placeholder={'اكتب وصفاً تفصيلياً للمخالفة المرصودة...'}
              className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className={`${card} rounded-2xl p-6 space-y-4`}>
          <h2 className="font-semibold text-slate-700 dark:text-gray-200">{'مراجعة البلاغ قبل الإرسال'}</h2>

          {isRepeat && parentReport && (
            <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-3 py-2.5">
              <GitBranch size={14} className="text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">{'بلاغ متابعة'}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                  {'مرتبط بالبلاغ:'} <span className="font-mono font-bold">{parentReport.id}</span>
                  {' · '}{parentReport.elementName}
                </p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {[
              ['العنصر', selectedEl?.name || '—'],
              ['المرحلة', selectedEl?.stage || '—'],
              ['البنود المخالفة', form.articles.length > 0 ? `${form.articles.length} بنود` : 'لم تُحدد'],
              ['الغرامة المتوقعة', fineTotal > 0 ? `${fineTotal.toLocaleString('ar-SA')} ﷼` : '—'],
              ['نوع الجهة', form.entityType === 'internal' ? 'داخلية' : form.entityType === 'external' ? 'خارجية' : '—'],
              ['الجهة', form.entity || '—'],
              ['الحي', form.district || '—'],
              ['الأولوية', PRIORITIES.find(p => p.id === form.priority)?.label || '—'],
              ['الموقع', `${form.coords[0].toFixed(4)}, ${form.coords[1].toFixed(4)}`],
              ['الصور', form.media.length > 0 ? `${form.media.length} ملفات` : 'لا يوجد'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm border-b border-slate-100 dark:border-gray-800 pb-2">
                <span className="text-slate-500 dark:text-gray-500">{k}</span>
                <span className="text-slate-700 dark:text-gray-200 font-medium">{v}</span>
              </div>
            ))}
          </div>
          {form.description && (
            <div className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3">
              <p className="text-xs text-slate-400 dark:text-gray-600 mb-1">{'الوصف'}</p>
              <p className="text-sm text-slate-700 dark:text-gray-200 leading-relaxed">{form.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => step === 0 ? navigate('/reports') : setStep(s => s - 1)}
          className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
          <ChevronRight size={16} />
          {step === 0 ? 'إلغاء' : 'السابق'}
        </button>

        {step < STEPS.length - 1 ? (
          <div className="flex flex-col items-end gap-1">
            {step === 0 && !coordsChanged(form.coords) && (
              <p className="text-xs text-red-500 dark:text-red-400">{'يجب تحديد الموقع على الخريطة'}</p>
            )}
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors">
              {'التالي'}
              <ChevronLeft size={16} />
            </button>
          </div>
        ) : (
          <button onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors">
            <CheckCircle size={16} />
            {'إرسال البلاغ'}
          </button>
        )}
      </div>
    </div>
  )
}
