import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { regulationData } from '@/data/mockData'
import { normalizeStatus, OPEN_STATUSES } from '@/data/caseConfig'
import { ROLE_DEFAULT_PERMISSIONS } from '@/data/permissions'
import { useAuth } from '@/context/AuthContext'

const DataContext = createContext(null)

function load(key, def) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : def
  } catch { return def }
}

function normalizeApiUser(u) {
  return {
    id:          u.id,
    name:        u.name || u.full_name || '',
    email:       u.email,
    role:        u.role,
    entity:      u.entity_name || '',
    entityId:    u.entity_id || null,
    avatar:      u.avatar || (u.name || '').slice(0, 2) || 'م',
    status:      u.status,
    permissions: u.permissions || [],
    joinDate:    u.join_date,
    createdAt:   u.created_at,
    phone:       u.phone || '',
  }
}

// Migrate old reports: normalize status + fill missing fields added after initial release
function migrateReports(reports) {
  return reports.map(r => ({
    closureType: null,
    afterPhotos: [],
    rejectionReason: '',
    qualityNotes: '',
    noticeDuration: null,
    noticeDeadline: null,
    letterNumber: '',
    letterPhoto: null,
    articles: [],
    media: [],
    parentId: null,
    isRepeat: false,
    createdBy: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    violationsApplicable: null,
    violatorType: null,
    violatorData: null,
    enforcementStatus: null,
    enforcementNotes: '',
    enforcementUpdatedAt: null,
    ...r,
    status: normalizeStatus(r.status),
  }))
}

// Governance PIN for restoring closed_final reports — validated server-side in production
const RESTORE_PIN = 'RESTORE-2024'

const DEFAULT_CONTRACTORS = [
  { id: 'CTR-001', name: 'شركة المقاولات الوطنية', registrationNo: 'CR-2024-001', phone: '0171234001', type: 'internal', entityName: 'أمانة الباحة', status: 'active', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'CTR-002', name: 'مؤسسة البناء الحديث', registrationNo: 'CR-2024-002', phone: '0171234002', type: 'internal', entityName: 'بلدية شمال الباحة', status: 'active', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'CTR-003', name: 'شركة الطرق والجسور', registrationNo: 'CR-2024-003', phone: '0171234003', type: 'external', entityName: 'وزارة النقل', status: 'active', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'CTR-004', name: 'مقاولات شبكات المياه', registrationNo: 'CR-2024-004', phone: '0171234004', type: 'external', entityName: 'شركة المياه الوطنية', status: 'active', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'CTR-005', name: 'شركة الكهرباء والطاقة', registrationNo: 'CR-2024-005', phone: '0171234005', type: 'external', entityName: 'شركة الكهرباء السعودية', status: 'active', createdAt: '2024-01-01T00:00:00.000Z' },
]

