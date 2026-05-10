import { useState } from 'react'
import { Building2, Plus, ChevronDown, ChevronRight, X, Edit2, Trash2, Globe } from 'lucide-react'
import { useData } from '@/context/DataContext'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'
const inputCls = 'w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors'

const TYPE_CONFIG = {
  amana:        { label: 'أمانة',        color: 'bg-blue-600',    text: 'text-blue-600 dark:text-blue-400',   badge: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30',   icon: '🏛️' },
  municipality: { label: 'بلدية',        color: 'bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30', icon: '🏢' },
  agency:       { label: 'وكالة',        color: 'bg-purple-600',  text: 'text-purple-600 dark:text-purple-400',  badge: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30',  icon: '🏗️' },
  department:   { label: 'إدارة / قسم', color: 'bg-amber-600',   text: 'text-amber-600 dark:text-amber-400',   badge: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',   icon: '📋' },
  external:     { label: 'جهة خارجية',  color: 'bg-slate-600',   text: 'text-slate-600 dark:text-slate-400',   badge: 'bg-slate-50 dark:bg-slate-500/10 border-slate-200 dark:border-slate-600/30',   icon: '🌐' },
}

const PARENT_ALLOWED = {
  amana:        [],
  municipality: ['amana'],
  agency:       ['amana', 'municipality'],
  department:   ['municipality', 'agency'],
  external:     [],
}

function EntityBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.department
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.badge} ${cfg.text}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function TreeNode({ entity, entities, depth = 0, onEdit, onDelete, expandedIds, toggleExpand }) {
  const children = entities.filter(e => e.parentId === entity.id)
  const isExpanded = expandedIds.has(entity.id)
  const cfg = TYPE_CONFIG[entity.type] || TYPE_CONFIG.department

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800/50 group transition-colors`}
        style={{ paddingRight: `${12 + depth * 20}px` }}
      >
        <button onClick={() => toggleExpand(entity.id)} className="w-5 h-5 flex items-center justify-center text-slate-400 flex-shrink-0">
          {children.length > 0 ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-3 h-px bg-slate-300 dark:bg-gray-700 block" />}
        </button>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">{entity.name}</p>
          {entity.description && <p className="text-xs text-slate-400 dark:text-gray-600 truncate">{entity.description}</p>}
        </div>
        <EntityBadge type={entity.type} />
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(entity)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-500 dark:hover:text-blue-400">
            <Edit2 size={12} />
          </button>
          <button onClick={() => onDelete(entity.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 dark:hover:text-red-400">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {isExpanded && children.map(child => (
        <TreeNode key={child.id} entity={child} entities={entities} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} expandedIds={expandedIds} toggleExpand={toggleExpand} />
      ))}
    </div>
  )
}

function EntityModal({ entity, entities, onClose, onSave }) {
  const isEdit = !!entity?.id
  const [form, setForm] = useState(entity || { name: '', type: 'municipality', parentId: '', description: '', phone: '', email: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const allowedParentTypes = PARENT_ALLOWED[form.type] || []
  const parentOptions = entities.filter(e => allowedParentTypes.includes(e.type) && e.id !== entity?.id)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${card} rounded-2xl w-full max-w-lg shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-gray-800">
          <h2 className="font-bold text-slate-800 dark:text-white">
            {isEdit ? 'تعديل الجهة' : 'إضافة جهة جديدة'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-2">نوع الجهة *</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                <label key={k} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${form.type === k ? `${v.badge} ${v.text} font-medium` : 'border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800'}`}>
                  <input type="radio" name="type" className="sr-only" checked={form.type === k}
                    onChange={() => { set('type', k); set('parentId', '') }} />
                  <span>{v.icon}</span>
                  <span>{v.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">اسم الجهة *</label>
            <input className={inputCls} placeholder={`مثال: بلدية شمال الباحة`}
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          {/* Parent */}
          {allowedParentTypes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">تابع لـ</label>
              <select className={inputCls} value={form.parentId} onChange={e => set('parentId', e.target.value)}>
                <option value="">— مستقل —</option>
                {parentOptions.map(e => (
                  <option key={e.id} value={e.id}>{TYPE_CONFIG[e.type]?.icon} {e.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">الوصف (اختياري)</label>
            <input className={inputCls} placeholder="وصف مختصر للجهة"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">الهاتف</label>
              <input className={inputCls} placeholder="017XXXXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">البريد الإلكتروني</label>
              <input className={inputCls} type="email" placeholder="name@albaha.gov.sa" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-gray-800">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-gray-700 text-sm font-medium text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
              إلغاء
            </button>
            <button type="submit"
              className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              {isEdit ? 'حفظ التعديلات' : 'إضافة الجهة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Entities() {
  const { entities, addEntity, updateEntity, deleteEntity } = useData()
  const [showModal, setShowModal] = useState(false)
  const [editingEntity, setEditingEntity] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [search, setSearch] = useState('')

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedIds(new Set(entities.map(e => e.id)))
  const collapseAll = () => setExpandedIds(new Set())

  const handleSave = (form) => {
    if (editingEntity?.id) {
      updateEntity(editingEntity.id, form)
    } else {
      addEntity(form)
    }
    setEditingEntity(null)
  }

  const handleEdit = (entity) => {
    setEditingEntity(entity)
    setShowModal(true)
  }

  const handleDelete = (id) => {
    const hasChildren = entities.some(e => e.parentId === id)
    if (hasChildren) {
      alert('لا يمكن حذف جهة تحتوي على تفريعات. احذف الفروع أولاً.')
      return
    }
    deleteEntity(id)
  }

  const handleOpenAdd = () => {
    setEditingEntity(null)
    setShowModal(true)
  }

  const filtered = search
    ? entities.filter(e => e.name.includes(search) || e.description?.includes(search))
    : entities

  const roots = filtered.filter(e => !e.parentId || !entities.find(p => p.id === e.parentId))
  const orphans = filtered.filter(e => e.parentId && entities.find(p => p.id === e.parentId))

  const typeStats = Object.entries(TYPE_CONFIG).map(([type, cfg]) => ({
    type, cfg, count: entities.filter(e => e.type === type).length,
  }))

  return (
    <div className="space-y-5">
      {(showModal || editingEntity) && (
        <EntityModal
          entity={editingEntity}
          entities={entities}
          onClose={() => { setShowModal(false); setEditingEntity(null) }}
          onSave={handleSave}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">الهيكل التنظيمي</h1>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">{entities.length} جهة · الجهات الداخلية والخارجية</p>
        </div>
        <button onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={15} />
          إضافة جهة
        </button>
      </div>

      {/* Type stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {typeStats.map(({ type, cfg, count }) => (
          <div key={type} className={`${card} rounded-xl p-4 text-center`}>
            <div className="text-2xl mb-1">{cfg.icon}</div>
            <div className={`text-2xl font-black ${cfg.text}`}>{count}</div>
            <div className="text-xs text-slate-500 dark:text-gray-500 mt-1">{cfg.label}</div>
          </div>
        ))}
      </div>

      {/* Tree panel */}
      <div className={`${card} rounded-xl overflow-hidden`}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-gray-800 flex-wrap">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الجهات..."
            className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-64"
          />
          <div className="flex gap-2 mr-auto">
            <button onClick={expandAll} className="text-xs text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white transition-colors">توسيع الكل</button>
            <span className="text-slate-300 dark:text-gray-700">|</span>
            <button onClick={collapseAll} className="text-xs text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white transition-colors">طي الكل</button>
          </div>
        </div>

        {/* Tree */}
        <div className="p-2">
          {entities.length === 0 ? (
            <div className="text-center py-16">
              <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-gray-700" />
              <p className="text-slate-400 dark:text-gray-500 font-medium mb-1">لا توجد جهات بعد</p>
              <p className="text-slate-400 dark:text-gray-600 text-sm mb-4">ابدأ ببناء الهيكل التنظيمي لأمانة الباحة</p>
              <button onClick={handleOpenAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                إضافة أول جهة
              </button>
            </div>
          ) : search ? (
            filtered.map(e => (
              <div key={e.id} className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-800/50 group transition-colors">
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TYPE_CONFIG[e.type]?.color || 'bg-slate-500'}`} />
                <span className="text-sm font-medium text-slate-700 dark:text-gray-200 flex-1">{e.name}</span>
                <EntityBadge type={e.type} />
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(e)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-500"><Edit2 size={12} /></button>
                  <button onClick={() => handleDelete(e.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            ))
          ) : (
            roots.map(root => (
              <TreeNode key={root.id} entity={root} entities={entities} depth={0}
                onEdit={handleEdit} onDelete={handleDelete}
                expandedIds={expandedIds} toggleExpand={toggleExpand} />
            ))
          )}
        </div>
      </div>

      {/* Help */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">تسلسل الهيكل التنظيمي</p>
        <p className="text-xs text-slate-600 dark:text-gray-400 leading-relaxed">
          أمانة الباحة ← بلديات ← وكالات ← إدارات وأقسام · الجهات الخارجية (مياه، كهرباء، وزارات) مستقلة عن التسلسل الداخلي
        </p>
      </div>
    </div>
  )
}
