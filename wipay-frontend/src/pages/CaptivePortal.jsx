import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wifi, Loader2, CheckCircle } from 'lucide-react'

export default function CaptivePortal() {
  const [params]   = useSearchParams()
  const adminId    = params.get('admin') || params.get('admin_id')
  const slug       = params.get('slug')
  const linkLogin  = params.get('link-login') || params.get('link_login') || ''

  const [branding,  setBranding]  = useState({ name: 'WiPay', phone: '', portal_logo: '', portal_welcome_msg: '', terms_text: '' })
  const [packages,  setPackages]  = useState([])
  const [loadingPkg, setLoadingPkg] = useState(true)
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
  const pollingRef = useRef(null)

  const API = '/api'

  useEffect(() => {
    const query = new URLSearchParams()
    if (adminId) query.set('admin_id', adminId)
    if (slug) query.set('slug', slug)
    const qStr = query.toString() ? `?${query.toString()}` : ''

    fetch(`${API}/branding${qStr}`)
      .then(r => r.json()).then(b => { setBranding(b); setLogoError(false) }).catch(() => {})
    fetch(`${API}/packages${qStr}`)
      .then(r => r.json()).then(setPackages).catch(() => {})
      .finally(() => setLoadingPkg(false))
    fetch(`${API}/public/portal-ads${qStr}`)
      .then(r => r.json()).then(data => setAds(Array.isArray(data) ? data : [])).catch(() => {})
    return () => clearInterval(pollingRef.current)
  }, [adminId, slug])

  useEffect(() => {
    if (ads.length <= 1) return
    const timer = setInterval(() => {
      setCurrentAdIndex(prev => (prev + 1) % ads.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [ads])

  const buy = async () => {
    if (!phone.trim()) return setMsg('Please enter your phone number.')
    setStep('paying'); setMsg('')
    try {
      const r = await fetch(`${API}/purchase`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phone, package_id: selected.id, admin_id: adminId }),
      })
      const d = await r.json()
      if (!d.transaction_id) { setMsg(d.error || 'Payment failed.'); setStep('idle'); return }
      setTxRef(d.transaction_id); setModal(false); setStep('polling')
      pollingRef.current = setInterval(() => pollStatus(d.transaction_id), 5000)
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
        clearInterval(pollingRef.current); setStep('success'); setVoucherCode(d.voucher_code)
        if (d.voucher_code && linkLogin) {
          setTimeout(() => loginWithVoucher(d.voucher_code), 1500)
        }
      } else if (d.status === 'FAILED') { clearInterval(pollingRef.current); setMsg('Payment failed.'); setStep('idle') }
    } catch {}
  }

  const loginWithVoucher = (code) => {
    const form = document.createElement('form')
    form.method = 'POST'; form.action = linkLogin
    ;[['username', code], ['password', code]].forEach(([n, v]) => {
      const f = document.createElement('input'); f.type = 'hidden'; f.name = n; f.value = v; form.appendChild(f)
    })
    document.body.appendChild(form); form.submit()
  }

  const showLogo = branding.portal_logo && !logoError

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center py-8 px-4">

      {/* Header / Branding */}
      <header className="text-center mb-6">
        {showLogo ? (
          <img
            src={branding.portal_logo}
            alt={branding.name}
            onError={() => setLogoError(true)}
            className="w-16 h-16 rounded-2xl object-cover shadow-lg mx-auto mb-3"
          />
        ) : (
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500 rounded-2xl shadow-lg mb-3">
            <Wifi className="w-7 h-7 text-white" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {branding.portal_welcome_msg || 'Stay online, Stay informed'}
        </p>
      </header>

      {/* Banner Ads */}
      {ads.length > 0 && (
        <div className="w-full max-w-sm mb-4">
          <div className="card overflow-hidden relative h-36 bg-gray-100 flex items-center justify-center border border-gray-100">
            {ads[currentAdIndex].link_url ? (
              <a href={ads[currentAdIndex].link_url} target="_blank" rel="noopener noreferrer" className="w-full h-full block">
                <img 
                  src={ads[currentAdIndex].image_url} 
                  alt={ads[currentAdIndex].title} 
                  className="w-full h-full object-cover"
                />
              </a>
            ) : (
              <img 
                src={ads[currentAdIndex].image_url} 
                alt={ads[currentAdIndex].title} 
                className="w-full h-full object-cover"
              />
            )}
            {ads.length > 1 && (
              <div className="absolute bottom-2 right-2 flex gap-1">
                {ads.map((_, idx) => (
                  <span 
                    key={idx} 
                    className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentAdIndex ? 'bg-primary-500 w-3' : 'bg-white/60'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voucher Redeem */}
      <div className="w-full max-w-sm mb-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Have a voucher code?</p>
          <div className="flex gap-2">
            <input
              className="input flex-1" placeholder="Enter voucher code"
              value={voucherInput} onChange={e => setVoucherInput(e.target.value)}
            />
            <button className="btn-primary whitespace-nowrap" onClick={() => loginWithVoucher(voucherInput)}>Connect</button>
          </div>
        </div>
      </div>

      {/* Payment methods badge */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-400">We Accept</span>
        <span className="badge badge-yellow font-semibold px-3">Airtel Money</span>
        <span className="badge bg-yellow-400 text-yellow-900 font-semibold px-3">MTN MoMo</span>
      </div>

      {/* Packages */}
      <div className="w-full max-w-sm">
        {loadingPkg ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-400" /></div>
        ) : packages.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No packages available. Contact admin.</p>
        ) : (
          <div className="card divide-y divide-gray-50 overflow-hidden">
            {packages.map(pkg => (
              <div key={pkg.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{pkg.name}</p>
                  <p className="text-xs text-gray-400">{pkg.duration_hours > 0 ? `${pkg.duration_hours}h` : 'Unlimited'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">{Number(pkg.price).toLocaleString()}/=</span>
                  <button
                    className="btn-primary text-xs px-3 py-1.5"
                    onClick={() => { setSelected(pkg); setModal(true); setMsg(''); setPhone('') }}
                  >PAY</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact phone */}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center max-w-xs w-full shadow-2xl">
            <CheckCircle className="w-12 h-12 text-primary-500 mx-auto mb-4" />
            <p className="font-bold text-gray-900 text-lg mb-1">Payment Confirmed!</p>
            {voucherCode && (
              <div className="bg-primary-50 rounded-lg px-4 py-3 mt-3 mb-4">
                <p className="text-xs text-primary-600 mb-1">Your voucher code:</p>
                <p className="font-mono font-bold text-xl text-primary-700">{voucherCode}</p>
              </div>
            )}
            <p className="text-sm text-gray-400">Connecting automatically…</p>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">Confirm Purchase</h3>
            <p className="text-sm text-gray-500 mb-4">{selected?.name} — {Number(selected?.price).toLocaleString()}/=</p>
            {msg && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg mb-3">{msg}</p>}
            <input
              className="input mb-4" type="tel" placeholder="Enter phone number (e.g. 0701234567)"
              value={phone} onChange={e => setPhone(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" disabled={step === 'paying'} onClick={buy}>
                {step === 'paying' ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ${Number(selected?.price).toLocaleString()}/=`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