export function DataProvider({ children }) {
  const { user: authUser, authFetch } = useAuth()
  const [reports, setReports] = useState(() => migrateReports(load('ua_reports', [])))
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [entities, setEntities] = useState(() => load('ua_entities', []))
  const [auditLogs, setAuditLogs] = useState(() => load('ua_audit_logs', []))
  const [restoreRequests, setRestoreRequests] = useState(() => load('ua_restore_requests', []))
  const [contractors, setContractors] = useState(() => {
    const stored = load('ua_contractors', [])
    return stored.length > 0 ? stored : DEFAULT_CONTRACTORS
  })

  useEffect(() => {
    try {
      localStorage.setItem('ua_reports', JSON.stringify(reports))
    } catch {
      // QuotaExceededError: retry without base64 media payloads to stay within 5 MB
      try {
        const stripped = reports.map(r => ({
          ...r,
          media: (r.media || []).map(m => ({ name: m.name, type: m.type, url: '' })),
          afterPhotos: [],
          letterPhoto: null,
        }))
        localStorage.setItem('ua_reports', JSON.stringify(stripped))
      } catch { /* storage full even without media — skip, state stays in memory */ }
    }
  }, [reports])
  // Fetch users from API whenever auth token changes
  useEffect(() => {
    if (!authUser?.token) { setUsers([]); return }
    setUsersLoading(true)
    authFetch('/api/users')
      .then(res => res?.json())
      .then(data => { if (data?.users) setUsers(data.users.map(normalizeApiUser)) })
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }, [authUser?.token, authFetch])
  useEffect(() => { try { localStorage.setItem('ua_entities', JSON.stringify(entities)) } catch {} }, [entities])
  useEffect(() => { try { localStorage.setItem('ua_audit_logs', JSON.stringify(auditLogs)) } catch {} }, [auditLogs])
  useEffect(() => { try { localStorage.setItem('ua_restore_requests', JSON.stringify(restoreRequests)) } catch {} }, [restoreRequests])
  useEffect(() => { try { localStorage.setItem('ua_contractors', JSON.stringify(contractors)) } catch {} }, [contractors])

  // ── Audit log ──────────────────────────────────────────────────────────────
  const addAuditLog = (entry) => {
    const log = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    }
    setAuditLogs(prev => [log, ...prev])
    return log
  }

  // ── Reports ────────────────────────────────────────────────────────────────
  const addReport = (data, currentUser) => {
    const el = regulationData.find(e => e.id === data.element)
    const fineTotal = (data.articles || []).reduce((s, item) => {
      const a = el?.articles.find(x => x.id === item.id)
      return s + ((a?.fineAmana || 0) * item.count)
    }, 0)
    const report = {
      id: `RPT-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      title: el?.name || data.description?.slice(0, 40) || 'بلاغ جديد',
      element: data.element || '',
      elementName: el?.name || '',
      elementStage: el?.stage || '',
      elementColor: el?.color || '#3B82F6',
      articles: data.articles || [],
      entityType: data.entityType || '',
      entity: data.entity || '',
      assignedTo: data.assignedTo || '',
      district: data.district || '',
      description: data.description || '',
      priority: data.priority || 'medium',
      coords: data.coords || [20.0131, 41.4677],
      source: data.source || 'manual',
      media: data.media || [],
      status: 'submitted',
      estimatedFine: fineTotal,
      violationCount: (data.articles || []).reduce((s, item) => s + item.count, 0) || 1,
      // Closure fields
      closureType: null,
      afterPhotos: [],
      rejectionReason: '',
      qualityNotes: '',
      // Notice fields
      noticeDuration: null,
      noticeDeadline: null,
      // Unidentified fields
      letterNumber: '',
      letterPhoto: null,
      // Sub-case / repeat fields
      parentId: data.parentId || null,
      isRepeat: data.isRepeat || false,
      violationsApplicable: data.violationsApplicable ?? null,
      violatorType: data.violatorType || null,
      violatorData: data.violatorData || null,
      enforcementStatus: null,
      enforcementNotes: '',
      enforcementUpdatedAt: null,
      enforcementUpdatedBy: null,
      createdBy: currentUser?.id || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setReports(prev => [report, ...prev])
    addAuditLog({
      reportId: report.id,
      action: 'created',
      fromStatus: null,
      toStatus: 'submitted',
      userId: currentUser?.id || 'system',
      userName: currentUser?.name || 'النظام',
      entity: currentUser?.entity || '',
      details: `تم إنشاء البلاغ: ${report.elementName || report.title}`,
    })
    return report
  }

  const updateReport = (id, patch, auditEntry) => {
    setReports(prev => prev.map(r =>
      r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
    ))
    if (auditEntry) {
      addAuditLog({ reportId: id, ...auditEntry })
    }
  }

  const deleteReport = (id, actor) => {
    const target = reports.find(r => r.id === id)
    if (!target || target.isDeleted) return false
    if (target.status === 'closed_final') return false  // immutable — governed by SOP
    const now = new Date().toISOString()
    setReports(prev => prev.map(r =>
      r.id === id
        ? { ...r, isDeleted: true, deletedAt: now, deletedBy: actor?.id || 'system' }
        : r
    ))
    addAuditLog({
      reportId: id,
      action: 'deleted',
      fromStatus: target.status,
      toStatus: null,
      userId: actor?.id || 'system',
      userName: actor?.name || 'النظام',
      entity: actor?.entity || '',
      details: `حذف البلاغ (سلة المحذوفات): ${target.elementName || target.title}`,
    })
    return true
  }

  const restoreReport = (id, actor) => {
    const target = reports.find(r => r.id === id)
    if (!target || !target.isDeleted) return false
    setReports(prev => prev.map(r =>
      r.id === id
        ? { ...r, isDeleted: false, deletedAt: null, deletedBy: null }
        : r
    ))
    addAuditLog({
      reportId: id,
      action: 'restored',
      fromStatus: null,
      toStatus: target.status,
      userId: actor?.id || 'system',
      userName: actor?.name || 'النظام',
      entity: actor?.entity || '',
      details: `استعادة البلاغ المحذوف: ${target.elementName || target.title}`,
    })
    return true
  }

  // ── Governed restore flow for closed_final reports ────────────────────────
  // Step 1: manager submits restore request with justification
  const requestRestore = (reportId, reason, requestingUser) => {
    const target = reports.find(r => r.id === reportId)
    if (!target || target.status !== 'closed_final' || target.isDeleted) return { error: 'البلاغ غير مؤهل للاستعادة' }
    const existing = restoreRequests.find(q => q.reportId === reportId && q.status === 'pending')
    if (existing) return { error: 'يوجد طلب استعادة معلق لهذا البلاغ بالفعل' }
    const req = {
      id: `RRQ-${Date.now()}`,
      reportId,
      reportTitle: target.elementName || target.title,
      reportEntity: target.entity || '',
      requesterId: requestingUser.id,
      requesterName: requestingUser.name,
      requesterEntity: requestingUser.entity || requestingUser.dept || '',
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedById: null,
      resolvedByName: null,
      rejectionNote: null,
    }
    setRestoreRequests(prev => [req, ...prev])
    addAuditLog({
      reportId,
      action: 'restore_requested',
      fromStatus: 'closed_final',
      toStatus: null,
      userId: requestingUser.id,
      userName: requestingUser.name,
      entity: requestingUser.entity || '',
      details: `طلب استعادة بلاغ مكتمل — السبب: ${reason}`,
    })
    return { success: true, request: req }
  }

  // Step 2: admin approves with governance PIN — report reverts to quality_review
  const approveRestoreRequest = (requestId, pin, actor) => {
    if (pin !== RESTORE_PIN) return { success: false, error: 'الرقم السري غير صحيح' }
    const req = restoreRequests.find(q => q.id === requestId && q.status === 'pending')
    if (!req) return { success: false, error: 'الطلب غير موجود أو تمت معالجته مسبقاً' }
    const target = reports.find(r => r.id === req.reportId)
    if (!target) return { success: false, error: 'البلاغ غير موجود' }
    const now = new Date().toISOString()
    setReports(prev => prev.map(r =>
      r.id === req.reportId ? { ...r, status: 'quality_review', updatedAt: now } : r
    ))
    setRestoreRequests(prev => prev.map(q =>
      q.id === requestId
        ? { ...q, status: 'approved', resolvedAt: now, resolvedById: actor.id, resolvedByName: actor.name }
        : q
    ))
    addAuditLog({
      reportId: req.reportId,
      action: 'restore_approved',
      fromStatus: 'closed_final',
      toStatus: 'quality_review',
      userId: actor.id,
      userName: actor.name,
      entity: actor.entity || '',
      details: `اعتماد استعادة البلاغ المكتمل (برقم سري) — مقدم الطلب: ${req.requesterName} — السبب: ${req.reason}`,
    })
    return { success: true }
  }

  // Step 2 alt: admin rejects the request
  const rejectRestoreRequest = (requestId, rejectionNote, actor) => {
    const req = restoreRequests.find(q => q.id === requestId && q.status === 'pending')
    if (!req) return { success: false, error: 'الطلب غير موجود' }
    const now = new Date().toISOString()
    setRestoreRequests(prev => prev.map(q =>
      q.id === requestId
        ? { ...q, status: 'rejected', resolvedAt: now, resolvedById: actor.id, resolvedByName: actor.name, rejectionNote }
        : q
    ))
    addAuditLog({
      reportId: req.reportId,
      action: 'restore_rejected',
      fromStatus: 'closed_final',
      toStatus: null,
      userId: actor.id,
      userName: actor.name,
      entity: actor.entity || '',
      details: `رفض طلب الاستعادة — مقدم الطلب: ${req.requesterName} — سبب الرفض: ${rejectionNote || '—'}`,
    })
    return { success: true }
  }

  // ── Contractors ────────────────────────────────────────────────────────────
  const addContractor = (data) => {
    const c = { ...data, id: `CTR-${Date.now()}`, createdAt: new Date().toISOString() }
    setContractors(prev => [...prev, c])
    return c
  }
  const updateContractor = (id, patch) =>
    setContractors(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  const deleteContractor = (id) =>
    setContractors(prev => prev.filter(c => c.id !== id))

  // ── Enforcement tracking ────────────────────────────────────────────────────
  const updateEnforcementStatus = (id, status, notes, actor) => {
    const target = reports.find(r => r.id === id)
    if (!target) return false
    const now = new Date().toISOString()
    const patch = {
      enforcementStatus: status,
      enforcementNotes: notes || '',
      enforcementUpdatedAt: now,
      enforcementUpdatedBy: actor?.id,
    }
    if (status === 'collected_removed') patch.status = 'quality_review'
    setReports(prev => prev.map(r =>
      r.id === id ? { ...r, ...patch, updatedAt: now } : r
    ))
    addAuditLog({
      reportId: id,
      action: status === 'collected_removed' ? 'enforcement_collected' : 'enforcement_updated',
      fromStatus: target.status,
      toStatus: status === 'collected_removed' ? 'quality_review' : target.status,
      userId: actor?.id || 'system',
      userName: actor?.name || 'النظام',
      entity: actor?.entity || '',
      details: `تحديث حالة الإنفاذ: ${status}${notes ? ' — ' + notes : ''}`,
    })
    return true
  }

  // ── Password reset ──────────────────────────────────────────────────────────
  const resetPassword = async (userId, newPassword) => {
    if (!newPassword || newPassword.length < 6) return { error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }
    const res = await authFetch(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword }),
    })
    if (!res) return { error: 'انتهت الجلسة، أعد تسجيل الدخول' }
    if (!res.ok) {
      const err = await res.json()
      return { error: err.error || 'فشل تغيير كلمة المرور' }
    }
    return { success: true }
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  const addUser = async (data) => {
    const res = await authFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name:        data.name,
        email:       data.email,
        role:        data.role,
        entityId:    data.entityId || null,
        password:    data.password,
        permissions: data.permissions,
        phone:       data.phone || '',
      }),
    })
    if (!res) return { error: 'انتهت الجلسة، أعد تسجيل الدخول' }
    if (!res.ok) {
      const err = await res.json()
      return { error: err.error || 'فشل إنشاء المستخدم' }
    }
    const { user: newUser } = await res.json()
    setUsers(prev => [...prev, normalizeApiUser(newUser)])
    return { success: true, user: normalizeApiUser(newUser) }
  }

  const updateUser = async (id, patch) => {
    const res = await authFetch(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name:        patch.name,
        role:        patch.role,
        entityId:    patch.entityId !== undefined ? patch.entityId : undefined,
        status:      patch.status,
        phone:       patch.phone,
        permissions: patch.permissions,
        password:    patch.password,
      }),
    })
    if (!res) return { error: 'انتهت الجلسة، أعد تسجيل الدخول' }
    if (!res.ok) {
      const err = await res.json()
      return { error: err.error || 'فشل تعديل المستخدم' }
    }
    const { user: updated } = await res.json()
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...normalizeApiUser(updated) } : u))
    return { success: true }
  }

  const deleteUser = async (id) => {
    const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' })
    if (!res) return { error: 'انتهت الجلسة، أعد تسجيل الدخول' }
    if (!res.ok) {
      const err = await res.json()
      return { error: err.error || 'فشل تعطيل المستخدم' }
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'inactive' } : u))
    return { success: true }
  }

  const reactivateUser = async (id) => {
    const res = await authFetch(`/api/users/${id}/reactivate`, { method: 'PATCH' })
    if (!res) return { error: 'انتهت الجلسة، أعد تسجيل الدخول' }
    if (!res.ok) {
      const err = await res.json()
      return { error: err.error || 'فشل تفعيل المستخدم' }
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: 'active' } : u))
    return { success: true }
  }

  // ── Entities ───────────────────────────────────────────────────────────────
  const addEntity = (data) => {
    const entity = { ...data, id: `ENT-${Date.now()}`, createdAt: new Date().toISOString() }
    setEntities(prev => [...prev, entity])
    return entity
  }

  const updateEntity = (id, patch) =>
    setEntities(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))

  const deleteEntity = (id) =>
    setEntities(prev => prev.filter(e => e.id !== id))

  // ── Element → default entity mapping (stored in entities with a flag) ──────
  // Returns entity name for the given element id, or null
  const getDefaultEntity = (elementId) => {
    const match = entities.find(e => e.defaultForElement === elementId)
    return match ? match.name : null
  }

  // ── Live stats (exclude soft-deleted reports from all aggregations) ──────────
  const liveReports = reports.filter(r => !r.isDeleted)
  const isClosed = (r) => r.status === 'closed_final'
  const isOpen = (r) => OPEN_STATUSES.has(r.status)

  const stats = {
    totalReports: liveReports.length,
    openReports: liveReports.filter(isOpen).length,
    closedReports: liveReports.filter(isClosed).length,
    newReports: liveReports.filter(r => r.status === 'submitted').length,
    aiDetected: liveReports.filter(r => r.source === 'ai').length,
    totalFineEstimate: liveReports.reduce((s, r) => s + (r.estimatedFine || 0), 0),
    avgCloseTime: (() => {
      const closed = liveReports.filter(isClosed)
      if (!closed.length) return 0
      const avg = closed.reduce((s, r) =>
        s + (new Date(r.updatedAt) - new Date(r.createdAt)) / 86400000, 0
      ) / closed.length
      return Math.round(avg)
    })(),
    byElement: Object.values(
      liveReports.reduce((acc, r) => {
        if (!r.element) return acc
        if (!acc[r.element]) acc[r.element] = { id: r.element, name: r.elementName || r.element, color: r.elementColor || '#3B82F6', count: 0, fine: 0 }
        acc[r.element].count++
        acc[r.element].fine += r.estimatedFine || 0
        return acc
      }, {})
    ).sort((a, b) => b.count - a.count),
    byDistrict: Object.entries(
      liveReports.reduce((acc, r) => {
        if (r.district) acc[r.district] = (acc[r.district] || 0) + 1
        return acc
      }, {})
    ).map(([district, count]) => ({ district, count })).sort((a, b) => b.count - a.count),
    byStatus: Object.entries(
      liveReports.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {})
    ).map(([status, count]) => ({ status, count })),
    byEntity: Object.entries(
      liveReports.reduce((acc, r) => {
        if (r.entity) {
          if (!acc[r.entity]) acc[r.entity] = { total: 0, closed: 0 }
          acc[r.entity].total++
          if (isClosed(r)) acc[r.entity].closed++
        }
        return acc
      }, {})
    ).map(([dept, { total, closed }]) => ({
      dept,
      rate: total ? Math.round((closed / total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate),
    monthlyReports: (() => {
      const months = [...Array(6)].map((_, i) => {
        const d = new Date()
        d.setMonth(d.getMonth() - (5 - i))
        return { month: d.toLocaleString('ar-SA', { month: 'short' }), y: d.getFullYear(), m: d.getMonth() }
      })
      return months.map(({ month, y, m }) => ({
        month,
        reports: liveReports.filter(r => { const d = new Date(r.createdAt); return d.getFullYear() === y && d.getMonth() === m }).length,
        closed: liveReports.filter(r => { const d = new Date(r.createdAt); return isClosed(r) && d.getFullYear() === y && d.getMonth() === m }).length,
        fines: liveReports.filter(r => { const d = new Date(r.createdAt); return d.getFullYear() === y && d.getMonth() === m }).reduce((s, r) => s + (r.estimatedFine || 0), 0),
      }))
    })(),
    // Specialized basket counts
    enforcementCount: liveReports.filter(r => r.closureType === 'fine_issued').length,
    noticeCount: liveReports.filter(r => r.closureType === 'notice_posted').length,
    unidentifiedCount: liveReports.filter(r => r.closureType === 'unknown_offender').length,
    qualityReviewCount: liveReports.filter(r => r.status === 'quality_review').length,
    deletedCount: reports.filter(r => r.isDeleted).length,
  }

  return (
    <DataContext.Provider value={{
      reports, users, usersLoading, entities, auditLogs, stats,
      addReport, updateReport, deleteReport, restoreReport, addAuditLog,
      restoreRequests, requestRestore, approveRestoreRequest, rejectRestoreRequest,
      contractors, addContractor, updateContractor, deleteContractor,
      updateEnforcementStatus,
      resetPassword,
      addUser, updateUser, deleteUser, reactivateUser,
      addEntity, updateEntity, deleteEntity,
      getDefaultEntity,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
