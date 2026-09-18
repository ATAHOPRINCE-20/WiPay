import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { safeLocalStorage } from '../utils/safeStorage'

export default function PWAInstallPrompt() {
  const location = useLocation()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  // Hide PWA prompt completely on captive portal routes to avoid disturbing Wi-Fi users
  const isCaptivePortal = location.pathname === '/captive-portal' || location.pathname === '/portal'
  if (isCaptivePortal) return null

  useEffect(() => {
    // Check if app is already running in PWA standalone mode
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone) return

    // Check if user dismissed prompt recently
    const dismissed = safeLocalStorage.getItem('ugpay_pwa_dismissed')
    if (dismissed && Date.now() - parseInt(dismissed) < 86400000 * 7) {
      return // Don't show again for 7 days
    }

    // Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(userAgent)
    if (iosDevice) {
      setIsIOS(true)
      setShowPrompt(true)
      return
    }

    // Android/Desktop Chrome/Edge install prompt
    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      console.log('UgPay PWA installed')
    }
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    safeLocalStorage.setItem('ugpay_pwa_dismissed', Date.now().toString())
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-bounce-in">
      <div className="rounded-2xl bg-slate-900/95 backdrop-blur-2xl border border-indigo-500/40 p-4 shadow-2xl text-white flex flex-col gap-3">
        
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shrink-0 shadow-lg border border-white/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white leading-tight">Install UgPay App</h4>
            <p className="text-xs text-slate-300">Add to iPhone / Phone home screen</p>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* iOS Specific Instructions Banner */}
        {isIOS ? (
          <div className="bg-indigo-950/60 rounded-xl p-2.5 border border-indigo-500/30 text-xs text-slate-200 flex items-center gap-2">
            <span className="text-lg">⎋</span>
            <span>Tap <strong>Share</strong> in Safari &amp; select <strong>"Add to Home Screen"</strong></span>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg transition-all"
          >
            Install App Now
          </button>
        )}

      </div>
    </div>
  )
}
