import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Wifi } from 'lucide-react'

export default function AuthLayout() {
  const { admin } = useAuth()
  if (admin) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <img 
            src="/img/favicon.png" 
            alt="UGPAY" 
            className="w-16 h-16 object-contain drop-shadow-xl mx-auto mb-4" 
          />
          <h1 className="text-2xl font-bold text-gray-900">UGPAY</h1>
          <p className="text-sm text-gray-500 mt-1">WiFi Billing Management</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
