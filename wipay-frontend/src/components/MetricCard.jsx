import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function MetricCard({ icon: Icon, label, value, sub, green = false }) {
  const [hidden, setHidden] = useState(false)

  return (
    <div className={`relative overflow-hidden rounded-xl p-5 flex flex-col gap-3 ${
      green ? 'bg-primary-500 text-white' : 'bg-white border border-gray-100 shadow-card'
    }`}>
      {/* Decorative blobs */}
      {green && (
        <>
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
          <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full" />
        </>
      )}

      <div className="relative flex items-start justify-between">
        <div className={`p-2 rounded-lg ${green ? 'bg-white/20' : 'bg-primary-50'}`}>
          <Icon className={`w-4 h-4 ${green ? 'text-white' : 'text-primary-500'}`} />
        </div>
        <button
          onClick={() => setHidden(!hidden)}
          className={`p-1 rounded transition ${green ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
        >
          {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="relative">
        <p className={`text-xs font-medium mb-1 ${green ? 'text-white/80' : 'text-gray-500'}`}>
          {label}
        </p>
        <p className={`text-2xl font-bold tracking-tight ${green ? 'text-white' : 'text-gray-900'}`}>
          {hidden ? '••••••' : value}
        </p>
        {sub && (
          <p className={`text-xs mt-1 ${green ? 'text-white/70' : 'text-gray-400'}`}>{sub}</p>
        )}
      </div>
    </div>
  )
}
