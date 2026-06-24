import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, CheckCircle, XCircle, Clock, X } from 'lucide-react'

const STATUS_BADGE = {
  success: <span className="badge badge-green flex items-center gap-1"><CheckCircle className="w-3 h-3" />Success</span>,
  pending: <span className="badge badge-yellow flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>,
  failed:  <span className="badge badge-red flex items-center gap-1"><XCircle className="w-3 h-3" />Failed</span>,
}

export default function Transactions() {
  const [txns, setTxns]     = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [selectedRow, setSelectedRow] = useState(null)

  const load = async () => {
    setLoading(true)
    const params = {}
    if (status) params.status = status
    if (from)   params.from   = from
    if (to)     params.to     = to
    const { data } = await api.get('/admin/transactions', { params })
    setTxns(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [status, from, to])

  const fmt = (n) => `UGX ${Number(n || 0).toLocaleString()}`
  const totalSuccess = txns.filter(t => t.status === 'success').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Payments</h2>
        <p className="text-sm text-gray-400">All mobile money transactions</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Collected', value: fmt(totalSuccess), color: 'text-primary-600' },
          { label: 'Successful',      value: txns.filter(t => t.status === 'success').length, color: 'text-green-600' },
          { label: 'Failed',          value: txns.filter(t => t.status === 'failed').length,  color: 'text-red-500'   },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-[160px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <input type="date" className="input max-w-[160px]" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input max-w-[160px]" value={to}   onChange={e => setTo(e.target.value)}   />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : (
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Voucher</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {txns.length === 0
                  ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No transactions found.</td></tr>
                  : txns.map(t => (
                    <tr 
                      key={t.id} 
                      onClick={() => setSelectedRow(t)}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                    >
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-600 truncate">{t.transaction_ref}</td>
                      <td className="px-4 py-3 text-gray-700 truncate">{t.phone_number}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{t.package?.name || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 truncate">{fmt(t.amount)}</td>
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-primary-600 truncate">{t.voucher_code || '—'}</td>
                      <td className="px-4 py-3">{STATUS_BADGE[t.status] || t.status}</td>
                      <td className="hidden xl:table-cell px-4 py-3 text-gray-400 text-xs truncate">{new Date(t.created_at).toLocaleString()}</td>
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
                <h3 className="text-lg font-bold text-gray-900">{selectedRow.phone_number}</h3>
                <p className="text-xs text-gray-400">Transaction Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Status</span>
                <span className="text-sm font-medium text-gray-900">{STATUS_BADGE[selectedRow.status] || selectedRow.status}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Amount</span>
                <span className="text-sm font-medium text-gray-900">{fmt(selectedRow.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Reference</span>
                <span className="text-sm font-medium text-gray-900 font-mono">{selectedRow.transaction_ref}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 lg:hidden">
                <span className="text-xs text-gray-500">Package</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.package?.name || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 md:hidden">
                <span className="text-xs text-gray-500">Voucher</span>
                <span className="text-sm font-medium text-primary-600 font-mono">{selectedRow.voucher_code || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2 xl:hidden">
                <span className="text-xs text-gray-500">Date</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(selectedRow.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            <button className="btn-secondary w-full mt-5" onClick={() => setSelectedRow(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
