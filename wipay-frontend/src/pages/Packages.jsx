import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Wifi } from 'lucide-react'

const EMPTY = { name: '', category_id: '', price: '', validity_hours: '', data_limit_mb: '', rate_limit: '1M/1M', is_active: true }

export default function Packages() {
  const [packages, setPackages]   = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const load = async () => {
    setLoading(true)
    const [p, c] = await Promise.all([api.get('/admin/packages'), api.get('/admin/categories')])
    setPackages(p.data)
    setCategories(c.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (pkg) => {
    setForm({
      name: pkg.name, category_id: pkg.category_id, price: pkg.price,
      validity_hours: pkg.validity_hours, data_limit_mb: pkg.data_limit_mb,
      rate_limit: pkg.rate_limit, is_active: pkg.is_active,
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

  const remove = async (id) => {
    if (!confirm('Delete this package? Linked vouchers will be retained.')) return
    await api.delete(`/admin/packages/${id}`)
    load()
  }

  const toggle = async (pkg) => {
    await api.put(`/admin/packages/${pkg.id}`, { is_active: !pkg.is_active })
    load()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Packages</h2>
          <p className="text-sm text-gray-400">Manage internet packages and bandwidth profiles</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> New Package
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Name', 'Category', 'Price (UGX)', 'Validity', 'Rate Limit', 'Stock', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {packages.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No packages yet. Create your first package.</td></tr>
              ) : packages.map(pkg => (
                <tr key={pkg.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{pkg.name}</td>
                  <td className="px-4 py-3 text-gray-500">{pkg.category?.name || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{Number(pkg.price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{pkg.validity_hours > 0 ? `${pkg.validity_hours}h` : 'Unlimited'}</td>
                  <td className="px-4 py-3">
                    <span className="badge badge-green flex items-center gap-1 w-fit">
                      <Wifi className="w-3 h-3" /> {pkg.rate_limit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{pkg.vouchers_count ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(pkg)} className="focus:outline-none">
                      {pkg.is_active
                        ? <ToggleRight className="w-6 h-6 text-primary-500" />
                        : <ToggleLeft  className="w-6 h-6 text-gray-300" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(pkg)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(pkg.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
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
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Validity (hours)</label>
                  <input className="input" type="number" min="0" placeholder="24" value={form.validity_hours} onChange={e => setForm(p => ({ ...p, validity_hours: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rate Limit</label>
                  <input className="input" placeholder="e.g. 2M/512k" value={form.rate_limit} onChange={e => setForm(p => ({ ...p, rate_limit: e.target.value }))} />
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
    </div>
  )
}
