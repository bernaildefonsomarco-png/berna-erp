import React from 'react';

/**
 * Tarjeta de confirmación final antes de guardar.
 * Muestra un resumen de la operación.
 *
 * Props:
 *   titulo   — string
 *   items    — array de { label, value }
 *   children — botones de acción
 */
export default function ConfirmCard({ titulo, items = [], children }) {
  return (
    <div className="bg-gray-50 rounded-3xl p-6 space-y-4">
      {titulo && (
        <h3 className="text-lg font-bold text-[#0a0a0a]">{titulo}</h3>
      )}
      <dl className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-baseline gap-4">
            <dt className="text-base text-gray-500 shrink-0">{item.label}</dt>
            <dd className="text-base font-semibold text-[#0a0a0a] text-right">{item.value}</dd>
          </div>
        ))}
      </dl>
      {children && <div className="pt-2 space-y-3">{children}</div>}
    </div>
  );
}
