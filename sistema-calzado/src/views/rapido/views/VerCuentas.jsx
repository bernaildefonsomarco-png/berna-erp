import React, { useEffect } from 'react';
import { useRapido } from '../RapidoContext';
import StepHeader from '../components/StepHeader';
import MoneyDisplay from '../components/MoneyDisplay';

export default function VerCuentas() {
  const { cuentas, refrescarCuentas } = useRapido();

  useEffect(() => { refrescarCuentas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSaldos = cuentas.reduce((s, c) => s + Number(c.saldo_actual || 0), 0);

  return (
    <div>
      <StepHeader paso={1} total={1} titulo="Saldos actuales" />

      {/* Total consolidado */}
      <div className="bg-[#1c1917] rounded-2xl p-5 mb-5 text-white">
        <p className="text-sm text-gray-400 mb-1">Total en todas las cuentas</p>
        <MoneyDisplay value={totalSaldos} size="lg" />
      </div>

      {/* Lista de cuentas */}
      <div className="space-y-3">
        {cuentas.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-base">Sin cuentas registradas</p>
        )}
        {cuentas.map(c => (
          <div
            key={c.id_cuenta}
            className="flex items-center justify-between bg-gray-50 rounded-2xl p-4"
          >
            <div>
              <p className="text-lg font-bold text-[#0a0a0a]">{c.alias || c.nombre}</p>
              <p className="text-sm text-gray-400">{c.tipo_cuenta}{c.ubicacion_nombre ? ` · ${c.ubicacion_nombre}` : ''}</p>
            </div>
            <MoneyDisplay
              value={c.saldo_actual}
              size="md"
              color={Number(c.saldo_actual) >= 0 ? 'success' : 'danger'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
