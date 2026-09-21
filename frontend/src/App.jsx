import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import DemoBanner from './components/common/DemoBanner';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import ProtectedRoute from './components/common/ProtectedRoute';

// Public Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Directory from './pages/Directory';
import ProviderDetail from './pages/ProviderDetail';

// Customer Pages
import CustomerBookings from './pages/CustomerBookings';

// Provider Portal Pages
import ProviderDashboard from './pages/provider/ProviderDashboard';
import ProviderBookings from './pages/provider/ProviderBookings';
import ProviderServices from './pages/provider/ProviderServices';
import ProviderWorkingHours from './pages/provider/ProviderWorkingHours';
import ProviderTimeOff from './pages/provider/ProviderTimeOff';

// Admin Portal Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminProviders from './pages/admin/AdminProviders';
import AdminBookings from './pages/admin/AdminBookings';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="flex flex-col min-h-screen">
          <DemoBanner />
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Discovery & Auth */}
              <Route path="/" element={<Directory />} />
              <Route path="/providers" element={<Directory />} />
              <Route path="/providers/:id" element={<ProviderDetail />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Customer Routes */}
              <Route element={<ProtectedRoute allowedRoles={['customer']} />}>
                <Route path="/bookings" element={<CustomerBookings />} />
              </Route>

              {/* Provider Portal Routes */}
              <Route element={<ProtectedRoute allowedRoles={['provider']} />}>
                <Route path="/provider/dashboard" element={<ProviderDashboard />} />
                <Route path="/provider/bookings" element={<ProviderBookings />} />
                <Route path="/provider/services" element={<ProviderServices />} />
                <Route path="/provider/hours" element={<ProviderWorkingHours />} />
                <Route path="/provider/time-off" element={<ProviderTimeOff />} />
              </Route>

              {/* Admin Portal Routes */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/providers" element={<AdminProviders />} />
                <Route path="/admin/bookings" element={<AdminBookings />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
