import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, Users, X, Shield, Phone, Mail } from 'lucide-react'
import { useToast } from '../context/ToastContext'

const EMPTY = { username: '', password: '', email: '', business_phone: '' }

export default function Agents() {
  const { showToast } = useToast()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/agents')
      setAgents(Array.isArray(data) ? data : [])
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      openCreate()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const openCreate = () => {
    setForm(EMPTY)
    setEditId(null)
    setError('')
    setModal(true)
  }

  const openEdit = (agent) => {
    setForm({
      username: agent.username,
      password: '',
      email: agent.email || '',
      business_phone: agent.business_phone || ''
    })
    setEditId(agent.id)
    setError('')
    setModal(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editId) {
        await api.put(`/admin/agents/${editId}`, form)
      } else {
        await api.post('/admin/agents', form)
      }
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save agent.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this agent account? This action cannot be undone.')) return
    try {
      await api.delete(`/admin/agents/${id}`)
      load()
      if (selectedRow?.id === id) setSelectedRow(null)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete agent.', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Agents</h2>
          <p className="text-sm text-gray-400">Manage agent sub-accounts and reseller sales logins</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Agent
        </button>
      </div>

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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No agents yet. Create your first reseller agent.
                    </td>
                  </tr>
                ) : agents.map(agent => (
                  <tr 
                    key={agent.id} 
                    onClick={() => setSelectedRow(agent)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 truncate">{agent.username}</td>
                    <td className="px-4 py-3 text-gray-500 truncate">{agent.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 truncate">{agent.business_phone || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs truncate">
                      {agent.created_at ? new Date(agent.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(agent)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(agent.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
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

      {/* Mobile Detail Modal */}
      {selectedRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 md:hidden" 
          onClick={() => setSelectedRow(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRow.username}</h3>
                <p className="text-xs text-gray-400">Agent Account Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.email || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.business_phone || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Created At</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button 
                className="btn-secondary justify-center flex items-center gap-2"
                onClick={() => {
                  setSelectedRow(null)
                  openEdit(selectedRow)
                }}
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <button 
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 justify-center flex items-center gap-2"
                onClick={() => remove(selectedRow.id)}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {modal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editId ? 'Edit Agent Details' : 'Add New Agent'}</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
                <input 
                  className="input" 
                  placeholder="e.g. agent_retail" 
                  value={form.username} 
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))} 
                  required 
                  disabled={!!editId}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {editId ? 'New Password (Leave blank to keep current)' : 'Password'}
                </label>
                <input 
                  className="input" 
                  type="password" 
                  placeholder="At least 6 characters" 
                  value={form.password} 
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))} 
                  required={!editId}
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email (Optional)</label>
                <input 
                  className="input" 
                  type="email" 
                  placeholder="agent@example.com" 
                  value={form.email} 
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Phone (Optional)</label>
                <input 
                  className="input" 
                  placeholder="07XXXXXXXX" 
                  value={form.business_phone} 
                  onChange={e => setForm(p => ({ ...p, business_phone: e.target.value }))} 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? 'Save Changes' : 'Create Agent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
