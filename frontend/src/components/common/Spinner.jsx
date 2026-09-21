import React from 'react';

export default function Spinner({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3',
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div
        className={`${sizeMap[size] || sizeMap.md} border-blue-600 border-t-transparent rounded-full animate-spin`}
        role="status"
        aria-label="loading"
      />
    </div>
  );
}
