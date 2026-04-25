import { Link } from 'react-router-dom';

/**
 * Vista mínima para rutas aún no implementadas (planes Fase 2 posteriores).
 */
export default function PlaceholderModuloFase2({ titulo, descripcion, enlaceTo, enlaceLabel }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{descripcion}</p>
      {enlaceTo && enlaceLabel && (
        <p className="mt-6">
          <Link to={enlaceTo} className="text-sm font-medium text-primary underline underline-offset-2">
            {enlaceLabel}
          </Link>
        </p>
      )}
    </div>
  );
}
