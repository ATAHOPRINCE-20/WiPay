import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, CheckCircle, XCircle, Clock, X, Info, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

const STATUS_BADGE = {
  success: <span className="badge badge-green flex items-center gap-1"><CheckCircle className="w-3 h-3" />Success</span>,
  pending: <span className="badge badge-yellow flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>,
  failed:  <span className="badge badge-red flex items-center gap-1"><XCircle className="w-3 h-3" />Failed</span>,
}

function getTransactionReason(t) {
  if (!t) return { title: 'Unknown', description: 'No details available.', color: 'bg-gray-50 border-gray-200 text-gray-700' }

  let webhookObj = null
  if (t.webhook_data) {
    try {
      webhookObj = typeof t.webhook_data === 'string' ? JSON.parse(t.webhook_data) : t.webhook_data
    } catch (e) {
      webhookObj = null
    }
  }

  // Extract explicit message from Relworx webhook payload
  const relworxMsg = webhookObj?.message || webhookObj?.reason || webhookObj?.failure_reason || webhookObj?.error || webhookObj?.status_description || webhookObj?.details?.message || webhookObj?.details?.error

  // Check specific status
  if (t.status === 'success') {
    if (t.payment_method === 'cash_agent' || t.agent_name) {
      return {
        title: 'Agent Cash Collection',
        description: `Paid via cash directly to agent/reseller ${t.agent_name || 'Agent'}. Hotspot voucher issued.`,
        color: 'bg-purple-50 border-purple-200 text-purple-800'
      }
    }
    return {
      title: 'Payment Successful',
      description: relworxMsg 
        ? `Relworx Webhook: "${relworxMsg}" (Voucher: ${t.voucher_code || 'Issued'})`
        : `Mobile Money payment of UGX ${Number(t.amount || 0).toLocaleString()} was approved. Wi-Fi voucher [${t.voucher_code || 'Issued'}] was generated and sent via SMS to ${t.phone_number}.`,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-800'
    }
  }

  if (t.status === 'pending') {
    return {
      title: 'Awaiting Customer Approval',
      description: relworxMsg 
        ? `Relworx Status: "${relworxMsg}"` 
        : `USSD payment prompt sent to ${t.phone_number}. Waiting for customer to enter their Mobile Money PIN on their handset.`,
      color: 'bg-amber-50 border-amber-200 text-amber-800'
    }
  }

  // Failed status
  if (t.status === 'failed') {
    if (relworxMsg) {
      return {
        title: 'Relworx Webhook Failure Reason',
        description: `"${relworxMsg}"`,
        color: 'bg-rose-50 border-rose-200 text-rose-800'
      }
    }

    return {
      title: 'Payment Failed',
      description: 'The Mobile Money payment request was declined by the customer or failed at the telecom operator.',
      color: 'bg-rose-50 border-rose-200 text-rose-800'
    }
  }

  return {
    title: `Status: ${t.status}`,
    description: relworxMsg || `Transaction status is marked as ${t.status}.`,
    color: 'bg-gray-50 border-gray-200 text-gray-700'
  }
}

