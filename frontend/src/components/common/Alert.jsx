import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

const alertStyles = {
  error: {
    bg: 'bg-red-50 text-red-800 border-red-200',
    icon: XCircle,
    iconColor: 'text-red-500',
  },
  success: {
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertCircle,
    iconColor: 'text-amber-500',
  },
  info: {
    bg: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Info,
    iconColor: 'text-blue-500',
  },
};

export default function Alert({ type = 'error', message, title, onClose, className = '' }) {
  if (!message) return null;

  const style = alertStyles[type] || alertStyles.error;
  const Icon = style.icon;

  return (
    <div className={`p-4 rounded-xl border flex items-start space-x-3 text-sm shadow-sm ${style.bg} ${className}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <p className="whitespace-pre-line">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors ml-2"
          aria-label="Close alert"
        >
          &times;
        </button>
      )}
    </div>
  );
}
