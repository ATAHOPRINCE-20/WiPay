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
    portal_dns: '',
    portal_welcome_msg: '',
    terms_text: '',
    portal_logo: ''
  })
  const [logoFile, setLogoFile] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/web-configs')
      setConfigs({
        portal_dns: data.portal_dns || '',
        portal_welcome_msg: data.portal_welcome_msg || '',
        terms_text: data.terms_text || '',
        portal_logo: data.portal_logo || ''
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
        portal_dns: configs.portal_dns,
        portal_welcome_msg: configs.portal_welcome_msg,
        terms_text: configs.terms_text
      })
      setSuccessMsg('Branding and settings updated successfully!')
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
        <p className="text-sm text-gray-400">Customize your captive portal branding, welcome portal message, terms & logo</p>
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
        </div>
      </div>
    </div>
  )
}
