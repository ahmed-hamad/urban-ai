// MapContext — Centralized map state for AI-map synchronization
// The AI Copilot (AgentAI) writes map commands here.
// GISMap reads and applies them imperatively.

import { createContext, useContext, useState, useCallback } from 'react'

const MapContext = createContext(null)

export function MapProvider({ children }) {
  // AI-driven filter overrides (element + status)
  const [aiFilters, setAiFilters] = useState({ element: null, status: null })

  // Bounding box to fit the map view to [{south,north,west,east}]
  const [aiBounds, setAiBounds] = useState(null)

  // Heatmap points [{lat, lng, element_id}] from AI analysis
  const [heatmapPoints, setHeatmapPoints] = useState(null)

  // Set of report IDs to visually highlight on the map
  const [highlightedIds, setHighlightedIds] = useState(new Set())

  // Label for the current AI-driven map view (shown in toolbar)
  const [aiMapLabel, setAiMapLabel] = useState(null)

  // Dispatch a structured map command from the AI response
  const applyMapCommand = useCallback((command) => {
    if (!command?.action) return

    const p = command.params || {}

    switch (command.action) {
      case 'filterByElement':
        setAiFilters({ element: p.element || null, status: null })
        setAiMapLabel(p.label || null)
        break

      case 'filterAndZoom':
        setAiFilters({ element: p.element || null, status: p.status || null })
        if (p.bounds) setAiBounds(p.bounds)
        setAiMapLabel(p.label || null)
        break

      case 'focusMunicipality':
        if (p.bounds) setAiBounds(p.bounds)
        setAiMapLabel(p.municipality || p.label || null)
        break

      case 'showHeatmap':
        if (p.points?.length) setHeatmapPoints(p.points)
        if (p.bounds) setAiBounds(p.bounds)
        setAiMapLabel(p.label || 'خريطة حرارية')
        break

      case 'highlightReports':
        if (Array.isArray(p.ids)) setHighlightedIds(new Set(p.ids))
        if (p.bounds) setAiBounds(p.bounds)
        break

      default:
        break
    }
  }, [])

  // Clear all AI-driven overrides
  const clearAiMapState = useCallback(() => {
    setAiFilters({ element: null, status: null })
    setAiBounds(null)
    setHeatmapPoints(null)
    setHighlightedIds(new Set())
    setAiMapLabel(null)
  }, [])

  return (
    <MapContext.Provider value={{
      aiFilters, setAiFilters,
      aiBounds,  setAiBounds,
      heatmapPoints, setHeatmapPoints,
      highlightedIds, setHighlightedIds,
      aiMapLabel,
      applyMapCommand,
      clearAiMapState,
    }}>
      {children}
    </MapContext.Provider>
  )
}

export const useMapContext = () => {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('useMapContext must be used within MapProvider')
  return ctx
}
