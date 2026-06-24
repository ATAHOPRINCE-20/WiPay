import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Download, Trash2, Loader2, Tag, Send, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'

export default function Vouchers() {
  const { showToast } = useToast()
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
  const [form, setForm] = useState({ package_id: '', quantity: 10, prefix: '', code_length: 8, is_giveaway: false, batch_ref: '' })
  const [selectedRow, setSelectedRow] = useState(null)

  const load = async () => {
    setLoading(true)
    const params = {}
    if (filterPkg)  params.package_id = filterPkg
    if (filterUsed !== '') params.is_used = filterUsed
    const [v, p] = await Promise.all([api.get('/admin/vouchers', { params }), api.get('/admin/packages')])
    setVouchers(Array.isArray(v.data) ? v.data : (v.data.data || []))
    setPackages(Array.isArray(p.data) ? p.data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filterPkg, filterUsed])

  const generate = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/admin/vouchers/generate', form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.message || 'Generation failed.')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this voucher? It will also be removed from FreeRADIUS.')) return
    await api.delete(`/admin/vouchers`, { data: { ids: [id] } })
    load()
    if (selectedRow?.id === id) setSelectedRow(null)
  }

  const bulkDelete = async () => {
    if (!filterPkg) return showToast('Select a package to bulk delete.', 'warning')
    if (!confirm('Delete all unused vouchers for this package?')) return
    await api.post('/admin/vouchers/bulk-delete', { package_id: filterPkg })
    load()
  }

  const sell = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const { data } = await api.post('/admin/sell-voucher', sellForm)
      showToast(data.message, 'success')
      setSellModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sell voucher.')
    } finally { setSaving(false) }
  }

  const exportCSV = () => {
    if (!filterPkg) return showToast('Select a package to export.', 'warning')
    window.open(`/api/vouchers/export?package_id=${filterPkg}`, '_blank')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Vouchers</h2>
          <p className="text-sm text-gray-400">Generate and manage hotspot voucher codes</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => { setSellForm({ package_id: filterPkg || '', phone_number: '' }); setError(''); setSellModal(true) }}>
            <Send className="w-4 h-4" /> Sell via SMS
          </button>
          <button className="btn-secondary" onClick={exportCSV}><Download className="w-4 h-4" /> CSV</button>
          <button className="btn-secondary text-red-500 border-red-200 hover:bg-red-50" onClick={bulkDelete}><Trash2 className="w-4 h-4" /> Unused</button>
          <button className="btn-primary" onClick={() => { setForm({ package_id: '', quantity: 10, prefix: '', code_length: 8, is_giveaway: false, batch_ref: '' }); setError(''); setModal(true) }}>
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
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Used By</th>
                  <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Used At</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vouchers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No vouchers found.</td></tr>
                ) : vouchers.map(v => (
                  <tr 
                    key={v.id} 
                    onClick={() => setSelectedRow(v)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-gray-800 flex items-center gap-1.5 truncate">
                        <Tag className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" /> {v.code}
                        {v.is_giveaway === 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">Free</span>
                        )}
                        {v.package_ref && (
                          <span className="text-[10px] text-gray-400 font-normal truncate" title={`Batch: ${v.package_ref}`}>({v.package_ref})</span>
                        )}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 truncate">{v.package?.name || '—'}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-600 truncate">{v.package ? Number(v.package.price).toLocaleString() + '/=' : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={v.is_used ? 'badge badge-gray' : 'badge badge-green'}>
                        {v.is_used ? 'Used' : 'Available'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs truncate">{v.used_by || '—'}</td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-400 text-xs truncate">{v.used_at ? new Date(v.used_at).toLocaleString() : '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-right">
                      {!v.is_used && (
                        <button onClick={(e) => { e.stopPropagation(); remove(v.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
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
                <h3 className="text-lg font-bold text-gray-900 font-mono">{selectedRow.code}</h3>
                <p className="text-xs text-gray-400">Voucher Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Package</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.package?.name || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Price</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.package ? Number(selectedRow.package.price).toLocaleString() + ' UGX' : '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Status</span>
                <span className="text-sm font-medium text-gray-900">
                  <span className={selectedRow.is_used ? 'badge badge-gray' : 'badge badge-green'}>
                    {selectedRow.is_used ? 'Used' : 'Available'}
                  </span>
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Used By</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRow.used_by || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 xl:hidden">
                <span className="text-xs text-gray-500">Used At</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedRow.used_at ? new Date(selectedRow.used_at).toLocaleString() : '—'}
                </span>
              </div>
              {selectedRow.package_ref && (
                <div className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-xs text-gray-500">Batch Reference</span>
                  <span className="text-sm font-medium text-gray-900">{selectedRow.package_ref}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Type</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.is_giveaway ? 'Giveaway (Free)' : 'Regular'}</span>
              </div>
            </div>

            {/* Actions */}
            {!selectedRow.is_used && (
              <div className="mt-6">
                <button 
                  className="btn-secondary w-full text-red-600 border-red-200 hover:bg-red-50 justify-center flex items-center gap-2"
                  onClick={() => remove(selectedRow.id)}
                >
                  <Trash2 className="w-4 h-4" /> Delete Voucher
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sell Modal */}
      {sellModal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setSellModal(false)}>
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
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Code Length</label>
                <input className="input" type="number" min="4" max="16" value={form.code_length} onChange={e => setForm(p => ({ ...p, code_length: parseInt(e.target.value) || 8 }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Batch Reference <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" placeholder="e.g. Promo-Jun" value={form.batch_ref} onChange={e => setForm(p => ({ ...p, batch_ref: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.is_giveaway} onChange={e => setForm(p => ({ ...p, is_giveaway: e.target.checked }))} className="rounded text-primary-500 focus:ring-primary-400" />
                  Mark as Giveaway (excludes from revenue)
                </label>
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
