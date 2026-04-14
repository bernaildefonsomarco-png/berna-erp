import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../api/supabase';

const fmt = n => `S/${Number(n || 0).toFixed(2)}`;
const hoy = () => new Date().toISOString().split('T')[0];
const diasDesde = f => f ? Math.floor((Date.now() - new Date(f)) / 86400000) : 0;
const BUCKET = 'modelos-fotos';
const fU = path => { try { return path ? `${supabase.supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}` : null } catch { return null } };
const resolvePhoto = p => { if (!p) return null; if (p.startsWith('http://') || p.startsWith('https://')) return p; return fU(p) };

const INJECT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes zoomIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes cartBounce{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
.inv-fade{animation:fadeIn .25s ease-out both}
.inv-slide{animation:slideUp .3s cubic-bezier(.22,1,.36,1) both}
.inv-zoom{animation:zoomIn .2s ease-out both}
.inv-shimmer{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}
.inv-font,.inv-font *{font-family:'Outfit',sans-serif!important}
.inv-scroll::-webkit-scrollbar{display:none}.inv-scroll{-ms-overflow-style:none;scrollbar-width:none}
.inv-img-cover{object-fit:cover;object-position:center}
.inv-card-hover{transition:transform .15s ease,box-shadow .15s ease}
.inv-card-hover:active{transform:scale(0.97)}
.inv-cart-bounce{animation:cartBounce .3s ease}
.inv-check{transition:all .15s ease}
`;
const stagger = i => ({ animationDelay: `${i * 40}ms` });

/* ── Lightbox ─────────────────────────────────────────────────────────────── */
const Lightbox = ({ src, onClose }) => {
  if (!src) return null;
  return (<div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 inv-fade" onClick={onClose}>
    <img src={src} alt="" className="inv-zoom max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
    <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
    <p className="absolute bottom-6 left-0 right-0 text-center text-white/40 text-xs font-medium">Toca fuera para cerrar</p>
  </div>);
};

/* ── Sub-components ───────────────────────────────────────────────────────── */
const NoPhoto = ({ size = 'md', label, className = '' }) => {
  const s = size === 'lg' ? 'h-52' : size === 'sm' ? 'h-16 w-16' : 'h-36';
  return (<div className={`${s} w-full bg-gradient-to-br from-stone-100 to-stone-200 flex flex-col items-center justify-center gap-1 ${className}`}>
    <svg className={`${size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'} text-stone-300`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>
    {label && <span className="text-[10px] text-stone-400 font-medium">{label}</span>}
  </div>);
};
const SkeletonCard = () => (<div className="rounded-2xl overflow-hidden border border-stone-200/60"><div className="h-36 inv-shimmer" /><div className="p-3 space-y-2"><div className="h-4 w-3/4 rounded inv-shimmer" /><div className="h-3 w-1/2 rounded inv-shimmer" /></div></div>);
const StockBadge = ({ cant }) => {
  if (cant === 0) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">Agotado</span>;
  if (cant <= 2) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Últimos {cant}</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{cant} pares</span>;
};
const COLOR_MAP = { 'negro': '#1a1a1a', 'blanco': '#f5f5f5', 'rojo': '#dc2626', 'azul': '#2563eb', 'verde': '#16a34a', 'amarillo': '#eab308', 'rosa': '#ec4899', 'morado': '#9333ea', 'naranja': '#ea580c', 'gris': '#6b7280', 'marrón': '#92400e', 'marron': '#92400e', 'beige': '#d4c5a9', 'celeste': '#38bdf8', 'turquesa': '#14b8a6', 'dorado': '#d4a017', 'plateado': '#a8a29e', 'crema': '#f5f0e1', 'camel': '#c19a6b', 'vino': '#722f37', 'cognac': '#9a4e1c', 'tan': '#d2b48c', 'nude': '#e8c4a2', 'coral': '#f97316' };
const ColorDot = ({ color, size = 14 }) => {
  const hex = COLOR_MAP[color?.toLowerCase()] || '#94a3b8';
  const isLight = ['blanco', 'beige', 'crema', 'nude', 'amarillo'].includes(color?.toLowerCase());
  return <span className={`inline-block rounded-full flex-shrink-0 ${isLight ? 'ring-1 ring-stone-300' : ''}`} style={{ width: size, height: size, backgroundColor: hex }} />;
};

