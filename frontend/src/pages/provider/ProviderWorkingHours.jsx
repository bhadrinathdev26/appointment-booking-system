import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { Clock, Plus, Trash2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';

const WEEKDAYS = [
  { day: 0, label: 'Monday' },
  { day: 1, label: 'Tuesday' },
  { day: 2, label: 'Wednesday' },
  { day: 3, label: 'Thursday' },
  { day: 4, label: 'Friday' },
  { day: 5, label: 'Saturday' },
  { day: 6, label: 'Sunday' },
];

export default function ProviderWorkingHours() {
  const [workingHours, setWorkingHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingDay, setSavingDay] = useState(null);

  useEffect(() => {
    fetchWorkingHours();
  }, []);

  const fetchWorkingHours = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/provider/working-hours/');
      setWorkingHours(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch working hours.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddInterval = async (weekday) => {
    setError(null);
    setSuccess(null);
    try {
      await api.post('/provider/working-hours/', {
        weekday,
        start_time: '09:00',
        end_time: '17:00',
      });
      fetchWorkingHours();
    } catch (err) {
      const msg = err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to add interval.';
      setError(msg);
    }
  };

  const handleDeleteInterval = async (intervalId) => {
    try {
      await api.delete(`/provider/working-hours/${intervalId}/`);
      fetchWorkingHours();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete interval.');
    }
  };

  const handleUpdateTime = async (intervalId, newStartTime, newEndTime) => {
    if (newStartTime >= newEndTime) {
      setError('End time must be later than start time.');
      return;
    }
    setError(null);
    try {
      await api.patch(`/provider/working-hours/${intervalId}/`, {
        start_time: newStartTime,
        end_time: newEndTime,
      });
      setSuccess('Working hours updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
      fetchWorkingHours();
    } catch (err) {
      const msg = err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to update working hours.';
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Weekly Working Hours & Breaks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure your regular weekly schedule. Gaps between intervals automatically form unbookable breaks (e.g. lunch).
          </p>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
        {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-6">
            {WEEKDAYS.map(({ day, label }) => {
              const dayIntervals = workingHours
                .filter((wh) => wh.weekday === day)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              const isClosed = dayIntervals.length === 0;

              return (
                <div
                  key={day}
                  className="pb-6 border-b border-slate-100 last:border-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="sm:w-36 flex-shrink-0">
                    <span className="font-bold text-slate-900 text-sm block">{label}</span>
                    <span className={`text-[11px] font-semibold ${isClosed ? 'text-slate-400' : 'text-emerald-600'}`}>
                      {isClosed ? 'Closed' : `${dayIntervals.length} interval(s)`}
                    </span>
                  </div>

                  {/* Intervals list */}
                  <div className="flex-1 space-y-3">
                    {dayIntervals.map((interval) => (
                      <div
                        key={interval.id}
                        className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 max-w-sm"
                      >
                        <input
                          type="time"
                          defaultValue={interval.start_time.slice(0, 5)}
                          onBlur={(e) =>
                            handleUpdateTime(interval.id, e.target.value, interval.end_time.slice(0, 5))
                          }
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none"
                        />
                        <span className="text-xs text-slate-400">to</span>
                        <input
                          type="time"
                          defaultValue={interval.end_time.slice(0, 5)}
                          onBlur={(e) =>
                            handleUpdateTime(interval.id, interval.start_time.slice(0, 5), e.target.value)
                          }
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none"
                        />

                        <button
                          onClick={() => handleDeleteInterval(interval.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition ml-auto"
                          title="Remove interval"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => handleAddInterval(day)}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isClosed ? 'Open on this day' : 'Add split interval / break'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
