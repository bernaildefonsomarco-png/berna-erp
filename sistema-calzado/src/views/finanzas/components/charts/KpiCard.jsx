import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const fmt = (v) =>
  'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLOR_CLASS = {
  green:   'text-green-700',
  red:     'text-red-700',
  neutral: 'text-foreground',
};

/**
 * Tarjeta KPI de dashboard.
 * Props: label, value, delta?, color ('green'|'red'|'neutral'), loading
 */
export default function KpiCard({ label, value, delta, color = 'neutral', loading }) {
  const valueClass = COLOR_CLASS[color] || COLOR_CLASS.neutral;
  const deltaPositive = delta > 0;
  const deltaClass  = delta == null ? '' : deltaPositive ? 'text-green-600' : 'text-red-600';
  const deltaSign   = delta == null ? '' : deltaPositive ? '+' : '';

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card ring-1 ring-border px-5 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-24" />
      ) : (
        <span className={cn('text-2xl font-semibold tabular-nums tracking-tight', valueClass)}>
          {fmt(value)}
        </span>
      )}
      {delta != null && !loading && (
        <span className={cn('text-xs', deltaClass)}>
          {deltaSign}{fmt(Math.abs(delta))} vs mes anterior
        </span>
      )}
    </div>
  );
}
