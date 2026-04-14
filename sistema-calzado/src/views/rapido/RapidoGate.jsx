import React, { useState, useEffect } from 'react';
import { loginRapido } from './api/rapidoClient';

/* ──────────────────────────────────────────────────────────────────────────
   RapidoGate
   Portero del Modo Rápido. Valida el PIN y el permiso 'rapido'.
   Mismo patrón que FinanzasGate pero con identidad visual de alto contraste.
   ────────────────────────────────────────────────────────────────────────── */

const SK_RAPIDO = 'berna.rapido.session.v1';

function Spinner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="#d1d5db" strokeWidth="3" />
      <path d="M12 2a10 10 0 0110 10" stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function NumPadRapido({ value, onChange, onSubmit, loading, maxLength = 4 }) {
  const press = (d) => {
    if (loading) return;
    if (d === '⌫') { onChange(value.slice(0, -1)); return; }
    if (value.length >= maxLength) return;
    const next = value + d;
    onChange(next);
    if (next.length === maxLength) onSubmit(next);
  };

  return (
    <div className="w-full select-none">
      {/* Indicadores de dígitos */}
      <div className="flex justify-center gap-4 mb-10">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-all duration-150 ${
              i < value.length ? 'bg-[#1c1917] scale-110' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3 max-w-[300px] mx-auto">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
          d === '' ? <div key={i} /> : (
            <button
              key={d}
              onPointerDown={e => { e.preventDefault(); press(d); }}
              disabled={loading}
              className={`h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95 active:bg-gray-200 ${
                d === '⌫'
                  ? 'bg-gray-100 text-gray-500'
                  : 'bg-gray-100 text-[#0a0a0a] hover:bg-gray-200'
              }`}
            >
              {d}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default function RapidoGate({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [iniciando, setIniciando] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Restaurar sesión desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SK_RAPIDO);
      if (stored) {
        const u = JSON.parse(stored);
        if (u?.id_persona && u?.permisos) setUsuario(u);
      }
    } catch {}
    setIniciando(false);
  }, []);

  const intentarLogin = async (p) => {
    setCargando(true);
    setError('');
    try {
      const result = await loginRapido(p);
      const seguro = { ...result };
      delete seguro.pin;
      delete seguro.pin_hash;
      setUsuario(seguro);
      try { localStorage.setItem(SK_RAPIDO, JSON.stringify(seguro)); } catch {}
    } catch (e) {
      const msg =
        e.code === 'INVALID_PIN'    ? 'PIN incorrecto' :
        e.code === 'NO_PERMISSION'  ? 'No tienes acceso al Modo Rápido' :
        'Error al validar. Intenta de nuevo.';
      setError(msg);
      setPin('');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } finally {
      setCargando(false);
    }
  };

  const logout = () => {
    setUsuario(null);
    setPin('');
    try { localStorage.removeItem(SK_RAPIDO); } catch {}
  };

  if (iniciando) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="flex flex-col items-center mb-12">
            <div className="w-16 h-16 rounded-2xl bg-[#1c1917] flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-gray-400 mb-1">Berna Calzado</p>
            <h1 className="text-3xl font-bold text-[#0a0a0a]">Modo Rápido</h1>
            <p className="text-base text-gray-500 mt-2">Ingresa tu PIN</p>
          </div>

          <NumPadRapido
            value={pin}
            onChange={v => { setPin(v); setError(''); }}
            onSubmit={intentarLogin}
            loading={cargando}
          />

          {error && (
            <p className="mt-8 text-center text-base font-medium text-red-700">{error}</p>
          )}
          {cargando && (
            <div className="mt-8 flex justify-center"><Spinner /></div>
          )}
        </div>
      </div>
    );
  }

  return children({ usuario, logout });
}
