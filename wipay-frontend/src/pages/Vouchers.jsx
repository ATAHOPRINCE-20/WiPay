import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Download, Trash2, Loader2, Tag, Send, X, Printer, CheckSquare, Square, Wifi, Unlink, Router, MoreVertical } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import ConfirmModal from '../components/ConfirmModal'

export default function Vouchers() {
  const { showToast } = useToast()
  const { admin } = useAuth()

  const isSubscriptionTenant = admin?.role === 'admin' && admin?.billing_type === 'subscription'
  const isExpired = isSubscriptionTenant && admin?.subscription_expiry && new Date(admin.subscription_expiry) < new Date()
  const [vouchers, setVouchers]     = useState([])
  const [packages, setPackages]     = useState([])
  const [routers, setRouters]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [sellModal, setSellModal]   = useState(false)
  const [printModal, setPrintModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmUnbindVoucher, setConfirmUnbindVoucher] = useState(null)
  const [confirmBulk, setConfirmBulk]         = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [sellForm, setSellForm]     = useState({ package_id: '', phone_number: '' })
  const [filterPkg, setFilterPkg]   = useState('')
  const [filterRouter, setFilterRouter] = useState('')
  const [filterUsed, setFilterUsed] = useState('')
  const [agents, setAgents]         = useState([])
  const [form, setForm]             = useState({ package_id: '', quantity: 10, prefix: '', code_length: 8, char_type: 'upper_num', is_giveaway: false, batch_ref: '', agent_id: '' })
  const [selectedRow, setSelectedRow] = useState(null)
  const [printPkgFilter, setPrintPkgFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [cardTemplate, setCardTemplate] = useState('grid') // 'grid' (A4 3-col) or 'thermal' (POS 1-col)

  const load = async () => {
    setLoading(true)
    const params = {}
    if (filterPkg)  params.package_id = filterPkg
    if (filterRouter) params.router_id = filterRouter
    if (filterUsed !== '') params.is_used = filterUsed
    const [v, p, a, r] = await Promise.all([
      api.get('/admin/vouchers', { params }), 
      api.get('/admin/packages'),
      api.get('/admin/agents'),
      api.get('/admin/routers')
    ])
    setVouchers(Array.isArray(v.data) ? v.data : (v.data.data || []))
    setPackages(Array.isArray(p.data) ? p.data : [])
    setAgents(Array.isArray(a.data) ? a.data : [])
    setRouters(Array.isArray(r.data) ? r.data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filterPkg, filterRouter, filterUsed])

  const executeUnbindDevice = async () => {
    if (!confirmUnbindVoucher) return
    try {
      const { data } = await api.post('/admin/vouchers/unbind-device', { voucher_id: confirmUnbindVoucher.id, code: confirmUnbindVoucher.code })
      showToast(data.message || `Device unbound from voucher '${confirmUnbindVoucher.code}'. Voucher can now be used on a new device.`, 'success')
      if (selectedRow?.id === confirmUnbindVoucher.id) setSelectedRow(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to unbind device from voucher.', 'error')
    } finally {
      setConfirmUnbindVoucher(null)
    }
  }

  const generate = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      await api.post('/admin/vouchers/generate', form)
      setModal(false); load()
      showToast(`${form.quantity} vouchers generated successfully!`, 'success')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Generation failed.')
    } finally { setSaving(false) }
  }

  const remove = (id) => {
    setConfirmDeleteId(id)
  }

  const executeDelete = async () => {
    if (!confirmDeleteId) return
    try {
      await api.delete(`/admin/vouchers/${confirmDeleteId}`)
      load()
      showToast('Voucher deleted successfully.', 'success')
      if (selectedRow?.id === confirmDeleteId) setSelectedRow(null)
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete voucher.', 'error')
    }
    setConfirmDeleteId(null)
  }

  const bulkDelete = () => {
    if (!filterPkg) return showToast('Select a package to bulk delete.', 'warning')
    setConfirmBulk(true)
  }

  const executeBulkDelete = async () => {
    if (!filterPkg) return
    try {
      await api.post('/admin/vouchers/bulk-delete', { package_id: filterPkg, filter: 'unused' })
      load()
      showToast('Bulk delete of unused vouchers completed.', 'success')
    } catch (_) {}
    setConfirmBulk(false)
  }

  const executeCleanExpired = async () => {
    if (!filterPkg) return showToast('Select a package to clean expired vouchers.', 'warning')
    try {
      await api.post('/admin/vouchers/bulk-delete', { package_id: filterPkg, filter: 'expired' })
      load()
      showToast('Cleaned expired vouchers successfully.', 'success')
    } catch (_) {}
  }

  const sell = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const { data } = await api.post('/admin/sell-voucher', sellForm)
      showToast(data.message, 'success')
      setSellModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to sell voucher.')
    } finally { setSaving(false) }
  }

  const exportCSV = () => {
    if (!filterPkg) return showToast('Select a package to export.', 'warning')
    window.open(`/api/admin/vouchers/export?package_id=${filterPkg}`, '_blank')
  }

  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)

  const executeDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    try {
      const { data } = await api.post('/admin/vouchers/delete-selected', { ids: selectedIds })
      setSelectedIds([])
      load()
      showToast(data.message || 'Selected vouchers deleted successfully.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete selected vouchers.', 'error')
    }
    setConfirmDeleteSelected(false)
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === vouchers.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(vouchers.map(v => v.id))
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const getVouchersToPrint = () => {
    let list = vouchers
    if (selectedIds.length > 0) {
      list = vouchers.filter(v => selectedIds.includes(v.id))
    } else {
      list = vouchers.filter(v => !v.is_used)
    }

    if (printPkgFilter) {
      list = list.filter(v => String(v.package_id) === String(printPkgFilter))
    }
    return list
  }

  const triggerBrowserPrint = () => {
    window.print()
  }

  const formatValidity = (pkg) => {
    if (!pkg) return 'Unlimited'
    if (pkg.validity_unit === 'minutes' && pkg.validity_minutes > 0) return `${pkg.validity_minutes}m`
    const hours = parseFloat(pkg.validity_hours || 0)
    if (hours > 0) {
      if (hours >= 720 && hours % 720 === 0) return `${hours / 720} Mo`
      if (hours >= 168 && hours % 168 === 0) return `${hours / 168} Wk`
      if (hours >= 24 && hours % 24 === 0) return `${hours / 24} Days`
      if (hours < 1) return `${Math.round(hours * 60)}m`
      return `${hours}h`
    }
    if (pkg.validity_minutes > 0) return `${pkg.validity_minutes}m`
    return 'Unlimited'
  }

  const printableVouchers = getVouchersToPrint()

  return (
    <div className="space-y-5">
      {/* Printable Voucher CSS for Mikhmon-Style Print Sheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #mikhmon-print-sheet, #mikhmon-print-sheet * {
            visibility: visible !important;
          }
          #mikhmon-print-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Vouchers</h2>
          <p className="text-sm text-gray-400">Generate, print Mikhmon tickets, and manage hotspot vouchers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary text-primary-700 bg-primary-50 border-primary-200 hover:bg-primary-100" onClick={() => setPrintModal(true)}>
            <Printer className="w-4 h-4" /> Print Cards {selectedIds.length > 0 && `(${selectedIds.length})`}
          </button>
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

      {/* Filters & Selection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select className="input max-w-[180px]" value={filterRouter} onChange={e => setFilterRouter(e.target.value)}>
            <option value="">All Routers (Global)</option>
            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="input max-w-[180px]" value={filterPkg} onChange={e => setFilterPkg(e.target.value)}>
            <option value="">All Packages</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input max-w-[150px]" value={filterUsed} onChange={e => setFilterUsed(e.target.value)}>
            <option value="">All Status</option>
            <option value="0">Unused Only</option>
            <option value="1">Used Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleSelectAll} className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
            {selectedIds.length === vouchers.length && vouchers.length > 0 ? <CheckSquare className="w-4 h-4 text-primary-600" /> : <Square className="w-4 h-4 text-gray-400" />}
            {selectedIds.length === vouchers.length && vouchers.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg border border-primary-100">
                {selectedIds.length} Selected
              </span>
              <button 
                onClick={() => setConfirmDeleteSelected(true)}
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium"
                title="Permanently remove selected vouchers from Database & FreeRADIUS"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedIds.length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input 
                      type="checkbox" 
                      checked={vouchers.length > 0 && selectedIds.length === vouchers.length}
                      onChange={toggleSelectAll}
                      className="rounded text-primary-500 focus:ring-primary-400 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Code</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Package</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Price</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Used By</th>
                  <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Used At</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-12 md:w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vouchers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No vouchers found.</td></tr>
                ) : vouchers.map(v => (
                  <tr 
                    key={v.id} 
                    onClick={() => setSelectedRow(v)}
                    className={`hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default ${selectedIds.includes(v.id) ? 'bg-primary-50/30' : ''}`}
                  >
                    <td className="w-10 px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(v.id)}
                        onChange={() => toggleSelect(v.id)}
                        className="rounded text-primary-500 focus:ring-primary-400 cursor-pointer"
                      />
                    </td>
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
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 truncate">{v.package?.name || v.package_name || '—'}</td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-600 truncate">
                      {(v.package?.price ?? v.package_price) !== undefined && (v.package?.price ?? v.package_price) !== null 
                        ? Number(v.package?.price ?? v.package_price).toLocaleString() + '/=' 
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={v.is_used ? 'badge badge-gray' : 'badge badge-green'}>
                        {v.is_used ? 'Used' : 'Available'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs truncate">{v.used_by || '—'}</td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-400 text-xs truncate">{v.used_at ? new Date(v.used_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <div className="hidden md:flex items-center justify-end gap-1">
                          {v.used_by && (
                            <button 
                              onClick={() => setConfirmUnbindVoucher(v)} 
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" 
                              title="Unbind Device (Clear MAC so voucher can be used on a new phone/laptop)"
                            >
                              <Unlink className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                          )}
                          <button onClick={() => remove(v.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Voucher">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button 
                          onClick={() => setSelectedRow(v)}
                          className="md:hidden p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition border border-gray-200 shadow-xs"
                          title="Voucher Actions"
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

      {/* Mikhmon Print Preview Modal */}
      {printModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPrintModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-primary-500" /> Mikhmon Bulk Voucher Printer
                </h3>
                <p className="text-xs text-gray-400">Ready to print {printableVouchers.length} voucher card(s)</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Package Filter Selector */}
                <select 
                  value={printPkgFilter} 
                  onChange={e => setPrintPkgFilter(e.target.value)}
                  className="select text-xs py-1.5 px-3 border-gray-200 rounded-lg max-w-[160px]"
                  title="Filter Vouchers by Package"
                >
                  <option value="">All Packages</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>

                {/* Layout Format Selector */}
                <select 
                  value={cardTemplate} 
                  onChange={e => setCardTemplate(e.target.value)}
                  className="select text-xs py-1.5 px-3 border-gray-200 rounded-lg"
                >
                  <option value="grid">A4 Sheet (3-Column Grid)</option>
                  <option value="thermal">POS Thermal Roll (1-Column Ticket)</option>
                </select>
                <button onClick={triggerBrowserPrint} className="btn-primary flex items-center gap-2">
                  <Printer className="w-4 h-4" /> Print Now
                </button>
                <button onClick={() => setPrintModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Preview Sheet Container */}
            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
              {printableVouchers.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Printer className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-gray-600">No vouchers selected to print.</p>
                  <p className="text-xs mt-1">Select vouchers from the table or filter by package to generate cards.</p>
                </div>
              ) : (
                <div id="mikhmon-print-sheet">
                  <div className={cardTemplate === 'thermal' ? 'max-w-[280px] mx-auto space-y-3' : 'grid grid-cols-2 sm:grid-cols-3 gap-3'}>
                    {printableVouchers.map((v) => (
                      <div 
                        key={v.id} 
                        className="bg-white border-2 border-dashed border-gray-400 rounded-xl p-3 shadow-sm text-black font-sans relative overflow-hidden break-inside-avoid"
                      >
                        {/* Ticket Header */}
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                              📶
                            </span>
                            <span className="font-bold text-xs uppercase tracking-wider text-gray-900 truncate max-w-[120px]">
                              {admin?.business_name || 'Wi-Fi Hotspot'}
                            </span>
                          </div>
                          <span className="font-extrabold text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">
                            {v.package ? `${Number(v.package.price).toLocaleString()}/=` : 'Voucher'}
                          </span>
                        </div>

                        {/* Voucher Code Box */}
                        <div className="text-center my-2">
                          <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Hotspot Voucher Code</p>
                          <div className="my-1 py-1.5 px-2 bg-gray-50 border border-gray-300 rounded-lg">
                            <span className="font-mono text-xl font-extrabold tracking-widest text-gray-900 select-all">
                              {v.code}
                            </span>
                          </div>
                        </div>

                        {/* Ticket Details Footer */}
                        <div className="flex items-center justify-between text-[10px] text-gray-600 pt-1 border-t border-gray-100">
                          <span><strong>Package:</strong> {v.package?.name || 'Standard'}</span>
                          <span><strong>Valid:</strong> {formatValidity(v.package)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-gray-400 mt-1">
                          <span>Speed: {v.package?.rate_limit || '1M/1M'}</span>
                          <span>wifi.portal</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-2">
              {selectedRow.used_by && (
                <button 
                  className="btn-secondary w-full justify-center flex items-center gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 font-semibold"
                  onClick={() => {
                    const target = selectedRow;
                    setSelectedRow(null);
                    setConfirmUnbindVoucher(target);
                  }}
                >
                  <Unlink className="w-4 h-4 text-amber-600" /> Unbind Device ({selectedRow.used_by})
                </button>
              )}
              {!selectedRow.is_used && (
                <div className="flex gap-2">
                  <button 
                    className="btn-primary flex-1 justify-center flex items-center gap-2"
                    onClick={() => { setSelectedIds([selectedRow.id]); setSelectedRow(null); setPrintModal(true); }}
                  >
                    <Printer className="w-4 h-4" /> Print Ticket
                  </button>
                  <button 
                    className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 flex-1 justify-center flex items-center gap-2"
                    onClick={() => remove(selectedRow.id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
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
            {isExpired && (
              <div className="mb-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">
                ⚠️ Subscription Expired: Voucher generation is disabled. Please renew your subscription to generate vouchers.
              </div>
            )}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Code Length</label>
                  <input className="input" type="number" min="4" max="16" value={form.code_length} onChange={e => setForm(p => ({ ...p, code_length: parseInt(e.target.value) || 8 }))} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Character Set</label>
                  <select 
                    className="input" 
                    value={form.char_type || 'upper_num'} 
                    onChange={e => setForm(p => ({ ...p, char_type: e.target.value }))}
                  >
                    <option value="upper_num">Upper & Numbers (ABC92)</option>
                    <option value="numbers">Numbers Only (839204)</option>
                    <option value="lower_num">Lower & Numbers (abc92)</option>
                    <option value="mixed_num">Mixed Case & Numbers (AbC92)</option>
                    <option value="upper">Uppercase Only (ABCDEF)</option>
                    <option value="lower">Lowercase Only (abcdef)</option>
                    <option value="mixed">Mixed Case Only (AbCdEf)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assign to Agent <span className="text-gray-400 font-normal">(optional)</span></label>
                <select className="input" value={form.agent_id} onChange={e => setForm(p => ({ ...p, agent_id: e.target.value }))}>
                  <option value="">Unassigned (General Stock)</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.username} ({a.email || a.business_phone || 'Agent'})</option>)}
                </select>
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

      {/* Delete Single Voucher Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={executeDelete}
        title="Delete Voucher"
        message="Are you sure you want to delete this voucher? It will also be removed from FreeRADIUS."
        confirmText="Delete Voucher"
        type="danger"
      />

      {/* Bulk Delete Unused Vouchers Confirm Modal */}
      <ConfirmModal
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={executeBulkDelete}
        title="Bulk Delete Unused Vouchers"
        message="Are you sure you want to delete all unused vouchers for this package?"
        confirmText="Delete All Unused"
        type="danger"
      />

      {/* Delete Selected Vouchers Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDeleteSelected}
        onClose={() => setConfirmDeleteSelected(false)}
        onConfirm={executeDeleteSelected}
        title="Delete Selected Vouchers"
        message={`Are you sure you want to permanently delete ${selectedIds.length} selected voucher(s)? They will be removed from MySQL database and FreeRADIUS so they can no longer be used for authentication.`}
        confirmText={`Delete ${selectedIds.length} Voucher(s)`}
        type="danger"
      />

      {/* Unbind Device Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmUnbindVoucher}
        onClose={() => setConfirmUnbindVoucher(null)}
        onConfirm={executeUnbindDevice}
        title="Unbind Device from Voucher"
        message={`Are you sure you want to unbind device (${confirmUnbindVoucher?.used_by || 'MAC'}) from voucher '${confirmUnbindVoucher?.code}'? The active session will be disconnected and the voucher will become available for login on a new phone or laptop.`}
        confirmText="Unbind Device"
        type="warning"
      />
    </div>
  )
}
