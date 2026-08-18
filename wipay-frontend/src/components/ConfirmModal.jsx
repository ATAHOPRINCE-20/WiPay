import { AlertTriangle, Trash2, HelpCircle, X } from 'lucide-react'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  loading = false
}) {
  if (!isOpen) return null

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return (
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-3 shadow-inner">
            <Trash2 className="w-6 h-6" />
          </div>
        )
      case 'warning':
        return (
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
        )
      default:
        return (
          <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mb-3 shadow-inner">
            <HelpCircle className="w-6 h-6" />
          </div>
        )
    }
  }

  const getConfirmBtnClass = () => {
    switch (type) {
      case 'danger':
        return 'btn-primary bg-red-600 hover:bg-red-700 text-white flex-1 justify-center'
      case 'warning':
        return 'btn-primary bg-amber-600 hover:bg-amber-700 text-white flex-1 justify-center'
      default:
        return 'btn-primary flex-1 justify-center'
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-sm w-full p-6 space-y-4 animate-in zoom-in-95 duration-150 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition">
          <X className="w-4 h-4" />
        </button>

        {getIcon()}

        <div>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{message}</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-secondary flex-1 justify-center" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button type="button" className={getConfirmBtnClass()} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
