import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import {
  Calendar,
  Clock,
  Download,
  Filter,
  Search,
  RefreshCw,
  User,
  Building2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import {
  formatDateTimeIST,
  formatCurrency,
  formatDuration,
} from '../../utils/date';

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchBookings();
  }, [statusFilter]);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ordering: '-start_at' };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const { data } = await api.get('/bookings/', { params });
      setBookings(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch platform bookings.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAction = async (bookingId, action) => {
    if (!window.confirm(`Perform admin override "${action}" on booking #${bookingId}?`)) return;
    try {
      await api.post(`/bookings/${bookingId}/${action}/`, {
        reason: 'Admin administrative override',
      });
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to perform ${action}.`);
    }
  };

  const handleDownloadICS = async (booking) => {
    try {
      const response = await api.get(`/bookings/${booking.id}/ics/`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `appointment-${booking.id}.ics`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download calendar invite.');
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const cust = `${b.customer.first_name || ''} ${b.customer.last_name || ''} ${b.customer.email}`.toLowerCase();
    const prov = `${b.provider.business_name || ''}`.toLowerCase();
    const srv = b.service_name.toLowerCase();
    return cust.includes(q) || prov.includes(q) || srv.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              All Platform Bookings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Master cross-provider appointment logs with administrative lifecycle controls
            </p>
          </div>

          <button
            onClick={fetchBookings}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        {/* Filter and Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, provider, or service..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 text-xs text-slate-400">
            No booking records match query.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <Badge status={b.status} size="xs" />
                    <span className="text-xs font-semibold text-slate-400">#{b.id}</span>
                    <span className="text-xs font-bold text-purple-700">
                      {formatDateTimeIST(b.start_at)}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {b.service_name} &bull;{' '}
                    <span className="text-blue-600">{b.provider.business_name}</span>
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>
                      Customer: <strong>{b.customer.first_name ? `${b.customer.first_name} ${b.customer.last_name || ''}` : b.customer.username}</strong> ({b.customer.email})
                    </span>
                    <span>&bull;</span>
                    <span>{formatDuration(b.service_duration)}</span>
                    <span>&bull;</span>
                    <span className="font-bold text-slate-900">{formatCurrency(b.service_price)}</span>
                  </div>

                  {b.status === 'cancelled' && (
                    <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100 mt-1">
                      Cancelled by {b.cancelled_by}: {b.cancel_reason || 'No reason provided.'}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownloadICS(b)}
                    className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                    title="Download .ics"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {b.status === 'confirmed' && (
                    <>
                      <button
                        onClick={() => handleAdminAction(b.id, 'complete')}
                        className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleAdminAction(b.id, 'no-show')}
                        className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition"
                      >
                        No Show
                      </button>
                      <button
                        onClick={() => handleAdminAction(b.id, 'cancel')}
                        className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
