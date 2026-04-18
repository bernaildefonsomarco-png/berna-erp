// src/views/finanzas/views/cierres/PasoConfirmarPin.jsx
import React, { useState } from 'react';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function PasoConfirmarPin({ year, month, onVolver, onConfirmar, guardando }) {
  const [pin, setPin] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pin || pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    try {
      await onConfirmar({ pin, notas });
    } catch (err) {
      setError(err.message || 'Error al cerrar el período.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Confirmar cierre del período</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Esta acción sellará <strong>{MESES[month - 1]} {year}</strong> e impedirá ediciones.
          Se puede reabrir en cualquier momento con motivo y PIN.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            PIN de administrador
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            maxLength={8}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            Notas del cierre (opcional)
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="Ej: Mes sin incidencias. Cuota Aly pagada el día 15."
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onVolver}
            disabled={guardando}
            className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            ← Volver al preview
          </button>
          <button
            type="submit"
            disabled={guardando || !pin}
            className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {guardando ? 'Cerrando…' : `Cerrar ${MESES[month - 1]} ${year}`}
          </button>
        </div>
      </form>
    </div>
  );
}
