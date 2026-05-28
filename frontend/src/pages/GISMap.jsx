import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, GeoJSON, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import { Filter, Layers, Download, X, ChevronDown, ChevronUp, Database, Bot } from 'lucide-react'
import { statusConfig, regulationData } from '@/data/mockData'
import { useData } from '@/context/DataContext'
import { useApiReports, useApiSpatialLayers, normalizeApiReport } from '@/hooks/useApiReports'
import { useMapContext } from '@/context/MapContext'

const createIcon = (color) => L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.35);"></div>`,
  className: '', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10],
})

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'

const LAYER_TYPE_COLORS = {
  municipalities:              '#3B82F6',
  districts:                   '#8B5CF6',
  neighborhoods:               '#06B6D4',
  priority_zones:              '#EF4444',
  maintenance_contracts:       '#F59E0B',
  cleaning_contracts:          '#10B981',
  service_areas:               '#14B8A6',
  assets:                      '#F97316',
  operational_layers:          '#6366F1',
  external_jurisdiction_zones: '#EC4899',
}

function dynamicLayerColor(type) {
  return LAYER_TYPE_COLORS[type] ?? '#64748B'
}

function dynamicLayerStyle(type) {
  const color = dynamicLayerColor(type)
  const isDashed = type.includes('contract') || type === 'service_areas'
  return {
    color,
    weight:      2,
    opacity:     0.75,
    fillColor:   color,
    fillOpacity: 0.09,
    ...(isDashed ? { dashArray: '8,4' } : {}),
  }
}

function onEachDynamicFeature(feature, layer) {
  const name = feature.properties?.feature_name || feature.properties?.attributes?.name || ''
  if (name) {
    layer.bindTooltip(name, {
      permanent: false, direction: 'center',
      className: 'bg-white dark:bg-gray-800 text-slate-700 text-xs font-medium rounded shadow-lg px-2 py-1 border-0',
    })
  }
}

// Reacts to AI-driven bounds changes and fits the map viewport accordingly
function FitBoundsController({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    map.fitBounds(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      { padding: [40, 40], animate: true },
    )
  }, [bounds, map])
  return null
}

