/* PlanificadorPedido v5.4 — mobile-first responsive */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../api/supabase';
import { jsPDF } from 'jspdf';

const SERIES = ['Grande', 'Mediana', 'Pequeña'];
const P = 12, CS = 21, CM = 30;
const BK = 'modelos-fotos';
const fU = p => { try { return p ? `${supabase.supabaseUrl}/storage/v1/object/public/${BK}/${p}` : null; } catch { return null; } };
const sw = d => {
  const t = new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate()+3-(t.getDay()+6)%7);
  const w = new Date(t.getFullYear(),0,4);
  return 1 + Math.round(((t-w)/86400000-3+(w.getDay()+6)%7)/7);
};
const UNIDADES = ['metro','par','unidad','ml','bolsa','litro','galón','pliego','rollo','docena','pack'];

// ─── Tarjeta de item individual (sub-item dentro de un grupo) ────────────────
function CartSubItem({ it, i, onRemove, onChange }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white border border-slate-100">
      <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
        <span className="px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] font-medium">{it.serie}</span>
        <span className="px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] font-medium truncate max-w-[90px]">{it.colorNombre}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={() => onChange(i, Math.max(1, it.docenas - 1))}
          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-xs font-bold bg-white active:scale-90">−</button>
        <span className="font-extrabold text-sm w-5 text-center">{it.docenas}</span>
        <button onClick={() => onChange(i, it.docenas + 1)}
          className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-xs font-bold bg-white active:scale-90">+</button>
      </div>
      <button onClick={() => onRemove(i)} className="text-slate-300 hover:text-red-500 text-sm flex-shrink-0 p-0.5">✕</button>
    </div>
  );
}

