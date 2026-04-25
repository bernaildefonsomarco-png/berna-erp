import { useEffect, useState } from 'react';
import { fnSugerirCuentaParaTipo, fetchCuentaById } from '../tiposMovimientoClient';
import { rolParaSugerencia } from './helpers';
import ArbolPlanCuentas from './ArbolPlanCuentas';

export default function Paso3MapeoContable({ datos, actualizar, onAtras, onCrear, creando }) {
  const [sugerencia, setSugerencia] = useState(null);
  const [modo, setModo] = useState('sugerencia');
  const [cargando, setCargando] = useState(true);
  const [errorSug, setErrorSug] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      setCargando(true);
      setErrorSug('');
      try {
        const rol = rolParaSugerencia(datos.ambito);
        const id = await fnSugerirCuentaParaTipo(datos.categoria_macro, rol);
        if (!live) return;
        if (id) {
          const c = await fetchCuentaById(id);
          if (live) {
            setSugerencia(c);
            actualizar({ id_cuenta_contable: id });
            setModo('sugerencia');
          }
        } else {
          setModo('manual');
        }
      } catch (e) {
        if (live) {
          setErrorSug(e?.message || 'No se pudo sugerir cuenta');
          setModo('manual');
        }
      } finally {
        if (live) setCargando(false);
      }
    })();
    return () => { live = false; };
  }, [datos.categoria_macro, datos.ambito]);

  const aceptarSugerencia = () => {
    if (sugerencia) actualizar({ id_cuenta_contable: sugerencia.id_cuenta_contable });
  };

  return (
    <div className="space-y-4">
      {cargando && <p className="text-sm text-stone-500">Cargando sugerencia contable…</p>}
      {errorSug && <p className="text-sm text-amber-800">{errorSug}</p>}

      {modo === 'sugerencia' && sugerencia && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-emerald-800">Sugerencia automática</p>
          <p className="mt-1 font-mono text-stone-800">
            {sugerencia.codigo} — {sugerencia.nombre}
          </p>
          <p className="text-xs text-stone-600">Sección P&amp;L: {sugerencia.seccion_pl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-emerald-700 px-2 py-1 text-xs text-white"
              onClick={() => { aceptarSugerencia(); }}
            >
              Aceptar sugerencia
            </button>
            <button
              type="button"
              className="rounded border border-stone-300 px-2 py-1 text-xs"
              onClick={() => { setModo('manual'); }}
            >
              Ajustar manualmente
            </button>
          </div>
        </div>
      )}

      {modo === 'manual' && (
        <div>
          <p className="mb-1 text-sm text-stone-600">Elige una cuenta hoja (permite movimientos):</p>
          <ArbolPlanCuentas
            selectedId={datos.id_cuenta_contable}
            onSelect={(id) => actualizar({ id_cuenta_contable: id })}
          />
        </div>
      )}

      <div className="rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
        <p className="font-medium">Vista previa</p>
        <p>
          {datos.emoji} {datos.nombre} — {datos.codigo}
        </p>
        <p>Cuenta: {sugerencia ? `${sugerencia.codigo}` : '—'}</p>
      </div>

      <div className="flex justify-between gap-2 border-t border-stone-200 pt-3">
        <button type="button" className="rounded-md border border-stone-300 px-3 py-1.5 text-sm" onClick={onAtras} disabled={creando}>
          ← Atrás
        </button>
        <button
          type="button"
          disabled={!datos.id_cuenta_contable || creando}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={onCrear}
        >
          {creando ? 'Creando…' : 'Crear tipo'}
        </button>
      </div>
    </div>
  );
}
