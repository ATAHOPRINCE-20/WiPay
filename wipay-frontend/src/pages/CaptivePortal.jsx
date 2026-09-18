import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wifi, Loader2, CheckCircle, Maximize2, ExternalLink, X } from 'lucide-react'

const THEMES = {
  default: {
    containerBg: 'bg-surface text-gray-900',
    card: 'bg-white border border-gray-100 text-gray-900 shadow-sm rounded-2xl',
    headerTitle: 'text-gray-900 font-bold',
    headerSub: 'text-gray-400',
    primaryBtn: 'btn-primary',
    inputBg: 'input',
    footerBorder: 'border-gray-200/60',
    footerText: 'text-gray-900',
    footerBrand: 'text-primary-600',
    badgeAirtel: 'badge badge-yellow font-semibold px-3',
    badgeMtn: 'badge bg-yellow-400 text-yellow-900 font-semibold px-3',
    pkgPrice: 'font-bold text-gray-900',
    pkgHover: 'hover:bg-gray-50',
    subText: 'text-gray-400',
    findLink: 'text-primary-600 hover:text-primary-700 font-semibold'
  },
  glass: {
    containerBg: 'bg-gradient-to-br from-indigo-100/70 via-slate-100/90 to-purple-100/70 text-slate-900 min-h-screen',
    card: 'bg-white/30 border border-white/50 text-slate-900 shadow-2xl backdrop-blur-xl rounded-3xl',
    headerTitle: 'text-slate-900 font-extrabold tracking-tight drop-shadow-xs',
    headerSub: 'text-slate-600 font-medium',
    primaryBtn: 'w-full inline-flex items-center justify-center font-bold px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg backdrop-blur-md transition',
    inputBg: 'input bg-white/50 backdrop-blur-md border border-white/60 text-slate-900 placeholder:text-slate-400',
    footerBorder: 'border-white/40',
    footerText: 'text-slate-900',
    footerBrand: 'text-indigo-600 font-extrabold',
    badgeAirtel: 'bg-white/40 backdrop-blur-md text-red-700 border border-white/60 font-semibold px-3 py-1 rounded-full text-xs shadow-2xs',
    badgeMtn: 'bg-white/40 backdrop-blur-md text-amber-800 border border-white/60 font-semibold px-3 py-1 rounded-full text-xs shadow-2xs',
    pkgPrice: 'font-extrabold text-indigo-950',
    pkgHover: 'hover:bg-white/40',
    subText: 'text-slate-600',
    findLink: 'text-indigo-600 hover:text-indigo-800 font-bold'
  }
}

