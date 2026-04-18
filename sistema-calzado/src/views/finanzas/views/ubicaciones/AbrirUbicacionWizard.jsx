// src/views/finanzas/views/ubicaciones/AbrirUbicacionWizard.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../../api/supabase';

function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function AbrirUbicacionWizard({ onClose }) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({ nombre:'', rol:'Tienda', direccion:'', pin: generarPin() });
  const [cajaNombre, setCajaNombre] = useState('');
  const [plantillasOrigen, setPlantillasOrigen] = useState([]);
  const [ubicacionesExistentes, setUbicacionesExistentes] = useState([]);
  const [idOrigenClonar, setIdOrigenClonar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ubicaciones')
        .select('id_ubicacion,nombre,rol,activa')
        .eq('activa', true);
      setUbicacionesExistentes(data || []);
    })();
  }, []);

  useEffect(() => {
    if (!idOrigenClonar) return setPlantillasOrigen([]);
    (async () => {
      const { data } = await supabase
        .from('plantillas_recurrentes')
        .select('*')
        .eq('id_ubicacion', idOrigenClonar)
        .eq('activo', true)
        .eq('estado', 'activa');
      setPlantillasOrigen(data || []);
    })();
  }, [idOrigenClonar]);

  useEffect(() => {
    setCajaNombre(form.nombre ? `Caja ${form.nombre}` : '');
  }, [form.nombre]);

  async function finalizar() {
    setEnviando(true);
    setError(null);
    try {
      // 1. Crear ubicación
      const { data: u, error: eU } = await supabase
        .from('ubicaciones')
        .insert({ nombre: form.nombre, rol: form.rol, direccion: form.direccion, pin: form.pin, activa: true })
        .select().single();
      if (eU) throw eU;

      // 2. Crear caja financiera (PK returned is id_cuenta)
      const { data: c, error: eC } = await supabase
        .from('cuentas_financieras')
        .insert({ nombre: cajaNombre || `Caja ${form.nombre}`, tipo: 'efectivo_caja', saldo_inicial: 0, activa: true, id_ubicacion: u.id_ubicacion })
        .select('id_cuenta').single();
      if (eC) throw eC;

      // 3. Clonar plantillas seleccionadas
      if (plantillasOrigen.length > 0) {
        const clones = plantillasOrigen.map((p) => ({
          codigo: `${p.codigo}_${u.id_ubicacion}`,
          nombre: `${p.nombre} — ${form.nombre}`,
          id_tipo: p.id_tipo,
          id_ubicacion: u.id_ubicacion,
          id_cuenta_contable: p.id_cuenta_contable,
          id_cuenta_financiera_default: c.id_cuenta,
          direccion: p.direccion,
          monto_estimado: p.monto_estimado,
          frecuencia: p.frecuencia,
          dia_referencia: p.dia_referencia,
          comportamientos: p.comportamientos,
          estado: 'activa',
          activo: true,
          datos_extra: p.datos_extra,
        }));
        const { error: eP } = await supabase.from('plantillas_recurrentes').insert(clones);
        if (eP) throw eP;
      }

      navigate(`/finanzas/ubicaciones/${u.id_ubicacion}`);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="mb-3 text-xl font-semibold">Abrir nueva ubicación · paso {paso}/3</h2>
        {error && <div className="mb-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {paso === 1 && (
          <div className="space-y-3">
            <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} className="w-full rounded-md border px-3 py-2" />
            <select value={form.rol} onChange={(e) => setForm({...form, rol: e.target.value})} className="w-full rounded-md border px-3 py-2">
              <option value="Tienda">Tienda</option><option value="Taller">Taller</option>
            </select>
            <input placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({...form, direccion: e.target.value})} className="w-full rounded-md border px-3 py-2" />
            <div className="flex items-center gap-2">
              <input value={form.pin} onChange={(e) => setForm({...form, pin: e.target.value})} className="flex-1 rounded-md border px-3 py-2 font-mono" />
              <button onClick={() => setForm({...form, pin: generarPin()})} className="rounded-md border px-2 py-1 text-xs">Regenerar PIN</button>
            </div>
            <button onClick={() => setPaso(2)} disabled={!form.nombre || !form.pin} className="w-full rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50">Siguiente</button>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">Se creará una caja de efectivo vinculada a esta ubicación.</p>
            <input placeholder="Nombre de la caja" value={cajaNombre} onChange={(e) => setCajaNombre(e.target.value)} className="w-full rounded-md border px-3 py-2" />
            <div className="flex justify-between">
              <button onClick={() => setPaso(1)} className="rounded-md border px-3 py-2">Atrás</button>
              <button onClick={() => setPaso(3)} className="rounded-md bg-stone-900 px-4 py-2 text-white">Siguiente</button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Clonar plantillas desde (opcional)</span>
              <select value={idOrigenClonar || ''} onChange={(e) => setIdOrigenClonar(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-md border px-3 py-2">
                <option value="">— Ninguna —</option>
                {ubicacionesExistentes.filter((ub) => ub.rol === form.rol).map((ub) => (
                  <option key={ub.id_ubicacion} value={ub.id_ubicacion}>{ub.nombre}</option>
                ))}
              </select>
            </label>
            {plantillasOrigen.length > 0 && (
              <div className="rounded-md border p-2 text-sm">
                Se clonarán {plantillasOrigen.length} plantillas:
                <ul className="ml-5 list-disc">
                  {plantillasOrigen.map((p) => <li key={p.id_plantilla}>{p.nombre}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setPaso(2)} className="rounded-md border px-3 py-2">Atrás</button>
              <button onClick={finalizar} disabled={enviando} className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50">
                {enviando ? 'Creando…' : 'Finalizar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
