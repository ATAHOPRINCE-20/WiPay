import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { id, message, type, duration }])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const getToastStyles = (type) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-emerald-50 border-emerald-100 text-emerald-800',
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        }
      case 'error':
        return {
          bg: 'bg-rose-50 border-rose-100 text-rose-800',
          icon: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
        }
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-100 text-amber-800',
          icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        }
      case 'info':
      default:
        return {
          bg: 'bg-blue-50 border-blue-100 text-blue-800',
          icon: <Info className="w-5 h-5 text-blue-500 shrink-0" />
        }
    }
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Toast Container */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => {
          const styles = getToastStyles(t.type)
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 p-4 border rounded-xl shadow-lg pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-200 ${styles.bg}`}
              role="alert"
            >
              {styles.icon}
              <div className="flex-1 text-sm font-medium leading-5">{t.message}</div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-gray-400 hover:text-gray-600 transition shrink-0 focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
