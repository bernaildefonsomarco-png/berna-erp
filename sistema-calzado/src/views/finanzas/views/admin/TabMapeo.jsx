import { useEffect, useState } from 'react';
import { listMapeos, upsertMapeo, listTipos, listPlanCuentas } from '../../api/catalogoClient';
import { Modal, F } from './_shared';

export default function TabMapeo() {
  const [mapeos, setMapeos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() {
    const [m,t,c] = await Promise.all([listMapeos(), listTipos(), listPlanCuentas()]);
    setMapeos(m); setTipos(t); setCuentas(c);
  }
  useEffect(() => { load(); }, []);
  async function guardar(row) { await upsertMapeo(row); setEdit(null); load(); }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ ubicacion_rol:'*', activo:true })}
                className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white">+ Nuevo mapeo</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr><th className="p-2">Tipo</th><th>Rol</th><th>Cuenta contable</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {mapeos.map((m) => (
            <tr key={m.id_mapeo} className="border-t hover:bg-stone-50">
              <td className="p-2 text-xs">{m.tipo?.nombre}</td>
              <td>{m.ubicacion_rol}</td>
              <td className="text-xs">{m.cuenta?.codigo} {m.cuenta?.nombre}</td>
              <td>{m.activo ? '✓' : '×'}</td>
              <td><button onClick={() => setEdit({...m})} className="text-indigo-600 text-xs">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title="Mapeo Tipo↔Cuenta" onCancel={() => setEdit(null)} onGuardar={() => guardar(edit)}>
          <F label="Tipo">
            <select value={edit.id_tipo||''} onChange={(e)=>setEdit(p=>({...p,id_tipo:Number(e.target.value)||null}))} className="inp">
              <option value="">—</option>
              {tipos.map(t=><option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
            </select>
          </F>
          <F label="Rol ubicación">
            <select value={edit.ubicacion_rol||'*'} onChange={(e)=>setEdit(p=>({...p,ubicacion_rol:e.target.value}))} className="inp">
              <option value="*">* (todos)</option><option value="Tienda">Tienda</option><option value="Taller">Taller</option>
            </select>
          </F>
          <F label="Cuenta contable">
            <select value={edit.id_cuenta_contable||''} onChange={(e)=>setEdit(p=>({...p,id_cuenta_contable:Number(e.target.value)||null}))} className="inp">
              <option value="">—</option>
              {cuentas.map(c=><option key={c.id_cuenta_contable} value={c.id_cuenta_contable}>{c.codigo} {c.nombre}</option>)}
            </select>
          </F>
          <F label="Activo"><input type="checkbox" checked={edit.activo!==false} onChange={(e)=>setEdit(p=>({...p,activo:e.target.checked}))} /></F>
        </Modal>
      )}
    </div>
  );
}
