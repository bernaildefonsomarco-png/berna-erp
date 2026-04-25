import React, { useState, useEffect } from 'react';
import { isSupabaseConfigured } from '../../api/supabase';
import { autenticarPorPin } from './api/finanzasClient';
import { clearGestionSession, getGestionSessionRaw, setGestionSessionJson } from '../../lib/pinAuth';
import { Spinner, Icon, ICONS } from './components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   GestionGate — portero del workspace Gestión (PIN + permisos; sesión local).
   Clave actual: berna_gestion_session (migrada desde berna_finanzas_session).
   ────────────────────────────────────────────────────────────────────────── */

function NumPad({ value, onChange, onSubmit, loading, maxLength = 4 }) {
  const press = d => {
    if (loading) return;
    if (d === '⌫') { onChange(value.slice(0, -1)); return; }
    if (value.length >= maxLength) return;
    const n = value + d;
    onChange(n);
    if (n.length === maxLength) onSubmit(n);
  };

  return (
    <div className="w-full select-none">
      <div className="flex justify-center gap-3 mb-8">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div key={i}
               className={`w-3 h-3 rounded-full transition-all ${
                 i < value.length ? 'bg-[#1c1917] scale-110' : 'bg-[#e7e5e4]'
               }`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
          d === '' ? <div key={i} /> :
          <button
            key={d}
            onPointerDown={e => { e.preventDefault(); press(d); }}
            disabled={loading}
            className={`h-14 rounded-xl text-lg font-medium transition-all active:scale-95 ${
              d === '⌫'
                ? 'bg-[#fafaf9] text-[#a8a29e] hover:bg-[#f5f5f4]'
                : 'bg-[#fafaf9] text-[#1c1917] hover:bg-[#f5f5f4]'
            }`}>
            {d}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GestionGate({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [iniciando, setIniciando] = useState(true);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    try {
      const stored = getGestionSessionRaw();
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.id_persona && u.permisos) {
          setUsuario(u);
          setGestionSessionJson(stored);
        }
      }
    } catch { /* inválido */ }
    setIniciando(false);
  }, []);

  const intentarLogin = async (p) => {
    setCargando(true);
    setError('');
    try {
      const result = await autenticarPorPin(p);
      if (!result) {
        setError('PIN incorrecto');
        setPin('');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } else if (result.sinAcceso) {
        setError('No tienes acceso a Gestión');
        setPin('');
      } else {
        const seguro = { ...result };
        delete seguro.pin;
        delete seguro.pin_hash;
        setUsuario(seguro);
        try { setGestionSessionJson(JSON.stringify(seguro)); } catch { /* */ }
      }
    } catch (e) {
      console.error(e);
      setError('Error al validar. Intenta de nuevo.');
      setPin('');
    } finally {
      setCargando(false);
    }
  };

  const logout = () => {
    setUsuario(null);
    setPin('');
    clearGestionSession();
  };

  if (iniciando) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <p className="text-3xl">⚠️</p>
          <h1 className="text-lg font-semibold text-[#1c1917]">Falta configuración de Supabase</h1>
          <p className="text-sm text-[#57534e]">
            En Vercel: <strong>Settings</strong> → <strong>Environment Variables</strong> — añade{' '}
            <code className="text-xs bg-[#f5f5f4] px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
            <code className="text-xs bg-[#f5f5f4] px-1 rounded">VITE_SUPABASE_ANON_KEY</code>, luego <strong>Redeploy</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-[#1c1917] flex items-center justify-center mb-4">
              <Icon d={ICONS.coins} size={26} className="text-white" />
            </div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-[#a8a29e] mb-1">Berna calzado</p>
            <h1 className="text-2xl font-semibold text-[#1c1917] tracking-tight">Gestión Empresarial</h1>
            <p className="text-sm text-[#57534e] mt-2">Ingresa tu PIN para continuar</p>
          </div>

          <NumPad
            value={pin}
            onChange={v => { setPin(v); setError(''); }}
            onSubmit={intentarLogin}
            loading={cargando}
          />

          {error && (
            <div className="mt-6 text-center">
              <p className="text-sm text-[#991b1b]">{error}</p>
            </div>
          )}

          {cargando && (
            <div className="mt-6 flex items-center justify-center">
              <Spinner size={18} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return children({ usuario, logout });
}
