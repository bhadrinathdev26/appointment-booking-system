import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from './Spinner';

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const { user, role, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Redirect to their own role dashboard if unauthorized
    if (role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (role === 'provider') {
      return <Navigate to="/provider/dashboard" replace />;
    }
    return <Navigate to="/bookings" replace />;
  }

  return children ? children : <Outlet />;
}
