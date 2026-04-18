import { useEffect, useState } from 'react';
import { listRoles, upsertRol } from '../../api/catalogoClient';
import { Modal, F } from './_shared';

function genCodigo(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,30);
}

export default function TabRoles() {
  const [roles, setRoles] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() { setRoles(await listRoles()); }
  useEffect(() => { load(); }, []);
  async function guardar(row) { await upsertRol(row); setEdit(null); load(); }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ codigo:'', nombre:'', ambito:'Ambos', orden:50, activo:true, _autocodigo:true })}
                className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white">+ Nuevo rol</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr><th className="p-2">Código</th><th>Nombre</th><th>Ámbito</th><th>Orden</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id_rol} className="border-t hover:bg-stone-50">
              <td className="p-2 font-mono text-xs">{r.codigo}</td>
              <td>{r.nombre}</td><td>{r.ambito}</td><td>{r.orden}</td>
              <td>{r.activo ? '✓' : '×'}</td>
              <td><button onClick={() => setEdit({...r, _autocodigo:false})} className="text-indigo-600 text-xs">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={edit.id_rol ? 'Editar rol' : 'Nuevo rol'} onCancel={() => setEdit(null)} onGuardar={() => guardar(edit)}>
          <F label="Nombre"><input value={edit.nombre} onChange={(e)=>{const n=e.target.value;setEdit(p=>({...p,nombre:n,codigo:p._autocodigo?genCodigo(n):p.codigo}));}} className="inp" /></F>
          <F label="Código"><input value={edit.codigo} onChange={(e)=>setEdit(p=>({...p,codigo:e.target.value,_autocodigo:false}))} className="inp font-mono text-xs" placeholder="auto" /></F>
          <F label="Ámbito">
            <select value={edit.ambito||'Ambos'} onChange={(e)=>setEdit(p=>({...p,ambito:e.target.value}))} className="inp">
              <option>Ambos</option><option>Tienda</option><option>Taller</option>
            </select>
          </F>
          <F label="Orden"><input type="number" value={edit.orden||0} onChange={(e)=>setEdit(p=>({...p,orden:Number(e.target.value)}))} className="inp" /></F>
          <F label="Activo"><input type="checkbox" checked={edit.activo!==false} onChange={(e)=>setEdit(p=>({...p,activo:e.target.checked}))} /></F>
        </Modal>
      )}
    </div>
  );
}
