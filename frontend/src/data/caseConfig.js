// ─── Case Workflow Configuration ──────────────────────────────────────────────
// Single source of truth for the governed case lifecycle state machine.
// Every transition, permission, and routing rule lives here.
// References: SOP §8.1 (lifecycle), §8.8–8.11 (enforcement/notice/quality)

export const STATUS_CONFIG = {
  draft: {
    label: 'مسودة',
    bg: 'bg-slate-100 dark:bg-slate-700/40',
    text: 'text-slate-500 dark:text-slate-400',
    border: 'border-slate-300 dark:border-slate-600',
  },
  submitted: {
    label: 'مُقدَّم',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/30',
  },
  ai_classified: {
    label: 'صُنِّف بالذكاء الاصطناعي',
    bg: 'bg-indigo-50 dark:bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-500/30',
  },
  under_review: {
    label: 'قيد المراجعة',
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-500/30',
  },
  assigned: {
    label: 'مُسند',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/30',
  },
  in_progress: {
    label: 'قيد المعالجة',
    bg: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-500/30',
  },
  closed_inspector: {
    label: 'مغلق (مراقب)',
    bg: 'bg-cyan-50 dark:bg-cyan-500/10',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-500/30',
  },
  // ── Post-closure enforcement tracks (SOP §8.8–8.10) ──────────────────────
  pending_enforcement: {
    label: 'قيد الإنفاذ',
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-500/30',
  },
  pending_notice: {
    label: 'قيد الإشعار',
    bg: 'bg-teal-50 dark:bg-teal-500/10',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-500/30',
  },
  unknown_offender: {
    label: 'مجهول المخالف',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-500/30',
  },
  // ── Quality & final ───────────────────────────────────────────────────────
  quality_review: {
    label: 'مراجعة الجودة',
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-500/30',
  },
  closed_final: {
    label: 'مغلق نهائياً',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/30',
  },
  rejected: {
    label: 'مرفوض',
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/30',
  },
}

// ─── State machine (SOP §8) ────────────────────────────────────────────────────
// Defines ALLOWED next states for each status.
// Enforcement-track transitions (closed_inspector → *) are normally automatic
// and driven by CLOSURE_TYPES[closureType].nextStatus — see handleClosureConfirm.
export const STATUS_TRANSITIONS = {
  draft:               ['submitted'],
  submitted:           ['under_review'],           // AI classification is system-automatic
  ai_classified:       ['under_review'],            // human confirms AI suggestion
  under_review:        ['assigned', 'rejected'],
  assigned:            ['in_progress'],
  in_progress:         ['closed_inspector'],        // opens closure form → auto-routes
  closed_inspector:    ['quality_review', 'pending_enforcement', 'pending_notice', 'unknown_offender'],
  pending_enforcement: ['in_progress', 'quality_review'],   // re-visit after deadline
  pending_notice:      ['in_progress', 'quality_review'],   // re-visit after notice deadline
  unknown_offender:    ['quality_review'],                   // after official letter procedures
  quality_review:      ['closed_final', 'assigned'],
  closed_final:        [],
  rejected:            ['submitted'],
}

// ─── Centralized transition permissions (SOP §5, §10.3) ──────────────────────
// Single source of truth for RBAC on every workflow step.
// Used by: ReportDetail.jsx (frontend) and backend/routes/reports.js
export const TRANSITION_PERMISSIONS = {
  submitted:           { permission: null,              allowedRoles: ['admin', 'manager', 'monitor', 'auditor', 'executive'] },
  ai_classified:       { permission: null,              allowedRoles: ['admin'] }, // system-only
  under_review:        { permission: 'assign_report',   allowedRoles: ['admin', 'manager'] },
  assigned:            { permission: 'assign_report',   allowedRoles: ['admin', 'manager'] },
  in_progress:         { permission: null,              allowedRoles: ['admin', 'manager', 'monitor'] },
  closed_inspector:    { permission: 'close_inspector', allowedRoles: ['admin', 'monitor'] },
  pending_enforcement: { permission: 'close_inspector', allowedRoles: ['admin', 'monitor'] },
  pending_notice:      { permission: 'close_inspector', allowedRoles: ['admin', 'monitor'] },
  unknown_offender:    { permission: 'close_inspector', allowedRoles: ['admin', 'monitor'] },
  quality_review:      { permission: 'quality_review',  allowedRoles: ['admin', 'auditor'] },
  closed_final:        { permission: 'close_final',     allowedRoles: ['admin', 'auditor'] },
  rejected:            { permission: 'reject_report',   allowedRoles: ['admin', 'manager'] },
}

// ─── Closure form requirements ─────────────────────────────────────────────────
// Transitions targeting these statuses require a mandatory written reason
export const REQUIRES_REASON = new Set([
  'rejected',
  'submitted', // when coming from quality_review = reopen
])

// Transitioning from in_progress requires the closure form (closureType + afterPhotos)
export const REQUIRES_CLOSURE_FORM = new Set(['closed_inspector'])

