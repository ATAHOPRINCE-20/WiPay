import { useEffect, useState } from 'react'
import api from '../services/api'
import { Plus, Pencil, Trash2, Loader2, FolderOpen } from 'lucide-react'

const EMPTY = { name: '', description: '' }

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/admin/categories')
      setCategories(data)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
    } catch (err) {
      alert(err.response?.data?.message || 'Cannot delete category with linked packages.')
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Name', 'Description', 'Created', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
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
                <tr key={cat.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-500">{cat.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {cat.created_at ? new Date(cat.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(cat)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(cat.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
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