/* ══════════════════════════════════════════════════════════════════════════ */
export default function Inventario({ vendedora, logout, onVolver }) {
  const [items, setItems] = useState([]); const [productos, setProductos] = useState([]); const [coloresModelos, setColoresModelos] = useState([]);
  const [categorias, setCategorias] = useState([]); const [ubicaciones, setUbicaciones] = useState([]); const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('galeria'); const [busqueda, setBusqueda] = useState(''); const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStock, setFiltroStock] = useState(''); const [ordenar, setOrdenar] = useState('nombre');
  const [modalProducto, setModalProducto] = useState(null); const [modalColor, setModalColor] = useState(null); const [lightboxSrc, setLightboxSrc] = useState(null);
  const [modalSKU, setModalSKU] = useState(null); const [historialSKU, setHistorialSKU] = useState(null);
  const [modalTransferir, setModalTransferir] = useState(null); const [transfDest, setTransfDest] = useState(''); const [transfCant, setTransfCant] = useState(1); const [transfTalla, setTransfTalla] = useState('');
  const [modalBaja, setModalBaja] = useState(null); const [bajaTipo, setBajaTipo] = useState('dañado'); const [bajaMot, setBajaMot] = useState(''); const [procesando, setProcesando] = useState(false);
  const [ventasHoy, setVentasHoy] = useState([]); const [todasTiendas, setTodasTiendas] = useState([]);
  const [stats, setStats] = useState({ disponibles: 0, modelos: 0, valor: 0, bajoStock: 0, vendidosHoy: 0 });

  /* ── CARRITO ─────────────────────────────────────────────────────────────── */
  const [carrito, setCarrito] = useState([]); // [{sku_id, id_producto, nombre, color, talla, precio, foto_url}]
  const [carritoOpen, setCarritoOpen] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);

  const agregarAlCarrito = (item, prodData) => {
    if (carrito.find(c => c.sku_id === item.sku_id)) return; // ya está
    const colorInfo = prodData.coloresInfo?.find(ci => ci.color === item.color);
    const precio = colorInfo?.precio_especial_grande || colorInfo?.precio_especial_mediana || colorInfo?.precio_especial_chica || prodData.precio;
    const foto = resolvePhoto(colorInfo?.foto_url) || resolvePhoto(prodData.foto_url);
    setCarrito(prev => [...prev, { sku_id: item.sku_id, id_producto: prodData.id_producto, nombre: prodData.nombre, color: item.color, talla: item.talla, precio: Number(precio || 0), foto_url: foto }]);
    setCartBounce(true); setTimeout(() => setCartBounce(false), 350);
    if (navigator.vibrate) navigator.vibrate(20);
  };
  const quitarDelCarrito = skuId => setCarrito(prev => prev.filter(c => c.sku_id !== skuId));
  const enCarrito = skuId => carrito.some(c => c.sku_id === skuId);
  const totalCarrito = carrito.reduce((s, c) => s + c.precio, 0);
  const vaciarCarrito = () => { setCarrito([]); setCarritoOpen(false) };

  const registrarVenta = async () => {
    if (carrito.length === 0) return;
    setProcesando(true);
    try {
      // 1. Crear la venta
      const { data: venta, error: errV } = await supabase.from('ventas').insert([{
        id_ubicacion: vendedora.id_ubicacion,
        nombre_vendedora: vendedora.nombre_display || vendedora.nombre || 'Vendedora',
        monto_total: totalCarrito,
        fecha_hora: new Date().toISOString(),
      }]).select('id_venta').single();
      if (errV) throw errV;

      // 2. Crear detalle de cada par vendido
      const detalles = carrito.map(item => ({
        id_venta: venta.id_venta,
        sku_id: item.sku_id,
        precio_final_venta: item.precio,
        descripcion_manual: `${item.nombre} - ${item.color}`,
        talla: item.talla,
        color: item.color,
      }));
      const { error: errD } = await supabase.from('ventas_detalle').insert(detalles);
      if (errD) throw errD;

      // 3. Marcar cada SKU como vendido
      const skuIds = carrito.map(c => c.sku_id);
      const { error: errU } = await supabase.from('inventario').update({ estado: 'Vendido' }).in('sku_id', skuIds);
      if (errU) throw errU;

      // 4. Limpiar y recargar
      setCarrito([]);
      setCarritoOpen(false);
      await cargarTodo();
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      alert(`Venta registrada: ${carrito.length} par${carrito.length !== 1 ? 'es' : ''} — ${fmt(totalCarrito)}`);
    } catch (e) {
      console.error(e);
      alert('Error al registrar venta: ' + (e.message || e));
    } finally { setProcesando(false) }
  };

  const searchRef = useRef(null);

  /* ── Carga ──────────────────────────────────────────────────────────────── */
  useEffect(() => { cargarTodo() }, [vendedora]);
  const cargarTodo = async () => {
    setCargando(true); try {
      const { data: inv } = await supabase.from('inventario').select('sku_id,talla,color,estado,id_producto,fecha_ingreso,id_ubicacion,costo_fabricacion,productos(nombre_modelo,precio_venta_sugerido,foto_url,id_categoria,precio_grande,precio_mediana,precio_chica,estado)').eq('id_ubicacion', vendedora.id_ubicacion).order('talla'); setItems(inv || []);
      const { data: prods } = await supabase.from('productos').select('id_producto,nombre_modelo,precio_venta_sugerido,foto_url,id_categoria,precio_grande,precio_mediana,precio_chica,estado,descripcion').eq('estado', 'Activo'); setProductos(prods || []);
      const { data: colores } = await supabase.from('colores_modelos').select('id_color,id_producto,color,foto_url,costo_grande,costo_mediana,costo_chica,precio_especial_grande,precio_especial_mediana,precio_especial_chica,estado').eq('estado', 'Activo'); setColoresModelos(colores || []);
      const { data: cats } = await supabase.from('categorias').select('id_categoria,nombre_categoria'); setCategorias(cats || []);
      const { data: ubs } = await supabase.from('ubicaciones').select('id_ubicacion,nombre').eq('activa', true).eq('rol', 'Tienda'); setUbicaciones((ubs || []).filter(u => u.id_ubicacion !== vendedora.id_ubicacion));
      const { data: ventas } = await supabase.from('ventas').select('id_venta,monto_total,nombre_vendedora,fecha_hora,ventas_detalle(sku_id,precio_final_venta,descripcion_manual,talla,color)').eq('id_ubicacion', vendedora.id_ubicacion).gte('fecha_hora', hoy()).order('fecha_hora', { ascending: false }); setVentasHoy(ventas || []);
      const { data: todas } = await supabase.from('inventario').select('sku_id,talla,color,estado,id_ubicacion,nombre_tienda,id_producto,productos(nombre_modelo,precio_venta_sugerido,foto_url),ubicaciones(nombre)').eq('estado', 'Disponible').order('talla'); setTodasTiendas(todas || []);
      const disp = (inv || []).filter(i => i.estado === 'Disponible'); const modelos = new Set(disp.map(i => i.id_producto)).size; const valor = disp.reduce((s, i) => s + Number(i.productos?.precio_venta_sugerido || 0), 0);
      const tallaMap = {}; disp.forEach(i => { const k = `${i.id_producto}_${i.color}_${i.talla}`; tallaMap[k] = (tallaMap[k] || 0) + 1 }); const bajoStock = Object.values(tallaMap).filter(c => c <= 1).length;
      setStats({ disponibles: disp.length, modelos, valor, bajoStock, vendidosHoy: (ventas || []).reduce((s, v) => s + (v.ventas_detalle?.length || 0), 0) });
    } catch (e) { console.error(e) } finally { setCargando(false) }
  };

  /* ── Datos procesados ───────────────────────────────────────────────────── */
  const disponibles = useMemo(() => items.filter(i => i.estado === 'Disponible'), [items]);

  const galeriaProductos = useMemo(() => {
    const map = {};
    for (const i of disponibles) {
      const pid = i.id_producto;
      if (!map[pid]) {
        const prod = productos.find(p => p.id_producto === pid);
        const coloresDelProd = coloresModelos.filter(c => c.id_producto === pid);
        map[pid] = { id_producto: pid, nombre: i.productos?.nombre_modelo || prod?.nombre_modelo || '—', precio: i.productos?.precio_venta_sugerido || prod?.precio_venta_sugerido, foto_url: prod?.foto_url || i.productos?.foto_url, id_categoria: i.productos?.id_categoria || prod?.id_categoria, coloresInfo: coloresDelProd, colores: {}, totalStock: 0, fechaMin: null };
      }
      const g = map[pid];
      if (!g.colores[i.color]) {
        const colorInfo = g.coloresInfo.find(c => c.color === i.color);
        g.colores[i.color] = { color: i.color, foto_url: colorInfo?.foto_url, precio_especial: colorInfo?.precio_especial_grande || colorInfo?.precio_especial_mediana || colorInfo?.precio_especial_chica, tallas: {}, total: 0, skus: [], tallaSkus: {} };
      }
      const c = g.colores[i.color]; const t = String(i.talla);
      c.tallas[t] = (c.tallas[t] || 0) + 1; c.total++; c.skus.push(i.sku_id);
      if (!c.tallaSkus[t]) c.tallaSkus[t] = []; c.tallaSkus[t].push(i.sku_id);
      g.totalStock++; const fi = new Date(i.fecha_ingreso); if (!g.fechaMin || fi < g.fechaMin) g.fechaMin = fi;
    }
    return Object.values(map);
  }, [disponibles, productos, coloresModelos]);

  const galeriaFiltrada = useMemo(() => {
    let l = [...galeriaProductos];
    if (busqueda) { const b = busqueda.toLowerCase(); l = l.filter(g => g.nombre.toLowerCase().includes(b) || Object.keys(g.colores).some(c => c.toLowerCase().includes(b))) }
    if (filtroCategoria) l = l.filter(g => String(g.id_categoria) === filtroCategoria);
    if (filtroStock === 'bajo') l = l.filter(g => Object.values(g.colores).some(c => Object.values(c.tallas).some(n => n <= 1)));
    if (ordenar === 'stock') l.sort((a, b) => a.totalStock - b.totalStock);
    else if (ordenar === 'precio') l.sort((a, b) => Number(b.precio || 0) - Number(a.precio || 0));
    else if (ordenar === 'reciente') l.sort((a, b) => (b.fechaMin || 0) - (a.fechaMin || 0));
    else l.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return l;
  }, [galeriaProductos, busqueda, filtroCategoria, filtroStock, ordenar]);

  const gruposRed = useMemo(() => {
    const map = {};
    for (const i of todasTiendas) { const pid = i.id_producto; if (!map[pid]) map[pid] = { id_producto: pid, nombre: i.productos?.nombre_modelo || '—', precio: i.productos?.precio_venta_sugerido, foto_url: i.productos?.foto_url, tiendas: {} }; const ub = i.ubicaciones?.nombre || i.nombre_tienda || `Tienda ${i.id_ubicacion}`; if (!map[pid].tiendas[ub]) map[pid].tiendas[ub] = { total: 0, tallas: {} }; const t = String(i.talla); map[pid].tiendas[ub].tallas[t] = (map[pid].tiendas[ub].tallas[t] || 0) + 1; map[pid].tiendas[ub].total++ }
    let l = Object.values(map); if (busqueda) { const b = busqueda.toLowerCase(); l = l.filter(g => g.nombre.toLowerCase().includes(b)) } return l.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [todasTiendas, busqueda]);

  /* ── Acciones ───────────────────────────────────────────────────────────── */
  const verSKU = async (skuId) => { setModalSKU(skuId); setHistorialSKU(null); const { data: inv } = await supabase.from('inventario').select('*,productos(nombre_modelo,foto_url)').eq('sku_id', skuId).single(); const { data: vd } = await supabase.from('ventas_detalle').select('id_venta,ventas(fecha_hora,nombre_vendedora,monto_total)').eq('sku_id', skuId); const { data: dev } = await supabase.from('devoluciones').select('fecha_devolucion,motivo,observaciones').eq('sku_id', skuId); const movs = []; if (inv?.fecha_produccion) movs.push({ tipo: 'produccion', fecha: inv.fecha_produccion, detalle: 'Producido en fábrica' }); if (inv?.fecha_ingreso) movs.push({ tipo: 'ingreso', fecha: inv.fecha_ingreso, detalle: `Ingresó a ${vendedora.nombre}` }); (vd || []).forEach(v => movs.push({ tipo: 'venta', fecha: v.ventas?.fecha_hora, detalle: `Vendido por ${v.ventas?.nombre_vendedora || '—'} — ${fmt(v.ventas?.monto_total)}` })); (dev || []).forEach(d => movs.push({ tipo: 'devolucion', fecha: d.fecha_devolucion, detalle: `${d.motivo || 'Devolución'}${d.observaciones ? ': ' + d.observaciones : ''}` })); movs.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); setHistorialSKU({ inv, movs }) };
  const ejecutarTransferencia = async () => { if (!transfDest) return; setProcesando(true); try { let pool = transfTalla && modalTransferir.tallaSkus?.[transfTalla] ? modalTransferir.tallaSkus[transfTalla] : modalTransferir.skus; await supabase.from('inventario').update({ id_ubicacion: Number(transfDest) }).in('sku_id', pool.slice(0, transfCant)); setModalTransferir(null); await cargarTodo(); if (navigator.vibrate) navigator.vibrate(40) } catch (e) { alert('Error: ' + e.message) } finally { setProcesando(false) } };
  const ejecutarBaja = async () => { if (!bajaMot.trim()) return; setProcesando(true); try { await supabase.from('inventario').update({ estado: 'Baja' }).eq('sku_id', modalBaja); await supabase.from('devoluciones').insert([{ sku_id: modalBaja, id_ubicacion: vendedora.id_ubicacion, motivo: bajaTipo, observaciones: bajaMot, fecha_devolucion: new Date().toISOString() }]); setModalBaja(null); setBajaMot(''); await cargarTodo() } catch (e) { alert('Error: ' + e.message) } finally { setProcesando(false) } };
  const exportarCSV = () => { const cab = 'Modelo,Color,Tallas,Total,Precio,Valor\n'; const filas = []; galeriaFiltrada.forEach(g => { Object.values(g.colores).forEach(c => { const ts = Object.entries(c.tallas).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, n]) => `T${t}x${n}`).join(' '); filas.push(`"${g.nombre}","${c.color}","${ts}",${c.total},${g.precio},${(c.total * Number(g.precio || 0)).toFixed(2)}`) }) }); const blob = new Blob([cab + filas.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `inventario_${vendedora.nombre}_${hoy()}.csv`; a.click() };
  const catNombre = id => categorias.find(c => c.id_categoria === id)?.nombre_categoria || '';

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (<><style>{INJECT_CSS}</style><div className="inv-font min-h-screen flex flex-col max-w-lg mx-auto" style={{ background: '#faf9f7' }}>

    {/* HEADER */}
    <header className="sticky top-0 z-30" style={{ background: '#faf9f7' }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <button onClick={onVolver} className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center active:scale-90 transition-transform shadow-sm"><svg className="w-4 h-4 text-stone-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button>
          <div><h1 className="text-xl font-extrabold text-stone-900 tracking-tight leading-none">Inventario</h1><p className="text-[11px] text-stone-400 font-medium mt-0.5">{vendedora.nombre}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarCSV} className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center active:scale-90 transition-transform shadow-sm"><svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></button>
          <button onClick={() => cargarTodo()} className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center active:scale-90 transition-transform shadow-sm"><svg className={`w-4 h-4 text-stone-500 ${cargando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg></button>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto inv-scroll">
        {[{ label: 'En tienda', value: stats.disponibles, bg: 'bg-emerald-50', text: 'text-emerald-800' }, { label: 'Modelos', value: stats.modelos, bg: 'bg-blue-50', text: 'text-blue-800' }, ...(stats.bajoStock > 0 ? [{ label: 'Stock bajo', value: stats.bajoStock, bg: 'bg-amber-50', text: 'text-amber-800' }] : []), { label: 'Hoy', value: `${stats.vendidosHoy}p`, bg: 'bg-violet-50', text: 'text-violet-800' }].map(s => (<div key={s.label} className={`flex-shrink-0 ${s.bg} rounded-xl px-3.5 py-2 min-w-[80px]`}><p className={`text-[10px] font-semibold ${s.text} opacity-60 uppercase tracking-wider`}>{s.label}</p><p className={`text-lg font-extrabold ${s.text} leading-tight`}>{s.value}</p></div>))}
      </div>
      <div className="flex px-4 gap-1 pb-2">
        {[{ k: 'galeria', l: 'Galería', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' }, { k: 'red', l: 'Red', icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21' }, { k: 'vendidos', l: 'Hoy', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' }].map(t => (<button key={t.k} onClick={() => setTab(t.k)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${tab === t.k ? 'bg-stone-900 text-white shadow-md shadow-stone-900/10' : 'bg-white text-stone-500 border border-stone-200 active:scale-95'}`}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>{t.l}</button>))}
      </div>
      {(tab === 'galeria' || tab === 'red') && (<div className="px-4 pb-3 space-y-2">
        <div className="relative"><svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg><input ref={searchRef} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar modelo o color..." className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 transition-all shadow-sm" />{busqueda && <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}</div>
        {tab === 'galeria' && <div className="flex gap-1.5 overflow-x-auto inv-scroll pb-0.5"><button onClick={() => setFiltroCategoria('')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!filtroCategoria ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 border border-stone-200'}`}>Todos</button>{categorias.map(c => <button key={c.id_categoria} onClick={() => setFiltroCategoria(filtroCategoria === String(c.id_categoria) ? '' : String(c.id_categoria))} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroCategoria === String(c.id_categoria) ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 border border-stone-200'}`}>{c.nombre_categoria}</button>)}<div className="flex-shrink-0 w-px bg-stone-200 my-1" /><button onClick={() => setFiltroStock(filtroStock === 'bajo' ? '' : 'bajo')} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filtroStock === 'bajo' ? 'bg-amber-500 text-white' : 'bg-white text-amber-600 border border-amber-200'}`}>⚠ Bajo</button></div>}
      </div>)}
    </header>

    <main className="flex-1 overflow-y-auto" style={{ paddingBottom: carrito.length > 0 ? '100px' : '32px' }}>

      {/* GALERÍA */}
      {tab === 'galeria' && <div className="px-4 pt-2">
        {cargando ? <div className="grid grid-cols-2 gap-3">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
          : galeriaFiltrada.length === 0 ? <div className="text-center py-20"><p className="text-5xl mb-3">👟</p><p className="text-sm font-semibold text-stone-400">No se encontraron modelos</p>{busqueda && <button onClick={() => setBusqueda('')} className="mt-2 text-xs text-stone-500 underline">Limpiar búsqueda</button>}</div>
            : <><div className="flex items-center justify-between mb-3"><p className="text-xs text-stone-400 font-medium">{galeriaFiltrada.length} modelos · {stats.disponibles} pares</p><select value={ordenar} onChange={e => setOrdenar(e.target.value)} className="text-xs bg-white border border-stone-200 rounded-lg px-2 py-1 text-stone-600 font-medium outline-none"><option value="nombre">A→Z</option><option value="stock">Menor stock</option><option value="precio">Mayor precio</option><option value="reciente">Más reciente</option></select></div>
              <div className="grid grid-cols-2 gap-3">{galeriaFiltrada.map((prod, idx) => {
                const coloresArr = Object.values(prod.colores);
                // FIX: Priorizar foto del MODELO, no del color
                const fotoPortada = resolvePhoto(prod.foto_url) || resolvePhoto(coloresArr.find(c => c.foto_url)?.foto_url);
                const tieneStockBajo = coloresArr.some(c => Object.values(c.tallas).some(n => n <= 1));
                return (<div key={prod.id_producto} className="inv-fade inv-card-hover rounded-2xl overflow-hidden bg-white border border-stone-200/60 shadow-sm cursor-pointer" style={stagger(idx)} onClick={() => { setModalProducto(prod); setModalColor(null) }}>
                  <div className="relative">{fotoPortada ? <img src={fotoPortada} alt={prod.nombre} className="w-full h-40 inv-img-cover" loading="lazy" onError={e => { e.target.onerror = null; e.target.style.display = 'none' }} /> : <NoPhoto />}<div className="absolute top-2 right-2"><StockBadge cant={prod.totalStock} /></div>{tieneStockBajo && <div className="absolute top-2 left-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 block shadow-sm shadow-amber-400/50" /></div>}</div>
                  <div className="p-3"><h3 className="text-sm font-bold text-stone-900 leading-tight truncate">{prod.nombre}</h3><div className="flex items-center justify-between mt-1.5"><span className="text-sm font-extrabold text-stone-700">{fmt(prod.precio)}</span><div className="flex items-center gap-1">{coloresArr.slice(0, 4).map(c => <ColorDot key={c.color} color={c.color} size={10} />)}{coloresArr.length > 4 && <span className="text-[9px] text-stone-400 font-bold ml-0.5">+{coloresArr.length - 4}</span>}</div></div>{prod.id_categoria && <p className="text-[10px] text-stone-400 font-medium mt-1 truncate">{catNombre(prod.id_categoria)}</p>}</div>
                </div>);
              })}</div></>}
      </div>}

      {/* RED */}
      {tab === 'red' && <div className="px-4 pt-2">{gruposRed.length === 0 ? <div className="text-center py-20"><p className="text-5xl mb-3">🏪</p><p className="text-sm font-semibold text-stone-400">Sin stock en la red</p></div> : <div className="space-y-3"><p className="text-xs text-stone-400 font-medium">{gruposRed.length} modelos en todas las tiendas</p>{gruposRed.map((g, idx) => { const fotoRed = resolvePhoto(g.foto_url); return (<div key={g.id_producto} className="inv-fade bg-white rounded-2xl border border-stone-200/60 overflow-hidden shadow-sm" style={stagger(idx)}><div className="flex items-center gap-3 p-3.5 border-b border-stone-100">{fotoRed ? <img src={fotoRed} alt={g.nombre} className="w-12 h-12 rounded-xl inv-img-cover flex-shrink-0 cursor-pointer" onClick={() => setLightboxSrc(fotoRed)} /> : <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0"><span className="text-lg">👟</span></div>}<div className="flex-1 min-w-0"><h3 className="text-sm font-bold text-stone-900 truncate">{g.nombre}</h3><p className="text-xs text-stone-400 font-medium">{fmt(g.precio)}</p></div></div><div className="p-3 space-y-2">{Object.entries(g.tiendas).map(([tienda, data]) => { const esMia = tienda === vendedora.nombre; return (<div key={tienda} className={`rounded-xl p-2.5 ${esMia ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-stone-50'}`}><div className="flex justify-between items-center mb-1.5"><span className={`text-xs font-bold ${esMia ? 'text-emerald-700' : 'text-stone-600'}`}>{tienda}{esMia ? ' ← tú' : ''}</span><span className="text-xs font-extrabold text-stone-800">{data.total}p</span></div><div className="flex flex-wrap gap-1">{Object.entries(data.tallas).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, c]) => <span key={t} className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${c <= 1 ? 'bg-amber-100 text-amber-700' : 'bg-white text-stone-600 border border-stone-200'}`}>T{t}×{c}</span>)}</div></div>) })}</div></div>) })}</div>}</div>}

      {/* VENDIDOS HOY */}
      {tab === 'vendidos' && <div className="px-4 pt-2">{ventasHoy.length === 0 ? <div className="text-center py-20"><p className="text-5xl mb-3">📊</p><p className="text-sm font-semibold text-stone-400">Sin ventas hoy todavía</p></div> : <><div className="grid grid-cols-3 gap-2 mb-4">{[{ l: 'Ventas', v: ventasHoy.length, bg: 'bg-emerald-50', t: 'text-emerald-800' }, { l: 'Total', v: fmt(ventasHoy.reduce((s, v) => s + Number(v.monto_total), 0)), bg: 'bg-violet-50', t: 'text-violet-800' }, { l: 'Pares', v: ventasHoy.reduce((s, v) => s + (v.ventas_detalle?.length || 0), 0), bg: 'bg-blue-50', t: 'text-blue-800' }].map(s => <div key={s.l} className={`${s.bg} rounded-xl p-3 text-center`}><p className={`text-xl font-extrabold ${s.t}`}>{s.v}</p><p className={`text-[10px] font-semibold ${s.t} opacity-60`}>{s.l}</p></div>)}</div><div className="space-y-2">{ventasHoy.map((v, idx) => <div key={v.id_venta} className="inv-fade bg-white rounded-2xl border border-stone-200/60 p-3.5 shadow-sm" style={stagger(idx)}><div className="flex justify-between items-center mb-2"><div className="flex items-center gap-2"><span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">#{v.id_venta}</span><span className="text-xs text-stone-500 font-medium">{new Date(v.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>{v.nombre_vendedora && <span className="text-xs text-blue-600 font-semibold">{v.nombre_vendedora}</span>}</div><span className="font-extrabold text-sm text-stone-900">{fmt(v.monto_total)}</span></div>{(v.ventas_detalle || []).map((d, i) => <div key={i} className="flex justify-between text-xs py-1.5 border-t border-stone-100"><span className="text-stone-600 font-medium">{d.descripcion_manual || d.sku_id?.slice(-10) || '—'}{d.talla && <span className="text-stone-400 ml-1">T{d.talla}</span>}{d.color && <span className="text-stone-400 ml-1">· {d.color}</span>}</span><span className="font-bold text-stone-700">{fmt(d.precio_final_venta)}</span></div>)}</div>)}</div></>}</div>}
    </main>

    {/* ═══ MODAL PRODUCTO ═══════════════════════════════════════════════════ */}
    {modalProducto && (() => {
      const coloresArr = Object.values(modalProducto.colores);
      const colorActivo = modalColor || coloresArr[0];
      // FIX: En la ficha, mostrar foto del color activo si tiene; sino foto del modelo
      const fotoActiva = resolvePhoto(colorActivo?.foto_url) || resolvePhoto(modalProducto.foto_url);
      const precioActivo = colorActivo?.precio_especial || modalProducto.precio;
      const skusPorTalla = {};
      if (colorActivo) { colorActivo.skus.forEach(sku => { const item = disponibles.find(i => i.sku_id === sku); if (item) { const t = String(item.talla); if (!skusPorTalla[t]) skusPorTalla[t] = []; skusPorTalla[t].push(item) } }) }

      return (
        <div className="fixed inset-0 z-50 inv-fade"><div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setModalProducto(null); setModalColor(null) }} /><div className="inv-slide absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] shadow-2xl" style={{ maxHeight: '92vh' }}><div className="overflow-y-auto inv-scroll" style={{ maxHeight: '92vh' }}>
          <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white rounded-t-[28px] z-10"><div className="w-10 h-1 rounded-full bg-stone-300" /></div>

          {/* Foto grande */}
          <div className="relative mx-4 mt-1 rounded-2xl overflow-hidden">
            {fotoActiva ? <img src={fotoActiva} alt={modalProducto.nombre} className="w-full h-56 inv-img-cover cursor-pointer active:opacity-90 transition-opacity" onClick={() => setLightboxSrc(fotoActiva)} onError={e => { e.target.onerror = null; e.target.style.display = 'none' }} /> : <NoPhoto size="lg" label={modalProducto.nombre} />}
            {fotoActiva && <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1 pointer-events-none"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" /></svg><span className="text-[10px] text-white font-semibold">Ver foto</span></div>}
            <button onClick={() => { setModalProducto(null); setModalColor(null) }} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-10"><h2 className="text-xl font-extrabold text-white leading-tight">{modalProducto.nombre}</h2><div className="flex items-center justify-between mt-1">{catNombre(modalProducto.id_categoria) && <p className="text-xs text-white/70 font-medium">{catNombre(modalProducto.id_categoria)}</p>}<span className="text-lg font-extrabold text-white">{fmt(precioActivo)}</span></div></div>
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-2 mx-4 mt-3"><div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-2xl font-extrabold text-emerald-700">{colorActivo?.total || 0}</p><p className="text-[10px] font-semibold text-emerald-600">pares este color</p></div><div className="bg-stone-50 rounded-xl p-3 text-center"><p className="text-2xl font-extrabold text-stone-700">{modalProducto.totalStock}</p><p className="text-[10px] font-semibold text-stone-500">total del modelo</p></div></div>

          {/* Colores */}
          {coloresArr.length > 1 && <div className="mx-4 mt-4"><p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Colores disponibles</p><div className="flex gap-2 overflow-x-auto inv-scroll pb-1">{coloresArr.map(c => { const isActive = (modalColor?.color || coloresArr[0]?.color) === c.color; const fotoColor = resolvePhoto(c.foto_url); return (<button key={c.color} onClick={() => setModalColor(c)} className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${isActive ? 'border-stone-900 bg-stone-50' : 'border-stone-200 bg-white active:scale-95'}`}>{fotoColor ? <img src={fotoColor} className="w-9 h-9 rounded-lg inv-img-cover" alt={c.color} /> : <ColorDot color={c.color} size={20} />}<div className="text-left"><span className="text-xs font-bold text-stone-800 block capitalize leading-tight">{c.color}</span><span className="text-[10px] text-stone-400">{c.total}p</span></div></button>) })}</div></div>}

          {/* Tallas */}
          <div className="mx-4 mt-4"><p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Tallas — <span className="capitalize">{colorActivo?.color || ''}</span></p><div className="flex flex-wrap gap-2">{colorActivo && Object.entries(colorActivo.tallas).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, c]) => <div key={t} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 ${c === 0 ? 'border-red-200 bg-red-50' : c <= 1 ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}><span className="text-sm font-extrabold text-stone-800">{t}</span><span className={`text-[10px] font-bold ${c === 0 ? 'text-red-500' : c <= 1 ? 'text-amber-600' : 'text-stone-400'}`}>{c === 0 ? 'agotado' : c === 1 ? 'último!' : `×${c}`}</span></div>)}</div></div>

          {/* GALERÍA DE UNIDADES — con checkbox de carrito */}
          {colorActivo && colorActivo.skus.length > 0 && <div className="mx-4 mt-5"><p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Unidades en tienda ({colorActivo.total})</p>
            {Object.entries(skusPorTalla).sort((a, b) => Number(a[0]) - Number(b[0])).map(([talla, skuItems]) => { const cantTalla = skuItems.length; const fotoTalla = resolvePhoto(colorActivo.foto_url) || resolvePhoto(modalProducto.foto_url); return (
              <div key={talla} className="mb-4">
                <div className="flex items-center gap-2 mb-2"><span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${cantTalla <= 1 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-700'}`}>Talla {talla}</span><span className="text-[11px] text-stone-400 font-medium">{cantTalla} {cantTalla === 1 ? 'par' : 'pares'}</span>{cantTalla === 1 && <span className="text-[10px] text-amber-600 font-bold animate-pulse">¡Último!</span>}</div>
                <div className="grid grid-cols-3 gap-2">{skuItems.map((item, i) => { const dias = diasDesde(item.fecha_ingreso); const estaEnCarrito = enCarrito(item.sku_id); return (
                  <div key={item.sku_id} className={`inv-fade rounded-xl overflow-hidden shadow-sm cursor-pointer inv-card-hover relative ${estaEnCarrito ? 'ring-2 ring-emerald-400 bg-emerald-50' : 'bg-white border border-stone-200/60'}`} style={stagger(i)}>
                    {/* Botón agregar/quitar del carrito */}
                    <button onClick={(e) => { e.stopPropagation(); if (estaEnCarrito) quitarDelCarrito(item.sku_id); else agregarAlCarrito(item, modalProducto) }}
                      className={`absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all inv-check ${estaEnCarrito ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-white/80 backdrop-blur-sm border border-stone-300'}`}>
                      {estaEnCarrito
                        ? <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        : <svg className="w-3 h-3 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      }
                    </button>
                    <div className="relative aspect-square bg-stone-50" onClick={() => { setModalProducto(null); setModalColor(null); verSKU(item.sku_id) }}>
                      {fotoTalla ? <img src={fotoTalla} alt="" className="w-full h-full inv-img-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><span className="text-xl">👟</span></div>}
                      <div className="absolute bottom-1 left-1 bg-white/90 backdrop-blur-sm rounded-md px-1.5 py-0.5"><span className="text-[11px] font-extrabold text-stone-800">T{talla}</span></div>
                      <span className={`absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded-full ${dias > 60 ? 'bg-red-100 text-red-600' : dias > 30 ? 'bg-amber-100 text-amber-600' : 'bg-white/80 text-stone-500'}`}>{dias}d</span>
                    </div>
                    <div className="px-1.5 py-1.5 text-center"><p className="text-[9px] font-mono text-stone-400 truncate">{item.sku_id.slice(-8)}</p></div>
                  </div>) })}</div>
              </div>) })}
            <p className="text-[10px] text-stone-400 text-center mt-1 mb-1">Toca <span className="inline-block w-3.5 h-3.5 bg-stone-200 rounded-full align-middle" /> para agregar al carrito · Toca la foto para ver historial</p>
          </div>}

          {/* Transferir */}
          <div className="mx-4 mt-5 mb-6"><button onClick={() => { setModalProducto(null); setModalColor(null); setModalTransferir({ ...colorActivo, nombre_modelo: modalProducto.nombre, id_producto: modalProducto.id_producto }); setTransfDest(''); setTransfCant(1); setTransfTalla('') }} className="w-full py-3.5 rounded-2xl bg-stone-900 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-stone-900/20"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>Transferir</button></div>
        </div></div></div>
      );
    })()}

    {/* ═══ MODAL SKU ═══════════════════════════════════════════════════════ */}
    {modalSKU && <div className="fixed inset-0 z-50 inv-fade"><div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModalSKU(null)} /><div className="inv-slide absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] shadow-2xl" style={{ maxHeight: '88vh' }}><div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-stone-300" /></div><div className="overflow-y-auto px-5 pb-8 inv-scroll" style={{ maxHeight: '82vh' }}>
      <div className="flex items-start gap-3 mb-4">{(() => { const fotoUrl = resolvePhoto(historialSKU?.inv?.productos?.foto_url); return fotoUrl ? <img src={fotoUrl} alt="" className="w-14 h-14 rounded-xl inv-img-cover flex-shrink-0 cursor-pointer" onClick={() => setLightboxSrc(fotoUrl)} /> : <div className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0"><span className="text-xl">👟</span></div> })()}<div className="flex-1 min-w-0"><p className="text-[10px] font-mono text-stone-400">{modalSKU}</p><h3 className="text-lg font-extrabold text-stone-900 leading-tight">{historialSKU?.inv?.productos?.nombre_modelo || '...'}</h3></div><button onClick={() => setModalSKU(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 active:scale-90 flex-shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      {!historialSKU ? <div className="text-center py-12"><div className="w-8 h-8 border-2 border-stone-300 border-t-stone-900 rounded-full animate-spin mx-auto" /></div> : <>
        <div className="grid grid-cols-3 gap-2 mb-5">{[{ l: 'Talla', v: historialSKU.inv?.talla }, { l: 'Color', v: historialSKU.inv?.color }, { l: 'Estado', v: historialSKU.inv?.estado, color: historialSKU.inv?.estado === 'Disponible' ? 'text-emerald-700' : historialSKU.inv?.estado === 'Vendido' ? 'text-stone-500' : 'text-red-500' }].map(s => <div key={s.l} className="bg-stone-50 rounded-xl p-3 text-center"><p className="text-[10px] text-stone-400 font-semibold">{s.l}</p><p className={`text-sm font-extrabold ${s.color || 'text-stone-800'}`}>{s.v}</p></div>)}</div>
        <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">Historial</p><div className="space-y-0 relative ml-3"><div className="absolute left-[5px] top-3 bottom-3 w-0.5 bg-stone-200" />{historialSKU.movs.map((m, i) => <div key={i} className="flex gap-3.5 pb-5 relative"><div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 z-10 ring-2 ring-white ${({ produccion: 'bg-stone-400', ingreso: 'bg-blue-500', venta: 'bg-emerald-500', devolucion: 'bg-orange-400' })[m.tipo] || 'bg-stone-300'}`} /><div className="flex-1"><p className="text-sm font-medium text-stone-800">{m.detalle}</p><p className="text-[11px] text-stone-400 font-mono mt-0.5">{new Date(m.fecha).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div></div>)}</div>
        {historialSKU.inv?.estado === 'Disponible' && <button onClick={() => { setModalSKU(null); setModalBaja(modalSKU); setBajaMot(''); setBajaTipo('dañado') }} className="w-full mt-3 py-3 text-sm font-bold text-red-600 border-2 border-red-200 rounded-2xl hover:bg-red-50 active:scale-[0.98] transition-all">Dar de baja este par</button>}
      </>}
    </div></div></div>}

    {/* ═══ MODAL TRANSFERIR ═══════════════════════════════════════════════ */}
    {modalTransferir && <div className="fixed inset-0 z-50 inv-fade"><div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModalTransferir(null)} /><div className="inv-slide absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] shadow-2xl p-5 pb-8">
      <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full bg-stone-300" /></div>
      <div className="flex justify-between items-start mb-5"><div><h3 className="text-lg font-extrabold text-stone-900">Transferir</h3><p className="text-sm text-stone-500 font-medium">{modalTransferir.nombre_modelo} · {modalTransferir.color}</p></div><button onClick={() => setModalTransferir(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Talla a transferir</p><div className="flex flex-wrap gap-2 mb-4"><button onClick={() => { setTransfTalla(''); setTransfCant(1) }} className={`px-4 py-2.5 text-xs font-bold rounded-xl border-2 transition-all ${transfTalla === '' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 active:scale-95'}`}>Todas</button>{Object.entries(modalTransferir.tallaSkus || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, skus]) => <button key={t} onClick={() => { setTransfTalla(t); setTransfCant(1) }} className={`px-4 py-2.5 text-xs font-bold rounded-xl border-2 transition-all ${transfTalla === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-stone-200 text-stone-600 active:scale-95'}`}>T{t} <span className="opacity-60">×{skus.length}</span></button>)}</div>
      <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Tienda destino</p><div className="grid grid-cols-3 gap-2 mb-4">{ubicaciones.map(u => <button key={u.id_ubicacion} onClick={() => setTransfDest(String(u.id_ubicacion))} className={`py-3 text-sm font-bold rounded-xl border-2 transition-all ${transfDest === String(u.id_ubicacion) ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 active:scale-95'}`}>{u.nombre}</button>)}</div>
      {(() => { const maxCant = transfTalla && modalTransferir.tallaSkus?.[transfTalla] ? modalTransferir.tallaSkus[transfTalla].length : modalTransferir.total || modalTransferir.skus?.length || 0; return <><p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Cantidad (máx. {maxCant})</p><div className="flex items-center gap-4 bg-stone-50 rounded-2xl p-4 mb-5"><button onClick={() => setTransfCant(c => Math.max(1, c - 1))} className="w-12 h-12 border border-stone-300 bg-white rounded-xl font-extrabold text-xl flex items-center justify-center active:scale-90 transition-transform shadow-sm">−</button><div className="flex-1 text-center"><div className="text-4xl font-extrabold text-stone-900">{transfCant}</div><div className="text-xs text-stone-400 font-medium">pares{transfTalla ? ` T${transfTalla}` : ''}</div></div><button onClick={() => setTransfCant(c => Math.min(maxCant, c + 1))} className="w-12 h-12 border border-stone-300 bg-white rounded-xl font-extrabold text-xl flex items-center justify-center active:scale-90 transition-transform shadow-sm">+</button></div></> })()}
      <button onClick={ejecutarTransferencia} disabled={procesando || !transfDest} className="w-full py-4 font-extrabold rounded-2xl bg-stone-900 text-white disabled:opacity-30 active:scale-[0.98] transition-all shadow-lg shadow-stone-900/20">{procesando ? 'Transfiriendo...' : `Transferir ${transfCant} par${transfCant !== 1 ? 'es' : ''}`}</button>
    </div></div>}

    {/* ═══ MODAL BAJA ═════════════════════════════════════════════════════ */}
    {modalBaja && <div className="fixed inset-0 z-50 inv-fade"><div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModalBaja(null)} /><div className="inv-slide absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] shadow-2xl p-5 pb-8">
      <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full bg-stone-300" /></div>
      <div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-extrabold text-stone-900">Dar de baja</h3><p className="text-xs text-stone-400 font-mono mt-0.5">{modalBaja}</p></div><button onClick={() => setModalBaja(null)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 active:scale-90"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
      <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Tipo</p><div className="grid grid-cols-3 gap-2 mb-4">{[{ k: 'dañado', emoji: '💔', label: 'Dañado' }, { k: 'perdido', emoji: '❓', label: 'Perdido' }, { k: 'muestra', emoji: '🏷️', label: 'Muestra' }].map(t => <button key={t.k} onClick={() => setBajaTipo(t.k)} className={`py-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${bajaTipo === t.k ? 'border-red-400 bg-red-50' : 'border-stone-200 active:scale-95'}`}><span className="text-lg">{t.emoji}</span><span className="text-xs font-bold text-stone-700">{t.label}</span></button>)}</div>
      <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Motivo</p><input value={bajaMot} onChange={e => setBajaMot(e.target.value)} placeholder="Describe qué pasó..." className="w-full px-4 py-3 border border-stone-300 rounded-xl outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 text-sm mb-5 transition-all" />
      <button onClick={ejecutarBaja} disabled={procesando || !bajaMot.trim()} className="w-full py-4 font-extrabold rounded-2xl bg-red-600 text-white disabled:opacity-30 active:scale-[0.98] transition-all">{procesando ? 'Procesando...' : 'Confirmar baja'}</button>
    </div></div>}

    {/* ═══ CARRITO FLOTANTE — barra inferior ════════════════════════════════ */}
    {carrito.length > 0 && !carritoOpen && (
      <div className="fixed bottom-0 left-0 right-0 z-40 max-w-lg mx-auto px-4 pb-4">
        <button onClick={() => setCarritoOpen(true)}
          className={`w-full bg-emerald-600 text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-xl shadow-emerald-600/30 active:scale-[0.98] transition-all ${cartBounce ? 'inv-cart-bounce' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-emerald-600 rounded-full text-[10px] font-extrabold flex items-center justify-center">{carrito.length}</span>
            </div>
            <span className="text-sm font-bold">{carrito.length} par{carrito.length !== 1 ? 'es' : ''} seleccionados</span>
          </div>
          <span className="text-base font-extrabold">{fmt(totalCarrito)}</span>
        </button>
      </div>
    )}

    {/* ═══ CARRITO EXPANDIDO (bottom sheet) ═════════════════════════════════ */}
    {carritoOpen && (
      <div className="fixed inset-0 z-50 inv-fade">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setCarritoOpen(false)} />
        <div className="inv-slide absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] shadow-2xl" style={{ maxHeight: '85vh' }}>
          <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-stone-300" /></div>
          <div className="overflow-y-auto inv-scroll" style={{ maxHeight: '78vh' }}>
            <div className="px-5 pb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-extrabold text-stone-900">Carrito de venta</h3>
                <button onClick={vaciarCarrito} className="text-xs text-red-500 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 active:scale-95 transition-all">Vaciar</button>
              </div>

              {/* Items del carrito agrupados visualmente */}
              <div className="space-y-2">
                {carrito.map((item, i) => (
                  <div key={item.sku_id} className="inv-fade flex items-center gap-3 bg-stone-50 rounded-xl p-3" style={stagger(i)}>
                    {item.foto_url
                      ? <img src={item.foto_url} alt="" className="w-12 h-12 rounded-lg inv-img-cover flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-lg bg-stone-200 flex items-center justify-center flex-shrink-0"><span className="text-lg">👟</span></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-stone-800 truncate">{item.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ColorDot color={item.color} size={8} />
                        <span className="text-[11px] text-stone-500 font-medium capitalize">{item.color}</span>
                        <span className="text-[11px] text-stone-400">· T{item.talla}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-extrabold text-stone-700">{fmt(item.precio)}</span>
                      <button onClick={() => quitarDelCarrito(item.sku_id)} className="w-7 h-7 rounded-full bg-white border border-stone-200 flex items-center justify-center active:scale-90 transition-transform">
                        <svg className="w-3.5 h-3.5 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Resumen */}
              <div className="mt-4 bg-stone-50 rounded-xl p-4">
                <div className="flex justify-between text-sm mb-1"><span className="text-stone-500">Pares</span><span className="font-bold text-stone-800">{carrito.length}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-stone-500">Modelos</span><span className="font-bold text-stone-800">{new Set(carrito.map(c => c.id_producto)).size}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-stone-500">Colores</span><span className="font-bold text-stone-800">{new Set(carrito.map(c => `${c.id_producto}_${c.color}`)).size}</span></div>
                <div className="border-t border-stone-200 mt-2 pt-2 flex justify-between"><span className="text-sm font-bold text-stone-600">Total</span><span className="text-lg font-extrabold text-stone-900">{fmt(totalCarrito)}</span></div>
              </div>

              {/* Nota: este botón podría conectar con el flujo de ventas existente */}
              <button onClick={registrarVenta} disabled={procesando} className="w-full mt-4 py-4 font-extrabold rounded-2xl bg-emerald-600 text-white active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50">
                {procesando ? 'Registrando...' : `Registrar venta — ${fmt(totalCarrito)}`}
              </button>
              <button onClick={() => setCarritoOpen(false)} className="w-full mt-2 py-3 text-sm font-semibold text-stone-500 active:scale-[0.98] transition-all">
                Seguir seleccionando
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
  </div></>);
}