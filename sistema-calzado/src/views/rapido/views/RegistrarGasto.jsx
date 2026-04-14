import React, { useState, useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarTiposGasto, registrarGastoRapido } from '../api/rapidoClient';
import { useRapido } from '../RapidoContext';
import StepHeader from '../components/StepHeader';
import MoneyDisplay from '../components/MoneyDisplay';
import BigButton from '../components/BigButton';
import ConfirmCard from '../components/ConfirmCard';

/* ─── Lógica del NumPad de montos ──────────────────────────────────────── */

function useMontoDigits() {
  const [digits, setDigits] = useState('');

  const press = (d) => {
    if (d === '⌫') { setDigits(p => p.slice(0, -1)); return; }
    if (!/^\d$/.test(d)) return;
    if (digits.length >= 9) return; // máximo 9999999.99
    setDigits(p => p + d);
  };

  const monto = (() => {
    if (!digits) return 0;
    const s = digits.padStart(3, '0');
    return Number(`${s.slice(0, -2) || '0'}.${s.slice(-2)}`);
  })();

  const display = (() => {
    if (!digits) return '0.00';
    const s = digits.padStart(3, '0');
    return `${Number(s.slice(0, -2) || '0').toLocaleString('es-PE')}.${s.slice(-2)}`;
  })();

  return { digits, press, monto, display, reset: () => setDigits('') };
}

function NumPadGrid({ onPress }) {
  return (
    <div className="grid grid-cols-3 gap-3 max-w-[320px] mx-auto select-none">
      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
        d === '' ? <div key={i} /> : (
          <button
            key={d}
            onPointerDown={e => { e.preventDefault(); onPress(d); }}
            className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
              d === '⌫' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-[#0a0a0a] hover:bg-gray-200'
            }`}
          >
            {d}
          </button>
        )
      )}
    </div>
  );
}

/* ─── Wizard ────────────────────────────────────────────────────────────── */

const PASOS = 4;

export default function RegistrarGasto() {
  const navigate = useNavigate();
  const { cuentas, usuario, refrescarCuentas } = useRapido();
  const [paso, setPaso] = useState(1);
  const [tipos, setTipos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const { digits, press, monto, display } = useMontoDigits();
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [tipoSeleccionado, setTipoSeleccionado]     = useState(null);
  const [nota, setNota]                             = useState('');

  useEffect(() => {
    listarTiposGasto().then(setTipos).catch(console.error);
  }, []);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await registrarGastoRapido({
        idCuenta:  cuentaSeleccionada.id_cuenta,
        monto,
        concepto:  nota || tipoSeleccionado?.nombre || 'Gasto',
        idTipo:    tipoSeleccionado?.id_tipo || null,
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
        <p className="text-2xl font-bold text-[#0a0a0a]">¡Gasto registrado!</p>
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
          paso === 1 ? '¿Cuánto gastaste?' :
          paso === 2 ? '¿De qué cuenta salió?' :
          paso === 3 ? '¿Para qué fue?' :
          'Confirmar gasto'
        }
        onBack={paso === 1 ? () => navigate('/rapido') : () => setPaso(p => p - 1)}
      />

      {/* ── Paso 1: Monto ── */}
      {paso === 1 && (
        <div className="flex flex-col items-center gap-8">
          <MoneyDisplay value={monto} size="lg" color={monto > 0 ? 'danger' : 'default'} />
          <NumPadGrid onPress={press} />
          <BigButton
            variant="primary"
            disabled={monto <= 0}
            onClick={() => setPaso(2)}
            className="mt-2"
          >
            Siguiente →
          </BigButton>
        </div>
      )}

      {/* ── Paso 2: Cuenta ── */}
      {paso === 2 && (
        <div className="space-y-3">
          {cuentas.length === 0 && <p className="text-gray-400 text-center py-8">Sin cuentas</p>}
          {cuentas.map(c => (
            <button
              key={c.id_cuenta}
              onClick={() => { setCuentaSeleccionada(c); setPaso(3); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all"
            >
              <div className="text-left">
                <p className="text-xl font-bold text-[#0a0a0a]">{c.alias || c.nombre}</p>
                <p className="text-sm text-gray-400">{c.tipo_cuenta}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#15803d] tabular-nums">
                  S/ {Number(c.saldo_actual).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Paso 3: Tipo de gasto ── */}
      {paso === 3 && (
        <div className="space-y-3">
          {tipos.map(t => (
            <button
              key={t.id_tipo}
              onClick={() => { setTipoSeleccionado(t); setPaso(4); }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 bg-gray-50 hover:border-[#1c1917] active:scale-[0.98] transition-all text-left ${
                tipoSeleccionado?.id_tipo === t.id_tipo ? 'border-[#1c1917]' : 'border-gray-100'
              }`}
            >
              <span className="text-3xl">{t.icono || '📋'}</span>
              <p className="text-xl font-bold text-[#0a0a0a]">{t.nombre}</p>
            </button>
          ))}
          {/* Opción "Otro" sin tipo */}
          <button
            onClick={() => { setTipoSeleccionado(null); setPaso(4); }}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 bg-gray-50 border-gray-100 hover:border-[#1c1917] active:scale-[0.98] transition-all text-left"
          >
            <span className="text-3xl">📝</span>
            <p className="text-xl font-bold text-[#0a0a0a]">Otro (escribir nota)</p>
          </button>
        </div>
      )}

      {/* ── Paso 4: Confirmación ── */}
      {paso === 4 && (
        <div className="space-y-5">
          <ConfirmCard
            titulo="Resumen del gasto"
            items={[
              { label: 'Monto',   value: `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}` },
              { label: 'Cuenta',  value: cuentaSeleccionada?.alias || cuentaSeleccionada?.nombre },
              { label: 'Tipo',    value: tipoSeleccionado?.nombre || '—' },
            ]}
          />

          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Nota (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-base text-[#0a0a0a] focus:outline-none focus:border-[#1c1917] resize-none"
              placeholder="Ej: factura luz enero"
            />
          </div>

          <BigButton variant="success" onClick={confirmar} disabled={guardando}>
            {guardando ? 'Registrando…' : 'Registrar gasto'}
          </BigButton>
        </div>
      )}
    </div>
  );
}
