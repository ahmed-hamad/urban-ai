import { useState, useMemo, useCallback } from 'react'
import { roleConfig } from '@/data/mockData'
import { PERMISSIONS, PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS } from '@/data/permissions'
import { useData } from '@/context/DataContext'
import { useAuth } from '@/context/AuthContext'
import {
  X, Plus, Eye, Trash2, Shield, Key, Building2, User,
  Check, AlertTriangle, Lock, Mail, Phone, RefreshCw,
  EyeOff, UserX, UserCheck, Pencil,
} from 'lucide-react'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'
const inputCls = 'w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors'

const STEPS = ['المعلومات الشخصية', 'الدور والصلاحيات', 'التبعية التنظيمية']

// ─── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ onClose, onAdd, entities }) {
  const [step, setStep] = useState(1)
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState('')
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    password: '', confirmPassword: '',
    role: 'monitor',
    permissions: [...ROLE_DEFAULT_PERMISSIONS.monitor],
    entityId: '',
    entityName: '',
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleRoleChange = (role) => {
    set('role', role)
    set('permissions', [...ROLE_DEFAULT_PERMISSIONS[role]])
  }

  const togglePermission = (perm) => {
    set('permissions',
      form.permissions.includes(perm)
        ? form.permissions.filter(p => p !== perm)
        : [...form.permissions, perm]
    )
  }

  const toggleGroup = (keys) => {
    const allOn = keys.every(k => form.permissions.includes(k))
    if (allOn) {
      set('permissions', form.permissions.filter(p => !keys.includes(p)))
    } else {
      set('permissions', [...new Set([...form.permissions, ...keys])])
    }
  }

  const entityRequired = form.role !== 'admin'

  const canNext = () => {
    if (step === 1) {
      return form.name.trim() && form.email.trim() && form.phone.trim() &&
        form.password.length >= 6 && form.password === form.confirmPassword
    }
    if (step === 2) return form.permissions.length > 0
    if (step === 3) return !entityRequired || !!form.entityId
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canNext()) return
    setSaving(true)
    setApiError('')
    const { confirmPassword, ...rest } = form
    const result = await onAdd(rest)
    setSaving(false)
    if (result?.error) { setApiError(result.error); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-white">إضافة مستخدم جديد</h2>
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">الخطوة {step} من {STEPS.length} · {STEPS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-1.5 flex-shrink-0">
          {STEPS.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i + 1 <= step ? 'bg-blue-600' : 'bg-slate-100 dark:bg-gray-800'}`} />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Step 1: Personal info */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">الاسم الكامل *</label>
                    <input className={inputCls} placeholder="محمد السلمي" value={form.name}
                      onChange={e => set('name', e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">رقم الجوال *</label>
                    <input className={inputCls} placeholder="05XXXXXXXX" value={form.phone}
                      onChange={e => set('phone', e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">البريد الإلكتروني *</label>
                  <input className={inputCls} type="email" placeholder="name@albaha.gov.sa" value={form.email}
                    onChange={e => set('email', e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">
                    كلمة المرور * <span className="text-slate-400 dark:text-gray-600 font-normal">(6 أحرف على الأقل)</span>
                  </label>
                  <div className="relative">
                    <input className={inputCls} type={showPass ? 'text' : 'password'}
                      placeholder="••••••••" value={form.password}
                      onChange={e => set('password', e.target.value)} required />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 text-xs">
                      {showPass ? 'إخفاء' : 'إظهار'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">تأكيد كلمة المرور *</label>
                  <input className={`${inputCls} ${form.confirmPassword && form.confirmPassword !== form.password ? 'border-red-400 focus:border-red-400' : ''}`}
                    type={showPass ? 'text' : 'password'} placeholder="••••••••"
                    value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} required />
                  {form.confirmPassword && form.confirmPassword !== form.password && (
                    <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
                  )}
                </div>
              </>
            )}

            {/* Step 2: Role + Permissions */}
            {step === 2 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-2">الدور الوظيفي *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(roleConfig).map(([k, v]) => (
                      <label key={k} className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all
                        ${form.role === k ? `${v.bg} ${v.border} ${v.color}` : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                        <input type="radio" name="role" className="sr-only" checked={form.role === k}
                          onChange={() => handleRoleChange(k)} />
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.role === k ? 'border-current' : 'border-slate-300 dark:border-gray-600'}`}>
                          {form.role === k && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </div>
                        <span className="text-xs font-medium">{v.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-600 dark:text-gray-400">الصلاحيات ({form.permissions.length}/{Object.keys(PERMISSIONS).length})</label>
                    <button type="button" onClick={() => set('permissions', form.permissions.length === Object.keys(PERMISSIONS).length ? [] : Object.keys(PERMISSIONS))}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      {form.permissions.length === Object.keys(PERMISSIONS).length ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => {
                      const allOn = keys.every(k => form.permissions.includes(k))
                      const someOn = keys.some(k => form.permissions.includes(k))
                      return (
                        <div key={group} className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          <button type="button" onClick={() => toggleGroup(keys)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold transition-colors
                              ${allOn ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'bg-slate-50 dark:bg-gray-800 text-slate-600 dark:text-gray-400'}`}>
                            <span>{group}</span>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                              ${allOn ? 'bg-blue-600 border-blue-600' : someOn ? 'border-blue-400 bg-blue-100 dark:bg-blue-500/20' : 'border-slate-300 dark:border-gray-600'}`}>
                              {allOn && <Check size={10} className="text-white" />}
                              {someOn && !allOn && <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />}
                            </div>
                          </button>
                          <div className="divide-y divide-slate-100 dark:divide-gray-800">
                            {keys.map(perm => (
                              <label key={perm} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors">
                                <input type="checkbox" checked={form.permissions.includes(perm)}
                                  onChange={() => togglePermission(perm)} className="sr-only" />
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                                  ${form.permissions.includes(perm) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-gray-600'}`}>
                                  {form.permissions.includes(perm) && <Check size={9} className="text-white" />}
                                </div>
                                <span className="text-xs text-slate-600 dark:text-gray-300">{PERMISSIONS[perm]}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Entity */}
            {step === 3 && (
              <>
                {entityRequired && (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      الجهة التنظيمية إلزامية للأدوار غير الإدارية. لا يمكن إنشاء مستخدم بدون تبعية تنظيمية.
                    </p>
                  </div>
                )}

                {entities.length === 0 ? (
                  <div className="text-center py-8">
                    <Building2 size={32} className="mx-auto mb-3 text-slate-300 dark:text-gray-600" />
                    <p className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">لا توجد جهات تنظيمية</p>
                    <p className="text-xs text-slate-400 dark:text-gray-600">
                      {entityRequired
                        ? 'أضف جهات من صفحة الهيكل التنظيمي أولاً قبل إنشاء مستخدمين.'
                        : 'أضف جهات من صفحة الهيكل التنظيمي، أو تابع بدون جهة للدور الإداري.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-2">
                      الجهة التنظيمية {entityRequired ? '*' : ''}
                    </label>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {!entityRequired && (
                        <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                          ${!form.entityId ? 'border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-800' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                          <input type="radio" name="entity" className="sr-only" checked={!form.entityId}
                            onChange={() => { set('entityId', ''); set('entityName', '') }} />
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${!form.entityId ? 'border-slate-500 bg-slate-500' : 'border-slate-300 dark:border-gray-600'}`} />
                          <span className="text-sm text-slate-500 dark:text-gray-400">— بدون تحديد جهة (إداري فقط) —</span>
                        </label>
                      )}
                      {entities.map(ent => (
                        <label key={ent.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                          ${form.entityId === ent.id ? 'border-blue-400 dark:border-blue-500/60 bg-blue-50 dark:bg-blue-500/10' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-800/50'}`}>
                          <input type="radio" name="entity" className="sr-only" checked={form.entityId === ent.id}
                            onChange={() => { set('entityId', ent.id); set('entityName', ent.name) }} />
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${form.entityId === ent.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300 dark:border-gray-600'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">{ent.name}</p>
                            {ent.description && <p className="text-xs text-slate-400 dark:text-gray-600 truncate">{ent.description}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4 space-y-2 border border-slate-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">ملخص المستخدم الجديد</p>
                  {[
                    [<User size={11} />, form.name, 'font-medium'],
                    [<Mail size={11} />, form.email, ''],
                    [<Phone size={11} />, form.phone, ''],
                    [<Shield size={11} />, roleConfig[form.role]?.label, ''],
                    [<Key size={11} />, `${form.permissions.length} صلاحية`, ''],
                    [<Building2 size={11} />, form.entityName || (entityRequired ? <span className="text-red-500">— جهة مطلوبة —</span> : '— بدون جهة —'), ''],
                  ].map(([Icon, val, cls], i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                      <span className="text-slate-400 dark:text-gray-500">{Icon}</span>
                      <span className={cls}>{val}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-2 px-6 py-4 border-t border-slate-100 dark:border-gray-800 flex-shrink-0">
            {apiError && (
              <p className="text-xs text-red-500 dark:text-red-400 text-center bg-red-50 dark:bg-red-500/10 rounded-lg py-2 px-3">
                {apiError}
              </p>
            )}
            <div className="flex gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(s => s - 1)}
                className="py-2.5 px-4 rounded-lg border border-slate-200 dark:border-gray-700 text-sm font-medium text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
                السابق
              </button>
            )}
            {step < STEPS.length ? (
              <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                التالي
              </button>
            ) : (
              <button type="submit" disabled={!canNext() || saving}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                إنشاء المستخدم
              </button>
            )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Deactivate Confirmation Modal ────────────────────────────────────────────
function DeactivateModal({ target, openCount, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const role = roleConfig[target.role] || roleConfig.monitor

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <UserX size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 dark:text-white">تعطيل حساب المستخدم</p>
            <p className="text-xs text-slate-500 dark:text-gray-500">سيُمنع من تسجيل الدخول فوراً</p>
          </div>
        </div>

        {/* User details */}
        <div className="bg-slate-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
          {[
            [<User size={12} />, 'الاسم', target.name],
            [<Mail size={12} />, 'البريد', target.email],
            [<Shield size={12} />, 'الدور', role.label],
            [<Building2 size={12} />, 'الجهة', target.entity || '—'],
          ].map(([Icon, label, value]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 dark:text-gray-500 w-4">{Icon}</span>
              <span className="text-slate-500 dark:text-gray-500 w-16 flex-shrink-0">{label}:</span>
              <span className="text-slate-700 dark:text-gray-200 font-medium truncate">{value}</span>
            </div>
          ))}
        </div>

        {openCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              لديه <strong>{openCount}</strong> بلاغ مفتوح مسند إليه. يجب إعادة إسناد هذه البلاغات بعد التعطيل.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">
            سبب التعطيل <span className="text-slate-400 dark:text-gray-600 font-normal">(اختياري)</span>
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="انتهاء العقد، مغادرة الخدمة، مخالفة الإجراءات..."
            className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-red-400 resize-none" />
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
            إلغاء
          </button>
          <button onClick={() => onConfirm(reason)}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <UserX size={14} />
            تعطيل الحساب
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ target, actorRole, entities, onSave, onClose }) {
  const [form, setForm] = useState({
    name:        target.name || '',
    email:       target.email || '',
    phone:       target.phone || '',
    role:        target.role || 'monitor',
    permissions: [...(target.permissions || [])],
    entityId:    target.entityId || '',
    entityName:  target.entity || '',
  })
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleRoleChange = (role) => {
    set('role', role)
    set('permissions', [...ROLE_DEFAULT_PERMISSIONS[role]])
  }

  const togglePermission = (perm) => {
    set('permissions',
      form.permissions.includes(perm)
        ? form.permissions.filter(p => p !== perm)
        : [...form.permissions, perm]
    )
  }

  const toggleGroup = (keys) => {
    const allOn = keys.every(k => form.permissions.includes(k))
    set('permissions', allOn
      ? form.permissions.filter(p => !keys.includes(p))
      : [...new Set([...form.permissions, ...keys])])
  }

  // Manager cannot escalate to admin/executive
  const blockedRoles = actorRole === 'manager' ? ['admin', 'executive'] : []
  const internalEntities = entities.filter(e => e.type !== 'external')
  const entityRequired = form.role !== 'admin'
  const canSave = form.name.trim() && form.email.trim() && (!entityRequired || form.entityName || form.entityId)

  const handleSave = async () => {
    if (blockedRoles.includes(form.role)) return
    setSaving(true)
    setApiError('')
    const result = await onSave({
      name:        form.name.trim(),
      email:       form.email.trim(),
      phone:       form.phone.trim(),
      role:        form.role,
      permissions: form.permissions,
      entity:      form.entityName || form.entityId,
      entityId:    form.entityId || null,
    })
    setSaving(false)
    if (result?.error) { setApiError(result.error); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
              <Pencil size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">تعديل بيانات المستخدم</h3>
              <p className="text-xs text-slate-400 dark:text-gray-500">{target.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">

          {/* Personal info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">المعلومات الشخصية</p>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">الاسم الكامل *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="الاسم الكامل" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">البريد الإلكتروني *</label>
                <input value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="example@albaha.gov.sa" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">رقم الهاتف</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="05xxxxxxxx" />
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">الدور الوظيفي</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(roleConfig).map(([r, cfg]) => {
                const blocked = blockedRoles.includes(r)
                return (
                  <button key={r} disabled={blocked} onClick={() => handleRoleChange(r)}
                    className={`rounded-xl border py-2.5 text-xs font-medium transition-all ${
                      form.role === r
                        ? `${cfg.bg} ${cfg.border} ${cfg.color} border-2`
                        : blocked
                          ? 'border-slate-100 dark:border-gray-800 text-slate-300 dark:text-gray-700 cursor-not-allowed'
                          : 'border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600'
                    }`}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            {blockedRoles.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Lock size={10} /> لا يمكن للمدير تعيين أدوار أعلى من صلاحياته
              </p>
            )}
          </div>

          {/* Entity */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">
              الجهة التنظيمية {entityRequired && <span className="text-red-500">*</span>}
            </p>
            <select value={form.entityId} onChange={e => {
              const ent = entities.find(x => x.id === e.target.value)
              set('entityId', e.target.value)
              set('entityName', ent?.name || e.target.value)
            }} className={inputCls}>
              {!entityRequired && <option value="">— بدون جهة (مدير النظام) —</option>}
              {internalEntities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide">الصلاحيات</p>
            {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
              <div key={group} className="bg-slate-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{group}</p>
                  <button onClick={() => toggleGroup(keys)}
                    className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                      keys.every(k => form.permissions.includes(k))
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-600'
                    }`}>
                    {keys.every(k => form.permissions.includes(k)) ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {keys.map(k => (
                    <button key={k} onClick={() => togglePermission(k)}
                      className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border text-right transition-all ${
                        form.permissions.includes(k)
                          ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
                          : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600'
                      }`}>
                      <div className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                        form.permissions.includes(k) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-gray-600'
                      }`}>
                        {form.permissions.includes(k) && <Check size={8} className="text-white" />}
                      </div>
                      <span className="truncate">{PERMISSIONS[k]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-slate-100 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
          {apiError && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center bg-red-50 dark:bg-red-500/10 rounded-lg py-2 px-3">
              {apiError}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 border border-slate-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
              إلغاء
            </button>
            <button onClick={handleSave} disabled={!canSave || saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              حفظ التعديلات
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── User View Modal ───────────────────────────────────────────────────────────
function UserViewModal({ user, reports, onClose }) {
  const role = roleConfig[user.role] || roleConfig.monitor
  const assigned = reports.filter(r => r.assignedTo === user.id)
  const open = assigned.filter(r => !['closed_final', 'rejected'].includes(r.status))
  const closed = assigned.filter(r => r.status === 'closed_final')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800">
          <h3 className="font-bold text-slate-800 dark:text-white">ملف المستخدم</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg ${user.status === 'inactive' ? 'opacity-50' : ''}`}>
              {user.avatar || user.name?.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-slate-800 dark:text-white truncate">{user.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={`inline-flex text-xs px-2.5 py-0.5 rounded-full border font-medium ${role.bg} ${role.color} ${role.border}`}>
                  {role.label}
                </span>
                {user.status === 'inactive' && (
                  <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                    معطّل
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Deactivation info */}
          {user.status === 'inactive' && user.deletedAt && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400">
                تاريخ التعطيل: {new Date(user.deletedAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          )}

          {/* Contact */}
          <div className="grid grid-cols-1 gap-2">
            {[
              [<Mail size={13} />, user.email],
              [<Phone size={13} />, user.phone],
              [<Building2 size={13} />, user.entity || '— بدون جهة —'],
            ].map(([Icon, val], i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-gray-300">
                <span className="text-slate-400 dark:text-gray-500 flex-shrink-0">{Icon}</span>
                <span className="truncate">{val}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['المفتوح', open.length, 'text-amber-600 dark:text-amber-400'],
              ['المغلق', closed.length, 'text-emerald-600 dark:text-emerald-400'],
              ['الكل', assigned.length, 'text-blue-600 dark:text-blue-400'],
            ].map(([l, v, cls]) => (
              <div key={l} className="bg-slate-50 dark:bg-gray-800 rounded-xl py-3">
                <div className={`text-xl font-black ${cls}`}>{v}</div>
                <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">{l}</div>
              </div>
            ))}
          </div>

          {/* Permissions */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              الصلاحيات ({(user.permissions || []).length})
            </p>
            {user.role === 'admin' && (user.permissions || []).length === 15 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">جميع الصلاحيات (مدير النظام)</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => {
                  const granted = keys.filter(k => (user.permissions || []).includes(k))
                  if (!granted.length) return null
                  return (
                    <div key={group}>
                      <p className="text-xs text-slate-400 dark:text-gray-600 mb-1">{group}</p>
                      <div className="flex flex-wrap gap-1">
                        {granted.map(k => (
                          <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                            {PERMISSIONS[k]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 dark:text-gray-600">تاريخ الانضمام: {user.joinDate}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Users() {
  const { users, usersLoading, reports, entities, addUser, updateUser, deleteUser, reactivateUser } = useData()
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)

  // RBAC: only users with manage_users permission can modify
  const canManage = useMemo(
    () => !!(currentUser?.permissions?.includes('manage_users') || currentUser?.role === 'admin'),
    [currentUser]
  )

  const getUserStats = (userId) => {
    const assigned = reports.filter(r => r.assignedTo === userId)
    return {
      open: assigned.filter(r => !['closed_final', 'rejected'].includes(r.status)).length,
      closed: assigned.filter(r => r.status === 'closed_final').length,
    }
  }

  // Manager sees only users within their own entity (RBAC scope)
  const visibleUsers = useMemo(() => {
    if (currentUser?.role === 'manager') {
      const myEntity = currentUser.entity || ''
      return myEntity
        ? users.filter(u => u.entity === myEntity || u.id === currentUser.id)
        : users
    }
    return users
  }, [users, currentUser])

  const activeUsers = useMemo(() => visibleUsers.filter(u => u.status !== 'inactive'), [visibleUsers])
  const inactiveUsers = useMemo(() => visibleUsers.filter(u => u.status === 'inactive'), [visibleUsers])

  const baseList = showInactive ? visibleUsers : activeUsers

  const filtered = baseList.filter(u => {
    if (search && !u.name?.includes(search) && !u.email?.includes(search) && !u.entity?.includes(search)) return false
    if (filterRole !== 'all' && u.role !== filterRole) return false
    return true
  })

  const handleDeactivateConfirm = async () => {
    if (!confirmDeactivate) return
    await deleteUser(confirmDeactivate.id)
    setConfirmDeactivate(null)
  }

  const handleReactivate = async (u) => {
    await reactivateUser(u.id)
  }

  if (usersLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="mr-3 text-sm text-slate-400 dark:text-gray-500">جاري تحميل المستخدمين...</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {showAdd && canManage && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onAdd={(data) => addUser(data)}
          entities={entities}
        />
      )}
      {viewingUser && (
        <UserViewModal
          user={viewingUser}
          reports={reports}
          onClose={() => setViewingUser(null)}
        />
      )}
      {confirmDeactivate && (
        <DeactivateModal
          target={confirmDeactivate}
          openCount={getUserStats(confirmDeactivate.id).open}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}
      {editingUser && (
        <EditUserModal
          target={editingUser}
          actorRole={currentUser?.role}
          entities={entities}
          onSave={(patch) => updateUser(editingUser.id, patch)}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">إدارة المستخدمين</h1>
            {currentUser?.role === 'manager' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                <Lock size={9} />
                نطاق: {currentUser.entity || 'جهتك'}
              </span>
            )}
          </div>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">
            {activeUsers.length} نشط
            {inactiveUsers.length > 0 && ` · ${inactiveUsers.length} معطّل`}
            {' · '}
            {activeUsers.filter(u => getUserStats(u.id).open > 0).length} لديهم بلاغات مفتوحة
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inactiveUsers.length > 0 && (
            <button onClick={() => setShowInactive(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${showInactive ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400' : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600'}`}>
              {showInactive ? <Eye size={13} /> : <EyeOff size={13} />}
              {showInactive ? 'إخفاء المعطّلين' : `عرض المعطّلين (${inactiveUsers.length})`}
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
              <Plus size={15} />
              مستخدم جديد
            </button>
          )}
          {!canManage && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-600 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <Lock size={11} />
              عرض فقط
            </div>
          )}
        </div>
      </div>

      {/* Role filter cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(roleConfig).map(([role, cfg]) => {
          const count = activeUsers.filter(u => u.role === role).length
          return (
            <button key={role} onClick={() => setFilterRole(filterRole === role ? 'all' : role)}
              className={`${card} rounded-xl p-4 text-center transition-all hover:border-blue-300 dark:hover:border-blue-500/50
                ${filterRole === role ? `${cfg.bg} ${cfg.border}` : ''}`}>
              <div className={`text-2xl font-black ${cfg.color}`}>{count}</div>
              <div className="text-xs text-slate-500 dark:text-gray-500 mt-1">{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className={`${card} rounded-xl p-3`}>
        <input type="text" placeholder="بحث بالاسم أو البريد أو الجهة..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className={`${card} rounded-xl py-16 text-center`}>
          <User size={40} className="mx-auto mb-3 text-slate-300 dark:text-gray-600" />
          <p className="text-slate-400 dark:text-gray-500 font-medium mb-1">لا يوجد مستخدمون</p>
          {canManage && (
            <button onClick={() => setShowAdd(true)}
              className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              إضافة مستخدم
            </button>
          )}
        </div>
      )}

      {/* Users grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(u => {
          const role = roleConfig[u.role] || roleConfig.monitor
          const { open, closed } = getUserStats(u.id)
          const total = open + closed
          const rate = total ? Math.round((closed / total) * 100) : 0
          const isInactive = u.status === 'inactive'

          return (
            <div key={u.id} className={`${card} rounded-xl p-5 transition-all hover:border-slate-300 dark:hover:border-gray-700 ${isInactive ? 'opacity-60' : ''}`}>
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isInactive ? 'grayscale' : ''}`}>
                  {u.avatar || u.name?.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-white truncate">{u.name}</p>
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5 truncate">{u.entity || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isInactive
                        ? <UserX size={12} className="text-red-400" />
                        : <div className={`w-2 h-2 rounded-full ${open > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Role + status */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={`inline-flex text-xs px-2.5 py-0.5 rounded-full border font-medium ${role.bg} ${role.color} ${role.border}`}>
                  {role.label}
                </span>
                <span className="text-xs text-slate-400 dark:text-gray-600 flex items-center gap-1">
                  <Key size={10} />
                  {u.permissions?.includes('all') ? 'كل الصلاحيات' : `${(u.permissions || []).length} صلاحية`}
                </span>
                {isInactive && (
                  <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                    معطّل
                  </span>
                )}
              </div>

              {!isInactive && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    {[
                      ['مفتوح', open, open > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-gray-400'],
                      ['مغلق', closed, 'text-emerald-600 dark:text-emerald-400'],
                      ['الأداء', `${rate}%`, rate >= 85 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'],
                    ].map(([l, v, cls]) => (
                      <div key={l} className="bg-slate-50 dark:bg-gray-800 rounded-lg py-2">
                        <div className={`text-base font-bold ${cls}`}>{v}</div>
                        <div className="text-xs text-slate-400 dark:text-gray-500">{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-gray-800 rounded-full h-1 mb-3">
                    <div className="h-1 rounded-full transition-all"
                      style={{ width: `${rate}%`, background: rate >= 85 ? '#10B981' : rate >= 70 ? '#F59E0B' : '#EF4444' }} />
                  </div>
                </>
              )}

              {/* Contact */}
              <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-gray-600 mb-3 truncate">
                <span className="flex items-center gap-1 truncate"><Mail size={10} />{u.email}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setViewingUser(u)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs border border-slate-200 dark:border-gray-700 rounded-lg text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors font-medium">
                  <Eye size={12} />عرض
                </button>

                {canManage && !isInactive && (
                  <button onClick={() => setEditingUser(u)}
                    className="flex items-center justify-center gap-1 py-1.5 px-3 text-xs border border-blue-200 dark:border-blue-500/30 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors font-medium">
                    <Pencil size={12} />تعديل
                  </button>
                )}

                {canManage && (
                  isInactive ? (
                    <button onClick={() => handleReactivate(u)}
                      className="flex items-center justify-center gap-1 py-1.5 px-3 text-xs border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium">
                      <UserCheck size={12} />تفعيل
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDeactivate(u)}
                      className="flex items-center justify-center gap-1 py-1.5 px-3 text-xs border border-red-200 dark:border-red-500/30 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-medium">
                      <UserX size={12} />تعطيل
                    </button>
                  )
                )}

                {!canManage && (
                  <span className="py-1.5 px-3 text-xs text-slate-400 dark:text-gray-600 flex items-center gap-1">
                    <Lock size={11} />قراءة فقط
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Governance note */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 text-xs font-bold">GV</div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">سياسة حوكمة المستخدمين</p>
          <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
            مدير النظام محمي من التعطيل · الحسابات لا تُحذف نهائياً (تعطيل قابل للعكس) ·
            الجهة التنظيمية إلزامية للأدوار غير الإدارية · جميع العمليات مسجّلة في سجل التدقيق
          </p>
        </div>
      </div>
    </div>
  )
}
