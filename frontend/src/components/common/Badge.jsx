import React from 'react';

const statusConfig = {
  confirmed: {
    label: 'Confirmed',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    classes: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  completed: {
    label: 'Completed',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  no_show: {
    label: 'No Show',
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  active: {
    label: 'Active',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  inactive: {
    label: 'Inactive',
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export default function Badge({ status, text, size = 'sm', className = '' }) {
  const config = statusConfig[status] || {
    label: text || status,
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  };

  const displayText = text || config.label;
  const sizeClasses = size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-sm ${config.classes} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${config.dot}`} />
      {displayText}
    </span>
  );
}
