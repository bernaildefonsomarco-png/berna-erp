import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Wrapper para gráficos Recharts.
 * Maneja estados loading / empty / error de forma uniforme.
 */
export default function ChartContainer({ loading, empty, error, label, children }) {
  if (loading) {
    return <Skeleton className="min-h-[200px] w-full rounded-lg" />;
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-1.5">
        <span className="text-sm font-medium text-destructive">Error al cargar datos</span>
        <span className="text-xs text-muted-foreground">{error}</span>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center">
        <span className="text-sm text-muted-foreground">
          Sin datos{label ? ` de ${label}` : ''} para el período
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
