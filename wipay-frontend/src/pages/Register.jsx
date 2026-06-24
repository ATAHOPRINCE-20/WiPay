import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('Passwords do not match')
    setLoading(true)
    const res = await register(form.username, form.password, form.email)
    setLoading(false)
    if (res.ok) navigate('/dashboard')
    else setError(res.message)
  }

  return (
    <div className="card p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Create account</h2>
      <p className="text-sm text-gray-500 mb-6">Register a new admin account</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input" required />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" className="input" required />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
          <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} type="password" className="input" required />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
          <input value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} type="password" className="input" required />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-6">WiPay WiFi Billing System &copy; {new Date().getFullYear()}</p>
    </div>
  )
}
