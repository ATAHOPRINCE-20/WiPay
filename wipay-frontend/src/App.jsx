import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import DashboardLayout from './layouts/DashboardLayout'
import AuthLayout      from './layouts/AuthLayout'
import Login           from './pages/Login'
import Dashboard       from './pages/Dashboard'
import Packages        from './pages/Packages'
import Vouchers        from './pages/Vouchers'
import Transactions    from './pages/Transactions'
import Routers         from './pages/Routers'
import CaptivePortal   from './pages/CaptivePortal'
import Placeholder     from './pages/Placeholder'
import Categories      from './pages/Categories'
import Settings        from './pages/Settings'
import Messages        from './pages/Messages'
import ActiveUsers     from './pages/ActiveUsers'
import SuperAdmin      from './pages/SuperAdmin'
import Agents          from './pages/Agents'
import PortalAds       from './pages/PortalAds'
import Subscription    from './pages/Subscription'
import WebConfigs      from './pages/WebConfigs'
import Downloads       from './pages/Downloads'
import Withdraw        from './pages/Withdraw'
import Register        from './pages/Register'

function PrivateRoute({ children, superAdminOnly = false }) {
  const { admin, booting } = useAuth()
  if (booting) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!admin) return <Navigate to="/login" replace />
  if (superAdminOnly && admin.role !== 'super_admin') return <Navigate to="/dashboard" replace />
  return children
}

import { ToastProvider } from './context/ToastContext'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>
          {/* Public captive portal (no auth) */}
          <Route path="/captive-portal" element={<CaptivePortal />} />

          {/* Auth pages */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Protected dashboard */}
          <Route
            element={
              <PrivateRoute>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/packages"     element={<Packages />} />
            <Route path="/categories"   element={<Categories />} />
            <Route path="/vouchers"     element={<Vouchers />} />
            <Route path="/payments"     element={<Transactions />} />
            <Route path="/routers"      element={<Routers />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/messages"     element={<Messages />} />
            <Route path="/active-users" element={<ActiveUsers />} />
            <Route path="/agents"       element={<Agents />} />
            <Route path="/portal-ads"   element={<PortalAds />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/web-configs"  element={<WebConfigs />} />
            <Route path="/downloads"    element={<Downloads />} />
            <Route path="/withdrawals"  element={<Withdraw />} />
            <Route path="/super-admin" element={
              <PrivateRoute superAdminOnly>
                <SuperAdmin />
              </PrivateRoute>
            } />

            {/* Placeholder routes for future modules */}
            <Route path="/users"        element={<Placeholder title="Users"         icon="Users" />} />
            <Route path="/tickets"      element={<Placeholder title="Tickets"       icon="Ticket" />} />
            <Route path="/invoices"     element={<Placeholder title="Invoices"      icon="FileText" />} />
            <Route path="/expenses"     element={<Placeholder title="Expenses"      icon="DollarSign" />} />
            <Route path="/emails"       element={<Placeholder title="Emails"        icon="Mail" />} />
            <Route path="/campaigns"    element={<Placeholder title="Campaigns"     icon="Megaphone" />} />
            <Route path="/equipment"    element={<Placeholder title="Equipment"     icon="Wrench" />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
