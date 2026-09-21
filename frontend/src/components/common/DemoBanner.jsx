import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, Sparkles, User, Scissors, Stethoscope } from 'lucide-react';

export default function DemoBanner() {
  const { demoLogin, user } = useAuth();
  const [loadingEmail, setLoadingEmail] = useState(null);

  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  if (!isDemoMode) return null;

  const demoAccounts = [
    {
      role: 'Admin',
      email: 'admin@slotsync.local',
      label: 'Admin',
      icon: Shield,
      color: 'hover:bg-purple-50 hover:border-purple-300 text-purple-700',
      activeColor: 'bg-purple-100 border-purple-400 text-purple-800 font-semibold',
    },
    {
      role: 'Provider',
      email: 'aisha.sharma@slotsync.local',
      label: 'Dr. Aisha (Clinic)',
      icon: Stethoscope,
      color: 'hover:bg-blue-50 hover:border-blue-300 text-blue-700',
      activeColor: 'bg-blue-100 border-blue-400 text-blue-800 font-semibold',
    },
    {
      role: 'Provider',
      email: 'marcus.vance@slotsync.local',
      label: 'Marcus (Salon)',
      icon: Scissors,
      color: 'hover:bg-amber-50 hover:border-amber-300 text-amber-700',
      activeColor: 'bg-amber-100 border-amber-400 text-amber-800 font-semibold',
    },
    {
      role: 'Customer',
      email: 'rahul.verma@example.com',
      label: 'Rahul (Customer)',
      icon: User,
      color: 'hover:bg-emerald-50 hover:border-emerald-300 text-emerald-700',
      activeColor: 'bg-emerald-100 border-emerald-400 text-emerald-800 font-semibold',
    },
  ];

  const handleSwitch = async (email) => {
    if (user?.email === email) return;
    setLoadingEmail(email);
    try {
      const pass = email.includes('admin') ? 'AdminPass123!' : 'DemoPass123!';
      await demoLogin(email, pass);
    } catch (err) {
      console.error('Failed to switch demo account:', err);
    } finally {
      setLoadingEmail(null);
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white text-xs px-4 py-2 border-b border-indigo-800/40 shadow-inner">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-indigo-200 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Demo Sandbox:
          </span>
          <span className="text-slate-300 hidden sm:inline">1-Click Persona Switcher:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {demoAccounts.map((acc) => {
            const Icon = acc.icon;
            const isActive = user?.email === acc.email;
            const isLoading = loadingEmail === acc.email;

            return (
              <button
                key={acc.email}
                onClick={() => handleSwitch(acc.email)}
                disabled={isLoading}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs transition border ${
                  isActive
                    ? acc.activeColor
                    : `bg-slate-800/80 border-slate-700 text-slate-200 ${acc.color}`
                } disabled:opacity-50`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Switching...' : acc.label}</span>
                {isActive && <span className="text-[10px] uppercase font-bold tracking-tight ml-1">(Active)</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
