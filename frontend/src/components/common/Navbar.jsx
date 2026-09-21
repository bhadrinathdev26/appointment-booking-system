import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Clock,
  User,
  LogOut,
  Menu,
  X,
  Compass,
  Briefcase,
  Shield,
  Layers,
} from 'lucide-react';

export default function Navbar() {
  const { user, role, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadge = () => {
    if (role === 'admin') {
      return <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-purple-200">Admin</span>;
    }
    if (role === 'provider') {
      return <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-blue-200">Provider</span>;
    }
    if (role === 'customer') {
      return <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200">Customer</span>;
    }
    return null;
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tight text-slate-900 flex items-center">
                  Slot<span className="text-blue-600">Sync</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider -mt-1">
                  Appointment Platform
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex md:items-center md:space-x-1 ml-8">
              <Link
                to="/providers"
                className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors flex items-center space-x-1.5"
              >
                <Compass className="w-4 h-4 text-slate-400" />
                <span>Browse Directory</span>
              </Link>

              {isAuthenticated && role === 'customer' && (
                <Link
                  to="/bookings"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors flex items-center space-x-1.5"
                >
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>My Appointments</span>
                </Link>
              )}

              {isAuthenticated && role === 'provider' && (
                <>
                  <Link
                    to="/provider/dashboard"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors flex items-center space-x-1.5"
                  >
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span>Provider Dashboard</span>
                  </Link>
                  <Link
                    to="/provider/bookings"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                  >
                    Schedule
                  </Link>
                  <Link
                    to="/provider/services"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                  >
                    Services
                  </Link>
                  <Link
                    to="/provider/hours"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                  >
                    Working Hours
                  </Link>
                  <Link
                    to="/provider/time-off"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                  >
                    Time Off
                  </Link>
                </>
              )}

              {isAuthenticated && role === 'admin' && (
                <>
                  <Link
                    to="/admin/dashboard"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-purple-600 hover:bg-purple-50 transition-colors flex items-center space-x-1.5"
                  >
                    <Shield className="w-4 h-4 text-purple-500" />
                    <span>Admin Dashboard</span>
                  </Link>
                  <Link
                    to="/admin/users"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    Users
                  </Link>
                  <Link
                    to="/admin/providers"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    Providers
                  </Link>
                  <Link
                    to="/admin/bookings"
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    All Bookings
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* User Status / Auth Actions */}
          <div className="hidden md:flex md:items-center md:space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-right">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800">
                      {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
                    </span>
                    <span className="text-[11px] text-slate-400">{user.email}</span>
                  </div>
                  {getRoleBadge()}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-all"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          <Link
            to="/providers"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
          >
            Browse Providers
          </Link>

          {isAuthenticated && role === 'customer' && (
            <Link
              to="/bookings"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
            >
              My Appointments
            </Link>
          )}

          {isAuthenticated && role === 'provider' && (
            <>
              <Link
                to="/provider/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Dashboard
              </Link>
              <Link
                to="/provider/bookings"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Appointments
              </Link>
              <Link
                to="/provider/services"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Services
              </Link>
              <Link
                to="/provider/hours"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Working Hours
              </Link>
              <Link
                to="/provider/time-off"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Time Off
              </Link>
            </>
          )}

          {isAuthenticated && role === 'admin' && (
            <>
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Admin Dashboard
              </Link>
              <Link
                to="/admin/users"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                User Management
              </Link>
              <Link
                to="/admin/providers"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Providers
              </Link>
              <Link
                to="/admin/bookings"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                All Bookings
              </Link>
            </>
          )}

          <div className="pt-4 border-t border-slate-200">
            {isAuthenticated ? (
              <div className="space-y-2">
                <div className="px-3 text-xs text-slate-500">
                  Signed in as <span className="font-semibold text-slate-800">{user.email}</span> ({role})
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-rose-600 hover:bg-rose-50"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="space-y-2 px-3">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center py-2 rounded-lg font-medium text-slate-700 bg-slate-100"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center py-2 rounded-lg font-medium text-white bg-blue-600"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
