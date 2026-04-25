import { useEffect, useState } from 'react';
import { listPeriodos, cambiarEstadoPeriodo } from '../../api/catalogoClient';

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function TabPeriodos() {
  const [periodos, setPeriodos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  async function load() { setPeriodos(await listPeriodos()); }
  useEffect(() => { load(); }, []);

  async function toggleEstado(p) {
    const nuevoEstado = p.estado === 'cerrado' ? 'abierto' : 'cerrado';
    let motivo = null;
    if (nuevoEstado === 'abierto') {
      motivo = window.prompt('Motivo de reapertura:');
      if (!motivo) return;
    }
    setCargando(true); setError(null);
    try { await cambiarEstadoPeriodo(p.id_periodo, nuevoEstado, { motivo_reapertura: motivo }); load(); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-xs uppercase text-stone-500">
          <tr><th className="p-2">Período</th><th>Estado</th><th>Cerrado en</th><th></th></tr>
        </thead>
        <tbody>
          {periodos.map((p) => (
            <tr key={p.id_periodo} className={`border-t ${p.estado==='cerrado'?'bg-stone-50':''}`}>
              <td className="p-2 font-medium">{MESES[p.month]} {p.year}</td>
              <td>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${p.estado==='cerrado'?'bg-rose-100 text-rose-700':'bg-emerald-100 text-emerald-700'}`}>
                  {p.estado}
                </span>
              </td>
              <td className="text-xs text-stone-500">{p.cerrado_en ? new Date(p.cerrado_en).toLocaleDateString('es-PE') : '—'}</td>
              <td>
                <button onClick={() => toggleEstado(p)} disabled={cargando}
                        className={`text-sm ${p.estado==='cerrado'?'text-amber-600':'text-rose-600'}`}>
                  {p.estado==='cerrado' ? 'Reabrir' : 'Cerrar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
