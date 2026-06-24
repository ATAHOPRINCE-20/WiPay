import { useEffect, useState, useCallback } from 'react'
import api from '../services/api'
import MetricCard from '../components/MetricCard'
import {
  DollarSign, MessageSquare, Users, Wifi,
  TrendingUp, ChevronDown, Loader2
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'

const PERIODS = ['This year', 'Last year']
const USER_PERIODS = ['This week', 'Last week']

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [chart, setChart]   = useState([])
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]     = useState('This year')
  const [userPeriod, setUserPeriod] = useState('This week')

  const load = useCallback(async () => {
    setLoading(true)
    const year = period === 'Last year' ? new Date().getFullYear() - 1 : new Date().getFullYear()
    const days = userPeriod === 'Last week' ? 14 : 7
    try {
      const [s, c, u] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/payments-chart', { params: { year } }),
        api.get('/admin/active-users-chart', { params: { days } }),
      ])
      setStats(s.data)
      setChart(Array.isArray(c.data) ? c.data : [])
      setUsers(Array.isArray(u.data) ? u.data : [])
    } catch (_) {}
    setLoading(false)
  }, [period, userPeriod])

  useEffect(() => { load() }, [load])

  const fmt = (n) => `UGX ${Number(n || 0).toLocaleString()}`

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={DollarSign}
          label="Amount this month"
          value={fmt(stats?.revenue?.this_month)}
          sub="Total earned this month"
          green
        />
        <MetricCard
          icon={MessageSquare}
          label="SMS balance"
          value={fmt(stats?.sms_balance)}
          sub="Your SMS balance"
          green
        />
        <MetricCard
          icon={Users}
          label="Total clients"
          value={String(stats?.counts?.clients ?? stats?.vouchers?.used ?? 0)}
          sub="Number of clients"
          green
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.isArray(chart) && chart.length > 0 ? (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Payments</h3>
              <p className="text-xs text-gray-400 mt-0.5">Payments and expenses trend.</p>
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
              <Bar dataKey="total" name="Revenue" fill="#16b97a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        ) : (
          <div className="card p-5"><p className="text-sm text-gray-400">No payment data available.</p></div>
        )}

        {Array.isArray(users) && users.length > 0 ? (
        <div className="card p-5">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="font-semibold text-gray-900">Active Users</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Active now: {stats?.active_sessions ?? 0} users |&nbsp;
                Average: 0 | Peak: 0
              </p>
              <p className="text-xs text-gray-400">this week</p>
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
            <LineChart data={users} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
              Hotspot Users (Active: {stats?.active_sessions ?? 0})
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-300 inline-block" />
              PPPoE Users (Active: 0)
            </span>
          </div>
        </div>
        ) : (
          <div className="card p-5"><p className="text-sm text-gray-400">No user data available.</p></div>
        )}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Today',     value: fmt(stats?.revenue?.today)      },
          { label: 'This Week', value: fmt(stats?.revenue?.this_week)  },
          { label: 'This Month',value: fmt(stats?.revenue?.this_month) },
          { label: 'This Year', value: fmt(stats?.revenue?.this_year)  },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
