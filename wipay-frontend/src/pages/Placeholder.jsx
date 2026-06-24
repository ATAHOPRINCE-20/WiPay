import { Construction } from 'lucide-react'

export default function Placeholder({ title = 'Coming Soon' }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="p-4 bg-gray-100 rounded-2xl mb-4">
        <Construction className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
      <p className="text-sm text-gray-400 mt-1">This module is coming soon.</p>
    </div>
  )
}
