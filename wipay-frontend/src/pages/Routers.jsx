import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, Router as RouterIcon, Activity, Terminal, X, Download, FileText, RefreshCw, Search } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY = { name: '', ip_address: '', secret: '', api_port: '8728', api_user: 'admin', api_password: '' }

export default function Routers() {
  const { showToast } = useToast()
  const [routers,  setRouters]  = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('routers')
  const [modal,    setModal]    = useState(false)
  const [confirmRouterId, setConfirmRouterId]   = useState(null)
  const [confirmSessionTarget, setConfirmSessionTarget] = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [setupScript, setSetupScript] = useState(null)
  const [selectedRouter, setSelectedRouter] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)

  // Logs state
  const [logsRouter, setLogsRouter] = useState(null)
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true)
  const [logSearch, setLogSearch] = useState('')
  const [logTopicFilter, setLogTopicFilter] = useState('all')

  const fetchLogs = async (r, silent = false) => {
    if (!r) return
    if (!silent) setLogsLoading(true)
    setLogsError('')
    try {
      const { data } = await api.get(`/admin/routers/${r.id}/logs`)
      setLogs(Array.isArray(data.logs) ? data.logs : [])
    } catch (err) {
      setLogsError(err.response?.data?.error || 'Failed to fetch logs from router.')
      setLogs([])
    } finally {
      if (!silent) setLogsLoading(false)
    }
  }

  const openLogs = (r) => {
    setLogsRouter(r)
    setLogSearch('')
    setLogTopicFilter('all')
    fetchLogs(r)
  }

  useEffect(() => {
    let interval
    if (logsRouter && autoRefreshLogs) {
      interval = setInterval(() => {
        fetchLogs(logsRouter, true)
      }, 5000)
    }
    return () => clearInterval(interval)
  }, [logsRouter, autoRefreshLogs])

  const filteredLogs = logs.filter(l => {
    const topicsStr = Array.isArray(l.topics) ? l.topics.join(',') : (l.topics || '').toString()
    const msgStr = (l.message || '').toString()
    const timeStr = (l.time || '').toString()

    const matchesSearch = !logSearch || 
      msgStr.toLowerCase().includes(logSearch.toLowerCase()) ||
      topicsStr.toLowerCase().includes(logSearch.toLowerCase()) ||
      timeStr.toLowerCase().includes(logSearch.toLowerCase())
    
    if (!matchesSearch) return false

    if (logTopicFilter === 'all') return true
    if (logTopicFilter === 'hotspot') return topicsStr.toLowerCase().includes('hotspot')
    if (logTopicFilter === 'dhcp') return topicsStr.toLowerCase().includes('dhcp')
    if (logTopicFilter === 'system') return topicsStr.toLowerCase().includes('system') || topicsStr.toLowerCase().includes('account')
    if (logTopicFilter === 'error') return topicsStr.toLowerCase().includes('warning') || topicsStr.toLowerCase().includes('error') || topicsStr.toLowerCase().includes('critical') || topicsStr.toLowerCase().includes('reject')
    return true
  })

  const loadRouters  = async () => { const { data } = await api.get('/admin/routers'); setRouters(Array.isArray(data) ? data : []) }
  const loadSessions = async () => { const { data } = await api.get('/admin/routers/sessions'); setSessions(Array.isArray(data) ? data : []) }

  const load = async () => {
    setLoading(true)
    await Promise.all([loadRouters(), loadSessions()])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (r)  => { 
    setForm({ 
      name: r.name, 
      ip_address: r.ip_address || '', 
      secret: '',
      api_port: r.api_port || '8728',
      api_user: r.api_user || 'admin',
      api_password: r.api_password || ''
    }); 
    setEditId(r.id); 
    setError(''); 
    setModal(true) 
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (editId) {
        await api.put(`/admin/routers/${editId}`, form)
        setModal(false); load()
      } else {
        const { data } = await api.post('/admin/routers', form)
        if (data.script) setSetupScript(data.script)
        setModal(false); load()
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save.')
    } finally { setSaving(false) }
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

  const terminateSession = (s) => {
    setConfirmSessionTarget(s)
  }

  const executeTerminateSession = async () => {
    if (!confirmSessionTarget) return
    const s = confirmSessionTarget
    try {
      await api.post('/admin/routers/sessions/terminate', {
        username: s.username,
        mac: s.callingstationid,
        router_id: s.router_id
      })
      loadSessions()
      showToast('Session terminated.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to terminate session', 'error')
    } finally {
      setConfirmSessionTarget(null)
    }
  }

  const remove = (id) => {
    setConfirmRouterId(id)
  }

  const executeDeleteRouter = async () => {
    if (!confirmRouterId) return
    try {
      await api.delete(`/admin/routers/${confirmRouterId}`)
      if (selectedRouter?.id === confirmRouterId) setSelectedRouter(null)
      load()
      showToast('Router removed.', 'success')
    } catch (err) {
      showToast('Failed to delete router.', 'error')
    } finally {
      setConfirmRouterId(null)
    }
  }

  const fetchSetupScript = async (id) => {
    try {
      const { data } = await api.get(`/admin/routers/${id}/script`)
      if (data.script) {
        setSetupScript(data.script)
      } else {
        showToast('No setup script returned.', 'warning')
      }
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Failed to fetch setup script.', 'error')
    }
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
    const k = 1024, sizes = ['B','KB','MB','GB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  const downloadLoginHtml = () => {
    const adminData = JSON.parse(localStorage.getItem('wipay_admin') || '{}')
    const slug = adminData.portal_slug || 'default'
    const domain = window.location.hostname || 'wifi.ugpay.tech'
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=http://${domain}/captive-portal?slug=${slug}&link-login=$(link-login-only)&mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)&error=$(error)" />
    <title>Connecting to UGPAY...</title>
</head>
<body>
    <div style="font-family: sans-serif; text-align: center; margin-top: 100px; color: #4B5563;">
        <p style="font-weight: bold;">Connecting to Wi-Fi Portal...</p>
        <p style="font-size: 14px;">If you are not redirected automatically, <a href="http://${domain}/captive-portal?slug=${slug}&link-login=$(link-login-only)&mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)&error=$(error)">click here</a>.</p>
    </div>
</body>
</html>`

    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'login.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Downloaded login.html with your portal slug!', 'success')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">MikroTik Routers</h2>
          <p className="text-xs sm:text-sm text-gray-400 truncate">Manage routers, VPN connections, and monitor active RADIUS sessions</p>
        </div>
        <button className="btn-primary shrink-0 whitespace-nowrap" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Router
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        <button 
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${tab === 'routers' ? 'bg-white shadow-sm border border-gray-200 text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('routers')}
        >
          <RouterIcon className="w-4 h-4" /> Routers
        </button>
        <button 
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${tab === 'sessions' ? 'bg-white shadow-sm border border-gray-200 text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('sessions')}
        >
          <Activity className="w-4 h-4" /> Active Sessions
        </button>
      </div>

      {/* Routers Tab */}
      {tab === 'routers' ? (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[65vh]">
              <table className="w-full text-sm text-left table-fixed sm:table-auto">
                <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VPN IP</th>
                    <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Public Key</th>
                    <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Sessions</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {routers.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No routers configured yet. Add your first router.</td></tr>
                  ) : routers.map(r => (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedRouter(r)}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 truncate">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate">{r.ip_address}</td>
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[150px]">{r.wg_public_key || '—'}</td>
                      <td className="hidden lg:table-cell px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{r.active_sessions_count || 0} active</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openLogs(r)} className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition" title="View Live Router Logs">
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => fetchSetupScript(r.id)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition" title="View Router Setup Script">
                            <Terminal className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="Edit Router">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Router">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">NAS IP</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client IP</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">MAC Address</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">First Logged In</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Remaining</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No active sessions right now.</td></tr>
                ) : sessions.map((s, i) => (
                  <tr 
                    key={i} 
                    onClick={() => setSelectedSession(s)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800 truncate">{s.username}</td>
                    <td className="hidden lg:table-cell px-4 py-3 font-mono text-xs text-gray-500 truncate">{s.nasipaddress}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 truncate">{s.framedipaddress}</td>
                    <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-400 truncate">{s.callingstationid}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 text-xs truncate">
                      {formatFirstLoggedIn(s.first_logged_in)}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-emerald-600 font-semibold text-xs truncate">{formatTimeLeft(s)}</td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => terminateSession(s)}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                        title="Terminate Active Session"
                      >
                        Terminate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile Detail Modal for Router */}
      {selectedRouter && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 md:hidden" 
          onClick={() => setSelectedRouter(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRouter.name}</h3>
                <p className="text-xs text-gray-400">Router Details</p>
              </div>
              <button onClick={() => setSelectedRouter(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">VPN IP</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRouter.ip_address}</span>
              </div>
              <div className="flex flex-col border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500 mb-1">Public Key</span>
                <span className="text-sm font-medium text-gray-900 font-mono break-all">{selectedRouter.wg_public_key || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Added On</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(selectedRouter.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-2">
              <button 
                className="btn-secondary w-full justify-center flex items-center gap-2 border-cyan-200 text-cyan-700 hover:bg-cyan-50 font-semibold"
                onClick={() => {
                  const target = selectedRouter;
                  setSelectedRouter(null);
                  openLogs(target);
                }}
              >
                <FileText className="w-4 h-4 text-cyan-600" /> View Live Router Logs
              </button>
              <button 
                className="btn-primary w-full justify-center flex items-center gap-2"
                onClick={() => {
                  setSelectedRouter(null);
                  fetchSetupScript(selectedRouter.id);
                }}
              >
                <Terminal className="w-4 h-4" /> View Setup Script
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  className="btn-secondary justify-center flex items-center gap-2"
                  onClick={() => {
                    setSelectedRouter(null);
                    openEdit(selectedRouter);
                  }}
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button 
                  className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 justify-center flex items-center gap-2"
                  onClick={() => remove(selectedRouter.id)}
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Detail Modal for Session */}
      {selectedSession && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 lg:hidden" 
          onClick={() => setSelectedSession(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 font-mono">{selectedSession.username}</h3>
                <p className="text-xs text-gray-400">Session Details</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Client IP</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedSession.framedipaddress}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">MAC Address</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedSession.callingstationid}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">NAS IP (Router)</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedSession.nasipaddress}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Download</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedSession.acctoutputoctets)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Upload</span>
                <span className="text-sm font-medium text-gray-900">{fmtBytes(selectedSession.acctinputoctets)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Time Remaining</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {formatTimeLeft(selectedSession)}
                </span>
              </div>
            </div>
            <button className="btn-secondary w-full mt-5" onClick={() => setSelectedSession(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Modal for Create/Edit */}
      {modal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editId ? 'Edit Router' : 'Add Router'}</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Router Name</label>
                <input className="input" placeholder="e.g. Garuga Spot Router 1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              {editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">NAS IP Address (VPN)</label>
                  <input className="input font-mono" placeholder="e.g. 10.66.66.2" value={form.ip_address} onChange={e => setForm(p => ({ ...p, ip_address: e.target.value }))} required />
                </div>
              )}
              {!editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">NAS IP Address (Optional)</label>
                  <input className="input font-mono" placeholder="Leave blank to auto-allocate" value={form.ip_address} onChange={e => setForm(p => ({ ...p, ip_address: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">RADIUS Secret</label>
                <input className="input font-mono" type="password" placeholder="Shared secret" value={form.secret} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} required />
              </div>
              <div className="border-t border-gray-100 pt-2 mt-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">RouterOS API Connection (Optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">API Port</label>
                    <input className="input text-xs font-mono" placeholder="8728" value={form.api_port} onChange={e => setForm(p => ({ ...p, api_port: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">API User</label>
                    <input className="input text-xs" placeholder="admin" value={form.api_user} onChange={e => setForm(p => ({ ...p, api_user: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-[11px] font-medium text-gray-600 mb-0.5">API Password</label>
                  <input className="input text-xs font-mono" type="password" placeholder="Router admin password" value={form.api_password} onChange={e => setForm(p => ({ ...p, api_password: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? 'Save' : 'Add Router')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Setup Script */}
      {setupScript && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setSetupScript(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-5 h-5 text-gray-900" />
              <h3 className="text-lg font-bold text-gray-900">MikroTik Setup Script</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Your router script is ready! Pasting this into MikroTik's <strong>New Terminal</strong> configures WireGuard, RADIUS, and automatically writes your personalized <strong>login.html</strong> file with your portal slug.
            </p>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[50vh] whitespace-pre-wrap select-all">
              {setupScript}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setSetupScript(null)}>Done</button>
              <button className="btn-secondary flex items-center gap-1.5" onClick={downloadLoginHtml}>
                <Download className="w-4 h-4" /> Download login.html
              </button>
              <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(setupScript); showToast('Copied to clipboard!', 'success') }}>Copy Script</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Router Logs */}
      {logsRouter && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6" onClick={() => setLogsRouter(null)}>
          <div className="bg-gray-900 text-gray-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-800" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 text-cyan-400 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                    {logsRouter.name} <span className="text-xs font-normal text-gray-400 font-mono">({logsRouter.ip_address})</span>
                  </h3>
                  <p className="text-xs text-gray-400">Live RouterOS System & Hotspot Logs</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                    autoRefreshLogs ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700'
                  }`}
                  title="Auto refresh every 5 seconds"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{autoRefreshLogs ? 'Live Syncing' : 'Paused'}</span>
                </button>
                <button
                  onClick={() => fetchLogs(logsRouter)}
                  disabled={logsLoading}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
                  title="Manual Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setLogsRouter(null)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 border-b border-gray-800/80 bg-gray-900/50 flex flex-wrap items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter log messages..."
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              {/* Topic Filters */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Logs' },
                  { id: 'hotspot', label: 'Hotspot' },
                  { id: 'dhcp', label: 'DHCP' },
                  { id: 'system', label: 'System' },
                  { id: 'error', label: 'Warnings / Errors' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setLogTopicFilter(t.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                      logTopicFilter === t.id
                        ? 'bg-cyan-500 text-gray-950 font-bold'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Log Body */}
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-2 max-h-[60vh]">
              {logsLoading && logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin text-cyan-400" />
                  <p className="text-xs">Connecting to RouterOS API & fetching logs...</p>
                </div>
              ) : logsError ? (
                <div className="bg-red-950/50 border border-red-800/80 rounded-xl p-4 text-red-300 space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> Connection Error
                  </p>
                  <p className="text-xs opacity-90">{logsError}</p>
                  <p className="text-[11px] text-gray-400 pt-1">
                    Tip: Ensure the router is online, connected over VPN ({logsRouter.ip_address}), and RouterOS API service is enabled on port {logsRouter.api_port || 8728}.
                  </p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No log entries match your filter criteria.
                </div>
              ) : (
                filteredLogs.map((item, idx) => {
                  const topics = item.topics || ''
                  const isError = topics.includes('error') || topics.includes('warning') || topics.includes('critical')
                  const isHotspot = topics.includes('hotspot')
                  const isDhcp = topics.includes('dhcp')

                  let badgeStyle = 'bg-gray-800 text-gray-300 border-gray-700'
                  if (isError) badgeStyle = 'bg-red-950/80 text-red-400 border-red-800/50'
                  else if (isHotspot) badgeStyle = 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                  else if (isDhcp) badgeStyle = 'bg-purple-950/80 text-purple-400 border-purple-800/50'

                  return (
                    <div key={item.id || idx} className="flex flex-col sm:flex-row sm:items-start gap-2 py-1.5 px-3 rounded-lg hover:bg-gray-800/60 border border-transparent hover:border-gray-800 transition">
                      <span className="text-gray-400 text-[11px] shrink-0 min-w-[70px] pt-0.5">{item.time}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border shrink-0 ${badgeStyle}`}>
                        {item.topics || 'general'}
                      </span>
                      <span className={`break-all ${isError ? 'text-red-300 font-semibold' : 'text-gray-200'}`}>
                        {item.message}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-800 flex justify-between items-center text-[11px] text-gray-400">
              <span>Showing {filteredLogs.length} of {logs.length} entries</span>
              <button onClick={() => setLogsRouter(null)} className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition font-sans">
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Router Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmRouterId}
        onClose={() => setConfirmRouterId(null)}
        onConfirm={executeDeleteRouter}
        title="Remove Router"
        message="Are you sure you want to remove this MikroTik router from your dashboard?"
        confirmText="Remove Router"
        type="danger"
      />

      {/* Terminate Session Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmSessionTarget}
        onClose={() => setConfirmSessionTarget(null)}
        onConfirm={executeTerminateSession}
        title="Terminate User Session"
        message={`Are you sure you want to disconnect ${confirmSessionTarget?.username || confirmSessionTarget?.callingstationid || 'this session'}?`}
        confirmText="Terminate Session"
        type="warning"
      />
    </div>
  )
}
