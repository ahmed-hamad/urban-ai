import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const { isAuthenticated } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const sw = collapsed ? '70px' : '260px'

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 transition-colors duration-200" dir="rtl">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <Header sidebarWidth={sw} />
      <main className="pt-16 min-h-screen transition-all duration-300" style={{ marginRight: sw }}>
        <div className="p-5 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
