import React from 'react';
import { Calendar, Shield, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-slate-800 tracking-tight">
              Slot<span className="text-blue-600">Sync</span>
            </span>
            <span className="text-xs text-slate-400 pl-2 border-l border-slate-200">
              Modern Multi-Service Appointment Engine
            </span>
          </div>

          <div className="text-xs text-slate-500 flex items-center space-x-1">
            <span>Built with Django 5 REST + React 18</span>
            <span>&bull;</span>
            <span className="text-emerald-600 font-medium flex items-center gap-0.5">
              <Shield className="w-3.5 h-3.5" /> Pessimistic Locking
            </span>
            <span>&bull;</span>
            <span>Asia/Kolkata (IST)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
