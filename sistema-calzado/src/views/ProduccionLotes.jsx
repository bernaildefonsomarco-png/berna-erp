/* eslint-disable no-empty */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../api/supabase';
import { jsPDF } from 'jspdf';
import bwipjs from 'bwip-js';
import { listarCostosMaterialesModelo, indexarCostosMateriales, obtenerCostoMaterial } from './finanzas/lib/materialCostos';

// ─── Constantes ───────────────────────────────────────────────────────────────
const SERIES = {
  pequena: {
    label: 'Pequeña', sub: '27–32',
    tallas: [
      { talla:27, cant:2 }, { talla:28, cant:2 }, { talla:29, cant:2 },
      { talla:30, cant:2 }, { talla:31, cant:2 }, { talla:32, cant:2 },
    ],
  },
  mediana: {
    label: 'Mediana', sub: '34–39',
    tallas: [
      { talla:34, cant:1 }, { talla:35, cant:1 }, { talla:36, cant:3 },
      { talla:37, cant:4 }, { talla:38, cant:2 }, { talla:39, cant:1 },
    ],
  },
  grande: {
    label: 'Grande', sub: '38–43',
    tallas: [
      { talla:38, cant:1 }, { talla:39, cant:2 }, { talla:40, cant:3 },
      { talla:41, cant:2 }, { talla:42, cant:2 }, { talla:43, cant:2 },
    ],
  },
  personalizado: { label: 'Personal.', sub: 'libre', tallas: [] },
};
const PARES_X_SERIE = 12;
const SERIE_ID_MAP  = { pequena: 1, mediana: 7, grande: 13, personalizado: null };
const PRECIO_BASE   = { grande: 'precio_grande',          mediana: 'precio_mediana',          pequena: 'precio_chica'           };
const PRECIO_ESP    = { grande: 'precio_especial_grande', mediana: 'precio_especial_mediana', pequena: 'precio_especial_chica'  };
const FILTROS_LABEL = { hoy:'Hoy', semana:'Semana', mes:'Mes', todo:'Todo' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt      = (n)  => n != null ? `S/ ${Number(n).toFixed(0)}` : '—';
const fmtFecha = (ts) => ts
  ? new Date(ts).toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'2-digit', timeZone:'America/Lima' })
  : '—';
const fmtDia   = (isoDate) => {
  if (!isoDate || isoDate === 'Sin fecha') return 'Sin fecha';
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('es-PE',
    { weekday:'long', day:'numeric', month:'short', timeZone:'America/Lima' });
};
const copiarSerie = (s) => SERIES[s].tallas.map(t => ({ ...t }));
const desdeSegun  = (f) => {
  const d = new Date();
  if (f === 'hoy')    return new Date(d.setHours(0,0,0,0)).toISOString();
  if (f === 'semana') { d.setDate(d.getDate()-7); return d.toISOString(); }
  if (f === 'mes')    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  return null;
};
const resolverPrecio = (serieKey, modelo, color) => {
  const esp  = color  ? parseFloat(color[PRECIO_ESP[serieKey]])  || 0 : 0;
  const base = modelo ? parseFloat(modelo[PRECIO_BASE[serieKey]]) || parseFloat(modelo.precio_venta_sugerido) || 0 : 0;
  return esp > 0 ? esp : base;
};
const resolverCosto = (serieKey, idProducto, idColor, costosIndex) =>
  obtenerCostoMaterial(costosIndex, {
    idProducto,
    idColor,
    serie: SERIES[serieKey]?.label,
  });
const fotoUrl = (path) => {
  try { return path ? `${supabase.supabaseUrl}/storage/v1/object/public/modelos-fotos/${path}` : null; }
  catch { return null; }
};

// ─── Helpers estado lote ──────────────────────────────────────────────────────
const totalDespachado = (lote) =>
  (lote.despachos || []).reduce((s, d) => s + (d.cantidad_despachada || 0), 0);
const estadoLote = (lote) => {
  const d = totalDespachado(lote);
  if (d === 0) return 'pendiente';
  if (d >= lote.cantidad_total) return 'despachado';
  return 'parcial';
};
const badgeEstado = (lote) => {
  const e = estadoLote(lote);
  if (e === 'despachado') return { label:'Despachado', cls:'bg-emerald-100 text-emerald-700' };
  if (e === 'parcial')    return { label:'Parcial',    cls:'bg-amber-100 text-amber-700' };
  return                         { label:'Pendiente',  cls:'bg-slate-100 text-slate-500' };
};
const lotesAgrupadosPorDia = (lotes) => {
  const dias = {};
  lotes.forEach(l => {
    const dia = l.fecha_produccion?.split('T')[0] || 'Sin fecha';
    if (!dias[dia]) dias[dia] = [];
    dias[dia].push(l);
  });
  return Object.entries(dias).sort((a,b) => b[0].localeCompare(a[0]));
};

// ─── Generar PDF ──────────────────────────────────────────────────────────────
const generarPDF = async (items, modelo, marca, idLote, color, total) => {
  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const porTalla = {};
  items.forEach(i => { porTalla[i.talla] = (porTalla[i.talla] || 0) + 1; });

  const dibujarCabecera = () => {
    pdf.setFont('helvetica','bold'); pdf.setFontSize(14);
    pdf.text(`LOTE-${idLote}`, 10, 10);
    pdf.setFontSize(11);
    pdf.text(`${marca ? marca + '  ·  ' : ''}${modelo}  ·  ${color}`, 32, 10);
    pdf.setDrawColor(160); pdf.setLineWidth(0.3);
    pdf.line(10, 14, 200, 14);
  };
  dibujarCabecera();

  const CW = 31, RH = 22, COLS = 6, ROWS = 12, POR_PAG = COLS * ROWS;
  const MX = 10, MY = 17, QR = 18;
  let idx = 0;
  const itemsDobles = items.flatMap(item => [item, item]);

  for (const item of itemsDobles) {
    if (idx > 0 && idx % POR_PAG === 0) { pdf.addPage(); dibujarCabecera(); }
    const col = idx % COLS;
    const row = Math.floor((idx % POR_PAG) / COLS);
    const x = MX + col * CW, y = MY + row * RH;
    try {
      const canvas = document.createElement('canvas');
      bwipjs.toCanvas(canvas, { bcid:'qrcode', text:item.sku_id, scale:4, eclevel:'M' });
      pdf.setDrawColor(220); pdf.setLineWidth(0.15);
      pdf.rect(x, y, CW, RH);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x + CW - QR - 1, y + (RH - QR) / 2, QR, QR);
      if (marca) {
        pdf.setFont('helvetica','normal'); pdf.setFontSize(4.5); pdf.setTextColor(140);
        pdf.text(marca.toUpperCase(), x + 2, y + 4.5);
      }
      pdf.setFont('helvetica','bold'); pdf.setFontSize(17); pdf.setTextColor(15);
      pdf.text(String(item.talla), x + 2, y + RH/2 + 4);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(4.5); pdf.setTextColor(150);
      pdf.text(`L${idLote}`, x + CW - QR - 1 + QR / 2, y + RH - 1, { align:'center', maxWidth: QR });
      pdf.setTextColor(0);
    } catch(e) { console.error('QR:', e); }
    idx++;
  }
  pdf.save(`Lote_${idLote}_${modelo}_${color}.pdf`);
};

