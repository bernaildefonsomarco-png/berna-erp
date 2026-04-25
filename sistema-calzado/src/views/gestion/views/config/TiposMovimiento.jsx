import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/UI';
import { listTiposMovimiento, listMapeosResumen } from './tiposMovimientoClient';
import WizardCrearTipo from './WizardCrearTipo/WizardCrearTipo';
import EditarTipoModal from './EditarTipoModal';

export default function TiposMovimiento() {
  const [tipos, setTipos] = useState([]);
  const [mapeos, setMapeos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editarId, setEditarId] = useState(null);
  const [err, setErr] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [t, m] = await Promise.all([listTiposMovimiento(), listMapeosResumen()]);
      setTipos(t);
      setMapeos(m);
    } catch (e) {
      setErr(e?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Tipos de movimiento</h1>
          <p className="text-sm text-stone-600">
            Crear y revisar tipos; el mapeo contable se define al crear cada tipo.{' '}
            <Link to="/gestion/catalogo" className="text-indigo-600 underline">
              Otros catálogos
            </Link>
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setWizardOpen(true)}
        >
          + Nuevo tipo
        </button>
      </div>

      {err && <p className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{err}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
                <tr>
                  <th className="p-2">Emoji</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Código</th>
                  <th className="p-2">Categoría</th>
                  <th className="p-2">Dirección</th>
                  <th className="p-2">Activo</th>
                  <th className="p-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id_tipo} className="border-t border-stone-100 hover:bg-stone-50/80">
                    <td className="p-2">{t.emoji || '—'}</td>
                    <td className="p-2 font-medium text-stone-900">{t.nombre}</td>
                    <td className="p-2 font-mono text-xs">{t.codigo}</td>
                    <td className="p-2 text-stone-600">{t.categoria}</td>
                    <td className="p-2 text-xs text-stone-500">{t.direccion || '—'}</td>
                    <td className="p-2">{t.activo ? 'Sí' : 'No'}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-indigo-600 hover:underline"
                        onClick={() => setEditarId(t.id_tipo)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tipos.length === 0 && <p className="p-4 text-sm text-stone-500">No hay tipos todavía.</p>}
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium text-stone-900">Mapeos tipo → cuenta (resumen)</h2>
            <p className="mb-2 text-xs text-stone-500">
              Los mapeos nuevos se generan al crear un tipo. Para ajustar avanzado, use el catálogo o la base.
            </p>
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
                  <tr>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Rol</th>
                    <th className="p-2">Cuenta</th>
                    <th className="p-2">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {mapeos.map((m) => (
                    <tr key={m.id_mapeo} className="border-t border-stone-100">
                      <td className="p-2 text-xs">
                        {m.tipo?.nombre} <span className="text-stone-400">({m.tipo?.codigo})</span>
                      </td>
                      <td className="p-2 font-mono text-xs">{m.ubicacion_rol}</td>
                      <td className="p-2 text-xs">
                        {m.cuenta?.codigo} {m.cuenta?.nombre}
                      </td>
                      <td className="p-2">{m.activo ? 'Sí' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapeos.length === 0 && <p className="p-4 text-sm text-stone-500">Sin filas de mapeo.</p>}
            </div>
          </div>
        </>
      )}

      {wizardOpen && (
        <WizardCrearTipo
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            cargar();
          }}
        />
      )}

      {editarId != null && (
        <EditarTipoModal
          key={editarId}
          idTipo={editarId}
          onClose={() => setEditarId(null)}
          onGuardado={cargar}
        />
      )}
    </div>
  );
}
