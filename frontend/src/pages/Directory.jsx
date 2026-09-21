import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import {
  Search,
  MapPin,
  Phone,
  ArrowRight,
  Clock,
  Sparkles,
  Stethoscope,
  Scissors,
  GraduationCap,
  Dumbbell,
  Briefcase,
  Store,
} from 'lucide-react';
import Spinner from '../components/common/Spinner';
import Alert from '../components/common/Alert';
import { formatCurrency, formatDuration } from '../utils/date';

const CATEGORIES = [
  { key: 'all', label: 'All Services', icon: Store },
  { key: 'clinic', label: 'Clinics & Doctors', icon: Stethoscope },
  { key: 'salon', label: 'Salons & Spas', icon: Scissors },
  { key: 'tutor', label: 'Tutors & Music', icon: GraduationCap },
  { key: 'fitness', label: 'Fitness & Gym', icon: Dumbbell },
  { key: 'consulting', label: 'Consultants', icon: Briefcase },
];

export default function Directory() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProviders();
  }, [selectedCategory]);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      const { data } = await api.get('/providers/', { params });
      // API returns paginated results or array
      setProviders(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Unable to load directory providers. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProviders = providers.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesName = p.business_name?.toLowerCase().includes(q);
    const matchesDesc = p.description?.toLowerCase().includes(q);
    const matchesService = p.services?.some((s) => s.name?.toLowerCase().includes(q));
    return matchesName || matchesDesc || matchesService;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Header */}
      <div className="bg-gradient-to-b from-blue-900 via-indigo-900 to-slate-900 text-white py-16 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-400/20 px-3 py-1 rounded-full text-xs font-semibold text-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Instant Conflict-Free Booking</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Discover & Book Top Local Specialists
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto">
            Real-time dynamic slot availability for healthcare clinics, styling salons, music tutors, and consultants.
          </p>

          {/* Search bar */}
          <div className="pt-4 max-w-xl mx-auto">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by clinic name, doctor, salon, haircut, or service..."
                className="w-full pl-12 pr-4 py-3.5 bg-white text-slate-900 rounded-2xl shadow-lg border-0 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        {/* Category Pills */}
        <div className="bg-white p-2 rounded-2xl shadow-md border border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar mb-8">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {error && <Alert type="error" message={error} className="mb-6" />}

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <Spinner size="lg" />
            <p className="text-sm text-slate-500">Checking verified provider availability...</p>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
            <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No Providers Found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              We couldn't find any active businesses matching your search or category filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition-all flex flex-col overflow-hidden group"
              >
                <div className="p-6 flex-1 flex flex-col">
                  {/* Category Pill */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                      {provider.category}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {provider.slot_interval_minutes}m slots
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {provider.business_name}
                  </h3>

                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed flex-1">
                    {provider.description || 'Verified local service specialist offering flexible appointment scheduling.'}
                  </p>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    {provider.address && (
                      <div className="flex items-start space-x-2">
                        <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="truncate">{provider.address}</span>
                      </div>
                    )}
                    {provider.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span>{provider.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Sample Services Preview */}
                  {provider.services && provider.services.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Services Offered:
                      </div>
                      <div className="space-y-1.5">
                        {provider.services.slice(0, 2).map((srv) => (
                          <div
                            key={srv.id}
                            className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded-lg"
                          >
                            <span className="font-medium text-slate-700 truncate pr-2">{srv.name}</span>
                            <span className="font-semibold text-slate-900 flex-shrink-0">
                              {formatCurrency(srv.price)}
                            </span>
                          </div>
                        ))}
                        {provider.services.length > 2 && (
                          <p className="text-[11px] text-blue-600 font-medium text-right pt-0.5">
                            +{provider.services.length - 2} more services
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                  <Link
                    to={`/providers/${provider.id}`}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition"
                  >
                    <span>View Schedule & Book</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
