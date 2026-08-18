import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import DashboardLayout from './layouts/DashboardLayout'
import AuthLayout      from './layouts/AuthLayout'
import DashboardSkeleton from './components/DashboardSkeleton'

function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageHasBeenRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-refreshed') || 'false'
    )

    try {
      const component = await componentImport()
      window.sessionStorage.setItem('page-has-been-refreshed', 'false')
      return component
    } catch (error) {
      if (!pageHasBeenRefreshed) {
        window.sessionStorage.setItem('page-has-been-refreshed', 'true')
        window.location.reload()
      }
      throw error
    }
  })
}

const Login         = lazyWithRetry(() => import('./pages/Login'))
const Register      = lazyWithRetry(() => import('./pages/Register'))
const Dashboard     = lazyWithRetry(() => import('./pages/Dashboard'))
const Packages      = lazyWithRetry(() => import('./pages/Packages'))
const Vouchers      = lazyWithRetry(() => import('./pages/Vouchers'))
const Transactions  = lazyWithRetry(() => import('./pages/Transactions'))
const Routers       = lazyWithRetry(() => import('./pages/Routers'))
const CaptivePortal = lazyWithRetry(() => import('./pages/CaptivePortal'))
const Placeholder   = lazyWithRetry(() => import('./pages/Placeholder'))
const Categories    = lazyWithRetry(() => import('./pages/Categories'))
const Settings      = lazyWithRetry(() => import('./pages/Settings'))
const Messages      = lazyWithRetry(() => import('./pages/Messages'))
const ActiveUsers   = lazyWithRetry(() => import('./pages/ActiveUsers'))
const SuperAdmin    = lazyWithRetry(() => import('./pages/SuperAdmin'))
const Agents        = lazyWithRetry(() => import('./pages/Agents'))
const PortalAds     = lazyWithRetry(() => import('./pages/PortalAds'))
const Subscription  = lazyWithRetry(() => import('./pages/Subscription'))
const WebConfigs    = lazyWithRetry(() => import('./pages/WebConfigs'))
const Withdraw      = lazyWithRetry(() => import('./pages/Withdraw'))
const AgentPortal   = lazyWithRetry(() => import('./pages/AgentPortal'))

function PrivateRoute({ children, superAdminOnly = false }) {
  const { admin, booting } = useAuth()
  if (booting) return <DashboardSkeleton />
  if (!admin) return <Navigate to="/login" replace />
  if (admin.role === 'agent' && window.location.pathname !== '/agent-portal') return <Navigate to="/agent-portal" replace />
  if (superAdminOnly && admin.role !== 'super_admin') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<DashboardSkeleton />}>
            <Routes>
              {/* Public captive portal (no auth) */}
              <Route path="/captive-portal" element={<CaptivePortal />} />
              <Route path="/portal" element={<CaptivePortal />} />

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
                <Route path="/downloads"    element={<Navigate to="/dashboard" replace />} />
                <Route path="/withdrawals"  element={<Withdraw />} />
                <Route path="/agent-portal" element={
                  <PrivateRoute>
                    <AgentPortal />
                  </PrivateRoute>
                } />
                <Route path="/super-admin" element={
                  <PrivateRoute superAdminOnly>
                    <SuperAdmin />
                  </PrivateRoute>
                } />

                {/* Placeholder routes for future modules */}
                <Route path="/users"        element={<Placeholder title="Users"         icon="Users" />} />
                <Route path="/tickets"      element={<Placeholder title="Tickets"       icon="Ticket" />} />
                <Route path="/invoices"     element={<Placeholder title="Invoices"      icon="FileText" />} />
                <Route path="/expenses"     element={<Placeholder title="Expenses"      icon="Banknote" />} />
                <Route path="/emails"       element={<Placeholder title="Emails"        icon="Mail" />} />
                <Route path="/campaigns"    element={<Placeholder title="Campaigns"     icon="Megaphone" />} />
                <Route path="/equipment"    element={<Placeholder title="Equipment"     icon="Wrench" />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
