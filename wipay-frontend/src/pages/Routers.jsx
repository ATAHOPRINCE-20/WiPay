import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, Router as RouterIcon, Activity, Terminal, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'

const EMPTY = { name: '', ip_address: '', secret: '' }

export default function Routers() {
  const { showToast } = useToast()
  const [routers,  setRouters]  = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('routers')
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [setupScript, setSetupScript] = useState(null)
  const [selectedRouter, setSelectedRouter] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)

  const loadRouters  = async () => { const { data } = await api.get('/admin/routers'); setRouters(Array.isArray(data) ? data : []) }
  const loadSessions = async () => { const { data } = await api.get('/admin/routers/sessions'); setSessions(Array.isArray(data) ? data : []) }

  const load = async () => {
    setLoading(true)
    await Promise.all([loadRouters(), loadSessions()])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (r)  => { setForm({ name: r.name, ip_address: r.ip_address || '', secret: '' }); setEditId(r.id); setError(''); setModal(true) }

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

  const remove = async (id) => {
    if (!confirm('Remove this router?')) return
    try {
      await api.delete(`/admin/routers/${id}`)
      if (selectedRouter?.id === id) setSelectedRouter(null)
    } catch (err) {
      console.error('Failed to delete router:', err)
    }
    load()
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

  const fmtBytes = (b) => {
    if (!b) return '0 B'
    const k = 1024, sizes = ['B','KB','MB','GB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">MikroTik Routers</h2>
          <p className="text-sm text-gray-400">Manage routers, VPN connections, and monitor active RADIUS sessions</p>
        </div>
        <button className="btn-primary" onClick={openCreate}><Plus className="w-4 h-4" /> Add Router</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[{ key: 'routers', label: 'Routers', Icon: RouterIcon }, { key: 'sessions', label: 'Active Sessions', Icon: Activity }].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
      ) : tab === 'routers' ? (
        <div className="card overflow-hidden">
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">VPN IP</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Public Key</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {routers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No routers added yet.</td></tr>
                ) : routers.map(r => (
                  <tr 
                    key={r.id} 
                    onClick={() => setSelectedRouter(r)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2 truncate">
                      <RouterIcon className="w-4 h-4 text-primary-400 flex-shrink-0" /><span className="truncate">{r.name}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600 truncate">{r.ip_address}</td>
                    <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-400 max-w-[150px] truncate" title={r.wg_public_key}>
                      {r.wg_public_key || '—'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs truncate">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); fetchSetupScript(r.id) }} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="View Setup Script">
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(r) }} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="Edit Router">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); remove(r.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Router">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Download</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Started</th>
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
                    <td className="hidden md:table-cell px-4 py-3 text-gray-600 truncate">{fmtBytes(s.acctoutputoctets)}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-600 truncate">{fmtBytes(s.acctinputoctets)}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-400 text-xs truncate">{s.acctstarttime ? new Date(s.acctstarttime).toLocaleString() : '—'}</td>
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
                <span className="text-xs text-gray-500">Started At</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedSession.acctstarttime ? new Date(selectedSession.acctstarttime).toLocaleString() : '—'}
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
              <div className="flex gap-2 pt-1">
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
              Your router has been registered and VPN keys have been generated.
              <strong>Copy this script</strong> and paste it into your MikroTik's <strong>New Terminal</strong> window to automatically configure the VPN and RADIUS connection.
            </p>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[50vh] whitespace-pre-wrap select-all">
              {setupScript}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setSetupScript(null)}>Done</button>
              <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(setupScript); showToast('Copied to clipboard!', 'success') }}>Copy Script</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
