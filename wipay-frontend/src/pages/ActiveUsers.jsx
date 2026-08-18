import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, UserCheck, RefreshCw, Wifi, X, Router as RouterIcon, Laptop, Power, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import ConfirmModal from '../components/ConfirmModal'

export default function ActiveUsers() {
  const { showToast } = useToast()
  const [routers, setRouters]     = useState([])
  const [selectedRouterId, setSelectedRouterId] = useState('all')
  const [tab, setTab]             = useState('active')
  
  const [sessions, setSessions]   = useState([])
  const [devices, setDevices]     = useState([])
  const [dataSource, setDataSource] = useState('radius_db')
  const [warningMsg, setWarningMsg] = useState('')
  const [confirmDisconnectTarget, setConfirmDisconnectTarget] = useState(null)
  
  const [stats, setStats]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const loadRouters = async () => {
    try {
      const { data } = await api.get('/admin/routers')
      setRouters(Array.isArray(data) ? data : [])
    } catch (_) {}
  }

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setWarningMsg('')
    try {
      const statsRes = await api.get('/admin/stats')
      setStats(statsRes.data)

      if (selectedRouterId === 'all') {
        const { data } = await api.get('/admin/routers/sessions')
        setSessions(Array.isArray(data) ? data : [])
        setDataSource('radius_db')
      } else {
        if (tab === 'active') {
          const { data } = await api.get(`/admin/routers/${selectedRouterId}/live-active`)
          setSessions(Array.isArray(data.users) ? data.users : [])
          setDataSource(data.source || 'radius_db')
          if (data.warning) setWarningMsg(data.warning)
        } else {
          const { data } = await api.get(`/admin/routers/${selectedRouterId}/live-devices`)
          setDevices(Array.isArray(data.devices) ? data.devices : [])
          setDataSource(data.source || 'radius_db')
          if (data.warning) setWarningMsg(data.warning)
        }
      }
    } catch (err) {
      console.error('Failed to load active users/devices:', err)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadRouters()
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 10000)
    return () => clearInterval(interval)
  }, [selectedRouterId, tab])

  const handleDisconnect = (username, routerId, mac) => {
    setConfirmDisconnectTarget({ username, routerId, mac })
  }

  const executeDisconnect = async () => {
    if (!confirmDisconnectTarget) return
    const { username, routerId, mac } = confirmDisconnectTarget
    setDisconnecting(true)
    try {
      const targetRouterId = routerId || (selectedRouterId !== 'all' ? selectedRouterId : null)
      await api.post('/admin/routers/sessions/terminate', {
        username: username,
        mac: mac,
        router_id: targetRouterId
      })
      showToast(`Session for ${username || mac} terminated.`, 'success')
      setSelectedRow(null)
      load(true)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to terminate session.', 'error')
    } finally {
      setDisconnecting(false)
      setConfirmDisconnectTarget(null)
    }
  }

  const formatFirstLoggedIn = (dateStr) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '—'
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isToday) return timeStr
    const dateFmt = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    return `${dateFmt}, ${timeStr}`
  }

  const formatTimeLeft = (s) => {
    if (!s) return '—'
    if (s.session_time_left !== null && s.session_time_left !== undefined) {
      const totalMinutes = Math.round(Number(s.session_time_left) * 60)
      if (totalMinutes <= 0) return 'Expired'
      const h = Math.floor(totalMinutes / 60)
      const m = totalMinutes % 60
      return h > 0 ? `${h}h ${m}m left` : `${m}m left`
    }
    return 'Unlimited'
  }

  const fmtBytes = (b) => {
    if (!b) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0; let n = Number(b)
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
    return `${n.toFixed(1)} ${units[i]}`
  }

  if (loading && !refreshing) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Active Users & Connected Devices</h2>
          <p className="text-sm text-gray-400">Real-time MikroTik RouterOS API and FreeRADIUS session monitoring</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Router Selector */}
          <div className="relative">
            <select
              value={selectedRouterId}
              onChange={(e) => setSelectedRouterId(e.target.value)}
              className="select text-sm py-1.5 pr-8 pl-3 border-gray-200 rounded-lg shadow-sm"
            >
              <option value="all">All Routers (RADIUS)</option>
              {routers.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.ip_address})
                </option>
              ))}
            </select>
          </div>

          <button className="btn-secondary" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Warning banner if API unreachable */}
      {warningMsg && (
        <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 p-3 rounded-xl border border-amber-200 shadow-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>{warningMsg}</span>
        </div>
      )}

      {/* Data Source Badge & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setTab('active')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
              tab === 'active' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-primary-500" /> Active Hotspot Users
          </button>
          
          <button
            onClick={() => setTab('devices')}
            disabled={selectedRouterId === 'all'}
            title={selectedRouterId === 'all' ? 'Select a specific router to scan connected network devices' : ''}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
              tab === 'devices' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            } ${selectedRouterId === 'all' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Laptop className="w-3.5 h-3.5 text-blue-500" /> Connected Network Devices
          </button>
        </div>

        <div className="flex items-center gap-2">
          {dataSource === 'mikrotik_api' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live MikroTik RouterOS API
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              FreeRADIUS Database
            </span>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Sessions', value: stats?.active_sessions ?? sessions.length },
          { label: 'Total Clients', value: stats?.counts?.clients ?? stats?.vouchers?.used ?? 0 },
          { label: 'Configured Routers', value: stats?.counts?.routers ?? routers.length },
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

      {/* Main Data Table */}
      <div className="card overflow-hidden">
        <div className="overflow-y-auto max-h-[65vh]">
          {tab === 'active' ? (
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">MAC Address</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">First Logged In</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Remaining</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Download</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
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
                    <td className="px-4 py-3 font-medium text-gray-900 truncate flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse"></span>
                      <span className="font-mono text-sm font-semibold">{s.username}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs truncate">{s.framedipaddress || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 font-mono text-xs truncate">{s.callingstationid || '—'}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 text-xs truncate">
                      {formatFirstLoggedIn(s.first_logged_in)}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-emerald-600 font-semibold text-xs truncate">
                      {formatTimeLeft(s)}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{fmtBytes(s.acctoutputoctets)}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{fmtBytes(s.acctinputoctets)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDisconnect(s.username, selectedRouterId !== 'all' ? selectedRouterId : s.router_id, s.callingstationid) }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Terminate Session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Device Hostname</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">MAC Address</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expiry / Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                      <Laptop className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No connected devices detected on this router network.
                    </td>
                  </tr>
                ) : devices.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 truncate flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span>{d.hostname}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs truncate">{d.ip || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs truncate">{d.mac || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        d.status === 'bound' || d.status === 'authorized' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs truncate">
                      {d.expires_after ? `Lease: ${d.expires_after}` : d.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" 
          onClick={() => setSelectedRow(null)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 font-mono">{selectedRow.username}</h3>
                <p className="text-xs text-gray-400">Active Hotspot Session</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Client IP Address</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRow.framedipaddress || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">MAC / Caller ID</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRow.callingstationid || '—'}</span>
              </div>
              {selectedRow.session_time_left && (
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-xs text-gray-500">Session Time Left</span>
                  <span className="text-sm font-semibold text-emerald-600 font-mono">{selectedRow.session_time_left}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Data Downloaded</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedRow.acctoutputoctets)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Data Uploaded</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedRow.acctinputoctets)}</span>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <button 
                disabled={disconnecting}
                onClick={() => handleDisconnect(selectedRow.username, selectedRouterId !== 'all' ? selectedRouterId : null)}
                className="btn-primary bg-red-600 hover:bg-red-700 border-red-600 w-full justify-center flex items-center gap-2"
              >
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                Disconnect User Session
              </button>
              <button className="btn-secondary w-full" onClick={() => setSelectedRow(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmDisconnectTarget}
        onClose={() => setConfirmDisconnectTarget(null)}
        onConfirm={executeDisconnect}
        title="Disconnect User Session"
        message={`Are you sure you want to terminate the active session for ${confirmDisconnectTarget?.username || confirmDisconnectTarget?.mac || 'this user'}?`}
        confirmText="Disconnect User"
        type="warning"
        loading={disconnecting}
      />
    </div>
  )
}
