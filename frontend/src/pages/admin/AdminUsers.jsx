import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Users, Search, Filter, Shield, Check, X, AlertCircle } from 'lucide-react';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotice, setActionNotice] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (roleFilter !== 'all') {
        params.role = roleFilter;
      }
      const { data } = await api.get('/users/', { params });
      setUsers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError('Failed to fetch user list.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (u) => {
    if (u.id === currentUser.id && u.is_active) {
      alert('You cannot deactivate your own administrative account.');
      return;
    }

    const newStatus = !u.is_active;
    const confirmMsg = newStatus
      ? `Reactivate account for ${u.email}?`
      : `Deactivate user ${u.email}? ${u.role === 'provider' ? 'Future confirmed bookings will be flagged.' : ''}`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const { data } = await api.patch(`/users/${u.id}/`, {
        is_active: newStatus,
      });

      if (data.future_bookings_count && data.future_bookings_count > 0) {
        setActionNotice(
          `Notice: Provider ${u.email} was deactivated. They currently have ${data.future_bookings_count} future confirmed booking(s).`
        );
      } else {
        setActionNotice(`User ${u.email} active status updated to: ${newStatus ? 'Active' : 'Inactive'}.`);
      }

      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update user status.');
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || name.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            User Account Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review registered accounts, filter by RBAC role, and manage active directory status
          </p>
        </div>

        {error && <Alert type="error" message={error} />}
        {actionNotice && (
          <Alert type="info" message={actionNotice} onClose={() => setActionNotice(null)} />
        )}

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email, name, or username..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-600"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="customer">Customers</option>
              <option value="provider">Providers</option>
              <option value="admin">Administrators</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 flex justify-center">
              <Spinner size="lg" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              No user accounts found matching your query.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">User</th>
                    <th className="px-6 py-3.5">Role</th>
                    <th className="px-6 py-3.5">Phone</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">
                          {u.first_name ? `${u.first_name} ${u.last_name || ''}` : u.username}
                        </div>
                        <div className="text-slate-400 text-[11px]">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : u.role === 'provider'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{u.phone || '—'}</td>
                      <td className="px-6 py-4">
                        <Badge status={u.is_active ? 'active' : 'inactive'} size="xs" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            u.is_active
                              ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
