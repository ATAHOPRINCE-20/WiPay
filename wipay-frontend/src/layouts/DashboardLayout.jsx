import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardLayout() {
  const { admin, isImpersonating, exitImpersonation } = useAuth()
  const [isSidebarOpen, setSidebarOpen] = useState(false)

  const expiry = admin?.subscription_expiry
    ? new Date(admin.subscription_expiry).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : null

  return (
    <div className="flex min-h-screen bg-surface flex-col">
      {isImpersonating && (
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold shadow-md z-50 sticky top-0">
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">SUPER ADMIN IMPERSONATION</span>
            <span>Currently logged in as tenant: <strong>{admin?.username}</strong> ({admin?.business_name || 'Tenant'})</span>
          </div>
          <button 
            onClick={exitImpersonation}
            className="bg-white text-gray-900 hover:bg-amber-100 font-bold px-3 py-1 rounded-lg transition shadow-sm text-xs"
          >
            Exit & Return to Super Admin
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-screen">
        <Sidebar isOpen={isSidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex-1 md:ml-56 flex flex-col min-h-screen w-full max-w-full">
          <Header expiry={expiry} toggleSidebar={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
