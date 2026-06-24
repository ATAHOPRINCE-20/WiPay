import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock, User } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]     = useState({ username: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await login(form.username, form.password)
    setLoading(false)
    if (res.ok) navigate('/dashboard')
    else setError(res.message)
  }

  return (
    <div className="card p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-6">Sign in to your WiPay dashboard</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="username"
              type="text"
              placeholder="admin"
              className="input pl-9"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="input pl-9"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-2.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
        </button>
      </form>
      <div className="mt-4 text-center">
        <Link to="/register" className="text-sm text-primary-600 hover:underline">Create an account</Link>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        WiPay WiFi Billing System &copy; {new Date().getFullYear()}
      </p>
    </div>
  )
}
