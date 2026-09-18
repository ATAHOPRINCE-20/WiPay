import axios from 'axios'
import { safeLocalStorage } from '../utils/safeStorage'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  withCredentials: true,
})

// Attach Sanctum token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = safeLocalStorage.getItem('wipay_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401 / 403 (unauthorized or invalid token)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      // Don't auto-redirect if request was specifically for login or register
      const isAuthPath = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/login')
      if (!isAuthPath) {
        safeLocalStorage.removeItem('wipay_token')
        safeLocalStorage.removeItem('wipay_admin')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api
