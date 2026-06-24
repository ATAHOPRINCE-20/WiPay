import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, Plus, Trash2, Shield, Users, Ticket, DollarSign, RefreshCw, Edit } from 'lucide-react'
import { useToast } from '../context/ToastContext'

export default function SuperAdmin() {
  const { showToast } = useToast()
  const [tenants, setTenants] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ username: '', password: '', email: '', business_name: '', business_phone: '', billing_type: 'commission' })
  const [editForm, setEditForm] = useState({ id: '', username: '', email: '', business_name: '', business_phone: '', billing_type: 'commission', subscription_expiry: '' })

  const load = async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([
        api.get('/super/tenants'),
        api.get('/super/stats'),
      ])
      setTenants(Array.isArray(t.data) ? t.data : [])
      setStats(s.data)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createTenant = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/super/tenants', form)
      setModal(false)
      setForm({ username: '', password: '', email: '', business_name: '', business_phone: '', billing_type: 'commission' })
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create tenant.')
    } finally { setSaving(false) }
  }

  const removeTenant = async (id) => {
    if (!confirm('Delete this tenant? This action cannot be undone.')) return
    try {
      await api.delete(`/super/tenants/${id}`)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete tenant.', 'error')
    }
  }

  const resetPassword = async (tenant) => {
    const newPass = prompt(`Enter new password for ${tenant.username}:`)
    if (!newPass) return
    try {
      await api.patch(`/super/tenants/${tenant.id}/password`, { new_password: newPass })
      showToast('Password reset successfully.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reset password.', 'error')
    }
  }

  const renewSubscription = async (tenant) => {
    const months = parseInt(prompt('Renew for how many months?', '1'))
    if (!months || months < 1) return
    const expiryDate = prompt('Enter expiry date (YYYY-MM-DD):', new Date(Date.now() + months * 30 * 86400000).toISOString().split('T')[0])
    if (!expiryDate) return
    try {
      await api.patch(`/super/tenants/${tenant.id}/subscription`, { expiry_date: expiryDate })
      showToast('Subscription updated.', 'success')
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update subscription.', 'error')
    }
  }

  const openEdit = (tenant) => {
    setEditForm({
      id: tenant.id,
      username: tenant.username || '',
      email: tenant.email || '',
      business_name: tenant.business_name || '',
      business_phone: tenant.business_phone || '',
      billing_type: tenant.billing_type || 'commission',
      subscription_expiry: tenant.subscription_expiry ? new Date(tenant.subscription_expiry).toISOString().split('T')[0] : ''
    })
    setError('')
    setEditModal(true)
  }

  const handleEditTenant = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.put(`/super/tenants/${editForm.id}`, editForm)
      setEditModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update tenant.')
    } finally { setSaving(false) }
  }

  const getRoleBadge = (role) => {
    if (role === 'super_admin') return <span className="badge badge-yellow">Super Admin</span>
    return <span className="badge badge-gray">Tenant</span>
  }

  const getBillingBadge = (type) => {
    if (type === 'subscription') return <span className="badge badge-yellow">Subscription</span>
    return <span className="badge badge-green">Commission</span>
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
          <h2 className="text-lg font-bold text-gray-900">Super Admin</h2>
          <p className="text-sm text-gray-400">Manage tenants, subscriptions, and system overview</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setModal(true) }}>
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Tenants</p>
              <p className="text-xl font-bold text-gray-900">{stats.tenantCount ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Ticket className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Vouchers</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalVouchers ?? 0}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Revenue</p>
              <p className="text-xl font-bold text-gray-900">UGX {Number(stats.totalRevenue || 0).toLocaleString()}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Subscriptions</p>
              <p className="text-xl font-bold text-gray-900">{Number(stats.totalSubscriptions || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tenants Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Tenant', 'Portal Slug', 'Role', 'Billing', 'Subscription Expiry', 'Last Active', 'Created', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {tenants.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No tenants found.</td></tr>
            ) : tenants.map(t => (
              <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{t.username}</p>
                    {t.email && <p className="text-xs text-gray-400">{t.email}</p>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {t.role === 'super_admin' ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 font-mono select-all" title="Selectable portal slug">
                      {t.portal_slug || '—'}
                    </code>
                  )}
                </td>
                <td className="px-4 py-3">{getRoleBadge(t.role)}</td>
                <td className="px-4 py-3">{getBillingBadge(t.billing_type)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {t.subscription_expiry ? new Date(t.subscription_expiry).toLocaleDateString('en-GB') : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {t.last_active_at ? new Date(t.last_active_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition" title="Edit Tenant Details">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => renewSubscription(t)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="Renew Subscription">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => resetPassword(t)} className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-lg transition" title="Reset Password">
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeTenant(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Tenant">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Tenant Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Create New Tenant</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={createTenant} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
                <input className="input" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input className="input" type="text" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Name</label>
                <input className="input" value={form.business_name} onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))} placeholder="e.g. Garuga Spot" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Phone</label>
                <input className="input" value={form.business_phone} onChange={e => setForm(p => ({ ...p, business_phone: e.target.value }))} placeholder="07XXXXXXXX" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Billing Type</label>
                <select className="input" value={form.billing_type} onChange={e => setForm(p => ({ ...p, billing_type: e.target.value }))}>
                  <option value="commission">Commission</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Edit Tenant Details</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleEditTenant} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
                <input className="input" value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input className="input" type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Name</label>
                <input className="input" value={editForm.business_name} onChange={e => setEditForm(p => ({ ...p, business_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Business Phone</label>
                <input className="input" value={editForm.business_phone} onChange={e => setEditForm(p => ({ ...p, business_phone: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Billing Type</label>
                <select className="input" value={editForm.billing_type} onChange={e => setEditForm(p => ({ ...p, billing_type: e.target.value }))}>
                  <option value="commission">Commission</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
              {editForm.billing_type === 'subscription' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subscription Expiry</label>
                  <input className="input" type="date" value={editForm.subscription_expiry} onChange={e => setEditForm(p => ({ ...p, subscription_expiry: e.target.value }))} required />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
