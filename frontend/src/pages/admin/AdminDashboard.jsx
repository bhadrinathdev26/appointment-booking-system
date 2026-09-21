import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import {
  Shield,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import { formatCurrency } from '../../utils/date';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/dashboard/stats/');
      setStats(data);
    } catch (err) {
      setError('Unable to load platform admin stats.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-3">
        <Spinner size="lg" />
        <span className="text-xs text-slate-500">Loading platform metrics...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <Alert type="error" message={error || 'Failed to load platform stats.'} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Platform Administration
            </h1>
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
              Root Overview
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Global metrics across users, providers, platform revenue, and 14-day booking volume
          </p>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total Users</span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.total_users?.total || 0}
              </span>
              <span className="text-[11px] text-slate-400">
                {stats.total_users?.customers || 0} cust &bull; {stats.total_users?.providers || 0} prov
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">All Bookings</span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.total_bookings || 0}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium">
                {stats.confirmed_count || 0} active confirmed
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Completed</span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.completed_count || 0}
              </span>
              <span className="text-[11px] text-rose-500 font-medium">
                {stats.cancelled_count || 0} cancelled
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Gross Revenue</span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {formatCurrency(stats.total_revenue || 0)}
              </span>
              <span className="text-[11px] text-slate-400">Completed appointments</span>
            </div>
          </div>
        </div>

        {/* 14-Day Booking Volume Chart */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <h2 className="text-base font-bold text-slate-900">Platform 14-Day Booking Volume</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Daily appointment registrations
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            {stats.last_14_days_volume ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.last_14_days_volume}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#9333ea" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#9333ea" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    formatter={(val) => [`${val} bookings created`, 'Count']}
                  />
                  <Area type="monotone" dataKey="count" stroke="#9333ea" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No volume data available.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
