import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import {
  LayoutDashboard, Users, Ticket, UserCheck, Package, CreditCard,
  Receipt, FileText, DollarSign, MessageSquare, Mail, Megaphone,
  Router, Wrench, LogOut, Wifi, ChevronRight, FolderOpen
} from 'lucide-react'

const NAV = [
  {
    label: 'Main',
    items: [{ icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' }]
  },
  {
    label: 'Users',
    items: [
      { icon: UserCheck, label: 'Active Users',  to: '/active-users',  count: 'active_users' },
      { icon: Users,     label: 'Users',         to: '/users',         count: 'clients'      },
      { icon: Ticket,    label: 'Tickets',        to: '/tickets',       count: 'tickets'      },
    ]
  },
  {
    label: 'Finance',
    items: [
      { icon: FolderOpen,   label: 'Categories', to: '/categories', count: 'categories' },
      { icon: Package,      label: 'Packages',   to: '/packages',   count: 'packages'   },
          { icon: DollarSign,   label: 'Withdraw',   to: '/withdraw'                      },
      { icon: CreditCard,   label: 'Payments',   to: '/payments'                      },
      { icon: Receipt,      label: 'Vouchers',   to: '/vouchers',   count: 'vouchers'   },
      { icon: FileText,     label: 'Invoices',   to: '/invoices',   count: 'invoices'   },
      { icon: DollarSign,   label: 'Expenses',   to: '/expenses'                      },
    ]
  },
  {
    label: 'Communication',
    items: [
      { icon: MessageSquare, label: 'Messages',   to: '/messages'                         },
      { icon: Mail,          label: 'Emails',     to: '/emails'                           },
      { icon: Megaphone,     label: 'Campaigns',  to: '/campaigns', count: 'campaigns'    },
    ]
  },
  {
    label: 'Devices',
    items: [
      { icon: Router,  label: 'MikroTik',  to: '/routers',   count: 'routers'  },
      { icon: Wrench,  label: 'Equipment', to: '/equipment', count: 'equipment'},
    ]
  },
]

export default function Sidebar() {
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

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-100 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
        <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
          <Wifi className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">{admin?.business_name || 'WiPay'}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">WiFi Billing</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map((section) => (
          <div key={section.label}>
            {section.label !== 'Main' && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ icon: Icon, label, to, count }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors group ${
                        isActive
                          ? 'bg-primary-500 text-white shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} />
                        <span className="flex-1 truncate">{label}</span>
                        {count && counts[count] !== undefined && (
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                            isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {counts[count]}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
  )
}
