import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import MetricCard from '../components/MetricCard'
import DashboardSkeleton from '../components/DashboardSkeleton'
import WithdrawalModal from '../components/WithdrawalModal'
import {
  MessageSquare, Users, Wifi, HardDrive, Activity,
  TrendingUp, ChevronDown, Trophy, Wallet, ShoppingBag, Award, ArrowRight, Eye, EyeOff
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'

const PERIODS = ['This year', 'Last year']
const USER_PERIODS = ['This week', 'Last week']

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats]   = useState(null)
  const [chart, setChart]   = useState([])
  const [userData, setUserData] = useState({ active_now: 0, average: 0, peak: 0, chart: [] })
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]     = useState('This year')
  const [userPeriod, setUserPeriod] = useState('This week')
  const [hideBalance, setHideBalance] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const year = period === 'Last year' ? new Date().getFullYear() - 1 : new Date().getFullYear()
    const days = userPeriod === 'Last week' ? 14 : 7
    try {
      const results = await Promise.allSettled([
        api.get('/admin/stats'),
        api.get('/admin/payments-chart', { params: { year } }),
        api.get('/admin/active-users-chart', { params: { days } }),
      ])
      let currentStats = null
      if (results[0].status === 'fulfilled' && results[0].value?.data) {
        currentStats = results[0].value.data
        setStats(currentStats)
      }
      if (results[1].status === 'fulfilled' && results[1].value?.data) {
        setChart(Array.isArray(results[1].value.data) ? results[1].value.data : [])
      }
      if (results[2].status === 'fulfilled' && results[2].value?.data) {
        const val = results[2].value.data
        if (Array.isArray(val)) {
          const userCounts = val.map(c => c?.users || 0)
          const peak = userCounts.length > 0 ? Math.max(...userCounts, 0) : 0
          const avg = val.length > 0 ? Math.round(userCounts.reduce((a, b) => a + b, 0) / val.length) : 0
          setUserData({ active_now: currentStats?.active_sessions || 0, average: avg, peak: peak, chart: val })
        } else if (val && typeof val === 'object') {
          setUserData({
            active_now: val.active_now ?? currentStats?.active_sessions ?? 0,
            average: val.average ?? 0,
            peak: val.peak ?? 0,
            chart: Array.isArray(val.chart) ? val.chart : []
          })
        }
      }
    } catch (_) {}
    setLoading(false)
  }, [period, userPeriod])

  useEffect(() => { load() }, [load])

  const fmt = (n) => `UGX ${Number(n || 0).toLocaleString()}`

  const fmtBytes = (b) => {
    if (!b || b <= 0) return '0 B'
    const k = 1024, sizes = ['B','KB','MB','GB','TB']
    const i = Math.floor(Math.log(b) / Math.log(k))
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
  }

  if (loading) return <DashboardSkeleton />

  const leaderboard = stats?.agent_leaderboard || []

  return (
    <div className="space-y-6">
      {/* Metric Cards - 1 Dominant Card (Withdrawable Balance) + 3 Small Cards Beside It */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Dominant Card: Withdrawable Balance */}
        <div className="lg:col-span-5 xl:col-span-5 relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-primary-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-500/10 flex flex-col justify-between border border-emerald-400/20">
          {/* Decorative Background Blobs */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none" />

          {/* Card Header */}
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-md border border-white/20 shadow-sm">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-100 bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20">
                  Primary Wallet
                </span>
              </div>
            </div>
            <button
              onClick={() => setHideBalance(!hideBalance)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition"
              title={hideBalance ? 'Show balance' : 'Hide balance'}
            >
              {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Main Balance Display */}
          <div className="relative my-4 z-10">
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
              Withdrawable Balance
            </p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white mt-1">
              {hideBalance ? '••••••••' : fmt(stats?.finance?.withdrawable_balance)}
            </h2>
            <p className="text-xs text-emerald-100/80 mt-1.5">
              Automated Mobile Money gateway revenue ready for instant payout
            </p>
          </div>

          {/* Action CTA */}
          <div className="relative pt-4 border-t border-white/15 flex items-center justify-between z-10">
            <span className="text-xs text-emerald-100/90 font-medium">Instant Mobile Money Payout</span>
            <button
              type="button"
              onClick={() => setWithdrawModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-700 font-bold text-xs hover:bg-emerald-50 transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
            >
              <span>Withdraw Funds</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Secondary Small Cards Beside It */}
        <div className="lg:col-span-7 xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Agent Cash Sales */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                In-Person
              </span>
            </div>
            
            <div className="my-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Agent Sales</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {hideBalance ? '••••••' : fmt(stats?.finance?.agent_cash_total)}
              </p>
            </div>

            <div>
              <p className="text-[10px] text-gray-400">
                {stats?.finance?.agent_sales_count || 0} cash vouchers
              </p>
            </div>
          </div>

          {/* 2. SMS Balance */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-100">
                Credits
              </span>
            </div>

            <div className="my-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">SMS Balance</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {Number(stats?.sms_balance || 0).toLocaleString()} <span className="text-xs font-normal text-gray-500">SMS</span>
              </p>
            </div>

            <div>
              <p className="text-[10px] text-gray-400">
                Text notification credits
              </p>
            </div>
          </div>

          {/* 3. Total Clients */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Clients
              </span>
            </div>

            <div className="my-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Clients</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {Number(stats?.counts?.clients ?? stats?.vouchers?.used ?? 0).toLocaleString()}
              </p>
            </div>

            <div>
              <p className="text-[10px] text-gray-400">
                Active network users
              </p>
            </div>
          </div>

          {/* 4. Total Data Usage */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                Bandwidth
              </span>
            </div>

            <div className="my-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Data Consumed</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {fmtBytes(stats?.data_usage?.total_bytes)}
              </p>
            </div>

            <div className="text-[10px] text-gray-400 flex justify-between">
              <span>DL: {fmtBytes(stats?.data_usage?.download_bytes)}</span>
              <span>UL: {fmtBytes(stats?.data_usage?.upload_bytes)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.isArray(chart) && chart.length > 0 ? (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Payments Trend (MoMo vs Agents)</h3>
              <p className="text-xs text-gray-400 mt-0.5">Monthly revenue breakdown by channel</p>
            </div>
            <div className="relative">
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="appearance-none text-xs bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                cursor={{ fill: 'rgba(22,185,122,0.05)' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar dataKey="momo" name="MoMo Revenue" fill="#16b97a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="agent" name="Agent Cash Sales" fill="#9333ea" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        ) : (
          <div className="card p-5"><p className="text-sm text-gray-400">No payment data available.</p></div>
        )}

        {Array.isArray(userData.chart) && userData.chart.length > 0 ? (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-semibold text-gray-900">Active Users</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Active now: {userData.active_now} users |&nbsp;
                Average: {userData.average} | Peak: {userData.peak}
              </p>
              <p className="text-xs text-gray-400">{userPeriod.toLowerCase()}</p>
            </div>
            <div className="relative">
              <select
                value={userPeriod}
                onChange={e => setUserPeriod(e.target.value)}
                className="appearance-none text-xs bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {USER_PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={userData.chart} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} />
              <Line type="monotone" dataKey="users" name="Hotspot Users (Active)" stroke="#16b97a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-500 inline-block" />
              Hotspot Users (Active: {userData.active_now})
            </span>
          </div>
        </div>
        ) : (
          <div className="card p-5"><p className="text-sm text-gray-400">No user data available.</p></div>
        )}
      </div>

      {/* Revenue Collections Summary Row (Separated MoMo vs Agent Cash) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary-600" />
            Collections Breakdown (MoMo vs Agent Cash)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { 
              label: 'Today', 
              momo: stats?.revenue?.momo?.today ?? 0, 
              agent: stats?.revenue?.agent?.today ?? 0, 
              total: stats?.revenue?.today ?? 0 
            },
            { 
              label: 'This Week', 
              momo: stats?.revenue?.momo?.this_week ?? 0, 
              agent: stats?.revenue?.agent?.this_week ?? 0, 
              total: stats?.revenue?.this_week ?? 0 
            },
            { 
              label: 'This Month', 
              momo: stats?.revenue?.momo?.this_month ?? 0, 
              agent: stats?.revenue?.agent?.this_month ?? 0, 
              total: stats?.revenue?.this_month ?? 0 
            },
            { 
              label: 'This Year', 
              momo: stats?.revenue?.momo?.this_year ?? 0, 
              agent: stats?.revenue?.agent?.this_year ?? 0, 
              total: stats?.revenue?.this_year ?? 0 
            },
          ].map(({ label, momo, agent, total }) => (
            <div key={label} className="card p-4 flex flex-col justify-between space-y-3 border border-gray-100 shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{fmt(total)}</p>
              </div>
              <div className="space-y-1.5 pt-2.5 border-t border-gray-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    MoMo Collected
                  </span>
                  <span className="font-semibold text-emerald-700">{fmt(momo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-purple-700 font-medium">
                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                    Agent Cash
                  </span>
                  <span className="font-semibold text-purple-700">{fmt(agent)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Initiate Withdrawal Modal */}
      <WithdrawalModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        maxBalance={stats?.finance?.withdrawable_balance}
        onSuccess={load}
      />
    </div>
  )
}
