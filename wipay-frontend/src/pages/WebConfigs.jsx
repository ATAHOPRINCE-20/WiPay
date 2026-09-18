import { useEffect, useState } from 'react'
import api from '../services/api'
import { Loader2, Settings, Globe, FileText, Image as ImageIcon, Save, CheckCircle2 } from 'lucide-react'

export default function WebConfigs() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [configs, setConfigs] = useState({
    business_name: '',
    business_phone: '',
    portal_dns: '',
    portal_welcome_msg: '',
    terms_text: '',
    portal_logo: '',
    portal_theme: 'default',
    primary_color: '#6366f1'
  })
  const [logoFile, setLogoFile] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/web-configs')
      setConfigs({
        business_name: data.business_name || '',
        business_phone: data.business_phone || '',
        portal_dns: data.portal_dns || '',
        portal_welcome_msg: data.portal_welcome_msg || '',
        terms_text: data.terms_text || '',
        portal_logo: data.portal_logo || '',
        portal_theme: data.portal_theme || 'default',
        primary_color: data.primary_color || '#6366f1'
      })
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const saveConfigs = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    setErrorMsg('')
    try {
      await api.put('/admin/web-configs', {
        business_name: configs.business_name,
        business_phone: configs.business_phone,
        portal_dns: configs.portal_dns,
        portal_welcome_msg: configs.portal_welcome_msg,
        terms_text: configs.terms_text,
        portal_theme: configs.portal_theme,
        primary_color: configs.primary_color
      })
      setSuccessMsg('Branding, theme, and settings updated successfully!')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to update configurations.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploading(true)
    setSuccessMsg('')
    setErrorMsg('')
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const { data } = await api.post('/admin/web-configs/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setConfigs(p => ({ ...p, portal_logo: data.logo_url }))
      setSuccessMsg('Business logo uploaded successfully!')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to upload logo image.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Web Configurations</h2>
        <p className="text-sm text-gray-400">Customize your business name, captive portal branding, welcome message, terms & logo</p>
      </div>

      {successMsg && (
        <div className="bg-green-50 text-green-700 p-3 rounded-xl flex items-center gap-2 text-sm border border-green-100 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4" /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm border border-red-100 animate-in fade-in duration-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settings Form */}
        <div className="card p-6 md:col-span-2 shadow-md">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-1.5"><Settings className="w-4 h-4 text-primary-500" /> Portal Configurations</h3>
          
          <form onSubmit={saveConfigs} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Business / Brand Name</label>
                <input 
                  className="input" 
                  placeholder="e.g. Lagos Rocket WiFi" 
                  value={configs.business_name} 
                  onChange={e => setConfigs(p => ({ ...p, business_name: e.target.value }))} 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Business Support Phone</label>
                <input 
                  className="input" 
                  placeholder="e.g. 0700000000" 
                  value={configs.business_phone} 
                  onChange={e => setConfigs(p => ({ ...p, business_phone: e.target.value }))} 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-gray-400" /> Captive Portal DNS Hostname</label>
              <input 
                className="input" 
                placeholder="e.g. hotspot.mywifi.com" 
                value={configs.portal_dns} 
                onChange={e => setConfigs(p => ({ ...p, portal_dns: e.target.value }))} 
              />
              <p className="text-[10px] text-gray-400 mt-1">Configure this to redirect users to a clean domain instead of the router gateway IP.</p>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-gray-400" /> Portal Welcome Message</label>
              <input 
                className="input" 
                placeholder="e.g. Welcome to Garuga Coffee Spot WiFi" 
                value={configs.portal_welcome_msg} 
                onChange={e => setConfigs(p => ({ ...p, portal_welcome_msg: e.target.value }))} 
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-gray-400" /> Terms and Conditions Text</label>
              <textarea 
                className="input resize-none" 
                rows={5}
                placeholder="Write your WiFi Hotspot usage terms and guidelines here..." 
                value={configs.terms_text} 
                onChange={e => setConfigs(p => ({ ...p, terms_text: e.target.value }))} 
              />
            </div>

            {/* Captive Portal Theme Selection */}
            <div className="pt-3 border-t border-gray-100">
              <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <span>Captive Portal Theme Preset</span>
                <span className="text-[11px] text-gray-400 font-normal">Choose visual theme for hotspot login page</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'default', name: 'Default Light', bg: 'bg-slate-100 border-slate-200 text-slate-900', btn: 'bg-indigo-600' },
                  { id: 'glass', name: 'Glassmorphism', bg: 'bg-gradient-to-tr from-indigo-950 via-purple-950 to-slate-950 border-white/30 text-white backdrop-blur-md', btn: 'bg-cyan-400' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setConfigs(p => ({ ...p, portal_theme: t.id }))}
                    className={`p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between h-20 ${t.bg} ${
                      configs.portal_theme === t.id ? 'ring-2 ring-primary-500 border-primary-500 shadow-md scale-[1.02]' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span className="text-xs font-bold truncate">{t.name}</span>
                    <div className="flex items-center justify-between w-full mt-2">
                      <span className={`w-3.5 h-3.5 rounded-full ${t.btn} inline-block shadow-xs`} />
                      {configs.portal_theme === t.id && (
                        <span className="text-[9px] font-bold text-primary-600 bg-white px-1.5 py-0.5 rounded-full uppercase shadow-xs">Selected</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 text-sm justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
            </button>
          </form>
        </div>

        {/* Branding & Logo Logo */}
        <div className="card p-6 shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-primary-500" /> Hotspot Logo</h3>
            <p className="text-xs text-gray-400 mb-4">Upload your brand logo. It will be displayed at the top of the captive login portal.</p>
            
            {/* Logo Preview */}
            <div className="h-44 w-full bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center p-4 relative overflow-hidden group shadow-inner">
              {configs.portal_logo ? (
                <img 
                  src={configs.portal_logo} 
                  alt="Branding logo preview" 
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <span className="text-xs">No Logo Uploaded</span>
                </div>
              )}

              {uploading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center backdrop-blur-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <label className="btn-secondary w-full justify-center text-center cursor-pointer flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              <span>{configs.portal_logo ? 'Change Logo' : 'Upload Logo'}</span>
              <input 
                type="file" 
                accept="image/*" 
                className="sr-only" 
                onChange={handleLogoUpload} 
                disabled={uploading} 
              />
            </label>
          </div>

          {/* Live Portal Theme Preview */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Live Portal Theme Preview</h4>
            <div className={`p-4 rounded-2xl border transition-all ${
              configs.portal_theme === 'glass' 
                ? 'bg-gradient-to-tr from-slate-950 via-indigo-950 to-purple-950 text-white border-white/20 shadow-xl' 
                : 'bg-slate-50 border-gray-200 text-gray-900 shadow-xs'
            }`}>
              <div className="text-center space-y-1 mb-3">
                <p className="text-xs font-extrabold">{configs.business_name || 'UGPAY'}</p>
                <p className="text-[10px] opacity-70">{configs.portal_welcome_msg || 'Stay online, Stay informed'}</p>
              </div>
              <div className={`p-3 rounded-xl text-center space-y-2 ${
                configs.portal_theme === 'glass' ? 'bg-white/10 backdrop-blur-md border border-white/15' : 'bg-white border border-gray-100 shadow-xs'
              }`}>
                <p className="text-[10px] opacity-80">Enter voucher code</p>
                <div className={`py-1.5 px-3 rounded-lg text-xs font-bold ${
                  configs.portal_theme === 'glass' ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950' : 'bg-indigo-600 text-white'
                }`}>
                  Connect to Wi-Fi
                </div>
              </div>
              <p className="text-[9px] text-center mt-3 opacity-60 font-bold uppercase tracking-wider">
                Powered by UgPay
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
