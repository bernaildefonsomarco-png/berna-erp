/* eslint-disable no-unused-vars */
/* eslint-disable no-empty */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listarCostosMaterialesModelo, indexarCostosMateriales, obtenerCostoMaterial } from './gestion/lib/materialCostos';
import { supabase } from '../api/supabase';
import jsQR from 'jsqr';

const fmt = n => `S/${Number(n || 0).toFixed(2)}`;

// Fecha de hoy en horario Lima (UTC-5)
const fechaHoy = () => {
  const lima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
  return lima.getFullYear() + '-' +
    String(lima.getMonth() + 1).padStart(2, '0') + '-' +
    String(lima.getDate()).padStart(2, '0');
};
const inicioDiaLima = () => {
  const hoy = fechaHoy();
  return new Date(hoy + 'T00:00:00-05:00').toISOString();
};

// ─── Catálogo — ahora se lee de la BD ──────────────────────────────────────
const COLORES_RAPIDOS    = ['Negro', 'Blanco'];
const TALLAS_DISPONIBLES = [27,28,29,30,31,32,34,35,36,37,38,39,40,41,42,43];
// Tallas 38 y 39 están en Mediana Y Grande — hay que preguntar la serie

// ─── SeccionPago ──────────────────────────────────────────────────────────────
function SeccionPago({ total, pagos, setPagos }) {
  const [mixto, setMixto] = useState(false);
  const METODOS = [
    { key:'efectivo', label:'Efectivo', short:'E' },
    { key:'yape',     label:'Yape',     short:'Y' },
    { key:'plin',     label:'Plin',     short:'P' },
    { key:'tarjeta',  label:'Tarjeta',  short:'T' },
  ];
  const pagado = METODOS.reduce((s,m) => s + Number(pagos[m.key] || 0), 0);
  const vuelto = Math.max(0, pagado - total);
  const falta  = Math.max(0, total - pagado);
  const metodoActivo = (() => {
    const activos = METODOS.filter(m => Number(pagos[m.key]) > 0);
    if (activos.length === 1 && Number(pagos[activos[0].key]) === total) return activos[0].key;
    return null;
  })();
  const pagoSimple = (key) => { const n = { efectivo:'', yape:'', plin:'', tarjeta:'' }; n[key] = String(total); setPagos(n); };
  const resetPagos = () => setPagos({ efectivo:'', yape:'', plin:'', tarjeta:'' });
  return (
    <div className="space-y-2">
      {!mixto && (
        <div className="grid grid-cols-4 gap-2">
          {METODOS.map(({ key, label }) => (
            <button key={key} onPointerDown={e => { e.preventDefault(); pagoSimple(key); }}
              className={`py-3 rounded-xl text-xs font-black transition-all active:scale-95 ${
                metodoActivo === key ? 'bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1' : 'bg-slate-100 text-slate-700'
              }`}>{label}</button>
          ))}
        </div>
      )}
      {mixto && (
        <div className="grid grid-cols-4 gap-1.5">
          {METODOS.map(({ key, short }) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="text-[9px] text-slate-400 font-bold text-center uppercase tracking-wide">{short}</span>
              <input type="number" inputMode="decimal" value={pagos[key]} placeholder="0"
                onChange={e => setPagos(p => ({...p, [key]: e.target.value}))}
                className="px-1 py-2.5 text-xs font-mono text-center border border-slate-300 rounded-lg outline-none focus:border-blue-500" />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between items-center">
        <button onClick={mixto ? () => { resetPagos(); setMixto(false); } : () => { resetPagos(); setMixto(true); }}
          className="text-[10px] text-slate-400 underline underline-offset-2">
          {mixto ? '← Pago simple' : 'Pago mixto →'}
        </button>
        {pagado > 0 && <button onClick={resetPagos} className="text-[10px] text-slate-400 underline underline-offset-2">Limpiar</button>}
      </div>
      {pagado > 0 && (
        <div className="space-y-0.5 px-1">
          {vuelto > 0.01 && <div className="flex justify-between text-xs font-bold text-green-600"><span>Vuelto</span><span className="font-mono">{fmt(vuelto)}</span></div>}
          {falta  > 0.01 && <div className="flex justify-between text-xs font-bold text-red-500"><span>Falta</span><span className="font-mono">{fmt(falta)}</span></div>}
        </div>
      )}
    </div>
  );
}

// ─── DismissHandle — pill con swipe-down para cerrar ──────────────────────────
function DismissHandle({ onClose }) {
  const startY  = useRef(null);
  const [dy, setDy] = useState(0);

  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchMove  = (e) => {
    if (startY.current === null) return;
    const d = e.touches[0].clientY - startY.current;
    if (d > 0) setDy(Math.min(d, 60));
  };
  const onTouchEnd = () => {
    if (dy > 40) onClose();
    setDy(0);
    startY.current = null;
  };

  const progress = Math.min(dy / 40, 1); // 0→1

  return (
    <div className="flex justify-center pt-3 pb-2 select-none"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      style={{ cursor: 'grab' }}>
      <div style={{
        width: 36 + progress * 16,
        height: 4,
        borderRadius: 99,
        background: `rgba(${Math.round(148 + progress*(-148+148))}, ${Math.round(163 - progress*63)}, ${Math.round(184 - progress*84)}, 1)`,
        transform: `scaleY(${1 + progress * 0.5})`,
        transition: dy === 0 ? 'all 0.3s ease' : 'none',
      }}/>
    </div>
  );
}

// ─── CarritoItem con swipe ─────────────────────────────────────────────────────
function CarritoItem({ item, onUpdate, onRemove, onDuplicate, esMayorista }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  // talla "para pantalla" — solo visual, no se guarda en BD
  const [tallaDisplay, setTallaDisplay] = useState(item.talla);

  // Swipe state
  const touchStartX = useRef(null);
  const [offsetX, setOffsetX]   = useState(0);
  const [swiping, setSwiping]   = useState(false);
  const UMBRAL = 160; // px — necesita arrastrar bastante para evitar accidentes

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    setSwiping(true);
  };
  const onTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    // Limitar rango
    setOffsetX(Math.max(-220, Math.min(220, dx)));
  };
  const onTouchEnd = () => {
    if (offsetX < -UMBRAL) {
      // Swipe izquierda → eliminar
      onRemove(item.id);
    } else if (offsetX > UMBRAL) {
      // Swipe derecha → duplicar
      onDuplicate(item.id);
      setOffsetX(0);
    } else {
      setOffsetX(0);
    }
    setSwiping(false);
    touchStartX.current = null;
  };

  const update = (campo, valor) => onUpdate(item.id, campo, valor);

  // Color de fondo cambia según dirección del swipe
  const swipingLeft  = offsetX < -40;
  const swipingRight = offsetX > 40;

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden">
        {/* Fondo full-width: rojo al eliminar, azul al duplicar */}
        <div
          className="absolute inset-0 rounded-2xl flex items-center"
          style={{
            backgroundColor: offsetX < -40 ? '#ef4444' : offsetX > 40 ? '#3b82f6' : (esMayorista ? '#fffbeb' : '#ffffff'),
            transition: swiping ? 'none' : 'background-color 0.2s ease',
          }}>
          {swipingLeft && (
            <div className="absolute right-4">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </div>
          )}
          {swipingRight && (
            <div className="absolute left-4">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Fila real encima del fondo */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => { if (Math.abs(offsetX) < 5) setModalAbierto(true); }}
          style={{
            transform: `translateX(${offsetX}px)`,
            transition: swiping ? 'none' : 'transform 0.25s ease',
          }}
          className={`relative flex items-center gap-3 px-3.5 py-3 rounded-2xl border cursor-pointer ${
            esMayorista ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'
          }`}>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-slate-900 truncate">{item.desc}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {item.talla && (
                <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                  T{tallaDisplay}
                </span>
              )}
              {item.color && (
                <span className="text-[11px] text-slate-400 truncate">{item.color}</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-black text-sm font-mono text-slate-900">{fmt(Number(item.precio))}</div>
          </div>
        </div>
      </div>

      {/* Modal de edición */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50" onClick={() => setModalAbierto(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl"
            onClick={e => e.stopPropagation()}>

            <DismissHandle onClose={() => setModalAbierto(false)} />
            <div className="px-5 pb-4 border-b border-slate-100">
              <p className="font-black text-base text-slate-900">{item.desc}</p>
              {item.sku && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.sku}</p>}
            </div>

            <div className="px-5 py-4 space-y-5 max-h-[72vh] overflow-y-auto pb-8">

              {/* Precio */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Precio unitario</p>
                <div className="flex items-center gap-2 px-4 py-3 border-2 border-slate-200 rounded-2xl focus-within:border-slate-900 transition-colors">
                  <span className="text-sm text-slate-400 font-mono font-bold">S/</span>
                  <input
                    type="number" inputMode="decimal"
                    value={item.precio}
                    onChange={e => update('precio', e.target.value)}
                    className="flex-1 text-lg font-black font-mono outline-none bg-transparent text-slate-900"
                  />
                </div>
              </div>

              {/* Talla — siempre editable, pero solo para pantalla si es SKU */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Talla {item.sku && <span className="normal-case text-slate-300 font-normal">(solo visual)</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TALLAS_DISPONIBLES.map(t => (
                    <button key={t} onClick={() => setTallaDisplay(t)}
                      className={`px-3 py-2 text-sm font-bold rounded-xl border-2 transition-all active:scale-90 ${
                        tallaDisplay === t
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}>{t}</button>
                  ))}
                </div>
                {item.sku && tallaDisplay !== item.talla && (
                  <p className="text-[10px] text-amber-600 mt-1.5">
                    ⚠ Talla real en sistema: {item.talla} · Esta pantalla muestra: {tallaDisplay}
                  </p>
                )}
              </div>

              {/* Color — solo Negro/Blanco + libre */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Color</p>
                <div className="flex gap-2 mb-2.5">
                  {COLORES_RAPIDOS.map(c => (
                    <button key={c} onClick={() => update('color', c)}
                      className={`px-4 py-2.5 text-sm font-bold rounded-xl border-2 transition-all active:scale-90 ${
                        item.color === c
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}>{c}</button>
                  ))}
                </div>
                <input type="text" value={item.color || ''}
                  onChange={e => update('color', e.target.value)}
                  placeholder="Otro color..."
                  className="w-full px-3.5 py-2.5 text-sm border-2 border-slate-200 rounded-xl outline-none focus:border-slate-900" />
              </div>

              {/* Eliminar */}
              <button
                onClick={() => { onRemove(item.id); setModalAbierto(false); }}
                className="w-full py-3 text-sm font-bold text-red-500 border-2 border-red-100 rounded-2xl hover:bg-red-50 active:scale-[0.98] transition-all">
                Quitar del carrito
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helpers para serie/precio/costo desde catálogo ─────────────────────────
const getSerie = (talla, serieOverride) => {
  if (serieOverride) return serieOverride;
  const t = Number(talla);
  if (t >= 40) return 'Grande';
  if (t === 38 || t === 39) return null; // ambigua — está en Mediana y Grande
  if (t >= 34) return 'Mediana';
  if (t >= 27) return 'Pequeña';
  return null;
};
const getPrecioCatalogo = (serie, producto, colorObj) => {
  const s = serie === 'Grande' ? 'grande' : serie === 'Mediana' ? 'mediana' : 'chica';
  const especial = colorObj?.[`precio_especial_${s}`];
  if (especial && Number(especial) > 0) return Number(especial);
  const base = producto?.[`precio_${s}`];
  if (base && Number(base) > 0) return Number(base);
  return Number(producto?.precio_venta_sugerido) || 0;
};
const getCostoCatalogo = async ({ idProducto, idColor, serie }) => {
  if (!idProducto || !idColor || !serie) return 0;
  const rows = await listarCostosMaterialesModelo({ idProducto, idColor, soloActivos: true });
  const index = indexarCostosMateriales(rows);
  return obtenerCostoMaterial(index, { idProducto, idColor, serie });
};

// ─── ModalCatalogo — selector rápido desde BD ──────────────────────────────────
function ModalCatalogo({ onAgregar, onClose }) {
  const [paso, setPaso] = useState('marca');
  const [cargando, setCargando] = useState(true);

  const [categorias, setCategorias] = useState([]);
  const [productos,  setProductos]  = useState([]);
  const [coloresDB,  setColoresDB]  = useState([]);

  // Selecciones de catálogo (null = manual/no encontrado)
  const [marcaSel,   setMarcaSel]   = useState(null);
  const [modeloSel,  setModeloSel]  = useState(null);
  const [colorSel,   setColorSel]   = useState(null);
  const [tallaSel,   setTallaSel]   = useState(null);
  const [serieSel,   setSerieSel]   = useState(null); // para tallas 38-39 que están en 2 series
  const [precioEdit, setPrecioEdit] = useState('');

  // Texto libre que escribe la vendedora
  const [textoMarca,  setTextoMarca]  = useState('');
  const [textoModelo, setTextoModelo] = useState('');
  const [textoColor,  setTextoColor]  = useState('');
  const refPrecio = useRef(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [r1, r2] = await Promise.all([
        supabase.from('categorias').select('*').order('nombre_categoria'),
        supabase.from('productos').select('*, categorias(id_categoria, nombre_categoria)')
          .eq('estado', 'Activo').order('nombre_modelo'),
      ]);
      setCategorias(r1.data || []);
      setProductos(r2.data || []);
      setCargando(false);
    })();
  }, []);

  useEffect(() => {
    if (!modeloSel) { setColoresDB([]); return; }
    supabase.from('colores_modelos')
      .select('*').eq('id_producto', modeloSel.id_producto)
      .eq('estado', 'Activo').order('color')
      .then(({ data }) => setColoresDB(data || []));
  }, [modeloSel?.id_producto]);

  const marcasFiltradas = textoMarca.trim()
    ? categorias.filter(c => c.nombre_categoria.toLowerCase().includes(textoMarca.toLowerCase()))
    : categorias;

  const modelosFiltrados = marcaSel
    ? productos.filter(p => p.id_categoria === marcaSel.id_categoria)
    : productos;
  const modelosBusqueda = textoModelo.trim()
    ? modelosFiltrados.filter(p => p.nombre_modelo.toLowerCase().includes(textoModelo.toLowerCase()))
    : modelosFiltrados;

  const marcaFinal  = marcaSel?.nombre_categoria || textoMarca.trim();
  const modeloFinal = modeloSel?.nombre_modelo || textoModelo.trim();
  const colorFinal  = colorSel?.color || textoColor.trim();
  const resumen = [marcaFinal, modeloFinal, colorFinal].filter(Boolean);

  const pasoNum = { marca:1, modelo:2, color:3, talla:4 };

  const irAtras = () => {
    if (paso === 'marca')  onClose();
    else if (paso === 'modelo') { setModeloSel(null); setMarcaSel(null); setTextoModelo(''); setPaso('marca'); }
    else if (paso === 'color')  { setColorSel(null); setTextoColor(''); setPaso('modelo'); }
    else if (paso === 'talla')  { setTallaSel(null); setSerieSel(null); setPrecioEdit(''); setColorSel(null); setTextoColor(''); setPaso('color'); }
    else onClose();
  };

  const agregarAlCarrito = async (talla, precio) => {
    const t = Number(talla);
    const serie = getSerie(t, serieSel);
    const costo = colorSel && serie && modeloSel?.id_producto
      ? await getCostoCatalogo({ idProducto: modeloSel.id_producto, idColor: colorSel.id_color, serie })
      : 0;
    onAgregar({
      id: Date.now(), sku: null,
      marca: marcaFinal, modelo: modeloFinal,
      desc: `${marcaFinal}${modeloFinal ? ' ' + modeloFinal : ''}`.trim(),
      talla: t, color: colorFinal, precio: Number(precio), cantidad: 1,
      id_producto: modeloSel?.id_producto || null,
      id_color: colorSel?.id_color || null,
      nombre_serie: serie || 'Mediana', costo_estimado: costo,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white max-w-md mx-auto" style={{userSelect:'none',WebkitUserSelect:'none'}}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
        <button onClick={irAtras}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 transition-colors flex-shrink-0">
          <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className="flex-1">
          <div className="flex gap-1">
            {[1,2,3,4].map(n => (
              <div key={n} className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{background: n <= (pasoNum[paso]||1) ? '#0f172a' : '#e2e8f0'}}/>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {paso === 'marca' && 'Marca'}{paso === 'modelo' && 'Modelo'}
            {paso === 'color' && 'Color'}{paso === 'talla' && 'Talla y precio'}
          </p>
        </div>
        {resumen.length > 0 && (
          <div className="text-right flex-shrink-0 max-w-[40%]">
            <p className="text-xs font-black text-slate-900 truncate">{resumen.slice(0,2).join(' ')}</p>
            {resumen.length > 2 && <p className="text-[11px] text-slate-400 truncate">{resumen.slice(2).join(' · ')}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col px-4 pt-4 pb-5 gap-3">
        {cargando && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-slate-300 text-sm animate-pulse">Cargando catálogo...</div>
          </div>
        )}

        {/* PASO 1: MARCA */}
        {!cargando && paso === 'marca' && (
          <>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Marca</p>
            <input type="text" autoComplete="off"
              value={textoMarca}
              onChange={e => { setTextoMarca(e.target.value); setMarcaSel(null); }}
              placeholder="Escribe o selecciona la marca..."
              style={{userSelect:'text',WebkitUserSelect:'text'}}
              className="w-full px-4 py-3 text-base font-bold border-2 border-slate-200 focus:border-slate-900 rounded-2xl outline-none" />
            {marcasFiltradas.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {marcasFiltradas.map(cat => (
                  <button key={cat.id_categoria}
                    onClick={() => { setMarcaSel(cat); setTextoMarca(cat.nombre_categoria); setTextoModelo(''); setPaso('modelo'); }}
                    className="px-4 py-3.5 text-sm font-black rounded-2xl border-2 border-slate-200 bg-white text-slate-800
                      hover:border-slate-400 active:scale-95 active:bg-slate-900 active:text-white active:border-slate-900 transition-all">
                    {cat.nombre_categoria}
                  </button>
                ))}
              </div>
            )}
            {marcasFiltradas.length === 0 && textoMarca.trim() && (
              <p className="text-sm text-slate-400 text-center py-2">"{textoMarca}" no está en el catálogo</p>
            )}
            <button
              onClick={() => {
                if (!textoMarca.trim()) return;
                const match = categorias.find(c => c.nombre_categoria.toLowerCase() === textoMarca.trim().toLowerCase());
                if (match) { setMarcaSel(match); setTextoMarca(match.nombre_categoria); }
                setTextoModelo(''); setPaso('modelo');
              }}
              disabled={!textoMarca.trim()}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-25 active:scale-[0.98] transition-all">
              Siguiente →
            </button>
          </>
        )}

        {/* PASO 2: MODELO */}
        {!cargando && paso === 'modelo' && (
          <>
            <input type="text" autoFocus autoComplete="off"
              value={textoModelo}
              onChange={e => { setTextoModelo(e.target.value); setModeloSel(null); }}
              placeholder={marcaSel ? `Buscar en ${marcaSel.nombre_categoria}...` : 'Escribe el modelo...'}
              style={{userSelect:'text',WebkitUserSelect:'text'}}
              className="w-full px-4 py-3 text-sm font-bold border-2 border-slate-200 focus:border-slate-900 rounded-2xl outline-none" />
            {marcaSel && modelosBusqueda.length > 0 && (
              <div className="space-y-2">
                {modelosBusqueda.map(prod => {
                  const foto = prod.foto_url;
                  return (
                    <button key={prod.id_producto}
                      onClick={() => { setModeloSel(prod); setTextoModelo(prod.nombre_modelo); setTextoColor(''); setPaso('color'); }}
                      className="w-full text-left flex items-center gap-3 p-3 bg-white border-2 border-slate-100 rounded-2xl
                        hover:border-slate-300 active:scale-[0.98] active:border-slate-900 transition-all">
                      <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-slate-100">
                        {foto ? <img src={foto} alt={prod.nombre_modelo} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-slate-300 text-lg font-black">{prod.nombre_modelo?.slice(0,2).toUpperCase()}</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-slate-900 truncate">{prod.nombre_modelo}</p>
                        <p className="text-xs text-slate-400">
                          {typeof prod.categorias === 'object' ? prod.categorias?.nombre_categoria : ''}
                          {prod.precio_venta_sugerido ? ` · ${fmt(prod.precio_venta_sugerido)}` : ''}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
            {marcaSel && modelosBusqueda.length === 0 && textoModelo.trim() && (
              <p className="text-sm text-slate-400 text-center py-2">"{textoModelo}" no está en el catálogo</p>
            )}
            <button
              onClick={() => {
                if (!textoModelo.trim()) return;
                if (marcaSel) {
                  const match = modelosFiltrados.find(p => p.nombre_modelo.toLowerCase() === textoModelo.trim().toLowerCase());
                  if (match) { setModeloSel(match); setTextoModelo(match.nombre_modelo); }
                }
                setTextoColor(''); setPaso('color');
              }}
              disabled={!textoModelo.trim()}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-25 active:scale-[0.98] transition-all">
              Siguiente →
            </button>
          </>
        )}

        {/* PASO 3: COLOR */}
        {!cargando && paso === 'color' && (
          <>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Color{modeloSel ? ` de ${modeloSel.nombre_modelo}` : ''}
            </p>
            {modeloSel && coloresDB.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {coloresDB.map(col => {
                  const foto = col.foto_url;
                  return (
                    <button key={col.id_color}
                      onClick={() => { setColorSel(col); setTextoColor(col.color); setPaso('talla'); }}
                      className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-slate-100 rounded-2xl
                        hover:border-slate-300 active:scale-95 active:border-slate-900 transition-all">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                        {foto ? <img src={foto} alt={col.color} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm font-black">{col.color?.slice(0,3).toUpperCase()}</div>}
                      </div>
                      <span className="text-xs font-black text-slate-700 truncate w-full text-center">{col.color}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {COLORES_RAPIDOS.map(c => (
                <button key={c} onClick={() => setTextoColor(c)}
                  className={`py-3.5 text-base font-black rounded-2xl border-2 transition-all active:scale-95 ${
                    textoColor === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700'
                  }`}>{c}</button>
              ))}
            </div>
            <input type="text" autoComplete="off"
              value={COLORES_RAPIDOS.includes(textoColor) ? '' : textoColor}
              onChange={e => { setTextoColor(e.target.value); setColorSel(null); }}
              onFocus={() => { if (COLORES_RAPIDOS.includes(textoColor)) setTextoColor(''); }}
              placeholder="Otro color..."
              style={{userSelect:'text',WebkitUserSelect:'text'}}
              className="w-full px-4 py-3 text-sm font-bold border-2 border-slate-200 focus:border-slate-900 rounded-2xl outline-none" />
            <button onClick={() => { if (textoColor.trim()) setPaso('talla'); }}
              disabled={!textoColor.trim()}
              className="w-full py-3.5 bg-slate-900 text-white font-black text-base rounded-2xl disabled:opacity-25 active:scale-[0.98] transition-all">
              Siguiente → Talla
            </button>
          </>
        )}

        {/* PASO 4: TALLA + PRECIO */}
        {!cargando && paso === 'talla' && !tallaSel && (
          <>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecciona la talla</p>

            {/* Grupo Pequeña */}
            <div>
              <p className="text-[10px] text-slate-300 font-bold mb-1">Pequeña (27–32)</p>
              <div className="grid grid-cols-6 gap-1.5">
                {[27,28,29,30,31,32].map(t => {
                  const precio = modeloSel ? getPrecioCatalogo('Pequeña', modeloSel, colorSel) : 0;
                  return (
                    <button key={t} onClick={() => { setSerieSel('Pequeña'); setTallaSel(t); setPrecioEdit(precio > 0 ? String(precio) : ''); }}
                      className="py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-800
                        active:scale-90 active:bg-slate-900 active:text-white active:border-slate-900 transition-all flex flex-col items-center">
                      <span className="text-sm font-black">{t}</span>
                      {precio > 0 && <span className="text-[9px] text-slate-400 font-mono">{precio}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grupo Mediana */}
            <div>
              <p className="text-[10px] text-slate-300 font-bold mb-1">Mediana (34–39)</p>
              <div className="grid grid-cols-6 gap-1.5">
                {[34,35,36,37,38,39].map(t => {
                  const precio = modeloSel ? getPrecioCatalogo('Mediana', modeloSel, colorSel) : 0;
                  return (
                    <button key={t} onClick={() => { setSerieSel('Mediana'); setTallaSel(t); setPrecioEdit(precio > 0 ? String(precio) : ''); }}
                      className="py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-800
                        active:scale-90 active:bg-slate-900 active:text-white active:border-slate-900 transition-all flex flex-col items-center">
                      <span className="text-sm font-black">{t}</span>
                      {precio > 0 && <span className="text-[9px] text-slate-400 font-mono">{precio}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grupo Grande */}
            <div>
              <p className="text-[10px] text-slate-300 font-bold mb-1">Grande (38–43)</p>
              <div className="grid grid-cols-6 gap-1.5">
                {[38,39,40,41,42,43].map(t => {
                  const precio = modeloSel ? getPrecioCatalogo('Grande', modeloSel, colorSel) : 0;
                  return (
                    <button key={`g${t}`} onClick={() => { setSerieSel('Grande'); setTallaSel(t); setPrecioEdit(precio > 0 ? String(precio) : ''); }}
                      className="py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-800
                        active:scale-90 active:bg-slate-900 active:text-white active:border-slate-900 transition-all flex flex-col items-center">
                      <span className="text-sm font-black">{t}</span>
                      {precio > 0 && <span className="text-[9px] text-slate-400 font-mono">{precio}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* CONFIRMAR PRECIO (siempre aparece después de seleccionar talla) */}
        {!cargando && paso === 'talla' && tallaSel && (
          <>
            <div className="bg-slate-50 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-black text-sm text-slate-900 truncate">{resumen.slice(0,2).join(' ')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">T{tallaSel} · {colorFinal} · {serieSel || '—'}</p>
                </div>
                <button onClick={() => { setTallaSel(null); setSerieSel(null); setPrecioEdit(''); }}
                  className="text-xs text-slate-400 underline flex-shrink-0">Cambiar</button>
              </div>
            </div>
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Precio de venta</p>
              <div className="flex items-center gap-2 px-4 py-3 border-2 border-slate-200 focus-within:border-slate-900 rounded-2xl transition-colors">
                <span className="text-slate-400 font-bold text-base font-mono">S/</span>
                <input ref={refPrecio} type="number" inputMode="decimal" autoFocus
                  value={precioEdit} onChange={e => setPrecioEdit(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter' && precioEdit) agregarAlCarrito(tallaSel, precioEdit); }}
                  placeholder="0"
                  style={{userSelect:'text',WebkitUserSelect:'text'}}
                  className="flex-1 text-3xl font-black border-none outline-none bg-transparent font-mono text-slate-900 min-w-0" />
              </div>
            </div>
            <button onClick={() => { if (precioEdit) agregarAlCarrito(tallaSel, precioEdit); }}
              disabled={!precioEdit}
              className="w-full py-4 bg-slate-900 text-white font-black text-sm rounded-2xl disabled:opacity-25 active:scale-[0.98] transition-all">
              Agregar al carrito · {fmt(Number(precioEdit)||0)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
// ModalClienteMayorista eliminado — campos inline en barra mayorista

// ─── MayoristaSheet ──────────────────────────────────────────────────────────
function MayoristaSheet({ clienteMayorista, onGuardar, onClose }) {
  const [nombre,   setNombre]   = useState(clienteMayorista?.nombre   || '');
  const [telefono, setTelefono] = useState(clienteMayorista?.telefono || '');
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-5 pt-4 pb-8"
        onClick={e => e.stopPropagation()}>
        <DismissHandle onClose={onClose} />
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Cliente por mayor <span className="font-normal normal-case text-slate-300">(opcional)</span></p>
        <div className="flex gap-2">
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Nombre"
            autoFocus
            className="flex-1 px-3 py-2.5 text-sm border-2 border-slate-200 focus:border-slate-900 rounded-xl outline-none" />
          <input type="tel" inputMode="numeric" value={telefono} onChange={e => setTelefono(e.target.value)}
            placeholder="Teléfono"
            className="w-32 px-3 py-2.5 text-sm border-2 border-slate-200 focus:border-slate-900 rounded-xl outline-none" />
        </div>
        <button
          onPointerDown={e => { e.preventDefault(); onGuardar({ nombre: nombre.trim(), telefono: telefono.trim() }); }}
          className="w-full mt-3 py-3 bg-slate-900 text-white font-black text-sm rounded-2xl active:scale-[0.98] transition-all">
          Listo
        </button>
      </div>
    </div>
  );
}

// ─── VentasPOS principal ──────────────────────────────────────────────────────
export default function VentasPOS({ vendedora, tiendasActivas, logout, onVerInventario, onVerCaja }) {

  // ── Multi-tienda ──────────────────────────────────────────────────────────
  // tiendasActivas: array de tiendas si la vendedora maneja varias, null si solo 1
  const esMultiTienda = !!(tiendasActivas && tiendasActivas.length > 1);
  const [tiendaSelId, setTiendaSelId] = useState(vendedora.id_ubicacion);
  const [mostrarPickerTienda, setMostrarPickerTienda] = useState(false);
  const [dropdownTienda, setDropdownTienda] = useState(false);

  // La tienda "activa" para registrar ventas
  const tiendaActual = esMultiTienda
    ? (tiendasActivas.find(t => t.id_ubicacion === tiendaSelId) || tiendasActivas[0])
    : { id_ubicacion: vendedora.id_ubicacion, nombre: vendedora.nombre };

  // Vendedora con la tienda actual aplicada (para que todo el componente use la tienda correcta)
  const vendedoraEfectiva = esMultiTienda
    ? { ...vendedora, id_ubicacion: tiendaActual.id_ubicacion, nombre: tiendaActual.nombre }
    : vendedora;

  // Cambiar tienda activa
  const cambiarTiendaActiva = (id) => {
    setTiendaSelId(id);
    setDropdownTienda(false);
  };

  // ── Acceso a caja (permiso recurso `caja` en BD, expuesto en sesión como puede_ver_caja) ──
  const tieneAccesoCaja  = vendedora.puede_ver_caja === true;

  // ── Estado del carrito (un solo carrito activo) ───────────────────────────
  const [carrito,          setCarrito]          = useState([]);
  const [descuento,       setDescuento]        = useState('');
  const [pagos,           setPagos]            = useState({ efectivo:'', yape:'', plin:'', tarjeta:'' });
  const [modoMayorista,   setModoMayorista]    = useState(false);
  const [clienteMayorista, setClienteMayorista] = useState(null);

  // ── Cálculos de la venta actual ──────────────────────────────────────────
  const subtotal   = carrito.reduce((s,i) => s + Number(i.precio) * Number(i.cantidad), 0);
  const desc       = Number(descuento) || 0;
  const total      = subtotal - desc;
  const pagado     = Object.values(pagos).reduce((s,v) => s + Number(v||0), 0);
  const vuelto     = Math.max(0, pagado - total);
  const falta      = Math.max(0, total - pagado);
  const totalPares = carrito.reduce((s,i) => s + Number(i.cantidad), 0);

  // ── Estado general ───────────────────────────────────────────────────────
  const carritoRef = useRef(carrito);
  useEffect(() => { carritoRef.current = carrito; }, [carrito]);

  const [panel, setPanel]           = useState('venta');
  const [procesando, setProcesando] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [scannerOn, setScannerOn]     = useState(false);

  const [modalManual,    setModalManual]    = useState(false);
  const [modalMayorista, setModalMayorista] = useState(false);
  const [modalDev,       setModalDev]       = useState(false);
  const [modalDetalle,   setModalDetalle]   = useState(null);
  const [skuDev, setSkuDev]       = useState('');
  const [devInfo, setDevInfo]     = useState(null);
  const [devMotivo, setDevMotivo] = useState('');
  const [devScanner, setDevScanner] = useState(false);
  const [devCargando, setDevCargando] = useState(false);
  const streamDevRef = useRef(null);
  const rafDevRef    = useRef(null);

  const [historial, setHistorial] = useState([]);
  const [statsHoy,  setStatsHoy]  = useState({ cantidad:0, total:0 });

  const videoRef  = useRef(null);
  const rafRef    = useRef(null);
  const streamRef = useRef(null);
  const detectedRef = useRef(false);
  // Lock para evitar que el scanner llame buscar() múltiples veces antes de que resuelva
  const buscandoSkuRef = useRef(null); // SKU que se está procesando actualmente

  useEffect(() => {
    verificarCaja();
    cargarStats();
    // Iniciar cámara automáticamente al montar
    setTimeout(() => iniciarScanner(), 500);
    return () => pararScanner();
  }, []);

  // Multi-tienda: cajas abiertas por cada tienda {id_ubicacion: cajaObj|false}
  const [cajasMulti, setCajasMulti] = useState({});

  const verificarCaja = async () => {
    try {
      if (esMultiTienda) {
        // Verificar caja para TODAS las tiendas que maneja
        const ids = tiendasActivas.map(t => t.id_ubicacion);
        const { data } = await supabase.from('cajas').select('id_caja,id_ubicacion,fecha_apertura')
          .in('id_ubicacion', ids).is('fecha_cierre', null)
          .order('fecha_apertura', { ascending: false });
        const map = {};
        ids.forEach(id => { map[id] = false; });
        (data || []).forEach(c => { if (!map[c.id_ubicacion] || map[c.id_ubicacion] === false) map[c.id_ubicacion] = c; });
        setCajasMulti(map);
        // Si ALGUNA tienda tiene caja abierta, habilitar los botones del POS
        const cualquierCaja = Object.values(map).find(v => v && v !== false);
        setCajaAbierta(cualquierCaja || false);
      } else {
        const { data } = await supabase.from('cajas').select('id_caja,fecha_apertura')
          .eq('id_ubicacion', vendedora.id_ubicacion).is('fecha_cierre', null)
          .order('fecha_apertura', { ascending: false }).limit(1);
        setCajaAbierta(data?.[0] || false);
      }
    } catch { setCajaAbierta(false); }
  };

  const pararScanner = useCallback(() => {
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    detectedRef.current = false;
    setScannerOn(false);
  }, []);

  const iniciarScanner = useCallback(async () => {
    if (streamRef.current) return;
    detectedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      setScannerOn(true);
      await new Promise(r => setTimeout(r, 80));
      if (!videoRef.current) { pararScanner(); return; }

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      if (typeof BarcodeDetector !== 'undefined') {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        let lastBarcodeValue = '';
        let lastBarcodeTime  = 0;
        const tick = async () => {
          if (!streamRef.current) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              const val = codes[0].rawValue;
              const now = Date.now();
              if (val === lastBarcodeValue && now - lastBarcodeTime < 2000) {
                rafRef.current = requestAnimationFrame(tick); return;
              }
              lastBarcodeValue = val;
              lastBarcodeTime  = now;
              if (navigator.vibrate) navigator.vibrate(40);
              buscar(val);
            }
          } catch {}
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Fallback jsQR
      const SCAN_W = 480, SCAN_H = 360;
      const canvas = document.createElement('canvas');
      canvas.width = SCAN_W; canvas.height = SCAN_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let lastScan = 0;
      let lastScannedCode = '';
      let lastScannedTime = 0;
      const tick = (ts) => {
        if (!streamRef.current) return;
        rafRef.current = requestAnimationFrame(tick);
        if (ts - lastScan < 40) return;
        lastScan = ts;
        if (video.readyState < video.HAVE_ENOUGH_DATA) return;
        ctx.drawImage(video, 0, 0, SCAN_W, SCAN_H);
        const imageData = ctx.getImageData(0, 0, SCAN_W, SCAN_H);
        const code = jsQR(imageData.data, SCAN_W, SCAN_H, { inversionAttempts: 'attemptBoth' });
        if (code) {
          // Evitar escanear el mismo código dos veces seguidas en 2 segundos
          if (code.data === lastScannedCode && ts - lastScannedTime < 2000) return;
          lastScannedCode = code.data;
          lastScannedTime = ts;
          if (navigator.vibrate) navigator.vibrate(40);
          buscar(code.data);
        }
      };
      rafRef.current = requestAnimationFrame(tick);

    } catch(e) {
      // Cámara no disponible, silencioso (el botón sigue disponible)
      pararScanner();
    }
  }, [pararScanner]);

  const toggleScanner = () => { if (scannerOn) pararScanner(); else iniciarScanner(); };

  const buscar = async (sku) => {
    if (!sku) return;
    // Evitar procesamiento simultáneo del mismo SKU
    if (buscandoSkuRef.current === sku) return;
    // Verificar si ya está en carrito ANTES de hacer async
    if (carritoRef.current.find(c => c.sku === sku)) return;
    buscandoSkuRef.current = sku;
    // Multi-tienda: buscar en TODAS las tiendas que maneja la vendedora
    const idsToSearch = esMultiTienda
      ? tiendasActivas.map(t => t.id_ubicacion)
      : [vendedora.id_ubicacion];

    // Helper para construir item del carrito desde inventario
    const buildItemFromInv = async (inv, sufijo) => {
      const talla = Number(inv.talla);
      const serie = getSerie(talla) || (talla >= 38 ? 'Grande' : 'Mediana');
      const idProducto = inv.id_producto;
      // Buscar color en catálogo
      let idColor = null;
      let costoEst = 0;
      if (idProducto && inv.color) {
        const { data: colDB } = await supabase.from('colores_modelos')
          .select('id_color')
          .eq('id_producto', idProducto).ilike('color', inv.color).eq('estado','Activo').limit(1);
        if (colDB?.[0]) {
          idColor = colDB[0].id_color;
          costoEst = await getCostoCatalogo({ idProducto, idColor, serie });
        }
      }
      return {
        id: Date.now(), sku: inv.sku_id,
        desc: (inv.productos?.nombre_modelo || '—') + (sufijo || ''),
        marca: '', modelo: '',
        talla, color: inv.color,
        precio: Number(inv.productos?.precio_venta_sugerido), cantidad: 1,
        id_producto: idProducto || null,
        id_color: idColor,
        nombre_serie: serie,
        costo_estimado: costoEst,
        _id_ubicacion_origen: inv.id_ubicacion,
      };
    };

    // 1. Buscar en las tiendas que maneja
    const { data: propios } = await supabase.from('inventario')
      .select('*, productos(nombre_modelo, precio_venta_sugerido), ubicaciones(nombre)')
      .eq('sku_id', sku).eq('estado','Disponible').in('id_ubicacion', idsToSearch);

    const propio = propios?.[0];

    if (propio) {
      if (carritoRef.current.find(c => c.sku === propio.sku_id)) { buscandoSkuRef.current = null; return; }
      const item = await buildItemFromInv(propio);
      // Re-check después del await para evitar race condition
      setCarrito(prev => {
        if (prev.find(c => c.sku === propio.sku_id)) return prev;
        return [...prev, item];
      });
      if (navigator.vibrate) navigator.vibrate(40);
      buscandoSkuRef.current = null;
      return;
    }

    // 2. Buscar en otras tiendas (fuera de las que maneja)
    const { data: externo } = await supabase.from('inventario')
      .select('*, productos(nombre_modelo, precio_venta_sugerido), ubicaciones(nombre)')
      .eq('sku_id', sku).eq('estado','Disponible')
      .single();

    if (!externo) {
      if (navigator.vibrate) navigator.vibrate([80,40,80]);
      buscandoSkuRef.current = null;
      return;
    }

    if (carritoRef.current.find(c => c.sku === externo.sku_id)) { buscandoSkuRef.current = null; return; }

    const tiendaOrigen = externo.ubicaciones?.nombre || 'otra tienda';
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    // Mover inventario a la tienda seleccionada actualmente
    const destino = esMultiTienda ? tiendaSelId : vendedora.id_ubicacion;
    try {
      await supabase.from('inventario').update({ id_ubicacion: destino }).eq('sku_id', externo.sku_id);
      try {
        await supabase.from('traslados').insert([{
          sku_id: externo.sku_id,
          id_ubicacion_orig: externo.id_ubicacion,
          id_ubicacion_dest: destino,
          fecha_traslado: new Date().toISOString(),
          motivo: 'Venta cross-tienda',
          nombre_responsable: vendedora.nombre_display || null,
        }]);
      } catch {}
    } catch {}

    const item = await buildItemFromInv(externo, ` ✦${tiendaOrigen}`);
    // Re-check después del await
    setCarrito(prev => {
      if (prev.find(c => c.sku === externo.sku_id)) return prev;
      return [...prev, item];
    });
    buscandoSkuRef.current = null;
  };

  const actualizarItem = (id, campo, valor) => setCarrito(c => c.map(x => x.id===id ? {...x, [campo]:valor} : x));
  const quitarItem     = (id) => setCarrito(c => c.filter(x => x.id !== id));
  const duplicarItem   = (id) => {
    const item = carrito.find(x => x.id === id);
    if (!item) return;
    // Duplicar sin SKU (el par físico es diferente), mantener campos catálogo
    setCarrito(c => {
      const idx = c.findIndex(x => x.id === id);
      const copia = { ...item, id: Date.now(), sku: null };
      const nueva = [...c];
      nueva.splice(idx + 1, 0, copia);
      return nueva;
    });
  };

  const cargarStats = async () => {
    const idsToLoad = esMultiTienda
      ? tiendasActivas.map(t => t.id_ubicacion)
      : [vendedora.id_ubicacion];
    const { data } = await supabase.from('ventas')
      .select('id_venta,monto_total,tipo_venta,fecha_hora,nombre_vendedora,id_ubicacion')
      .in('id_ubicacion', idsToLoad)
      .gte('fecha_hora', inicioDiaLima())
      .order('fecha_hora', { ascending: false });
    setHistorial(data||[]);
    setStatsHoy({ cantidad: (data||[]).length, total: (data||[]).reduce((s,v)=>s+Number(v.monto_total),0) });
  };

  // Re-verificar caja al cambiar de tienda (para que el warning y botón Caja apunten bien)
  const montadoRef = useRef(false);
  useEffect(() => {
    if (!montadoRef.current) { montadoRef.current = true; return; }
    verificarCaja();
  }, [tiendaSelId]);

  const verDetalle = async (idVenta) => {
    const { data: venta }    = await supabase.from('ventas').select('*').eq('id_venta', idVenta).single();
    const { data: detalles } = await supabase.from('ventas_detalle').select('*').eq('id_venta', idVenta);
    setModalDetalle({ ...venta, items: detalles||[] });
  };

  // ── Finalizar venta cerrada ──────────────────────────────────────────────
  // Multi-tienda: al tocar "Finalizar", si hay varias tiendas con caja, muestra picker
  const intentarFinalizar = () => {
    if (!carrito.length) { alert('Carrito vacío'); return; }
    if (falta > 0.01)    { alert(`Falta: ${fmt(falta)}`); return; }
    if (esMultiTienda) {
      // Si solo 1 tienda tiene caja abierta, ir directo
      const tiendasConCaja = tiendasActivas.filter(t => cajasMulti[t.id_ubicacion] && cajasMulti[t.id_ubicacion] !== false);
      if (tiendasConCaja.length === 1) {
        finalizar(tiendasConCaja[0].id_ubicacion);
      } else if (tiendasConCaja.length > 1) {
        setMostrarPickerTienda(true);
      } else {
        alert('Ninguna tienda tiene caja abierta');
      }
    } else {
      finalizar(vendedora.id_ubicacion);
    }
  };

  const finalizarEnTienda = (idUbicacion) => {
    setMostrarPickerTienda(false);
    finalizar(idUbicacion);
  };

  const finalizar = async (idUbicacionDestino) => {
    if (!carrito.length) return;
    setProcesando(true);
    try {
      const metodoPrincipal = Object.entries(pagos)
        .filter(([,v]) => Number(v)>0).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0] || 'efectivo';
      const { data:venta, error } = await supabase.from('ventas').insert([{
        id_ubicacion:      idUbicacionDestino,
        nombre_vendedora:  vendedora.nombre_display || null,
        ...(vendedora.id_persona ? { id_persona: vendedora.id_persona } : {}),
        monto_total: total, metodo_pago: metodoPrincipal,
        pago_efectivo: Number(pagos.efectivo)||0, pago_yape: Number(pagos.yape)||0,
        pago_plin: Number(pagos.plin)||0, pago_tarjeta: Number(pagos.tarjeta)||0,
        descuento_aplicado: desc, vuelto,
        tipo_venta: modoMayorista ? 'mayorista' : 'contado',
        cliente_nombre: clienteMayorista?.nombre || null,
        cliente_telefono: clienteMayorista?.telefono || null,
        fecha_hora: new Date().toISOString(),
      }]).select().single();
      if (error) throw error;

      await supabase.from('ventas_detalle').insert(
        carrito.map(p => ({
          id_venta: venta.id_venta, sku_id: p.sku,
          descripcion_manual: p.sku ? null : (p.desc || `${p.marca || ''} ${p.modelo || ''}`.trim()),
          marca: p.marca || null,
          modelo: p.modelo || null,
          talla: p.talla,
          color: p.color,
          cantidad: p.cantidad, precio_final_venta: p.precio,
          id_producto: p.id_producto || null,
          id_color: p.id_color || null,
          nombre_serie: p.nombre_serie || null,
          costo_estimado: p.costo_estimado || 0,
        }))
      );
      const skus = carrito.filter(p => p.sku).map(p => p.sku);
      if (skus.length) await supabase.from('inventario')
        .update({ estado:'Vendido', fecha_venta: new Date().toISOString() }).in('sku_id', skus);

      try {
        await supabase.from('analytics_ventas').insert([{
          id_venta: venta.id_venta, id_ubicacion: idUbicacionDestino,
          hora_venta: new Date().getHours(), dia_semana: new Date().getDay(),
          cantidad_items: carrito.length, metodo_pago_principal: metodoPrincipal,
          tiene_descuento: desc > 0,
        }]);
      } catch {}

      if (navigator.vibrate) navigator.vibrate([40,30,40]);
      // Resetear carrito después de venta exitosa
      setCarrito([]);
      setDescuento('');
      setPagos({ efectivo:'', yape:'', plin:'', tarjeta:'' });
      setModoMayorista(false);
      setClienteMayorista(null);
      // Si finalizó en otra tienda, cambiar la vista a esa tienda
      if (esMultiTienda && idUbicacionDestino !== tiendaSelId) {
        setTiendaSelId(idUbicacionDestino);
      }
      cargarStats();
      const nombreTiendaDest = esMultiTienda
        ? (tiendasActivas.find(t => t.id_ubicacion === idUbicacionDestino)?.nombre || '')
        : '';
      alert(`✓ Venta #${venta.id_venta} — ${fmt(total)}${nombreTiendaDest ? ` · ${nombreTiendaDest}` : ''}`);
    } catch(e) { alert('Error: ' + e.message); }
    finally { setProcesando(false); }
  };

  // ── Scanner devolución ────────────────────────────────────────────────────
  const iniciarScannerDev = async () => {
    if (streamDevRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamDevRef.current = stream;
      setDevScanner(true);
      await new Promise(r => setTimeout(r, 80));
      const videoEl = document.getElementById('video-dev');
      if (!videoEl) { pararScannerDev(); return; }
      videoEl.srcObject = stream;
      await videoEl.play();

      if (typeof BarcodeDetector !== 'undefined') {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!streamDevRef.current) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes.length > 0) {
              pararScannerDev();
              setSkuDev(codes[0].rawValue);
              buscarParaDev(codes[0].rawValue);
              if (navigator.vibrate) navigator.vibrate(40);
              return;
            }
          } catch {}
          rafDevRef.current = requestAnimationFrame(tick);
        };
        rafDevRef.current = requestAnimationFrame(tick);
        return;
      }

      const SCAN_W = 480, SCAN_H = 360;
      const canvas = document.createElement('canvas');
      canvas.width = SCAN_W; canvas.height = SCAN_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let lastScan = 0;
      const tick = (ts) => {
        if (!streamDevRef.current) return;
        rafDevRef.current = requestAnimationFrame(tick);
        if (ts - lastScan < 40) return; lastScan = ts;
        if (videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return;
        ctx.drawImage(videoEl, 0, 0, SCAN_W, SCAN_H);
        const img = ctx.getImageData(0, 0, SCAN_W, SCAN_H);
        const code = jsQR(img.data, SCAN_W, SCAN_H, { inversionAttempts: 'attemptBoth' });
        if (code) {
          pararScannerDev();
          setSkuDev(code.data);
          buscarParaDev(code.data);
          if (navigator.vibrate) navigator.vibrate(40);
        }
      };
      rafDevRef.current = requestAnimationFrame(tick);
    } catch(e) { alert('Error cámara: ' + e.message); setDevScanner(false); }
  };

  const pararScannerDev = () => {
    if (rafDevRef.current) { cancelAnimationFrame(rafDevRef.current); rafDevRef.current = null; }
    if (streamDevRef.current) { streamDevRef.current.getTracks().forEach(t => t.stop()); streamDevRef.current = null; }
    setDevScanner(false);
  };

  const buscarParaDev = async (sku) => {
    if (!sku.trim()) return;
    setDevCargando(true); setDevInfo(null);
    try {
      // Multi-tienda: buscar en todas las tiendas que maneja
      const idsToSearch = esMultiTienda
        ? tiendasActivas.map(t => t.id_ubicacion)
        : [vendedora.id_ubicacion];
      const { data: inv } = await supabase.from('inventario')
        .select('*, productos(nombre_modelo, precio_venta_sugerido)')
        .eq('sku_id', sku.trim()).in('id_ubicacion', idsToSearch).single();
      if (!inv) { alert('Producto no encontrado en tus tiendas'); setDevCargando(false); return; }
      if (inv.estado !== 'Vendido') { alert(`Este par está en estado "${inv.estado}", no fue vendido`); setDevCargando(false); return; }
      const { data: vd } = await supabase.from('ventas_detalle')
        .select('precio_final_venta, id_venta, ventas(fecha_hora, nombre_vendedora)')
        .eq('sku_id', sku.trim()).order('id_detalle', { ascending: false }).limit(1).single();
      setDevInfo({
        sku: sku.trim(), modelo: inv.productos?.nombre_modelo || '—',
        talla: inv.talla, color: inv.color,
        precio: vd?.precio_final_venta || inv.productos?.precio_venta_sugerido || 0,
        fechaVenta: vd?.ventas?.fecha_hora, vendedora: vd?.ventas?.nombre_vendedora,
        idVenta: vd?.id_venta,
      });
    } catch(e) { alert('Error: ' + e.message); }
    finally { setDevCargando(false); }
  };

  const confirmarDev = async () => {
    if (!devInfo) return;
    setDevCargando(true);
    try {
      await supabase.from('inventario').update({ estado:'Disponible', fecha_venta: null }).eq('sku_id', devInfo.sku);
      await supabase.from('devoluciones').insert([{
        sku_id: devInfo.sku, id_ubicacion: vendedora.id_ubicacion,
        motivo: devMotivo || 'Devolución', observaciones: devMotivo,
        fecha_devolucion: new Date().toISOString(),
      }]);
      if (cajaAbierta?.id_caja) {
        await supabase.from('movimientos_caja').insert([{
          id_caja: cajaAbierta.id_caja, id_ubicacion: vendedora.id_ubicacion,
          tipo: 'egreso',
          ...(vendedora.id_persona ? { id_persona: vendedora.id_persona } : {}),
          monto: Number(devInfo.precio),
          concepto: `Devolución ${devInfo.modelo} T${devInfo.talla} ${devInfo.color} · SKU ${devInfo.sku}`,
          metodo: 'efectivo', fecha_movimiento: new Date().toISOString(),
        }]);
      }
      if (navigator.vibrate) navigator.vibrate([40,30,40]);
      setSkuDev(''); setDevInfo(null); setDevMotivo(''); setModalDev(false);
      cargarStats();
      alert(`✓ Devolución procesada · -${fmt(devInfo.precio)} de caja`);
    } catch(e) { alert('Error: ' + e.message); }
    finally { setDevCargando(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-white text-slate-900 h-screen overflow-hidden max-w-md mx-auto" style={{userSelect:"none",WebkitUserSelect:"none"}}>

      {/* Header */}
      <header className="bg-white sticky top-0 z-20 border-b border-slate-100">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="font-black text-lg tracking-tight">
              {modoMayorista ? '📦 MAYOR' : 'VENTAS'}
            </span>
            <span className="text-xs text-slate-400">{vendedora.nombre_display}</span>
            {!esMultiTienda && vendedora.nombre && (
              <span className="text-[10px] font-bold text-slate-300 font-mono">
                {vendedora.nombre.replace(/[^0-9]/g, '') || vendedora.nombre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {statsHoy.cantidad > 0 && (
              <span className="text-xs text-slate-500 font-bold font-mono">{statsHoy.cantidad} · {fmt(statsHoy.total)}</span>
            )}
            <button onClick={() => setModalDev(true)} className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/>
              </svg>
            </button>
            <button onClick={logout} className="text-xs text-slate-400 px-2 py-1">Salir</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-4 border-t border-slate-100">
          {/* Selector de tienda multi — ocupa el lugar del primer tab */}
          {esMultiTienda && (
            <span className="relative mr-3">
              <button onClick={() => setDropdownTienda(!dropdownTienda)}
                className="py-2.5 text-sm font-bold text-blue-600 flex items-center gap-1 active:opacity-70 transition-opacity">
                {tiendaActual.nombre.replace(/[^0-9]/g, '') || tiendaActual.nombre}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {dropdownTienda && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setDropdownTienda(false)} />
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden min-w-[150px]">
                    {tiendasActivas.map(t => {
                      const isActiva = t.id_ubicacion === tiendaSelId;
                      const cajaOk = cajasMulti[t.id_ubicacion] && cajasMulti[t.id_ubicacion] !== false;
                      return (
                        <button key={t.id_ubicacion}
                          onClick={() => cambiarTiendaActiva(t.id_ubicacion)}
                          className={`w-full px-4 py-2.5 text-left text-sm font-bold flex items-center justify-between gap-3 transition-colors ${
                            isActiva ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                          }`}>
                          <span>{t.nombre}</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cajaOk ? 'bg-green-400' : isActiva ? 'bg-red-300' : 'bg-red-400'}`} />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </span>
          )}
          {[['venta','Venta'],['historial','Hoy']].map(([k,l]) => (
            <button key={k} onClick={() => setPanel(k)}
              className={`mr-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                panel===k ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-400'
              }`}>{l}</button>
          ))}
          {tieneAccesoCaja && (
          <button onClick={() => { onVerCaja(esMultiTienda ? tiendaSelId : undefined); verificarCaja(); }}
            className="ml-auto py-2.5 px-3 text-sm font-medium text-green-600 border-b-2 border-transparent flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
            </svg>Caja
          </button>
          )}
          <button onClick={onVerInventario} className="py-2.5 px-3 text-sm font-medium text-slate-400 border-b-2 border-transparent">Stock →</button>
        </div>
      </header>

      {/* Panel Venta */}
      {panel === 'venta' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {cajaAbierta === false && (
            <div className="mx-4 mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl flex-shrink-0 flex items-center justify-between">
              <span className="font-black text-amber-800 text-sm">Caja no abierta</span>
              {tieneAccesoCaja && (
                <button onClick={() => { onVerCaja(esMultiTienda ? tiendaSelId : undefined); verificarCaja(); }}
                  className="ml-3 px-3 py-1.5 bg-amber-800 text-white text-xs font-bold rounded-lg active:scale-95 flex-shrink-0">
                  Abrir →
                </button>
              )}
            </div>
          )}


          {/* Barra de acciones */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
            <div className="flex gap-2">
              {/* QR toggle — siempre activo si hay cámara */}
              <button onClick={cajaAbierta ? toggleScanner : undefined} disabled={!cajaAbierta}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 ${
                  !cajaAbierta ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                  scannerOn ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <rect x={3} y={3} width={7} height={7} rx={1}/><rect x={14} y={3} width={7} height={7} rx={1}/>
                  <rect x={3} y={14} width={7} height={7} rx={1}/>
                  <path d="M14 14h2v2h-2zM18 14v2h2M14 18h2M18 18h2v2"/>
                </svg>
                QR
              </button>

              {/* Agregar manual */}
              <button onClick={cajaAbierta ? () => setModalManual(true) : undefined} disabled={!cajaAbierta}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  !cajaAbierta ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
                Agregar
              </button>

              {/* Toggle Mayorista */}
              <button
                onClick={() => {
                  if (!cajaAbierta) return;
                  if (!modoMayorista) {
                    setModoMayorista(true);
                    setClienteMayorista(null);
                    setModalMayorista(true);
                  } else {
                    setModoMayorista(false);
                    setClienteMayorista(null);
                  }
                }}
                disabled={!cajaAbierta}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors flex-shrink-0 ${
                  !cajaAbierta ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                  modoMayorista ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}>
                📦
              </button>

            </div>

            {/* Cámara QR */}
            {scannerOn && (
              <div className="relative mt-2 overflow-hidden bg-black" style={{borderRadius:16,height:160}}>
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />

                {/* Oscurecer bordes con 4 franjas, dejando ventana central limpia */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: `linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.55) 100%)`
                }}/>
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: `linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 22%, transparent 78%, rgba(0,0,0,0.55) 100%)`
                }}/>

                {/* Esquinas del visor — líneas finas y cortas, estilo profesional */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative" style={{width:110,height:110}}>
                    {/* Línea de escaneo animada */}
                    <div style={{
                      position:'absolute', left:0, right:0, height:1,
                      background:'rgba(255,255,255,0.7)',
                      boxShadow:'0 0 6px 1px rgba(255,255,255,0.5)',
                      animation:'scanLine 1.8s ease-in-out infinite',
                      top:'50%',
                    }}/>
                    {/* Esquinas */}
                    <div style={{position:'absolute',top:0,left:0,width:18,height:18,borderTop:'2px solid #fff',borderLeft:'2px solid #fff'}}/>
                    <div style={{position:'absolute',top:0,right:0,width:18,height:18,borderTop:'2px solid #fff',borderRight:'2px solid #fff'}}/>
                    <div style={{position:'absolute',bottom:0,left:0,width:18,height:18,borderBottom:'2px solid #fff',borderLeft:'2px solid #fff'}}/>
                    <div style={{position:'absolute',bottom:0,right:0,width:18,height:18,borderBottom:'2px solid #fff',borderRight:'2px solid #fff'}}/>
                  </div>
                </div>

                <style>{`@keyframes scanLine { 0%,100%{top:20%} 50%{top:80%} }`}</style>
              </div>
            )}
          </div>



          {/* Carrito — scrollable */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-2 min-h-0">
            {carrito.length === 0 && (
              <div className="flex items-center justify-center h-40 text-slate-300">
                <div className="text-center space-y-2">
                  <svg className="w-12 h-12 mx-auto text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
                  </svg>
                  <p className="text-sm">Escanea QR o toca Agregar</p>
                </div>
              </div>
            )}

            {carrito.length > 0 && (
              <div className="space-y-2">
                {carrito.map(it => (
                  <CarritoItem
                    key={it.id}
                    item={it}
                    onUpdate={actualizarItem}
                    onRemove={quitarItem}
                    onDuplicate={duplicarItem}
                    esMayorista={modoMayorista}
                  />
                ))}

              </div>
            )}
          </div>

          {/* Panel de pago */}
          {carrito.length > 0 && (
            <div className="border-t-4 border-slate-100 bg-white px-4 pt-3 pb-5 space-y-3 flex-shrink-0">
              <div className="space-y-2">
                {desc > 0 && (
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-mono">{fmt(subtotal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Descuento</span>
                  <input type="number" value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="0"
                    className="w-20 px-2 py-1 text-right font-mono text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-900" />
                </div>
                <div className="flex justify-between items-center font-black">
                  <span className="text-lg">Total</span>
                  <span className="font-mono text-2xl">{fmt(total)}</span>
                </div>
              </div>
              <SeccionPago total={total} pagos={pagos} setPagos={setPagos} />
              <button onClick={intentarFinalizar} disabled={procesando || falta > 0.01 || !cajaAbierta}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all active:scale-[0.98] ${
                  procesando || falta > 0.01 || !cajaAbierta
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : modoMayorista
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-600 text-white'
                }`}>
                {procesando ? 'Procesando...' : !cajaAbierta ? 'Abre caja primero' :
                  modoMayorista ? 'Confirmar mayorista' : 'Finalizar venta'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panel Historial */}
      {panel === 'historial' && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {historial.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-300">
              <div className="text-center">
                <svg className="w-14 h-14 mx-auto mb-2 text-slate-200" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/>
                </svg>
                <p className="text-sm">Sin ventas hoy</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map(v => (
                <button key={v.id_venta} onClick={() => verDetalle(v.id_venta)}
                  className="w-full text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 transition-all active:scale-[0.98]">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-slate-400 font-mono">#{v.id_venta}</div>
                        {v.tipo_venta === 'mayorista' && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">📦 Mayor</span>}
                      </div>
                      <div className="font-bold text-lg font-mono">{fmt(v.monto_total)}</div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{new Date(v.fecha_hora).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',timeZone:'America/Lima'})}</div>
                      <div className="mt-1 text-blue-600 font-medium">Ver →</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Detalle Venta */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalDetalle(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Venta #{modalDetalle.id_venta}</h3>
                {modalDetalle.tipo_venta === 'mayorista' && <span className="text-xs text-amber-600 font-bold">📦 Mayorista</span>}
                {modalDetalle.cliente_nombre && <p className="text-xs text-slate-500 mt-0.5">{modalDetalle.cliente_nombre}</p>}
              </div>
              <button onClick={() => setModalDetalle(null)} className="text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="text-sm"><div className="flex justify-between"><span className="text-slate-500">Fecha</span><span className="font-mono">{new Date(modalDetalle.fecha_hora).toLocaleString('es-PE')}</span></div></div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-500 mb-2">Productos</div>
                <div className="space-y-2">
                  {(modalDetalle.items||[]).map((it,idx) => (
                    <div key={idx} className="flex justify-between items-start p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {it.sku_id
                            ? `SKU ${it.sku_id}`
                            : (it.marca && it.modelo)
                              ? `${it.marca} ${it.modelo}`
                              : it.descripcion_manual || '—'
                          }
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {it.talla && `T${it.talla}`}{it.color && ` · ${it.color}`}
                          {it.nombre_serie && ` · ${it.nombre_serie}`}
                        </div>
                        {it.costo_estimado > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Costo: {fmt(it.costo_estimado)}</div>
                        )}
                      </div>
                      <div className="text-right ml-3">
                        <div className="font-mono font-bold">{fmt(it.precio_final_venta)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                {modalDetalle.descuento_aplicado > 0 && (
                  <div className="flex justify-between text-sm text-orange-600"><span>Descuento</span><span className="font-mono">-{fmt(modalDetalle.descuento_aplicado)}</span></div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1 border-t border-slate-200"><span>Total</span><span className="font-mono">{fmt(modalDetalle.monto_total)}</span></div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-500 mb-2">Pagos</div>
                <div className="grid grid-cols-2 gap-2">
                  {[['Efectivo',modalDetalle.pago_efectivo],['Yape',modalDetalle.pago_yape],['Plin',modalDetalle.pago_plin],['Tarjeta',modalDetalle.pago_tarjeta]]
                    .filter(([,v]) => v > 0).map(([k,v]) => (
                      <div key={k} className="p-2 bg-slate-50 rounded-lg">
                        <div className="text-xs text-slate-500">{k}</div>
                        <div className="font-mono font-bold text-sm">{fmt(v)}</div>
                      </div>
                    ))}
                </div>
                {modalDetalle.vuelto > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg flex justify-between">
                    <span className="text-sm text-green-700">Vuelto</span>
                    <span className="font-mono font-bold text-green-700">{fmt(modalDetalle.vuelto)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheet cliente mayorista — aparece una vez al activar */}
      {modalMayorista && (
        <MayoristaSheet
          clienteMayorista={clienteMayorista}
          onGuardar={(cliente) => {
            setClienteMayorista(cliente);
            setModalMayorista(false);
          }}
          onClose={() => setModalMayorista(false)}
        />
      )}

      {/* Modal Catálogo (antes ModalManual) */}
      {modalManual && (
        <ModalCatalogo
          onAgregar={item => setCarrito(c => [...c, item])}
          onClose={() => setModalManual(false)}
        />
      )}



      {/* Modal Devolución */}
      {modalDev && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => { setModalDev(false); pararScannerDev(); setDevInfo(null); setSkuDev(''); setDevMotivo(''); }}>
          <div className="bg-white rounded-t-3xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <DismissHandle onClose={() => { setModalDev(false); pararScannerDev(); setDevInfo(null); setSkuDev(''); setDevMotivo(''); }} />
              <div className="px-1">
                <h3 className="text-lg font-black">Devolución</h3>
                <p className="text-xs text-slate-400 mt-0.5">Escanea el QR o escribe el SKU</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {!devInfo && (
                <>
                  <button onClick={devScanner ? pararScannerDev : iniciarScannerDev}
                    className={`w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                      devScanner ? 'bg-slate-900 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.875h.75v.75h-.75v-.75zM16.875 6.75h.75v.75h-.75v-.75z"/>
                    </svg>
                    {devScanner ? 'Cerrar cámara' : 'Escanear QR'}
                  </button>

                  {devScanner && (
                    <div className="relative rounded-2xl overflow-hidden bg-black" style={{height:160}}>
                      <video id="video-dev" className="w-full h-full object-cover" muted playsInline autoPlay />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-32 h-32 border-2 border-white/70 rounded-xl" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-100"/>
                    <span className="text-xs text-slate-400 font-medium">o escribe el código</span>
                    <div className="flex-1 h-px bg-slate-100"/>
                  </div>

                  <div className="flex gap-2">
                    <input type="text" value={skuDev} autoComplete="off"
                      onChange={e => setSkuDev(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') buscarParaDev(skuDev); }}
                      placeholder="SKU-123456"
                      className="flex-1 px-4 py-3 font-mono text-sm border-2 border-slate-200 rounded-xl outline-none focus:border-orange-400"/>
                    <button onClick={() => buscarParaDev(skuDev)} disabled={!skuDev.trim() || devCargando}
                      className="px-4 py-3 bg-slate-900 text-white font-bold rounded-xl disabled:opacity-30 active:scale-95 transition-all">
                      {devCargando ? '...' : 'Buscar'}
                    </button>
                  </div>
                </>
              )}

              {devInfo && (
                <>
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black text-base text-slate-900">{devInfo.modelo}</p>
                        <p className="text-sm text-slate-600 mt-0.5">T{devInfo.talla} · {devInfo.color}</p>
                        <p className="text-xs text-slate-400 font-mono mt-1">{devInfo.sku}</p>
                        {devInfo.fechaVenta && (
                          <p className="text-xs text-slate-500 mt-1">
                            Vendido {new Date(devInfo.fechaVenta).toLocaleDateString('es-PE')}
                            {devInfo.vendedora ? ` · ${devInfo.vendedora}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black font-mono text-orange-700">{fmt(devInfo.precio)}</p>
                        <p className="text-xs text-orange-500 mt-0.5">a devolver</p>
                      </div>
                    </div>
                  </div>

                  {cajaAbierta?.id_caja ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                      <span className="text-green-600 text-lg">✓</span>
                      <p className="text-xs text-green-700 font-medium">
                        Se registrará egreso de <strong>{fmt(devInfo.precio)}</strong> en caja
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-amber-500 text-lg">⚠</span>
                      <p className="text-xs text-amber-700">No hay caja abierta — el egreso no se registrará</p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
                      Motivo <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {['Talla incorrecta','Defecto','No le gustó','Cambio de modelo'].map(m => (
                        <button key={m} onClick={() => setDevMotivo(m)}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border-2 transition-all ${
                            devMotivo === m ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}>{m}</button>
                      ))}
                    </div>
                    <input type="text" value={devMotivo} onChange={e => setDevMotivo(e.target.value)}
                      placeholder="O escribe el motivo..."
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-orange-400"/>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setDevInfo(null); setSkuDev(''); setDevMotivo(''); }}
                      className="flex-1 py-3 text-sm font-bold text-slate-600 border-2 border-slate-200 rounded-2xl active:scale-95 transition-all">
                      ← Cambiar
                    </button>
                    <button onClick={confirmarDev} disabled={devCargando}
                      className="flex-1 py-3 text-sm font-black text-white bg-orange-600 rounded-2xl disabled:opacity-30 active:scale-[0.98] transition-all">
                      {devCargando ? 'Procesando...' : `Confirmar · -${fmt(devInfo.precio)}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Picker rápido de tienda (multi-tienda, al finalizar venta) ──────── */}
      {mostrarPickerTienda && esMultiTienda && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setMostrarPickerTienda(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md mx-auto pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="px-5 pb-3">
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider">¿En qué tienda fue esta venta?</p>
              <p className="text-[10px] text-slate-300 mt-0.5">{fmt(total)} · {totalPares} {totalPares === 1 ? 'par' : 'pares'}</p>
            </div>
            <div className="px-5 space-y-2">
              {tiendasActivas.map(t => {
                const cajaOk = cajasMulti[t.id_ubicacion] && cajasMulti[t.id_ubicacion] !== false;
                return (
                  <button key={t.id_ubicacion}
                    onPointerDown={e => { e.preventDefault(); if (cajaOk) finalizarEnTienda(t.id_ubicacion); }}
                    disabled={!cajaOk || procesando}
                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl font-black text-lg transition-all active:scale-[0.98] ${
                      cajaOk
                        ? 'bg-blue-600 text-white active:bg-blue-700'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    }`}>
                    <span>{t.nombre}</span>
                    <div className="flex items-center gap-2">
                      {!cajaOk && <span className="text-xs font-normal">Sin caja</span>}
                      <span className={`w-2 h-2 rounded-full ${cajaOk ? 'bg-green-300' : 'bg-red-300'}`} />
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setMostrarPickerTienda(false)}
              className="w-full mt-3 py-2 text-xs text-slate-400 font-medium">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}