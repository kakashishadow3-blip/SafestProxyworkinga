import { Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import AuthLayout from '@/components/layout/AuthLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import Overview from '@/components/sections/Overview'
import ProxyAccess from '@/components/sections/ProxyAccess'
import ApiManagement from '@/components/sections/ApiManagement'
import Plans from '@/components/sections/Plans'
import Billing from '@/components/sections/Billing'
import ProfileSection from '@/components/sections/ProfileSection'
import AdminPanel from '@/pages/admin/AdminPanel'
import AdminUserView from '@/pages/admin/AdminUserView'
import AuditLogs from '@/pages/admin/AuditLogs'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function AuthRedirect({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading…</div>
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<AuthRedirect><LoginPage /></AuthRedirect>} />
        <Route path="/signup" element={<AuthRedirect><SignupPage /></AuthRedirect>} />
      </Route>

      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="/" element={<Overview />} />
        <Route path="/proxy-access" element={<ProxyAccess />} />
        <Route path="/api-management" element={<ApiManagement />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/profile" element={<ProfileSection />} />
      </Route>

      <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
      <Route path="/admin/users/:userId" element={<AdminRoute><AdminUserView /></AdminRoute>} />
      <Route path="/admin/audit-logs" element={<AdminRoute><AuditLogs /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
