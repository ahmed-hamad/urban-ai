import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'

export default function Login() {
  const { isAuthenticated, loginWithPassword } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (isAuthenticated) return <Navigate to="/" replace />

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await loginWithPassword(form.email, form.password)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex" dir="rtl">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-gray-950 to-purple-900/30" />
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(59,130,246,0.15) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(139,92,246,0.15) 0%, transparent 50%)'
        }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-xl shadow-blue-500/30">
              عب
            </div>
            <div>
              <p className="font-bold text-white text-lg">أمانة الباحة</p>
              <p className="text-gray-400 text-sm">Albaha Municipality</p>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-6">
            <h1 className="text-4xl font-black text-white leading-tight">
              منصة الرصد<br />
              <span className="gradient-text">الذكي للمدينة</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed max-w-md">
              نظام متكامل لرصد ورقابة التشوهات البصرية في المدينة مدعوم بتقنيات الذكاء الاصطناعي
            </p>
            <div className="space-y-3">
              {[
                { icon: '📋', text: 'رصد وتصنيف المخالفات بدقة عالية' },
                { icon: '🔄', text: 'متابعة دورة حياة البلاغ من الرصد حتى الإغلاق' },
                { icon: '🗺️', text: 'عرض جغرافي تفاعلي لمواقع المخالفات' },
                { icon: '📊', text: 'تقارير وتحليلات مبنية على بيانات فعلية' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-gray-400">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-600">
            © 2024 أمانة الباحة · منصة الرصد الذكي · نظام رقابة التشوهات البصرية
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="w-full lg:w-[480px] flex flex-col justify-center px-8 lg:px-12 relative bg-gray-900">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="absolute top-6 left-6 w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-all"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <div className="max-w-sm mx-auto w-full">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">عب</div>
            <div>
              <p className="font-bold text-white">أمانة الباحة</p>
              <p className="text-gray-500 text-xs">منصة الرصد الذكي</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-black text-white mb-2">مرحباً بك 👋</h2>
            <p className="text-gray-400 text-sm">سجّل دخولك للوصول إلى النظام</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">البريد الإلكتروني</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="name@albaha.gov.sa"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">كلمة المرور</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm text-center">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>

          <div className="mt-8 text-xs text-gray-700 text-center space-y-1">
            <p>admin@albaha.gov.sa · admin@2024</p>
            <p>admin1@baha.com · Admin@1234</p>
          </div>
        </div>
      </div>
    </div>
  )
}
