import { useEffect, useState } from 'react';
import { listPlantillas, upsertPlantilla, listTipos } from '../../api/catalogoClient';
import { Modal, F } from './_shared';

function genCodigo(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,30);
}

export default function TabPlantillas() {
  const [plantillas, setPlantillas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() {
    const [p,t] = await Promise.all([listPlantillas(), listTipos()]);
    setPlantillas(p); setTipos(t);
  }
  useEffect(() => { load(); }, []);
  async function guardar(row) { await upsertPlantilla(row); setEdit(null); load(); }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ codigo:'', nombre:'', frecuencia:'mensual', estado:'activa', activo:true, _autocodigo:true })}
                className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white">+ Nueva plantilla</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr><th className="p-2">Código</th><th>Nombre</th><th>Tipo</th><th>Frecuencia</th><th>Estado</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {plantillas.map((p) => (
            <tr key={p.id_plantilla} className="border-t hover:bg-stone-50">
              <td className="p-2 font-mono text-xs">{p.codigo}</td>
              <td>{p.nombre}</td>
              <td className="text-xs">{p.tipo?.nombre}</td>
              <td>{p.frecuencia}</td>
              <td>{p.estado}</td>
              <td>{p.activo ? '✓' : '×'}</td>
              <td><button onClick={() => setEdit({...p, _autocodigo:false})} className="text-indigo-600 text-xs">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={edit.id_plantilla ? 'Editar plantilla' : 'Nueva plantilla'} onCancel={() => setEdit(null)} onGuardar={() => guardar(edit)}>
          <F label="Nombre"><input value={edit.nombre} onChange={(e)=>{const n=e.target.value;setEdit(p=>({...p,nombre:n,codigo:p._autocodigo?genCodigo(n):p.codigo}));}} className="inp" /></F>
          <F label="Código"><input value={edit.codigo} onChange={(e)=>setEdit(p=>({...p,codigo:e.target.value,_autocodigo:false}))} className="inp font-mono text-xs" placeholder="auto" /></F>
          <F label="Tipo">
            <select value={edit.id_tipo||''} onChange={(e)=>setEdit(p=>({...p,id_tipo:Number(e.target.value)||null}))} className="inp">
              <option value="">—</option>
              {tipos.map(t=><option key={t.id_tipo} value={t.id_tipo}>{t.nombre}</option>)}
            </select>
          </F>
          <F label="Monto estimado"><input type="number" step="0.01" value={edit.monto_estimado||''} onChange={(e)=>setEdit(p=>({...p,monto_estimado:e.target.value?Number(e.target.value):null}))} className="inp" /></F>
          <F label="Frecuencia">
            <select value={edit.frecuencia||'mensual'} onChange={(e)=>setEdit(p=>({...p,frecuencia:e.target.value}))} className="inp">
              <option>mensual</option><option>quincenal</option><option>semanal</option><option>unico</option>
            </select>
          </F>
          <F label="Estado">
            <select value={edit.estado||'activa'} onChange={(e)=>setEdit(p=>({...p,estado:e.target.value}))} className="inp">
              <option>activa</option><option>pausada</option><option>archivada</option>
            </select>
          </F>
          <F label="Activo"><input type="checkbox" checked={edit.activo!==false} onChange={(e)=>setEdit(p=>({...p,activo:e.target.checked}))} /></F>
        </Modal>
      )}
    </div>
  );
}
