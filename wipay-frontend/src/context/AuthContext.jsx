import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'
import { safeLocalStorage } from '../utils/safeStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin]   = useState(() => {
    const saved = safeLocalStorage.getItem('wipay_admin')
    return saved ? JSON.parse(saved) : null
  })
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(() => {
    const hasToken = !!safeLocalStorage.getItem('wipay_token')
    const hasAdmin = !!safeLocalStorage.getItem('wipay_admin')
    return hasToken && !hasAdmin
  })

  useEffect(() => {
    const token = safeLocalStorage.getItem('wipay_token')
    if (!token) { setBooting(false); return }
    api.get('/auth/profile')
      .then(({ data }) => {
        setAdmin(data)
        safeLocalStorage.setItem('wipay_admin', JSON.stringify(data))
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          safeLocalStorage.removeItem('wipay_token')
          safeLocalStorage.removeItem('wipay_admin')
          setAdmin(null)
        }
      })
      .finally(() => setBooting(false))
  }, [])

  const login = async (username, password) => {
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      safeLocalStorage.setItem('wipay_token', data.token)
      safeLocalStorage.setItem('wipay_admin', JSON.stringify(data.admin))
      setAdmin(data.admin)
      return { ok: true, admin: data.admin, role: data.role }
    } catch (err) {
      return { ok: false, message: err.response?.data?.message || err.response?.data?.error || 'Login failed.' }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try { await api.post('/auth/logout') } catch (_) {}
    safeLocalStorage.removeItem('wipay_token')
    safeLocalStorage.removeItem('wipay_admin')
    safeLocalStorage.removeItem('wipay_super_admin_backup')
    setAdmin(null)
  }

  const impersonateTenant = async (tenantId) => {
    const currentToken = safeLocalStorage.getItem('wipay_token')
    const currentAdmin = safeLocalStorage.getItem('wipay_admin')
    if (!safeLocalStorage.getItem('wipay_super_admin_backup') && currentToken && currentAdmin) {
      safeLocalStorage.setItem('wipay_super_admin_backup', JSON.stringify({ token: currentToken, admin: JSON.parse(currentAdmin) }))
    }

    const { data } = await api.post(`/super/tenants/${tenantId}/impersonate`)
    safeLocalStorage.setItem('wipay_token', data.token)
    safeLocalStorage.setItem('wipay_admin', JSON.stringify(data.admin))
    setAdmin(data.admin)
    return data.admin
  }

  const exitImpersonation = () => {
    const backupStr = safeLocalStorage.getItem('wipay_super_admin_backup')
    if (backupStr) {
      try {
        const backup = JSON.parse(backupStr)
        safeLocalStorage.setItem('wipay_token', backup.token)
        safeLocalStorage.setItem('wipay_admin', JSON.stringify(backup.admin))
        safeLocalStorage.removeItem('wipay_super_admin_backup')
        setAdmin(backup.admin)
        window.location.href = '/super-admin'
      } catch (_) {}
    }
  }

  const isImpersonating = !!safeLocalStorage.getItem('wipay_super_admin_backup')

  const refreshProfile = async () => {
    try {
      const { data } = await api.get('/auth/profile')
      setAdmin(data)
      safeLocalStorage.setItem('wipay_admin', JSON.stringify(data))
      return data
    } catch (_) {
      return null
    }
  }

  return (
    <AuthContext.Provider value={{ admin, loading, booting, login, logout, refreshProfile, impersonateTenant, exitImpersonation, isImpersonating }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
