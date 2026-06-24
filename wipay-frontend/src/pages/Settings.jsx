import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import { Loader2, Building2, Lock, CreditCard } from 'lucide-react'

const MONTHLY_FEE = 20000

export default function Settings() {
  const { admin, refreshProfile } = useAuth()

  const [profile, setProfile] = useState({
    business_name:  admin?.business_name  || '',
    business_phone: admin?.business_phone || '',
    email:          admin?.email          || '',
  })
  const [password, setPassword] = useState({ current_password: '', new_password: '', new_password_confirmation: '' })
  const [subForm, setSubForm]   = useState({ phone_number: '', months: 1 })
  const [subRef, setSubRef]       = useState(null)
  const [subStatus, setSubStatus] = useState('')
  const [saving, setSaving]       = useState('')
  const [message, setMessage]     = useState('')
  const [error, setError]         = useState('')

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving('profile'); setError(''); setMessage('')
    try {
      await api.put('/auth/profile', profile)
      await refreshProfile()
      setMessage('Profile updated successfully.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile.')
    } finally { setSaving('') }
  }

  const savePassword = async (e) => {
    e.preventDefault(); setSaving('password'); setError(''); setMessage('')
    try {
      await api.post('/auth/change-password', password)
      setPassword({ current_password: '', new_password: '', new_password_confirmation: '' })
      setMessage('Password changed successfully.')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password.')
    } finally { setSaving('') }
  }

  const renewSubscription = async (e) => {
    e.preventDefault(); setSaving('sub'); setError(''); setMessage('')
    try {
      const { data } = await api.post('/subscription/renew', subForm)
      setSubRef(data.reference)
      setSubStatus('pending')
      setMessage('Payment request sent. Approve on your phone.')
      pollSubscription(data.reference)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate renewal.')
    } finally { setSaving('') }
  }

  const pollSubscription = (ref) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/subscription/status/${ref}`)
        setSubStatus(data.status)
        if (data.status === 'success') {
          clearInterval(interval)
          await refreshProfile()
          setMessage('Subscription renewed successfully!')
          setSubRef(null)
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setError('Payment failed. Please try again.')
          setSubRef(null)
        }
      } catch (_) {}
    }, 4000)
    setTimeout(() => clearInterval(interval), 120000)
  }

  const expiry = admin?.subscription_expiry
    ? new Date(admin.subscription_expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Not set'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-400">Manage your account, branding, and subscription</p>
      </div>

      {message && <p className="text-sm text-primary-700 bg-primary-50 p-3 rounded-lg">{message}</p>}
      {error   && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Profile */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-gray-900">Business Profile</h3>
        </div>
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Business Name</label>
            <input className="input" value={profile.business_name} onChange={e => setProfile(p => ({ ...p, business_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Business Phone</label>
            <input className="input" value={profile.business_phone} onChange={e => setProfile(p => ({ ...p, business_phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input className="input" type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving === 'profile'} className="btn-primary">
            {saving === 'profile' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-gray-900">Change Password</h3>
        </div>
        <form onSubmit={savePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Password</label>
            <input className="input" type="password" value={password.current_password} onChange={e => setPassword(p => ({ ...p, current_password: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
              <input className="input" type="password" value={password.new_password} onChange={e => setPassword(p => ({ ...p, new_password: e.target.value }))} required minLength={6} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
              <input className="input" type="password" value={password.new_password_confirmation} onChange={e => setPassword(p => ({ ...p, new_password_confirmation: e.target.value }))} required />
            </div>
          </div>
          <button type="submit" disabled={saving === 'password'} className="btn-primary">
            {saving === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Subscription */}
      {admin?.billing_type === 'subscription' && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-primary-500" />
            <h3 className="font-semibold text-gray-900">Subscription Renewal</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Current expiry: <strong>{expiry}</strong></p>
          {subRef && subStatus === 'pending' && (
            <p className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded-lg mb-3">Waiting for payment approval…</p>
          )}
          <form onSubmit={renewSubscription} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                <input className="input" placeholder="07XXXXXXXX" value={subForm.phone_number} onChange={e => setSubForm(p => ({ ...p, phone_number: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Months</label>
                <select className="input" value={subForm.months} onChange={e => setSubForm(p => ({ ...p, months: Number(e.target.value) }))}>
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400">Total: UGX {(subForm.months * MONTHLY_FEE).toLocaleString()}</p>
            <button type="submit" disabled={saving === 'sub' || subStatus === 'pending'} className="btn-primary">
              {saving === 'sub' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Renew Subscription'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
