import { useState, useEffect } from 'react'
import api from '../services/api'

export default function Withdraw() {
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('init') // init -> otp
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [wallet, setWallet] = useState(null)

  useEffect(() => {
    let mounted = true
    api.get('/admin/stats')
      .then(({ data }) => {
        if (!mounted) return
        setWallet(data.finance?.net_balance ?? 0)
      })
      .catch(() => {
        if (!mounted) return
        setWallet(null)
      })
    return () => { mounted = false }
  }, [])

  const initiate = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await api.post('/admin/withdraw/initiate', { amount: Number(amount), phone_number: phone })
      setStep('otp')
      setMessage({ type: 'success', text: res.data.message || 'OTP sent to your email' })
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.message })
    } finally { setLoading(false) }
  }

  const confirm = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await api.post('/admin/withdraw', { amount: Number(amount), phone_number: phone, otp, description: 'Payout' })
      setMessage({ type: 'success', text: 'Withdrawal processed' })
      setStep('done')
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.error || e.response?.data?.message || e.message })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded shadow">
      <div className="mb-4">
        <div className="text-sm text-gray-500">Wallet balance</div>
        <div className="text-2xl font-semibold">{wallet === null ? '—' : Number(wallet).toLocaleString()} UGX</div>
      </div>
      <h2 className="text-lg font-semibold mb-4">Withdraw Funds</h2>

      {message && (
        <div className={`p-3 mb-4 rounded ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {step === 'init' && (
        <>
          <label className="block mb-2 text-sm font-medium">Amount (UGX)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded mb-3" />

          <label className="block mb-2 text-sm font-medium">Phone number (07...)</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-2 border rounded mb-4" />

          <button onClick={initiate} disabled={loading} className="px-4 py-2 bg-primary-500 text-white rounded">
            {loading ? 'Sending OTP...' : 'Start Withdrawal (Send OTP)'}
          </button>
        </>
      )}

      {step === 'otp' && (
        <>
          <p className="mb-3 text-sm text-gray-600">Enter the OTP sent to your registered email to confirm the withdrawal.</p>
          <label className="block mb-2 text-sm font-medium">OTP</label>
          <input type="text" value={otp} onChange={e => setOtp(e.target.value)} className="w-full p-2 border rounded mb-4" />

          <div className="flex gap-2">
            <button onClick={confirm} disabled={loading} className="px-4 py-2 bg-primary-500 text-white rounded">
              {loading ? 'Processing...' : 'Confirm & Payout'}
            </button>
            <button onClick={() => setStep('init')} className="px-4 py-2 border rounded">Cancel</button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div>
          <p className="mb-4">Withdrawal request processed. Check your email for details.</p>
          <button onClick={() => { setStep('init'); setAmount(''); setPhone(''); setOtp(''); setMessage(null) }} className="px-4 py-2 border rounded">Make another withdrawal</button>
        </div>
      )}
    </div>
  )
}
