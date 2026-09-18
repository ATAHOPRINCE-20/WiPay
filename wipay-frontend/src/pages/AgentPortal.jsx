import { useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { 
  Wifi, Ticket, Banknote, Send, Printer, Copy, Check, LogOut, Loader2, RefreshCw, ShoppingBag 
} from 'lucide-react'

export default function AgentPortal() {
  const { admin, logout } = useAuth()
  const { showToast } = useToast()

  const isSubscriptionTenant = admin?.billing_type === 'subscription'
  const isExpired = isSubscriptionTenant && admin?.subscription_expiry && new Date(admin.subscription_expiry) < new Date()

  const [stats, setStats] = useState({ todaySales: 0, stock: 0 })
  const [packages, setPackages] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [selling, setSelling] = useState(false)

  const [selectedPkgId, setSelectedPkgId] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')

  const [soldVoucher, setSoldVoucher] = useState(null)
  const [ticketModal, setTicketModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, p, h] = await Promise.all([
        api.get('/agent/stats'),
        api.get('/admin/packages'), // Fetch available packages
        api.get('/agent/sales')
      ])
      setStats(s.data || {})
      setPackages(Array.isArray(p.data) ? p.data.filter(pkg => pkg.is_active) : [])
      setSales(Array.isArray(h.data) ? h.data : [])
    } catch (err) {
      console.error('Agent Data Load Error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSell = async (e) => {
    e.preventDefault()
    if (!selectedPkgId) {
      return showToast('Please select an internet package.', 'warning')
    }

    setSelling(true)
    try {
      const res = await api.post('/agent/sell-voucher', {
        package_id: selectedPkgId,
        phone_number: phoneNumber
      })

      if (res.data.success || res.data.voucher) {
        const v = res.data.voucher
        setSoldVoucher(v)
        setTicketModal(true)
        showToast('Voucher sold successfully!', 'success')
        setPhoneNumber('')
        loadData()
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to sell voucher.', 'error')
    } finally {
      setSelling(false)
    }
  }

  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('Voucher code copied to clipboard!', 'success')
  }

  const printTicket = () => {
    window.print()
  }

  const formatValidity = (pkg) => {
    if (!pkg) return 'Unlimited'
    if (pkg.validity_unit === 'minutes' && pkg.validity_minutes > 0) return `${pkg.validity_minutes} mins`
    const hours = parseFloat(pkg.validity_hours || 0)
    if (hours > 0) {
      if (hours >= 720 && hours % 720 === 0) return `${hours / 720} Mo`
      if (hours >= 168 && hours % 168 === 0) return `${hours / 168} Wk`
      if (hours >= 24 && hours % 24 === 0) return `${hours / 24} Days`
      if (hours < 1) return `${Math.round(hours * 60)} mins`
      return `${hours} hrs`
    }
    if (pkg.validity_minutes > 0) return `${pkg.validity_minutes} mins`
    return 'Unlimited'
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Printable Ticket CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #agent-print-ticket, #agent-print-ticket * {
            visibility: visible !important;
          }
          #agent-print-ticket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto space-y-6">

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">Today's Sales</p>
                <p className="text-2xl font-extrabold mt-1">
                  UGX {Number(stats?.todaySales || 0).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                <Banknote className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider">Vouchers Sold Today</p>
                <p className="text-2xl font-extrabold mt-1">
                  {sales.filter(s => new Date(s.created_at).toDateString() === new Date().toDateString()).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                <Ticket className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-purple-500/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-100 uppercase tracking-wider">Total Sales Count</p>
                <p className="text-2xl font-extrabold mt-1">
                  {sales.length}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Sell Voucher Form */}
        <div className="card p-6 border border-emerald-100 shadow-md bg-white">
          <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-500" /> Instant Voucher Sales
          </h2>
          <p className="text-xs text-gray-400 mb-5">Select a package and enter customer details to sell a voucher code instantly</p>

          {isExpired && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 mb-5 text-center">
              ⚠️ Tenant Subscription Expired: Agent voucher sales are suspended until your administrator renews subscription.
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : (
            <form onSubmit={handleSell} className="space-y-5">
              {/* Package Selection Cards */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">1. Select Internet Package *</label>
                {packages.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No packages configured by your administrator.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {packages.map(pkg => {
                      const isSelected = selectedPkgId === pkg.id
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => setSelectedPkgId(pkg.id)}
                          className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-200' 
                              : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <p className="font-bold text-gray-900 text-sm">{pkg.name}</p>
                            {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
                          </div>
                          <p className="text-lg font-extrabold text-emerald-600">
                            {Number(pkg.price).toLocaleString()} <span className="text-xs font-normal text-gray-500">UGX</span>
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2 border-t border-gray-100 pt-1.5">
                            <span>⏳ {formatValidity(pkg)}</span>
                            <span>⚡ {pkg.rate_limit || '1M/1M'}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Phone Number Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  2. Customer Phone Number <span className="text-gray-400 font-normal">(optional - for instant SMS receipt)</span>
                </label>
                <input 
                  type="text"
                  placeholder="07XXXXXXXX (e.g. 0770000000)"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="input font-mono text-sm max-w-md"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={selling || !selectedPkgId || isExpired}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-200 transition text-sm flex items-center justify-center gap-2 w-full sm:w-auto min-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selling ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-4 h-4" /> Issue & Print Voucher</>}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sales History */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-500" /> Recent Sales History
            </h3>
            <span className="text-xs text-gray-400">{sales.length} transactions</span>
          </div>

          <div className="overflow-y-auto max-h-[50vh]">
            <table className="w-full text-sm text-left table-fixed sm:table-auto">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b border-gray-100 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Voucher Code</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Amount (UGX)</th>
                  <th className="hidden md:table-cell px-4 py-3">Customer</th>
                  <th className="hidden sm:table-cell px-4 py-3">Date / Time</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                      No sales yet. Use the form above to issue your first voucher code.
                    </td>
                  </tr>
                ) : (
                  sales.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-gray-900 text-sm">{s.voucher_code || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.package_name || 'Standard'}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">
                        {Number(s.amount).toLocaleString()}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-500">{s.phone_number || 'Cash Customer'}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setSoldVoucher({
                              code: s.voucher_code,
                              package_name: s.package_name,
                              price: s.amount
                            })
                            setTicketModal(true)
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition inline-flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" /> Ticket
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Ticket / Receipt Modal */}
      {ticketModal && soldVoucher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setTicketModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="text-center pb-3 border-b border-gray-100">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                <Check className="w-6 h-6" />
              </span>
              <h3 className="text-base font-bold text-gray-900">Voucher Issued Successfully!</h3>
              <p className="text-xs text-gray-400">Hand this ticket or code to your customer</p>
            </div>

            {/* Ticket Card Preview */}
            <div id="agent-print-ticket" className="my-4 p-4 border-2 border-dashed border-gray-400 rounded-xl bg-white text-black font-sans text-center">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
                <span className="font-bold text-xs uppercase tracking-wider text-gray-900">
                  📶 {admin?.business_name || 'UGPAY Wi-Fi'}
                </span>
                <span className="font-extrabold text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">
                  {Number(soldVoucher.price).toLocaleString()}/=
                </span>
              </div>

              <div className="my-3">
                <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Wi-Fi Voucher Code</p>
                <div className="my-1.5 py-2 px-3 bg-gray-50 border border-gray-300 rounded-lg">
                  <span className="font-mono text-2xl font-extrabold tracking-widest text-gray-900 select-all">
                    {soldVoucher.code}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-gray-600 pt-1 border-t border-gray-200">
                <span><strong>Package:</strong> {soldVoucher.package_name || 'Wi-Fi'}</span>
                <span>wifi.portal</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">Connect Wi-Fi & enter code on portal</p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => copyCode(soldVoucher.code)} 
                  className="btn-secondary justify-center text-xs py-2.5 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>

                <button 
                  onClick={printTicket} 
                  className="btn-primary bg-gray-900 hover:bg-black text-white justify-center text-xs py-2.5 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Print Ticket
                </button>
              </div>

              <button 
                onClick={() => setTicketModal(false)} 
                className="w-full text-xs text-gray-500 font-medium py-2 hover:bg-gray-50 rounded-lg transition"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