// ─── Lista agrupada por modelo → serie ───────────────────────────────────────
function GroupedCartList({ items, onRemove, onChange }) {
  const groups = [];
  const map = {};
  items.forEach((it, i) => {
    const key = it.id_producto;
    if (!map[key]) {
      map[key] = { nombre: it.nombre, marca: it.marca, id_producto: it.id_producto, series: {} };
      groups.push(map[key]);
    }
    const sk = it.serie;
    if (!map[key].series[sk]) map[key].series[sk] = [];
    map[key].series[sk].push({ ...it, _idx: i });
  });

  return (
    <div className="space-y-3">
      {groups.map(g => {
        const allItems = Object.values(g.series).flat();
        const totalDoc = allItems.reduce((s, x) => s + x.docenas, 0);
        const serieKeys = Object.keys(g.series);
        return (
          <div key={g.id_producto} className="rounded-2xl overflow-hidden" style={{ background:'#faf9f7' }}>
            {/* Header del modelo */}
            <div className="px-3.5 pt-3 pb-1.5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-400 font-medium">{g.marca}</p>
                <p className="font-bold text-sm text-slate-800">{g.nombre}</p>
              </div>
              <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-100 flex-shrink-0 ml-2">
                {totalDoc} doc · {totalDoc * P}p
              </span>
            </div>
            {/* Por serie */}
            <div className="px-2.5 pb-2.5 space-y-1">
              {serieKeys.map(serie => (
                <div key={serie}>
                  {serieKeys.length > 1 && (
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-1.5 pt-1 pb-0.5">{serie}</p>
                  )}
                  <div className="space-y-1">
                    {g.series[serie].map(it => (
                      <div key={it._idx} className="flex items-center gap-2 py-1.5 px-2.5 rounded-xl bg-white border border-slate-100">
                        <span className="text-xs text-slate-600 truncate flex-1 min-w-0">{it.colorNombre}</span>
                        {serieKeys.length <= 1 && (
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{it.serie}</span>
                        )}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => onChange(it._idx, Math.max(1, it.docenas - 1))}
                            className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-xs font-bold bg-white active:scale-90">−</button>
                          <span className="font-extrabold text-sm w-5 text-center">{it.docenas}</span>
                          <button onClick={() => onChange(it._idx, it.docenas + 1)}
                            className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-xs font-bold bg-white active:scale-90">+</button>
                        </div>
                        <button onClick={() => onRemove(it._idx)} className="text-slate-300 hover:text-red-500 text-xs flex-shrink-0 p-0.5">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Drawer carrito móvil ──────────────────────────────────────────────────────
function CartDrawer({ items, tDoc, tPar, onClose, onRemove, onChange, onGuardar }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/5">
          <h3 className="font-bold text-slate-800">Pedido</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-slate-600 text-xl rounded-xl hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {items.length === 0
            ? <p className="text-sm text-slate-300 text-center py-12">Agrega modelos al pedido</p>
            : <GroupedCartList items={items} onRemove={onRemove} onChange={onChange} />
          }
        </div>
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-black/5 space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-sm text-slate-400">Docenas</span>
              <span className="text-3xl font-extrabold">{tDoc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Pares</span>
              <span className="text-lg font-bold">{tPar}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Capacidad</span><span>{tDoc}/{CS}</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${tDoc > CM ? 'bg-red-500' : tDoc > CS ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width:`${Math.min((tDoc/CM)*100,100)}%` }} />
            </div>
            <button onClick={() => { onClose(); onGuardar(); }}
              className="w-full py-3.5 bg-slate-800 text-white font-bold text-sm rounded-xl active:scale-[0.98]">
              Guardar y generar lista →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fila de material (móvil: tarjeta, desktop: tr) ──────────────────────────
function MaterialCardMobile({ m, ii, gi, onUpd, onDel, isManual }) {
  const sub = (parseFloat(m.cantidad_ajustada) || 0) * (parseFloat(m.precio) || 0);
  return (
    <div className="bg-white rounded-xl border border-black/5 p-3.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {isManual || m.es_manual
            ? <input value={m.nombre || ''} onChange={e => onUpd(gi, ii, 'nombre', e.target.value)}
                placeholder="Material..."
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400 font-medium" />
            : <p className="text-sm font-medium text-slate-800 leading-snug">{m.nombre}</p>
          }
        </div>
        <button onClick={() => onDel(gi, ii)} className="text-slate-300 hover:text-red-500 p-1 flex-shrink-0">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Cant.</p>
          <input type="number" value={m.cantidad_ajustada || ''} onChange={e => onUpd(gi, ii, 'cantidad_ajustada', parseFloat(e.target.value) || 0)}
            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-sm text-right font-bold outline-none focus:border-amber-400" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Unidad</p>
          <select value={m.unidad} onChange={e => onUpd(gi, ii, 'unidad', e.target.value)}
            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-amber-400">
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Precio</p>
          <div className="flex items-center gap-1 px-2.5 py-2 border border-slate-200 rounded-lg focus-within:border-amber-400">
            <span className="text-xs text-slate-400">S/</span>
            <input type="number" inputMode="decimal" value={m.precio || ''} onChange={e => onUpd(gi, ii, 'precio', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="flex-1 text-sm text-right font-bold outline-none bg-transparent w-full" />
          </div>
        </div>
        <div className="text-right flex flex-col justify-end">
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Subtotal</p>
          <p className="text-sm font-bold text-slate-800 pt-1">{sub > 0 ? `S/${sub.toFixed(2)}` : '—'}</p>
        </div>
      </div>
    </div>
  );
}

function OtroCardMobile({ m, i, onUpd, onDel }) {
  const sub = (parseFloat(m.cantidad_ajustada) || 0) * (parseFloat(m.precio) || 0);
  return (
    <div className="bg-white rounded-xl border border-black/5 p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <input value={m.nombre || ''} onChange={e => onUpd(i, 'nombre', e.target.value)}
          placeholder="Material..."
          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400 font-medium" />
        <button onClick={() => onDel(i)} className="text-slate-300 hover:text-red-500 p-1 flex-shrink-0">✕</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Cant.</p>
          <input type="number" value={m.cantidad_ajustada || ''} onChange={e => onUpd(i, 'cantidad_ajustada', parseFloat(e.target.value) || 0)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-bold outline-none focus:border-amber-400" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">Unidad</p>
          <select value={m.unidad} onChange={e => onUpd(i, 'unidad', e.target.value)}
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-amber-400">
            {['unidad','metro','par','ml','bolsa','litro','rollo','pack','bobina','docena'].map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mb-1">S/ precio</p>
          <input type="number" value={m.precio || ''} onChange={e => onUpd(i, 'precio', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs text-right outline-none focus:border-amber-400" />
        </div>
      </div>
      {sub > 0 && <p className="text-right text-xs text-slate-400">Subtotal: <span className="font-bold text-slate-700">S/{sub.toFixed(2)}</span></p>}
    </div>
  );
}

const CAT_MAT = ['Cuero','Suela','Insumo','Etiqueta','Herramienta','General'];

// ─── Modal para seleccionar/agregar material ──────────────────────────────────
function ModalMaterial({ matsCat, onSelect, onNuevo, onClose }) {
  const [busq, setBusq] = useState('');
  const filtrados = matsCat.filter(m =>
    !busq.trim() || m.nombre.toLowerCase().includes(busq.toLowerCase())
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 md:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
        <div className="px-5 pt-4 pb-3 border-b border-black/5 flex items-center justify-between">
          <h3 className="font-black text-base text-slate-900">Seleccionar material</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 text-xl">×</button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <input value={busq} onChange={e => setBusq(e.target.value)}
            placeholder="Buscar material..."
            autoFocus
            className="w-full px-4 py-2.5 border border-black/10 rounded-xl text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 transition-all" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {filtrados.length === 0 && (
            <p className="text-sm text-slate-300 text-center py-8">Sin resultados</p>
          )}
          {filtrados.map(m => (
            <button key={m.id_material} onClick={() => onSelect(m)}
              className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 border border-transparent rounded-xl transition-all active:scale-[0.98] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate">{m.nombre}</p>
                <p className="text-[11px] text-slate-400">{m.unidad_medida} · {m.precio_unitario > 0 ? `S/${Number(m.precio_unitario).toFixed(2)}` : 'Sin precio'}</p>
              </div>
              {m.precio_unitario > 0 && (
                <span className="text-xs font-bold text-slate-500 flex-shrink-0">S/{Number(m.precio_unitario).toFixed(2)}</span>
              )}
            </button>
          ))}
        </div>
        <div className="px-4 pb-5 pt-2 border-t border-black/5">
          <button onClick={onNuevo}
            className="w-full py-3 border-2 border-dashed border-amber-300 text-amber-600 font-bold text-sm rounded-xl hover:bg-amber-50 transition-colors active:scale-[0.98]">
            + Registrar nuevo material
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal para crear material nuevo ─────────────────────────────────────────
function ModalNuevoMaterial({ onGuardar, onClose }) {
  const [form, setForm] = useState({ nombre:'', categoria:'General', unidad_medida:'unidad', precio_unitario:'' });
  const [guardando, setGuardando] = useState(false);
  const handleGuardar = async () => {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try {
      const { data, error } = await supabase.from('materiales_catalogo').insert([{
        nombre: form.nombre.trim(),
        categoria: form.categoria,
        unidad_medida: form.unidad_medida,
        precio_unitario: parseFloat(form.precio_unitario) || 0,
      }]).select().single();
      if (error) throw error;
      onGuardar(data);
    } catch(e) { alert('Error: ' + e.message); }
    finally { setGuardando(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl p-5 pb-8">
        <div className="flex justify-center mb-3 md:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-base">Nuevo material</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Nombre</label>
            <input value={form.nombre} onChange={e => setForm(p=>({...p,nombre:e.target.value}))}
              placeholder="Ej: Cuero natural, Planta PVC..." autoFocus
              className="w-full px-3.5 py-2.5 border border-black/10 rounded-xl text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(p=>({...p,categoria:e.target.value}))}
                className="w-full px-3 py-2.5 border border-black/10 rounded-xl text-sm bg-white outline-none focus:border-amber-400">
                {CAT_MAT.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Unidad</label>
              <select value={form.unidad_medida} onChange={e => setForm(p=>({...p,unidad_medida:e.target.value}))}
                className="w-full px-3 py-2.5 border border-black/10 rounded-xl text-sm bg-white outline-none focus:border-amber-400">
                {UNIDADES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Precio unitario</label>
            <div className="flex items-center gap-2 px-3.5 py-2.5 border border-black/10 rounded-xl focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-50 transition-all">
              <span className="text-sm text-slate-400 font-bold">S/</span>
              <input type="number" inputMode="decimal" value={form.precio_unitario}
                onChange={e => setForm(p=>({...p,precio_unitario:e.target.value}))}
                placeholder="0.00"
                className="flex-1 text-sm font-bold outline-none bg-transparent" />
            </div>
          </div>
          <button onClick={handleGuardar} disabled={guardando || !form.nombre.trim()}
            className="w-full py-3.5 bg-slate-800 text-white font-bold text-sm rounded-xl disabled:opacity-40 active:scale-[0.98] transition-all mt-2">
            {guardando ? 'Guardando...' : 'Guardar material'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function PlanificadorPedido({ usuario }) {
  const [ld, sLd]           = useState(true);
  const [prods, sProds]     = useState([]);
  const [marcas, sMarcas]   = useState([]);
  const [colores, sColores] = useState([]);
  const [matsCat, sMatsCat] = useState([]);
  const [matsMod, sMatsMod] = useState([]);
  const [paso, sPaso]       = useState(1);
  const [items, sItems]     = useState([]);
  const [pedidoId, sPedidoId] = useState(null);
  const [listaItems, sListaItems] = useState([]);
  const [otrosItems, sOtrosItems] = useState([]);
  const [exp, sExp]         = useState(null);
  const [selS, sSelS]       = useState('Grande');
  const [selC, sSelC]       = useState(null);
  const [selD, sSelD]       = useState(1);
  const [busq, sBusq]       = useState('');
  const [showHist, sShowHist] = useState(false);
  const [hist, sHist]       = useState([]);
  const [showCart, sShowCart] = useState(false);
  // Modal seleccionar material: { tipo:'grupo'|'otro', gi:number|null }
  const [modalMat, setModalMat] = useState(null);
  const [modalNuevoMat, setModalNuevoMat] = useState(false);

  const load = useCallback(async () => {
    sLd(true);
    const [r1,r2,r3,r4,r5,r6] = await Promise.all([
      supabase.from('productos').select('*').eq('estado','Activo').order('nombre_modelo'),
      supabase.from('categorias').select('*'),
      supabase.from('colores_modelos').select('*').eq('estado','Activo').order('color'),
      supabase.from('materiales_catalogo').select('*').eq('activo',true),
      supabase.from('materiales_modelo').select('*'),
      supabase.from('pedidos_semana').select('*').order('fecha',{ascending:false}).limit(20),
    ]);
    sProds(r1.data||[]); sMarcas(r2.data||[]); sColores(r3.data||[]);
    sMatsCat(r4.data||[]); sMatsMod(r5.data||[]); sHist(r6.data||[]);
    sLd(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tDoc = useMemo(() => items.reduce((s,i) => s+i.docenas, 0), [items]);
  const tPar = tDoc * P;
  const mn = id => marcas.find(m => m.id_categoria === id)?.nombre_categoria || '';
  const pf = useMemo(() => {
    if (!busq.trim()) return prods;
    const q = busq.toLowerCase();
    return prods.filter(p => p.nombre_modelo.toLowerCase().includes(q) || mn(p.id_categoria).toLowerCase().includes(q));
  }, [prods, busq, marcas]);

  const addItem = () => {
    if (!exp || !selC) return;
    const p = prods.find(x => x.id_producto === exp); if (!p) return;
    const col = colores.find(c => c.id_color === selC);
    const k = `${p.id_producto}-${selS}-${selC}`;
    const idx = items.findIndex(i => `${i.id_producto}-${i.serie}-${i.colorId}` === k);
    if (idx >= 0) sItems(prev => prev.map((it,i) => i===idx ? {...it, docenas:it.docenas+selD} : it));
    else sItems(prev => [...prev, { id_producto:p.id_producto, nombre:p.nombre_modelo, marca:mn(p.id_categoria), serie:selS, colorId:selC, colorNombre:col?.color||'—', docenas:selD }]);
    sExp(null); sSelD(1); sSelC(null);
  };

  const guardarYGenerar = async () => {
    if (!items.length) return;
    const { data: ped } = await supabase.from('pedidos_semana').insert([{
      fecha: new Date().toISOString().split('T')[0],
      semana_numero: sw(new Date()), anio: new Date().getFullYear(),
      responsable: usuario?.nombre||'Fábrica', estado:'borrador',
      total_docenas: tDoc, total_pares: tPar,
    }]).select().single();
    if (!ped) { alert('Error'); return; }
    await supabase.from('pedido_items').insert(items.map(i => ({
      id_pedido: ped.id_pedido, id_producto: i.id_producto,
      nombre_serie: i.serie, docenas: i.docenas, notas: i.colorNombre,
    })));
    sPedidoId(ped.id_pedido);
    const grouped = [];
    items.forEach(item => {
      const mats = matsMod.filter(m => m.id_producto===item.id_producto && m.nombre_serie===item.serie && (m.id_color===item.colorId||!m.id_color));
      const group = { key:`${item.marca} - ${item.nombre} - ${item.colorNombre} (${item.docenas} doc ${item.serie})`, items:[] };
      mats.forEach(m => {
        const mc = matsCat.find(c => c.id_material===m.id_material); if (!mc) return;
        group.items.push({ nombre:mc.nombre, unidad:mc.unidad_medida, precio:mc.precio_unitario||0, cantidad:m.cantidad_por_docena*item.docenas, cantidad_ajustada:m.cantidad_por_docena*item.docenas });
      });
      grouped.push(group);
    });
    sListaItems(grouped); sOtrosItems([]);
    const { data: lista } = await supabase.from('lista_compras').insert([{ id_pedido:ped.id_pedido, estado:'generada' }]).select().single();
    if (lista) {
      const flat = [];
      grouped.forEach(g => g.items.forEach(m => flat.push({ id_lista:lista.id_lista, nombre_material:m.nombre, unidad:m.unidad, cantidad_calculada:m.cantidad, cantidad_ajustada:m.cantidad_ajustada, precio_estimado:m.precio, modelos_origen:g.key })));
      if (flat.length) await supabase.from('lista_compras_items').insert(flat);
    }
    sPaso(2);
  };

  const updGI = (gi,ii,c,v) => sListaItems(p => p.map((g,gx) => gx!==gi ? g : { ...g, items: g.items.map((it,ix) => ix!==ii ? it : {...it,[c]:v}) }));
  const delGI = (gi,ii) => sListaItems(p => p.map((g,gx) => gx!==gi ? g : { ...g, items: g.items.filter((_,ix) => ix!==ii) }).filter(g => g.items.length>0));

  // Abre el modal en lugar de agregar en blanco
  const addToGroup = gi => setModalMat({ tipo:'grupo', gi });
  const addOtro    = ()  => setModalMat({ tipo:'otro', gi:null });

  // Cuando el usuario selecciona un material del catálogo
  const handleSelectMat = (mc) => {
    if (!modalMat) return;
    if (modalMat.tipo === 'grupo') {
      const gi = modalMat.gi;
      sListaItems(p => p.map((g,gx) => gx!==gi ? g : {
        ...g, items: [...g.items, {
          nombre: mc.nombre, unidad: mc.unidad_medida,
          precio: mc.precio_unitario || 0,
          cantidad: 0, cantidad_ajustada: 0, es_manual: true,
        }]
      }));
    } else {
      sOtrosItems(p => [...p, {
        nombre: mc.nombre, unidad: mc.unidad_medida,
        precio: mc.precio_unitario || 0, cantidad_ajustada: 0,
      }]);
    }
    setModalMat(null);
  };

  // Cuando se crea un material nuevo, lo agrega y recarga
  const handleNuevoMat = async (mc) => {
    // Recargar matsCat con el nuevo
    const { data } = await supabase.from('materiales_catalogo').select('*').eq('activo', true);
    sMatsCat(data || []);
    handleSelectMat(mc);
    setModalNuevoMat(false);
  };

  const updO = (i,c,v) => sOtrosItems(p => p.map((it,x) => x!==i ? it : {...it,[c]:v}));
  const delO = i => sOtrosItems(p => p.filter((_,x) => x!==i));
  const confirmar = async () => {
    if (pedidoId) await supabase.from('pedidos_semana').update({ estado:'confirmado' }).eq('id_pedido', pedidoId);
    sPaso(3);
  };

  const genPDF = () => {
    const doc = new jsPDF('p','mm','a4'); const W=210, M=16; let y=M;
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('BERNA CALZADO',M,y+6);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Lista de compra — Semana ${sw(new Date())} — ${new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'})}`,M,y+13);
    doc.setDrawColor(200); doc.line(M,y+17,W-M,y+17); y+=26;
    let gT=0;
    listaItems.forEach(g => {
      if (y>245) { doc.addPage(); y=M+5; }
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30); doc.text(g.key,M,y); y+=6;
      const cMat=M,cCant=115,cUd=135,cSub=W-M;
      doc.setFillColor(245,244,240); doc.rect(M,y-3.5,W-2*M,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text('Material',cMat,y); doc.text('Cant.',cCant,y,{align:'right'}); doc.text('Ud.',cUd,y); doc.text('Subtotal',cSub,y,{align:'right'});
      y+=7; doc.setDrawColor(220); doc.line(M,y-1.5,W-M,y-1.5);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(30);
      g.items.filter(m => (m.cantidad_ajustada||0)>0||m.nombre).forEach(m => {
        if (y>275) { doc.addPage(); y=M+5; }
        const cant=Math.round((m.cantidad_ajustada||0)*100)/100; const pr=parseFloat(m.precio)||0; const sub=cant*pr; gT+=sub;
        doc.text((m.nombre||'').substring(0,45),cMat,y); doc.text(String(cant),cCant,y,{align:'right'}); doc.text(m.unidad||'',cUd,y);
        if (sub>0) { doc.setFont('helvetica','bold'); doc.text(`S/${sub.toFixed(2)}`,cSub,y,{align:'right'}); doc.setFont('helvetica','normal'); }
        y+=7;
      }); y+=5;
    });
    if (otrosItems.filter(m=>m.nombre).length>0) {
      if (y>245) { doc.addPage(); y=M+5; }
      doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30); doc.text('Otros',M,y); y+=6;
      const cMat=M,cCant=115,cUd=135,cSub=W-M;
      doc.setFillColor(245,244,240); doc.rect(M,y-3.5,W-2*M,7,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text('Material',cMat,y); doc.text('Cant.',cCant,y,{align:'right'}); doc.text('Ud.',cUd,y); doc.text('Subtotal',cSub,y,{align:'right'});
      y+=7; doc.setDrawColor(220); doc.line(M,y-1.5,W-M,y-1.5);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(30);
      otrosItems.filter(m=>m.nombre).forEach(m => {
        if (y>275) { doc.addPage(); y=M+5; }
        const cant=parseFloat(m.cantidad_ajustada)||0; const pr=parseFloat(m.precio)||0; const sub=cant*pr; gT+=sub;
        doc.text(m.nombre.substring(0,45),cMat,y); doc.text(String(cant),cCant,y,{align:'right'}); doc.text(m.unidad||'',cUd,y);
        if (sub>0) { doc.setFont('helvetica','bold'); doc.text(`S/${sub.toFixed(2)}`,cSub,y,{align:'right'}); doc.setFont('helvetica','normal'); }
        y+=7;
      }); y+=5;
    }
    y+=4; doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(`Total estimado del pedido: S/${gT.toFixed(2)}`,W-M,y,{align:'right'});
    doc.save(`Berna_Compras_S${sw(new Date())}.pdf`);
  };

  const genPDFPedido = () => {
    const doc = new jsPDF('p','mm','a4'); const W=210, M=16; let y=M;
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('BERNA CALZADO',M,y+6);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Pedido semanal — Semana ${sw(new Date())} — ${new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'})}`,M,y+13);
    doc.setDrawColor(200); doc.line(M,y+17,W-M,y+17); y+=26;

    // Agrupar items por modelo → serie
    const groups = {};
    items.forEach(it => {
      const k = it.id_producto;
      if (!groups[k]) groups[k] = { nombre:it.nombre, marca:it.marca, series:{} };
      if (!groups[k].series[it.serie]) groups[k].series[it.serie] = [];
      groups[k].series[it.serie].push(it);
    });

    // Header tabla
    const cMod=M, cSerie=85, cColor=115, cDoc=160, cPar=W-M;
    doc.setFillColor(30,31,38); doc.rect(M,y-3.5,W-2*M,8,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(255);
    doc.text('Modelo',cMod+2,y+1); doc.text('Serie',cSerie,y+1); doc.text('Color',cColor,y+1); doc.text('Doc.',cDoc,y+1,{align:'right'}); doc.text('Pares',cPar,y+1,{align:'right'});
    doc.setTextColor(30); y+=9;

    let totalDocG=0, totalParG=0;

    Object.values(groups).forEach(g => {
      const serieKeys = Object.keys(g.series);
      const gTotalDoc = Object.values(g.series).flat().reduce((s,x) => s+x.docenas, 0);
      const gTotalPar = gTotalDoc * P;
      let firstRow = true;

      serieKeys.forEach(serie => {
        g.series[serie].forEach(it => {
          if (y>275) { doc.addPage(); y=M+5; }
          doc.setFont('helvetica', firstRow ? 'bold' : 'normal'); doc.setFontSize(10);
          if (firstRow) {
            doc.text(`${g.marca} · ${g.nombre}`.substring(0,35), cMod, y);
            firstRow = false;
          }
          doc.setFont('helvetica','normal'); doc.setFontSize(9);
          doc.text(serie, cSerie, y);
          doc.text((it.colorNombre||'—').substring(0,20), cColor, y);
          doc.setFont('helvetica','bold');
          doc.text(String(it.docenas), cDoc, y, {align:'right'});
          doc.text(String(it.docenas * P), cPar, y, {align:'right'});
          doc.setFont('helvetica','normal');
          y+=6;
        });
      });

      // Subtotal modelo
      doc.setDrawColor(220); doc.line(cDoc-20, y-1, W-M, y-1);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80);
      doc.text(`Subtotal ${g.nombre}:`, cDoc-22, y+3, {align:'right'});
      doc.setTextColor(30);
      doc.text(String(gTotalDoc), cDoc, y+3, {align:'right'});
      doc.text(String(gTotalPar), cPar, y+3, {align:'right'});
      totalDocG += gTotalDoc; totalParG += gTotalPar;
      y+=10;
    });

    // Total general
    y+=2;
    doc.setDrawColor(30); doc.setLineWidth(0.5); doc.line(M, y, W-M, y); y+=7;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(30);
    doc.text('TOTAL', cMod, y);
    doc.text(`${totalDocG} doc`, cDoc, y, {align:'right'});
    doc.text(`${totalParG} pares`, cPar, y, {align:'right'});

    doc.save(`Berna_Pedido_S${sw(new Date())}.pdf`);
  };

  const clonar = async ped => {
    const { data } = await supabase.from('pedido_items').select('*,productos(nombre_modelo,id_categoria)').eq('id_pedido', ped.id_pedido);
    if (!data?.length) return;
    sItems(data.map(it => ({ id_producto:it.id_producto, nombre:it.productos?.nombre_modelo||'?', marca:mn(it.productos?.id_categoria), serie:it.nombre_serie, colorId:null, colorNombre:it.notas||'—', docenas:it.docenas })));
    sPedidoId(null); sListaItems([]); sOtrosItems([]); sPaso(1); sShowHist(false);
  };
  const nuevo = () => { sItems([]); sPedidoId(null); sListaItems([]); sOtrosItems([]); sPaso(1); sBusq(''); sExp(null); };
  const handleRemove = (i) => sItems(p => p.filter((_,x) => x!==i));
  const handleChange = (i, val) => sItems(p => p.map((x,j) => j===i ? {...x, docenas:val} : x));

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (ld) return (
    <div className="flex items-center justify-center h-[80vh]">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );

  // ── Historial ────────────────────────────────────────────────────────────────
  if (showHist) return (
    <div className="p-4 md:p-8 max-w-4xl pb-32" style={{ background:'#faf9f7' }}>
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-extrabold">Historial</h1>
        <button onClick={() => sShowHist(false)} className="text-sm text-slate-400 hover:text-slate-700 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">← Volver</button>
      </div>
      <div className="space-y-2">
        {hist.map(p => (
          <div key={p.id_pedido} className="bg-white rounded-2xl border border-black/5 p-4 md:p-5 shadow-sm">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-800">Semana {p.semana_numero} · {new Date(p.fecha+'T12:00:00').toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'})}</p>
                <p className="text-sm text-slate-400 mt-0.5">{p.total_docenas} doc · {p.total_pares} pares</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${p.estado==='confirmado'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{p.estado}</span>
                <button onClick={() => clonar(p)} className="px-3 md:px-4 py-2 text-xs border border-slate-200 rounded-xl hover:bg-slate-50 font-medium">Clonar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Layout principal ──────────────────────────────────────────────────────────
  return (
    <div className="flex w-full max-w-full overflow-hidden" style={{ background:'#faf9f7', height: 'calc(100dvh - 72px)' }}>

      {/* ── Columna principal ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        <div className="mx-4 md:mx-8 mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold text-amber-900 mb-1">Enlace con Finanzas</p>
          <p className="text-amber-900/90 leading-snug">
            Antes o después de confirmar el pedido, revisa liquidez y cuentas en{' '}
            <a href="/gestion/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-amber-950">
              Finanzas → Dashboard
            </a>
            . Cuando junten capital para esta compra, registren una{' '}
            <strong>transferencia interna</strong> con motivo <code className="text-xs bg-white/70 px-1 rounded">aporte_pedido</code>{' '}
            para mantener trazabilidad en el módulo de Transferencias.
          </p>
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 md:px-8 pt-4 pb-3 border-b border-black/5"
             style={{ background:'rgba(250,249,247,0.95)', backdropFilter:'blur(12px)' }}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 leading-tight">Planificador</h1>
              <p className="text-xs text-slate-400 mt-0.5">Semana {sw(new Date())}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { sShowHist(true); load(); }}
                className="px-3 py-2 text-xs font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50">
                Historial
              </button>
              <button onClick={nuevo}
                className="px-3 py-2 text-xs font-medium border border-slate-200 bg-white rounded-xl hover:bg-slate-50">
                Nuevo
              </button>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2">
            {[{n:1,l:'Armar'},{n:2,l:'Ajustar'},{n:3,l:'PDF'}].map((s,i) => (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-1.5 ${paso>=s.n?'':'opacity-30'}`}>
                  <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${paso>s.n?'bg-emerald-500 text-white':paso===s.n?'bg-slate-800 text-white':'bg-slate-200 text-slate-400'}`}>
                    {paso>s.n?'✓':s.n}
                  </div>
                  <span className="text-xs font-medium text-slate-600 hidden sm:block">{s.l}</span>
                </div>
                {i<2 && <div className={`flex-1 h-px ${paso>s.n?'bg-emerald-400':'bg-slate-200'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── PASO 1 ── */}
        {paso === 1 && (
          <div className="px-4 md:px-8 py-5 pb-32 md:pb-8">
            <input value={busq} onChange={e => sBusq(e.target.value)}
              placeholder="Buscar modelo o marca..."
              className="w-full max-w-lg px-4 py-3 bg-white border border-black/5 shadow-sm rounded-2xl text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-50 mb-5 transition-all" />

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {pf.map(p => {
                const ex = exp === p.id_producto;
                const pCols = colores.filter(c => c.id_producto === p.id_producto);
                return (
                  <div key={p.id_producto}
                    className={`bg-white rounded-2xl border overflow-hidden transition-all shadow-sm ${ex ? 'border-amber-400 shadow-lg ring-1 ring-amber-200' : 'border-black/5 hover:shadow-md hover:border-amber-200'}`}>
                    {/* Header tarjeta */}
                    <button onClick={() => { sExp(ex ? null : p.id_producto); sSelC(null); sSelD(1); }}
                      className="w-full text-left p-4 flex items-center gap-3">
                      {fU(p.foto_url)
                        ? <img src={fU(p.foto_url)} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
                        : <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center">
                            <span className="text-slate-300 text-lg font-black">{mn(p.id_categoria)?.slice(0,1)||'?'}</span>
                          </div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-slate-400 font-medium truncate">{mn(p.id_categoria)}</p>
                        <p className="font-bold text-slate-800 leading-tight truncate">{p.nombre_modelo}</p>
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${ex ? 'bg-amber-500 text-white rotate-180' : 'bg-slate-100 text-slate-400'}`}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </button>

                    {/* Expandido */}
                    {ex && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                        {/* Serie */}
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-2">Serie</p>
                          <div className="flex gap-1.5">
                            {SERIES.map(s => (
                              <button key={s} onClick={() => sSelS(s)}
                                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-95 ${selS===s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Color */}
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-2">
                            Color <span className="text-red-400">*</span>
                          </p>
                          {pCols.length > 0 ? (
                            <div className="flex gap-1.5 flex-wrap">
                              {pCols.map(c => (
                                <button key={c.id_color} onClick={() => sSelC(selC===c.id_color ? null : c.id_color)}
                                  className={`px-3 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 active:scale-95 transition-all ${selC===c.id_color ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                  {fU(c.foto_url) && <img src={fU(c.foto_url)} className="w-5 h-5 rounded object-cover" alt="" />}
                                  {c.color}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-300 italic">Sin colores registrados</p>
                          )}
                          {!selC && pCols.length > 0 && <p className="text-xs text-red-400 mt-1.5">Selecciona un color</p>}
                        </div>
                        {/* Docenas */}
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-2">Docenas</p>
                          <div className="flex items-center gap-4">
                            <button onClick={() => sSelD(Math.max(1, selD-1))}
                              className="w-11 h-11 rounded-xl border border-slate-200 font-bold text-lg flex items-center justify-center bg-white active:scale-90">−</button>
                            <div className="flex-1 text-center">
                              <span className="text-3xl font-extrabold text-slate-900">{selD}</span>
                              <span className="text-sm text-slate-400 ml-2">({selD*P}p)</span>
                            </div>
                            <button onClick={() => sSelD(selD+1)}
                              className="w-11 h-11 rounded-xl border border-slate-200 font-bold text-lg flex items-center justify-center bg-white active:scale-90">+</button>
                          </div>
                        </div>
                        <button onClick={addItem} disabled={!selC}
                          className={`w-full py-3.5 text-sm font-bold rounded-xl active:scale-[0.98] transition-all ${selC ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                          {selC ? 'Agregar al pedido' : 'Selecciona color primero'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Botón guardar — desktop, debajo del grid */}
            {items.length > 0 && (
              <div className="mt-8 hidden md:block">
                <button onClick={guardarYGenerar}
                  className="px-8 py-3.5 bg-slate-800 text-white font-bold text-sm rounded-xl active:scale-[0.98] shadow-sm">
                  Guardar y generar lista →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2 ── */}
        {paso === 2 && (
          <div className="px-4 md:px-8 py-5 pb-32 md:pb-8">
            <p className="text-sm text-slate-400 mb-5">Ajusta cantidades. Los materiales están agrupados por modelo.</p>

            {listaItems.map((g, gi) => (
              <div key={gi} className="mb-6">
                <h4 className="text-sm font-bold text-slate-800 mb-2 leading-snug">{g.key}</h4>

                {/* Desktop: tabla */}
                <div className="hidden md:block bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[11px] text-slate-400 font-semibold uppercase" style={{ background:'#f8f7f5' }}>
                        <th className="py-2.5 px-4 text-left">Material</th>
                        <th className="py-2.5 px-3 text-right w-20">Cant.</th>
                        <th className="py-2.5 px-3 w-24">Ud.</th>
                        <th className="py-2.5 px-3 text-right w-24">Precio</th>
                        <th className="py-2.5 px-3 text-right w-24">Subtotal</th>
                        <th className="w-7"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((m, ii) => {
                        const sub = (parseFloat(m.cantidad_ajustada)||0) * (parseFloat(m.precio)||0);
                        return (
                          <tr key={ii} className="border-t border-slate-100 hover:bg-amber-50/20">
                            <td className="py-2.5 px-4 font-medium">
                              {m.es_manual
                                ? <input value={m.nombre||''} onChange={e => updGI(gi,ii,'nombre',e.target.value)} placeholder="Material..." className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400" />
                                : m.nombre}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input type="number" value={m.cantidad_ajustada||''} onChange={e => updGI(gi,ii,'cantidad_ajustada',parseFloat(e.target.value)||0)} className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right font-bold outline-none focus:border-amber-400" />
                            </td>
                            <td className="py-2.5 px-3">
                              <select value={m.unidad} onChange={e => updGI(gi,ii,'unidad',e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">
                                {UNIDADES.map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input type="number" value={m.precio||''} onChange={e => updGI(gi,ii,'precio',parseFloat(e.target.value)||0)} placeholder="S/" className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right font-bold outline-none focus:border-amber-400" />
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">{sub>0?`S/${sub.toFixed(2)}`:'—'}</td>
                            <td className="py-2.5 px-1"><button onClick={() => delGI(gi,ii)} className="text-slate-300 hover:text-red-500 text-xs">✕</button></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-slate-100">
                        <td colSpan="6" className="py-2 px-4">
                          <button onClick={() => addToGroup(gi)} className="text-xs text-amber-600 hover:text-amber-800 font-medium">+ Agregar material</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Móvil: tarjetas */}
                <div className="md:hidden space-y-2">
                  {g.items.map((m, ii) => (
                    <MaterialCardMobile key={ii} m={m} ii={ii} gi={gi} onUpd={updGI} onDel={delGI} />
                  ))}
                  <button onClick={() => addToGroup(gi)}
                    className="w-full py-2.5 text-xs text-amber-600 hover:text-amber-800 font-medium border border-dashed border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                    + Agregar material
                  </button>
                </div>
              </div>
            ))}

            {/* Otros */}
            <div className="mb-6">
              <h4 className="text-sm font-bold text-slate-800 mb-1">Otros</h4>
              <p className="text-xs text-slate-400 mb-3">Materiales adicionales para el taller</p>

              {/* Desktop tabla */}
              <div className="hidden md:block bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-slate-400 font-semibold uppercase" style={{ background:'#f8f7f5' }}>
                      <th className="py-2.5 px-4 text-left">Material</th>
                      <th className="py-2.5 px-3 text-right w-20">Cant.</th>
                      <th className="py-2.5 px-3 w-24">Ud.</th>
                      <th className="py-2.5 px-3 text-right w-24">Precio</th>
                      <th className="w-7"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {otrosItems.map((m, i) => {
                      const sub = (parseFloat(m.cantidad_ajustada)||0) * (parseFloat(m.precio)||0);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-2.5 px-4"><input value={m.nombre||''} onChange={e => updO(i,'nombre',e.target.value)} placeholder="Material..." className="w-full px-2 py-1 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400" /></td>
                          <td className="py-2.5 px-3 text-right"><input type="number" value={m.cantidad_ajustada||''} onChange={e => updO(i,'cantidad_ajustada',parseFloat(e.target.value)||0)} className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right font-bold outline-none" /></td>
                          <td className="py-2.5 px-3"><select value={m.unidad} onChange={e => updO(i,'unidad',e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">{['unidad','metro','par','ml','bolsa','litro','rollo','pack','bobina','docena'].map(u => <option key={u}>{u}</option>)}</select></td>
                          <td className="py-2.5 px-3 text-right"><input type="number" value={m.precio||''} onChange={e => updO(i,'precio',parseFloat(e.target.value)||0)} placeholder="S/" className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-xs text-right outline-none" /></td>
                          <td className="py-2.5 px-1"><button onClick={() => delO(i)} className="text-slate-300 hover:text-red-500 text-xs">✕</button></td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-slate-100">
                      <td colSpan="5" className="py-2 px-4">
                        <button onClick={addOtro} className="text-xs text-amber-600 hover:text-amber-800 font-medium">+ Agregar item</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Móvil tarjetas */}
              <div className="md:hidden space-y-2">
                {otrosItems.map((m, i) => (
                  <OtroCardMobile key={i} m={m} i={i} onUpd={updO} onDel={delO} />
                ))}
                <button onClick={addOtro}
                  className="w-full py-2.5 text-xs text-amber-600 hover:text-amber-800 font-medium border border-dashed border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                  + Agregar item
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pb-4">
              <button onClick={() => sPaso(1)} className="px-5 py-2.5 text-sm font-medium text-slate-500 border border-slate-200 rounded-xl bg-white">← Pedido</button>
              <button onClick={confirmar} className="px-6 py-2.5 text-sm font-bold bg-slate-800 text-white rounded-xl active:scale-[0.98]">Confirmar →</button>
            </div>
          </div>
        )}

        {/* ── PASO 3 ── */}
        {paso === 3 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold mb-2 text-slate-900">Pedido confirmado</h2>
            <p className="text-sm text-slate-400 mb-10">{tDoc} doc · {tPar} pares</p>
            <div className="flex gap-3 flex-wrap justify-center">
              <button onClick={genPDF} className="px-8 py-3.5 bg-slate-800 text-white font-bold rounded-xl shadow-sm active:scale-[0.98]">Descargar compras</button>
              <button onClick={genPDFPedido} className="px-8 py-3.5 bg-white text-slate-800 font-bold rounded-xl shadow-sm border border-slate-200 active:scale-[0.98]">Descargar pedido</button>
              <button onClick={nuevo} className="px-6 py-3.5 text-sm text-slate-500 border border-slate-200 rounded-xl bg-white">Nuevo</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel lateral — SOLO DESKTOP ──────────────────────────────────────── */}
      <div className="w-[400px] flex-shrink-0 bg-white border-l border-black/5 flex-col shadow-sm hidden lg:flex">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Pedido</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0
            ? <p className="text-sm text-slate-300 text-center py-16">Agrega modelos</p>
            : <GroupedCartList items={items} onRemove={handleRemove} onChange={handleChange} />
          }
        </div>
        {items.length > 0 && (
          <div className="p-5 border-t border-slate-100">
            <div className="flex justify-between items-end mb-1">
              <span className="text-sm text-slate-400">Docenas</span>
              <span className="text-3xl font-extrabold">{tDoc}</span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-sm text-slate-400">Pares</span>
              <span className="text-lg font-bold">{tPar}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Capacidad</span><span>{tDoc}/{CS}</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div className={`h-full rounded-full transition-all ${tDoc>CM?'bg-red-500':tDoc>CS?'bg-amber-500':'bg-emerald-500'}`}
                style={{ width:`${Math.min((tDoc/CM)*100,100)}%` }} />
            </div>
            {paso === 1 && (
              <button onClick={guardarYGenerar}
                className="w-full py-3 bg-slate-800 text-white font-bold text-sm rounded-xl active:scale-[0.98]">
                Guardar y generar lista →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── FAB carrito móvil — SOLO cuando hay items en paso 1 ──────────────── */}
      {paso === 1 && (
        <div className="fixed bottom-6 right-4 z-40 lg:hidden flex flex-col items-end gap-3">
          {/* Botón guardar flotante — aparece cuando hay items */}
          {items.length > 0 && (
            <button onClick={guardarYGenerar}
              className="px-5 py-3.5 bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-xl active:scale-[0.98] flex items-center gap-2">
              <span>Generar lista</span>
              <span className="text-slate-400 font-normal text-xs">({tDoc} doc)</span>
            </button>
          )}
          {/* Botón carrito */}
          <button onClick={() => sShowCart(true)}
            className="w-14 h-14 bg-white border border-black/10 shadow-xl rounded-2xl flex items-center justify-center relative active:scale-95">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
            </svg>
            {items.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-slate-800 text-white text-xs font-black rounded-full flex items-center justify-center">
                {items.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Drawer carrito móvil ──────────────────────────────────────────────── */}
      {showCart && (
        <CartDrawer
          items={items}
          tDoc={tDoc}
          tPar={tPar}
          onClose={() => sShowCart(false)}
          onRemove={handleRemove}
          onChange={handleChange}
          onGuardar={guardarYGenerar}
        />
      )}

      {/* ── Modal seleccionar material ────────────────────────────────────────── */}
      {modalMat && (
        <ModalMaterial
          matsCat={matsCat}
          onSelect={handleSelectMat}
          onNuevo={() => { setModalNuevoMat(true); }}
          onClose={() => setModalMat(null)}
        />
      )}

      {/* ── Modal crear material nuevo ────────────────────────────────────────── */}
      {modalNuevoMat && (
        <ModalNuevoMaterial
          onGuardar={handleNuevoMat}
          onClose={() => setModalNuevoMat(false)}
        />
      )}
    </div>
  );
}