import { useState } from 'react'
import { FileText, ChevronDown, ChevronRight, Search, Download } from 'lucide-react'
import { regulationData } from '@/data/mockData'

const card = 'bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800'

const STAGES = ['المرحلة الأولى', 'المرحلة الثانية', 'المرحلة الثالثة']

const stageColors = {
  'المرحلة الأولى': 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  'المرحلة الثانية': 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
  'المرحلة الثالثة': 'bg-slate-50 dark:bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600/30',
}

export default function ViolationsManager() {
  const [search, setSearch] = useState('')
  const [activeStage, setActiveStage] = useState('الكل')
  const [expandedEl, setExpandedEl] = useState(null)
  const [expandedArticle, setExpandedArticle] = useState(null)

  const totalArticles = regulationData.reduce((s, el) => s + el.articles.length, 0)

  const filtered = regulationData.filter(el => {
    const stageMatch = activeStage === 'الكل' || el.stage === activeStage
    const searchMatch = !search || el.name.includes(search) ||
      el.articles.some(a => a.text.includes(search) || a.ref.includes(search))
    return stageMatch && searchMatch
  })

  const handleExport = () => {
    const rows = [['م', 'المرحلة', 'العنصر', 'بند المخالفة', 'لائحة الجزاءات', 'وحدة الرصد', 'المسؤول', 'التنبيه', 'مدى التأثير', 'المهلة', 'غرامة الأمانة (ريال)', 'غرامة البلدية (ريال)', 'العقوبة التبعية', 'التكرار']]
    regulationData.forEach(el => {
      el.articles.forEach(a => {
        rows.push([a.seq, el.stage, el.name, a.text, a.ref, a.unit, a.responsible, a.notice, a.severity, a.period, a.fineAmana, a.fineMunicipality, a.punishment, a.repeat])
      })
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'لائحة_التشوه_البصري.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">اللائحة والغرامات</h1>
          <p className="text-slate-500 dark:text-gray-500 text-sm mt-0.5">
            {regulationData.length} عنصراً · {totalArticles} بنداً · المصدر: VP_regulation.xlsx
          </p>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors">
          <Download size={14} />
          تصدير CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['إجمالي العناصر', regulationData.length, 'text-slate-800 dark:text-white'],
          ['إجمالي البنود', totalArticles, 'text-blue-600 dark:text-blue-400'],
          ['المراحل', STAGES.length, 'text-purple-600 dark:text-purple-400'],
          ['أعلى غرامة', '40,000 ﷼', 'text-amber-600 dark:text-amber-400'],
        ].map(([l, v, cls]) => (
          <div key={l} className={`${card} rounded-xl p-4`}>
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-1">{l}</p>
            <p className={`text-xl font-bold ${cls}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${card} rounded-xl p-3 flex flex-wrap items-center gap-3`}>
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في العناصر والبنود..."
            className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg pr-9 pl-3 py-1.5 text-sm text-slate-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-64" />
        </div>
        <div className="flex gap-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-0.5">
          {['الكل', ...STAGES].map(s => (
            <button key={s} onClick={() => setActiveStage(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${activeStage === s ? 'bg-white dark:bg-gray-700 text-slate-700 dark:text-white shadow-sm' : 'text-slate-500 dark:text-gray-400'}`}>
              {s === 'الكل' ? 'الكل' : s.replace('المرحلة ', 'م')}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 dark:text-gray-600 mr-auto">
          {filtered.length} عنصر · {filtered.reduce((s, el) => s + el.articles.length, 0)} بند
        </span>
      </div>

      {/* Elements table */}
      <div className={`${card} rounded-xl overflow-hidden`}>
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 dark:text-gray-600 py-12">لا توجد نتائج</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50 text-xs text-slate-500 dark:text-gray-500">
                <th className="text-right px-4 py-2.5 font-medium">العنصر</th>
                <th className="text-right px-4 py-2.5 font-medium w-28">المرحلة</th>
                <th className="text-right px-4 py-2.5 font-medium w-16">البنود</th>
                <th className="text-left px-4 py-2.5 font-medium w-36">أعلى غرامة (أمانة)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(el => {
                const isOpen = expandedEl === el.id
                return (
                  <ElRow key={el.id} el={el} isOpen={isOpen}
                    expandedArticle={expandedArticle}
                    onToggle={() => setExpandedEl(isOpen ? null : el.id)}
                    onArticleToggle={id => setExpandedArticle(expandedArticle === id ? null : id)}
                    stageColors={stageColors} />
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ElRow({ el, isOpen, expandedArticle, onToggle, onArticleToggle, stageColors }) {
  return (
    <>
      <tr onClick={onToggle}
        className="border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: el.color }} />
            <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{el.name}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stageColors[el.stage]}`}>
            {el.stage.replace('المرحلة ', 'م')}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-500 dark:text-gray-400">{el.articles.length}</td>
        <td className="px-4 py-3 text-left">
          <span className="text-amber-600 dark:text-amber-400 font-semibold text-sm">
            {el.maxFine > 0 ? el.maxFine.toLocaleString('ar-SA') + ' ﷼' : '—'}
          </span>
        </td>
        <td className="px-3 py-3 text-slate-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={5} className="bg-slate-50/80 dark:bg-gray-800/20 border-b border-slate-100 dark:border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 dark:text-gray-600 border-b border-slate-100 dark:border-gray-800">
                  <th className="text-right px-6 py-2 font-medium">بند المخالفة</th>
                  <th className="text-right px-3 py-2 font-medium w-20">لائحة</th>
                  <th className="text-right px-3 py-2 font-medium w-24">المسؤول</th>
                  <th className="text-right px-3 py-2 font-medium w-16">المهلة</th>
                  <th className="text-right px-3 py-2 font-medium w-20">التأثير</th>
                  <th className="text-left px-3 py-2 font-medium w-28">غرامة الأمانة</th>
                  <th className="text-left px-3 py-2 font-medium w-28">غرامة البلدية</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {el.articles.map(a => {
                  const artOpen = expandedArticle === a.id
                  const hasExtra = a.punishment && a.punishment !== 'لا يوجد' && a.punishment !== '—'
                  return (
                    <>
                      <tr key={a.id}
                        onClick={e => { e.stopPropagation(); if (hasExtra) onArticleToggle(a.id) }}
                        className={`hover:bg-white dark:hover:bg-gray-800/60 transition-colors ${hasExtra ? 'cursor-pointer' : ''}`}>
                        <td className="px-6 py-2.5 text-slate-700 dark:text-gray-200 leading-relaxed">{a.text}</td>
                        <td className="px-3 py-2.5 text-slate-400 dark:text-gray-600 font-mono">{a.ref}</td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-gray-400">{a.responsible}</td>
                        <td className="px-3 py-2.5 text-slate-500 dark:text-gray-400">{a.period}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${a.severity === 'جسيمة' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : a.severity === 'غير جسيمة' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                            {a.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-left font-semibold text-amber-600 dark:text-amber-400">
                          {a.fineAmana > 0 ? a.fineAmana.toLocaleString('ar-SA') + ' ﷼' : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-left text-slate-500 dark:text-gray-500">
                          {a.fineMunicipality > 0 ? a.fineMunicipality.toLocaleString('ar-SA') + ' ﷼' : '—'}
                        </td>
                        <td className="px-2 text-slate-300 dark:text-gray-700">
                          {hasExtra && (artOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
                        </td>
                      </tr>
                      {artOpen && (
                        <tr key={`${a.id}-extra`} className="bg-blue-50/50 dark:bg-blue-500/5">
                          <td colSpan={8} className="px-6 py-2">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-gray-400">
                              <span><span className="font-medium text-slate-400 dark:text-gray-600 ml-1">العقوبة التبعية:</span>{a.punishment}</span>
                              {a.repeat && a.repeat !== '—' && <span><span className="font-medium text-slate-400 dark:text-gray-600 ml-1">التكرار:</span>{a.repeat}</span>}
                              <span><span className="font-medium text-slate-400 dark:text-gray-600 ml-1">وحدة الرصد:</span>{a.unit}</span>
                              {a.notice && a.notice !== '—' && <span><span className="font-medium text-slate-400 dark:text-gray-600 ml-1">التنبيه:</span>{a.notice}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}
