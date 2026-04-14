import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarDeudasActivas, registrarPagoDeudaRapido } from '../api/rapidoClient';
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
  const monto = (() => {
    if (!digits) return 0;
    const s = digits.padStart(3, '0');
    return Number(`${s.slice(0, -2) || '0'}.${s.slice(-2)}`);
  })();
  return { press, monto };
}

const PASOS = 4;

export default function RegistrarPagoDeuda() {
  const navigate = useNavigate();
  const { cuentas, usuario, refrescarCuentas } = useRapido();
  const [paso, setPaso] = useState(1);
  const [deudas, setDeudas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const { press, monto } = useMontoDigits();
  const [deudaSeleccionada, setDeudaSeleccionada]   = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);

  useEffect(() => {
    listarDeudasActivas().then(setDeudas).catch(console.error);
  }, []);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await registrarPagoDeudaRapido({
        idDeuda:   deudaSeleccionada.id_deuda,
        idCuenta:  cuentaSeleccionada.id_cuenta,
        monto,
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
        <p className="text-2xl font-bold text-[#0a0a0a]">¡Pago registrado!</p>
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
          paso === 1 ? '¿A qué deuda?' :
          paso === 2 ? '¿Cuánto pagas?' :
          paso === 3 ? '¿De qué cuenta sale?' :
          'Confirmar pago'
        }
        onBack={paso === 1 ? () => navigate('/rapido') : () => setPaso(p => p - 1)}
      />

      {/* ── Paso 1: Deuda ── */}
      {paso === 1 && (
        <div className="space-y-3">
          {deudas.length === 0 && <p className="text-gray-400 text-center py-8">Sin deudas activas</p>}
          {deudas.map(d => (
            <button key={d.id_deuda} onClick={() => { setDeudaSeleccionada(d); setPaso(2); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all text-left">
              <div>
                <p className="text-xl font-bold text-[#0a0a0a]">{d.nombre}</p>
                <p className="text-sm text-gray-400">{d.acreedor}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">Saldo</p>
                <p className="text-lg font-bold text-[#b91c1c] tabular-nums">
                  S/ {Number(d.saldo_actual).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </p>
                {d.cuota_monto && (
                  <p className="text-xs text-gray-400">cuota S/ {Number(d.cuota_monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Paso 2: Monto ── */}
      {paso === 2 && (
        <div className="flex flex-col items-center gap-6">
          {deudaSeleccionada?.cuota_monto && (
            <p className="text-sm text-gray-400">Cuota sugerida: <strong>S/ {Number(deudaSeleccionada.cuota_monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</strong></p>
          )}
          <MoneyDisplay value={monto} size="lg" color={monto > 0 ? 'danger' : 'default'} />
          <NumPadGrid onPress={press} />
          <BigButton variant="primary" disabled={monto <= 0} onClick={() => setPaso(3)}>
            Siguiente →
          </BigButton>
        </div>
      )}

      {/* ── Paso 3: Cuenta ── */}
      {paso === 3 && (
        <div className="space-y-3">
          {cuentas.map(c => (
            <button key={c.id_cuenta} onClick={() => { setCuentaSeleccionada(c); setPaso(4); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all">
              <div className="text-left">
                <p className="text-xl font-bold text-[#0a0a0a]">{c.alias || c.nombre}</p>
                <p className="text-sm text-gray-400">{c.tipo_cuenta}</p>
              </div>
              <p className="text-lg font-bold text-[#15803d] tabular-nums">
                S/ {Number(c.saldo_actual).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ── Paso 4: Confirmación ── */}
      {paso === 4 && (
        <div className="space-y-5">
          <ConfirmCard
            titulo="Resumen del pago"
            items={[
              { label: 'Deuda',  value: deudaSeleccionada?.nombre },
              { label: 'Monto',  value: `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` },
              { label: 'Cuenta', value: cuentaSeleccionada?.alias || cuentaSeleccionada?.nombre },
            ]}
          />
          <BigButton variant="success" onClick={confirmar} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Confirmar pago'}
          </BigButton>
        </div>
      )}
    </div>
  );
}
