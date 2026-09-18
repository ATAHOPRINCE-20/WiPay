import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Wifi, X, MoreVertical } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY = { name: '', category_id: '', price: '', validity_value: '', validity_hours: '', validity_minutes: '', validity_unit: 'hours', data_limit_mb: '', rate_limit: '1M/1M', is_active: true, simultaneous_devices: 1, device_type: 'mobile' }

const parsePackageValidity = (pkg) => {
  if (!pkg) return { value: '', unit: 'hours', hours: '', minutes: '' }
  if (pkg.validity_unit === 'minutes' || (pkg.validity_minutes > 0 && (!pkg.validity_hours || pkg.validity_hours < 1))) {
    return {
      value: (pkg.validity_minutes || '').toString(),
      unit: 'minutes',
      hours: pkg.validity_hours || (pkg.validity_minutes / 60),
      minutes: pkg.validity_minutes
    }
  }
  const hours = parseFloat(pkg.validity_hours || 0)
  if (hours > 0) {
    if (hours >= 720 && hours % 720 === 0) {
      return { value: (hours / 720).toString(), unit: 'months', hours, minutes: hours * 60 }
    }
    if (hours >= 168 && hours % 168 === 0) {
      return { value: (hours / 168).toString(), unit: 'weeks', hours, minutes: hours * 60 }
    }
    if (hours >= 24 && hours % 24 === 0) {
      return { value: (hours / 24).toString(), unit: 'days', hours, minutes: hours * 60 }
    }
    return { value: hours.toString(), unit: 'hours', hours, minutes: hours * 60 }
  }
  return { value: '', unit: 'hours', hours: '', minutes: '' }
}