export default function CaptivePortal() {
  const [params]   = useSearchParams()
  const slug       = params.get('slug')
  const linkLogin  = params.get('link-login') || params.get('link_login') || ''

  const [branding,  setBranding]  = useState({ name: 'UGPAY', phone: '', portal_logo: '', portal_welcome_msg: '', terms_text: '' })
  const [packages,  setPackages]  = useState([])
  const [loadingPkg, setLoadingPkg] = useState(true)
  const [activeDeviceTab, setActiveDeviceTab] = useState('mobile') // 'mobile' | 'tv'
  const [tvMac,     setTvMac]     = useState('')
  const [selected,  setSelected]  = useState(null)
  const [phone,     setPhone]     = useState('')
  const [modal,     setModal]     = useState(false)
  const [step,      setStep]      = useState('idle') // idle | paying | polling | success
  const [txRef,     setTxRef]     = useState(null)
  const [voucherCode, setVoucherCode] = useState('')
  const [msg,       setMsg]       = useState('')
  const [voucherInput, setVoucherInput] = useState('')
  const [logoError, setLogoError] = useState(false)
  const [ads,       setAds]       = useState([])
  const [currentAdIndex, setCurrentAdIndex] = useState(0)
  const [expandedAd, setExpandedAd] = useState(null)
  const [findModal, setFindModal] = useState(false)
  const [findInput, setFindInput] = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [findResult, setFindResult] = useState(null)
  const [findError, setFindError] = useState('')
  const pollRef = useRef(null)

  const API = '/api'

  const errorParam = params.get('error') || params.get('errmsg') || params.get('err') || ''

  useEffect(() => {
    if (errorParam) {
      const lower = errorParam.toLowerCase()
      if (lower.includes('simultaneous') || lower.includes('already logged in') || lower.includes('limit reached')) {
        setMsg('⚠️ This voucher is currently in use on another device (Limit: 1 device).')
      } else if (lower.includes('invalid') || lower.includes('not found') || lower.includes('expired') || lower.includes('password')) {
        setMsg('⚠️ This voucher code is invalid, fully used, or has expired.')
      } else if (lower.includes('uptime') || lower.includes('time limit')) {
        setMsg('⚠️ This voucher has reached its maximum session time limit.')
      } else {
        setMsg(errorParam)
      }
    }
  }, [errorParam])

  useEffect(() => {
    const qStr = slug ? `?slug=${encodeURIComponent(slug)}` : ''
    
    // 1. Prioritize Packages: Fetch packages IMMEDIATELY so buy UI renders without delay
    fetch(`${API}/packages${qStr}`)
      .then(r => r.json())
      .then(data => { 
        setPackages(Array.isArray(data) ? data : []); 
        setLoadingPkg(false) 
      })
      .catch(() => setLoadingPkg(false))

    // 2. Fetch Branding Info
    fetch(`${API}/branding${qStr}`)
      .then(r => r.json())
      .then(b => { setBranding(b); setLogoError(false) })
      .catch(() => {})

    // 3. LAZY LOAD Ads: Defer fetching promotional ad flyers until packages finish rendering
    const adTimer = setTimeout(() => {
      fetch(`${API}/public/portal-ads${qStr}`)
        .then(r => r.json())
        .then(data => setAds(Array.isArray(data) ? data : []))
        .catch(() => {})
    }, 150)

    return () => clearTimeout(adTimer)
  }, [slug])

  useEffect(() => {
    if (ads.length <= 1) return
    const timer = setInterval(() => {
      setCurrentAdIndex(prev => (prev + 1) % ads.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [ads])

  // Real-time WebSocket listener for Instant Webhook push notification
  useEffect(() => {
    if (step !== 'polling' || !txRef) return
    let ws
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/socket.io/?EIO=4&transport=websocket`)
      ws.onmessage = (evt) => {
        if (evt.data && evt.data.includes(txRef)) {
          // Webhook pushed instant success/failure signal!
          pollStatus(txRef)
        }
      }
    } catch (e) {}

    return () => {
      if (ws) {
        try { ws.close() } catch (e) {}
      }
    }
  }, [step, txRef])

  const loginWithVoucher = async (rawCode) => {
    const code = (rawCode || '').trim()
    if (!code) {
      setMsg('⚠️ Please enter a voucher code.')
      return
    }

    setVoucherInput(code)
    setMsg('')

    try {
      const qStr = slug ? `?slug=${encodeURIComponent(slug)}` : ''
      const valRes = await fetch(`${API}/validate-voucher${qStr}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucher_code: code, slug: slug || '' })
      })
      const valData = await valRes.json()
      if (valData && valData.valid === false) {
        setMsg(`⚠️ ${valData.error || 'This voucher cannot be used.'}`)
        return
      }
    } catch (_) {}

    const linkLoginParam = params.get('link-login') || params.get('link_login') || ''
    const targetAction = linkLoginParam || 'http://192.168.88.1/login'
    const dstUrl = 'http://192.168.88.1/status'
    const directLoginUrl = `${targetAction}?username=${encodeURIComponent(code)}&password=${encodeURIComponent(code)}&dst=${encodeURIComponent(dstUrl)}`

    try {
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = targetAction

      const fields = { username: code, password: code, dst: dstUrl }
      Object.keys(fields).forEach(function(key) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = fields[key]
        form.appendChild(input)
      })

      document.body.appendChild(form)
      form.submit()
    } catch (e) {
      window.location.href = directLoginUrl
    }
  }

  const buy = async () => {
    if (!phone.trim()) return setMsg('Please enter your phone number.')
    if ((activeDeviceTab === 'tv' || selected?.device_type === 'tv') && !tvMac.trim()) {
      return setMsg('Please enter your Smart TV MAC address (e.g. AA:BB:CC:DD:EE:FF).')
    }
    setStep('paying'); setMsg('')
    try {
      const mac = params.get('mac') || ''
      const ip = params.get('ip') || ''
      const r = await fetch(`${API}/purchase`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone,
          package_id: selected.id,
          mac,
          ip,
          tv_mac: tvMac.trim()
        }),
      })
      const d = await r.json()
      if (!d.transaction_id) { setMsg(d.error || 'Payment failed.'); setStep('idle'); return }
      setTxRef(d.transaction_id); setModal(false); setStep('polling')
      pollRef.current = setInterval(() => pollStatus(d.transaction_id), 5000)
    } catch { setMsg('Network error. Try again.'); setStep('idle') }
  }

  const pollStatus = async (ref) => {
    try {
      const r = await fetch(`${API}/check-payment-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ref: ref }),
      })
      const d = await r.json()
      if (d.status === 'SUCCESS') {
        clearInterval(pollRef.current); setStep('success'); setVoucherCode(d.voucher_code); setVoucherInput(d.voucher_code)
        setTimeout(() => loginWithVoucher(d.voucher_code), 100)
      } else if (d.status === 'FAILED') { clearInterval(pollRef.current); setMsg('Payment failed.'); setStep('idle') }
    } catch {}
  }

  const handleFindVoucher = async (e) => {
    if (e) e.preventDefault()
    if (!findInput.trim()) {
      setFindError('Please enter your Phone Number or Transaction Reference.')
      return
    }
    setFindLoading(true)
    setFindError('')
    setFindResult(null)

    try {
      const qStr = slug ? `?slug=${encodeURIComponent(slug)}` : ''
      const res = await fetch(`${API}/find-voucher${qStr}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: findInput.trim(), slug: slug || '' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setFindResult(data)
      } else {
        setFindError(data.message || data.error || 'No voucher found for this Phone Number or Reference.')
      }
    } catch (err) {
      setFindError('Network error. Please try again.')
    } finally {
      setFindLoading(false)
    }
  }

  const formatValidity = (pkg) => {
    if (!pkg) return 'Unlimited'
    if (pkg.validity_unit === 'minutes' && pkg.validity_minutes > 0) return `${pkg.validity_minutes} Mins`
    const hours = parseFloat(pkg.validity_hours || pkg.duration_hours || 0)
    if (hours > 0) {
      if (hours >= 720 && hours % 720 === 0) return `${hours / 720} Month${hours / 720 > 1 ? 's' : ''}`
      if (hours >= 168 && hours % 168 === 0) return `${hours / 168} Week${hours / 168 > 1 ? 's' : ''}`
      if (hours >= 24 && hours % 24 === 0) return `${hours / 24} Day${hours / 24 > 1 ? 's' : ''}`
      if (hours < 1) return `${Math.round(hours * 60)} Mins`
      return `${hours} Hour${hours > 1 ? 's' : ''}`
    }
    if (pkg.validity_minutes > 0) return `${pkg.validity_minutes} Mins`
    return 'Unlimited'
  }

  const activeTheme = THEMES[branding.portal_theme] || THEMES.default

  return (
    <div className={`min-h-screen flex flex-col items-center py-8 px-4 transition-colors duration-300 ${activeTheme.containerBg}`}>

      <header className="text-center mb-6">
        <img
          src={(!logoError && (branding.portal_logo || branding.logo_url)) ? (branding.portal_logo || branding.logo_url) : "/img/favicon.png"}
          alt={branding.name || 'UgPay'}
          loading="lazy"
          decoding="async"
          onError={() => setLogoError(true)}
          className="w-16 h-16 rounded-2xl object-contain drop-shadow-xl mx-auto mb-3"
        />
        <h1 className={`text-2xl font-bold ${activeTheme.headerTitle}`}>{branding.name}</h1>
        <p className={`text-sm mt-0.5 ${activeTheme.headerSub}`}>
          {branding.portal_welcome_msg || 'Stay online, Stay informed'}
        </p>
      </header>

      {ads.length > 0 && (
        <div className="w-full max-w-sm mb-4">
          <div className={`${activeTheme.card} overflow-hidden relative min-h-[180px] max-h-[340px] flex flex-col items-center justify-center group`}>
            <div 
              className="absolute inset-0 bg-cover bg-center blur-xl opacity-20 scale-110 pointer-events-none"
              style={{ backgroundImage: `url(${ads[currentAdIndex].image_url})` }}
            />

            <div 
              className="relative z-10 w-full flex items-center justify-center p-2 cursor-pointer"
              onClick={() => setExpandedAd(ads[currentAdIndex])}
            >
              <img 
                src={ads[currentAdIndex].image_url} 
                alt={ads[currentAdIndex].title} 
                loading="lazy"
                decoding="async"
                className="max-h-[300px] w-full object-contain rounded-lg shadow-xs transition-transform duration-200 group-hover:scale-[1.01]"
              />

              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpandedAd(ads[currentAdIndex]); }}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white backdrop-blur-md opacity-80 group-hover:opacity-100 transition shadow-sm"
                title="Tap to view full flyer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>

            {ads[currentAdIndex].link_url && (
              <div className="relative z-10 pb-2 px-3 text-center">
                <a 
                  href={ads[currentAdIndex].link_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 bg-white/90 backdrop-blur-xs px-3 py-1 rounded-full shadow-xs transition"
                >
                  <span>{ads[currentAdIndex].title || 'View Details'}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {ads.length > 1 && (
              <div className="absolute bottom-2 right-3 z-20 flex gap-1.5 bg-black/40 px-2 py-1 rounded-full backdrop-blur-xs">
                {ads.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentAdIndex(idx)}
                    className={`h-1.5 rounded-full transition-all ${idx === currentAdIndex ? 'bg-primary-500 w-3' : 'bg-white/70 w-1.5'}`}
                    aria-label={`Go to ad ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {msg && !modal && (
        <div className="w-full max-w-sm mb-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-xs">
            <span className="font-semibold leading-relaxed">{msg}</span>
            <button type="button" onClick={() => setMsg('')} className="text-red-400 hover:text-red-700 ml-2 font-bold text-sm leading-none">&times;</button>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm mb-4">
        <div className={`${activeTheme.card} p-4`}>
          <p className={`text-xs font-medium ${activeTheme.subText} mb-2`}>Have a voucher code?</p>
          <div className="flex gap-2">
            <input
              className={`${activeTheme.inputBg} flex-1`} placeholder="Enter voucher code"
              value={voucherInput} onChange={e => setVoucherInput(e.target.value)}
            />
            <button className="btn-primary whitespace-nowrap" onClick={() => loginWithVoucher(voucherInput)}>Connect</button>
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-100/30 flex justify-end">
            <button 
              type="button"
              onClick={() => { setFindModal(true); setFindInput(''); setFindResult(null); setFindError('') }}
              className={`text-xs ${activeTheme.findLink} underline flex items-center gap-1`}
            >
              <span>Paid already? Find My Voucher</span>
            </button>
          </div>
        </div>
      </div>

      {/* Payment Accept Container Card (Using User's New Uploaded Transparent PNG Logos) */}
      <div className={`w-full max-w-sm rounded-2xl border border-white/20 bg-black/40 backdrop-blur-md p-3.5 text-center mb-4 shadow-xl ${activeTheme?.acceptCard || ''}`}>
        <p className="text-xs text-white/80 font-medium tracking-wide mb-2.5">We accept:</p>
        <div className="flex items-center justify-center gap-6">
          <img 
            src="/img/airtel_money.png" 
            alt="Airtel Money" 
            loading="lazy"
            decoding="async"
            className="h-8 w-auto object-contain select-none filter drop-shadow-sm" 
          />
          <div className="w-[1px] h-6 bg-white/20" />
          <img 
            src="/img/mtn_momo.png" 
            alt="MTN MoMo" 
            loading="lazy"
            decoding="async"
            className="h-8 w-auto object-contain select-none filter drop-shadow-sm" 
          />
        </div>
      </div>

      <div className="w-full max-w-sm mb-3">
        <div className="bg-black/40 backdrop-blur-md p-1 rounded-xl flex items-center gap-1 border border-white/20 shadow-md">
          <button
            type="button"
            onClick={() => setActiveDeviceTab('mobile')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeDeviceTab === 'mobile'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>Mobile</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDeviceTab('tv')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeDeviceTab === 'tv'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <span>Smart TVs</span>
          </button>
        </div>
      </div>

      <div className="w-full max-w-sm">
        {loadingPkg ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : packages.filter(pkg => {
            const dt = pkg.device_type || 'mobile'
            if (activeDeviceTab === 'tv') return dt === 'tv' || dt === 'both'
            return dt === 'mobile' || dt === 'both' || !pkg.device_type
          }).length === 0 ? (
          <p className={`text-center ${activeTheme.subText} text-sm py-8`}>
            No {activeDeviceTab === 'tv' ? 'Smart TV' : 'Mobile'} packages available. Contact admin.
          </p>
        ) : (
          <div className={`${activeTheme.card} divide-y divide-gray-100/30 overflow-hidden`}>
            {packages
              .filter(pkg => {
                const dt = pkg.device_type || 'mobile'
                if (activeDeviceTab === 'tv') return dt === 'tv' || dt === 'both'
                return dt === 'mobile' || dt === 'both' || !pkg.device_type
              })
              .map(pkg => (
                <div key={pkg.id} className={`flex items-center justify-between px-4 py-3 transition ${activeTheme.pkgHover}`}>
                  <div>
                    <p className="font-bold text-sm text-gray-900">{pkg.name}</p>
                    <p className={`text-xs ${activeTheme.subText}`}>
                      {formatValidity(pkg)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={activeTheme.pkgPrice}>{Number(pkg.price).toLocaleString()}/=</span>
                    <button
                      className="btn-primary text-xs px-3 py-1.5 font-bold"
                      onClick={() => { setSelected(pkg); setModal(true); setMsg(''); setPhone(''); setTvMac('') }}
                    >PAY</button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {branding.phone && (
        <p className="text-xs text-gray-400 mt-6 text-center">
          For inquiries: WhatsApp or call {branding.phone}
        </p>
      )}

      {/* Terms text */}
      {branding.terms_text && (
        <p className="text-[10px] text-gray-300 mt-3 text-center max-w-sm leading-relaxed">
          {branding.terms_text}
        </p>
      )}

      {/* Footer */}
      <footer className={`mt-8 mb-4 text-center w-full max-w-sm py-3 border-t ${activeTheme.footerBorder}`}>
        <p className={`text-sm font-medium ${activeTheme.footerText}`}>
          Powered by{' '}
          <a
            href="https://ugpay.tech/"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation()
              window.open('https://ugpay.tech/', '_blank')
            }}
            className="font-bold text-indigo-500 hover:text-indigo-600 underline cursor-pointer inline-block"
            style={{ color: '#6366f1', textDecoration: 'underline', fontWeight: 'bold' }}
          >
            UgPay
          </a>
        </p>
      </footer>

      {/* Polling overlay */}
      {step === 'polling' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center max-w-xs w-full shadow-2xl">
            <Loader2 className="w-10 h-10 animate-spin text-primary-500 mx-auto mb-4" />
            <p className="font-semibold text-gray-900 mb-1">Waiting for payment…</p>
            <p className="text-sm text-gray-400">Please approve the prompt on your phone.</p>
          </div>
        </div>
      )}

      {/* Success overlay */}
      {step === 'success' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 text-center max-w-xs w-full shadow-2xl space-y-4">
            <CheckCircle className="w-12 h-12 text-primary-500 mx-auto" />
            <div>
              <p className="font-bold text-gray-900 text-lg">Payment Confirmed!</p>
              <p className="text-xs text-gray-500">Your Wi-Fi access is now active.</p>
            </div>
            
            {voucherCode && (
              <div className="bg-primary-50 border border-primary-100 rounded-xl p-3">
                <p className="text-[11px] text-primary-600 font-medium mb-0.5">Assigned Voucher Code:</p>
                <p className="font-mono font-bold text-2xl text-primary-700 tracking-wider select-all">{voucherCode}</p>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                className="btn-primary w-full justify-center py-3 text-sm font-bold shadow-md"
                onClick={() => loginWithVoucher(voucherCode)}
              >
                ⚡ Connect to Internet Now
              </button>
              <p className="text-[11px] text-gray-400">Connecting automatically…</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">Confirm Purchase</h3>
            <p className="text-sm text-gray-500 mb-3">{selected?.name} — {Number(selected?.price).toLocaleString()}/=</p>
            {msg && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg mb-3">{msg}</p>}

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mobile Money Phone Number</label>
                <input
                  className="input w-full" type="tel" placeholder="e.g. 0771234567"
                  value={phone} onChange={e => setPhone(e.target.value)}
                />
              </div>

              {(activeDeviceTab === 'tv' || selected?.device_type === 'tv') && (
                <div>
                  <label className="block text-xs font-semibold text-indigo-900 mb-1">
                    Smart TV MAC Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="input w-full font-mono uppercase text-sm border-indigo-300 focus:border-indigo-600"
                    type="text"
                    placeholder="e.g. AA:BB:CC:DD:EE:FF"
                    value={tvMac}
                    onChange={e => setTvMac(e.target.value)}
                  />
                  <p className="text-[11px] text-gray-500 mt-1 leading-normal">
                    💡 <strong>Find TV MAC:</strong> TV Settings &rarr; Network &rarr; Wi-Fi Status / Details.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" disabled={step === 'paying'} onClick={buy}>
                {step === 'paying' ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${Number(selected?.price).toLocaleString()}/=`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Flyer Full Modal */}
      {expandedAd && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4" 
          onClick={() => setExpandedAd(null)}
        >
          <div 
            className="relative max-w-lg w-full max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center p-2 border border-slate-800" 
            onClick={e => e.stopPropagation()}
          >
            {/* Header controls */}
            <div className="w-full flex items-center justify-between p-3 text-white border-b border-slate-800">
              <h3 className="font-semibold text-sm truncate max-w-[80%]">{expandedAd.title || 'Promotional Flyer'}</h3>
              <button 
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition"
                onClick={() => setExpandedAd(null)}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* High-res Image display */}
            <div className="w-full flex-1 overflow-auto flex items-center justify-center p-2">
              <img 
                src={expandedAd.image_url} 
                alt={expandedAd.title} 
                className="max-w-full max-h-[75vh] object-contain rounded-lg"
              />
            </div>

            {/* Action button if link exists */}
            {expandedAd.link_url && (
              <div className="w-full p-3 border-t border-slate-800 flex justify-end">
                <a 
                  href={expandedAd.link_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2"
                >
                  Visit Link <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Find My Voucher Modal */}
      {findModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setFindModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <button 
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition p-1"
              onClick={() => setFindModal(false)}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <span>🎫 Find My Voucher</span>
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Enter your Phone Number (e.g. 077XXXXXXX) or Mobile Money Reference to recover your voucher code.
              </p>
            </div>

            {findError && (
              <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg mb-4 leading-relaxed">
                {findError}
              </div>
            )}

            {findResult ? (
              <div className="bg-primary-50/80 border border-primary-100 rounded-xl p-4 text-center space-y-3">
                <div className="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-primary-600 uppercase tracking-wider block">Voucher Code Found</span>
                  <span className="text-2xl font-mono font-bold text-gray-900 tracking-wider select-all block my-1">{findResult.voucher_code}</span>
                  <span className="text-xs text-gray-500 font-medium">{findResult.package_name}</span>
                </div>
                <button
                  className="w-full btn-primary justify-center text-xs py-2.5 mt-2"
                  onClick={() => {
                    setVoucherInput(findResult.voucher_code)
                    setFindModal(false)
                    loginWithVoucher(findResult.voucher_code)
                  }}
                >
                  Connect Automatically
                </button>
              </div>
            ) : (
              <form onSubmit={handleFindVoucher} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                    Phone Number or Transaction ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 077XXXXXXX or Transaction Ref"
                    value={findInput}
                    onChange={e => setFindInput(e.target.value)}
                    required
                    className="input w-full font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setFindModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={findLoading || !findInput.trim()}
                    className="btn-primary flex-1 justify-center text-xs py-2.5 disabled:opacity-50"
                  >
                    {findLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Retrieve Voucher'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
