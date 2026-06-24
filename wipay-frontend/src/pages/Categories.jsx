import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, FolderOpen, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'

const EMPTY = { name: '', description: '' }

export default function Categories() {
  const { showToast } = useToast()
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/categories')
      setCategories(Array.isArray(data) ? data : [])
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      openCreate()
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setModal(true) }
  const openEdit   = (cat) => {
    setForm({ name: cat.name, description: cat.description || '' })
    setEditId(cat.id); setError(''); setModal(true)
  }

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try {
      if (editId) await api.put(`/admin/categories/${editId}`, form)
      else        await api.post('/admin/categories', form)
      setModal(false); load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save category.')
    } finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this category? Packages linked to it cannot be deleted.')) return
    try {
      await api.delete(`/admin/categories/${id}`)
      load()
      if (selectedRow?.id === id) setSelectedRow(null)
    } catch (err) {
      showToast(err.response?.data?.message || 'Cannot delete category with linked packages.', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-400">Group packages by location or service type</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[65vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                  <th className="hidden md:table-cell px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-gray-400 text-sm">
                      <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      No categories yet. Create your first category.
                    </td>
                  </tr>
                ) : categories.map(cat => (
                  <tr 
                    key={cat.id} 
                    onClick={() => setSelectedRow(cat)}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer md:cursor-default"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 truncate">{cat.name}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 truncate">{cat.description || '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-400 text-xs truncate">
                      {cat.created_at ? new Date(cat.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(cat) }} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); remove(cat.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Detail Modal */}
      {selectedRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 md:hidden" 
          onClick={() => setSelectedRow(null)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 pb-8 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRow.name}</h3>
                <p className="text-xs text-gray-400">Category Details</p>
              </div>
              <button onClick={() => setSelectedRow(null)} className="p-1.5 -mr-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex flex-col border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500 mb-1">Description</span>
                <span className="text-sm font-medium text-gray-900">{selectedRow.description || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-xs text-gray-500">Created At</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button 
                className="btn-secondary justify-center flex items-center gap-2"
                onClick={() => {
                  setSelectedRow(null);
                  openEdit(selectedRow);
                }}
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <button 
                className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 justify-center flex items-center gap-2"
                onClick={() => remove(selectedRow.id)}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {modal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">{editId ? 'Edit Category' : 'New Category'}</h3>
            {error && <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input className="input" placeholder="e.g. Daily Plans" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input resize-none" rows={3} placeholder="Optional description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? 'Save Changes' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
