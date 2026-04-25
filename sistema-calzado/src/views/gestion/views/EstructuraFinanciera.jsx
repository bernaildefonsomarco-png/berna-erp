// src/views/gestion/views/EstructuraFinanciera.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../api/supabase';

export default function EstructuraFinanciera() {
  const [plantillas, setPlantillas] = useState([]);
  const [filtro, setFiltro] = useState({ rol:'', estado:'activa' });

  useEffect(() => {
    (async () => {
      let q = supabase
        .from('plantillas_recurrentes')
        .select(`*,
                 tipo:tipos_movimiento_caja(nombre,direccion,naturaleza),
                 ubicacion:ubicaciones(nombre,rol)`)
        .eq('activo', true);
      if (filtro.estado) q = q.eq('estado', filtro.estado);
      const { data } = await q.order('codigo');
      setPlantillas(data || []);
    })();
  }, [filtro]);

  const visibles = filtro.rol
    ? plantillas.filter((p) => p.ubicacion?.rol === filtro.rol)
    : plantillas;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estructura Financiera</h1>
        <Link to="/gestion/catalogo?tab=plantillas" className="rounded-md bg-stone-900 px-3 py-2 text-white">
          Gestionar en Catálogo
        </Link>
      </div>
      <div className="flex gap-2 text-sm">
        <select value={filtro.rol} onChange={(e) => setFiltro({...filtro, rol: e.target.value})} className="rounded-md border px-2 py-1">
          <option value="">Todos los roles</option>
          <option value="Tienda">Tienda</option>
          <option value="Taller">Taller</option>
        </select>
        <select value={filtro.estado} onChange={(e) => setFiltro({...filtro, estado: e.target.value})} className="rounded-md border px-2 py-1">
          <option value="">Todos</option>
          <option value="activa">Activas</option>
          <option value="pausada">Pausadas</option>
          <option value="archivada">Archivadas</option>
        </select>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-left">
          <tr><th className="p-2">Código</th><th>Nombre</th><th>Tipo</th><th>Ubicación</th><th>Frecuencia</th><th>Estimado</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {visibles.map((p) => (
            <tr key={p.id_plantilla} className="border-t">
              <td className="p-2 font-mono">{p.codigo}</td>
              <td>{p.nombre}</td>
              <td>{p.tipo?.nombre}</td>
              <td>{p.ubicacion?.nombre || '—'}</td>
              <td>{p.frecuencia}</td>
              <td className="text-right">S/ {Number(p.monto_estimado || 0).toFixed(2)}</td>
              <td>{p.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-stone-500">
        Este módulo es de solo lectura. Para crear, editar o pausar plantillas, abre la gestión en Catálogo.
      </p>
    </div>
  );
}
