import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Wifi, Loader2, Check, ArrowRight, ArrowLeft, Mail, ShieldAlert, Eye, EyeOff } from 'lucide-react'
import { useToast } from '../context/ToastContext'

export default function Register() {
  const { showToast } = useToast()
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()

  // Form State
  const [companyName, setCompanyName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Wizard state
  const [step, setStep] = useState(1) // 1 or 2
  const [error, setError] = useState('')
  const [subdomainManuallyEdited, setSubdomainManuallyEdited] = useState(false)

  // OTP states
  const [sendingOtp, setSendingOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [registering, setRegistering] = useState(false)

  // Auto-fill subdomain from company name
  useEffect(() => {
    if (subdomainManuallyEdited) return
    const generated = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 30)
    setSubdomain(generated)
  }, [companyName])

  const sendOtp = async () => {
    if (!email) return
    setError('')
    setSendingOtp(true)
    try {
      await api.post('/auth/register/send-otp', { email })
      setOtpSent(true)
      showToast('Verification code sent to your email!', 'success')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to send OTP code.')
    } finally {
      setSendingOtp(false)
    }
  }

  const handleNextStep = (e) => {
    e.preventDefault()
    setError('')

    if (!companyName || !subdomain || !email || !phone) {
      setError('Please fill in all required fields.')
      return
    }

    if (!otpSent) {
      setError('Please verify your email address before proceeding.')
      return
    }

    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit verification code sent to your email.')
      return
    }

    setStep(2)
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    if (!username || !password || !confirmPassword || !otp) {
      setError('All credential fields are required.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setRegistering(true)
    try {
      const { data } = await api.post('/auth/register', {
        username,
        password,
        email,
        company_name: companyName,
        subdomain,
        phone_number: '+256' + phone.trim().replace(/^0+/, ''),
        otp
      })

      // Store credentials and login session
      localStorage.setItem('wipay_token', data.token)
      localStorage.setItem('wipay_admin', JSON.stringify(data.admin))
      
      await refreshProfile()
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed.')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header / Subtitle
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Create your account</h2>
        <p className="text-xs text-gray-500 mt-1">21-day free trial, then USh 25,000/month</p>
      </div> */}

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
          step === 1 
            ? 'bg-primary-500 text-white border-primary-500 shadow-sm' 
            : 'bg-primary-50 border-primary-100 text-primary-600'
        }`}>
          1
        </span>
        <div className={`h-[2px] w-8 transition-colors ${step === 2 ? 'bg-primary-500' : 'bg-gray-200'}`} />
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
          step === 2 
            ? 'bg-primary-500 text-white border-primary-500 shadow-sm' 
            : 'bg-gray-100 border-gray-200 text-gray-400'
        }`}>
          2
        </span>
      </div>

      {/* Form Card */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 flex items-start gap-2 animate-shake">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-0.5">Business Information</h3>
              <p className="text-xs text-gray-400">Tell us about your ISP business</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Company Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Garuga IT"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
                className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Subdomain *
                </label>
                {!subdomainManuallyEdited && subdomain && (
                  <span className="text-[10px] bg-primary-50 text-primary-600 font-semibold px-1.5 py-0.5 rounded border border-primary-100">
                    auto-filled
                  </span>
                )}
              </div>
              <div className="flex rounded-lg border border-gray-200 focus-within:ring-1 focus-within:ring-primary-500 focus-within:border-primary-500 overflow-hidden">
                <input
                  type="text"
                  placeholder="yourcompany"
                  value={subdomain}
                  onChange={e => {
                    setSubdomainManuallyEdited(true)
                    setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }}
                  required
                  className="flex-1 min-w-0 px-3.5 py-2 text-sm focus:outline-none bg-transparent"
                />
                <span className="bg-gray-50 px-3.5 py-2 text-sm text-gray-400 border-l border-gray-100 select-none">
                  .wipay.com
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Business Email *
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setOtpSent(false); }}
                    required
                    disabled={sendingOtp || registering}
                    className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {otpSent && (
                    <span className="absolute right-3 top-2.5 text-emerald-500">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={sendingOtp || !email}
                  className="btn-primary py-2 px-3 text-xs shrink-0 flex items-center justify-center min-w-[70px]"
                >
                  {sendingOtp ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : otpSent ? (
                    'Resend'
                  ) : (
                    'Verify'
                  )}
                </button>
              </div>
              {otpSent && (
                <div className="mt-3 animate-in">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Enter Verification Code *
                  </label>
                  <input
                    type="text"
                    placeholder="6-digit code from your email"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    className="w-full px-3.5 py-2.5 border-2 border-emerald-400 rounded-lg text-sm font-mono text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 bg-emerald-50 placeholder:tracking-normal placeholder:font-sans placeholder:text-xs"
                  />
                  <p className="text-[10px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Check your email inbox for the 6-digit code.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Phone Number *
              </label>
              <div className="flex gap-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-500 px-3 py-2 flex items-center gap-1.5 select-none shrink-0">
                  <span className="text-sm">🇺🇬</span>
                  <span>+256</span>
                </div>
                <input
                  type="tel"
                  placeholder="7XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').substring(0, 9))}
                  required
                  className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>



            <button
              type="submit"
              className="w-full mt-4 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all shadow-sm"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-0.5">Account Credentials</h3>
              <p className="text-xs text-gray-400">Set up your admin access credentials</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Username *
              </label>
              <input
                type="text"
                placeholder="e.g. admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full pl-3.5 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="w-full pl-3.5 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>



            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={registering}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="submit"
                disabled={registering || !username || !password || !confirmPassword}
                className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {registering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Back to sign in */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold underline decoration-2 underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}
