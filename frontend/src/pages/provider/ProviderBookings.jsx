import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  Search,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import {
  formatDateTimeIST,
  formatTimeIST,
  formatCurrency,
  formatDuration,
} from '../../utils/date';

export default function ProviderBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cancel Modal
  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

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
      setError('Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusTransition = async (bookingId, action) => {
    try {
      await api.post(`/bookings/${bookingId}/${action}/`);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to perform ${action}`);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelBooking) return;
    setCancelLoading(true);
    try {
      await api.post(`/bookings/${cancelBooking.id}/cancel/`, {
        reason: cancelReason,
      });
      setCancelBooking(null);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel appointment.');
    } finally {
      setCancelLoading(false);
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
    const custName = `${b.customer.first_name || ''} ${b.customer.last_name || ''} ${b.customer.username}`.toLowerCase();
    return custName.includes(q) || b.service_name.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Appointment Schedule & Records
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Review upcoming appointments, update attendance status, or cancel bookings
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

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client name or service..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
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

        {/* Bookings Table / Cards */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Appointments Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              No records match your selected status or search filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => {
              const isConfirmed = b.status === 'confirmed';
              const isPast = new Date(b.start_at) < new Date();

              return (
                <div
                  key={b.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <Badge status={b.status} size="xs" />
                      <span className="text-xs font-semibold text-slate-400">#{b.id}</span>
                      <span className="text-xs font-bold text-blue-600">
                        {formatDateTimeIST(b.start_at)}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {b.service_name} &bull;{' '}
                      <span className="text-slate-600 font-normal">
                        {b.customer.first_name ? `${b.customer.first_name} ${b.customer.last_name || ''}` : b.customer.username}
                      </span>
                    </h3>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{formatDuration(b.service_duration)}</span>
                      <span>&bull;</span>
                      <span className="font-bold text-slate-900">{formatCurrency(b.service_price)}</span>
                      <span>&bull;</span>
                      <span>{b.customer.email}</span>
                      {b.customer.phone && (
                        <>
                          <span>&bull;</span>
                          <span>{b.customer.phone}</span>
                        </>
                      )}
                    </div>

                    {b.notes && (
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                        Client Note: {b.notes}
                      </p>
                    )}

                    {b.status === 'cancelled' && (
                      <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100 mt-1">
                        Cancelled by {b.cancelled_by}: {b.cancel_reason || 'No reason provided.'}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadICS(b)}
                      className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                      title="Download .ics Calendar Invite"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {isConfirmed && (
                      <>
                        <button
                          onClick={() => handleStatusTransition(b.id, 'complete')}
                          disabled={!isPast}
                          className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={!isPast ? 'Cannot complete appointment before scheduled start time' : 'Mark Completed'}
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStatusTransition(b.id, 'no-show')}
                          disabled={!isPast}
                          className="px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={!isPast ? 'Cannot mark no-show before scheduled start time' : 'Mark No-show'}
                        >
                          No Show
                        </button>
                        <button
                          onClick={() => {
                            setCancelBooking(b);
                            setCancelReason('');
                          }}
                          className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider Cancel Modal */}
      <Modal
        isOpen={!!cancelBooking}
        onClose={() => setCancelBooking(null)}
        title="Cancel Appointment (Provider)"
      >
        {cancelBooking && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Are you sure you want to cancel the booking for{' '}
              <strong>{cancelBooking.service_name}</strong> with{' '}
              <strong>{cancelBooking.customer.first_name || cancelBooking.customer.username}</strong> on{' '}
              <strong>{formatDateTimeIST(cancelBooking.start_at)}</strong>?
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
                Cancellation Reason
              </label>
              <textarea
                rows="2"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelBooking(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Back
              </button>
              <button
                type="button"
                disabled={cancelLoading}
                onClick={handleConfirmCancel}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition disabled:opacity-50"
              >
                {cancelLoading ? <Spinner size="sm" /> : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
