import React from 'react';

/**
 * Muestra un monto en formato S/ grande.
 * size: 'lg' (default 48px) | 'md' (32px)
 */
export default function MoneyDisplay({ value, size = 'lg', color = 'default' }) {
  const formatted = Number(value || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const sizeClass = size === 'lg' ? 'text-5xl' : 'text-3xl';
  const colorClass =
    color === 'success' ? 'text-[#15803d]' :
    color === 'danger'  ? 'text-[#b91c1c]' :
    'text-[#0a0a0a]';

  return (
    <div className={`font-bold tabular-nums ${sizeClass} ${colorClass}`}>
      <span className="text-gray-400 font-normal mr-1" style={{ fontSize: '0.6em' }}>S/</span>
      {formatted}
    </div>
  );
}
