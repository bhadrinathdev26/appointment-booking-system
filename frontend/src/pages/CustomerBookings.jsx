import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, isBefore, startOfToday, differenceInHours, parseISO } from 'date-fns';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  Download,
  XCircle,
  CalendarDays,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import Spinner from '../components/common/Spinner';
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import {
  formatDateTimeIST,
  formatTimeIST,
  formatDateIST,
  formatCurrency,
  formatDuration,
  formatDateParam,
} from '../utils/date';

export default function CustomerBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' or 'past'
  const [statusFilter, setStatusFilter] = useState('all');

  // Cancel Modal State
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Reschedule Modal State
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleLoadingSlots, setRescheduleLoadingSlots] = useState(false);
  const [selectedNewSlot, setSelectedNewSlot] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/bookings/', {
        params: { ordering: '-start_at' },
      });
      setBookings(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch your appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Check if booking is within 4-hour cutoff
  const isWithinCutoff = (startAtStr) => {
    try {
      const now = new Date();
      const startAt = parseISO(startAtStr);
      const hoursRemaining = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursRemaining <= 4;
    } catch {
      return true;
    }
  };

  // Download .ics via Axios blob (prompt & test requirements)
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
    } catch (err) {
      alert('Unable to download calendar file.');
    }
  };

  // Cancel action
  const handleOpenCancel = (booking) => {
    setCancelModalBooking(booking);
    setCancelReason('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalBooking) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      await api.post(`/bookings/${cancelModalBooking.id}/cancel/`, {
        reason: cancelReason,
      });
      setCancelModalBooking(null);
      fetchBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to cancel appointment.';
      setCancelError(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  // Reschedule actions
  const handleOpenReschedule = (booking) => {
    setRescheduleBooking(booking);
    setRescheduleDate(null);
    setRescheduleSlots([]);
    setSelectedNewSlot(null);
    setRescheduleError(null);
  };

  useEffect(() => {
    if (!rescheduleBooking || !rescheduleDate) return;

    const fetchRescheduleSlots = async () => {
      setRescheduleLoadingSlots(true);
      setSelectedNewSlot(null);
      try {
        const dateStr = formatDateParam(rescheduleDate);
        const { data } = await api.get(`/providers/${rescheduleBooking.provider.id}/availability/`, {
          params: {
            service: rescheduleBooking.service.id,
            date: dateStr,
          },
        });
        setRescheduleSlots(data.slots || []);
      } catch (err) {
        console.error('Failed to fetch reschedule slots', err);
        setRescheduleSlots([]);
      } finally {
        setRescheduleLoadingSlots(false);
      }
    };

    fetchRescheduleSlots();
  }, [rescheduleDate, rescheduleBooking]);

  const handleConfirmReschedule = async () => {
    if (!rescheduleBooking || !selectedNewSlot) return;
    setRescheduleLoading(true);
    setRescheduleError(null);
    try {
      await api.post(`/bookings/${rescheduleBooking.id}/reschedule/`, {
        start_at: selectedNewSlot.start_at,
      });
      setRescheduleBooking(null);
      fetchBookings();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to reschedule appointment.';
      setRescheduleError(msg);
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Filter bookings into Upcoming vs Past
  const now = new Date();
  const upcomingBookings = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.start_at) >= now
  );
  const pastBookings = bookings.filter(
    (b) => b.status !== 'confirmed' || new Date(b.start_at) < now
  );

  const displayedBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;
  const filteredList =
    statusFilter === 'all'
      ? displayedBookings
      : displayedBookings.filter((b) => b.status === statusFilter);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              My Appointments
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Manage your confirmed bookings, download calendar invites, and reschedule visits
            </p>
          </div>

          <Link
            to="/providers"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition"
          >
            <CalendarDays className="w-4 h-4" />
            <span>Book New Appointment</span>
          </Link>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

        {/* Tabs and Filter Bar */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'upcoming'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Upcoming ({upcomingBookings.length})
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === 'past'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Past & Cancelled ({pastBookings.length})
            </button>
          </div>

          {activeTab === 'past' && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            </div>
          )}
        </div>

        {/* Bookings List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Spinner size="lg" />
            <span className="text-xs text-slate-500">Loading your appointments...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">
              No {activeTab === 'upcoming' ? 'Upcoming' : 'Past'} Appointments
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'upcoming'
                ? 'You have no confirmed upcoming appointments scheduled right now.'
                : 'No historical or cancelled appointments on record.'}
            </p>
            {activeTab === 'upcoming' && (
              <div className="mt-5">
                <Link
                  to="/providers"
                  className="inline-flex items-center space-x-2 text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  <span>Explore service directory</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredList.map((booking) => {
              const locked = isWithinCutoff(booking.start_at);
              const isConfirmed = booking.status === 'confirmed';

              return (
                <div
                  key={booking.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow"
                >
                  {/* Left: Info */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge status={booking.status} />
                      <span className="text-xs font-semibold text-slate-400">
                        Booking #{booking.id}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">
                      {booking.service_name}
                    </h3>

                    <div className="text-sm font-semibold text-blue-600 flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-blue-500" />
                      <span>{formatDateTimeIST(booking.start_at)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span className="font-semibold text-slate-800">
                        {booking.provider.business_name}
                      </span>
                      <span>&bull;</span>
                      <span>{formatDuration(booking.service_duration)}</span>
                      <span>&bull;</span>
                      <span className="font-bold text-slate-900">
                        {formatCurrency(booking.service_price)}
                      </span>
                      {booking.provider.address && (
                        <>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {booking.provider.address}
                          </span>
                        </>
                      )}
                    </div>

                    {booking.notes && (
                      <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100 max-w-lg mt-2">
                        Notes: {booking.notes}
                      </p>
                    )}

                    {booking.status === 'cancelled' && (
                      <div className="text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-100 max-w-lg">
                        <span className="font-semibold">Cancelled by {booking.cancelled_by}:</span>{' '}
                        {booking.cancel_reason || 'No reason provided.'}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap sm:flex-nowrap md:flex-col items-end gap-2 flex-shrink-0">
                    {/* Add to Calendar Button */}
                    {isConfirmed && (
                      <button
                        onClick={() => handleDownloadICS(booking)}
                        className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center justify-center space-x-1.5"
                        title="Download RFC 5545 .ics calendar invite"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Add to Calendar (.ics)</span>
                      </button>
                    )}

                    {/* Reschedule & Cancel for Confirmed bookings */}
                    {isConfirmed && (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleOpenReschedule(booking)}
                          disabled={locked}
                          className="px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={locked ? 'Rescheduling is locked within 4 hours of the appointment' : 'Pick a new slot'}
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleOpenCancel(booking)}
                          disabled={locked}
                          className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={locked ? 'Cancellations must be made more than 4 hours before the appointment' : 'Cancel booking'}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {isConfirmed && locked && (
                      <span className="text-[10px] text-slate-400 italic">
                        Under 4h cutoff &bull; Changes locked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={!!cancelModalBooking}
        onClose={() => setCancelModalBooking(null)}
        title="Cancel Appointment"
      >
        {cancelModalBooking && (
          <div className="space-y-4 text-sm">
            {cancelError && <Alert type="error" message={cancelError} />}

            <p className="text-slate-600">
              Are you sure you want to cancel your appointment for{' '}
              <strong>{cancelModalBooking.service_name}</strong> on{' '}
              <strong>{formatDateTimeIST(cancelModalBooking.start_at)}</strong>?
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
                Reason for cancellation (optional)
              </label>
              <textarea
                rows="2"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Let the provider know why you need to cancel..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalBooking(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={cancelLoading}
                onClick={handleConfirmCancel}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {cancelLoading ? <Spinner size="sm" /> : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        isOpen={!!rescheduleBooking}
        onClose={() => setRescheduleBooking(null)}
        title="Reschedule Appointment"
        maxWidth="max-w-2xl"
      >
        {rescheduleBooking && (
          <div className="space-y-5 text-sm">
            {rescheduleError && <Alert type="error" message={rescheduleError} />}

            <div className="bg-slate-50 p-3 rounded-xl text-xs border border-slate-100">
              <span className="text-slate-500">Current Slot:</span>{' '}
              <strong className="text-slate-800">
                {formatDateTimeIST(rescheduleBooking.start_at)}
              </strong>{' '}
              ({formatDuration(rescheduleBooking.service_duration)})
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Day Selection */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  1. Pick a new date
                </span>
                <DayPicker
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  disabled={(date) => isBefore(date, startOfToday())}
                  className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm mx-auto"
                />
              </div>

              {/* Slots Selection */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-2">
                  2. Choose available time slot
                </span>
                {rescheduleLoadingSlots ? (
                  <div className="py-12 flex justify-center">
                    <Spinner size="md" />
                  </div>
                ) : !rescheduleDate ? (
                  <div className="py-12 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                    Select a date on the left
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <div className="py-12 text-center text-xs text-amber-600 bg-amber-50 rounded-xl p-4">
                    No available slots on this date.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {rescheduleSlots.map((s, idx) => {
                      const isSel = selectedNewSlot?.start_at === s.start_at;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedNewSlot(s)}
                          className={`py-2 px-2.5 rounded-lg text-xs font-semibold border text-center transition ${
                            isSel
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                          }`}
                        >
                          {formatTimeIST(s.start_at)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRescheduleBooking(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedNewSlot || rescheduleLoading}
                onClick={handleConfirmReschedule}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {rescheduleLoading ? <Spinner size="sm" /> : 'Confirm New Time'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
