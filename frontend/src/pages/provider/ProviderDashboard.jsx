import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import {
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Users,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import {
  formatDateTimeIST,
  formatTimeIST,
  formatCurrency,
  formatDuration,
} from '../../utils/date';

export default function ProviderDashboard() {
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
      setError('Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = async (bookingId, action) => {
    try {
      await api.post(`/bookings/${bookingId}/${action}/`);
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to perform ${action}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-3">
        <Spinner size="lg" />
        <span className="text-xs text-slate-500">Loading provider metrics...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <Alert type="error" message={error || 'Failed to load stats.'} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {stats.business_name}
              </h1>
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                Provider Hub
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Live operational metrics, today's client schedule, and appointment volume
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/provider/bookings"
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition"
            >
              Full Schedule
            </Link>
            <Link
              to="/provider/time-off"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition"
            >
              Schedule Leave
            </Link>
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Today's count */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Today's Bookings
              </span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.today_appointments ? stats.today_appointments.length : 0}
              </span>
            </div>
          </div>

          {/* Next 7 Days */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Next 7 Days
              </span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.upcoming_7_days_count || 0}
              </span>
            </div>
          </div>

          {/* Completed Volume */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Completed Total
              </span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {stats.completed_count || 0}
              </span>
            </div>
          </div>

          {/* Revenue */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Total Revenue
              </span>
              <span className="text-2xl font-black text-slate-900 block mt-0.5">
                {formatCurrency(stats.total_revenue || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Today's Schedule & Weekday Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Today's Schedule List */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Today's Schedule</h2>
              </div>
              <Link
                to="/provider/bookings"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {(!stats.today_appointments || stats.today_appointments.length === 0) ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No appointments scheduled for today.
              </div>
            ) : (
              <div className="space-y-3">
                {stats.today_appointments.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-blue-700">
                          {formatTimeIST(booking.start_at)} – {formatTimeIST(booking.end_at)}
                        </span>
                        <Badge status={booking.status} size="xs" />
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-1">
                        {booking.service_name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Client: {booking.customer.first_name ? `${booking.customer.first_name} ${booking.customer.last_name || ''}` : booking.customer.username} ({booking.customer.phone || booking.customer.email})
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleQuickAction(booking.id, 'complete')}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleQuickAction(booking.id, 'no-show')}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition"
                      >
                        No Show
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekday Distribution Chart */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3 mb-4">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Weekly Appointment Distribution</h2>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Historical booking density by weekday (Mon to Sun).
              </p>

              <div className="h-64 w-full">
                {stats.weekday_distribution ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.weekday_distribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                        formatter={(val) => [`${val} bookings`, 'Volume']}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No distribution data yet.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
              Calculated dynamically in Asia/Kolkata (IST)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
