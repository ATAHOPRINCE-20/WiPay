import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Plus, Trash2, Loader2, Image as ImageIcon, ToggleLeft, ToggleRight, X, ExternalLink, Maximize2 } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY = { title: '', link_url: '', file: null }

export default function PortalAds() {
  const { showToast } = useToast()
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [previewAd, setPreviewAd] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
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
    const selectedFiles = Array.from(e.target.files || [])
    setForm(p => ({ ...p, files: selectedFiles }))
  }

  const save = async (e) => {
    e.preventDefault()
    const filesToUpload = form.files && form.files.length > 0 ? form.files : (form.file ? [form.file] : [])
    if (filesToUpload.length === 0) {
      setError('Please select at least one ad image file.')
      return
    }
    setSaving(true)
    setError('')

    try {
      let successCount = 0
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]
        const formData = new FormData()
        const adTitle = form.title ? (filesToUpload.length > 1 ? `${form.title} (${i + 1})` : form.title) : (file.name.replace(/\.[^/.]+$/, ""))
        formData.append('title', adTitle)
        formData.append('link_url', form.link_url || '')
        formData.append('file', file)

        await api.post('/admin/portal-ads/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        successCount++
      }

      setModal(false)
      load()
      showToast(`${successCount} portal ad${successCount > 1 ? 's' : ''} uploaded successfully.`, 'success')
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

  const remove = (id) => {
    setConfirmDeleteId(id)
  }

  const executeDelete = async () => {
    if (!confirmDeleteId) return
    try {
      await api.delete(`/admin/portal-ads/${confirmDeleteId}`)
      load()
      showToast('Portal ad deleted.', 'success')
    } catch (err) {
      showToast('Failed to delete portal ad.', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">Portal Ads</h2>
          <p className="text-xs sm:text-sm text-gray-400 truncate">Upload and manage promotional banners shown on the captive portal</p>
        </div>
        <button className="btn-primary shrink-0 whitespace-nowrap" onClick={openUpload}>
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
              {/* Ad Image Container with Ambient Background & Object-Contain */}
              <div className="h-48 bg-slate-900/5 flex items-center justify-center overflow-hidden border-b border-gray-100 relative p-2 cursor-pointer" onClick={() => setPreviewAd(ad)}>
                <div 
                  className="absolute inset-0 bg-cover bg-center blur-xl opacity-20 scale-110 pointer-events-none"
                  style={{ backgroundImage: `url(${ad.image_url})` }}
                />
                <img 
                  src={ad.image_url} 
                  alt={ad.title} 
                  className="relative z-10 max-h-full max-w-full object-contain rounded-lg shadow-xs group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setPreviewAd(ad); }} 
                  className="absolute top-2 right-2 z-20 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition"
                  title="Preview Full Flyer"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                {!ad.is_active && (
                  <div className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
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

      {/* Full Flyer Preview Modal */}
      {previewAd && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewAd(null)}>
          <div className="relative max-w-lg w-full max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center p-2 border border-slate-800" onClick={e => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between p-3 text-white border-b border-slate-800">
              <h3 className="font-semibold text-sm truncate max-w-[80%]">{previewAd.title || 'Flyer Preview'}</h3>
              <button onClick={() => setPreviewAd(null)} className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full flex-1 overflow-auto flex items-center justify-center p-2">
              <img src={previewAd.image_url} alt={previewAd.title} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
            </div>
          </div>
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
                        <span>Select image file(s)</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          multiple
                          className="sr-only" 
                          onChange={handleFileChange} 
                          required 
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-400">PNG, JPG, GIF up to 5MB (Select multiple to batch upload)</p>
                    {form.files && form.files.length > 0 && (
                      <p className="text-xs text-green-600 font-semibold mt-2 truncate max-w-xs">
                        Selected {form.files.length} file{form.files.length > 1 ? 's' : ''}: {form.files.map(f => f.name).join(', ')}
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

      {/* Delete Ad Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={executeDelete}
        title="Delete Portal Ad"
        message="Are you sure you want to delete this promotional banner?"
        confirmText="Delete Ad"
        type="danger"
      />
    </div>
  )
}
