import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import {
  Plus,
  Edit2,
  Trash2,
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { formatCurrency, formatDuration } from '../../utils/date';

export default function ProviderServices() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    duration_minutes: 30,
    price: '',
    is_active: true,
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/provider/services/');
      setServices(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch services.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingService(null);
    setFormData({ name: '', duration_minutes: 30, price: '', is_active: true });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (srv) => {
    setEditingService(srv);
    setFormData({
      name: srv.name,
      duration_minutes: srv.duration_minutes,
      price: srv.price,
      is_active: srv.is_active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const dur = parseInt(formData.duration_minutes, 10);
    if (dur % 5 !== 0 || dur < 5 || dur > 480) {
      setFormError('Duration must be a multiple of 5 between 5 and 480 minutes.');
      return;
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) {
      setFormError('Price must be a valid non-negative number.');
      return;
    }

    setSaving(true);
    try {
      if (editingService) {
        await api.patch(`/provider/services/${editingService.id}/`, formData);
      } else {
        await api.post('/provider/services/', formData);
      }
      setIsModalOpen(false);
      fetchServices();
    } catch (err) {
      const msg = err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save service.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (srv) => {
    if (!window.confirm(`Are you sure you want to remove "${srv.name}"? If it has existing bookings, it will be soft-deactivated.`)) {
      return;
    }
    try {
      await api.delete(`/provider/services/${srv.id}/`);
      fetchServices();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete service.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Service Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Define service offerings, appointment durations, and pricing
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Service</span>
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <h3 className="text-base font-bold text-slate-800">No Services Defined</h3>
            <p className="text-xs text-slate-500 mt-1">
              Add your first service to begin accepting client appointments.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((srv) => (
              <div
                key={srv.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{srv.name}</h3>
                    <Badge status={srv.is_active ? 'active' : 'inactive'} size="xs" />
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDuration(srv.duration_minutes)} duration</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold text-slate-900">{formatCurrency(srv.price)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => handleOpenEdit(srv)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(srv)}
                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    title="Delete / Deactivate"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingService ? 'Edit Service' : 'Add New Service'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {formError && <Alert type="error" message={formError} />}

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1">
              Service Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Routine Dental Checkup"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1">
              Duration (Minutes) *
            </label>
            <input
              type="number"
              required
              step="5"
              min="5"
              max="480"
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
            <span className="text-[11px] text-slate-400">Must be a multiple of 5 between 5 and 480.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1">
              Price (₹ INR) *
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="500.00"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-xs font-medium text-slate-700">
              Active for client booking
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
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
              {saving ? <Spinner size="sm" /> : 'Save Service'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
