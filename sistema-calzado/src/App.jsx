import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './api/supabase';
import { verifyPersonaPin } from './lib/pinAuth';
import VentasPOS from './views/VentasPOS';
import ProduccionLotes from './views/ProduccionLotes';
import Inventario from './views/Inventario';
import Caja from './views/Caja';
import CatalogoCostos from './views/CatalogoCostos';
import PlanificadorPedido from './views/PlanificadorPedido';

const STYLE_INJECT = `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
.berna-f,.berna-f *,.berna-f input,.berna-f select,.berna-f textarea{font-family:'Outfit',sans-serif!important;}`;

function NumPad({ value, onChange, onSubmit, loading }) {
  const press = d => {
    if (loading) return;
    if (d === '⌫') { onChange(value.slice(0, -1)); return; }
    if (value.length >= 4) return;
    const n = value + d;
    onChange(n);
    if (n.length === 4) onSubmit(n);
  };
  return (
    <div className="w-full select-none">
      <div className="flex justify-center gap-5 mb-7">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${i < value.length ? 'bg-slate-900 scale-125' : 'bg-slate-200'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) =>
          d === '' ? <div key={i} /> :
          <button key={d} onPointerDown={e => { e.preventDefault(); press(d); }} disabled={loading}
            className={`h-14 rounded-2xl font-bold text-xl transition-all active:scale-95 ${d === '⌫' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}>
            {d}
          </button>
        )}
      </div>
    </div>
  );
}

class EB extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (this.state.e) return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="font-black mb-2">Error</p>
        <button onClick={() => { this.setState({ e: null }); window.location.reload(); }}
          className="px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl">Recargar</button>
      </div>
    );
    return this.props.children;
  }
}

const IC = ({ d, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

function FabricaLayout({ usuario, logout }) {
  const [v, setV]     = useState('produccion');
  const [col, setCol] = useState(false);

  const nav = [
    { k:'produccion',  l:'Producción',  i:'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12' },
    { k:'catalogo',    l:'Catálogo',    i:'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
    { k:'planificador',l:'Planificador',i:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
  ];

  const sideW = col ? 64 : 220;

  return (
    <div className="berna-f w-full max-w-full overflow-x-hidden flex" style={{ background:'#faf9f7' }}>
      <style>{STYLE_INJECT}</style>
      <aside className="fixed top-0 left-0 h-screen z-40 flex-col transition-all duration-300 hidden md:flex"
             style={{ width: sideW, background:'#1c1f26' }}>
        <button onClick={() => setCol(!col)}
          className="absolute -right-3 top-6 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm z-50">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
            <path d={col ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
          </svg>
        </button>
        <div className={`px-5 pt-5 pb-6 ${col ? 'text-center px-2' : ''}`}>
          <div className={`font-black text-white ${col ? 'text-lg' : 'text-xl'}`}>{col ? 'B' : 'BERNA'}</div>
          {!col && <div className="text-[10px] text-white/25 tracking-[0.3em] uppercase mt-0.5">Fábrica</div>}
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {nav.map(n => (
            <button key={n.k} onClick={() => setV(n.k)} title={col ? n.l : ''}
              className={`w-full flex items-center gap-3 rounded-xl transition-all
                ${col ? 'justify-center px-2 py-3' : 'px-4 py-3'}
                ${v === n.k ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5'}`}>
              <IC d={n.i} />
              {!col && <span className="text-[13px] font-medium">{n.l}</span>}
            </button>
          ))}
        </nav>
        <div className="px-2 pb-4">
          {!col && (
            <div className="border-t border-white/10 mx-2 pt-3 mb-2">
              <p className="text-[11px] text-white/20 px-2">{usuario?.nombre || 'Fábrica'}</p>
            </div>
          )}
          <button onClick={logout}
            className={`w-full flex items-center gap-3 rounded-xl text-white/25 hover:text-red-400 hover:bg-white/5 transition-all
              ${col ? 'justify-center px-2 py-3' : 'px-4 py-2.5'}`}>
            <IC d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            {!col && <span className="text-[13px]">Salir</span>}
          </button>
        </div>
      </aside>
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/10"
           style={{ background:'#1c1f26', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {nav.map(n => (
            <button key={n.k} onClick={() => setV(n.k)}
              className={`flex-1 py-3.5 flex flex-col items-center gap-1.5 transition-colors
                ${v === n.k ? 'text-white' : 'text-white/35 active:text-white/60'}`}>
              <IC d={n.i} s={22} />
              <span className="text-[11px] font-semibold leading-none">{n.l}</span>
            </button>
          ))}
          <button onClick={logout}
            className="px-4 py-3.5 flex flex-col items-center gap-1.5 text-white/25 active:text-red-400 transition-colors border-l border-white/10">
            <IC d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" s={22} />
            <span className="text-[11px] font-semibold leading-none">Salir</span>
          </button>
        </div>
      </div>
      <main className="flex-1 w-full max-w-full overflow-x-hidden transition-all duration-300 pb-[72px] md:pb-0"
            style={{ marginLeft: 0 }}>
        <div className="hidden md:block transition-all duration-300" style={{ width: sideW, position:'fixed', pointerEvents:'none' }} />
        <div className="hidden md:block transition-all duration-300" style={{ marginLeft: sideW }} />
        <div className="md:transition-all md:duration-300" style={{ '--sidebar-w': `${sideW}px` }}>
          <style>{`.berna-main-content { margin-left: 0; width: 100%; max-width: 100%; overflow-x: hidden; } @media (min-width: 768px) { .berna-main-content { margin-left: var(--sidebar-w, ${sideW}px); width: auto; max-width: none; } }`}</style>
          <div className="berna-main-content">
            <EB>
              {v === 'produccion'  && <ProduccionLotes  usuario={usuario} logout={() => {}} />}
              {v === 'catalogo'    && <CatalogoCostos   usuario={usuario} />}
              {v === 'planificador'&& <PlanificadorPedido usuario={usuario} />}
            </EB>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Login / selector de tienda ────────────────────────────────────────────── */
const SK = 'berna_session';

export default function App() {
  const [usuario,        setUsuario]        = useState(null);
  const [iniciando,      setIniciando]      = useState(true);
  const [cargandoApp,    setCargandoApp]    = useState(false);
  const [pin,            setPin]            = useState('');
  const [paso,           setPaso]           = useState('inicio');
  const [tiendaData,     setTiendaData]     = useState(null);
  const [error,          setError]          = useState('');
  const [cargando,       setCargando]       = useState(false);
  const [tiendas,        setTiendas]        = useState([]);
  const [tiendasAbiertas,setTiendasAbiertas]= useState(new Set());
  const [vistaTienda,    setVistaTienda]    = useState('pos');
  const [personas,       setPersonas]       = useState([]);
  const [vendedorSel,    setVendedorSel]    = useState(null);
  const [sesionesActivas,setSesionesActivas]= useState({});

  // ── Multi-tienda: long-press selection ──────────────────────────────────
  const [tiendasSel,     setTiendasSel]     = useState([]); // ids seleccionados por long-press
  const [modoMulti,      setModoMulti]      = useState(false); // activo cuando hay ≥1 long-press
  const longPressTimer   = useRef(null);
  const longPressId      = useRef(null);

  // ── Tienda activa para Caja (la que VentasPOS reporta) ─────────────────
  const [cajaUbicacionId, setCajaUbicacionId] = useState(null);

  useEffect(() => {
    const init = async () => {
      try { const s = localStorage.getItem(SK); if (s) setUsuario(JSON.parse(s)); } catch {}
      try {
        const { data } = await supabase.from('ubicaciones').select('id_ubicacion,nombre,pin,rol').eq('activa', true).neq('rol','Fabrica').order('nombre');
        setTiendas(data || []);
        if (data?.length) {
          const ids = data.map(t => t.id_ubicacion);
          const { data: cajas } = await supabase.from('cajas').select('id_ubicacion').in('id_ubicacion', ids).is('fecha_cierre', null);
          setTiendasAbiertas(new Set((cajas || []).map(c => c.id_ubicacion)));
          try {
            const hoy = new Date(new Date().toLocaleString('en-US', { timeZone:'America/Lima' }));
            hoy.setHours(0,0,0,0);
            const ini = new Date(hoy.getTime() + 5*60*60*1000).toISOString();
            const esV = d => !d?.includes('Apertura caja') && !d?.includes('Cierre #') && !d?.includes('fábrica') && !d?.includes('Acceso');
            const eSid = d => { const m = d?.match(/\[sid:([^\]]+)\]/); return m ? m[1] : null; };
            const calc = logs => {
              const lv = (logs || []).filter(l => esV(l.detalles));
              const s = {};
              lv.forEach(l => {
                const sid = eSid(l.detalles);
                const k = sid ? 'sid:'+sid : l.id_ubicacion+'-'+(l.id_persona ?? l.detalles);
                if (!s[k]) s[k] = { logins:[], logouts:[] };
                if (l.accion === 'login')  s[k].logins.push(l);
                if (l.accion === 'logout') s[k].logouts.push(l);
              });
              const a = {};
              Object.values(s).forEach(({ logins, logouts }) => {
                if (!logins.length || logouts.length > 0) return;
                const l = logins[0];
                const n = l.detalles?.split(' en ')?.[0]?.trim().replace(/\s*\[sid:[^\]]+\]/,'') || '';
                if (!n || n.length > 20) return;
                if (!a[l.id_ubicacion]) a[l.id_ubicacion] = [];
                if (!a[l.id_ubicacion].includes(n)) a[l.id_ubicacion].push(n);
              });
              return a;
            };
            const f2 = async () => {
              const { data: logs } = await supabase.from('log_sesiones').select('id_ubicacion,accion,id_persona,detalles,timestamp').in('id_ubicacion', ids).gte('timestamp', ini).order('timestamp', { ascending:false });
              setSesionesActivas(calc(logs));
            };
            await f2();
            supabase.channel('presencia').on('postgres_changes', { event:'*', schema:'public', table:'log_sesiones' }, f2).subscribe();
          } catch {}
        }
      } catch {}
      setIniciando(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (vistaTienda === 'caja' && usuario?.puede_ver_caja !== true) {
      setVistaTienda('pos');
    }
  }, [vistaTienda, usuario?.puede_ver_caja]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-xl font-black text-slate-900">Falta configuración de Supabase</h1>
          <p className="text-sm text-slate-600">
            En Vercel, abre el proyecto → <strong>Settings</strong> → <strong>Environment Variables</strong> y define:
          </p>
          <ul className="text-left text-sm text-slate-700 font-mono bg-slate-50 rounded-xl p-4 space-y-2">
            <li><code className="text-slate-900">VITE_SUPABASE_URL</code></li>
            <li><code className="text-slate-900">VITE_SUPABASE_ANON_KEY</code></li>
          </ul>
          <p className="text-xs text-slate-500">Guarda las variables y vuelve a desplegar (<strong>Redeploy</strong>) para que el build las incluya.</p>
        </div>
      </div>
    );
  }

  const guardarSesion = u => { try { localStorage.setItem(SK, JSON.stringify(u)); } catch {} };
  const cargarP = async () => {
    let p;
    try {
      const { data: personas } = await supabase
        .from('personas_tienda')
        .select('id_persona,nombre,pin,pin_hash')
        .eq('activa', true)
        .order('nombre');
      p = personas || [];
      const ids = p.map(x => x.id_persona).filter(Boolean);
      if (ids.length) {
        const { data: cajaRows } = await supabase
          .from('permisos_persona')
          .select('id_persona')
          .eq('recurso', 'caja')
          .eq('activo', true)
          .in('id_persona', ids);
        const cajaSet = new Set((cajaRows || []).map(r => r.id_persona));
        p = p.map(row => ({ ...row, puede_ver_caja: cajaSet.has(row.id_persona) }));
      } else {
        p = p.map(row => ({ ...row, puede_ver_caja: false }));
      }
    } catch {
      const { data } = await supabase.from('personas_tienda').select('nombre').eq('activa', true).order('nombre');
      p = data?.map(x => ({ id_persona:null, nombre:x.nombre, puede_ver_caja: false }));
    }
    return p?.length ? p : [{ id_persona:null, nombre:'Naty', puede_ver_caja: false }, { id_persona:null, nombre:'Yova', puede_ver_caja: false }, { id_persona:null, nombre:'Alina', puede_ver_caja: false }, { id_persona:null, nombre:'Rotativo', puede_ver_caja: false }];
  };

  // ── Long-press handlers para selección multi-tienda ─────────────────────
  const iniciarLongPress = (t) => {
    longPressId.current = t.id_ubicacion;
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setModoMulti(true);
      setTiendasSel(prev => {
        if (prev.includes(t.id_ubicacion)) return prev;
        return [...prev, t.id_ubicacion];
      });
      longPressId.current = null;
    }, 1200);
  };

  const cancelarLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const tapTienda = async (t) => {
    cancelarLongPress();
    if (modoMulti) {
      // En modo multi: toggle selección
      setTiendasSel(prev => {
        if (prev.includes(t.id_ubicacion)) {
          const next = prev.filter(id => id !== t.id_ubicacion);
          if (next.length === 0) setModoMulti(false);
          return next;
        }
        return [...prev, t.id_ubicacion];
      });
    } else {
      // Tap normal: ir a seleccionar vendedora (1 sola tienda)
      selTienda(t);
    }
  };

  const confirmarMultiTienda = async () => {
    if (!tiendasSel.length) return;
    setCargando(true);
    try {
      setPersonas(await cargarP());
      setTiendaData(null); // no hay una sola tienda principal en el paso vendedor
      setPaso('vendedor_multi');
    } catch { setError('Error'); }
    finally { setCargando(false); }
  };

  const selTienda = async t => {
    setCargando(true);
    try { setPersonas(await cargarP()); setTiendaData(t); setPaso('vendedor'); }
    catch { setError('Error'); }
    finally { setCargando(false); }
  };

  const verPin = async v => {
    setCargando(true); setError('');
    try {
      const { data } = await supabase.from('ubicaciones').select('*').eq('pin', v).eq('activa', true).single();
      if (data) {
        if (data.rol === 'Fabrica') {
          await supabase.from('log_sesiones').insert([{ id_ubicacion:data.id_ubicacion, accion:'login', detalles:'Acceso fábrica' }]);
          guardarSesion(data); setUsuario(data);
          if (navigator.vibrate) navigator.vibrate(40);
        } else {
          setPersonas(await cargarP()); setTiendaData(data); setPaso('vendedor'); setPin('');
        }
      } else {
        setError('PIN incorrecto'); setPin('');
        if (navigator.vibrate) navigator.vibrate([100,50,100]);
      }
    } catch { setError('Error'); setPin(''); }
    finally { setCargando(false); }
  };

  const selVend = p => {
    const pin2 = typeof p === 'object' ? (p.pin || p.pin_hash) : null;
    if (pin2) { setVendedorSel(p); setPin(''); setError(''); setPaso('vendedor_pin'); }
    else completarLogin(p);
  };

  // ── selVend para multi-tienda (desde vendedor_multi) ──────────────────
  const selVendMulti = p => {
    const pin2 = typeof p === 'object' ? (p.pin || p.pin_hash) : null;
    if (pin2) { setVendedorSel(p); setPin(''); setError(''); setPaso('vendedor_pin_multi'); }
    else completarLoginMulti(p);
  };

  const completarLogin = async p => {
    const n = typeof p === 'string' ? p : p.nombre;
    const id = typeof p === 'string' ? null : p.id_persona;
    const puedeCaja = typeof p === 'object' && p ? p.puede_ver_caja === true : false;
    const sid = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const u = { ...tiendaData, nombre_display:n, id_persona:id, session_id:sid, puede_ver_caja: puedeCaja };
    try { await supabase.from('log_sesiones').insert([{ id_ubicacion:tiendaData.id_ubicacion, id_persona:id||null, accion:'login', detalles:`${n} en ${tiendaData.nombre} [sid:${sid}]` }]); } catch {}
    guardarSesion(u);
    setCargandoApp(true); setUsuario(u);
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(() => setCargandoApp(false), 800);
  };

  const completarLoginMulti = async p => {
    const persona = p;
    const n = typeof persona === 'string' ? persona : persona.nombre;
    const id = typeof persona === 'string' ? null : persona.id_persona;

    const tiendasData = tiendas.filter(t => tiendasSel.includes(t.id_ubicacion));
    const sessionIds = {};

    for (const t of tiendasData) {
      const sid = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      sessionIds[t.id_ubicacion] = sid;
      try {
        await supabase.from('log_sesiones').insert([{
          id_ubicacion: t.id_ubicacion,
          id_persona: id || null,
          accion: 'login',
          detalles: `${n} en ${t.nombre} [sid:${sid}]`
        }]);
      } catch {}
    }

    const principal = tiendasData[0];
    const puedeCaja = persona?.puede_ver_caja === true;
    const u = {
      ...principal,
      nombre_display: n,
      id_persona: id,
      puede_ver_caja: puedeCaja,
      session_id: sessionIds[principal.id_ubicacion],
      multi_tiendas: tiendasData.map(t => ({
        id_ubicacion: t.id_ubicacion,
        nombre: t.nombre,
        pin: t.pin,
        rol: t.rol,
        session_id: sessionIds[t.id_ubicacion],
      })),
      session_ids: sessionIds,
    };

    guardarSesion(u);
    setCargandoApp(true); setUsuario(u);
    setModoMulti(false); setTiendasSel([]);
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(() => setCargandoApp(false), 800);
  };

  const verPinV = async v => {
    if (!vendedorSel) return;
    const row = typeof vendedorSel === 'object' ? vendedorSel : null;
    const ok = row ? await verifyPersonaPin(row, v) : false;
    if (ok) completarLogin(vendedorSel);
    else { setError('PIN incorrecto'); setPin(''); if (navigator.vibrate) navigator.vibrate([100,50,100]); }
  };

  const verPinVMulti = async v => {
    if (!vendedorSel) return;
    const row = typeof vendedorSel === 'object' ? vendedorSel : null;
    const ok = row ? await verifyPersonaPin(row, v) : false;
    if (ok) completarLoginMulti(vendedorSel);
    else { setError('PIN incorrecto'); setPin(''); if (navigator.vibrate) navigator.vibrate([100,50,100]); }
  };

  const logout = async () => {
    if (usuario) {
      const multiTiendas = usuario.multi_tiendas || [];
      if (multiTiendas.length > 1) {
        for (const t of multiTiendas) {
          try {
            const sid = t.session_id ? ` [sid:${t.session_id}]` : '';
            await supabase.from('log_sesiones').insert([{
              id_ubicacion: t.id_ubicacion,
              id_persona: usuario.id_persona || null,
              accion: 'logout',
              detalles: `${usuario.nombre_display} salió de ${t.nombre}${sid}`
            }]);
          } catch {}
        }
      } else {
        try {
          const sid = usuario.session_id ? ` [sid:${usuario.session_id}]` : '';
          await supabase.from('log_sesiones').insert([{
            id_ubicacion: usuario.id_ubicacion,
            id_persona: usuario.id_persona || null,
            accion: 'logout',
            detalles: usuario.nombre_display
              ? `${usuario.nombre_display} salió de ${usuario.nombre}${sid}`
              : `Salida fábrica${sid}`
          }]);
        } catch {}
      }
    }
    try { localStorage.removeItem(SK); } catch {}
    setUsuario(null); setPaso('inicio'); setPin(''); setTiendaData(null);
    setPersonas([]); setVendedorSel(null); setError(''); setVistaTienda('pos');
    setTiendasSel([]); setModoMulti(false); setCajaUbicacionId(null);
  };

  // ── Pantallas de carga ──────────────────────────────────────────────────────
  if (iniciando || cargandoApp) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
      <div className="text-2xl font-black">BERNA</div>
      <div className="flex gap-1.5">
        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay:`${i*0.15}s` }} />)}
      </div>
    </div>
  );

  // ── Login ────────────────────────────────────────────────────────────────────
  if (!usuario) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[300px]">
        <div className="text-center mb-10">
          <div className="text-5xl font-black tracking-tight">BERNA</div>
          <div className="text-[10px] text-slate-300 uppercase tracking-[0.5em] mt-1">Sistema</div>
        </div>

        {paso === 'inicio' && <>
          <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] text-center mb-5">
            {modoMulti ? 'Selecciona tiendas · mantén presionado' : 'Selecciona tu tienda'}
          </p>
          <div className="space-y-2.5 mb-6">
            {(tiendas.length > 0 ? tiendas : [{ id_ubicacion:null, nombre:'Cargando...' }]).map(t => {
              const sel = modoMulti && tiendasSel.includes(t.id_ubicacion);
              return (
                <button key={t.id_ubicacion}
                  onPointerDown={() => iniciarLongPress(t)}
                  onPointerUp={() => { cancelarLongPress(); if (!longPressId.current) return; tapTienda(t); }}
                  onPointerLeave={cancelarLongPress}
                  onContextMenu={e => e.preventDefault()}
                  disabled={cargando}
                  className={`w-full rounded-2xl font-black active:scale-[0.97] transition-all px-5 py-3.5 text-left border-2 ${
                    sel
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-900 hover:bg-slate-900 hover:text-white'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{t.nombre}</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tiendasAbiertas.has(t.id_ubicacion) ? 'bg-green-500' : sel ? 'bg-red-300' : 'bg-red-400'}`} />
                      {sel && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </div>
                  </div>
                  {sesionesActivas[t.id_ubicacion]?.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {sesionesActivas[t.id_ubicacion].map(n => (
                        <span key={n} className={`text-[10px] font-bold px-2 py-0.5 rounded-full normal-case tracking-normal ${
                          sel ? 'bg-white/20 text-white/80' : 'bg-green-100 text-green-700'
                        }`}>{n}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Botón confirmar multi-tienda (solo aparece cuando hay selección) */}
          {modoMulti && tiendasSel.length > 0 && (
            <button onClick={confirmarMultiTienda} disabled={cargando}
              className="w-full py-4 bg-slate-900 text-white font-black text-base rounded-2xl active:scale-[0.98] transition-all mb-3">
              {cargando ? 'Cargando...' : `Entrar a ${tiendasSel.length} tienda${tiendasSel.length > 1 ? 's' : ''}`}
            </button>
          )}
          {modoMulti && (
            <button onClick={() => { setModoMulti(false); setTiendasSel([]); }}
              className="w-full py-2 text-xs text-slate-400 mb-3">Cancelar selección</button>
          )}

          <button onClick={() => { setPaso('produccion_pin'); setPin(''); setError(''); }}
            className="w-full py-3 rounded-2xl text-sm font-bold text-slate-400 border border-slate-200 hover:border-slate-400 active:scale-95 transition-all">
            Producción
          </button>
        </>}

        {paso === 'produccion_pin' && <>
          <p className="text-center text-[10px] text-slate-400 uppercase tracking-[0.3em] mb-6">PIN de producción</p>
          <NumPad value={pin} onChange={v => { setPin(v); setError(''); }} onSubmit={verPin} loading={cargando} />
          {cargando && <p className="mt-5 text-center text-xs text-slate-400 animate-pulse">Verificando...</p>}
          <button onClick={() => { setPaso('inicio'); setPin(''); setError(''); }} className="w-full py-2 mt-4 text-xs text-slate-400">← Volver</button>
        </>}

        {/* Vendedor para 1 sola tienda */}
        {paso === 'vendedor' && tiendaData && <>
          <div className="text-center mb-6">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{tiendaData.nombre}</div>
            <h2 className="text-xl font-black">¿Quién eres?</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {personas.map(p => {
              const n = typeof p === 'string' ? p : p.nombre;
              return (
                <button key={n} onClick={() => selVend(p)}
                  className="py-4 border-2 border-slate-900 rounded-2xl font-bold hover:bg-slate-900 hover:text-white active:scale-95 transition-all">
                  {n}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setPaso('inicio'); setPin(''); setTiendaData(null); }} className="w-full py-2 text-xs text-slate-400">← Volver</button>
        </>}

        {/* Vendedor para multi-tienda */}
        {paso === 'vendedor_multi' && <>
          <div className="text-center mb-6">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">
              {tiendasSel.length} tiendas seleccionadas
            </div>
            <h2 className="text-xl font-black">¿Quién eres?</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {personas.map(p => {
              const n = typeof p === 'string' ? p : p.nombre;
              return (
                <button key={n} onClick={() => selVendMulti(p)}
                  className="py-4 border-2 border-slate-900 rounded-2xl font-bold hover:bg-slate-900 hover:text-white active:scale-95 transition-all">
                  {n}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setPaso('inicio'); setTiendasSel([]); setModoMulti(false); }} className="w-full py-2 text-xs text-slate-400">← Volver</button>
        </>}

        {paso === 'vendedor_pin' && vendedorSel && <>
          <div className="text-center mb-6">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{tiendaData?.nombre}</div>
            <h2 className="text-xl font-black">{typeof vendedorSel === 'object' ? vendedorSel.nombre : vendedorSel}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] mt-1">Tu PIN</p>
          </div>
          <NumPad value={pin} onChange={v => { setPin(v); setError(''); }} onSubmit={verPinV} loading={cargando} />
          <button onClick={() => { setPaso('vendedor'); setPin(''); setVendedorSel(null); setError(''); }} className="w-full py-2 mt-4 text-xs text-slate-400">← Volver</button>
        </>}

        {paso === 'vendedor_pin_multi' && vendedorSel && <>
          <div className="text-center mb-6">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">{tiendasSel.length} tiendas</div>
            <h2 className="text-xl font-black">{typeof vendedorSel === 'object' ? vendedorSel.nombre : vendedorSel}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.3em] mt-1">Tu PIN</p>
          </div>
          <NumPad value={pin} onChange={v => { setPin(v); setError(''); }} onSubmit={verPinVMulti} loading={cargando} />
          <button onClick={() => { setPaso('vendedor_multi'); setPin(''); setVendedorSel(null); setError(''); }} className="w-full py-2 mt-4 text-xs text-slate-400">← Volver</button>
        </>}

        {error && (
          <div className="mt-4 p-3 border-2 border-red-300 bg-red-50 rounded-xl text-center">
            <p className="font-bold text-red-800 text-sm">{error}</p>
          </div>
        )}
        <p className="text-center mt-10 text-[10px] text-slate-200">v5.3</p>
      </div>
    </div>
  );

  // ── Fábrica ──────────────────────────────────────────────────────────────────
  if (usuario.rol === 'Fabrica') return <FabricaLayout usuario={usuario} logout={logout} />;

  // ── Tienda ───────────────────────────────────────────────────────────────────
  const tiendasActivas = usuario.multi_tiendas && usuario.multi_tiendas.length > 1
    ? usuario.multi_tiendas
    : null;

  // Vendedora efectiva para Caja: usa la tienda que VentasPOS reporta
  const vendedoraParaCaja = cajaUbicacionId && tiendasActivas
    ? { ...usuario, id_ubicacion: cajaUbicacionId, nombre: (tiendasActivas.find(t => t.id_ubicacion === cajaUbicacionId)?.nombre || usuario.nombre) }
    : usuario;

  return (
    <EB>
      {vistaTienda === 'pos'  && (
        <VentasPOS
          vendedora={usuario}
          tiendasActivas={tiendasActivas}
          logout={logout}
          onVerInventario={() => setVistaTienda('inv')}
          onVerCaja={(idUbicacion) => { setCajaUbicacionId(idUbicacion || null); setVistaTienda('caja'); }}
        />
      )}
      {vistaTienda === 'caja' && usuario.puede_ver_caja === true && (
        <Caja vendedora={vendedoraParaCaja} logout={logout} onVolver={() => setVistaTienda('pos')} />
      )}
      {vistaTienda === 'inv'  && <Inventario vendedora={usuario} logout={logout} onVolver={() => setVistaTienda('pos')} />}
    </EB>
  );
}