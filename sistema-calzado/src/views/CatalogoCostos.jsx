/* CatalogoCostos v5.3 — mobile-first responsive */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../api/supabase';

const S = ['Grande', 'Mediana', 'Pequeña'];
const PC = { Grande:'precio_grande', Mediana:'precio_mediana', Pequeña:'precio_chica' };
const PE = { Grande:'precio_especial_grande', Mediana:'precio_especial_mediana', Pequeña:'precio_especial_chica' };
const CAT_M = ['Cuero','Suela','Insumo','Etiqueta','Herramienta','General'];
const UDS = [
  {v:'metro',t:'Calcio, tela'},{v:'par',t:'Plantas (12/doc)'},{v:'unidad',t:'Pasadores (24/doc)'},
  {v:'ml',t:'Pegamento'},{v:'bolsa',t:'Por bolsa'},{v:'litro',t:'Líquidos'},{v:'galón',t:'Volumen'},
  {v:'pliego',t:'Plano'},{v:'rollo',t:'Enrollado'},{v:'docena',t:'Por docena'},
];
const BK = 'modelos-fotos';
const fmt  = n => n != null && n !== '' ? `S/${Number(n).toFixed(0)}` : '—';
const fD   = n => n != null ? `S/${Number(n).toFixed(2)}` : '—';
const pS   = n => `${Number(n||0).toFixed(1)}%`;
const cP   = (c,p,m) => ((parseFloat(c)||0) * (parseFloat(p)||0) / 12) * (1 + (parseFloat(m)||0) / 100);
const mC   = p => p >= 50 ? 'text-emerald-600' : p >= 30 ? 'text-amber-600' : 'text-red-500';
const fU   = p => { try { return p ? `${supabase.supabaseUrl}/storage/v1/object/public/${BK}/${p}` : null; } catch { return null; } };

/* ── EC (editable cell) ──────────────────────────────────────────────────── */
function EC({ value, onSave, type='text', ph='—', pre='', suf='', cls='', w='' }) {
  const [ed, sE] = useState(false);
  const [v, sV]  = useState(value ?? '');
  const r        = useRef(null);
  useEffect(() => { sV(value ?? ''); }, [value]);
  useEffect(() => { if (ed && r.current) { r.current.focus(); r.current.select(); } }, [ed]);
  const sv = () => {
    sE(false);
    const x = type === 'number' ? (v === '' ? null : Number(v)) : v;
    if (x !== value) onSave(x);
  };
  if (ed) return (
    <input ref={r} type={type === 'number' ? 'number' : 'text'} value={v}
      onChange={e => sV(e.target.value)} onBlur={sv}
      onKeyDown={e => { if (e.key==='Enter') sv(); if (e.key==='Escape') { sV(value??''); sE(false); } }}
      className={`px-2 py-1 border-2 border-amber-400 rounded-lg text-sm outline-none bg-white ${w} ${cls}`} />
  );
  return (
    <span onClick={() => sE(true)}
      className={`cursor-pointer px-2 py-1 rounded-lg text-sm hover:bg-amber-50 transition inline-block ${w} ${value==null||value===''?'text-slate-300 italic':''} ${cls}`}>
      {value != null && value !== '' ? `${pre}${value}${suf}` : ph}
    </span>
  );
}

/* ── Photo ───────────────────────────────────────────────────────────────── */
function Foto({ path, id, table='productos', field='foto_url', idField='id_producto', onDone, size='md' }) {
  const ref = useRef(null);
  const [up, sU] = useState(false);
  const [lb, sL] = useState(false);
  const url = fU(path);
  const sz = { xs:'w-8 h-8 rounded-lg', sm:'w-12 h-12 rounded-xl', md:'w-20 h-20 rounded-2xl', lg:'w-28 h-28 rounded-2xl' };
  const h = async e => {
    const f = e.target.files?.[0]; if (!f) return; sU(true);
    try {
      const n = `${table}_${id}_${Date.now()}.${f.name.split('.').pop()}`;
      const { error } = await supabase.storage.from(BK).upload(n, f, { cacheControl:'3600', upsert:false });
      if (error) throw error;
      await supabase.from(table).update({ [field]:n }).eq(idField, id);
      if (onDone) onDone(n);
    } catch(err) { alert(err.message); }
    finally { sU(false); }
  };
  return (
    <>
      <div className={`relative group ${sz[size]} overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 flex-shrink-0`}>
        {url
          ? <img src={url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={e => { e.stopPropagation(); sL(true); }} />
          : <div className="w-full h-full flex items-center justify-center text-slate-200 cursor-pointer" onClick={() => ref.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
            </div>
        }
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button onClick={e => { e.stopPropagation(); ref.current?.click(); }}
            className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          </button>
        </div>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={h} />
        {up && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/></div>}
      </div>
      {lb && url && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => sL(false)}>
          <img src={url} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => sL(false)} className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl">×</button>
        </div>
      )}
    </>
  );
}

