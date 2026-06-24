import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardLayout() {
  const { admin } = useAuth()

  const expiry = admin?.subscription_expiry
    ? new Date(admin.subscription_expiry).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : null

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        <Header expiry={expiry} />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
