import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { Calendar, Clock, Plus, Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Modal from '../../components/common/Modal';
import { formatDateTimeIST } from '../../utils/date';

export default function ProviderTimeOff() {
  const [timeOffs, setTimeOffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTimeOffs();
  }, []);

  const fetchTimeOffs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/provider/time-off/');
      setTimeOffs(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch scheduled time off.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    setStartDate(dateStr);
    setEndDate(dateStr);
    setStartTime('09:00');
    setEndTime('18:00');
    setReason('');
    setConflicts([]);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConflicts([]);
    setError(null);

    const startAtIso = `${startDate}T${startTime}:00+05:30`;
    const endAtIso = `${endDate}T${endTime}:00+05:30`;

    if (new Date(startAtIso) >= new Date(endAtIso)) {
      alert('End time must be after start time.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/provider/time-off/', {
        start_at: startAtIso,
        end_at: endAtIso,
        reason,
      });
      setIsModalOpen(false);
      fetchTimeOffs();
    } catch (err) {
      if (err.response?.status === 400 && err.response?.data?.conflicts) {
        setConflicts(err.response.data.conflicts);
      } else {
        const msg = err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to schedule time off.';
        alert(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Cancel this scheduled leave?')) return;
    try {
      await api.delete(`/provider/time-off/${id}/`);
      fetchTimeOffs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel time off.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Scheduled Time Off & Holidays
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Block out personal leave, holidays, or emergency closures. Slots during leaves are automatically hidden from clients.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule Time Off</span>
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : timeOffs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Scheduled Leaves</h3>
            <p className="text-xs text-slate-500 mt-1">
              You are currently available according to your regular weekly working hours.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {timeOffs.map((to) => (
              <div
                key={to.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <h3 className="font-bold text-slate-900 text-sm">
                      {formatDateTimeIST(to.start_at)} &rarr; {formatDateTimeIST(to.end_at)}
                    </h3>
                  </div>
                  {to.reason && (
                    <p className="text-xs text-slate-500 mt-1 pl-4.5">
                      Reason: <span className="font-medium text-slate-700">{to.reason}</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(to.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                  title="Delete scheduled leave"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Time Off Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Schedule Time Off / Leave"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {conflicts.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>Conflicting Appointments Found ({conflicts.length}):</span>
              </div>
              <p>You cannot schedule time off over existing confirmed bookings. Please reschedule or cancel them first:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    #{c.id}: {c.service_name} at {formatDateTimeIST(c.start_at)} ({c.customer_name})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason (Optional)</label>
            <textarea
              rows="2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Annual leave, clinic renovation, conference..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50"
            >
              {saving ? <Spinner size="sm" /> : 'Save Time Off'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
