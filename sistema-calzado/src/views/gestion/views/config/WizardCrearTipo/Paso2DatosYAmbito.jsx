import { useEffect, useState } from 'react';
import { supabase } from '../../../../../api/supabase';
import { listRoles } from '../../../api/catalogoClient';
import { generarCodigo } from './helpers';

export default function Paso2DatosYAmbito({ datos, actualizar, onAtras, onSiguiente }) {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    supabase
      .from('ubicaciones')
      .select('id_ubicacion, nombre, rol')
      .order('nombre')
      .then((r) => setUbicaciones(r.data || []));
    listRoles()
      .then((r) => setRoles((r || []).filter((x) => x.activo !== false)))
      .catch(() => setRoles([]));
  }, []);

  const onNombre = (v) => {
    actualizar({ nombre: v, codigo: generarCodigo(v) });
  };

  const valido =
    datos.nombre?.trim() &&
    datos.ambito &&
    (datos.ambito !== 'especificas' || (datos.ubicaciones_especificas || []).length > 0);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-stone-600">Nombre del tipo *</label>
        <input
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          value={datos.nombre || ''}
          onChange={(e) => onNombre(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-stone-600">Emoji (opcional)</label>
          <input
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            value={datos.emoji || ''}
            maxLength={4}
            onChange={(e) => actualizar({ emoji: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600">Código (auto)</label>
          <input
            className="mt-1 w-full rounded border border-stone-200 bg-stone-100 px-2 py-1.5 font-mono text-sm"
            value={datos.codigo || ''}
            readOnly
          />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase text-stone-500">¿Dónde aplica este tipo?</p>
      <div className="space-y-1.5 text-sm">
        {[
          ['cualquier', 'Cualquier ubicación'],
          ['tiendas', 'Solo en tiendas (venta al público)'],
          ['talleres', 'Solo fábrica / taller'],
          ['especificas', 'Solo en ubicaciones concretas'],
        ].map(([val, label]) => (
          <label key={val} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="ambito"
              checked={datos.ambito === val}
              onChange={() => actualizar({ ambito: val })}
            />
            {label}
          </label>
        ))}
      </div>

      {datos.ambito === 'especificas' && (
        <div>
          <label className="block text-xs font-medium text-stone-600">Ubicaciones (Ctrl/Cmd + clic)</label>
          <select
            multiple
            className="mt-1 w-full min-h-[120px] rounded border border-stone-300 px-2 py-1.5 text-sm"
            value={(datos.ubicaciones_especificas || []).map(String)}
            onChange={(e) => {
              const v = [...e.target.selectedOptions].map((o) => Number(o.value));
              actualizar({ ubicaciones_especificas: v });
            }}
          >
            {ubicaciones.map((u) => (
              <option key={u.id_ubicacion} value={u.id_ubicacion}>
                {u.nombre} ({u.rol})
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs font-semibold uppercase text-stone-500">¿Quién puede registrarlo? (opcional)</p>
      <div className="max-h-32 space-y-1 overflow-y-auto text-sm">
        {roles.length === 0 && <p className="text-xs text-stone-500">— sin catálogo de roles —</p>}
        {roles.map((r) => (
          <label key={r.id_rol} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={(datos.roles_permitidos || []).includes(r.codigo)}
              onChange={() => {
                const set = new Set(datos.roles_permitidos || []);
                if (set.has(r.codigo)) set.delete(r.codigo);
                else set.add(r.codigo);
                actualizar({ roles_permitidos: [...set] });
              }}
            />
            {r.nombre} <span className="text-stone-400">({r.codigo})</span>
          </label>
        ))}
      </div>

      <div className="flex justify-between gap-2 border-t border-stone-200 pt-3">
        <button type="button" className="rounded-md border border-stone-300 px-3 py-1.5 text-sm" onClick={onAtras}>
          ← Atrás
        </button>
        <button
          type="button"
          disabled={!valido}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={onSiguiente}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
