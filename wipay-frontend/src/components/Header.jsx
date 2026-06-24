import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Search, Settings, Calendar, Filter, Menu } from 'lucide-react'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good afternoon', emoji: '⛅' }
  return { text: 'Good night', emoji: '🌙' }
}

export default function Header({ expiry, toggleSidebar }) {
  const { admin } = useAuth()
  const greeting  = getGreeting()
  const name      = admin?.business_name || admin?.username || 'Admin'

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      {/* Left: Greeting */}
      <div className="flex items-center gap-3 overflow-hidden">
        <button 
          onClick={toggleSidebar}
          className="p-1.5 -ml-1.5 text-gray-500 hover:bg-gray-100 rounded-lg md:hidden flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base md:text-lg font-semibold text-gray-900 truncate">
          <span className="hidden sm:inline">{greeting.text}, </span>{name} <span>{greeting.emoji}</span>
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search"
            className="pl-8 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 w-32 md:w-48"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-mono hidden lg:block">⌘F</kbd>
        </div>

        {/* Search icon only for mobile */}
        <button className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg sm:hidden">
          <Search className="w-4 h-4" />
        </button>

        {/* Expiry badge */}
        {expiry && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Expiry: {expiry}</span>
          </div>
        )}

        {/* Filters */}
        <button className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition">
          <Filter className="w-3.5 h-3.5" />
          Filters
        </button>

        {/* Settings */}
        <Link to="/settings" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition">
          <Settings className="w-5 h-5" />
        </Link>
      </div>
    </header>
  )
}
