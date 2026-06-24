import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'

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

  const load = async () => {
    setLoading(true)
    const params = {}
    if (status) params.status = status
    if (from)   params.from   = from
    if (to)     params.to     = to
    const { data } = await api.get('/transactions', { params })
    setTxns(data.data || data)
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

      <div className="grid grid-cols-3 gap-4">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Reference','Phone','Package','Amount','Voucher','Status','Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {txns.length === 0
                ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No transactions found.</td></tr>
                : txns.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{t.transaction_ref}</td>
                    <td className="px-4 py-3 text-gray-700">{t.phone_number}</td>
                    <td className="px-4 py-3 text-gray-500">{t.package?.name || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{fmt(t.amount)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-600">{t.voucher_code || '—'}</td>
                    <td className="px-4 py-3">{STATUS_BADGE[t.status] || t.status}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
