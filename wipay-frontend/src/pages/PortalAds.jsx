import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Plus, Trash2, Loader2, Image as ImageIcon, ToggleLeft, ToggleRight, X, ExternalLink } from 'lucide-react'
import { useToast } from '../context/ToastContext'

const EMPTY = { title: '', link_url: '', file: null }

export default function PortalAds() {
  const { showToast } = useToast()
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/portal-ads')
      setAds(Array.isArray(data) ? data : [])
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (searchParams.get('upload') === 'true') {
      openUpload()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const openUpload = () => {
    setForm(EMPTY)
    setError('')
    setModal(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    setForm(p => ({ ...p, file }))
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.file) {
      setError('Please select an ad image file.')
      return
    }
    setSaving(true)
    setError('')

    const formData = new FormData()
    formData.append('title', form.title)
    formData.append('link_url', form.link_url)
    formData.append('file', form.file)

    try {
      await api.post('/admin/portal-ads/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload portal ad.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (ad) => {
    try {
      const { data } = await api.patch(`/admin/portal-ads/${ad.id}/toggle`)
      setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: data.is_active } : a))
    } catch (err) {
      showToast('Failed to toggle ad status.', 'error')
    }
  }

  const remove = async (id) => {
    if (!confirm('Delete this portal advertisement?')) return
    try {
      await api.delete(`/admin/portal-ads/${id}`)
      load()
    } catch (err) {
      showToast('Failed to delete portal ad.', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Portal Ads</h2>
          <p className="text-sm text-gray-400">Upload and manage promotional banners shown on the captive portal</p>
        </div>
        <button className="btn-primary" onClick={openUpload}>
          <Plus className="w-4 h-4" /> Upload Ad
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 card">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : ads.length === 0 ? (
        <div className="card py-16 text-center text-gray-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No portal ads uploaded yet.</p>
          <p className="text-xs text-gray-400 mt-1">Upload banner ads to promote services or sponsorships on the login page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ads.map(ad => (
            <div key={ad.id} className="card overflow-hidden flex flex-col group relative">
              {/* Ad Image Container */}
              <div className="h-40 bg-gray-100 flex items-center justify-center overflow-hidden border-b border-gray-100 relative">
                <img 
                  src={ad.image_url} 
                  alt={ad.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                {!ad.is_active && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                    <span className="bg-gray-900/90 text-white text-[11px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Inactive</span>
                  </div>
                )}
              </div>

              {/* Card Footer Content */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900 truncate" title={ad.title}>{ad.title}</h4>
                  {ad.link_url && (
                    <a 
                      href={ad.link_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs text-primary-500 hover:underline flex items-center gap-1 mt-1 truncate"
                    >
                      <ExternalLink className="w-3 h-3" /> Redirect Link
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-4">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggle(ad)} className="focus:outline-none">
                      {ad.is_active ? (
                        <ToggleRight className="w-6 h-6 text-primary-500" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-gray-300" />
                      )}
                    </button>
                    <span className="text-xs text-gray-500 font-medium">Active</span>
                  </div>

                  <button 
                    onClick={() => remove(ad.id)} 
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Delete Ad"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {modal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Upload Portal Banner Ad</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ad Title</label>
                <input 
                  className="input" 
                  placeholder="e.g. Weekend Discount Promo" 
                  value={form.title} 
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))} 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Redirect URL (Optional)</label>
                <input 
                  className="input" 
                  placeholder="e.g. https://mybusiness.com/deal" 
                  value={form.link_url} 
                  onChange={e => setForm(p => ({ ...p, link_url: e.target.value }))} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ad Image Banner File</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-primary-400 transition-colors">
                  <div className="space-y-1 text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label className="relative cursor-pointer bg-white rounded-md font-medium text-primary-500 hover:text-primary-400">
                        <span>Select image file</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="sr-only" 
                          onChange={handleFileChange} 
                          required 
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-400">PNG, JPG, GIF up to 5MB</p>
                    {form.file && (
                      <p className="text-xs text-green-600 font-semibold mt-2 truncate max-w-xs">
                        Selected: {form.file.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
