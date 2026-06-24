import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import DashboardLayout from './layouts/DashboardLayout'
import AuthLayout      from './layouts/AuthLayout'
import Login           from './pages/Login'
import Register        from './pages/Register'
import Dashboard       from './pages/Dashboard'
import Packages        from './pages/Packages'
import Withdraw        from './pages/Withdraw'
import Vouchers        from './pages/Vouchers'
import Transactions    from './pages/Transactions'
import Routers         from './pages/Routers'
import CaptivePortal   from './pages/CaptivePortal'
import Placeholder     from './pages/Placeholder'
import Categories      from './pages/Categories'
import Settings        from './pages/Settings'
import Messages        from './pages/Messages'
import ActiveUsers     from './pages/ActiveUsers'

function PrivateRoute({ children }) {
  const { admin, booting } = useAuth()
  if (booting) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return admin ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
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
            <Route path="/withdraw"     element={<Withdraw />} />
            <Route path="/categories"   element={<Categories />} />
            <Route path="/vouchers"     element={<Vouchers />} />
            <Route path="/payments"     element={<Transactions />} />
            <Route path="/routers"      element={<Routers />} />
            <Route path="/settings"     element={<Settings />} />
            <Route path="/messages"     element={<Messages />} />
            <Route path="/active-users" element={<ActiveUsers />} />

            {/* Placeholder routes for future modules */}
            <Route path="/users"        element={<Placeholder title="Users"         icon="Users" />} />
            <Route path="/tickets"      element={<Placeholder title="Tickets"       icon="Ticket" />} />
            <Route path="/invoices"     element={<Placeholder title="Invoices"      icon="FileText" />} />
            <Route path="/expenses"     element={<Placeholder title="Expenses"      icon="DollarSign" />} />
            <Route path="/messages"     element={<Placeholder title="Messages"      icon="MessageSquare" />} />
            <Route path="/emails"       element={<Placeholder title="Emails"        icon="Mail" />} />
            <Route path="/campaigns"    element={<Placeholder title="Campaigns"     icon="Megaphone" />} />
            <Route path="/equipment"    element={<Placeholder title="Equipment"     icon="Wrench" />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
