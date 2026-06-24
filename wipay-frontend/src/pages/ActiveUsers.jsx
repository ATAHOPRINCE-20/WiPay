import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, UserCheck, RefreshCw, Wifi, X } from 'lucide-react'

export default function ActiveUsers() {
  const [sessions, setSessions] = useState([])
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, r] = await Promise.all([
        api.get('/admin/routers/sessions'),
        api.get('/admin/stats'),
      ])
      setSessions(Array.isArray(s.data) ? s.data : [])
      setStats(r.data)
    } catch (_) {}
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 15000)
    return () => clearInterval(interval)
  }, [])

  const fmtBytes = (b) => {
    if (!b) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0; let n = Number(b)
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(1)} ${units[i]}`
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Active Users</h2>
          <p className="text-sm text-gray-400">Live hotspot sessions from FreeRADIUS</p>
        </div>
        <button className="btn-secondary" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Now',  value: stats?.active_sessions ?? 0 },
          { label: 'Total Clients', value: stats?.counts?.clients ?? stats?.vouchers?.used ?? 0 },
          { label: 'Routers',     value: stats?.counts?.routers ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-y-auto max-h-[65vh]">
          <table className="w-full text-sm text-left table-fixed sm:table-auto">
            <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2 sm:w-auto">Username</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-1/2 sm:w-auto">IP Address</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">MAC / Caller ID</th>
                <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Router IP</th>
                <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Download</th>
                <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload</th>
                <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    <Wifi className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No active sessions right now.
                  </td>
                </tr>
              ) : sessions.map((s, i) => (
                <tr 
                  key={i} 
                  onClick={() => setSelectedRow(s)}
                  className="hover:bg-gray-50/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 truncate">{s.username}</td>
                  <td className="px-4 py-3 text-gray-500 truncate">{s.framedipaddress || '—'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 font-mono text-xs truncate">{s.callingstationid || '—'}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500 truncate">{s.nasipaddress || '—'}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{fmtBytes(s.acctoutputoctets)}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{fmtBytes(s.acctinputoctets)}</td>
                  <td className="hidden xl:table-cell px-4 py-3 text-gray-400 text-xs truncate">
                    {s.acctstarttime ? new Date(s.acctstarttime).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Detail Modal */}
      {selectedRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 xl:hidden" 
          onClick={() => setSelectedRow(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRow.username}</h3>
                <p className="text-xs text-gray-400">Active Session Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">IP Address</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.framedipaddress || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">MAC / Caller ID</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRow.callingstationid || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Router IP</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.nasipaddress || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Data Downloaded</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedRow.acctoutputoctets)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Data Uploaded</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedRow.acctinputoctets)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 xl:hidden">
                <span className="text-xs text-gray-500">Started At</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedRow.acctstarttime ? new Date(selectedRow.acctstarttime).toLocaleString() : '—'}
                </span>
              </div>
            </div>
            <button className="btn-secondary w-full mt-5" onClick={() => setSelectedRow(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
