import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, RefreshCw, Calendar, CreditCard, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

export default function Subscription() {
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [pollRef, setPollRef] = useState('')
  const [pollStatus, setPollStatus] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ phone_number: '', months: '1' })

  const load = async () => {
    setLoading(true)
    try {
      const [s, h] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/subscription/history')
      ])
      setStats(s.data)
      setHistory(Array.isArray(h.data) ? h.data : [])
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Background polling for payment status
  useEffect(() => {
    if (!pollRef) return
    let active = true

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/admin/subscription-status/${pollRef}`)
        if (!active) return

        if (data.status === 'success') {
          setPollStatus('success')
          setPollRef('')
          load() // Refresh data
        } else if (data.status === 'failed') {
          setPollStatus('failed')
          setPollRef('')
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 2500)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [pollRef])

  const renew = async (e) => {
    e.preventDefault()
    setRenewing(true)
    setError('')
    setPollStatus('pending')
    try {
      const { data } = await api.post('/admin/renew-subscription', form)
      setPollRef(data.reference)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate subscription renewal.')
      setPollStatus('')
    } finally {
      setRenewing(false)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return <span className="badge badge-green flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> Paid</span>
      case 'pending':
        return <span className="badge badge-yellow flex items-center gap-1 w-fit"><Clock className="w-3 h-3 animate-pulse" /> Pending</span>
      default:
        return <span className="badge badge-red flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> Failed</span>
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    )
  }

  const expiry = stats?.subscription?.expiry
  const isExpired = expiry ? new Date(expiry) < new Date() : true
  const billingType = stats?.finance?.billing_type || 'subscription' // fallback or check admin settings

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Subscription Billing</h2>
        <p className="text-sm text-gray-400">View current account status, expiry, and pay subscription fees</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Current Plan Card */}
        <div className="card p-6 md:col-span-2 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 text-white border-none shadow-xl">
          <div className="absolute right-0 top-0 opacity-10 -mr-6 -mt-6">
            <Calendar className="w-48 h-48" />
          </div>
          
          <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">Billing Account Status</span>
              {isExpired ? (
                <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Expired</span>
              ) : (
                <span className="bg-green-500/20 text-green-300 border border-green-500/30 text-xs font-semibold px-2.5 py-1 rounded-full uppercase">Active</span>
              )}
            </div>

            <div>
              <p className="text-xs text-slate-400">Expiry Date</p>
              <h3 className="text-2xl font-black mt-1">
                {expiry ? new Date(expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No Expiry Set'}
              </h3>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Billing Mode</p>
                <p className="text-sm font-semibold capitalize mt-0.5">{billingType}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Monthly Rate</p>
                <p className="text-sm font-semibold mt-0.5">UGX 20,000</p>
              </div>
            </div>
          </div>
        </div>

        {/* Renew Plan Form */}
        <div className="card p-6 flex flex-col justify-between shadow-md">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-primary-500" /> Renew Subscription</h3>
          
          {error && <p className="mb-3 text-xs text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          
          {pollRef ? (
            <div className="py-6 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
              <p className="text-sm font-semibold text-gray-700">Waiting for payment confirmation...</p>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">Please check your phone for the Mobile Money payment request prompt (PIN request).</p>
            </div>
          ) : pollStatus === 'success' ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
              <p className="text-sm font-semibold text-gray-700">Subscription Renewed!</p>
              <button className="btn-secondary text-xs" onClick={() => setPollStatus('')}>Done</button>
            </div>
          ) : (
            <form onSubmit={renew} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number (MTN/Airtel)</label>
                <input 
                  className="input" 
                  placeholder="07XXXXXXXX" 
                  value={form.phone_number} 
                  onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))} 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Duration (Months)</label>
                <select 
                  className="input" 
                  value={form.months} 
                  onChange={e => setForm(p => ({ ...p, months: e.target.value }))}
                >
                  <option value="1">1 Month (UGX 20,000)</option>
                  <option value="3">3 Months (UGX 60,000)</option>
                  <option value="6">6 Months (UGX 120,000)</option>
                  <option value="12">12 Months (UGX 240,000)</option>
                </select>
              </div>
              <button type="submit" disabled={renewing} className="btn-primary w-full justify-center text-sm py-2">
                {renewing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pay via Mobile Money'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Subscription History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Renewal Transactions History</h3>
        <div className="card overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone Number</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount (UGX)</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                    No transactions found.
                  </td>
                </tr>
              ) : history.map(item => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate">{item.reference}</td>
                  <td className="px-4 py-3 text-gray-500">{item.phone_number}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{Number(item.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{item.months} {item.months === 1 ? 'Month' : 'Months'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs truncate">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
