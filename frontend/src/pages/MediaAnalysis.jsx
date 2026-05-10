import { useState, useRef } from 'react'
import { Upload, ScanSearch, CheckCircle, AlertTriangle, ChevronRight, Camera, Video, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { distortionElements } from '@/data/mockData'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'

const MOCK_DETECTIONS = [
  { element: 'concrete_barriers', label: 'حواجز خراسانية', confidence: 94, box: { top: '18%', left: '12%', width: '35%', height: '28%' }, color: '#EF4444' },
  { element: 'construction_waste', label: 'مخلفات بناء', confidence: 87, box: { top: '55%', left: '40%', width: '30%', height: '22%' }, color: '#8B5CF6' },
  { element: 'temp_barriers', label: 'حواجز مؤقتة', confidence: 79, box: { top: '22%', left: '58%', width: '20%', height: '18%' }, color: '#F97316' },
]

const VIDEO_DETECTIONS = [
  { element: 'street_excavation', label: 'حفر الشوارع', confidence: 91, frames: 24, color: '#F59E0B' },
  { element: 'random_parking', label: 'مواقف عشوائية', confidence: 83, frames: 11, color: '#14B8A6' },
]

export default function MediaAnalysis() {
  const [media, setMedia] = useState(null)
  const [mediaType, setMediaType] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState(null)
  const [activeBox, setActiveBox] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()
  const navigate = useNavigate()

  const handleFile = (file) => {
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setMedia(URL.createObjectURL(file))
    setResults(null)
    setAnalyzing(true)
    setProgress(0)
    setActiveBox(null)
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(iv); return 100 }
        return p + (isVideo ? 4 : 8)
      })
    }, 180)
    setTimeout(() => {
      setAnalyzing(false)
      setProgress(100)
      setResults(isVideo ? VIDEO_DETECTIONS : MOCK_DETECTIONS)
    }, isVideo ? 4500 : 2200)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleCreateReport = (detection) => {
    navigate('/reports?new=true&element=' + detection.element)
  }

  const reset = () => {
    setMedia(null)
    setMediaType(null)
    setResults(null)
    setAnalyzing(false)
    setProgress(0)
    setActiveBox(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">تحليل المرئيات</h1>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">رصد عناصر التشوه البصري بالذكاء الاصطناعي</p>
        </div>
        {media && (
          <button onClick={reset}
            className="flex items-center gap-2 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            <X size={14} />
            تحليل جديد
          </button>
        )}
      </div>

      {/* Upload zone */}
      {!media && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`${card} rounded-2xl p-16 text-center cursor-pointer transition-all ${dragOver ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/5' : 'hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-slate-50 dark:hover:bg-gray-800/40'}`}
        >
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
            onChange={e => handleFile(e.target.files[0])} />
          <div className="flex justify-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Camera size={24} className="text-blue-500" />
            </div>
            <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
              <Video size={24} className="text-purple-500" />
            </div>
          </div>
          <p className="text-slate-700 dark:text-gray-200 font-semibold text-lg mb-1">أسقط صورة أو فيديو هنا</p>
          <p className="text-slate-400 dark:text-gray-600 text-sm">JPG · PNG · MP4 · MOV — حتى 100MB</p>
        </div>
      )}

      {/* Analyzing */}
      {analyzing && (
        <div className={`${card} rounded-2xl p-10 text-center space-y-4`}>
          <div className="relative w-20 h-20 mx-auto">
            <ScanSearch size={48} className="text-blue-500 absolute inset-0 m-auto animate-pulse" />
          </div>
          <div>
            <p className="text-slate-700 dark:text-gray-200 font-semibold mb-1">
              {mediaType === 'video' ? 'تحليل إطارات الفيديو...' : 'تحليل الصورة...'}
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-500 mb-3">
              {mediaType === 'video' ? 'يتم فحص كل إطار بحثاً عن عناصر التشوه' : 'يتم كشف عناصر التشوه البصري'}
            </p>
          </div>
          <div className="max-w-sm mx-auto bg-slate-100 dark:bg-gray-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-slate-400 dark:text-gray-600">{progress}%</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="grid grid-cols-12 gap-4">
          {/* Media preview with boxes */}
          <div className={`${card} rounded-2xl overflow-hidden ${mediaType === 'image' ? 'col-span-8' : 'col-span-12'}`}>
            {mediaType === 'image' && (
              <div className="relative">
                <img src={media} alt="" className="w-full object-cover"
                  style={{ maxHeight: '480px', objectFit: 'contain', background: '#0f172a' }}
                  onError={e => { e.target.src = 'https://placehold.co/800x480/1e293b/475569?text=صورة+تجريبية' }} />
                {MOCK_DETECTIONS.map((d, i) => (
                  <div key={i}
                    onClick={() => setActiveBox(activeBox === i ? null : i)}
                    className="absolute cursor-pointer transition-all"
                    style={{
                      top: d.box.top, left: d.box.left,
                      width: d.box.width, height: d.box.height,
                      border: `2px solid ${d.color}`,
                      borderRadius: '6px',
                      background: activeBox === i ? `${d.color}22` : 'transparent',
                    }}>
                    <span className="absolute -top-5 right-0 text-white text-xs px-1.5 py-0.5 rounded-md font-medium"
                      style={{ background: d.color, whiteSpace: 'nowrap' }}>
                      {d.label} {d.confidence}%
                    </span>
                  </div>
                ))}
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-sm">
                  {MOCK_DETECTIONS.length} عناصر مكتشفة
                </div>
              </div>
            )}
            {mediaType === 'video' && (
              <div className="relative">
                <video src={media} controls className="w-full" style={{ maxHeight: '480px', background: '#0f172a' }} />
                <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-sm">
                  تحليل {VIDEO_DETECTIONS.reduce((s, d) => s + d.frames, 0)} إطار
                </div>
              </div>
            )}
          </div>

          {/* Detection list — only for image layout */}
          {mediaType === 'image' && (
            <div className={`col-span-4 ${card} rounded-2xl p-4 space-y-3`}>
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">نتائج الكشف</p>
              {MOCK_DETECTIONS.map((d, i) => (
                <div key={i}
                  onClick={() => setActiveBox(activeBox === i ? null : i)}
                  className={`border rounded-xl p-3 cursor-pointer transition-all ${activeBox === i ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{d.label}</span>
                    <span className="mr-auto text-xs font-bold" style={{ color: d.color }}>{d.confidence}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${d.confidence}%`, background: d.color }} />
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleCreateReport(d) }}
                    className="mt-2.5 w-full text-xs py-1.5 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/40 transition-all flex items-center justify-center gap-1.5">
                    <ChevronRight size={12} />
                    إنشاء بلاغ
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video full-width results */}
          {mediaType === 'video' && (
            <div className={`col-span-12 ${card} rounded-2xl p-4`}>
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3">عناصر مكتشفة في الفيديو</p>
              <div className="grid grid-cols-2 gap-3">
                {VIDEO_DETECTIONS.map((d, i) => {
                  const el = distortionElements.find(e => e.element === d.element)
                  return (
                    <div key={i} className="border border-slate-200 dark:border-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                        <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{d.label}</span>
                        <span className="mr-auto text-xs font-bold" style={{ color: d.color }}>{d.confidence}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 dark:text-gray-500 mb-2">
                        <span>الإطارات المكتشفة</span>
                        <span className="font-medium text-slate-700 dark:text-gray-200">{d.frames} إطار</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1.5 mb-3">
                        <div className="h-1.5 rounded-full" style={{ width: `${d.confidence}%`, background: d.color }} />
                      </div>
                      <button
                        onClick={() => handleCreateReport(d)}
                        className="w-full text-xs py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-1.5">
                        <ChevronRight size={12} />
                        إنشاء بلاغ
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      {!media && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ['صور بدقة عالية', 'الحد الأدنى 720px للحصول على نتائج دقيقة'],
            ['فيديو واضح', 'تصوير مستقر بإضاءة جيدة يرفع دقة الكشف'],
            ['زوايا متعددة', 'التقط من عدة زوايا لتغطية كافة عناصر المنطقة'],
          ].map(([t, d]) => (
            <div key={t} className={`${card} rounded-xl p-4`}>
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 mb-1">{t}</p>
              <p className="text-xs text-slate-400 dark:text-gray-500">{d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