export default function Packages() {
  const [packages, setPackages]   = useState([])
  const [categories, setCategories] = useState([])
  const [routers, setRouters]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterRouter, setFilterRouter] = useState('')

  const load = async () => {
    setLoading(true)
    const [p, c, r] = await Promise.all([api.get('/admin/packages'), api.get('/admin/categories'), api.get('/admin/routers')])
    setPackages(Array.isArray(p.data) ? p.data : [])
    setCategories(Array.isArray(c.data) ? c.data : [])
    setRouters(Array.isArray(r.data) ? r.data : [])
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

  const updateValidity = (val, unit) => {
    const num = parseFloat(val) || 0
    let hours = 0
    let minutes = 0
    if (unit === 'minutes') {
      minutes = num
      hours = num / 60
    } else if (unit === 'days') {
      hours = num * 24
      minutes = hours * 60
    } else if (unit === 'weeks') {
      hours = num * 168
      minutes = hours * 60
    } else if (unit === 'months') {
      hours = num * 720
      minutes = hours * 60
    } else {
      hours = num
      minutes = num * 60
    }
    setForm(p => ({
      ...p,
      validity_value: val,
      validity_unit: unit,
      validity_hours: hours ? hours.toString() : '',
      validity_minutes: minutes ? Math.round(minutes) : ''
    }))
  }

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (pkg) => {
    const parsed = parsePackageValidity(pkg)
    setForm({
      name: pkg.name, category_id: pkg.category_id, price: pkg.price,
      validity_value: parsed.value,
      validity_hours: parsed.hours,
      validity_minutes: parsed.minutes,
      validity_unit: parsed.unit,
      data_limit_mb: pkg.data_limit_mb,
      rate_limit: pkg.rate_limit, is_active: pkg.is_active,
      simultaneous_devices: pkg.simultaneous_devices || 1,
      device_type: pkg.device_type || 'mobile',
      router_id: pkg.router_id || ''
    })
    setEditId(pkg.id); setError(''); setModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (editId) await api.put(`/admin/packages/${editId}`, form)
      else        await api.post('/admin/packages', form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save package.')
    } finally { setSaving(false) }
  }

  const remove = (id) => {
    setConfirmDelete(id)
  }

  const executeDelete = async () => {
    if (!confirmDelete) return
    try {
      await api.delete(`/admin/packages/${confirmDelete}`)
      load()
      if (selectedRow?.id === confirmDelete) setSelectedRow(null)
    } catch (_) {}
    setConfirmDelete(null)
  }

  const toggle = async (pkg, e) => {
    if (e) e.stopPropagation()
    await api.patch(`/admin/packages/${pkg.id}/toggle`)
    load()
    if (selectedRow?.id === pkg.id) setSelectedRow({ ...selectedRow, is_active: !pkg.is_active })
  }

  const formatValidity = (pkg) => {
    if (!pkg) return 'Unlimited'
    if (pkg.validity_unit === 'minutes' && pkg.validity_minutes > 0) {
      return `${pkg.validity_minutes} mins`
    }
    const hours = parseFloat(pkg.validity_hours || 0)
    if (hours > 0) {
      if (hours >= 720 && hours % 720 === 0) return `${hours / 720} Mo`
      if (hours >= 168 && hours % 168 === 0) return `${hours / 168} Wk`
      if (hours >= 24 && hours % 24 === 0) return `${hours / 24} Days`
      if (hours < 1) return `${Math.round(hours * 60)} mins`
      return `${hours}h`
    }
    if (pkg.validity_minutes > 0) return `${pkg.validity_minutes} mins`
    return 'Unlimited'
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">Packages</h2>
          <p className="text-xs sm:text-sm text-gray-400 truncate">Manage internet packages and bandwidth profiles</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select 
            className="input text-xs max-w-[180px]" 
            value={filterRouter} 
            onChange={e => setFilterRouter(e.target.value)}
          >
            <option value="">All Routers (Global)</option>
            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn-primary shrink-0 whitespace-nowrap" onClick={openCreate}>
            <Plus className="w-4 h-4" /> New Package
          </button>
        </div>
      </div>

      {/* Table */}
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
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price (UGX)</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Validity</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rate Limit</th>
                  <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-12 md:w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packages.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No packages yet. Create your first package.</td></tr>
                ) : packages.map(pkg => (
                  <tr 
                    key={pkg.id} 
                    onClick={() => setSelectedRow(pkg)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 truncate">{pkg.name}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 truncate">{pkg.category?.name || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 truncate">{Number(pkg.price).toLocaleString()}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{formatValidity(pkg)}</td>
                    <td className="hidden lg:table-cell px-4 py-3 truncate">
                      <span className="badge badge-green flex items-center gap-1 w-fit">
                        <Wifi className="w-3 h-3" /> {pkg.rate_limit}
                      </span>
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-500 truncate">{pkg.vouchers_count ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => toggle(pkg, e)} className="focus:outline-none">
                        {pkg.is_active
                          ? <ToggleRight className="w-6 h-6 text-primary-500" />
                          : <ToggleLeft  className="w-6 h-6 text-gray-300" />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <div className="hidden md:flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(pkg)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition" title="Edit Package">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => remove(pkg.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Package">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button 
                          onClick={() => setSelectedRow(pkg)}
                          className="md:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 shadow-xs"
                          title="Package Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
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
                <h3 className="text-lg font-bold text-gray-900">{selectedRow.name}</h3>
                <p className="text-xs text-gray-400">Package Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Category</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.category?.name || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Validity</span>
                <span className="text-sm font-medium text-gray-900">{formatValidity(selectedRow)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Rate Limit</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.rate_limit || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 xl:hidden">
                <span className="text-xs text-gray-500">Stock Available</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.vouchers_count ?? '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Simultaneous Devices</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.simultaneous_devices || 1}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button 
                className="btn-secondary justify-center flex items-center gap-2"
                onClick={() => {
                  setSelectedRow(null);
                  openEdit(selectedRow);
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

      {/* Modal Form */}
      {modal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editId ? 'Edit Package' : 'New Package'}</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Package Name</label>
                  <input className="input" placeholder="e.g. Daily 1GB" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <select className="input" value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))} required>
                    <option value="">Select…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (UGX)</label>
                  <input className="input" type="number" min="0" placeholder="1000" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Validity Duration</label>
                  <div className="flex gap-2">
                    <input 
                      className="input flex-1 min-w-0" 
                      type="number" 
                      min="1" 
                      step="any"
                      placeholder={form.validity_unit === 'minutes' ? '30' : (form.validity_unit === 'months' ? '1' : '24')} 
                      value={form.validity_value} 
                      onChange={e => updateValidity(e.target.value, form.validity_unit)} 
                      required 
                    />
                    <select 
                      className="input w-28 shrink-0 text-xs" 
                      value={form.validity_unit || 'hours'} 
                      onChange={e => updateValidity(form.validity_value, e.target.value)}
                    >
                      <option value="hours">Hours</option>
                      <option value="minutes">Minutes</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rate Limit</label>
                  <input className="input" placeholder="e.g. 2M/512k" value={form.rate_limit} onChange={e => setForm(p => ({ ...p, rate_limit: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Simultaneous Devices</label>
                  <input className="input" type="number" min="1" max="10" placeholder="1" value={form.simultaneous_devices} onChange={e => setForm(p => ({ ...p, simultaneous_devices: parseInt(e.target.value) || 1 }))} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Router Location Assignment</label>
                  <select className="input" value={form.router_id || ''} onChange={e => setForm(p => ({ ...p, router_id: e.target.value }))}>
                    <option value="">Global (Available across All Routers)</option>
                    {routers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target Device Category</label>
                  <select
                    className="input w-full font-semibold"
                    value={form.device_type || 'mobile'}
                    onChange={e => setForm(p => ({ ...p, device_type: e.target.value }))}
                  >
                    <option value="mobile">Mobile Only</option>
                    <option value="tv">Smart TVs Only</option>
                    <option value="both">Both Mobile & Smart TVs</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded text-primary-500 focus:ring-primary-400" />
                  Active
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? 'Save Changes' : 'Create Package')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={executeDelete}
        title="Delete Package"
        message="Are you sure you want to delete this package? All associated vouchers will also be deleted."
        confirmText="Delete Package"
        type="danger"
      />
    </div>
  )
}