/* ── Tarjeta de material para móvil ─────────────────────────────────────── */
function MatCard({ m, mc, onUpdMM, onUpdMC, onDel }) {
  const c2 = cP(m.cantidad_por_docena, mc?.precio_unitario||0, m.merma_pct);
  return (
    <div className="bg-white rounded-xl border border-black/5 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">
            {mc?.nombre || '?'}
            {!m.id_color && <span className="text-[11px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded ml-1.5">Todos</span>}
          </p>
        </div>
        <button onClick={onDel} className="text-slate-300 hover:text-red-500 p-1 flex-shrink-0">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Cant/doc</p>
          <EC value={m.cantidad_por_docena} type="number" onSave={v => onUpdMM(m.id,'cantidad_por_docena',v)} w="w-full" cls="text-right" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Unidad</p>
          <select value={mc?.unidad_medida||'unidad'} onChange={e => onUpdMC(mc.id_material,'unidad_medida',e.target.value)}
            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white outline-none">
            {['metro','par','unidad','ml','bolsa','litro','galón','pliego','rollo','docena'].map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Precio</p>
          <EC value={mc?.precio_unitario} type="number" pre="S/" onSave={v => onUpdMC(mc.id_material,'precio_unitario',v)} w="w-full" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Merma</p>
          <EC value={m.merma_pct} type="number" suf="%" ph="0" onSave={v => onUpdMM(m.id,'merma_pct',v)} w="w-full" />
        </div>
      </div>
      <div className="flex justify-end">
        <span className="text-xs font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-black/5">
          Costo/par: {fD(c2)}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function CatalogoCostos({ usuario, deepLink }) {
  const [ld, sLd]           = useState(true);
  const [marcas, sMarcas]   = useState([]);
  const [prods, sProds]     = useState([]);
  const [colores, sColores] = useState([]);
  const [matsCat, sMatsCat] = useState([]);
  const [matsMod, sMatsMod] = useState([]);
  const [marcaSel, sMarcaSel]     = useState('all');
  const [modSel, sModSel]         = useState(null);
  const [busq, sBusq]             = useState('');
  const [colorModal, sColorModal] = useState(null);
  const [serieExp, sSerieExp]     = useState('Grande');
  const [addingMat, sAddingMat]   = useState(false);
  const [showNewMod, sShowNewMod] = useState(false);
  const [nm, sNm] = useState({ nombre:'', id_categoria:'', precio_grande:'', precio_mediana:'', precio_chica:'' });
  const [showNewMat, sShowNewMat] = useState(false);
  const [nvMat, sNvMat] = useState({ nombre:'', categoria:'General', unidad_medida:'unidad', precio_unitario:'' });
  const [creandoColor, sCreandoColor] = useState(false);
  const [nvColor, sNvColor]           = useState('');
  const [confirmDel, sConfirmDel]     = useState(null);
  // CRUD Marcas
  const [showNewMarca, sShowNewMarca]     = useState(false);
  const [nvMarca, sNvMarca]               = useState('');
  const [editMarca, sEditMarca]           = useState(null); // { id_categoria, nombre_categoria }
  const [editMarcaNombre, sEditMarcaNombre] = useState('');
  const [guardandoMarca, sGuardandoMarca] = useState(false);

  const load = useCallback(async () => {
    sLd(true);
    const [r1,r2,r3,r4,r5] = await Promise.all([
      supabase.from('categorias').select('*').order('nombre_categoria'),
      supabase.from('productos').select('*').order('nombre_modelo'),
      supabase.from('colores_modelos').select('*').order('color'),
      supabase.from('materiales_catalogo').select('*').order('nombre'),
      supabase.from('materiales_modelo').select('*'),
    ]);
    sMarcas(r1.data||[]); sProds(r2.data||[]); sColores(r3.data||[]);
    sMatsCat(r4.data||[]); sMatsMod(r5.data||[]);
    sLd(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const mn       = id => marcas.find(m => m.id_categoria === id)?.nombre_categoria || '';
  const modelo   = useMemo(() => modSel ? prods.find(p => p.id_producto === modSel) : null, [modSel, prods]);
  const colsMod  = useMemo(() => modelo ? colores.filter(c => c.id_producto === modelo.id_producto) : [], [colores, modelo]);
  const colorObj = useMemo(() => colorModal ? colores.find(c => c.id_color === colorModal) : null, [colorModal, colores]);

  useEffect(() => {
    if (!deepLink?.modelo) return;
    const modeloId = Number(deepLink.modelo);
    if (!prods.some(p => p.id_producto === modeloId)) return;
    sModSel(prev => prev === modeloId ? prev : modeloId);
  }, [deepLink?.modelo, prods]);

  useEffect(() => {
    const serie = S.find(s => s.toLowerCase() === String(deepLink?.serie || '').toLowerCase());
    if (!serie) return;
    sSerieExp(prev => prev === serie ? prev : serie);
  }, [deepLink?.serie]);

  useEffect(() => {
    if (!deepLink?.color || !colsMod.length) return;
    const colorId = Number(deepLink.color);
    if (!colsMod.some(c => c.id_color === colorId)) return;
    sColorModal(prev => prev === colorId ? prev : colorId);
  }, [deepLink?.color, colsMod]);
  const pf = useMemo(() => {
    let l = prods.filter(p => (p.estado||'Activo') === 'Activo');
    if (marcaSel !== 'all') l = l.filter(p => p.id_categoria === marcaSel);
    if (busq.trim()) { const q = busq.toLowerCase(); l = l.filter(p => p.nombre_modelo.toLowerCase().includes(q) || mn(p.id_categoria).toLowerCase().includes(q)); }
    return l;
  }, [prods, marcaSel, busq, marcas]);

  const matsOf  = (idProd, idColor, serie) => matsMod.filter(m => m.id_producto===idProd && m.nombre_serie===serie && (m.id_color===idColor||!m.id_color));
  const costoOf = (idProd, idColor, serie) => { let t=0; matsOf(idProd,idColor,serie).forEach(m => { const mc=matsCat.find(c=>c.id_material===m.id_material); t+=cP(m.cantidad_por_docena,mc?.precio_unitario||0,m.merma_pct); }); return t; };
  const precioOf= (color, serie) => parseFloat(color?.[PE[serie]]) || parseFloat(modelo?.[PC[serie]]) || 0;
  const margenOf= (idProd, idColor, color, serie) => { const ct=costoOf(idProd,idColor,serie); const pr=precioOf(color,serie); return { ct, pr, mg:pr-ct, pm:pr>0&&ct>0?((pr-ct)/pr)*100:-1 }; };

  /* CRUD */
  const updP  = async (id,c,v) => { await supabase.from('productos').update({[c]:v}).eq('id_producto',id); sProds(p=>p.map(x=>x.id_producto===id?{...x,[c]:v}:x)); };
  const updC  = async (id,c,v) => { await supabase.from('colores_modelos').update({[c]:v}).eq('id_color',id); sColores(p=>p.map(x=>x.id_color===id?{...x,[c]:v}:x)); };
  const updMC = async (id,c,v) => { await supabase.from('materiales_catalogo').update({[c]:v}).eq('id_material',id); sMatsCat(p=>p.map(x=>x.id_material===id?{...x,[c]:v}:x)); };

  /* CRUD Marcas */
  const crearMarca = async () => {
    const nombre = nvMarca.trim();
    if (!nombre) return;
    sGuardandoMarca(true);
    try {
      const { error } = await supabase.from('categorias').insert([{ nombre_categoria: nombre }]);
      if (error) throw error;
      sNvMarca(''); sShowNewMarca(false); load();
    } catch(e) { alert('Error: ' + e.message); }
    finally { sGuardandoMarca(false); }
  };
  const guardarEditMarca = async () => {
    const nombre = editMarcaNombre.trim();
    if (!nombre || !editMarca) return;
    sGuardandoMarca(true);
    try {
      const { error } = await supabase.from('categorias')
        .update({ nombre_categoria: nombre }).eq('id_categoria', editMarca.id_categoria);
      if (error) throw error;
      sEditMarca(null); sEditMarcaNombre(''); load();
    } catch(e) { alert('Error: ' + e.message); }
    finally { sGuardandoMarca(false); }
  };
  const updMM = async (id,c,v) => { await supabase.from('materiales_modelo').update({[c]:v}).eq('id',id); sMatsMod(p=>p.map(x=>x.id===id?{...x,[c]:v}:x)); };
  const delMM = async id => { await supabase.from('materiales_modelo').delete().eq('id',id); sMatsMod(p=>p.filter(x=>x.id!==id)); };
  const addMM = async (idProd,idMat,serie,idColor) => { await supabase.from('materiales_modelo').insert([{id_producto:idProd,id_material:idMat,nombre_serie:serie,id_color:idColor||null,cantidad_por_docena:0,merma_pct:0}]); load(); sAddingMat(false); };

  const crearMod = async () => {
    if (!nm.nombre.trim() || !nm.id_categoria) return;
    await supabase.from('productos').insert([{ nombre_modelo:nm.nombre.trim(), id_categoria:nm.id_categoria, precio_grande:parseFloat(nm.precio_grande)||0, precio_mediana:parseFloat(nm.precio_mediana)||0, precio_chica:parseFloat(nm.precio_chica)||0, precio_venta_sugerido:parseFloat(nm.precio_grande)||0, estado:'Activo' }]);
    sShowNewMod(false); sNm({nombre:'',id_categoria:'',precio_grande:'',precio_mediana:'',precio_chica:''}); load();
  };
  const crearCol = async () => {
    if (!nvColor.trim() || !modelo) return;
    await supabase.from('colores_modelos').insert([{ id_producto:modelo.id_producto, color:nvColor.trim(), estado:'Activo' }]);
    sNvColor(''); sCreandoColor(false); load();
  };
  const crearMat = async () => {
    if (!nvMat.nombre.trim()) return;
    await supabase.from('materiales_catalogo').insert([{ nombre:nvMat.nombre.trim(), categoria:nvMat.categoria, unidad_medida:nvMat.unidad_medida, precio_unitario:parseFloat(nvMat.precio_unitario)||0 }]);
    sShowNewMat(false); sNvMat({nombre:'',categoria:'General',unidad_medida:'unidad',precio_unitario:''}); load();
  };
  const copiarMats = async (idProd,fromC,toC,fromS,toS) => {
    const orig = matsMod.filter(m=>m.id_producto===idProd&&m.nombre_serie===fromS&&(m.id_color===fromC||(!fromC&&!m.id_color)));
    if (!orig.length) { alert('No hay materiales'); return; }
    const dest = matsMod.filter(m=>m.id_producto===idProd&&m.nombre_serie===toS&&(m.id_color===toC||(!toC&&!m.id_color)));
    if (dest.length) await supabase.from('materiales_modelo').delete().in('id',dest.map(m=>m.id));
    await supabase.from('materiales_modelo').insert(orig.map(m=>({id_producto:idProd,id_material:m.id_material,nombre_serie:toS,id_color:toC,cantidad_por_docena:m.cantidad_por_docena,merma_pct:m.merma_pct})));
    load();
  };
  const execDel = async () => {
    if (!confirmDel) return;
    const { type, id } = confirmDel;
    if (type==='color') { await supabase.from('materiales_modelo').delete().eq('id_color',id); await supabase.from('colores_modelos').delete().eq('id_color',id); sColorModal(null); }
    if (type==='modelo') { await supabase.from('materiales_modelo').delete().eq('id_producto',id); await supabase.from('colores_modelos').delete().eq('id_producto',id); await supabase.from('productos').delete().eq('id_producto',id); sModSel(null); }
    if (type==='marca') {
      const prodsM = prods.filter(p => p.id_categoria===id);
      if (prodsM.length) { alert('Elimina primero los modelos de esta marca'); sConfirmDel(null); return; }
      await supabase.from('categorias').delete().eq('id_categoria',id);
    }
    sConfirmDel(null); load();
  };

  if (ld) return <div className="flex items-center justify-center h-[80vh]"><div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"/></div>;

  return (
    <div className="w-full max-w-full overflow-x-hidden" style={{ background:'#faf9f7' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-black/5 px-4 md:px-6 py-3 md:py-4"
           style={{ background:'rgba(250,249,247,0.95)', backdropFilter:'blur(8px)' }}>
        {/* Fila 1: título + botón */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-800">Catálogo</h1>
          <div className="flex gap-2">
            <button onClick={() => { sNvMarca(''); sShowNewMarca(true); }} className="px-3 py-2 bg-slate-600 text-white text-xs font-bold rounded-xl flex-shrink-0">+ Marca</button>
            <button onClick={() => sShowNewMod(true)} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl flex-shrink-0">+ Modelo</button>
          </div>
        </div>
        {/* Fila 2: buscador */}
        <input value={busq} onChange={e => sBusq(e.target.value)} placeholder="Buscar modelo o marca..."
          className="w-full px-4 py-2.5 bg-white border border-black/10 rounded-xl text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 mb-2.5 transition-all" />
        {/* Fila 3: marcas — scroll horizontal */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth:'none' }}>
          <button onClick={() => sMarcaSel('all')}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg ${marcaSel==='all' ? 'bg-slate-800 text-white' : 'bg-white border border-black/10 text-slate-500 hover:border-amber-400'}`}>
            Todas
          </button>
          {marcas.map(m => (
            <button key={m.id_categoria} onClick={() => sMarcaSel(m.id_categoria)}
              onDoubleClick={e => { e.stopPropagation(); sEditMarca(m); sEditMarcaNombre(m.nombre_categoria); }}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 ${marcaSel===m.id_categoria ? 'bg-slate-800 text-white' : 'bg-white border border-black/10 text-slate-500 hover:border-amber-400'}`}>
              {m.nombre_categoria}
              {marcaSel===m.id_categoria && (
                <span className="flex items-center gap-0.5 ml-0.5">
                  <span onClick={e => { e.stopPropagation(); sEditMarca(m); sEditMarcaNombre(m.nombre_categoria); }}
                    className="text-white/60 hover:text-blue-300" title="Renombrar">✎</span>
                  <span onClick={e => { e.stopPropagation(); sConfirmDel({type:'marca',id:m.id_categoria,name:m.nombre_categoria}); }}
                    className="text-white/60 hover:text-red-300" title="Eliminar">×</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Galería ──────────────────────────────────────────────────────── */}
      <div className="p-4 md:p-6 pb-32">
        <>
          {/* ── Móvil: lista 1 columna con foto al lado ── */}
          <div className="flex flex-col gap-2.5 sm:hidden">
            {pf.map(p => {
              const nC = colores.filter(c => c.id_producto===p.id_producto && c.estado==='Activo').length;
              return (
                <div key={p.id_producto} onClick={() => { sModSel(p.id_producto); sColorModal(null); }}
                  className={`cursor-pointer rounded-2xl overflow-hidden transition-all active:scale-[0.98]
                    flex items-center gap-3.5 p-3.5
                    ${modSel===p.id_producto ? 'bg-amber-50 border-2 border-amber-400' : 'bg-white border border-black/5 shadow-sm'}`}>
                  <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50">
                    {fU(p.foto_url)
                      ? <img src={fU(p.foto_url)} className="w-full h-full object-cover" alt="" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-200">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                        </div>
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 font-medium">{mn(p.id_categoria)}</p>
                    <p className="font-bold text-base text-slate-800 truncate">{p.nombre_modelo}</p>
                    <p className="text-xs text-slate-300">{nC} color{nC!==1&&'es'}</p>
                  </div>
                  <span className="text-slate-300 text-xl flex-shrink-0">›</span>
                </div>
              );
            })}
          </div>

          {/* ── Desktop: grid con fotos cuadradas ── */}
          <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {pf.map(p => {
              const nC = colores.filter(c => c.id_producto===p.id_producto && c.estado==='Activo').length;
              return (
                <div key={p.id_producto} onClick={() => { sModSel(p.id_producto); sColorModal(null); }}
                  className={`group cursor-pointer rounded-2xl overflow-hidden transition-all hover:shadow-lg active:scale-[0.97]
                    ${modSel===p.id_producto ? 'ring-2 ring-amber-400 shadow-lg' : 'bg-white shadow-sm border border-black/5'}`}>
                  <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                    {fU(p.foto_url)
                      ? <img src={fU(p.foto_url)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-200">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.8"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                        </div>
                    }
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] text-slate-400 font-medium">{mn(p.id_categoria)}</p>
                    <p className="font-bold text-sm text-slate-800 truncate">{p.nombre_modelo}</p>
                    <p className="text-xs text-slate-300 mt-1">{nC} color{nC!==1&&'es'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      </div>

      {/* ══ PANEL MODELO — slide desde la derecha ══════════════════════════ */}
      {modelo && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => sModSel(null)} />
          <div className="fixed top-0 right-0 z-40 h-screen bg-white shadow-2xl overflow-y-auto w-full md:w-[680px]">
            {/* Header sticky */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 md:px-6 py-4 flex items-center gap-3">
              <button onClick={() => sModSel(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">{mn(modelo.id_categoria)}</p>
                <h2 className="text-lg font-extrabold truncate">{modelo.nombre_modelo}</h2>
              </div>
              <button onClick={() => updP(modelo.id_producto,'estado',modelo.estado==='Activo'?'Inactivo':'Activo')}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${(modelo.estado||'Activo')==='Activo'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-500'}`}>
                {(modelo.estado||'Activo')==='Activo'?'Activo':'Off'}
              </button>
              <button onClick={() => sConfirmDel({type:'modelo',id:modelo.id_producto,name:modelo.nombre_modelo})}
                className="text-xs text-slate-300 hover:text-red-500 transition-colors" title="Eliminar modelo">🗑</button>
            </div>

            <div className="p-4 md:p-6">
              {/* Foto + precios */}
              <div className="flex gap-4 mb-6">
                <Foto path={modelo.foto_url} id={modelo.id_producto} onDone={f => updP(modelo.id_producto,'foto_url',f)} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-3">Precios de venta</p>
                  {/* En móvil: stack vertical. En desktop: horizontal */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                    {S.map(s => (
                      <div key={s}>
                        <p className="text-xs text-slate-400 mb-1">{s}</p>
                        <EC value={modelo[PC[s]]} onSave={v => updP(modelo.id_producto,PC[s],v)} type="number" pre="S/" cls="text-xl font-extrabold" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Galería colores */}
              <h3 className="text-sm font-bold text-slate-800 mb-3">Colores</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
                {colsMod.filter(c => c.estado==='Activo').map(c => {
                  const { pm } = margenOf(modelo.id_producto, c.id_color, c, 'Grande');
                  return (
                    <div key={c.id_color} onClick={() => { sColorModal(c.id_color); sSerieExp('Grande'); sAddingMat(false); }}
                      className="cursor-pointer rounded-2xl overflow-hidden bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all active:scale-[0.97]">
                      <div className="aspect-[4/3] sm:aspect-square bg-gradient-to-br from-slate-100 to-slate-50 overflow-hidden">
                        {fU(c.foto_url)
                          ? <img src={fU(c.foto_url)} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-slate-200">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                            </div>
                        }
                      </div>
                      <div className="p-2.5">
                        <p className="font-bold text-xs text-slate-800 truncate">{c.color}</p>
                        {pm >= 0 && <p className={`text-xs font-bold mt-0.5 ${mC(pm)}`}>{pS(pm)}</p>}
                      </div>
                    </div>
                  );
                })}
                {creandoColor
                  ? <div className="col-span-full flex gap-2">
                      <input value={nvColor} onChange={e => sNvColor(e.target.value)}
                        onKeyDown={e => { if (e.key==='Enter') crearCol(); if (e.key==='Escape') sCreandoColor(false); }}
                        placeholder="Nombre del color..." autoFocus
                        className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-amber-400" />
                      <button onClick={crearCol} className="px-5 py-2 text-xs font-bold bg-slate-800 text-white rounded-xl">Agregar</button>
                    </div>
                  : <div onClick={() => sCreandoColor(true)}
                      className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center aspect-square hover:border-amber-400 transition-colors">
                      <span className="text-slate-400 text-sm">+ Color</span>
                    </div>
                }
              </div>

              {colsMod.filter(c => c.estado!=='Activo').length > 0 && (
                <details className="mb-4">
                  <summary className="text-xs text-slate-400 cursor-pointer">Inactivos ({colsMod.filter(c=>c.estado!=='Activo').length})</summary>
                  <div className="flex gap-2 flex-wrap mt-2">
                    {colsMod.filter(c => c.estado!=='Activo').map(c => (
                      <button key={c.id_color} onClick={() => updC(c.id_color,'estado','Activo')}
                        className="text-xs text-slate-400 px-3 py-1.5 bg-slate-100 rounded-lg hover:bg-emerald-100 hover:text-emerald-700">{c.color}</button>
                    ))}
                  </div>
                </details>
              )}

              {/* Tabla resumen costos — scroll horizontal en móvil */}
              <h3 className="text-sm font-bold text-slate-800 mb-3 mt-4">Resumen de costos</h3>
              <div className="bg-white rounded-2xl border border-black/5 overflow-x-auto">
                <table className="w-full text-[13px] min-w-[300px]">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-semibold uppercase" style={{ background:'#f8f7f5' }}>
                      <th className="py-2.5 px-4 text-left">Color</th>
                      {S.map(s => <th key={s} className="py-2.5 px-3 text-center">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {colsMod.filter(c => c.estado==='Activo').map(c => (
                      <tr key={c.id_color} className="border-t border-slate-100">
                        <td className="py-2.5 px-4 font-medium">{c.color}</td>
                        {S.map(s => {
                          const { pm } = margenOf(modelo.id_producto, c.id_color, c, s);
                          return (
                            <td key={s} className="py-2.5 px-3 text-center">
                              {pm >= 0 ? <span className={`font-bold ${mC(pm)}`}>{pS(pm)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ MODAL COLOR ══════════════════════════════════════════════════════ */}
      {colorModal && colorObj && modelo && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4" onClick={() => sColorModal(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          {/* En móvil: full-height bottom sheet. En desktop: modal centrado */}
          <div className="relative bg-white w-full md:rounded-3xl md:max-w-4xl md:max-h-[92vh] md:overflow-hidden
                          rounded-t-3xl max-h-[95vh] overflow-hidden flex flex-col md:flex-row shadow-2xl"
               onClick={e => e.stopPropagation()}>

            {/* ── Sidebar izquierdo (info + precios) ─────────────────────── */}
            {/* En móvil: barra compacta arriba. En desktop: panel lateral fijo */}
            <div className="md:w-[240px] md:flex-shrink-0 md:border-r border-b md:border-b-0 border-slate-100 md:overflow-y-auto" style={{ background:'#faf9f7' }}>
              {/* Header móvil compacto */}
              <div className="flex items-center gap-3 p-4 md:hidden">
                <Foto path={colorObj.foto_url} id={colorObj.id_color} table="colores_modelos" field="foto_url" idField="id_color" onDone={f => updC(colorObj.id_color,'foto_url',f)} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 truncate">{mn(modelo.id_categoria)} · {modelo.nombre_modelo}</p>
                  <h3 className="font-extrabold text-base truncate">{colorObj.color}</h3>
                </div>
                <button onClick={() => sColorModal(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              {/* Precios en móvil: grid horizontal compacto */}
              <div className="px-4 pb-3 md:hidden">
                <div className="grid grid-cols-3 gap-2">
                  {S.map(s => {
                    const { ct, pr, mg, pm } = margenOf(modelo.id_producto, colorObj.id_color, colorObj, s);
                    return (
                      <div key={s} className="bg-white rounded-xl p-2.5 border border-slate-200/60 text-center">
                        <p className="text-[11px] text-slate-400 font-medium mb-1">{s}</p>
                        <EC value={colorObj[PE[s]]} onSave={v => updC(colorObj.id_color,PE[s],v)} type="number" pre="S/" ph={`${fmt(modelo[PC[s]])}`} cls="font-bold text-sm" />
                        {pm >= 0 && <p className={`text-[11px] font-bold mt-0.5 ${mC(pm)}`}>{pS(pm)}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => updC(colorObj.id_color,'estado',colorObj.estado==='Activo'?'Inactivo':'Activo')}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-lg ${colorObj.estado==='Activo'?'bg-emerald-100 text-emerald-600':'bg-red-100 text-red-500'}`}>
                    {colorObj.estado==='Activo'?'Activo':'Off'}
                  </button>
                  <button onClick={() => sConfirmDel({type:'color',id:colorObj.id_color,name:colorObj.color})}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg">Eliminar</button>
                </div>
              </div>

              {/* Sidebar desktop completo */}
              <div className="hidden md:block p-5">
                <Foto path={colorObj.foto_url} id={colorObj.id_color} table="colores_modelos" field="foto_url" idField="id_color" onDone={f => updC(colorObj.id_color,'foto_url',f)} size="lg" />
                <p className="text-xs text-slate-400 mt-3">{mn(modelo.id_categoria)} · {modelo.nombre_modelo}</p>
                <h3 className="text-lg font-extrabold mt-0.5 mb-4">{colorObj.color}</h3>
                <div className="space-y-2 mb-4">
                  {S.map(s => {
                    const { ct, pr, mg, pm } = margenOf(modelo.id_producto, colorObj.id_color, colorObj, s);
                    return (
                      <div key={s} className="bg-white rounded-xl p-3 border border-slate-200/60">
                        <p className="text-xs text-slate-400 font-medium mb-1">{s}</p>
                        <div className="flex items-center justify-between">
                          <EC value={colorObj[PE[s]]} onSave={v => updC(colorObj.id_color,PE[s],v)} type="number" pre="S/" ph={`${fmt(modelo[PC[s]])}`} cls="font-bold text-sm" />
                          {pm >= 0 && <span className={`text-xs font-bold ${mC(pm)}`}>{pS(pm)}</span>}
                        </div>
                        {ct > 0 && <p className="text-xs text-slate-400 mt-1">Costo: {fD(ct)} · Margen: {fD(mg)}</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updC(colorObj.id_color,'estado',colorObj.estado==='Activo'?'Inactivo':'Activo')}
                    className={`flex-1 text-xs font-bold py-2 rounded-lg ${colorObj.estado==='Activo'?'bg-emerald-100 text-emerald-600':'bg-red-100 text-red-500'}`}>
                    {colorObj.estado==='Activo'?'Activo':'Off'}
                  </button>
                  <button onClick={() => sConfirmDel({type:'color',id:colorObj.id_color,name:colorObj.color})}
                    className="px-3 py-2 text-xs text-slate-400 hover:text-red-500 border border-slate-200 rounded-lg">Eliminar</button>
                </div>
              </div>
            </div>

            {/* ── Panel derecho: materiales ──────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h4 className="text-sm font-bold text-slate-800">Materiales</h4>
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                  {S.map(s => (
                    <button key={s} onClick={() => sSerieExp(s)}
                      className={`px-2.5 md:px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${serieExp===s?'bg-white text-slate-900 shadow-sm':'text-slate-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Copiar botones */}
              <div className="flex gap-1.5 flex-wrap mb-3">
                {colsMod.filter(x => x.id_color!==colorObj.id_color && x.estado==='Activo').map(x => (
                  <button key={x.id_color}
                    onClick={() => { if (confirm(`Copiar materiales de "${x.color}" (${serieExp})?`)) copiarMats(modelo.id_producto,x.id_color,colorObj.id_color,serieExp,serieExp); }}
                    className="text-xs text-slate-500 px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:border-amber-400">
                    ← {x.color}
                  </button>
                ))}
                {S.filter(s => s!==serieExp).map(s => (
                  <button key={s}
                    onClick={() => { if (confirm(`Copiar de ${s} → ${serieExp}?`)) copiarMats(modelo.id_producto,colorObj.id_color,colorObj.id_color,s,serieExp); }}
                    className="text-xs text-blue-500 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg hover:border-blue-400">
                    ← {s}
                  </button>
                ))}
              </div>

              {/* Tabla desktop / tarjetas móvil */}
              {(() => {
                const ms = matsOf(modelo.id_producto, colorObj.id_color, serieExp);
                let tot = 0;
                return (
                  <>
                    {/* DESKTOP: tabla */}
                    <div className="hidden md:block rounded-xl border border-slate-200/60 overflow-hidden">
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider" style={{ background:'#faf9f7' }}>
                            <th className="py-2.5 px-3 text-left">Material</th>
                            <th className="py-2.5 px-3 text-right w-20">Cant/doc</th>
                            <th className="py-2.5 px-2 text-center w-16">Ud</th>
                            <th className="py-2.5 px-3 text-right w-20">Precio</th>
                            <th className="py-2.5 px-2 text-right w-16">Merma</th>
                            <th className="py-2.5 px-3 text-right w-20">Costo/par</th>
                            <th className="w-7"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ms.map(m => {
                            const mc = matsCat.find(x => x.id_material===m.id_material);
                            const c2 = cP(m.cantidad_por_docena, mc?.precio_unitario||0, m.merma_pct);
                            tot += c2;
                            return (
                              <tr key={m.id} className="border-t border-slate-100 hover:bg-amber-50/30 transition-colors">
                                <td className="py-2.5 px-3 font-medium text-slate-800">
                                  {mc?.nombre||'?'}
                                  {!m.id_color && <span className="text-[11px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded ml-1.5">Todos</span>}
                                </td>
                                <td className="py-2.5 px-3 text-right"><EC value={m.cantidad_por_docena} type="number" onSave={v=>updMM(m.id,'cantidad_por_docena',v)} w="w-16"/></td>
                                <td className="py-2.5 px-2 text-center">
                                  <select value={mc?.unidad_medida||'unidad'} onChange={e=>updMC(mc.id_material,'unidad_medida',e.target.value)} className="px-1 py-0.5 border border-slate-200 rounded text-xs bg-white text-slate-500 outline-none">
                                    {['metro','par','unidad','ml','bolsa','litro','galón','pliego','rollo','docena'].map(u=><option key={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td className="py-2.5 px-3 text-right"><EC value={mc?.precio_unitario} type="number" pre="S/" onSave={v=>updMC(mc.id_material,'precio_unitario',v)} w="w-20"/></td>
                                <td className="py-2.5 px-2 text-right"><EC value={m.merma_pct} type="number" suf="%" ph="0" onSave={v=>updMM(m.id,'merma_pct',v)} w="w-14"/></td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-700">{fD(c2)}</td>
                                <td className="py-2.5 px-1"><button onClick={()=>delMM(m.id)} className="text-slate-300 hover:text-red-500 text-xs">✕</button></td>
                              </tr>
                            );
                          })}
                          {addingMat
                            ? <tr className="border-t border-amber-200 bg-amber-50/50">
                                <td colSpan="7" className="py-2.5 px-3">
                                  <div className="flex gap-2">
                                    <select autoFocus onChange={e => { if (e.target.value==='__new') { sShowNewMat(true); sAddingMat(false); return; } if (e.target.value) addMM(modelo.id_producto,parseInt(e.target.value),serieExp,colorObj.id_color); }}
                                      className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-lg outline-none bg-white">
                                      <option value="">Seleccionar material...</option>
                                      {matsCat.filter(m=>m.activo!==false).map(m=><option key={m.id_material} value={m.id_material}>{m.nombre} ({m.unidad_medida}) — S/{m.precio_unitario||0}</option>)}
                                      <option value="__new">+ Crear nuevo material</option>
                                    </select>
                                    <button onClick={() => sAddingMat(false)} className="text-xs text-slate-400 px-2">✕</button>
                                  </div>
                                </td>
                              </tr>
                            : <tr className="border-t border-slate-100">
                                <td colSpan="7" className="py-2.5 px-3">
                                  <button onClick={() => sAddingMat(true)} className="text-xs text-amber-600 hover:text-amber-800 font-medium">+ Agregar material</button>
                                </td>
                              </tr>
                          }
                        </tbody>
                      </table>
                    </div>

                    {/* MÓVIL: tarjetas */}
                    <div className="md:hidden space-y-2">
                      {ms.map(m => {
                        const mc = matsCat.find(x => x.id_material===m.id_material);
                        const c2 = cP(m.cantidad_por_docena, mc?.precio_unitario||0, m.merma_pct);
                        tot += c2;
                        return <MatCard key={m.id} m={m} mc={mc} onUpdMM={updMM} onUpdMC={updMC} onDel={() => delMM(m.id)} />;
                      })}
                      {addingMat
                        ? <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <select autoFocus onChange={e => { if (e.target.value==='__new') { sShowNewMat(true); sAddingMat(false); return; } if (e.target.value) addMM(modelo.id_producto,parseInt(e.target.value),serieExp,colorObj.id_color); }}
                              className="w-full px-3 py-2.5 text-sm border border-amber-300 rounded-lg outline-none bg-white mb-2">
                              <option value="">Seleccionar material...</option>
                              {matsCat.filter(m=>m.activo!==false).map(m=><option key={m.id_material} value={m.id_material}>{m.nombre} ({m.unidad_medida})</option>)}
                              <option value="__new">+ Crear nuevo material</option>
                            </select>
                            <button onClick={() => sAddingMat(false)} className="text-xs text-slate-400">Cancelar</button>
                          </div>
                        : <button onClick={() => sAddingMat(true)}
                            className="w-full py-2.5 text-xs text-amber-600 hover:text-amber-800 font-medium border border-dashed border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                            + Agregar material
                          </button>
                      }
                    </div>

                    {ms.length > 0 && (() => {
                      // recalcular tot correctamente para el resumen
                      let t2 = 0;
                      ms.forEach(m => { const mc=matsCat.find(x=>x.id_material===m.id_material); t2+=cP(m.cantidad_por_docena,mc?.precio_unitario||0,m.merma_pct); });
                      const pr = precioOf(colorObj, serieExp);
                      const mg = pr - t2;
                      const pm = pr > 0 ? (mg/pr)*100 : 0;
                      return (
                        <div className="mt-4 flex flex-wrap gap-3 items-center text-sm">
                          <div className="bg-white rounded-xl px-3 py-2 border border-black/5"><span className="text-slate-400 text-xs">Costo:</span> <span className="font-bold">{fD(t2)}</span></div>
                          <div className="bg-white rounded-xl px-3 py-2 border border-black/5"><span className="text-slate-400 text-xs">Precio:</span> <span className="font-bold">{fmt(pr)}</span></div>
                          <div className={`bg-white rounded-xl px-3 py-2 border border-black/5 font-bold ${mC(pm)}`}>Margen: {fD(mg)} ({pS(pm)})</div>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              <button onClick={() => sColorModal(null)}
                className="mt-5 w-full py-2.5 text-sm font-medium text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50 md:hidden">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALES ════════════════════════════════════════════════════════ */}
      {showNewMod && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => sShowNewMod(false)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-2xl p-6 w-full max-w-md md:mx-4">
            <h3 className="text-lg font-extrabold mb-5">Nuevo modelo</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nombre</label>
                <input value={nm.nombre} onChange={e => sNm(p=>({...p,nombre:e.target.value}))} autoFocus
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-400 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Marca</label>
                <select value={nm.id_categoria} onChange={e => sNm(p=>({...p,id_categoria:parseInt(e.target.value)}))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                  <option value="">Seleccionar...</option>
                  {marcas.map(m => <option key={m.id_categoria} value={m.id_categoria}>{m.nombre_categoria}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {S.map(s => {
                  const k = `precio_${s==='Grande'?'grande':s==='Mediana'?'mediana':'chica'}`;
                  return (
                    <div key={s}>
                      <label className="block text-[11px] text-slate-400 mb-1">{s}</label>
                      <div className="flex items-center gap-1 px-3 py-2 border border-slate-200 rounded-xl">
                        <span className="text-xs text-slate-400">S/</span>
                        <input type="number" value={nm[k]||''} onChange={e => sNm(p=>({...p,[k]:e.target.value}))}
                          className="flex-1 text-sm font-bold outline-none bg-transparent w-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => sShowNewMod(false)} className="flex-1 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl">Cancelar</button>
                <button onClick={crearMod} className="flex-1 py-2.5 text-sm font-bold bg-slate-800 text-white rounded-xl">Crear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewMat && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => sShowNewMat(false)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl shadow-2xl p-6 w-full max-w-md md:mx-4">
            <h3 className="text-lg font-extrabold mb-5">Nuevo material</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nombre</label>
                <input value={nvMat.nombre} onChange={e => sNvMat(p=>({...p,nombre:e.target.value}))} autoFocus
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-400 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Categoría</label>
                  <select value={nvMat.categoria} onChange={e => sNvMat(p=>({...p,categoria:e.target.value}))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                    {CAT_M.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Unidad</label>
                  <select value={nvMat.unidad_medida} onChange={e => sNvMat(p=>({...p,unidad_medida:e.target.value}))}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white">
                    {UDS.map(u => <option key={u.v} value={u.v}>{u.v}</option>)}
                  </select>
                  <p className="text-xs text-amber-600 mt-1">{UDS.find(u=>u.v===nvMat.unidad_medida)?.t}</p>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Precio por {nvMat.unidad_medida}</label>
                <div className="flex items-center gap-1 px-3 py-2.5 border border-slate-200 rounded-xl">
                  <span className="text-xs text-slate-400">S/</span>
                  <input type="number" value={nvMat.precio_unitario} onChange={e => sNvMat(p=>({...p,precio_unitario:e.target.value}))}
                    className="flex-1 text-sm font-bold outline-none bg-transparent" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => sShowNewMat(false)} className="flex-1 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl">Cancelar</button>
                <button onClick={crearMat} className="flex-1 py-2.5 text-sm font-bold bg-slate-800 text-white rounded-xl">Crear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => sConfirmDel(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <p className="text-lg font-extrabold mb-2">Eliminar {confirmDel.type}</p>
            <p className="text-sm text-slate-500 mb-5">¿Eliminar <strong>{confirmDel.name}</strong>? Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <button onClick={() => sConfirmDel(null)} className="flex-1 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl">Cancelar</button>
              <button onClick={execDel} className="flex-1 py-2.5 text-sm font-bold bg-red-500 text-white rounded-xl">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Marca */}
      {showNewMarca && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => sShowNewMarca(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-lg font-extrabold mb-4">Nueva marca</p>
            <input type="text" autoFocus value={nvMarca}
              onChange={e => sNvMarca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') crearMarca(); }}
              placeholder="Nombre de la marca..."
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => sShowNewMarca(false)} className="flex-1 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl">Cancelar</button>
              <button onClick={crearMarca} disabled={!nvMarca.trim() || guardandoMarca}
                className="flex-1 py-2.5 text-sm font-bold bg-slate-800 text-white rounded-xl disabled:opacity-40">
                {guardandoMarca ? 'Guardando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar/Renombrar Marca */}
      {editMarca && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => sEditMarca(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-lg font-extrabold mb-1">Renombrar marca</p>
            <p className="text-xs text-slate-400 mb-4">Actual: {editMarca.nombre_categoria}</p>
            <input type="text" autoFocus value={editMarcaNombre}
              onChange={e => sEditMarcaNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardarEditMarca(); }}
              placeholder="Nuevo nombre..."
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-amber-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => sEditMarca(null)} className="flex-1 py-2.5 text-sm text-slate-500 border border-slate-200 rounded-xl">Cancelar</button>
              <button onClick={guardarEditMarca} disabled={!editMarcaNombre.trim() || guardandoMarca}
                className="flex-1 py-2.5 text-sm font-bold bg-slate-800 text-white rounded-xl disabled:opacity-40">
                {guardandoMarca ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}