export default function Transactions() {
  const [txns, setTxns]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [channel, setChannel]   = useState('')
  const [status, setStatus]     = useState('')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [copiedCode, setCopiedCode]   = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  const load = async () => {
    setLoading(true)
    const params = {}
    if (channel) params.channel = channel
    if (status)  params.status  = status
    if (from)    params.from    = from
    if (to)      params.to      = to
    const { data } = await api.get('/admin/transactions', { params })
    setTxns(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [channel, status, from, to])

  const fmt = (n) => `UGX ${Number(n || 0).toLocaleString()}`
  
  const successTxns = txns.filter(t => t.status === 'success')
  const momoTxns    = successTxns.filter(t => t.payment_method !== 'cash_agent')
  const agentTxns   = successTxns.filter(t => t.payment_method === 'cash_agent')

  const totalSuccess = successTxns.reduce((s, t) => s + Number(t.amount), 0)
  const momoTotal    = momoTxns.reduce((s, t) => s + Number(t.amount), 0)
  const agentTotal   = agentTxns.reduce((s, t) => s + Number(t.amount), 0)

  const handleCopyVoucher = (code) => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const reasonInfo = selectedRow ? getTransactionReason(selectedRow) : null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Payments & Collections</h2>
        <p className="text-sm text-gray-400">Mobile Money and Agent cash transaction records</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MoMo Collected',     value: fmt(momoTotal),     sub: `${momoTxns.length} online sales`,   color: 'text-emerald-600', border: 'border-emerald-100 bg-emerald-50/20' },
          { label: 'Agent Cash Collected', value: fmt(agentTotal),   sub: `${agentTxns.length} agent sales`,  color: 'text-purple-600', border: 'border-purple-100 bg-purple-50/20' },
          { label: 'Total Combined',     value: fmt(totalSuccess),  sub: `${successTxns.length} overall`,     color: 'text-primary-600', border: 'border-gray-100' },
          { label: 'Failed Payments',    value: txns.filter(t => t.status === 'failed').length, sub: 'Unsuccessful attempts', color: 'text-red-500', border: 'border-gray-100' },
        ].map(({ label, value, sub, color, border }) => (
          <div key={label} className={`card p-4 border ${border}`}>
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-[170px]" value={channel} onChange={e => setChannel(e.target.value)}>
          <option value="">All Channels</option>
          <option value="momo">Mobile Money (MoMo)</option>
          <option value="agent">Agent Cash Sales</option>
        </select>
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel / Agent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer / Phone</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Package</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Voucher</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="hidden xl:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {txns.length === 0
                  ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">No transactions found.</td></tr>
                  : txns.map(t => (
                    <tr 
                      key={t.id} 
                      onClick={() => { setSelectedRow(t); setShowRawJson(false); }}
                      className="hover:bg-primary-50/30 transition-colors cursor-pointer"
                      title="Click to view detailed payment status & reason"
                    >
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-600 truncate">{t.transaction_ref}</td>
                      <td className="px-4 py-3 truncate">
                        {t.agent_name || t.payment_method === 'cash_agent' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700">
                            Agent: {t.agent_name || 'Reseller'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                            Mobile Money
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate">{t.phone_number}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-gray-500 truncate">{t.package_name || t.package?.name || '—'}</td>
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

      {/* Transaction Status & Reason Detail Modal */}
      {selectedRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" 
          onClick={() => setSelectedRow(null)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Transaction Audit Detail
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedRow.transaction_ref}</p>
              </div>
              <button 
                onClick={() => setSelectedRow(null)} 
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Status & Reason Explanation Card */}
            {reasonInfo && (
              <div className={`p-4 rounded-xl border mb-5 ${reasonInfo.color}`}>
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">{reasonInfo.title}</h4>
                    <p className="text-xs mt-1 leading-relaxed">{reasonInfo.description}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Status</span>
                <span className="font-medium">{STATUS_BADGE[selectedRow.status] || selectedRow.status}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Customer Phone</span>
                <span className="font-semibold text-gray-900">{selectedRow.phone_number || 'N/A'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-gray-900 text-base">{fmt(selectedRow.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Channel</span>
                <span className="font-medium text-gray-800">
                  {selectedRow.agent_name || selectedRow.payment_method === 'cash_agent' ? `Agent Cash (${selectedRow.agent_name || 'Reseller'})` : 'Mobile Money (MoMo)'}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Package Purchased</span>
                <span className="font-medium text-gray-900">{selectedRow.package_name || selectedRow.package?.name || '—'}</span>
              </div>
              
              {/* Voucher Code Block with Copy Action */}
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <span className="text-gray-500">Hotspot Voucher</span>
                {selectedRow.voucher_code ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded text-sm border border-primary-100">
                      {selectedRow.voucher_code}
                    </span>
                    <button 
                      onClick={() => handleCopyVoucher(selectedRow.voucher_code)} 
                      className="p-1 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors"
                      title="Copy Voucher Code"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-400 font-mono">—</span>
                )}
              </div>

              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Transaction Date</span>
                <span className="text-gray-700 text-xs font-mono">
                  {new Date(selectedRow.created_at).toLocaleString()}
                </span>
              </div>

              {/* Technical Raw Payload Collapsible */}
              {selectedRow.webhook_data && (
                <div className="mt-4 pt-2">
                  <button 
                    onClick={() => setShowRawJson(!showRawJson)} 
                    className="flex items-center justify-between w-full text-xs text-gray-500 hover:text-gray-700 font-medium py-1"
                  >
                    <span>Technical Gateway Response</span>
                    {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showRawJson && (
                    <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 text-[11px] rounded-xl overflow-x-auto font-mono max-h-40">
                      {typeof selectedRow.webhook_data === 'string' 
                        ? JSON.stringify(JSON.parse(selectedRow.webhook_data), null, 2)
                        : JSON.stringify(selectedRow.webhook_data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <button 
              className="btn-secondary w-full mt-6" 
              onClick={() => setSelectedRow(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
