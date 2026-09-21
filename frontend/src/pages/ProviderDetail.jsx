import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { format, parseISO, isBefore, startOfToday, addDays } from 'date-fns';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Check,
  ChevronRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import Spinner from '../components/common/Spinner';
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import {
  formatDateTimeIST,
  formatTimeIST,
  formatCurrency,
  formatDuration,
  formatDateParam,
} from '../utils/date';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function ProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, role } = useAuth();

  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Booking Flow State
  const [selectedService, setSelectedService] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [availableDays, setAvailableDays] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customerNotes, setCustomerNotes] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  useEffect(() => {
    fetchProvider();
  }, [id]);

  const fetchProvider = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/providers/${id}/`);
      setProvider(data);
    } catch (err) {
      setError('Unable to find provider details. The provider may be inactive or does not exist.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch available days whenever selectedService or calendarMonth changes
  useEffect(() => {
    if (!selectedService || !provider) return;

    const fetchDays = async () => {
      setLoadingDays(true);
      try {
        const monthStr = format(calendarMonth, 'yyyy-MM');
        const { data } = await api.get(`/providers/${provider.id}/availability/days/`, {
          params: {
            service: selectedService.id,
            month: monthStr,
          },
        });
        setAvailableDays(data.available_days || []);
      } catch (err) {
        console.error('Failed to load available days', err);
      } finally {
        setLoadingDays(false);
      }
    };

    fetchDays();
  }, [selectedService, calendarMonth, provider]);

  // Fetch available slots when selectedDate changes
  useEffect(() => {
    if (!selectedDate || !selectedService || !provider) return;

    fetchSlots();
  }, [selectedDate, selectedService, provider]);

  const fetchSlots = async () => {
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const dateStr = formatDateParam(selectedDate);
      const { data } = await api.get(`/providers/${provider.id}/availability/`, {
        params: {
          service: selectedService.id,
          date: dateStr,
        },
      });
      setSlots(data.slots || []);
    } catch (err) {
      console.error('Failed to load slots', err);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSelectService = (srv) => {
    setSelectedService(srv);
    setSelectedDate(null);
    setSlots([]);
    setSelectedSlot(null);
    setBookingError(null);
    setBookingSuccess(null);

    // Scroll to booking section smoothly
    setTimeout(() => {
      const el = document.getElementById('booking-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedSlot(null);
    setBookingError(null);
  };

  const isDayDisabled = (date) => {
    // Disable past dates
    if (isBefore(date, startOfToday())) return true;
    const dateStr = formatDateParam(date);
    return !availableDays.includes(dateStr);
  };

  const handleOpenConfirm = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/providers/${id}` } } });
      return;
    }
    if (role !== 'customer') {
      setBookingError('Only customer accounts can book appointments. Please switch to a customer account.');
      return;
    }
    setBookingError(null);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmBooking = async () => {
    setBookingLoading(true);
    setBookingError(null);

    try {
      const payload = {
        service_id: selectedService.id,
        start_at: selectedSlot.start_at,
        notes: customerNotes,
      };

      const { data } = await api.post('/bookings/', payload);
      setBookingSuccess(data);
      setIsConfirmModalOpen(false);
    } catch (err) {
      if (err.response?.status === 409) {
        // Race condition / slot conflict handled gracefully (Rule & prompt)
        const msg = err.response?.data?.detail || 'This time slot was just booked by another client. Please select another slot.';
        setBookingError(msg);
        setIsConfirmModalOpen(false);
        // Refresh slots immediately to update view
        fetchSlots();
      } else {
        const msg = err.response?.data?.detail || 'Failed to book appointment. Please try again.';
        setBookingError(msg);
      }
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500">Loading provider profile...</p>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <Alert type="error" message={error || 'Provider not found.'} />
        <div className="mt-6 text-center">
          <Link
            to="/providers"
            className="inline-flex items-center space-x-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to directory</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header Breadcrumb & Back */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            to="/providers"
            className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Providers</span>
          </Link>
        </div>
      </div>

      {/* Provider Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 bg-blue-500/20 border border-blue-400/30 px-3 py-1 rounded-full text-xs font-bold text-blue-300 uppercase tracking-wider mb-3">
              <span>{provider.category}</span>
              <span>&bull;</span>
              <span>{provider.slot_interval_minutes}m slot step</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {provider.business_name}
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl mt-2 leading-relaxed">
              {provider.description || 'Verified specialist providing professional online and in-person appointments.'}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-4">
              {provider.address && (
                <div className="flex items-center space-x-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{provider.address}</span>
                </div>
              )}
              {provider.phone && (
                <div className="flex items-center space-x-1.5">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{provider.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 text-center min-w-[200px]">
            <span className="text-xs text-indigo-200 block font-medium">Services Available</span>
            <span className="text-3xl font-extrabold text-white mt-1 block">
              {provider.services ? provider.services.length : 0}
            </span>
            <span className="text-[11px] text-emerald-400 font-medium mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Live Booking Enabled
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Success Modal / Banner */}
        {bookingSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-sm animate-in fade-in">
            <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Appointment Confirmed!</h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your appointment for <strong>{bookingSuccess.service_name}</strong> with{' '}
              <strong>{provider.business_name}</strong> is scheduled for:
            </p>
            <div className="bg-white border border-emerald-100 rounded-2xl py-3 px-6 max-w-sm mx-auto shadow-sm">
              <span className="text-base font-bold text-emerald-700 block">
                {formatDateTimeIST(bookingSuccess.start_at)}
              </span>
              <span className="text-xs text-slate-500">
                Duration: {bookingSuccess.service_duration} minutes | Total: {formatCurrency(bookingSuccess.service_price)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to="/bookings"
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
              >
                View in My Appointments
              </Link>
              <button
                onClick={() => {
                  setBookingSuccess(null);
                  setSelectedSlot(null);
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition"
              >
                Book Another Service
              </button>
            </div>
          </div>
        )}

        {/* Global Conflict / Error Alert */}
        {bookingError && (
          <Alert
            type="error"
            title="Booking Notice"
            message={bookingError}
            onClose={() => setBookingError(null)}
          />
        )}

        {/* Step 1: Select a Service */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                  1
                </span>
                Choose a Service
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select the service you wish to book to check live provider calendar availability.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {provider.services && provider.services.length > 0 ? (
              provider.services.map((srv) => {
                const isSelected = selectedService?.id === srv.id;
                return (
                  <div
                    key={srv.id}
                    onClick={() => handleSelectService(srv)}
                    className={`cursor-pointer rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-500 shadow-md shadow-blue-500/10 ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-900 text-base">{srv.name}</h3>
                        <span className="text-base font-extrabold text-slate-900">
                          {formatCurrency(srv.price)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center space-x-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatDuration(srv.duration_minutes)}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                        {isSelected ? 'Selected' : 'Click to select'}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${
                          isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-400'
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500 col-span-3">No active services offered at this time.</p>
            )}
          </div>
        </section>

        {/* Step 2 & 3: Calendar & Slot Grid (Appears after service selected) */}
        {selectedService && (
          <section id="booking-section" className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="mb-6 pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                    2
                  </span>
                  Select Date & Time Slot
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selected service: <strong className="text-slate-800">{selectedService.name}</strong> ({formatDuration(selectedService.duration_minutes)})
                </p>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                <span>Notice: Min 2 hours advance booking. Free cancel up to 4 hours before.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Calendar Column */}
              <div className="lg:col-span-5 flex flex-col items-center p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between w-full mb-3 px-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Available Days
                  </span>
                  {loadingDays && <Spinner size="sm" />}
                </div>

                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={isDayDisabled}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
                />

                <div className="mt-4 text-[11px] text-slate-500 flex items-center space-x-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Available
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" /> Unavailable / Closed
                  </span>
                </div>
              </div>

              {/* Slot Grid Column */}
              <div className="lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>
                        {selectedDate
                          ? `Available Slots for ${format(selectedDate, 'EEEE, MMM d, yyyy')}`
                          : 'Select a highlighted date to see available slots'}
                      </span>
                    </h3>

                    {selectedDate && (
                      <button
                        onClick={fetchSlots}
                        className="p-1 text-slate-400 hover:text-blue-600 transition"
                        title="Refresh slots"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {loadingSlots ? (
                    <div className="py-16 flex flex-col items-center justify-center space-y-2">
                      <Spinner size="md" />
                      <span className="text-xs text-slate-500">Checking real-time slot conflicts...</span>
                    </div>
                  ) : !selectedDate ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6">
                      <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Pick any active date on the calendar.</p>
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="py-16 text-center bg-slate-50 rounded-2xl p-6">
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-slate-800">No Open Slots</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                        All slots on this date are fully booked or fall outside the 2-hour minimum notice window.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                      {slots.map((slot, index) => {
                        const isSelected = selectedSlot?.start_at === slot.start_at;
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all text-center flex flex-col items-center ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
                            }`}
                          >
                            <span>{formatTimeIST(slot.start_at)}</span>
                            <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                              to {formatTimeIST(slot.end_at)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom Booking Trigger */}
                {selectedSlot && (
                  <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
                    <div>
                      <span className="text-xs text-blue-900 font-semibold block">
                        Selected: {formatTimeIST(selectedSlot.start_at)} on {format(selectedDate, 'MMM d')}
                      </span>
                      <span className="text-xs text-slate-500">
                        {selectedService.name} &bull; {formatCurrency(selectedService.price)}
                      </span>
                    </div>

                    <button
                      onClick={handleOpenConfirm}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition flex items-center space-x-1.5"
                    >
                      <span>Continue to Book</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Provider Weekly Schedule Overview */}
        <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            Standard Business Working Hours
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {WEEKDAYS.map((dayName, idx) => {
              const dayHours = provider.working_hours
                ? provider.working_hours.filter((wh) => wh.weekday === idx)
                : [];
              const isOpen = dayHours.length > 0;

              return (
                <div
                  key={dayName}
                  className={`p-3.5 rounded-2xl border text-xs ${
                    isOpen ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-100/50 border-slate-200/40 opacity-60'
                  }`}
                >
                  <span className="font-bold text-slate-800 block mb-1">{dayName}</span>
                  {isOpen ? (
                    <div className="space-y-0.5 text-slate-600 font-medium">
                      {dayHours.map((h, i) => (
                        <div key={i}>
                          {h.start_time.slice(0, 5)} – {h.end_time.slice(0, 5)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Step 3: Booking Confirmation Modal */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirm Your Appointment"
      >
        {selectedService && selectedSlot && (
          <div className="space-y-5 text-sm">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-900">{selectedService.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Provider:</span>
                <span className="font-semibold text-slate-900">{provider.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Time:</span>
                <span className="font-bold text-blue-600">
                  {formatDateTimeIST(selectedSlot.start_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <span className="font-semibold text-slate-900">
                  {selectedService.duration_minutes} minutes
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                <span className="font-bold text-slate-900">Total Price:</span>
                <span className="font-extrabold text-slate-900">
                  {formatCurrency(selectedService.price)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
                Notes for the Provider (Optional)
              </label>
              <textarea
                rows="2"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Any special requests or symptoms..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              <strong>Cancellation Policy:</strong> You can reschedule or cancel this appointment free of charge up to 4 hours before the scheduled start time.
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bookingLoading}
                onClick={handleConfirmBooking}
                className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 rounded-xl transition disabled:opacity-50 flex items-center space-x-1.5"
              >
                {bookingLoading ? <Spinner size="sm" /> : <span>Confirm Booking</span>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
