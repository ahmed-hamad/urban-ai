import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ReportsBasket from './pages/ReportsBasket'
import ReportDetail from './pages/ReportDetail'
import GISMap from './pages/GISMap'
import Financial from './pages/Financial'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import ViolationsManager from './pages/ViolationsManager'
import MediaAnalysis from './pages/MediaAnalysis'
import ReportNew from './pages/ReportNew'
import Entities from './pages/Entities'
import IngestionQueue from './pages/IngestionQueue'
import GISImport from './pages/GISImport'
import GISIntakeQueue from './pages/GISIntakeQueue'

// Route-level RBAC guard — redirects to dashboard if role not authorized
function RequireRole({ roles, children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/reports" element={<ReportsBasket />} />
              <Route path="/reports/new" element={<ReportNew />} />
              <Route path="/reports/:id" element={<ReportDetail />} />
              <Route path="/map" element={<GISMap />} />
              <Route path="/analyze" element={<MediaAnalysis />} />
              <Route path="/violations" element={<ViolationsManager />} />
              <Route path="/financial" element={
                <RequireRole roles={['admin', 'executive', 'auditor', 'manager']}>
                  <Financial />
                </RequireRole>
              } />
              <Route path="/users" element={
                <RequireRole roles={['admin', 'executive', 'manager']}>
                  <Users />
                </RequireRole>
              } />
              <Route path="/entities" element={
                <RequireRole roles={['admin', 'executive', 'auditor', 'manager']}>
                  <Entities />
                </RequireRole>
              } />
              <Route path="/audit" element={
                <RequireRole roles={['admin', 'executive', 'auditor', 'manager', 'monitor']}>
                  <AuditLog />
                </RequireRole>
              } />
              <Route path="/ingestion" element={
                <RequireRole roles={['admin', 'executive', 'manager', 'monitor']}>
                  <IngestionQueue />
                </RequireRole>
              } />
              <Route path="/gis-import" element={
                <RequireRole roles={['admin', 'executive', 'manager']}>
                  <GISImport />
                </RequireRole>
              } />
              <Route path="/gis-intake" element={
                <RequireRole roles={['admin', 'executive', 'manager']}>
                  <GISIntakeQueue />
                </RequireRole>
              } />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
