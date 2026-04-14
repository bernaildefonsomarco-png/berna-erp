import React from 'react';

/**
 * Wrapper para cualquier gráfico Recharts.
 * Maneja los estados loading / empty / error de forma uniforme.
 *
 * Props:
 *   loading  — boolean
 *   empty    — boolean (datos vacíos pero sin error)
 *   error    — string | null
 *   label    — string (etiqueta para el empty state)
 *   children — el gráfico
 */
export default function ChartContainer({ loading, empty, error, label, children }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-1">
        <span className="text-sm text-red-600">Error al cargar datos</span>
        <span className="text-xs text-stone-400">{error}</span>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-1">
        <span className="text-sm text-stone-400">Sin datos{label ? ` de ${label}` : ''} para el período</span>
      </div>
    );
  }

  return <>{children}</>;
}