// ─── Tab Bar v5 ───────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [['crear','Crear'],['despachar','Envío'],['historial','Historial'],['stats','Stats']];
  return (
    <div className="flex bg-slate-100 rounded-2xl p-1 gap-1 overflow-x-auto" style={{ scrollbarWidth:'none' }}>
      {tabs.map(([k,l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`flex-1 min-w-[60px] py-2.5 text-sm font-black rounded-xl transition-all whitespace-nowrap ${
            active === k
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}>{l}
        </button>
      ))}
    </div>
  );
}

// ─── Paso Indicador ───────────────────────────────────────────────────────────
function PasoIndicador({ paso }) {
  const pasos = ['Modelo','Color','Serie','Docenas'];
  const idx   = pasos.findIndex(p => p.toLowerCase() === paso.toLowerCase());
  return (
    <div className="flex items-center gap-1 mb-6">
      {pasos.map((p, i) => (
        <React.Fragment key={p}>
          <div className={`flex items-center gap-1.5 transition-opacity ${i <= idx ? 'opacity-100' : 'opacity-25'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all
              ${i < idx  ? 'bg-slate-800 text-white' :
                i === idx ? 'bg-slate-800 text-white ring-4 ring-amber-100' :
                             'bg-slate-100 text-slate-400'}`}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest hidden sm:block
              ${i === idx ? 'text-slate-900' : 'text-slate-400'}`}>{p}</span>
          </div>
          {i < pasos.length - 1 && (
            <div className={`flex-1 h-px transition-colors ${i < idx ? 'bg-slate-800' : 'bg-slate-100'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Modal Despacho ───────────────────────────────────────────────────────────
function ModalDespacho({ lote, usuario, tiendas, onClose, onDespachado }) {
  const [tiendaDest,  setTiendaDest]  = useState('');
  const [stockLote,   setStockLote]   = useState(null);
  const [modo,        setModo]        = useState('todo');
  const [cantDesp,    setCantDesp]    = useState('');
  const [selTallas,   setSelTallas]   = useState({});
  const [despachando, setDespachando] = useState(false);
  const [cargando,    setCargando]    = useState(true);

  useEffect(() => { cargarStock(); }, []);

  const cargarStock = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('inventario').select('sku_id, id_ubicacion, talla')
      .eq('id_lote', lote.id_lote).eq('estado', 'Disponible')
      .eq('id_ubicacion', usuario.id_ubicacion);
    const porTalla = {};
    (data||[]).forEach(i => {
      if (!porTalla[i.talla]) porTalla[i.talla] = [];
      porTalla[i.talla].push(i.sku_id);
    });
    setStockLote({ enFabrica: (data||[]).length, porTalla });
    setCargando(false);
  };

  const totalSelTallas = Object.values(selTallas).reduce((s,n) => s + n, 0);
  const skusADespachar = () => {
    if (!stockLote) return [];
    if (modo === 'todo')    return Object.values(stockLote.porTalla).flat();
    if (modo === 'docenas') return Object.values(stockLote.porTalla).flat().slice(0, Number(cantDesp)||0);
    const skus = [];
    Object.entries(selTallas).forEach(([talla, n]) => {
      if (n > 0 && stockLote.porTalla[talla]) skus.push(...stockLote.porTalla[talla].slice(0, n));
    });
    return skus;
  };
  const cantidadADespachar = () => {
    if (modo === 'todo')    return stockLote?.enFabrica || 0;
    if (modo === 'docenas') return Number(cantDesp) || 0;
    return totalSelTallas;
  };

  const ejecutar = async () => {
    if (!tiendaDest) { alert('Selecciona tienda'); return; }
    const skus = skusADespachar();
    if (!skus.length) { alert('Selecciona qué pares despachar'); return; }
    setDespachando(true);
    try {
      await supabase.from('inventario').update({ id_ubicacion: tiendaDest.id_ubicacion }).in('sku_id', skus);
      await supabase.from('despachos').insert([{
        id_lote: lote.id_lote, id_ubicacion: tiendaDest.id_ubicacion,
        id_ubicacion_origen: usuario.id_ubicacion, cantidad_despachada: skus.length,
        nombre_tienda: tiendaDest.nombre, fecha_despacho: new Date().toISOString(),
      }]);
      onDespachado(skus.length, tiendaDest.nombre);
      onClose();
    } catch(e) { alert('Error: ' + e.message); }
    finally    { setDespachando(false); }
  };

  const docenasDisponibles = stockLote ? Math.floor(stockLote.enFabrica / PARES_X_SERIE) : 0;
  const tallasOrdenadas = stockLote
    ? Object.entries(stockLote.porTalla).sort((a,b) => Number(a[0]) - Number(b[0]))
    : [];

  const marcaNombre = lote.productos?.categorias?.nombre_categoria || '';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-black/5">
          <div>
            <h3 className="text-base font-black text-slate-900">Despachar · #{lote.id_lote}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {marcaNombre && <span className="font-semibold text-slate-500">{marcaNombre} · </span>}
              {lote.productos?.nombre_modelo} · {lote.descripcion}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 text-xl transition-colors rounded-xl hover:bg-slate-100">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4 pb-8">
          {cargando ? (
            <div className="text-center py-8 text-slate-300 text-sm animate-pulse font-medium">Cargando stock...</div>
          ) : stockLote.enFabrica === 0 ? (
            <div className="text-center py-8 text-red-400 font-bold text-sm">Sin pares disponibles en fábrica</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {tallasOrdenadas.map(([talla, skus]) => (
                  <span key={talla} className="text-sm font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg">T{talla} · {skus.length}p</span>
                ))}
                <span className="text-sm font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg ml-auto">{stockLote.enFabrica} total</span>
              </div>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Tienda destino</p>
                <div className="grid grid-cols-3 gap-2">
                  {tiendas.map(t => (
                    <button key={t.id_ubicacion} onClick={() => setTiendaDest(t)}
                      className={`py-2.5 text-sm font-bold rounded-xl border-2 transition-all active:scale-95 ${
                        tiendaDest?.id_ubicacion === t.id_ubicacion
                          ? 'border-slate-800 bg-slate-800 text-white'
                          : 'border-black/10 text-slate-600 hover:border-amber-400'
                      }`}>{t.nombre}
                    </button>
                  ))}
                </div>
              </div>
              {tiendaDest && (
                <>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">¿Qué despachar?</p>
                    <div className="flex gap-2">
                      {[['todo','Todo'],['docenas','Docenas'],['tallas','Por talla']].map(([m,label]) => (
                        <button key={m} onClick={() => { setModo(m); setCantDesp(''); setSelTallas({}); }}
                          className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 transition-all ${
                            modo === m ? 'border-slate-800 bg-slate-800 text-white' : 'border-black/10 text-slate-500 hover:border-amber-400'
                          }`}>{label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {modo === 'todo' && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-center">
                      <p className="text-sm font-bold text-emerald-800">
                        Se despacharán todos los <span className="text-xl font-black">{stockLote.enFabrica}</span> pares
                      </p>
                      <div className="flex flex-wrap gap-1 justify-center mt-2">
                        {tallasOrdenadas.map(([t, skus]) => (
                          <span key={t} className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-lg">T{t}×{skus.length}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {modo === 'docenas' && (
                    <div className="flex gap-2 flex-wrap">
                      {docenasDisponibles === 0 ? (
                        <p className="text-xs text-slate-400 py-2">No hay docenas completas</p>
                      ) : Array.from({ length: Math.min(docenasDisponibles, 8) }, (_,i) => i+1).map(n => {
                        const pares = n * PARES_X_SERIE;
                        return (
                          <button key={n} onClick={() => setCantDesp(String(pares))}
                            className={`flex-1 min-w-[3.5rem] py-3 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                              cantDesp === String(pares) ? 'border-slate-800 bg-slate-800 text-white' : 'border-black/10 text-slate-600 hover:border-amber-400'
                            }`}>
                            {n}<span className="text-xs font-normal opacity-70">doc</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {modo === 'tallas' && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400">Elige cuántos pares de cada talla</p>
                      {tallasOrdenadas.map(([talla, skus]) => {
                        const sel = selTallas[talla] || 0;
                        return (
                          <div key={talla} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
                            sel > 0 ? 'border-amber-300 bg-amber-50' : 'border-black/5 bg-white'
                          }`}>
                            <div className="flex-1">
                              <span className="font-black text-base">T{talla}</span>
                              <span className="text-xs text-slate-400 ml-2">máx. {skus.length}p</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setSelTallas(p => ({ ...p, [talla]: Math.max(0,(p[talla]||0)-1) }))}
                                disabled={sel===0} className="w-8 h-8 rounded-lg border border-black/10 font-bold text-base flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all hover:border-slate-400">−</button>
                              <span className={`w-8 text-center font-black text-base ${sel > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{sel}</span>
                              <button onClick={() => setSelTallas(p => ({ ...p, [talla]: Math.min(skus.length,(p[talla]||0)+1) }))}
                                disabled={sel===skus.length} className="w-8 h-8 rounded-lg border border-black/10 font-bold text-base flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all hover:border-slate-400">+</button>
                            </div>
                          </div>
                        );
                      })}
                      {totalSelTallas > 0 && (
                        <div className="flex justify-between items-center px-1 pt-1">
                          <span className="text-xs text-slate-500">Total seleccionado</span>
                          <span className="font-black text-base">{totalSelTallas} pares</span>
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={ejecutar} disabled={despachando || cantidadADespachar() === 0}
                    className="w-full py-4 font-black text-sm rounded-2xl bg-slate-800 text-white active:scale-[0.98] transition-all disabled:opacity-30">
                    {despachando ? 'Despachando...'
                      : cantidadADespachar() === 0 ? 'Selecciona qué despachar'
                      : `Despachar ${cantidadADespachar()} pares → ${tiendaDest.nombre}`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PANEL CREAR ──────────────────────────────────────────────────────────────
function CrearPanel({ usuario, productos, coloresModelo, setColoresModelo, onLoteCreado }) {
  const [paso,         setPaso]         = useState('modelo');
  const [form,         setForm]         = useState({ id_producto:'', color:'', docenas:1, serie:'mediana' });
  const [tallasCustom, setTallasCustom] = useState(copiarSerie('mediana'));
  const [marcaSel,     setMarcaSel]     = useState('');
  const [busqueda,     setBusqueda]     = useState('');
  const [creando,      setCreando]      = useState(false);
  const [exito,        setExito]        = useState('');
  const [error,        setError]        = useState('');
  const [modalNuevoProd,  setModalNuevoProd]  = useState(false);
  const [nuevoProd,       setNuevoProd]       = useState({ marca:'', modelo:'', serie:'', precio:'', color:'' });
  const [guardandoProd,   setGuardandoProd]   = useState(false);
  const [costosMateriales, setCostosMateriales] = useState([]);

  const cambiarSerie = (s) => {
    setForm(p => ({...p, serie:s}));
    if (s !== 'personalizado') setTallasCustom(copiarSerie(s));
  };

  useEffect(() => {
    if (!form.id_producto) { setColoresModelo([]); setCostosMateriales([]); return; }
    Promise.all([
      supabase.from('colores_modelos')
        .select('id_color, color, foto_url, precio_especial_grande, precio_especial_mediana, precio_especial_chica')
        .eq('id_producto', form.id_producto)
        .eq('estado', 'Activo')
        .order('color'),
      listarCostosMaterialesModelo({ idProducto: form.id_producto, soloActivos: true }),
    ]).then(([coloresResp, costosResp]) => {
      setColoresModelo(coloresResp.data || []);
      setCostosMateriales(costosResp || []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id_producto]);

  const tallasActivas = useMemo(() => {
    if (form.serie === 'personalizado') return tallasCustom.filter(t => t.cant > 0);
    return SERIES[form.serie].tallas.map(t => ({ talla:t.talla, cant:t.cant * form.docenas }));
  }, [form.serie, form.docenas, tallasCustom]);

  const totalPares = tallasActivas.reduce((s,t) => s + t.cant, 0);

  const modeloSel  = productos.find(p => p.id_producto === Number(form.id_producto));
  const colorSel   = coloresModelo.find(c => c.color === form.color);
  const marcaActual = modeloSel?.categorias;
  const marcaNombre = typeof marcaActual === 'object' ? marcaActual?.nombre_categoria : marcaActual || '';
  const costosMaterialesIndex = useMemo(() => indexarCostosMateriales(costosMateriales), [costosMateriales]);

  const precioActual = form.id_producto && form.serie !== 'personalizado'
    ? resolverPrecio(form.serie, modeloSel, colorSel) : null;
  const costoActual  = form.id_producto && form.serie !== 'personalizado' && colorSel
    ? resolverCosto(form.serie, modeloSel?.id_producto, colorSel.id_color, costosMaterialesIndex) : 0;
  const margenActual = precioActual && costoActual > 0 ? precioActual - costoActual : null;
  const ndoc         = parseInt(form.docenas) || 0;

  const seriesDisp = modeloSel
    ? Object.keys(SERIES).filter(k => k === 'personalizado' || (modeloSel[PRECIO_BASE[k]] ?? 0) > 0)
    : Object.keys(SERIES);

  const marcas = useMemo(() => {
    const EXCLUIR = ['prueba','pruebs','punto','vezfor'];
    const mapa = {};
    productos.forEach(p => {
      const cat = p.categorias;
      const nombre = typeof cat === 'object' ? cat?.nombre_categoria : cat;
      if (!nombre) return;
      if (EXCLUIR.some(x => nombre.toLowerCase().includes(x))) return;
      if (!mapa[nombre]) mapa[nombre] = { nombre, id_categoria: p.id_categoria, count: 0 };
      mapa[nombre].count++;
    });
    return Object.values(mapa).sort((a,b) => b.count - a.count);
  }, [productos]);

  const modelosFiltrados = useMemo(() => productos.filter(p => {
    if (p.estado && p.estado !== 'Activo') return false;
    const catNombre = typeof p.categorias === 'object' ? p.categorias?.nombre_categoria : p.categorias || '';
    if (marcaSel && catNombre !== marcaSel) return false;
    if (!busqueda.trim()) return true;
    const b = busqueda.toLowerCase();
    return p.nombre_modelo?.toLowerCase().includes(b) || catNombre.toLowerCase().includes(b);
  }), [productos, marcaSel, busqueda]);

  const selModelo = (m) => {
    setForm({ id_producto: String(m.id_producto), color:'', docenas:1,
      serie: m.serie_default ? (Object.keys(SERIES).find(k => SERIES[k].label === m.serie_default) || 'mediana') : 'mediana' });
    setTallasCustom(copiarSerie('mediana'));
    setError(''); setPaso('color');
  };
  const selColor = (color) => {
    setForm(p => ({...p, color})); setError(''); setPaso('serie');
  };
  const selSerie = (k) => {
    cambiarSerie(k); setError(''); setPaso('docenas');
  };
  const volverA = (destino) => {
    setError('');
    if (destino === 'modelo') setForm({ id_producto:'', color:'', docenas:1, serie:'mediana' });
    else if (destino === 'color') setForm(p => ({...p, color:'', docenas:1, serie:'mediana'}));
    else if (destino === 'serie') setForm(p => ({...p, docenas:1, serie:'mediana'}));
    setPaso(destino);
  };

  const guardarNuevoProducto = async () => {
    const marca  = nuevoProd.marca.trim();
    const modelo = nuevoProd.modelo.trim();
    const precio = Number(nuevoProd.precio) || 0;
    if (!marca || !modelo) { alert('Escribe la marca y el modelo'); return; }
    setGuardandoProd(true);
    try {
      let idCategoria;
      const { data: catExist } = await supabase.from('categorias')
        .select('id_categoria').ilike('nombre_categoria', marca).limit(1).single();
      if (catExist) {
        idCategoria = catExist.id_categoria;
      } else {
        const { data: catNueva, error: eCat } = await supabase.from('categorias')
          .insert([{ nombre_categoria: marca }]).select().single();
        if (eCat) throw eCat;
        idCategoria = catNueva.id_categoria;
      }
      const { data: prodNuevo, error: eProd } = await supabase.from('productos').insert([{
        nombre_modelo:         modelo,
        id_categoria:          idCategoria,
        precio_venta_sugerido: precio,
        serie_default:         nuevoProd.serie || null,
        estado:                'Activo',
      }]).select('*, categorias(id_categoria, nombre_categoria)').single();
      if (eProd) throw eProd;
      selModelo(prodNuevo);
      if (nuevoProd.color.trim()) setForm(p => ({...p, color: nuevoProd.color.trim()}));
      setModalNuevoProd(false);
      setNuevoProd({ marca:'', modelo:'', serie:'', precio:'', color:'' });
    } catch(e) { alert('Error: ' + e.message); }
    finally    { setGuardandoProd(false); }
  };

  const crearLote = async () => {
    if (!form.id_producto || !form.color.trim() || totalPares === 0) {
      setError('Completa modelo, color y cantidad'); return;
    }
    setCreando(true); setError('');
    try {
      const docLabel = form.serie === 'personalizado'
        ? `${totalPares}p · ${form.color}`
        : `${ndoc}doc. ${SERIES[form.serie].label} · ${form.color}`;

      const precio = precioActual || 0;
      const costo  = costoActual  || 0;

      const { data: loteCreado, error: eLote } = await supabase.from('lotes').insert([{
        id_producto:      form.id_producto,
        descripcion:      docLabel,
        cantidad_total:   totalPares,
        fecha_produccion: new Date().toISOString(),
        estado_lote:      'Listo',
        id_ubicacion:     usuario.id_ubicacion,
        id_serie_tallas:  SERIE_ID_MAP[form.serie] || null,
        precio_unitario:  precio,
        costo_total_lote: costo * totalPares,
        nombre_tienda:    usuario.nombre,
      }]).select().single();
      if (eLote) throw eLote;

      const items = [];
      for (const { talla, cant } of tallasActivas) {
        for (let i = 0; i < cant; i++) {
          await new Promise(r => setTimeout(r, 1));
          const rand = Math.random().toString(36).substr(2,5).toUpperCase();
          items.push({
            sku_id:            `${loteCreado.id_lote}-${talla}-${Date.now()}-${rand}`,
            id_lote:           loteCreado.id_lote,
            id_producto:       form.id_producto,
            talla, color:      form.color,
            estado:            'Disponible',
            id_ubicacion:      usuario.id_ubicacion,
            fecha_produccion:  new Date().toISOString(),
            costo_fabricacion: costo > 0 ? costo : null,
            nombre_tienda:     usuario.nombre,
          });
        }
      }
      for (let i = 0; i < items.length; i += 50) {
        const { error: eI } = await supabase.from('inventario').insert(items.slice(i, i+50));
        if (eI) throw eI;
      }

      try {
        await generarPDF(items, modeloSel.nombre_modelo, marcaNombre, loteCreado.id_lote, form.color, totalPares);
      } catch(ePDF) { console.error('PDF:', ePDF); }

      setExito(`✓ ${ndoc > 0 ? ndoc + ' doc. ' : ''}${modeloSel.nombre_modelo} ${form.color} — ${totalPares} pares`);
      setTimeout(() => setExito(''), 6000);
      setForm({ id_producto:'', color:'', docenas:1, serie:'mediana' });
      setTallasCustom(copiarSerie('mediana'));
      setPaso('modelo'); setBusqueda(''); setMarcaSel('');
      onLoteCreado();
    } catch(e) { console.error(e); setError(e.message || 'Error al crear el lote.'); }
    finally    { setCreando(false); }
  };

  // ── PASO: MODELO ─────────────────────────────────────────────────────────────
  if (paso === 'modelo') return (
    <div className="space-y-4 overflow-hidden">
      {exito && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <span className="text-emerald-500 text-lg">✓</span>
          <span className="text-sm font-bold text-emerald-800">{exito}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Selecciona modelo</p>
        <button onClick={() => { setNuevoProd({ marca: marcaSel || '', modelo:'', serie:'', precio:'', color:'' }); setModalNuevoProd(true); }}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1">
          <span className="text-base leading-none">+</span> Agregar modelo
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <input type="text" placeholder="Buscar modelo o marca..."
          value={busqueda} onChange={e => { setBusqueda(e.target.value); setMarcaSel(''); }}
          className="w-full bg-white border-2 border-black/5 rounded-2xl px-4 py-3 text-sm
                     font-medium placeholder-slate-300 focus:outline-none focus:border-amber-400
                     focus:ring-4 focus:ring-amber-50 transition-all shadow-sm" />
        {busqueda && (
          <button onClick={() => setBusqueda('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 font-bold text-lg">×</button>
        )}
      </div>

      {/* Filtro de marcas */}
      {!busqueda && (
        <div className="overflow-hidden -mx-1 px-1">
          <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth:'none' }}>
          <button onClick={() => setMarcaSel('')}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all
              ${!marcaSel ? 'bg-slate-800 text-white' : 'bg-white border border-black/10 text-slate-500 hover:border-amber-400'}`}>
            Todas
          </button>
          {marcas.map(mk => (
            <button key={mk.nombre} onClick={() => setMarcaSel(marcaSel === mk.nombre ? '' : mk.nombre)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all
                ${marcaSel === mk.nombre ? 'bg-slate-800 text-white' : 'bg-white border border-black/10 text-slate-500 hover:border-amber-400'}`}>
              {mk.nombre}
            </button>
          ))}
          </div>
        </div>
      )}

      {/* Galería de modelos */}
      {modelosFiltrados.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <div className="text-5xl mb-3">○</div>
          <p className="text-xs text-slate-300 font-black uppercase tracking-widest">Sin resultados</p>
          {busqueda && (
            <button onClick={() => {
              const partes = busqueda.trim().split(' ');
              setNuevoProd({ marca: partes[0] || '', modelo: busqueda, serie:'', precio:'', color:'' });
              setModalNuevoProd(true); setBusqueda('');
            }} className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors underline">
              Agregar "{busqueda}" al catálogo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Móvil: lista 1 columna con foto al lado ── */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {modelosFiltrados.map(m => {
              const catNombre = typeof m.categorias === 'object' ? m.categorias?.nombre_categoria : m.categorias || '';
              const thumb = fotoUrl(m.foto_url);
              return (
                <button key={m.id_producto} onClick={() => selModelo(m)}
                  className="w-full text-left bg-white rounded-2xl border border-black/5 shadow-sm
                             hover:border-amber-300 active:scale-[0.98] transition-all
                             flex items-center gap-3.5 p-3.5">
                  <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
                    {thumb
                      ? <img src={thumb} alt={m.nombre_modelo} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl font-black text-slate-200">{catNombre?.slice(0,1) || '?'}</span>
                        </div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide truncate">{catNombre}</p>
                    <p className="font-black text-base text-slate-900 leading-tight truncate">{m.nombre_modelo}</p>
                  </div>
                  <span className="text-slate-300 text-xl flex-shrink-0">›</span>
                </button>
              );
            })}
          </div>

          {/* ── Desktop: grid con fotos grandes ── */}
          <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {modelosFiltrados.map(m => {
              const catNombre = typeof m.categorias === 'object' ? m.categorias?.nombre_categoria : m.categorias || '';
              const thumb = fotoUrl(m.foto_url);
              return (
                <button key={m.id_producto} onClick={() => selModelo(m)}
                  className="flex flex-col bg-white rounded-2xl border border-black/5 shadow-sm
                             hover:border-amber-300 hover:shadow-md active:scale-[0.97]
                             transition-all text-left overflow-hidden group">
                  <div className="w-full aspect-square bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
                    {thumb
                      ? <img src={thumb} alt={m.nombre_modelo} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl font-black text-slate-200">{catNombre?.slice(0,1) || '?'}</span>
                        </div>
                    }
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 truncate">{catNombre}</p>
                    <p className="font-black text-[13px] text-slate-900 leading-tight truncate">{m.nombre_modelo}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Modal nuevo producto */}
      {modalNuevoProd && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalNuevoProd(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-2"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="px-5 pb-2 border-b border-black/5">
              <p className="font-black text-base">Nuevo modelo</p>
              <p className="text-xs text-slate-400">Se agrega al catálogo permanentemente</p>
            </div>
            <div className="px-5 py-4 space-y-4 pb-8">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Marca</label>
                <input value={nuevoProd.marca} onChange={e => setNuevoProd(p => ({...p, marca:e.target.value}))}
                  placeholder="Nike, Adidas, Bata..." list="marcas-existentes" autoFocus
                  className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm font-medium transition-all" />
                <datalist id="marcas-existentes">
                  {[...new Set(productos.map(p => { const c=p.categorias; return typeof c==='object'?c?.nombre_categoria:c; }).filter(Boolean))].map(m => <option key={m} value={m} />)}
                </datalist>
                {!nuevoProd.marca && (() => {
                  const ms = [...new Set(productos.map(p => { const c=p.categorias; return typeof c==='object'?c?.nombre_categoria:c; }).filter(Boolean))].slice(0,8);
                  return ms.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ms.map(m => <button key={m} onClick={() => setNuevoProd(p=>({...p,marca:m}))}
                        className="text-[11px] font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-amber-50 hover:text-amber-700 active:scale-95 transition-all">{m}</button>)}
                    </div>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Modelo</label>
                <input value={nuevoProd.modelo} onChange={e => setNuevoProd(p => ({...p, modelo:e.target.value}))}
                  placeholder="Air Force One, Stan Smith..."
                  className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm font-medium transition-all" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Serie de tallas</label>
                <div className="grid grid-cols-4 gap-2">
                  {[{k:'pequena',l:'Pequeña'},{k:'mediana',l:'Mediana'},{k:'grande',l:'Grande'},{k:'',l:'Sin serie'}].map(({k,l}) => (
                    <button key={k} onClick={() => setNuevoProd(p=>({...p,serie:k}))}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${nuevoProd.serie===k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-black/10 hover:border-amber-400'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Color <span className="font-normal normal-case text-slate-300">(del lote que vas a crear)</span>
                </label>
                <input value={nuevoProd.color} onChange={e => setNuevoProd(p=>({...p,color:e.target.value}))}
                  placeholder="Blanco, Negro, Azul..."
                  className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm font-medium transition-all" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Precio de venta sugerido</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 border border-black/10 rounded-xl focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-50 transition-all">
                  <span className="text-sm text-slate-400 font-bold">S/</span>
                  <input type="number" inputMode="decimal" value={nuevoProd.precio}
                    onChange={e => setNuevoProd(p=>({...p,precio:e.target.value}))} placeholder="0.00"
                    className="flex-1 text-sm font-medium outline-none bg-transparent" />
                </div>
              </div>
              {nuevoProd.marca && nuevoProd.modelo && (
                <div className="px-4 py-3 bg-slate-800 text-white rounded-2xl">
                  <p className="text-xs text-slate-400">{nuevoProd.marca}</p>
                  <p className="font-bold">{nuevoProd.modelo}
                    {nuevoProd.serie && nuevoProd.serie !== '' && <span className="font-normal text-slate-400 text-sm ml-1">· {SERIES[nuevoProd.serie]?.label||''}</span>}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    {nuevoProd.color  && <p className="text-[11px] text-slate-300">{nuevoProd.color}</p>}
                    {nuevoProd.precio && <p className="text-[11px] text-slate-300 font-mono">S/{Number(nuevoProd.precio).toFixed(2)}</p>}
                  </div>
                </div>
              )}
              <button onClick={guardarNuevoProducto} disabled={guardandoProd || !nuevoProd.marca.trim() || !nuevoProd.modelo.trim()}
                className="w-full py-3.5 font-bold text-sm rounded-xl bg-slate-800 text-white disabled:opacity-40 active:scale-[0.98] transition-all">
                {guardandoProd ? 'Guardando...' : 'Guardar y continuar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── PASO: COLOR ───────────────────────────────────────────────────────────────
  if (paso === 'color') return (
    <div className="space-y-5 overflow-hidden">
      <PasoIndicador paso="color" />
      <button onClick={() => volverA('modelo')}
        className="w-full flex items-center gap-3 p-4 bg-white border border-black/5 shadow-sm rounded-2xl hover:border-amber-300 active:scale-[0.98] transition-all text-left">
        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {fotoUrl(modeloSel?.foto_url)
            ? <img src={fotoUrl(modeloSel.foto_url)} alt="" className="w-full h-full object-cover" />
            : <span className="text-white text-xs font-black">{marcaNombre?.slice(0,2).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">{marcaNombre}</p>
          <p className="font-black text-base text-slate-900 truncate">{modeloSel?.nombre_modelo}</p>
        </div>
        <span className="text-xs text-slate-400 font-bold flex-shrink-0">cambiar</span>
      </button>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Color</p>
        {coloresModelo.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {coloresModelo.map(c => {
              const thumb = fotoUrl(c.foto_url);
              const sel = form.color === c.color;
              return (
                <button key={c.id_color} onClick={() => selColor(c.color)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-sm font-bold text-left transition-all active:scale-[0.97] ${
                    sel ? 'border-slate-800 bg-slate-800 text-white' : 'border-black/10 bg-white text-slate-700 hover:border-amber-400'
                  }`}>
                  {thumb
                    ? <img src={thumb} alt={c.color} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                    : <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${sel?'bg-white/10':'bg-slate-100'}`}>
                        <span className={`text-[11px] font-black ${sel?'text-white/60':'text-slate-300'}`}>{c.color?.slice(0,2).toUpperCase()}</span>
                      </div>
                  }
                  <span className="truncate">{c.color}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-6 border-2 border-dashed border-black/10 rounded-2xl text-center space-y-1.5">
            <p className="text-sm font-black text-slate-500">Sin colores en catálogo</p>
            <p className="text-xs text-slate-400">Agrega colores al catálogo para que aparezcan aquí.</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── PASO: SERIE ───────────────────────────────────────────────────────────────
  if (paso === 'serie') return (
    <div className="space-y-5 overflow-hidden">
      <PasoIndicador paso="serie" />
      <div className="flex gap-2">
        {[
          { label: marcaNombre, sub: modeloSel?.nombre_modelo, cb: () => volverA('modelo') },
          { label: 'Color',     sub: form.color,               cb: () => volverA('color')  },
        ].map(({ label, sub, cb }) => (
          <button key={label} onClick={cb}
            className="flex-1 flex items-center gap-2.5 p-3 bg-white border border-black/5 shadow-sm rounded-xl hover:border-amber-300 active:scale-[0.98] transition-all text-left min-w-0">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className="font-black text-xs text-slate-900 truncate">{sub}</p>
            </div>
          </button>
        ))}
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Serie</p>
        <div className="space-y-2">
          {seriesDisp.map(k => {
            const s = SERIES[k];
            const precio  = k !== 'personalizado' ? resolverPrecio(k, modeloSel, colorSel) : null;
            const costo   = k !== 'personalizado' && colorSel
              ? resolverCosto(k, modeloSel?.id_producto, colorSel.id_color, costosMaterialesIndex)
              : 0;
            const margen  = precio && costo > 0 ? precio - costo : null;
            const esEsp   = colorSel && colorSel[PRECIO_ESP[k]] > 0;
            return (
              <button key={k} onClick={() => selSerie(k)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-2xl
                           bg-white border border-black/5 shadow-sm hover:border-amber-300
                           hover:shadow-md active:scale-[0.98] transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-slate-800 flex items-center justify-center transition-all">
                    <span className="text-xs font-black text-slate-500 group-hover:text-white transition-colors">{s.label.charAt(0)}</span>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-sm text-slate-900">{s.label}</p>
                    <p className="text-xs text-slate-400">{s.sub}</p>
                    {margen !== null && <p className="text-xs text-slate-400">margen {fmt(margen)}</p>}
                  </div>
                </div>
                {precio !== null && (
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      {esEsp && <span className="text-[11px] text-amber-500 font-black">★</span>}
                      <p className="font-black text-lg text-slate-900">{fmt(precio)}</p>
                    </div>
                    {costo > 0 && <p className="text-xs text-slate-400">costo {fmt(costo)}</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── PASO: DOCENAS ─────────────────────────────────────────────────────────────
  if (paso === 'docenas') return (
    <div className="space-y-5 overflow-hidden">
      <PasoIndicador paso="docenas" />

      {/* Resumen */}
      <div className="bg-white border border-black/5 shadow-sm rounded-2xl p-4 space-y-3">
        {[
          { label:'Modelo', valor:modeloSel?.nombre_modelo, sub:marcaNombre, cb:() => volverA('modelo') },
          { label:'Color',  valor:form.color,               sub:null,        cb:() => volverA('color')  },
          { label:'Serie',  valor:SERIES[form.serie]?.label, sub:SERIES[form.serie]?.sub, cb:() => volverA('serie')  },
        ].map(({ label, valor, sub, cb }) => (
          <div key={label} className="flex items-center justify-between">
            <div>
              {sub && <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{sub}</p>}
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className="font-black text-sm text-slate-900">{valor}</p>
            </div>
            <button onClick={cb} className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100">
              cambiar
            </button>
          </div>
        ))}
        <div className="pt-2.5 border-t border-black/5 flex justify-between items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Precio venta</p>
            <p className="font-black text-xl text-slate-900">{fmt(precioActual)}</p>
          </div>
          {costoActual > 0 && (
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Margen/par</p>
              <p className="font-black text-xl text-emerald-600">{fmt(margenActual)}</p>
            </div>
          )}
        </div>
      </div>

      {form.serie !== 'personalizado' ? (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Docenas</p>
          <div className="flex gap-2 mb-3">
            {[5, 10, 15, 21].map(n => (
              <button key={n} onClick={() => setForm(p=>({...p, docenas:n}))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all ${
                  form.docenas === n ? 'bg-slate-800 text-white' : 'bg-white border border-black/10 text-slate-500 hover:border-amber-400'
                }`}>{n}
              </button>
            ))}
          </div>
          <input type="number" inputMode="numeric" placeholder="0" value={form.docenas}
            onChange={e => setForm(p=>({...p, docenas: Math.max(1, Math.min(99, parseInt(e.target.value)||1))})) }
            min="1" max="99"
            className="w-full border-2 border-black/10 rounded-2xl px-4 py-5 text-4xl font-black text-center focus:outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 transition-all bg-white shadow-sm" />
        </div>
      ) : (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
            Tallas personalizadas — {totalPares} pares
          </p>
          <div className="space-y-2">
            {tallasCustom.map((t, i) => (
              <div key={t.talla} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
                t.cant > 0 ? 'border-amber-300 bg-amber-50' : 'border-black/5 bg-white'
              }`}>
                <span className="font-black text-base flex-1">T{t.talla}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const c=[...tallasCustom]; c[i]={...c[i],cant:Math.max(0,c[i].cant-1)}; setTallasCustom(c); }}
                    disabled={t.cant===0} className="w-8 h-8 rounded-lg border border-black/10 font-bold text-base flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all hover:border-slate-400">−</button>
                  <span className={`w-8 text-center font-black text-base ${t.cant>0?'text-slate-900':'text-slate-300'}`}>{t.cant}</span>
                  <button onClick={() => { const c=[...tallasCustom]; c[i]={...c[i],cant:c[i].cant+1}; setTallasCustom(c); }}
                    className="w-8 h-8 rounded-lg border border-black/10 font-bold text-base flex items-center justify-center active:scale-90 transition-all hover:border-slate-400">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ndoc > 0 && form.serie !== 'personalizado' && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:'Pares',   valor:`${totalPares}` },
            { label:'Ingreso', valor:precioActual ? fmt(precioActual * totalPares) : '—' },
            { label:'Margen',  valor:margenActual  ? fmt(margenActual * totalPares) : '—' },
          ].map(({ label, valor }) => (
            <div key={label} className="bg-white border border-black/5 rounded-xl p-3 text-center shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className="font-black text-sm text-slate-900 mt-0.5">{valor}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-100 rounded-xl">
          <span className="text-red-400 font-black text-sm">!</span>
          <span className="text-sm font-bold text-red-700">{error}</span>
        </div>
      )}

      <button onClick={crearLote} disabled={creando || totalPares === 0}
        className="w-full py-4 bg-slate-800 text-white font-black text-base rounded-2xl
                   active:scale-[0.98] transition-all disabled:opacity-20 disabled:scale-100
                   flex items-center justify-center gap-2 shadow-sm">
        {creando ? 'Creando lote...' : (
          <>
            <span>Crear lote</span>
            {totalPares > 0 && (
              <span className="text-slate-400 font-bold text-sm">
                · {ndoc > 0 ? ndoc + ' doc.' : ''} · {totalPares} pares
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );

  return null;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function ProduccionLotes({ usuario, logout }) {
  const [panel, setPanel] = useState('crear');

  const [productos,     setProductos]     = useState([]);
  const [coloresModelo, setColoresModelo] = useState([]);
  const [tiendas,       setTiendas]       = useState([]);
  const [historial,     setHistorial]     = useState([]);
  const [lotesDisp,     setLotesDisp]     = useState([]);
  const [stats,         setStats]         = useState({});
  const [filtroHist,    setFiltroHist]    = useState('semana');
  const [filtroDesp,    setFiltroDesp]    = useState('semana');
  const [cargando,      setCargando]      = useState(true);

  const [lotesSeleccionados, setLotesSeleccionados] = useState(new Set());
  const [generandoPDFMulti,  setGenerandoPDFMulti]  = useState(false);

  const [modalDespacho, setModalDespacho] = useState(null);

  const [loteEditar,  setLoteEditar]  = useState(null);
  const [modalEditar, setModalEditar] = useState(false);
  const [editForm,    setEditForm]    = useState({});
  const [guardandoEd, setGuardandoEd] = useState(false);

  // ── Cargar datos ─────────────────────────────────────────────────────────────
  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      const [{ data: prods }, { data: tiendasDB }] = await Promise.all([
        supabase.from('productos')
          .select('*, categorias(id_categoria, nombre_categoria)')
          .order('nombre_modelo'),
        supabase.from('ubicaciones')
          .select('id_ubicacion, nombre')
          .eq('activa', true).eq('rol', 'Tienda').order('nombre'),
      ]);
      setProductos(prods || []);
      setTiendas(tiendasDB?.length
        ? tiendasDB
        : [{ id_ubicacion:1, nombre:'Tienda 1' },{ id_ubicacion:2, nombre:'Tienda 2' }]);

      const desdeH = desdeSegun(filtroHist);
      let qH = supabase.from('lotes')
        .select('*, productos(nombre_modelo, foto_url, categorias(nombre_categoria)), despachos(id_despacho, cantidad_despachada, nombre_tienda, fecha_despacho, id_ubicacion)')
        .eq('id_ubicacion', usuario.id_ubicacion)
        .order('fecha_produccion', { ascending:false });
      if (desdeH) qH = qH.gte('fecha_produccion', desdeH);
      const { data: lH } = await qH.limit(300);
      setHistorial(lH || []);

      const desdeD = desdeSegun(filtroDesp);
      let qD = supabase.from('lotes')
        .select('*, productos(nombre_modelo, foto_url, categorias(nombre_categoria)), despachos(id_despacho, cantidad_despachada, nombre_tienda, fecha_despacho)')
        .eq('id_ubicacion', usuario.id_ubicacion)
        .order('fecha_produccion', { ascending:false });
      if (desdeD) qD = qD.gte('fecha_produccion', desdeD);
      const { data: lD } = await qD.limit(300);
      setLotesDisp(lD || []);

      const hoy = new Date().toISOString().split('T')[0];
      const lotesHoy = (lH||[]).filter(l => l.fecha_produccion?.startsWith(hoy));
      setStats({
        lotesHoy:   lotesHoy.length,
        paresHoy:   lotesHoy.reduce((s,l) => s+l.cantidad_total, 0),
        lotesTotal: (lH||[]).length,
        paresTotal: (lH||[]).reduce((s,l) => s+l.cantidad_total, 0),
      });
    } catch(e) { console.error(e); }
    finally { setCargando(false); }
  }, [filtroHist, filtroDesp, usuario.id_ubicacion]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // ── Editar lote ───────────────────────────────────────────────────────────────
  const abrirEditar = async (lote) => {
    setLoteEditar(lote);
    const { data } = await supabase.from('inventario')
      .select('talla, color, estado, id_ubicacion').eq('id_lote', lote.id_lote);
    const dispFab   = (data||[]).filter(i => i.estado==='Disponible' && i.id_ubicacion === usuario.id_ubicacion);
    const colorReal = data?.[0]?.color || '';
    const precioActual = lote.precio_unitario && lote.precio_unitario > 0
      ? lote.precio_unitario
      : productos.find(p => p.id_producto === lote.id_producto)?.precio_venta_sugerido || 0;
    setEditForm({
      color: colorReal, colorOriginal: colorReal,
      addDocenas: 0, removeDocenas: 0,
      observaciones: lote.observaciones || '',
      stockDisp: dispFab.length, totalActual: (data||[]).length,
      precioUnitario: precioActual,
    });
    setModalEditar(true);
  };

  const guardarEdicion = async () => {
    if (!loteEditar) return;
    setGuardandoEd(true);
    try {
      const addD = Number(editForm.addDocenas) || 0;
      const rmD  = Number(editForm.removeDocenas) || 0;

      if (editForm.color !== editForm.colorOriginal) {
        await supabase.from('inventario').update({ color: editForm.color }).eq('id_lote', loteEditar.id_lote);
      }
      if (addD > 0) {
        const { data: existentes } = await supabase.from('inventario')
          .select('talla, color').eq('id_lote', loteEditar.id_lote)
          .eq('estado','Disponible').eq('id_ubicacion', usuario.id_ubicacion);
        const distrib = {};
        (existentes||[]).forEach(i => { distrib[i.talla] = (distrib[i.talla]||0)+1; });
        const total = Object.values(distrib).reduce((s,v)=>s+v,0) || 1;
        const ratio = Object.fromEntries(Object.entries(distrib).map(([t,c])=>[t,c/total]));
        const nuevos = [];
        const paresAAgregar = addD * PARES_X_SERIE;
        for (const [talla, r] of Object.entries(ratio)) {
          const n = Math.round(r * paresAAgregar);
          for (let i = 0; i < n; i++) {
            await new Promise(r => setTimeout(r, 1));
            const rand = Math.random().toString(36).substr(2,5).toUpperCase();
            nuevos.push({
              sku_id: `${loteEditar.id_lote}-${talla}-${Date.now()}-${rand}`,
              id_lote: loteEditar.id_lote, id_producto: loteEditar.id_producto,
              talla: Number(talla), color: editForm.color,
              estado: 'Disponible', id_ubicacion: usuario.id_ubicacion,
              fecha_produccion: new Date().toISOString(),
            });
          }
        }
        if (nuevos.length) await supabase.from('inventario').insert(nuevos);
      }
      if (rmD > 0) {
        const paresAQuitar = rmD * PARES_X_SERIE;
        const { data: disp } = await supabase.from('inventario')
          .select('sku_id').eq('id_lote', loteEditar.id_lote)
          .eq('estado','Disponible').eq('id_ubicacion', usuario.id_ubicacion)
          .order('fecha_ingreso', { ascending:false }).limit(paresAQuitar);
        if (disp?.length) await supabase.from('inventario').delete().in('sku_id', disp.map(i=>i.sku_id));
      }
      const { data: inv } = await supabase.from('inventario').select('sku_id').eq('id_lote', loteEditar.id_lote);
      const nuevoTotal = inv?.length || loteEditar.cantidad_total;
      const docenasReales = Math.round(nuevoTotal / PARES_X_SERIE);
      const fraccion      = nuevoTotal % PARES_X_SERIE;
      const serieMatch    = loteEditar.descripcion?.match(/\b(Pequeña|Mediana|Grande|Personal\.)\b/i);
      const serieLabel    = serieMatch ? ` ${serieMatch[0]}` : '';
      const docLabel = fraccion === 0
        ? `${docenasReales}doc.${serieLabel} · ${editForm.color}`
        : `${nuevoTotal}p${serieLabel} · ${editForm.color}`;
      await supabase.from('lotes').update({
        descripcion: docLabel, cantidad_total: nuevoTotal,
        observaciones: editForm.observaciones,
        precio_unitario: Number(editForm.precioUnitario) || 0,
      }).eq('id_lote', loteEditar.id_lote);
      setModalEditar(false); setLoteEditar(null);
      await cargarTodo();
      alert('✓ Lote actualizado');
    } catch(e) { alert('Error: ' + e.message); }
    finally    { setGuardandoEd(false); }
  };

  // ── Eliminar producto ─────────────────────────────────────────────────────────
  const eliminarProducto = async (prod) => {
    const { data: lotesAsoc } = await supabase.from('lotes').select('id_lote').eq('id_producto', prod.id_producto).limit(1);
    if (lotesAsoc?.length > 0) { alert(`No se puede eliminar "${prod.nombre_modelo}": tiene lotes asociados.`); return; }
    if (!window.confirm(`¿Eliminar el modelo "${prod.nombre_modelo}"? Esta acción no se puede deshacer.`)) return;
    try {
      await supabase.from('productos').delete().eq('id_producto', prod.id_producto);
      setProductos(ps => ps.filter(p => p.id_producto !== prod.id_producto));
    } catch(e) { alert('Error al eliminar: ' + e.message); }
  };

  // ── Eliminar lote ─────────────────────────────────────────────────────────────
  const eliminarLote = async (lote) => {
    const desp = totalDespachado(lote);
    if (desp > 0) { alert('No se puede eliminar: el lote tiene pares despachados.'); return; }
    if (!window.confirm(`¿Eliminar LOTE-${lote.id_lote}? Se borrará el lote y sus ${lote.cantidad_total} pares del inventario.`)) return;
    try {
      await supabase.from('inventario').delete().eq('id_lote', lote.id_lote);
      await supabase.from('lotes').delete().eq('id_lote', lote.id_lote);
      await cargarTodo();
    } catch(e) { alert('Error al eliminar: ' + e.message); }
  };

  // ── Reimprimir PDF ────────────────────────────────────────────────────────────
  const reimprimir = async (lote) => {
    const { data } = await supabase.from('inventario').select('*').eq('id_lote', lote.id_lote).order('talla');
    if (!data?.length) { alert('Sin productos'); return; }
    const prod = productos.find(p => p.id_producto === lote.id_producto);
    const cat  = prod?.categorias;
    const marca = (typeof cat === 'object' ? cat?.nombre_categoria : cat) || '';
    await generarPDF(data, prod?.nombre_modelo || 'Modelo', marca, lote.id_lote, data[0].color, data.length);
  };

  // ── PDF multi-lote ────────────────────────────────────────────────────────────
  const generarPDFMultilote = async () => {
    if (lotesSeleccionados.size === 0) return;
    setGenerandoPDFMulti(true);
    try {
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
      const CW = 30, RH = 19, COLS = 6, QR = 15, MX = 7;
      const PAGE_TOP = 4, PAGE_H = 290, HEADER_H = 6;

      const lotesData = [];
      for (const idLote of Array.from(lotesSeleccionados).sort((a,b) => a-b)) {
        const lote = historial.find(l => l.id_lote === idLote);
        if (!lote) continue;
        const { data } = await supabase.from('inventario').select('*').eq('id_lote', idLote).order('talla');
        if (!data?.length) continue;
        const prod  = productos.find(p => p.id_producto === lote.id_producto);
        const cat   = prod?.categorias;
        const marca = (typeof cat === 'object' ? cat?.nombre_categoria : cat) || '';
        lotesData.push({ idLote, marca, modelo: prod?.nombre_modelo||'Modelo', color: data[0].color, items: data.flatMap(i=>[i,i]) });
      }

      let cursorY = PAGE_TOP, paginaVacia = true;
      const cabeEnPagina  = (h) => cursorY + h <= PAGE_H;
      const nuevaPagina   = () => { pdf.addPage(); cursorY = PAGE_TOP; paginaVacia = true; };
      const dibujarCab    = (idLote, marca, modelo, color) => {
        if (!cabeEnPagina(HEADER_H + RH)) nuevaPagina();
        pdf.setFillColor(240,240,240); pdf.rect(MX, cursorY, CW*COLS, HEADER_H, 'F');
        pdf.setFont('helvetica','bold');   pdf.setFontSize(7.5); pdf.setTextColor(20);
        pdf.text(`LOTE-${idLote}`, MX+2, cursorY+HEADER_H*0.72);
        pdf.setFont('helvetica','normal'); pdf.setFontSize(7);   pdf.setTextColor(80);
        pdf.text([marca,modelo,color].filter(Boolean).join('  ·  '), MX+20, cursorY+HEADER_H*0.72);
        pdf.setTextColor(0); cursorY += HEADER_H; paginaVacia = false;
      };

      for (const { idLote, marca, modelo, color, items } of lotesData) {
        if (!paginaVacia) cursorY += 1;
        dibujarCab(idLote, marca, modelo, color);
        let col = 0;
        for (let i = 0; i < items.length; i++) {
          col = i % COLS;
          if (col === 0 && !cabeEnPagina(RH)) { nuevaPagina(); dibujarCab(idLote, marca, modelo, `${color} (cont.)`); }
          const x = MX + col * CW, y = cursorY;
          try {
            const canvas = document.createElement('canvas');
            bwipjs.toCanvas(canvas, { bcid:'qrcode', text:items[i].sku_id, scale:4, eclevel:'M' });
            pdf.setDrawColor(210); pdf.setLineWidth(0.12); pdf.rect(x, y, CW, RH);
            const qrX = x+CW-QR-1, qrY = y+(RH-QR)/2;
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', qrX, qrY, QR, QR);
            if (marca) { pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(150); pdf.text(marca.toUpperCase(), x+1.5, y+3.5); }
            pdf.setFont('helvetica','bold'); pdf.setFontSize(15); pdf.setTextColor(15);
            pdf.text(String(items[i].talla), x+1.5, y+RH/2+3.5);
            pdf.setFont('helvetica','normal'); pdf.setFontSize(4); pdf.setTextColor(160);
            pdf.text(`L${idLote}`, qrX+QR/2, y+RH-1, { align:'center', maxWidth:QR });
            pdf.setTextColor(0);
          } catch(e) { console.error('QR:', e); }
          if (col === COLS-1) cursorY += RH;
        }
        if (col !== COLS-1) cursorY += RH;
      }
      pdf.save(`Lotes_combinados_${new Date().toLocaleDateString('es-PE',{timeZone:'America/Lima'}).replace(/\//g,'-')}.pdf`);
      setLotesSeleccionados(new Set());
    } catch(e) { alert('Error generando PDF: ' + e.message); }
    finally    { setGenerandoPDFMulti(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-full overflow-x-hidden" style={{ background:'#faf9f7' }}>

      {/* Header sticky */}
      <div className="sticky top-0 z-10 px-4 sm:px-6 pt-4 pb-3 border-b border-black/5"
           style={{ background:'rgba(250,249,247,0.95)', backdropFilter:'blur(12px)' }}>
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-xl sm:text-2xl tracking-tight text-slate-900">Producción</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">{usuario.nombre}</p>
            </div>
            {cargando && (
              <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            )}
          </div>
          <TabBar active={panel} onChange={setPanel} />
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-2xl mx-auto pb-32">

        {/* ══════════ CREAR ══════════ */}
        {panel === 'crear' && (
          <CrearPanel
            usuario={usuario}
            productos={productos}
            coloresModelo={coloresModelo}
            setColoresModelo={setColoresModelo}
            onLoteCreado={cargarTodo}
          />
        )}

        {/* ══════════ ENVÍO ══════════ */}
        {panel === 'despachar' && (
          <div className="space-y-4 overflow-hidden">
            {/* Filtros pill */}
            <div className="flex bg-slate-100 rounded-2xl p-1 gap-0.5">
              {Object.entries(FILTROS_LABEL).map(([k,l]) => (
                <button key={k} onClick={() => setFiltroDesp(k)}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                    filtroDesp===k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>{l}
                </button>
              ))}
            </div>

            {cargando ? (
              <div className="py-16 text-center text-slate-300 text-sm font-black uppercase tracking-widest animate-pulse">Cargando...</div>
            ) : lotesDisp.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-slate-300 text-sm font-black uppercase tracking-widest">Sin lotes pendientes</p>
              </div>
            ) : (
              <div className="space-y-6">
                {lotesAgrupadosPorDia(lotesDisp).map(([dia, lotes]) => {
                  const paresPend = lotes.reduce((s,l) => s + (l.cantidad_total - totalDespachado(l)), 0);
                  const todoDesp  = lotes.every(l => estadoLote(l) === 'despachado');
                  return (
                    <div key={dia}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600 capitalize flex-1">{fmtDia(dia)}</span>
                        <span className="text-xs text-slate-400">{lotes.length}L</span>
                        {todoDesp
                          ? <span className="text-xs font-semibold text-emerald-600">✓ Enviado</span>
                          : <span className="text-xs text-slate-400">{paresPend}p pend.</span>}
                      </div>
                      <div className="space-y-2">
                        {lotes.map(l => {
                          const desp = totalDespachado(l);
                          const pend = l.cantidad_total - desp;
                          const badge = badgeEstado(l);
                          const ya = estadoLote(l) === 'despachado';
                          const marcaNombre = l.productos?.categorias?.nombre_categoria || '';
                          return (
                            <div key={l.id_lote} className={`bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden transition-all ${ya ? 'opacity-50' : ''}`}>
                              <div className="flex items-center gap-3 px-4 py-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-slate-400">#{l.id_lote}</span>
                                    {marcaNombre && <span className="text-xs font-bold text-slate-500">{marcaNombre}</span>}
                                    <span className="font-black text-base truncate text-slate-900">{l.productos?.nombre_modelo}</span>
                                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5 truncate">{l.descripcion}
                                    {l.precio_unitario > 0 && <span className="text-slate-300"> · {fmt(l.precio_unitario)}</span>}
                                  </p>
                                  {(l.despachos||[]).map((d,i) => (
                                    <p key={i} className="text-xs text-emerald-600 mt-0.5">→ {d.nombre_tienda} · {d.cantidad_despachada}p</p>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2.5 flex-shrink-0">
                                  <div className="text-right">
                                    <p className="text-xl font-black leading-none text-slate-900">{ya ? l.cantidad_total : pend}</p>
                                    <p className="text-[11px] text-slate-400">{ya ? 'total' : 'pend.'}</p>
                                  </div>
                                  {!ya && (
                                    <button onClick={() => setModalDespacho(l)}
                                      className="px-3.5 py-2 bg-slate-800 text-white text-xs font-black rounded-xl active:scale-95 transition-all hover:bg-slate-700">
                                      Enviar
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ HISTORIAL ══════════ */}
        {panel === 'historial' && (
          <div className="space-y-4 overflow-hidden">
            {/* Filtros pill */}
            <div className="flex bg-slate-100 rounded-2xl p-1 gap-0.5">
              {Object.entries(FILTROS_LABEL).map(([k,l]) => (
                <button key={k} onClick={() => { setFiltroHist(k); setLotesSeleccionados(new Set()); }}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                    filtroHist===k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>{l}
                </button>
              ))}
            </div>

            {/* Barra multi-selección */}
            {lotesSeleccionados.size > 0 && (
              <div className="sticky top-[5.5rem] z-10 flex items-center gap-2 bg-slate-800 text-white px-4 py-3 rounded-2xl shadow-lg">
                <div className="flex-1">
                  <p className="text-sm font-bold">{lotesSeleccionados.size} lote{lotesSeleccionados.size!==1?'s':''} seleccionados</p>
                  <p className="text-xs text-slate-400">
                    {historial.filter(l => lotesSeleccionados.has(l.id_lote)).reduce((s,l) => s+l.cantidad_total, 0)} pares
                  </p>
                </div>
                <button onClick={() => setLotesSeleccionados(new Set())} className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1">Limpiar</button>
                <button onClick={generarPDFMultilote} disabled={generandoPDFMulti}
                  className="px-3.5 py-2 bg-white text-slate-900 text-xs font-bold rounded-xl active:scale-95 transition-all disabled:opacity-50">
                  {generandoPDFMulti ? 'Generando...' : 'PDF combinado'}
                </button>
              </div>
            )}

            {cargando ? (
              <div className="py-16 text-center text-slate-300 text-sm font-black uppercase tracking-widest animate-pulse">Cargando...</div>
            ) : historial.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-slate-300 text-sm font-black uppercase tracking-widest">Sin lotes</p>
              </div>
            ) : (
              <div className="space-y-6">
                {lotesAgrupadosPorDia(historial).map(([dia, lotes]) => {
                  const paresDelDia = lotes.reduce((s,l) => s+l.cantidad_total, 0);
                  const todoDesp   = lotes.every(l => estadoLote(l) === 'despachado');
                  return (
                    <div key={dia}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600 capitalize flex-1">{fmtDia(dia)}</span>
                        <span className="text-xs text-slate-400">{paresDelDia}p · {lotes.length}L</span>
                        {todoDesp && <span className="text-xs font-semibold text-emerald-600">✓</span>}
                      </div>
                      <div className="space-y-2">
                        {lotes.map(l => {
                          const badge = badgeEstado(l);
                          const desp  = totalDespachado(l);
                          const pend  = l.cantidad_total - desp;
                          const estado = estadoLote(l);
                          const sel = lotesSeleccionados.has(l.id_lote);
                          const marcaNombre = l.productos?.categorias?.nombre_categoria || '';
                          const toggleSel = () => setLotesSeleccionados(prev => {
                            const next = new Set(prev);
                            if (next.has(l.id_lote)) next.delete(l.id_lote); else next.add(l.id_lote);
                            return next;
                          });
                          return (
                            <div key={l.id_lote} className={`rounded-2xl border overflow-hidden transition-all shadow-sm ${
                              sel                   ? 'bg-slate-800 border-slate-700'      :
                              estado==='despachado' ? 'bg-white border-black/5 opacity-60' :
                              estado==='parcial'    ? 'bg-white border-amber-200'           :
                                                      'bg-white border-black/5'
                            }`}>
                              <div className="flex items-center gap-3 px-3.5 py-3">
                                <button onClick={toggleSel}
                                  className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                                    sel ? 'border-white bg-white' : 'border-black/20 hover:border-slate-500'
                                  }`}>
                                  {sel && <span className="text-slate-900 text-[11px] font-black leading-none">✓</span>}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-xs flex-shrink-0 ${sel?'text-slate-500':'text-slate-400'}`}>#{l.id_lote}</span>
                                    {marcaNombre && <span className={`text-xs font-bold ${sel?'text-slate-400':'text-slate-500'}`}>{marcaNombre}</span>}
                                    <span className={`font-black text-base truncate ${sel?'text-white':'text-slate-900'}`}>{l.productos?.nombre_modelo}</span>
                                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${sel?'bg-slate-700 text-slate-300':badge.cls}`}>{badge.label}</span>
                                  </div>
                                  <p className={`text-[11px] mt-0.5 truncate ${sel?'text-slate-400':'text-slate-400'}`}>{l.descripcion}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className={`text-xl font-black leading-none ${sel?'text-white':'text-slate-900'}`}>{l.cantidad_total}</p>
                                  <p className={`text-[11px] ${sel?'text-slate-400':'text-slate-400'}`}>pares</p>
                                </div>
                              </div>

                              {!sel && (l.despachos||[]).length > 0 && (
                                <div className="mx-3.5 mb-2.5 px-3 py-2 bg-slate-50 rounded-xl space-y-1 border border-black/5">
                                  {(l.despachos||[]).map((d,i) => (
                                    <div key={i} className="flex justify-between items-center">
                                      <span className="text-xs text-slate-500">→ {d.nombre_tienda || `Tienda #${d.id_ubicacion}`}</span>
                                      <span className="text-xs font-semibold text-slate-600">{d.cantidad_despachada}p</span>
                                    </div>
                                  ))}
                                  {pend > 0 && (
                                    <div className="flex justify-between items-center pt-1 border-t border-black/5">
                                      <span className="text-xs text-amber-600">Pendiente</span>
                                      <span className="text-xs font-semibold text-amber-600">{pend}p</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {!sel && (
                                <div className="flex border-t border-black/5">
                                  <button onClick={() => abrirEditar(l)}
                                    className="flex-1 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors">
                                    Editar
                                  </button>
                                  {estado !== 'despachado' && (
                                    <><div className="w-px bg-black/5" />
                                    <button onClick={() => setModalDespacho(l)}
                                      className="flex-1 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                                      Despachar
                                    </button></>
                                  )}
                                  <div className="w-px bg-black/5" />
                                  <button onClick={() => reimprimir(l)}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors">
                                    PDF
                                  </button>
                                  {estado === 'pendiente' && (
                                    <><div className="w-px bg-black/5" />
                                    <button onClick={() => eliminarLote(l)}
                                      className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                      Borrar
                                    </button></>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════ STATS ══════════ */}
        {panel === 'stats' && (
          <div className="space-y-4 overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Lotes hoy',               stats.lotesHoy],
                ['Pares hoy',               stats.paresHoy],
                [`Lotes (${filtroHist})`,   stats.lotesTotal],
                [`Pares (${filtroHist})`,   stats.paresTotal],
              ].map(([label, val]) => (
                <div key={label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">{label}</p>
                  <p className="font-black text-4xl text-slate-900">{val ?? '—'}</p>
                </div>
              ))}
            </div>

            {/* Selector filtro stats */}
            <div className="flex bg-slate-100 rounded-2xl p-1 gap-0.5">
              {Object.entries(FILTROS_LABEL).map(([k,l]) => (
                <button key={k} onClick={() => setFiltroHist(k)}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                    filtroHist===k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>{l}
                </button>
              ))}
            </div>

            {historial.length > 0 && (() => {
              const porModelo = historial.reduce((acc, l) => {
                const cat = l.productos?.categorias?.nombre_categoria || '';
                const nom = l.productos?.nombre_modelo || '—';
                const k = cat ? `${cat} · ${nom}` : nom;
                acc[k] = (acc[k]||0) + (l.cantidad_total||0);
                return acc;
              }, {});
              const ranking = Object.entries(porModelo).sort((a,b) => b[1]-a[1]).slice(0,5);
              return (
                <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-4">Top modelos</p>
                  <div className="space-y-3.5">
                    {ranking.map(([nombre, pares], i) => {
                      const pct = Math.round((pares / ranking[0][1]) * 100);
                      return (
                        <div key={nombre}>
                          <div className="flex justify-between text-sm font-bold mb-1.5">
                            <span className="text-slate-700 truncate flex-1 mr-2">{i+1}. {nombre}</span>
                            <span className="text-slate-400 flex-shrink-0">{pares}p</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-800 rounded-full transition-all" style={{ width:`${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ══════════ Modal Despacho ══════════ */}
      {modalDespacho && (
        <ModalDespacho
          lote={modalDespacho}
          usuario={usuario}
          tiendas={tiendas}
          onClose={() => setModalDespacho(null)}
          onDespachado={(cant, tienda) => {
            alert(`✓ ${cant} pares → ${tienda}`);
            cargarTodo();
          }}
        />
      )}

      {/* ══════════ Modal Editar ══════════ */}
      {modalEditar && loteEditar && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModalEditar(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center mb-3"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="font-black text-base">Lote #{loteEditar.id_lote}</p>
                <p className="text-xs text-slate-400">
                  {loteEditar.productos?.categorias?.nombre_categoria && (
                    <span className="font-semibold text-slate-500">{loteEditar.productos.categorias.nombre_categoria} · </span>
                  )}
                  {loteEditar.productos?.nombre_modelo} · {loteEditar.cantidad_total}p
                </p>
              </div>
              <button onClick={() => setModalEditar(false)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 text-xl transition-colors rounded-xl hover:bg-slate-100">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Color</label>
                <input value={editForm.color} placeholder="Color..."
                  onChange={e => setEditForm(p=>({...p,color:e.target.value}))}
                  className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm transition-all" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Observaciones</label>
                <input value={editForm.observaciones} placeholder="Notas..."
                  onChange={e => setEditForm(p=>({...p,observaciones:e.target.value}))}
                  className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 text-sm transition-all" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Precio unitario</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 border border-black/10 rounded-xl focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-50 transition-all">
                  <span className="text-sm text-slate-400 font-bold">S/</span>
                  <input type="number" inputMode="decimal" value={editForm.precioUnitario||''}
                    onChange={e => setEditForm(p=>({...p,precioUnitario:e.target.value}))} placeholder="0.00"
                    className="flex-1 text-sm font-bold outline-none bg-transparent text-slate-900" />
                </div>
                <p className="text-xs text-slate-400 mt-1">Solo afecta este lote — no cambia el catálogo</p>
              </div>
              <div className="flex gap-2">
                {[['en fábrica',editForm.stockDisp],['total',editForm.totalActual],['despachados',totalDespachado(loteEditar)]].map(([l,v]) => (
                  <div key={l} className="flex-1 bg-slate-50 rounded-xl px-3 py-2.5 text-center border border-black/5">
                    <p className="font-black text-lg text-slate-900">{v}</p>
                    <p className="text-xs text-slate-400">{l}</p>
                  </div>
                ))}
              </div>
              {estadoLote(loteEditar) === 'despachado' ? (
                <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2.5 rounded-xl text-center">
                  Lote despachado — solo color y observaciones editables
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-black text-emerald-600 mb-1.5 uppercase tracking-widest">+ Docenas</label>
                    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl border border-emerald-100 px-3 py-2.5">
                      <button onClick={() => setEditForm(p=>({...p,addDocenas:Math.max(0,Number(p.addDocenas)-1)}))}
                        className="w-8 h-8 border border-emerald-200 bg-white rounded-lg font-bold flex items-center justify-center">−</button>
                      <div className="flex-1 text-center">
                        <p className="text-xl font-black text-emerald-800">{editForm.addDocenas}</p>
                        <p className="text-xs text-emerald-500">{editForm.addDocenas>0?`+${editForm.addDocenas*PARES_X_SERIE}p`:'sin cambio'}</p>
                      </div>
                      <button onClick={() => setEditForm(p=>({...p,addDocenas:Number(p.addDocenas)+1}))}
                        className="w-8 h-8 border border-emerald-200 bg-white rounded-lg font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-red-500 mb-1.5 uppercase tracking-widest">− Docenas</label>
                    <div className="flex items-center gap-3 bg-red-50 rounded-xl border border-red-100 px-3 py-2.5">
                      <button onClick={() => setEditForm(p=>({...p,removeDocenas:Math.max(0,Number(p.removeDocenas)-1)}))}
                        className="w-8 h-8 border border-red-200 bg-white rounded-lg font-bold flex items-center justify-center">−</button>
                      <div className="flex-1 text-center">
                        <p className="text-xl font-black text-red-700">{editForm.removeDocenas}</p>
                        <p className="text-xs text-red-400">{editForm.removeDocenas>0?`−${editForm.removeDocenas*PARES_X_SERIE}p`:'sin cambio'}</p>
                      </div>
                      <button onClick={() => setEditForm(p=>({...p,removeDocenas:Math.min(Math.floor(editForm.stockDisp/PARES_X_SERIE),Number(p.removeDocenas)+1)}))}
                        className="w-8 h-8 border border-red-200 bg-white rounded-lg font-bold flex items-center justify-center">+</button>
                    </div>
                  </div>
                </>
              )}
              <button onClick={guardarEdicion} disabled={guardandoEd}
                className="w-full py-3.5 font-bold text-sm rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-40 active:scale-[0.98] transition-all">
                {guardandoEd ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}