import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registrarTransferenciaRapido } from '../api/rapidoClient';
import { useRapido } from '../RapidoContext';
import StepHeader from '../components/StepHeader';
import MoneyDisplay from '../components/MoneyDisplay';
import BigButton from '../components/BigButton';
import ConfirmCard from '../components/ConfirmCard';

function NumPadGrid({ onPress }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[320px] mx-auto select-none">
      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
        d === '' ? <div key={i} /> : (
          <button key={d} onPointerDown={e => { e.preventDefault(); onPress(d); }}
            className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${d === '⌫' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-[#0a0a0a] hover:bg-gray-200'}`}>
            {d}
          </button>
        )
      )}
    </div>
  );
}

function useMontoDigits() {
  const [digits, setDigits] = useState('');
  const press = (d) => {
    if (d === '⌫') { setDigits(p => p.slice(0, -1)); return; }
    if (!/^\d$/.test(d) || digits.length >= 9) return;
    setDigits(p => p + d);
  };
  const monto = !digits ? 0 : (() => {
    const s = digits.padStart(3, '0');
    return Number(`${s.slice(0, -2) || '0'}.${s.slice(-2)}`);
  })();
  return { press, monto };
}

const PASOS = 4;
const fmtS = (v) => 'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2 });

export default function Transferir() {
  const navigate = useNavigate();
  const { cuentas, usuario, refrescarCuentas } = useRapido();
  const [paso, setPaso] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const { press, monto } = useMontoDigits();
  const [origen, setOrigen]   = useState(null);
  const [destino, setDestino] = useState(null);
  const [nota, setNota]       = useState('');

  const cuentasDestino = cuentas.filter(c => c.id_cuenta !== origen?.id_cuenta);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await registrarTransferenciaRapido({
        idCuentaOrigen:  origen.id_cuenta,
        idCuentaDestino: destino.id_cuenta,
        monto,
        concepto: nota || 'Transferencia entre cuentas',
        idPersona: usuario.id_persona,
      });
      if (navigator.vibrate) navigator.vibrate(50);
      await refrescarCuentas();
      setExito(true);
      setTimeout(() => navigate('/rapido'), 1800);
    } catch (e) {
      alert(e.message || 'Error al registrar');
      setGuardando(false);
    }
  };

  if (exito) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-2xl font-bold text-[#0a0a0a]">¡Transferencia lista!</p>
        <p className="text-gray-400">Volviendo al inicio…</p>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        paso={paso}
        total={PASOS}
        titulo={
          paso === 1 ? '¿De qué cuenta sale?' :
          paso === 2 ? '¿Cuánto mueves?' :
          paso === 3 ? '¿A qué cuenta va?' :
          'Confirmar transferencia'
        }
        onBack={paso === 1 ? () => navigate('/rapido') : () => setPaso(p => p - 1)}
      />

      {/* ── Paso 1: Cuenta origen ── */}
      {paso === 1 && (
        <div className="space-y-3">
          {cuentas.map(c => (
            <button key={c.id_cuenta} onClick={() => { setOrigen(c); setPaso(2); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all">
              <div className="text-left">
                <p className="text-xl font-bold text-[#0a0a0a]">{c.alias || c.nombre}</p>
                <p className="text-sm text-gray-400">{c.tipo_cuenta}</p>
              </div>
              <p className="text-lg font-bold text-[#15803d] tabular-nums">{fmtS(c.saldo_actual)}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Paso 2: Monto ── */}
      {paso === 2 && (
        <div className="flex flex-col items-center gap-6">
          <p className="text-sm text-gray-400">Disponible en <strong>{origen?.alias || origen?.nombre}</strong>: <strong>{fmtS(origen?.saldo_actual)}</strong></p>
          <MoneyDisplay value={monto} size="lg" />
          <NumPadGrid onPress={press} />
          <BigButton variant="primary" disabled={monto <= 0 || monto > Number(origen?.saldo_actual)} onClick={() => setPaso(3)}>
            Siguiente →
          </BigButton>
          {monto > Number(origen?.saldo_actual) && (
            <p className="text-red-600 text-sm">El monto supera el saldo disponible</p>
          )}
        </div>
      )}

      {/* ── Paso 3: Cuenta destino ── */}
      {paso === 3 && (
        <div className="space-y-3">
          {cuentasDestino.map(c => (
            <button key={c.id_cuenta} onClick={() => { setDestino(c); setPaso(4); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all">
              <div className="text-left">
                <p className="text-xl font-bold text-[#0a0a0a]">{c.alias || c.nombre}</p>
                <p className="text-sm text-gray-400">{c.tipo_cuenta}</p>
              </div>
              <p className="text-lg font-bold text-[#15803d] tabular-nums">{fmtS(c.saldo_actual)}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Paso 4: Confirmación ── */}
      {paso === 4 && (
        <div className="space-y-5">
          <ConfirmCard
            titulo="Resumen de la transferencia"
            items={[
              { label: 'Desde', value: origen?.alias || origen?.nombre },
              { label: 'Hacia', value: destino?.alias || destino?.nombre },
              { label: 'Monto', value: fmtS(monto) },
            ]}
          />
          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Nota (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-base text-[#0a0a0a] focus:outline-none focus:border-[#1c1917] resize-none"
              placeholder="Ej: para pagar mañana"
            />
          </div>
          <BigButton variant="success" onClick={confirmar} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Confirmar transferencia'}
          </BigButton>
        </div>
      )}
    </div>
  );
}
