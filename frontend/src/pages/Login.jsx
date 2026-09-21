import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Calendar, Mail, Lock, ArrowRight, Shield, User, Sparkles } from 'lucide-react';
import Alert from '../components/common/Alert';
import Spinner from '../components/common/Spinner';

export default function Login() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from?.pathname || null;

  const redirectAfterLogin = (userRole) => {
    if (from) {
      navigate(from, { replace: true });
    } else if (userRole === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    } else if (userRole === 'provider') {
      navigate('/provider/dashboard', { replace: true });
    } else {
      navigate('/bookings', { replace: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const loggedInUser = await login(email, password);
      redirectAfterLogin(loggedInUser.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoClick = async (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setLoading(true);
    try {
      const loggedInUser = await demoLogin(demoEmail, demoPass);
      redirectAfterLogin(loggedInUser.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white mx-auto shadow-md shadow-blue-500/30">
            <Calendar className="w-6 h-6" />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900 tracking-tight">
            Sign in to Slot<span className="text-blue-600">Sync</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Access your appointments, schedules, and management tools
          </p>
        </div>

        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition disabled:opacity-50"
          >
            {loading ? <Spinner size="sm" /> : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </form>

        {/* 1-Click Demo Logins */}
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Instant Demo Logins:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDemoClick('rahul.verma@example.com', 'DemoPass123!')}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 border border-slate-200 rounded-xl transition text-left"
            >
              <span className="block font-semibold text-emerald-600">Customer</span>
              <span className="text-[11px] text-slate-400">Rahul Verma</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoClick('aisha.sharma@slotsync.local', 'DemoPass123!')}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 border border-slate-200 rounded-xl transition text-left"
            >
              <span className="block font-semibold text-blue-600">Clinic Provider</span>
              <span className="text-[11px] text-slate-400">Dr. Aisha</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoClick('marcus.vance@slotsync.local', 'DemoPass123!')}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800 border border-slate-200 rounded-xl transition text-left"
            >
              <span className="block font-semibold text-amber-600">Salon Provider</span>
              <span className="text-[11px] text-slate-400">Marcus Vance</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoClick('admin@slotsync.local', 'AdminPass123!')}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-800 border border-slate-200 rounded-xl transition text-left"
            >
              <span className="block font-semibold text-purple-600">Administrator</span>
              <span className="text-[11px] text-slate-400">Admin User</span>
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
