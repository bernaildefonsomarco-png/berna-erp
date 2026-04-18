// src/components/QuickEntry/QuickEntry.jsx
import { useEffect, useMemo, useState } from 'react';
import TipoSelector from './TipoSelector';
import CamposDinamicos from './CamposDinamicos';
import SplitsEditor from './SplitsEditor';
import ResumenConfirmacion from './ResumenConfirmacion';
import {
  fetchTiposPorScope,
  fetchUbicaciones,
  fetchMapeos,
  fetchCuentasFinancieras,
  fetchPersonas,
  registrarHechoEconomico,
} from './api';
import { resolverCuentaContable } from '../../lib/resolvers/cuentaContable';
import { resolverCuentaFinanciera } from '../../lib/resolvers/cuentaFinanciera';
import { resolverCamposRequeridos } from '../../lib/resolvers/camposRequeridos';

export default function QuickEntry({
  scope = 'manual',
  contexto = {},
  tiposPermitidos = null,
  filtroDireccion = null,
  onSubmit,
  onClose,
}) {
  const [paso, setPaso] = useState('tipo'); // 'tipo' | 'campos' | 'resumen'
  const [tipos, setTipos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [mapeos, setMapeos] = useState([]);
  const [cuentasFinancieras, setCuentasFinancieras] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [valores, setValores] = useState({});
  const [splits, setSplits] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u, m, c, p] = await Promise.all([
          fetchTiposPorScope(scope),
          fetchUbicaciones(),
          fetchMapeos(),
          fetchCuentasFinancieras(),
          fetchPersonas(),
        ]);
        let lista = tiposPermitidos ? t.filter((x) => tiposPermitidos.includes(x.id_tipo)) : t;
        if (filtroDireccion) lista = lista.filter((x) => x.direccion === filtroDireccion);
        setTipos(lista);
        setUbicaciones(u);
        setMapeos(m);
        setCuentasFinancieras(c);
        setPersonas(p);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [scope, tiposPermitidos, filtroDireccion]);

  const campos = useMemo(
    () => (tipoSeleccionado ? resolverCamposRequeridos(tipoSeleccionado) : []),
    [tipoSeleccionado]
  );

  const idCuentaContable = useMemo(() => {
    if (!tipoSeleccionado) return null;
    const ubic = ubicaciones.find((u) => u.id_ubicacion === valores.id_ubicacion);
    return resolverCuentaContable({
      tipo: tipoSeleccionado,
      ubicacion: ubic,
      plantilla: null,
      mapeos,
    });
  }, [tipoSeleccionado, ubicaciones, valores.id_ubicacion, mapeos]);

  const idCuentaFinanciera = useMemo(() => {
    if (!tipoSeleccionado) return null;
    return resolverCuentaFinanciera({
      tipo: tipoSeleccionado,
      plantilla: null,
      cajaOrigenSugerida: contexto.cajaOrigenSugerida,
      cuentasFinancieras,
    });
  }, [tipoSeleccionado, contexto.cajaOrigenSugerida, cuentasFinancieras]);

  function seleccionarTipo(t) {
    setTipoSeleccionado(t);
    const pre = {
      id_ubicacion: contexto.idUbicacion ?? null,
      id_persona: contexto.idPersona ?? null,
      concepto: '',
    };
    setValores(pre);
    setSplits([]);
    setPaso('campos');
  }

  function actualizarValor(k, v) {
    setValores((prev) => ({ ...prev, [k]: v }));
  }

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const id = await registrarHechoEconomico({
        p_id_tipo: tipoSeleccionado.id_tipo,
        p_monto: Number(valores.monto),
        p_id_ubicacion: valores.id_ubicacion ?? null,
        p_id_cuenta_financiera: idCuentaFinanciera ?? null,
        p_splits: splits.length > 0 ? splits : null,
        p_id_caja: contexto.idCaja ?? null,
        p_id_venta: contexto.idVenta ?? null,
        p_id_lote_produccion: contexto.idLoteProduccion ?? null,
        p_concepto: valores.concepto || null,
        p_datos_extra: valores.datos_extra || {},
      });
      onSubmit?.({ id_movimiento: id });
      onClose?.();
    } catch (e) {
      setError(e.message || 'Error al registrar');
    } finally {
      setEnviando(false);
    }
  }

  const permiteSplits = tipoSeleccionado?.comportamientos?.includes('permite_splits');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {paso === 'tipo' && 'Registrar movimiento'}
            {paso === 'campos' && tipoSeleccionado?.nombre}
            {paso === 'resumen' && 'Confirmar'}
          </h2>
          <button onClick={onClose} className="text-stone-500 text-2xl leading-none">×</button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {paso === 'tipo' && <TipoSelector tipos={tipos} onSelect={seleccionarTipo} />}

        {paso === 'campos' && tipoSeleccionado && (
          <div className="space-y-4">
            <CamposDinamicos
              campos={campos}
              valores={valores}
              onChange={actualizarValor}
              ubicaciones={ubicaciones}
              personas={personas}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Concepto</span>
              <input
                type="text"
                value={valores.concepto || ''}
                onChange={(e) => actualizarValor('concepto', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
            {permiteSplits && (
              <SplitsEditor
                splits={splits}
                montoTotal={valores.monto}
                cuentasFinancieras={cuentasFinancieras}
                onChange={setSplits}
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPaso('tipo')} className="rounded-md border px-3 py-2">
                Atrás
              </button>
              <button
                onClick={() => setPaso('resumen')}
                disabled={!valores.monto}
                className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {paso === 'resumen' && tipoSeleccionado && (
          <ResumenConfirmacion
            tipo={tipoSeleccionado}
            valores={valores}
            idCuentaContable={idCuentaContable}
            idCuentaFinanciera={idCuentaFinanciera}
            splits={splits}
            ubicaciones={ubicaciones}
            cuentasFinancieras={cuentasFinancieras}
            onConfirmar={confirmar}
            onAtras={() => setPaso('campos')}
            enviando={enviando}
          />
        )}
      </div>
    </div>
  );
}
