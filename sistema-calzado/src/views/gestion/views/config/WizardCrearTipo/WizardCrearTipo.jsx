import { useState, useCallback } from 'react';
import Paso1CategoriaMacro from './Paso1CategoriaMacro';
import Paso2DatosYAmbito from './Paso2DatosYAmbito';
import Paso3MapeoContable from './Paso3MapeoContable';
import { emojiParaCategoria, labelCategoria, generarCodigo } from './helpers';
import { crearTipoMovimientoWizard } from '../tiposMovimientoClient';

const initial = () => ({
  categoria_macro: null,
  nombre: '',
  emoji: '',
  codigo: '',
  ambito: 'cualquier',
  ubicaciones_especificas: [],
  roles_permitidos: [],
  id_cuenta_contable: null,
});

export default function WizardCrearTipo({ onClose, onCreated }) {
  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState(initial);
  const [creando, setCreando] = useState(false);
  const [err, setErr] = useState('');

  const actualizar = useCallback((patch) => {
    setDatos((d) => ({ ...d, ...patch }));
  }, []);

  const onCrear = async () => {
    setErr('');
    setCreando(true);
    try {
      const row = { ...datos };
      if (!row.codigo) row.codigo = generarCodigo(row.nombre);
      await crearTipoMovimientoWizard(row);
      onCreated?.();
    } catch (e) {
      setErr(e?.message || 'Error al crear');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Nuevo tipo de movimiento</h2>
            <p className="text-xs text-stone-500">Paso {paso} de 3</p>
            {datos.categoria_macro && (
              <p className="mt-1 text-sm text-stone-600">
                {emojiParaCategoria(datos.categoria_macro)} {labelCategoria(datos.categoria_macro)}
              </p>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {err && <p className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{err}</p>}

        {paso === 1 && (
          <Paso1CategoriaMacro
            onSeleccionar={(code) => {
              actualizar({ categoria_macro: code });
              setPaso(2);
            }}
          />
        )}

        {paso === 2 && (
          <Paso2DatosYAmbito
            datos={datos}
            actualizar={actualizar}
            onAtras={() => setPaso(1)}
            onSiguiente={() => setPaso(3)}
          />
        )}

        {paso === 3 && (
          <Paso3MapeoContable
            datos={datos}
            actualizar={actualizar}
            onAtras={() => setPaso(2)}
            onCrear={onCrear}
            creando={creando}
          />
        )}
      </div>
    </div>
  );
}
