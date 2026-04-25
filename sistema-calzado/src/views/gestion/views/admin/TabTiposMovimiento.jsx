import { useEffect, useState } from 'react';
import { listTipos, upsertTipo } from '../../api/catalogoClient';
import { Modal, F } from './_shared';

function genCodigo(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,30);
}

export default function TabTiposMovimiento() {
  const [tipos, setTipos] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() { setTipos(await listTipos()); }
  useEffect(() => { load(); }, []);
  async function guardar(row) { await upsertTipo(row); setEdit(null); load(); }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ codigo:'', nombre:'', activo:true, scope:['manual'], comportamientos:[], campos_requeridos:[], _autocodigo:true })}
                className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white">+ Nuevo tipo</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase text-stone-500">
            <tr><th className="p-2">Código</th><th>Nombre</th><th>Dirección</th><th>Scope</th><th>Admin</th><th>Activo</th><th></th></tr>
          </thead>
          <tbody>
            {tipos.map((t) => (
              <tr key={t.id_tipo} className="border-t hover:bg-stone-50">
                <td className="p-2 font-mono text-xs">{t.codigo}</td>
                <td>{t.emoji} {t.nombre}</td>
                <td className="text-xs">{t.direccion}</td>
                <td className="text-xs">{(t.scope||[]).join(', ')}</td>
                <td>{t.solo_admin ? '🔒' : '—'}</td>
                <td>{t.activo ? '✓' : '×'}</td>
                <td><button onClick={() => setEdit({...t, _autocodigo:false})} className="text-indigo-600 text-xs">Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title={edit.id_tipo ? 'Editar tipo' : 'Nuevo tipo'} onCancel={() => setEdit(null)} onGuardar={() => guardar(edit)}>
          <F label="Nombre"><input value={edit.nombre} onChange={(e)=>{const n=e.target.value;setEdit(p=>({...p,nombre:n,codigo:p._autocodigo?genCodigo(n):p.codigo}));}} className="inp" /></F>
          <F label="Código"><input value={edit.codigo} onChange={(e)=>setEdit(p=>({...p,codigo:e.target.value,_autocodigo:false}))} className="inp font-mono text-xs" placeholder="auto" /></F>
          <F label="Emoji"><input value={edit.emoji||''} onChange={(e)=>setEdit(p=>({...p,emoji:e.target.value}))} className="inp" /></F>
          <F label="Dirección">
            <select value={edit.direccion||''} onChange={(e)=>setEdit(p=>({...p,direccion:e.target.value||null}))} className="inp">
              <option value="">—</option><option>entrada</option><option>salida</option><option>transferencia</option>
            </select>
          </F>
          <F label="Naturaleza">
            <select value={edit.naturaleza||''} onChange={(e)=>setEdit(p=>({...p,naturaleza:e.target.value||null}))} className="inp">
              <option value="">—</option><option>operativo</option><option>extraordinario</option><option>interno</option>
            </select>
          </F>
          <F label="Scope (coma-sep)">
            <input value={(edit.scope||[]).join(',')} onChange={(e)=>setEdit(p=>({...p,scope:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}))} className="inp" />
          </F>
          <F label="Comportamientos (coma-sep)">
            <input value={(edit.comportamientos||[]).join(',')} onChange={(e)=>setEdit(p=>({...p,comportamientos:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}))} className="inp" />
          </F>
          <F label="Campos requeridos (JSON)" full>
            <textarea value={JSON.stringify(edit.campos_requeridos||[],null,2)}
                      onChange={(e)=>{ try{setEdit(p=>({...p,campos_requeridos:JSON.parse(e.target.value)}))}catch{} }}
                      className="inp h-20 font-mono text-xs" />
          </F>
          <F label="Solo admin"><input type="checkbox" checked={!!edit.solo_admin} onChange={(e)=>setEdit(p=>({...p,solo_admin:e.target.checked}))} /></F>
          <F label="Activo"><input type="checkbox" checked={edit.activo!==false} onChange={(e)=>setEdit(p=>({...p,activo:e.target.checked}))} /></F>
        </Modal>
      )}
    </div>
  );
}
