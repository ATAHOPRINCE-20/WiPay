import { useState, useEffect } from 'react'
import api from '../services/api'
import { X, ArrowRight, Clock, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { useToast } from '../context/ToastContext'

export default function WithdrawalModal({ isOpen, onClose, maxBalance = 0, onSuccess }) {
  const { showToast } = useToast()

  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form') // form -> otp -> processing -> feedback
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState({ success: false, message: '' })
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    let timer
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown(prev => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [cooldown])

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const initiateWithdrawal = async (e) => {
    if (e) e.preventDefault()
    if (!amount || !phone) return

    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount', 'error')
      return
    }

    if (maxBalance > 0 && numAmount > maxBalance) {
      showToast('Insufficient funds in withdrawable balance', 'error')
      return
    }

    setActionLoading(true)
    try {
      const res = await api.post('/admin/withdraw/initiate', {
        amount: numAmount,
        phone_number: phone
      })
      setCooldown(res.data?.cooldown || 300)
      setStep('otp')
      showToast(res.data?.message || 'OTP sent to your email.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Failed to initiate withdrawal', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const confirmWithdrawal = async (e) => {
    if (e) e.preventDefault()
    if (!otp) return

    setActionLoading(true)
    try {
      const res = await api.post('/admin/withdraw', {
        amount: Number(amount),
        phone_number: phone,
        otp,
        description: description || 'Admin Payout'
      })

      const ref = res.data?.reference
      if (!ref) {
        setFeedback({
          success: true,
          message: 'Your withdrawal request has been submitted.'
        })
        setStep('feedback')
        if (onSuccess) onSuccess()
        return
      }

      setStep('processing')
      let attempts = 0
      const maxAttempts = 15 // Poll up to 45 seconds

      const pollInterval = setInterval(async () => {
        attempts++
        try {
          const statusRes = await api.post('/check-payment-status', { transaction_ref: ref })
          const status = statusRes.data?.status

          if (status === 'SUCCESS') {
            clearInterval(pollInterval)
            setFeedback({
              success: true,
              message: 'Payout Successful! Mobile money funds have been delivered.'
            })
            setStep('feedback')
            if (onSuccess) onSuccess()
          } else if (status === 'FAILED') {
            clearInterval(pollInterval)
            setFeedback({
              success: false,
              message: 'Payout Failed. The transaction was rejected or failed at the gateway.'
            })
            setStep('feedback')
            if (onSuccess) onSuccess()
          }
        } catch (err) {
          console.error('Polling error:', err)
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
          setFeedback({
            success: true,
            message: 'Withdrawal request submitted. Gateway confirmation is pending; please check your history list.'
          })
          setStep('feedback')
          if (onSuccess) onSuccess()
        }
      }, 3000)

    } catch (err) {
      setFeedback({
        success: false,
        message: err.response?.data?.error || err.response?.data?.message || 'Verification failed. Please check your OTP and try again.'
      })
      setStep('feedback')
    } finally {
      setActionLoading(false)
    }
  }

  const resetAndClose = () => {
    setAmount('')
    setPhone('')
    setDescription('')
    setOtp('')
    setStep('form')
    setFeedback({ success: false, message: '' })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={resetAndClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {step === 'form' && 'Request Withdrawal'}
            {step === 'otp' && 'Verify Withdrawal'}
            {step === 'processing' && 'Processing Payout'}
            {step === 'feedback' && 'Withdrawal Status'}
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            {step === 'form' && 'Transfer funds from your sales balance to your mobile money wallet.'}
            {step === 'otp' && 'We have sent an OTP verification code to your registered email.'}
            {step === 'processing' && 'Verifying payment status with Relworx gateway...'}
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Amount (UGX)
                  </label>
                  {maxBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(maxBalance))}
                      className="text-[10px] text-primary-600 hover:underline font-bold"
                    >
                      Max: UGX {Number(maxBalance).toLocaleString()}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading || !amount || !phone}
                className="w-full mt-4 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.98]"
              >
                {actionLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Send OTP Verification Code
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
                  className="w-full text-center tracking-[0.5em] font-mono text-xl px-3.5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              <div className="text-center text-xs text-gray-500 py-2.5 px-3 bg-gray-50 rounded-xl border border-gray-100">
                {cooldown > 0 ? (
                  <span className="text-gray-600 font-medium flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    Resend OTP available in <span className="font-mono font-bold text-gray-900">{formatTimer(cooldown)}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={initiateWithdrawal}
                    disabled={actionLoading}
                    className="text-primary-600 hover:text-primary-700 font-bold underline cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Resend OTP Code
                  </button>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || otp.length < 6}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.98]"
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

          {step === 'processing' && (
            <div className="text-center space-y-4 py-6">
              <div className="flex justify-center">
                <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center text-amber-600">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-gray-900">Verifying Payout Status...</h4>
                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                  Please wait while we confirm the payout status with Mobile Money network.
                </p>
              </div>
            </div>
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
                onClick={resetAndClose}
                className="w-full mt-4 bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl text-sm transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
