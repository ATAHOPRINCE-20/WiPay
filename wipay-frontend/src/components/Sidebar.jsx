import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import {
  LayoutDashboard, FolderOpen, Package, Ticket, CreditCard, Receipt,
  Megaphone, Router, Users, Globe, Download, RefreshCw, Settings, LogOut, X, Wifi, Shield,
  Banknote
} from 'lucide-react'

const NAV = [
  {
    label: 'DATA',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
      { icon: FolderOpen, label: 'Categories', to: '/categories', count: 'categories_count', hasAdd: true, addPath: '/categories?add=true' },
      { icon: Package, label: 'Packages', to: '/packages', count: 'packages_count', hasAdd: true, addPath: '/packages?add=true' },
      { icon: Ticket, label: 'Vouchers', to: '/vouchers', count: 'vouchers_count' }
    ]
  },
  {
    label: 'FINANCE',
    items: [
      { icon: CreditCard, label: 'Payments', to: '/payments' },
      { icon: Banknote, label: 'Withdrawals', to: '/withdrawals' }
    ]
  },
  {
    label: 'COMMS',
    items: [
      { icon: Megaphone, label: 'Portal Ads', to: '/portal-ads', hasAdd: true, addLabel: '+ Upload', addPath: '/portal-ads?upload=true' },
      { icon: Megaphone, label: 'SMS', to: '/messages' }
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { icon: Router, label: 'Routers', to: '/routers' },
      { icon: Users, label: 'Agents', to: '/agents', hasAdd: true, addPath: '/agents?add=true' },
      { icon: Globe, label: 'Check Site', to: '#', isExternal: true },
      { icon: Download, label: 'Downloads', to: '/downloads' },
      { icon: RefreshCw, label: 'Subscription', to: '/subscription' },
      { icon: Settings, label: 'Web Configs', to: '/web-configs' }
    ]
  }
]

const SUPER_NAV = {
  label: 'Super Admin',
  items: [
    { icon: Shield, label: 'Tenants & Billing', to: '/super-admin' },
  ]
}

export default function Sidebar({ isOpen, setIsOpen }) {
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts] = useState({})

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setCounts(data.counts || {}))
      .catch(() => {})
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const closeSidebar = () => {
    if (setIsOpen) setIsOpen(false)
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden" 
          onClick={closeSidebar} 
        />
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Wifi className="w-4 h-4 text-white" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-gray-900 leading-none truncate">{admin?.business_name || 'WiPay'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">WiFi Billing</p>
            </div>
          </div>
          <button 
            className="p-1 text-gray-400 hover:bg-gray-100 rounded-lg md:hidden"
            onClick={closeSidebar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(({ icon: Icon, label, to, count, hasAdd, addLabel, addPath, isExternal }) => (
                  <li key={label} className="relative group/item flex items-center">
                    {isExternal ? (
                      <a
                        href={label === 'Check Site' ? (admin?.portal_dns && !window.location.hostname.includes('localhost') ? `http://${admin.portal_dns}/captive-portal` : `/captive-portal?slug=${admin?.portal_slug || ''}`) : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeSidebar}
                        className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      >
                        <Icon className="w-4 h-4 flex-shrink-0 text-gray-400 group-hover:text-gray-600" />
                        <span className="flex-1 truncate">{label}</span>
                      </a>
                    ) : (
                      <>
                        <NavLink
                          to={to}
                          onClick={closeSidebar}
                          className={({ isActive }) =>
                            `flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors group ${
                              isActive
                                ? 'bg-primary-500 text-white shadow-sm font-semibold'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} />
                              <span className={`flex-1 truncate ${hasAdd ? 'pr-12' : ''}`}>{label}</span>
                              {count && counts[count] !== undefined && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {counts[count]}
                                </span>
                              )}
                            </>
                          )}
                        </NavLink>

                        {hasAdd && (
                          <NavLink
                            to={addPath}
                            onClick={(e) => {
                              e.stopPropagation();
                              closeSidebar();
                            }}
                            className="absolute right-2 text-[10px] font-bold px-1.5 py-0.5 rounded text-primary-500 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 bg-white transition-all shadow-sm"
                          >
                            {addLabel || '+ Add'}
                          </NavLink>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {admin?.role === 'super_admin' && (
            <div>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-yellow-500">
                {SUPER_NAV.label}
              </p>
              <ul className="space-y-0.5">
                {SUPER_NAV.items.map(({ icon: Icon, label, to }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors group ${
                          isActive
                            ? 'bg-yellow-500 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-yellow-50 hover:text-gray-900'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-yellow-500 group-hover:text-yellow-600'}`} />
                          <span className="flex-1 truncate">{label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        {/* User / Logout */}
        <div className="px-3 py-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors group"
          >
            <LogOut className="w-4 h-4 group-hover:text-red-500" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
