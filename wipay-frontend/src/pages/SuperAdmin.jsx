import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, Plus, Trash2, Shield, Users, Ticket, Banknote, RefreshCw, Edit, Router, Activity, Percent, Wallet } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import ConfirmModal from '../components/ConfirmModal'

export default function SuperAdmin() {
  const { showToast } = useToast()
  const [tenants, setTenants] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [commissionModal, setCommissionModal] = useState(false)
  const [balanceModal, setBalanceModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  const [form, setForm] = useState({ 
    username: '', password: '', email: '', business_name: '', business_phone: '', billing_type: 'commission', commission_rate: '5.0' 
  })
  const [editForm, setEditForm] = useState({ 
    id: '', username: '', email: '', business_name: '', business_phone: '', billing_type: 'commission', commission_rate: '5.0', subscription_expiry: '' 
  })
  const [commissionForm, setCommissionForm] = useState({ id: '', username: '', commission_rate: '5.0' })
  const [balanceForm, setBalanceForm] = useState({ id: '', username: '', new_balance: '0' })

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
      setForm({ username: '', password: '', email: '', business_name: '', business_phone: '', billing_type: 'commission', commission_rate: '5.0' })
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create tenant.')
    } finally { setSaving(false) }
  }

  const removeTenant = (id) => {
    setConfirmDeleteId(id)
  }

  const executeDeleteTenant = async () => {
    if (!confirmDeleteId) return
    try {
      await api.delete(`/super/tenants/${confirmDeleteId}`)
      load()
      showToast('Tenant account deleted.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete tenant.', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const [resetPassTenant, setResetPassTenant] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [renewTenant, setRenewTenant] = useState(null)
  const [expiryDate, setExpiryDate] = useState('')

  const openResetPassword = (tenant) => {
    setResetPassTenant(tenant)
    setNewPassword('')
    setError('')
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSaving(true); setError('')
    try {
      await api.patch(`/super/tenants/${resetPassTenant.id}/password`, { new_password: newPassword })
      showToast('Password reset successfully.', 'success')
      setResetPassTenant(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password.')
    } finally { setSaving(false) }
  }

  const openRenewSubscription = (tenant) => {
    setRenewTenant(tenant)
    const defaultExpiry = tenant.subscription_expiry 
      ? new Date(tenant.subscription_expiry).toISOString().split('T')[0]
      : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    setExpiryDate(defaultExpiry)
    setError('')
  }

  const handleRenewSubscription = async (e) => {
    e.preventDefault()
    if (!expiryDate) {
      setError('Please select an expiry date.')
      return
    }
    setSaving(true); setError('')
    try {
      await api.patch(`/super/tenants/${renewTenant.id}/subscription`, { expiry_date: expiryDate })
      showToast('Subscription updated successfully.', 'success')
      setRenewTenant(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update subscription.')
    } finally { setSaving(false) }
  }

  const openEdit = (tenant) => {
    setEditForm({
      id: tenant.id,
      username: tenant.username || '',
      email: tenant.email || '',
      business_name: tenant.business_name || '',
      business_phone: tenant.business_phone || '',
      billing_type: tenant.billing_type || 'commission',
      commission_rate: tenant.commission_rate ?? '5.0',
      subscription_expiry: tenant.subscription_expiry ? new Date(tenant.subscription_expiry).toISOString().split('T')[0] : ''
    })
    setError('')
    setEditModal(true)
  }

  const openCommissionModal = (tenant) => {
    setCommissionForm({
      id: tenant.id,
      username: tenant.username,
      commission_rate: tenant.commission_rate ?? '5.0'
    })
    setError('')
    setCommissionModal(true)
  }

  const openBalanceModal = (tenant) => {
    setBalanceForm({
      id: tenant.id,
      username: tenant.username,
      new_balance: String(tenant.total_balance ?? 0)
    })
    setError('')
    setBalanceModal(true)
  }

  const handleAdjustBalance = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      try {
        await api.post(`/super/tenants/${balanceForm.id}/adjust-balance`, { new_balance: balanceForm.new_balance })
      } catch (postErr) {
        if (postErr.response?.status === 404) {
          await api.patch(`/super/tenants/${balanceForm.id}/adjust-balance`, { new_balance: balanceForm.new_balance })
        } else {
          throw postErr
        }
      }
      setBalanceModal(false)
      showToast('Tenant balance adjusted successfully.', 'success')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adjust tenant balance.')
    } finally { setSaving(false) }
  }

  const handleUpdateCommission = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.patch(`/super/tenants/${commissionForm.id}/commission`, { commission_rate: commissionForm.commission_rate })
      setCommissionModal(false)
      showToast('Commission rate updated successfully.', 'success')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update commission rate.')
    } finally { setSaving(false) }
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

  const getBillingBadge = (t) => {
    if (t.billing_type === 'subscription') return <span className="badge badge-yellow">Subscription</span>
    return <span className="badge badge-green">Commission ({t.commission_rate || 5}%)</span>
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
          <h2 className="text-lg font-bold text-gray-900">Super Admin Multi-Tenant Center</h2>
          <p className="text-sm text-gray-400">Monitor all tenant accounts, active routers, connected users & platform commission earnings</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setModal(true) }}>
          <Plus className="w-4 h-4" /> New Tenant
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="space-y-4">
          {/* Row 1: Financial Earnings Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                <Banknote className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Voucher Sales</p>
                <p className="text-xl font-bold text-gray-900 truncate">UGX {Number(stats.totalRevenue || 0).toLocaleString()}</p>
                <p className="text-[11px] text-gray-400">Gross Hotspot Sales</p>
              </div>
            </div>

            <div className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <Percent className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Voucher Commissions</p>
                <p className="text-xl font-bold text-emerald-600 truncate">UGX {Number(stats.commissionFees ?? stats.totalCommission ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-gray-400">Platform Share</p>
              </div>
            </div>

            <div className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <Wallet className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Subscription Income</p>
                <p className="text-xl font-bold text-amber-600 truncate">UGX {Number(stats.subscriptionFees ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-gray-400">Tenant Renewals</p>
              </div>
            </div>
          </div>

          {/* Row 2: Network Operations Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Total Tenants</p>
                <p className="text-lg font-bold text-gray-900">{stats.tenantCount ?? 0}</p>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Router className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Active Routers</p>
                <p className="text-lg font-bold text-gray-900">{stats.routerCount ?? 0}</p>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Connected Users</p>
                <p className="text-lg font-bold text-gray-900">{stats.activeUsersCount ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tenants Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Tenant / Business', 'Billing & Rate', 'Sales (UGX)', 'Platform Fee', 'Tenant Balance', 'Routers / Active', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No tenants found.</td></tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-900">{t.username}</p>
                      <p className="text-xs text-gray-500">{t.business_name || 'UGPAY'}</p>
                      {t.email && <p className="text-xs text-gray-400">{t.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      {getBillingBadge(t)}
                      {t.portal_slug && (
                        <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono select-all">
                          {t.portal_slug}
                        </code>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {Number(t.total_sales || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">
                    {Number(t.total_commission || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900">
                    {Number(t.total_balance || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    <div className="space-y-0.5">
                      <p><span className="font-semibold text-gray-800">{t.router_count || 0}</span> Routers</p>
                      <p><span className="font-semibold text-emerald-600">{t.active_users_count || 0}</span> Active Users</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openBalanceModal(t)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Adjust / Set Tenant Balance (UGX)">
                        <Wallet className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openCommissionModal(t)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Adjust Commission Rate (%)">
                        <Percent className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition" title="Edit Tenant Details">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openRenewSubscription(t)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="Renew Subscription">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openResetPassword(t)} className="p-1.5 text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-lg transition" title="Reset Password">
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
      </div>

      {/* Adjust Balance Modal */}
      {balanceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setBalanceModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Set Tenant Starting Balance</h3>
            <p className="text-xs text-gray-400 mb-4">Set exact withdrawable baseline balance for <strong>{balanceForm.username}</strong> and reset settlement cut-off date</p>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleAdjustBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Balance (UGX)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-xs">UGX</span>
                  <input 
                    className="input pl-12 font-bold text-gray-900 text-base" 
                    type="number" 
                    min="0" 
                    step="500"
                    value={balanceForm.new_balance} 
                    onChange={e => setBalanceForm(p => ({ ...p, new_balance: e.target.value }))} 
                    required 
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setBalanceModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center bg-indigo-600 hover:bg-indigo-700">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {commissionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCommissionModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Set Tenant Commission Rate</h3>
            <p className="text-xs text-gray-400 mb-4">Set platform percentage fee charged on every voucher purchase for {commissionForm.username}</p>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleUpdateCommission} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                <div className="relative">
                  <input 
                    className="input pr-8 font-semibold text-gray-900" 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="100" 
                    value={commissionForm.commission_rate} 
                    onChange={e => setCommissionForm(p => ({ ...p, commission_rate: e.target.value }))} 
                    required 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setCommissionModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Billing Type</label>
                  <select className="input" value={form.billing_type} onChange={e => setForm(p => ({ ...p, billing_type: e.target.value }))}>
                    <option value="commission">Commission</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Commission (%)</label>
                  <input className="input" type="number" step="0.1" value={form.commission_rate} onChange={e => setForm(p => ({ ...p, commission_rate: e.target.value }))} />
                </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Billing Type</label>
                  <select className="input" value={editForm.billing_type} onChange={e => setEditForm(p => ({ ...p, billing_type: e.target.value }))}>
                    <option value="commission">Commission</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Commission (%)</label>
                  <input className="input" type="number" step="0.1" value={editForm.commission_rate} onChange={e => setEditForm(p => ({ ...p, commission_rate: e.target.value }))} />
                </div>
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

      {/* Delete Tenant Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={executeDeleteTenant}
        title="Delete Tenant"
        message="Are you sure you want to delete this tenant account? This action cannot be undone."
        confirmText="Delete Tenant"
        type="danger"
      />

      {/* Reset Password Modal */}
      {resetPassTenant && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setResetPassTenant(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Reset Password</h3>
            <p className="text-xs text-gray-400 mb-4">Enter a new password for tenant account <strong>{resetPassTenant.username}</strong></p>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
                <input 
                  className="input" 
                  type="password" 
                  placeholder="At least 6 characters" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  required 
                  minLength={6}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setResetPassTenant(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Subscription Modal */}
      {renewTenant && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRenewTenant(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Renew Subscription</h3>
            <p className="text-xs text-gray-400 mb-4">Update subscription expiration date for tenant <strong>{renewTenant.username}</strong></p>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleRenewSubscription} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">New Expiry Date</label>
                <input 
                  className="input" 
                  type="date" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                  required 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setRenewTenant(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Expiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
