import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, MessageSquare, Wallet, Send } from 'lucide-react'

export default function Messages() {
  const [balance, setBalance] = useState(0)
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState({ amount: 5000, phone_number: '' })
  const [saving, setSaving]     = useState(false)
  const [pollRef, setPollRef]   = useState(null)
  const [pollStatus, setPollStatus] = useState('')
  const [error, setError]       = useState('')
  const [message, setMessage]   = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [b, l] = await Promise.all([api.get('/sms/balance'), api.get('/sms/logs')])
      setBalance(b.data.balance)
      setLogs(l.data)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const buyCredits = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const { data } = await api.post('/sms/buy', form)
      setPollRef(data.reference)
      setPollStatus('pending')
      setMessage('Payment request sent. Approve on your phone.')
      setModal(false)
      startPolling(data.reference)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate purchase.')
    } finally { setSaving(false) }
  }

  const startPolling = (ref) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/sms/status/${ref}`)
        setPollStatus(data.status)
        if (data.status === 'success') {
          clearInterval(interval)
          setPollRef(null)
          setMessage('SMS credits added successfully!')
          load()
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setPollRef(null)
          setError('Payment failed.')
        }
      } catch (_) {}
    }, 4000)
    setTimeout(() => clearInterval(interval), 120000)
  }

  const statusBadge = (status) => {
    const map = {
      success: 'badge-green',
      failed:  'badge-red',
      skipped_no_creds: 'badge-yellow',
    }
    return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>
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
          <h2 className="text-lg font-bold text-gray-900">SMS Messages</h2>
          <p className="text-sm text-gray-400">Manage SMS balance and view send history</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setModal(true) }}>
          <Wallet className="w-4 h-4" /> Buy SMS Credits
        </button>
      </div>

      {message && <p className="text-sm text-primary-700 bg-primary-50 p-3 rounded-lg">{message}</p>}
      {error   && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
      {pollRef && pollStatus === 'pending' && (
        <p className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Waiting for payment approval…
        </p>
      )}

      {/* Balance card */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <p className="text-xs text-gray-400">SMS Balance</p>
          <p className="text-2xl font-bold text-gray-900">UGX {Number(balance).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-0.5">Each voucher sale costs 35 UGX</p>
        </div>
      </div>

      {/* Logs */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Send History</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {['Phone', 'Message', 'Status', 'Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm">No SMS logs yet.</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{log.phone_number}</td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{log.message}</td>
                <td className="px-4 py-3">{statusBadge(log.status)}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Send className="w-4 h-4 text-primary-500" /> Buy SMS Credits
            </h3>
            <form onSubmit={buyCredits} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount (UGX)</label>
                <input className="input" type="number" min="500" step="500" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Money Number</label>
                <input className="input" placeholder="07XXXXXXXX" value={form.phone_number} onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))} required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pay via Mobile Money'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
