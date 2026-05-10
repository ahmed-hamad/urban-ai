import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'

// Roles that can see every report regardless of entity or assignment
const UNRESTRICTED_ROLES = new Set(['admin', 'executive', 'auditor'])

/**
 * Returns reports filtered to the current user's authorized scope.
 *
 * admin / executive / auditor → all reports (unrestricted)
 * manager                     → reports belonging to their entity
 * monitor                     → only reports they created or are assigned to
 */
export function useReportScope() {
  const { user } = useAuth()
  const { reports } = useData()

  const isRestricted = !!user && !UNRESTRICTED_ROLES.has(user.role)

  const scopedReports = useMemo(() => {
    if (!user) return []
    // Always exclude soft-deleted reports from the active view
    const active = reports.filter(r => !r.isDeleted)
    if (!isRestricted) return active

    const myEntity = user.entity || user.dept || ''

    if (user.role === 'manager') {
      if (!myEntity) {
        // Manager with no entity assignment: see only explicitly assigned/created reports
        return active.filter(r => r.assignedTo === user.id || r.createdBy === user.id)
      }
      const entityNorm = myEntity.trim()
      return active.filter(r =>
        (r.entity || '').trim() === entityNorm || r.assignedTo === user.id
      )
    }

    // monitor: only reports explicitly assigned to them (SOP §5)
    // createdBy is intentionally excluded — created reports enter manager's queue first
    return active.filter(r => r.assignedTo === user.id)
  }, [user, reports, isRestricted])

  const scopeLabel = useMemo(() => {
    if (!isRestricted) return null
    if (user?.role === 'manager') return `نطاق: ${user.entity || 'الجهة'}`
    return 'نطاق: بلاغاتي'
  }, [user, isRestricted])

  return { scopedReports, isRestricted, scopeLabel }
}

/**
 * Returns true if the current user can access a specific report.
 * API reports (fromApi: true) have already been RBAC-scoped by the backend;
 * if the backend returned them, access is permitted — trust the server.
 */
export function canAccessReport(user, report) {
  if (!user || !report) return false
  if (report.fromApi) return true   // backend already enforced RBAC
  if (UNRESTRICTED_ROLES.has(user.role)) return true
  if (user.role === 'manager') {
    const myEntity = (user.entity || user.dept || '').trim()
    if (!myEntity) return report.assignedTo === user.id || report.createdBy === user.id
    return (report.entity || '').trim() === myEntity || report.assignedTo === user.id
  }
  return report.assignedTo === user.id || report.createdBy === user.id
}
