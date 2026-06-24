import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  withCredentials: true,
})

// Attach Sanctum token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wipay_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wipay_token')
      localStorage.removeItem('wipay_admin')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