// ─── Closure types → next workflow status (SOP §8.7–8.10) ────────────────────
// When the inspector submits the closure form, the system auto-routes to
// CLOSURE_TYPES[closureType].nextStatus instead of staying at closed_inspector.
export const CLOSURE_TYPES = {
  actual_fix: {
    label:      'إصلاح فعلي',
    color:      '#10B981',
    basket:     null,
    nextStatus: 'quality_review',       // straight to quality audit
  },
  fine_issued: {
    label:      'صدر قرار غرامة',
    color:      '#F59E0B',
    basket:     'enforcement',
    nextStatus: 'pending_enforcement',  // enforcement basket + deadline (SOP §8.8)
  },
  notice_posted: {
    label:      'تم تعليق إشعار',
    color:      '#3B82F6',
    basket:     'notice',
    nextStatus: 'pending_notice',       // notice basket + deadline (SOP §8.9)
  },
  unknown_offender: {
    label:      'مخالف مجهول',
    color:      '#EF4444',
    basket:     'unidentified',
    nextStatus: 'unknown_offender',     // requires official letter (SOP §8.10)
  },
}

// ─── Specialized baskets ────────────────────────────────────────────────────────
// Filters updated to use status-based routing for new records
// while keeping closureType as the canonical identifier for backward compat.
export const BASKET_CONFIG = {
  enforcement: {
    label:  'سلة الإنفاذ',
    desc:   'بلاغات صدرت بحقها قرار غرامة وتنتظر إعادة الزيارة',
    color:  'text-amber-600 dark:text-amber-400',
    bg:     'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    filter: r => r.closureType === 'fine_issued' &&
      !['closed_final', 'rejected', 'quality_review'].includes(r.status),
  },
  notice: {
    label:  'سلة الإشعارات',
    desc:   'بلاغات تم تعليق إشعار بحقها وتنتظر انتهاء المدة',
    color:  'text-blue-600 dark:text-blue-400',
    bg:     'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/30',
    filter: r => r.closureType === 'notice_posted' &&
      !['closed_final', 'rejected', 'quality_review'].includes(r.status),
  },
  unidentified: {
    label:  'مجهول المخالف',
    desc:   'بلاغات لم يُعرَّف فيها المخالف وتستوجب إجراء رسمياً',
    color:  'text-red-600 dark:text-red-400',
    bg:     'bg-red-50 dark:bg-red-500/10',
    border: 'border-red-200 dark:border-red-500/30',
    filter: r => r.closureType === 'unknown_offender' &&
      !['closed_final', 'rejected', 'quality_review'].includes(r.status),
  },
}

// ─── Audit action labels ────────────────────────────────────────────────────────
export const AUDIT_ACTIONS = {
  created:             'تم إنشاء البلاغ',
  status_change:       'تغيير الحالة',
  assigned:            'تم الإسناد',
  closure:             'إغلاق المراقب',
  quality_pass:        'اعتماد مدقق الجودة',
  quality_fail:        'إعادة فتح من مدقق الجودة',
  rejected:            'رفض البلاغ',
  reopened:            'إعادة فتح البلاغ',
  comment:             'ملاحظة',
  enforcement:         'إجراء إنفاذ',
  enforcement_revisit: 'إعادة زيارة الإنفاذ',
  notice_revisit:      'إعادة زيارة الإشعار',
  deleted:             'حذف البلاغ (سلة المحذوفات)',
  restored:            'استعادة البلاغ المحذوف',
  restore_requested:   'طلب استعادة بلاغ مكتمل',
  restore_approved:    'اعتماد استعادة البلاغ المكتمل (برقم سري)',
  restore_rejected:    'رفض طلب الاستعادة',
  enforcement_updated:  'تحديث حالة الإنفاذ',
  enforcement_collected:'تحصيل الغرامة مع إزالة التشوه',
  enforcement_repeat:   'توقيع غرامة التكرار',
  password_reset:       'إعادة تعيين كلمة المرور',
  // ── Ingestion layer actions ───────────────────────────────────────────────
  media_uploaded:       'رفع وسائط — مرشح مُنشأ',
  candidate_confirmed:  'تأكيد مرشح الكشف → بلاغ مسودة',
  candidate_rejected:   'رفض مرشح الكشف',
  candidate_grouped:    'تجميع مرشحات → بلاغ مسودة مجمّع',
  gis_validated:        'تحقق من ملف GIS',
  gis_imported:         'استيراد عناصر GIS → بلاغات مسودة',
}

// ─── Status helpers ─────────────────────────────────────────────────────────────

// Statuses considered "open" for stats and scoping
export const OPEN_STATUSES = new Set([
  'submitted', 'ai_classified', 'under_review', 'assigned', 'in_progress',
  'closed_inspector', 'pending_enforcement', 'pending_notice', 'unknown_offender',
  'quality_review',
])

export const TERMINAL_STATUSES = new Set(['closed_final', 'rejected'])

// Set of statuses that represent post-closure enforcement tracks
export const CLOSURE_STATUSES = new Set([
  'closed_inspector', 'pending_enforcement', 'pending_notice', 'unknown_offender',
])

// ─── Migration aliases (localStorage backward compat) ─────────────────────────
// Maps old/renamed status keys to current canonical names.
export const STATUS_ALIAS = {
  new:            'submitted',
  reviewing:      'under_review',
  approved:       'assigned',
  closed:         'closed_final',
  pending_action: 'pending_enforcement', // migrates old generic pending state
}

export function normalizeStatus(status) {
  return STATUS_ALIAS[status] || status
}

export function getStatusCfg(status) {
  return STATUS_CONFIG[normalizeStatus(status)] || STATUS_CONFIG.submitted
}
