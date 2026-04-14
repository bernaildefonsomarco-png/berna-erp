import React from 'react';

const fmt = (v) =>
  'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Tarjeta KPI con label, monto grande y delta opcional.
 *
 * Props:
 *   label    — string
 *   value    — number
 *   delta    — number | null  (diferencia vs período anterior, opcional)
 *   color    — 'green' | 'red' | 'neutral' (por defecto neutral)
 *   loading  — boolean
 */
export default function KpiCard({ label, value, delta, color = 'neutral', loading }) {
  const colorMap = {
    green:   'text-green-700',
    red:     'text-red-700',
    neutral: 'text-stone-900',
  };

  const deltaPositive = delta > 0;
  const deltaColor = delta == null ? '' : deltaPositive ? 'text-green-600' : 'text-red-600';
  const deltaSign  = delta == null ? '' : deltaPositive ? '+' : '';

  return (
    <div className="bg-white rounded-xl border border-stone-200 px-5 py-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{label}</span>
      {loading ? (
        <div className="h-8 w-24 bg-stone-100 rounded animate-pulse mt-1" />
      ) : (
        <span className={`text-2xl font-bold tabular-nums ${colorMap[color]}`}>{fmt(value)}</span>
      )}
      {delta != null && !loading && (
        <span className={`text-xs ${deltaColor}`}>
          {deltaSign}{fmt(Math.abs(delta))} vs mes anterior
        </span>
      )}
    </div>
  );
}
