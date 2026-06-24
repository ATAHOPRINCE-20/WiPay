import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, Router as RouterIcon, Activity } from 'lucide-react'

const EMPTY = { name: '', ip_address: '', secret: '' }

export default function Routers() {
  const [routers,  setRouters]  = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('routers')
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const loadRouters  = async () => { const { data } = await api.get('/routers'); setRouters(data) }
  const loadSessions = async () => { const { data } = await api.get('/routers/sessions'); setSessions(data) }

  const load = async () => {
    setLoading(true)
    await Promise.all([loadRouters(), loadSessions()])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (r)  => { setForm({ name: r.name, ip_address: r.ip_address, secret: r.secret }); setEditId(r.id); setError(''); setModal(true) }

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (editId) await api.put(`/routers/${editId}`, form)
      else        await api.post('/routers', form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save.')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm('Remove this router?')) return
    await api.delete(`/routers/${id}`)
    load()
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
          <p className="text-sm text-gray-400">Manage routers and monitor active RADIUS sessions</p>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Name','NAS IP','RADIUS Secret','Added',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {routers.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No routers added yet.</td></tr>
              ) : routers.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-2">
                    <RouterIcon className="w-4 h-4 text-primary-400" />{r.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-600">{r.ip_address}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{'•'.repeat(12)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Username','NAS IP','Client IP','MAC Address','Download','Upload','Started'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No active sessions right now.</td></tr>
              ) : sessions.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-800">{s.username}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.nasipaddress}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.framedipaddress}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{s.callingstationid}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtBytes(s.acctoutputoctets)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtBytes(s.acctinputoctets)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{s.acctstarttime ? new Date(s.acctstarttime).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editId ? 'Edit Router' : 'Add Router'}</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Router Name</label>
                <input className="input" placeholder="e.g. Garuga Spot Router 1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">NAS IP Address</label>
                <input className="input font-mono" placeholder="e.g. 10.66.66.2" value={form.ip_address} onChange={e => setForm(p => ({ ...p, ip_address: e.target.value }))} required />
              </div>
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
    </div>
  )
}
