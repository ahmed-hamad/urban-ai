// Detection Candidate Grouper
//
// Analyzes pending candidates and SUGGESTS groupings based on:
//   - Geographic proximity (Haversine distance)
//   - Temporal proximity (capture timestamp delta)
//   - Element type match (optional)
//
// Groups are suggestions only — human confirmation is always required.
// No candidate is ever automatically merged or reported.

const DEFAULT_PROXIMITY_METERS  = 50
const DEFAULT_TIME_WINDOW_MIN   = 30

export function suggestGroups(candidates, options = {}) {
  const {
    proximityMeters    = DEFAULT_PROXIMITY_METERS,
    timeWindowMinutes  = DEFAULT_TIME_WINDOW_MIN,
    requireSameElement = false,
  } = options

  if (candidates.length < 2) return []

  // Build adjacency list: which candidates could belong in the same group
  const adjacency = new Map()

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]

      if (!couldGroup(a, b, { proximityMeters, timeWindowMinutes, requireSameElement })) continue

      if (!adjacency.has(a.id)) adjacency.set(a.id, new Set())
      if (!adjacency.has(b.id)) adjacency.set(b.id, new Set())
      adjacency.get(a.id).add(b.id)
      adjacency.get(b.id).add(a.id)
    }
  }

  // Find connected components via BFS
  const visited = new Set()
  const groups  = []

  for (const c of candidates) {
    if (visited.has(c.id) || !adjacency.has(c.id)) continue

    const group = []
    const queue = [c.id]

    while (queue.length) {
      const id = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)
      group.push(id)
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }

    if (group.length >= 2) groups.push(group)
  }

  return groups
}

export function describeGroup(candidates, groupIds) {
  const members = candidates.filter(c => groupIds.includes(c.id))
  if (!members.length) return null

  const withLoc  = members.filter(m => m.gps_lat != null && m.gps_lng != null)
  const withTime = members.filter(m => m.capture_timestamp != null)

  const timeRange = withTime.length >= 2 ? {
    earliest: new Date(Math.min(...withTime.map(m => +new Date(m.capture_timestamp)))),
    latest:   new Date(Math.max(...withTime.map(m => +new Date(m.capture_timestamp)))),
  } : null

  const centerPoint = withLoc.length ? {
    lat: withLoc.reduce((s, m) => s + parseFloat(m.gps_lat), 0) / withLoc.length,
    lng: withLoc.reduce((s, m) => s + parseFloat(m.gps_lng), 0) / withLoc.length,
  } : null

  return {
    memberCount:  members.length,
    elementTypes: [...new Set(members.map(m => m.suggested_element_type).filter(Boolean))],
    timeRange,
    centerPoint,
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function couldGroup(a, b, { proximityMeters, timeWindowMinutes, requireSameElement }) {
  if (!a.gps_lat || !a.gps_lng || !b.gps_lat || !b.gps_lng) return false

  const dist = haversineDistance(
    parseFloat(a.gps_lat), parseFloat(a.gps_lng),
    parseFloat(b.gps_lat), parseFloat(b.gps_lng),
  )
  if (dist > proximityMeters) return false

  if (a.capture_timestamp && b.capture_timestamp) {
    const diffMin = Math.abs(+new Date(a.capture_timestamp) - +new Date(b.capture_timestamp)) / 60_000
    if (diffMin > timeWindowMinutes) return false
  }

  if (requireSameElement && a.suggested_element_type && b.suggested_element_type) {
    if (a.suggested_element_type !== b.suggested_element_type) return false
  }

  return true
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R  = 6_371_000 // meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
