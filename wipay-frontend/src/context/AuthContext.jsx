import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin]   = useState(() => {
    const saved = localStorage.getItem('wipay_admin')
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(() => !!localStorage.getItem('wipay_token'))

  useEffect(() => {
    const token = localStorage.getItem('wipay_token')
    if (!token) { setBooting(false); return }
    api.get('/auth/profile')
      .then(({ data }) => {
        setAdmin(data)
        localStorage.setItem('wipay_admin', JSON.stringify(data))
      })
      .catch(() => {
        localStorage.removeItem('wipay_token')
        localStorage.removeItem('wipay_admin')
        setAdmin(null)
      })
      .finally(() => setBooting(false))
  }, [])

  const login = async (username, password) => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      localStorage.setItem('wipay_token', data.token)
      localStorage.setItem('wipay_admin', JSON.stringify(data.admin))
      setAdmin(data.admin)
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.response?.data?.message || 'Login failed.' }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch (_) {}
    localStorage.removeItem('wipay_token')
    localStorage.removeItem('wipay_admin')
    setAdmin(null)
  }

  const refreshProfile = async () => {
    try {
      const { data } = await api.get('/auth/profile')
      setAdmin(data)
      localStorage.setItem('wipay_admin', JSON.stringify(data))
    } catch (_) {}
  }

  return (
    <AuthContext.Provider value={{ admin, loading, booting, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
