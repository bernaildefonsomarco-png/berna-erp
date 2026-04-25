import { useEffect, useState } from 'react';
import { listCatalogosAux, upsertCatalogoAux } from '../../api/catalogoClient';
import { Modal, F } from './_shared';

function genCodigo(n) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,30);
}

export default function TabCatalogosAux() {
  const [cats, setCats] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() { setCats(await listCatalogosAux()); }
  useEffect(() => { load(); }, []);
  async function guardar(row) { await upsertCatalogoAux(row); setEdit(null); load(); }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ codigo:'', nombre:'', items:[], activo:true, _autocodigo:true })}
                className="rounded-md bg-stone-900 px-3 py-1 text-sm text-white">+ Nuevo catálogo</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr><th className="p-2">Código</th><th>Nombre</th><th>Items</th><th>Activo</th><th></th></tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id_catalogo} className="border-t hover:bg-stone-50">
              <td className="p-2 font-mono text-xs">{c.codigo}</td>
              <td>{c.nombre}</td>
              <td className="text-xs text-stone-500">{(c.items||[]).length} items</td>
              <td>{c.activo ? '✓' : '×'}</td>
              <td><button onClick={() => setEdit({...c, _autocodigo:false})} className="text-indigo-600 text-xs">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal title={edit.id_catalogo ? 'Editar catálogo' : 'Nuevo catálogo'} onCancel={() => setEdit(null)} onGuardar={() => guardar(edit)}>
          <F label="Nombre"><input value={edit.nombre} onChange={(e)=>{const n=e.target.value;setEdit(p=>({...p,nombre:n,codigo:p._autocodigo?genCodigo(n):p.codigo}));}} className="inp" /></F>
          <F label="Código"><input value={edit.codigo} onChange={(e)=>setEdit(p=>({...p,codigo:e.target.value,_autocodigo:false}))} className="inp font-mono text-xs" placeholder="auto" /></F>
          <F label="Items (JSON array)" full>
            <textarea value={JSON.stringify(edit.items||[],null,2)}
                      onChange={(e)=>{ try{setEdit(p=>({...p,items:JSON.parse(e.target.value)}))}catch{} }}
                      className="inp h-32 font-mono text-xs" />
          </F>
          <F label="Activo"><input type="checkbox" checked={edit.activo!==false} onChange={(e)=>setEdit(p=>({...p,activo:e.target.checked}))} /></F>
        </Modal>
      )}
    </div>
  );
}
