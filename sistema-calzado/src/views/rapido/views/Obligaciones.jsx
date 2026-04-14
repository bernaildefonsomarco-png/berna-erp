import React, { useState, useEffect } from 'react';
import { obtenerObligacionesProximas } from '../api/rapidoClient';
import StepHeader from '../components/StepHeader';

const fmt = (v) => 'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 });

function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const target = new Date(fechaStr + 'T00:00:00');
  return Math.round((target - hoy) / 86400000);
}

export default function Obligaciones() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    obtenerObligacionesProximas()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = items.reduce((s, o) => s + Number(o.monto || 0), 0);

  return (
    <div>
      <StepHeader paso={1} total={1} titulo="Próximos vencimientos" />

      {loading ? (
        <p className="text-center text-gray-400 py-8">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 py-8 text-base">No hay obligaciones próximas</p>
      ) : (
        <>
          {/* Total */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
            <p className="text-sm text-amber-700">Total próximas obligaciones</p>
            <p className="text-3xl font-bold text-amber-700 tabular-nums mt-1">{fmt(total)}</p>
          </div>

          <div className="space-y-3">
            {items.map((o, i) => {
              const dias = diasHasta(o.fecha_proxima);
              const urgente = dias != null && dias <= 7;
              return (
                <div
                  key={i}
                  className={`rounded-2xl p-4 border-2 ${urgente ? 'border-red-200 bg-red-50' : 'bg-gray-50 border-gray-100'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-lg font-bold text-[#0a0a0a]">{o.nombre}</p>
                      <p className="text-sm text-gray-500">
                        {o.tipo === 'deuda' ? 'Deuda' : 'Costo fijo'}
                        {o.detalle ? ` · ${o.detalle}` : ''}
                      </p>
                    </div>
                    <p className={`text-xl font-bold tabular-nums ${urgente ? 'text-red-700' : 'text-[#0a0a0a]'}`}>
                      {fmt(o.monto)}
                    </p>
                  </div>
                  {o.fecha_proxima && (
                    <p className={`text-sm mt-2 font-medium ${urgente ? 'text-red-600' : 'text-gray-400'}`}>
                      {urgente && dias === 0 ? '¡Vence hoy!' :
                       urgente && dias < 0  ? `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}` :
                       urgente ? `Vence en ${dias} día${dias !== 1 ? 's' : ''}` :
                       `Vence el ${o.fecha_proxima}`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
