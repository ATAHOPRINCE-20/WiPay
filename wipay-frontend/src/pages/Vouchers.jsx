import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Download, Trash2, Loader2, Tag, Send } from 'lucide-react'

export default function Vouchers() {
  const [vouchers, setVouchers]     = useState([])
  const [packages, setPackages]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [sellModal, setSellModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [sellForm, setSellForm]     = useState({ package_id: '', phone_number: '' })
  const [filterPkg, setFilterPkg]   = useState('')
  const [filterUsed, setFilterUsed] = useState('')
  const [form, setForm] = useState({ package_id: '', quantity: 10, prefix: '' })

  const load = async () => {
    setLoading(true)
    const params = {}
    if (filterPkg)  params.package_id = filterPkg
    if (filterUsed !== '') params.is_used = filterUsed
    const [v, p] = await Promise.all([api.get('/vouchers', { params }), api.get('/packages')])
    setVouchers(v.data.data || v.data)
    setPackages(p.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterPkg, filterUsed])

  const generate = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/vouchers/generate', form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.message || 'Generation failed.')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this voucher? It will also be removed from FreeRADIUS.')) return
    await api.delete(`/vouchers/${id}`)
    load()
  }

  const bulkDelete = async () => {
    if (!filterPkg) return alert('Select a package to bulk delete.')
    if (!confirm('Delete all unused vouchers for this package?')) return
    await api.post('/vouchers/bulk-delete', { package_id: filterPkg })
    load()
  }

  const sell = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const { data } = await api.post('/vouchers/sell', sellForm)
      alert(data.message)
      setSellModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sell voucher.')
    } finally { setSaving(false) }
  }

  const exportCSV = () => {
    if (!filterPkg) return alert('Select a package to export.')
    window.open(`/api/vouchers/export?package_id=${filterPkg}`, '_blank')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Vouchers</h2>
          <p className="text-sm text-gray-400">Generate and manage hotspot voucher codes</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => { setSellForm({ package_id: filterPkg || '', phone_number: '' }); setError(''); setSellModal(true) }}>
            <Send className="w-4 h-4" /> Sell via SMS
          </button>
          <button className="btn-secondary" onClick={exportCSV}><Download className="w-4 h-4" /> Export CSV</button>
          <button className="btn-secondary text-red-500 border-red-200 hover:bg-red-50" onClick={bulkDelete}><Trash2 className="w-4 h-4" /> Delete Unused</button>
          <button className="btn-primary" onClick={() => { setForm({ package_id: '', quantity: 10, prefix: '' }); setError(''); setModal(true) }}>
            <Plus className="w-4 h-4" /> Generate
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select className="input max-w-[200px]" value={filterPkg} onChange={e => setFilterPkg(e.target.value)}>
          <option value="">All Packages</option>
          {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input max-w-[160px]" value={filterUsed} onChange={e => setFilterUsed(e.target.value)}>
          <option value="">All Status</option>
          <option value="0">Unused</option>
          <option value="1">Used</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Code', 'Package', 'Price', 'Status', 'Used By', 'Used At', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vouchers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No vouchers found.</td></tr>
              ) : vouchers.map(v => (
                <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-primary-400" /> {v.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{v.package?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{v.package ? Number(v.package.price).toLocaleString() + '/=' : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={v.is_used ? 'badge badge-gray' : 'badge badge-green'}>
                      {v.is_used ? 'Used' : 'Available'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{v.used_by || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{v.used_at ? new Date(v.used_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3">
                    {!v.is_used && (
                      <button onClick={() => remove(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sell Modal */}
      {sellModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSellModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Sell Voucher via SMS</h3>
            <p className="text-xs text-gray-400 mb-3">Costs 35 UGX from your SMS balance.</p>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={sell} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Package</label>
                <select className="input" value={sellForm.package_id} onChange={e => setSellForm(p => ({ ...p, package_id: e.target.value }))} required>
                  <option value="">Select package…</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer Phone</label>
                <input className="input" placeholder="07XXXXXXXX" value={sellForm.phone_number} onChange={e => setSellForm(p => ({ ...p, phone_number: e.target.value }))} required />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => setSellModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sell & Send SMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Generate Vouchers</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={generate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Package</label>
                <select className="input" value={form.package_id} onChange={e => setForm(p => ({ ...p, package_id: e.target.value }))} required>
                  <option value="">Select package…</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} — {Number(p.price).toLocaleString()}/=</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quantity (max 500)</label>
                <input className="input" type="number" min="1" max="500" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prefix <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" placeholder="e.g. GRG-" maxLength={10} value={form.prefix} onChange={e => setForm(p => ({ ...p, prefix: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
