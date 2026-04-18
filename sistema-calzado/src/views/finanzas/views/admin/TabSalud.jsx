import { useEffect, useState } from 'react';
import { fetchSalud } from '../../api/catalogoClient';

export default function TabSalud() {
  const [salud, setSalud] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  async function load() {
    setCargando(true);
    try { setSalud(await fetchSalud()); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }
  useEffect(() => { load(); }, []);

  if (cargando) return <div className="py-8 text-center text-stone-500">Cargando…</div>;
  if (error) return <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>;
  if (!salud) return null;

  const items = [
    { label:'Movimientos sin tipo', val: salud.movimientos_sin_tipo },
    { label:'Sin cuenta contable', val: salud.movimientos_sin_cuenta_contable },
    { label:'Plantillas pendientes (mes)', val: salud.plantillas_mensuales_pendientes },
    { label:'Splits desbalanceados', val: salud.splits_desbalanceados },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={load} className="text-sm text-indigo-600">↻ Actualizar</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-lg p-4 ${item.val===0?'bg-emerald-50':'bg-amber-50'}`}>
            <div className={`text-3xl font-bold ${item.val===0?'text-emerald-700':'text-amber-700'}`}>{item.val}</div>
            <div className="mt-1 text-sm text-stone-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