export default function GISMap() {
  const { reports: localReports } = useData()
  const { aiFilters, aiBounds, heatmapPoints, aiMapLabel, clearAiMapState } = useMapContext()

  // API-backed data (DB reports + operational layers)
  const { reports: rawApiReports } = useApiReports({ limit: '500' })
  const { layers: dynamicLayers }  = useApiSpatialLayers()

  // Normalize API reports to map-compatible shape; avoid duplicating local reports
  const localIds = new Set(localReports.map(r => r.id))
  const apiReports = rawApiReports
    .filter(r => !localIds.has(r.id))
    .map(normalizeApiReport)
    .filter(r => r.coords != null)

  const reports = [...localReports, ...apiReports]

  const [filterElement, setFilterElement] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selected, setSelected] = useState(null)
  const [mapStyle, setMapStyle] = useState('dark')
  const [showLayers, setShowLayers] = useState(false)
  const [activeLayers, setActiveLayers] = useState({ heat: false })
  const [activeDynamicLayers, setActiveDynamicLayers] = useState({})

  const toggleLayer        = (id) => setActiveLayers(p => ({ ...p, [id]: !p[id] }))
  const toggleDynamicLayer = (id) => setActiveDynamicLayers(p => ({ ...p, [id]: !p[id] }))

  // AI filter overrides local filter when set; changing a dropdown clears the AI override
  const effectiveElement = aiFilters.element || filterElement
  const effectiveStatus  = aiFilters.status  || filterStatus

  const tiles = {
    dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  }

  const filtered = reports.filter(r => {
    if (effectiveElement !== 'all' && r.element !== effectiveElement) return false
    if (effectiveStatus  !== 'all' && r.status  !== effectiveStatus)  return false
    return r.coords != null
  })

  const usedElements     = regulationData.filter(el => reports.some(r => r.element === el.id))
  const activeLayerCount = Object.values(activeLayers).filter(Boolean).length
                         + Object.values(activeDynamicLayers).filter(Boolean).length
  const hasAiOverride    = aiFilters.element || aiFilters.status || aiMapLabel || heatmapPoints?.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{'الخريطة الذكية'}</h1>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">{'نظام المعلومات الجغرافية · أمانة الباحة'}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasAiOverride && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
              <Bot size={13} />
              <span>{aiMapLabel || 'عرض ذكاء اصطناعي'}</span>
              <button onClick={clearAiMapState} className="hover:text-indigo-900 dark:hover:text-white transition-colors">
                <X size={12} />
              </button>
            </div>
          )}
          <button onClick={() => setShowLayers(!showLayers)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all relative ${showLayers || activeLayerCount > 0 ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400'}`}>
            <Layers size={14} />
            <span>{'الطبقات'}</span>
            {activeLayerCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {activeLayerCount}
              </span>
            )}
            {showLayers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-all">
            <Download size={14} />
            <span>{'تصدير'}</span>
          </button>
        </div>
      </div>

      {/* Layers panel */}
      {showLayers && (
        <div className={`${card} rounded-xl p-4 space-y-4`}>
          {/* Analytical heat layer */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">{'طبقات تحليلية'}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button onClick={() => toggleLayer('heat')}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-right transition-all ${activeLayers.heat ? 'border-blue-300 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                <div className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5" style={{ background: '#F59E0B', opacity: activeLayers.heat ? 1 : 0.4 }} />
                <div>
                  <p className={`text-xs font-medium ${activeLayers.heat ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-gray-400'}`}>{'طبقة حرارية'}</p>
                  <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5">{'كثافة البلاغات'}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Dynamic operational layers from DB */}
          {dynamicLayers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Database size={12} className="text-indigo-500" />
                <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                  {'طبقات تشغيلية مستوردة'} ({dynamicLayers.length})
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dynamicLayers.map(layer => {
                  const color  = dynamicLayerColor(layer.type)
                  const active = !!activeDynamicLayers[layer.id]
                  const featureCount = layer.featureCollection?.features?.length ?? 0
                  return (
                    <button key={layer.id} onClick={() => toggleDynamicLayer(layer.id)}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-right transition-all ${active ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                      <div className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5" style={{ background: color, opacity: active ? 1 : 0.4 }} />
                      <div className="min-w-0">
                        <p className={`text-xs font-medium truncate ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-gray-400'}`}>
                          {layer.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-gray-600 mt-0.5">
                          {featureCount.toLocaleString()} عنصر
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className={`${card} rounded-xl p-3 flex flex-wrap items-center gap-3`}>
        <Filter size={14} className="text-slate-400 dark:text-gray-500" />
        <select
          value={effectiveElement}
          onChange={e => { setFilterElement(e.target.value); if (aiFilters.element) clearAiMapState() }}
          className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="all">{'كل العناصر'} ({reports.length})</option>
          {regulationData.map(e => {
            const count = reports.filter(r => r.element === e.id).length
            return count > 0 ? <option key={e.id} value={e.id}>{e.name} ({count})</option> : null
          })}
        </select>
        <select
          value={effectiveStatus}
          onChange={e => { setFilterStatus(e.target.value); if (aiFilters.status) clearAiMapState() }}
          className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-gray-300 focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="all">{'كل الحالات'}</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-0.5">
          {[['dark', 'داكن'], ['light', 'فاتح'], ['satellite', 'قمر صناعي']].map(([k, v]) => (
            <button key={k} onClick={() => setMapStyle(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${mapStyle === k ? 'bg-white dark:bg-gray-700 text-slate-700 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400'}`}>
              {v}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-400 dark:text-gray-500 mr-auto">
          {filtered.length} {'بلاغ معروض · التكبير يوزّع المجموعات تلقائياً'}
        </div>
      </div>

      {/* Empty state */}
      {reports.length === 0 && (
        <div className={`${card} rounded-xl py-20 text-center`}>
          <p className="text-slate-400 dark:text-gray-500 text-lg font-medium mb-2">{'لا توجد بلاغات على الخريطة'}</p>
          <p className="text-slate-400 dark:text-gray-600 text-sm">{'أضف بلاغات أو استورد بيانات GIS لتظهر على الخريطة'}</p>
        </div>
      )}

      {/* Map + side panel */}
      <div className="grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 290px)', minHeight: '480px' }}>
        <div className={`${selected ? 'col-span-8' : 'col-span-12'} rounded-xl overflow-hidden ${card} relative`}>
          <MapContainer center={[20.0131, 41.4677]} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
            <TileLayer url={tiles[mapStyle]} attribution='&copy; CartoDB' />

            {/* AI-driven viewport controller */}
            <FitBoundsController bounds={aiBounds} />

            {/* Dynamic operational layers loaded from DB */}
            {dynamicLayers.map(layer =>
              activeDynamicLayers[layer.id] && layer.featureCollection?.features?.length > 0 ? (
                <GeoJSON
                  key={`dynamic-${layer.id}`}
                  data={layer.featureCollection}
                  style={() => dynamicLayerStyle(layer.type)}
                  onEachFeature={onEachDynamicFeature}
                />
              ) : null
            )}

            {/* Report markers */}
            {reports.length > 0 && (
              <MarkerClusterGroup chunkedLoading maxClusterRadius={60} showCoverageOnHover={false} spiderfyOnMaxZoom>
                {filtered.map(r => (
                  <Marker key={r.id} position={r.coords || [20.0131, 41.4677]}
                    icon={createIcon(r.elementColor || '#3B82F6')}
                    eventHandlers={{ click: () => setSelected(r) }}>
                    <Popup>
                      <div style={{ fontFamily: 'Tajawal,sans-serif', direction: 'rtl', minWidth: '180px' }}>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 4px', fontFamily: 'monospace' }}>{r.id}</p>
                        <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 4px', color: '#1e293b' }}>{r.elementName || r.title}</p>
                        <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px' }}>{r.district}</p>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: '#d97706', margin: '0' }}>
                          {(r.estimatedFine || 0).toLocaleString('ar-SA')} {'ريال'}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* Local density heat layer (manual toggle) */}
            {activeLayers.heat && filtered.map(r => (
              <Circle key={`h-${r.id}`} center={r.coords || [20.0131, 41.4677]} radius={700}
                pathOptions={{ fillColor: r.elementColor || '#3B82F6', fillOpacity: 0.07, color: r.elementColor || '#3B82F6', weight: 1, opacity: 0.25 }} />
            ))}

            {/* AI-driven heatmap points (from copilot spatial analysis) */}
            {heatmapPoints?.map((pt, i) => (
              <Circle key={`ai-heat-${i}`} center={[pt.lat, pt.lng]} radius={600}
                pathOptions={{ fillColor: '#EF4444', fillOpacity: 0.12, color: '#EF4444', weight: 0.5, opacity: 0.3 }} />
            ))}
          </MapContainer>

          {/* Overlay counters */}
          <div className="absolute top-4 right-4 z-[500] space-y-1.5 pointer-events-none">
            {[['الإجمالي', filtered.length, 'bg-white dark:bg-gray-900 text-slate-700 dark:text-white'],
              ['مفتوح', filtered.filter(r => !['closed', 'rejected'].includes(r.status)).length, 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'],
              ['مغلق', filtered.filter(r => r.status === 'closed').length, 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'],
            ].map(([l, v, cls]) => (
              <div key={l} className={`${cls} border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-center shadow-sm`}>
                <div className="text-base font-bold">{v}</div>
                <div className="text-xs opacity-70">{l}</div>
              </div>
            ))}
          </div>

          {/* Active layer badges */}
          {activeLayers.heat && (
            <div className="absolute bottom-4 left-4 z-[500] flex flex-wrap gap-1.5">
              <span className="flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 border border-slate-200 dark:border-gray-700 rounded-full px-2 py-0.5 text-xs text-slate-600 dark:text-gray-300 shadow backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full" style={{ background: '#F59E0B' }} />
                {'طبقة حرارية'}
              </span>
            </div>
          )}
        </div>

        {selected && (
          <div className={`col-span-4 ${card} rounded-xl p-4 overflow-y-auto`}>
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded">
                {selected.id}
              </span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: selected.elementColor || '#3B82F6' }} />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white leading-relaxed">{selected.elementName || selected.title}</h3>
            </div>
            {selected.elementStage && <p className="text-xs text-slate-400 dark:text-gray-600 mb-1">{selected.elementStage}</p>}
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-4">{selected.district}</p>

            <div className={`rounded-lg border ${statusConfig[selected.status]?.border} ${statusConfig[selected.status]?.bg} p-2 mb-4 text-center`}>
              <span className={`text-xs font-medium ${statusConfig[selected.status]?.text}`}>{statusConfig[selected.status]?.label}</span>
            </div>

            <div className="space-y-2 text-xs mb-4">
              {[
                ['عدد البنود', `${selected.articles?.length || selected.violationCount || 0} بند`],
                ['المصدر', { ai: 'ذكاء اصطناعي', manual: 'يدوي', mobile: 'تطبيق جوال', drone: 'طائرة مسيّرة' }[selected.source] || 'يدوي'],
                ['الجهة', selected.entity || '—'],
                ['التاريخ', new Date(selected.createdAt).toLocaleDateString('ar-SA')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-slate-500 dark:text-gray-500">{k}</span>
                  <span className="text-slate-700 dark:text-gray-200 font-medium">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-500 dark:text-gray-500 mb-0.5">{'الغرامة المتوقعة'}</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{(selected.estimatedFine || 0).toLocaleString('ar-SA')} {'ريال'}</p>
            </div>

            {selected.description && (
              <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-400 dark:text-gray-600 mb-1">{'الوصف'}</p>
                <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">{selected.description}</p>
              </div>
            )}

            <a href={`/reports/${selected.id}`}
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-2 rounded-lg text-sm font-medium transition-colors">
              {'عرض تفاصيل البلاغ'}
            </a>
          </div>
        )}
      </div>

      {/* Legend */}
      {usedElements.length > 0 && (
        <div className={`${card} rounded-xl p-3 flex flex-wrap gap-4`}>
          <p className="text-xs text-slate-400 dark:text-gray-600 font-medium w-full">{'العناصر على الخريطة'}</p>
          {usedElements.map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color }} />
              <span className="text-xs text-slate-500 dark:text-gray-400">{e.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
