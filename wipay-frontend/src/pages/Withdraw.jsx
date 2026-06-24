import { useState, useEffect } from 'react'
import api from '../services/api'
import { 
  Wallet, Clock, Banknote, CheckCircle, Search, SlidersHorizontal, 
  Upload, X, ArrowRight, Check, AlertCircle, RefreshCw 
} from 'lucide-react'
import { useToast } from '../context/ToastContext'

export default function Withdraw() {
  const { showToast } = useToast()
  const [stats, setStats] = useState({
    net_balance: 0,
    total_revenue: 0,
    total_withdrawn: 0,
    pending_withdrawals: 0
  })
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form') // form -> otp -> feedback
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState({ success: false, message: '' })

  const fetchStatsAndHistory = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/withdrawals')
      ])
      
      setStats({
        net_balance: statsRes.data.revenue?.net_balance ?? 0,
        total_revenue: statsRes.data.revenue?.total_revenue ?? 0,
        total_withdrawn: statsRes.data.counts?.total_withdrawn ?? 0,
        pending_withdrawals: statsRes.data.counts?.pending_withdrawals ?? 0
      })
      setWithdrawals(historyRes.data || [])
    } catch (e) {
      console.error('Error fetching dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatsAndHistory()
  }, [])

  const initiateWithdrawal = async (e) => {
    e.preventDefault()
    if (!amount || !phone) return
    
    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount', 'error')
      return
    }

    if (numAmount > stats.net_balance) {
      showToast('Insufficient funds', 'error')
      return
    }

    setActionLoading(true)
    try {
      await api.post('/admin/withdraw/initiate', {
        amount: numAmount,
        phone_number: phone
      })
      setStep('otp')
    } catch (e) {
      showToast(e.response?.data?.error || e.response?.data?.message || 'Failed to initiate withdrawal', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const confirmWithdrawal = async (e) => {
    e.preventDefault()
    if (!otp) return

    setActionLoading(true)
    try {
      await api.post('/admin/withdraw', {
        amount: Number(amount),
        phone_number: phone,
        otp,
        description: description || 'Admin Payout'
      })
      
      setFeedback({
        success: true,
        message: 'Your withdrawal request has been successfully processed.'
      })
      setStep('feedback')
      fetchStatsAndHistory()
    } catch (e) {
      setFeedback({
        success: false,
        message: e.response?.data?.error || e.response?.data?.message || 'Verification failed. Please check your OTP and try again.'
      })
      setStep('feedback')
    } finally {
      setActionLoading(false)
    }
  }

  const resetModal = () => {
    setModalOpen(false)
    setAmount('')
    setPhone('')
    setDescription('')
    setOtp('')
    setStep('form')
    setFeedback({ success: false, message: '' })
  }

  const filteredWithdrawals = withdrawals.filter(w => {
    const term = searchTerm.toLowerCase()
    return (
      (w.reference && w.reference.toLowerCase().includes(term)) ||
      (w.phone_number && w.phone_number.toLowerCase().includes(term)) ||
      (w.description && w.description.toLowerCase().includes(term)) ||
      (w.status && w.status.toLowerCase().includes(term))
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Withdrawals</h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors text-sm"
        >
          <Upload className="w-4 h-4 transform rotate-180" />
          Request Withdrawal
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Mobile Money Sales Balance */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Mobile Money Sales Balance
            </span>
            <span className="text-2xl font-bold text-gray-900">
              USh {Number(stats.net_balance).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between mt-4 z-10">
            <span className="text-[11px] font-semibold text-primary-600 flex items-center gap-1">
              Mobile Money balance ready to withdraw
            </span>
            <div className="w-6 h-6 bg-primary-50 rounded flex items-center justify-center text-primary-500">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          {/* Green wave line outline */}
          <svg className="absolute bottom-0 left-0 right-0 h-4 w-full text-primary-400" viewBox="0 0 100 10" preserveAspectRatio="none" fill="none">
            <path d="M0,5 C25,12 75,1 100,5" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </div>

        {/* Card 2: Pending Withdrawals */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Pending Withdrawals
            </span>
            <span className="text-2xl font-bold text-gray-900">
              USh {Number(stats.pending_withdrawals).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
              Processing automatically
            </span>
            <div className="w-6 h-6 bg-amber-50 rounded flex items-center justify-center text-amber-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 3: Total Online Earnings */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Total Online Earnings
            </span>
            <span className="text-2xl font-bold text-gray-900">
              USh {Number(stats.total_revenue).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
              Lifetime online collections
            </span>
            <div className="w-6 h-6 bg-amber-50 rounded flex items-center justify-center text-amber-600">
              <Banknote className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 4: Total Withdrawn */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
              Total Withdrawn
            </span>
            <span className="text-2xl font-bold text-gray-900">
              USh {Number(stats.total_withdrawn).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
              Already paid out
            </span>
            <div className="w-6 h-6 bg-gray-50 rounded flex items-center justify-center text-gray-400">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Withdrawal History Card */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Withdrawal History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Track all your withdrawal requests and their status</p>
          </div>
          
          {/* Filter / Search bar */}
          <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <button className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table & Empty state */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 flex justify-center items-center">
              <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : filteredWithdrawals.length === 0 ? (
            <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mb-3 border border-gray-100">
                <Banknote className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No withdrawals yet</h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1">
                Click "Request Withdrawal" to request your first payout.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Phone Number</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Date &amp; Time</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {filteredWithdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{w.reference}</td>
                    <td className="px-6 py-4 text-gray-900">{w.phone_number}</td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900">
                      USh {Number(w.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs max-w-xs truncate">{w.description}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        w.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                        w.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                        'bg-rose-50 text-rose-700'
                      }`}>
                        {w.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Request Withdrawal Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg border border-gray-100 overflow-hidden relative">
            <button 
              onClick={resetModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">
                {step === 'form' && 'Request Withdrawal'}
                {step === 'otp' && 'Verify Withdrawal'}
                {step === 'feedback' && 'Withdrawal Status'}
              </h3>
              <p className="text-xs text-gray-400 mb-6">
                {step === 'form' && 'Transfer funds from your sales balance to your mobile money wallet.'}
                {step === 'otp' && 'We have sent an OTP verification code to your registered email.'}
                {step === 'feedback' && 'Result of the withdrawal payout transaction.'}
              </p>

              {step === 'form' && (
                <form onSubmit={initiateWithdrawal} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Phone Number (MTN/Airtel)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 0772000000"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Amount (UGX)
                      </label>
                      <span className="text-[10px] text-primary-600 font-semibold">
                        Max: USh {Number(stats.net_balance).toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="number"
                      placeholder="e.g. 50000"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Description / Payout Note (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Weekly Payout"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading || !amount || !phone}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {actionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Send OTP
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {step === 'otp' && (
                <form onSubmit={confirmWithdrawal} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Enter 6-Digit OTP
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      required
                      className="w-full text-center tracking-[0.5em] font-mono text-lg px-3.5 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading || otp.length < 6}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {actionLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        'Verify & Confirm'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {step === 'feedback' && (
                <div className="text-center space-y-4 py-2">
                  <div className="flex justify-center">
                    {feedback.success ? (
                      <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center text-emerald-500">
                        <Check className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <h4 className={`text-base font-bold ${feedback.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {feedback.success ? 'Payout Processed' : 'Payout Failed'}
                    </h4>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                      {feedback.message}
                    </p>
                  </div>

                  <button
                    onClick={resetModal}
                    className="w-full mt-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
