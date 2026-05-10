// ─── Permissions Registry ─────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Reports
  create_report:   'إنشاء بلاغ جديد',
  view_reports:    'عرض البلاغات',
  edit_report:     'تعديل بيانات البلاغ',
  assign_report:   'إسناد البلاغ للجهات',
  // Workflow
  close_inspector: 'إغلاق البلاغ (مراقب)',
  quality_review:  'مراجعة الجودة',
  close_final:     'الإغلاق النهائي',
  reject_report:   'رفض البلاغ',
  // Administration
  manage_users:    'إدارة المستخدمين',
  manage_entities: 'إدارة الجهات التنظيمية',
  reset_password:  'إعادة تعيين كلمة المرور',
  // Analytics & Tools
  view_financials: 'عرض التقارير المالية',
  view_audit_log:  'عرض سجل التدقيق',
  gis_access:      'الوصول للخريطة الجغرافية',
  ai_access:       'استخدام الذكاء الاصطناعي',
}

export const PERMISSION_GROUPS = {
  'إدارة البلاغات':     ['create_report', 'view_reports', 'edit_report', 'assign_report'],
  'إجراءات سير العمل':  ['close_inspector', 'quality_review', 'close_final', 'reject_report'],
  'الإدارة':            ['manage_users', 'manage_entities', 'reset_password'],
  'التقارير والأدوات':  ['view_financials', 'view_audit_log', 'gis_access', 'ai_access'],
}

const ALL = Object.keys(PERMISSIONS)

export const ROLE_DEFAULT_PERMISSIONS = {
  admin:     ALL,
  executive: ['view_reports', 'assign_report', 'reject_report', 'manage_users', 'manage_entities', 'view_financials', 'view_audit_log', 'gis_access'],
  manager:   ['create_report', 'view_reports', 'edit_report', 'assign_report', 'view_financials', 'view_audit_log', 'gis_access', 'reset_password'],
  auditor:   ['view_reports', 'quality_review', 'close_final', 'reject_report', 'view_audit_log'],
  monitor:   ['create_report', 'view_reports', 'close_inspector', 'gis_access', 'ai_access'],
}
