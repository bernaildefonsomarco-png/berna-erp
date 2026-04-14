import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listarMovimientos, obtenerMovimiento, crearMovimientoManual,
  actualizarMovimiento, eliminarMovimiento, listarSplitsDeMovimiento,
  listarCuentas, listarPlanCuentas, listarTiposMovimiento,
  crearTipoMovimiento, actualizarTipoMovimiento, archivarTipoMovimiento,
  listarVistasGuardadas, guardarVista, eliminarVista,
  listarPersonasConAccesoFinanzas,
  listarUbicacionesTiendas,
} from '../api/finanzasClient';
import { formatMoney, formatDate } from '../lib/calculos';
import { puedeRegistrar, puedeEditar, esAdmin, RECURSOS } from '../lib/permisos';
import {
  Card, Badge, Button, Modal, Field, Input, Select,
  MoneyInput, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   MOVIMIENTOS — Bloque 3.5
   ──────────────────────────────────────────────────────────────────────────
   Vista densa estilo Airtable: tabla con filtros, búsqueda, vistas guardadas,
   creación manual de movimientos (con splits multi-cuenta y cuenta contable
   obligatoria), edición inline donde es seguro, eliminar.

   Sub-tab para CRUD de tipos de movimiento.

   Estructura:
     export default Movimientos
     ├── BarraVistas             (chips de vistas guardadas + nueva vista)
     ├── BarraFiltros
     ├── TablaMovimientos
     │   └── FilaMovimiento (con expansión de splits)
     ├── ModalCrearMovimiento
     ├── ModalDetalleMovimiento
     └── PestanaTipos             (CRUD tipos_movimiento_caja)
   ────────────────────────────────────────────────────────────────────────── */


const COLUMNAS_DISPONIBLES = [
  { key: 'fecha',    label: 'Fecha',     ancho: 90 },
  { key: 'tipo',     label: 'Tipo',      ancho: 60 },
  { key: 'concepto', label: 'Concepto',  ancho: 'auto' },
  { key: 'cuenta',   label: 'Cuenta',    ancho: 140 },
  { key: 'cuenta_contable', label: 'Cuenta contable', ancho: 160 },
  { key: 'categoria', label: 'Categoría', ancho: 110 },
  { key: 'persona',  label: 'Persona',   ancho: 100 },
  { key: 'monto',    label: 'Monto',     ancho: 110, alineacion: 'right' },
];

const COLUMNAS_DEFAULT = ['fecha', 'tipo', 'concepto', 'cuenta', 'cuenta_contable', 'monto'];

const VISTA_DEFAULT = {
  columnas: COLUMNAS_DEFAULT,
  filtros: { tipo: '', idCuenta: '', idCuentaContable: '', desde: '', hasta: '', busqueda: '' },
};


/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function Movimientos({ usuario }) {
  const [tab, setTab] = useState('movimientos'); // 'movimientos' | 'tipos'
  const [movimientos, setMovimientos] = useState([]);
  const [count, setCount] = useState(0);
  const [cuentas, setCuentas] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [vistas, setVistas] = useState([]);
  const [vistaActiva, setVistaActiva] = useState(null); // null = vista temporal
  const [config, setConfig] = useState(VISTA_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modales
  const [modalCrear, setModalCrear] = useState(false);
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);
  const [modalGuardarVista, setModalGuardarVista] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(null);

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);

  /* ── Cargar datos auxiliares (1 vez) ── */
  useEffect(() => {
    (async () => {
      try {
        const [cs, pc, tps, ps, vs, ub] = await Promise.all([
          listarCuentas(),
          listarPlanCuentas(),
          listarTiposMovimiento({ soloActivos: true }),
          listarPersonasConAccesoFinanzas(),
          listarVistasGuardadas('movimientos', usuario?.id_persona).catch(() => []),
          listarUbicacionesTiendas().catch(() => []),
        ]);
        setCuentas(cs);
        setPlanCuentas(pc);
        setTipos(tps);
        setPersonas(ps);
        setVistas(vs);
        setUbicaciones(ub);

        // Si hay vista default del usuario, cargarla
        const def = vs.find(v => v.es_default);
        if (def) {
          setVistaActiva(def);
          setConfig(def.configuracion || VISTA_DEFAULT);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [usuario?.id_persona]);

  /* ── Cargar movimientos cuando cambian los filtros ── */
  const cargarMovimientos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const f = config.filtros;
      const filtros = {
        tipo: f.tipo || undefined,
        idCuenta: f.idCuenta ? Number(f.idCuenta) : undefined,
        desde: f.desde ? new Date(f.desde).toISOString() : undefined,
        hasta: f.hasta ? new Date(f.hasta + 'T23:59:59').toISOString() : undefined,
        busqueda: f.busqueda?.trim() || undefined,
        limit: 200,
      };
      const { data, count: c } = await listarMovimientos(filtros);

      // Filtro por cuenta contable se hace client-side (PostgREST no la indexa con joins fáciles)
      let dataFiltrada = data;
      if (f.idCuentaContable) {
        const id = Number(f.idCuentaContable);
        dataFiltrada = data.filter(m => m.id_cuenta_contable === id);
      }

      setMovimientos(dataFiltrada);
      setCount(c);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  }, [config.filtros]);

  useEffect(() => { cargarMovimientos(); }, [cargarMovimientos]);

  /* ── Helpers ── */

  const tieneFiltrosActivos = useMemo(() => {
    const f = config.filtros;
    return !!(f.tipo || f.idCuenta || f.idCuentaContable || f.desde || f.hasta || f.busqueda);
  }, [config.filtros]);

  const setFiltro = (k, v) => setConfig(prev => ({
    ...prev,
    filtros: { ...prev.filtros, [k]: v },
  }));

  const limpiarFiltros = () => setConfig(prev => ({ ...prev, filtros: VISTA_DEFAULT.filtros }));

  const cargarVista = (vista) => {
    setVistaActiva(vista);
    setConfig(vista.configuracion || VISTA_DEFAULT);
  };

  const usarVistaTemp = () => {
    setVistaActiva(null);
    setConfig(VISTA_DEFAULT);
  };

  /* ── Total visible (suma de monto considerando ingreso/egreso) ── */
  const totales = useMemo(() => {
    let ingresos = 0, egresos = 0;
    movimientos.forEach(m => {
      const monto = Number(m.monto) || 0;
      if (m.tipo === 'ingreso') ingresos += monto;
      else egresos += monto;
    });
    return { ingresos, egresos, neto: ingresos - egresos };
  }, [movimientos]);

  /* ── Handlers ── */

  const handleCrearMov = async (payload) => {
    try {
      await crearMovimientoManual(payload);
      setModalCrear(false);
      await cargarMovimientos();
    } catch (e) {
      console.error(e);
      alert('Error al crear movimiento: ' + (e.message || ''));
      throw e;
    }
  };

  const handleEliminarMov = async (id) => {
    try {
      await eliminarMovimiento(id);
      setConfirmEliminar(null);
      setMovimientoDetalle(null);
      await cargarMovimientos();
    } catch (e) {
      console.error(e);
      alert('Error al eliminar: ' + (e.message || ''));
    }
  };

  const handleActualizarMov = async (id, cambios) => {
    try {
      await actualizarMovimiento(id, cambios);
      await cargarMovimientos();
      if (movimientoDetalle?.id_movimiento === id) {
        const fresco = await obtenerMovimiento(id);
        setMovimientoDetalle(fresco);
      }
    } catch (e) {
      console.error(e);
      alert('Error al actualizar: ' + (e.message || ''));
      throw e;
    }
  };

  const handleGuardarVistaNueva = async (nombre) => {
    try {
      const v = await guardarVista({
        idPersona: usuario?.id_persona,
        modulo: 'movimientos',
        nombre,
        configuracion: config,
      });
      const todasVistas = await listarVistasGuardadas('movimientos', usuario?.id_persona);
      setVistas(todasVistas);
      setVistaActiva(v);
      setModalGuardarVista(false);
    } catch (e) {
      console.error(e);
      alert('Error al guardar vista: ' + (e.message || ''));
    }
  };

  const handleEliminarVista = async (idVista) => {
    if (!window.confirm('¿Eliminar esta vista guardada?')) return;
    try {
      await eliminarVista(idVista);
      const todasVistas = await listarVistasGuardadas('movimientos', usuario?.id_persona);
      setVistas(todasVistas);
      if (vistaActiva?.id_vista === idVista) usarVistaTemp();
    } catch (e) {
      console.error(e);
      alert('Error al eliminar vista: ' + (e.message || ''));
    }
  };

  /* ── Render ── */

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Todos los ingresos, egresos y transferencias del negocio."
        actions={
          <div className="flex items-center gap-2">
            {puedeCrear && tab === 'movimientos' && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                Nuevo movimiento
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs principales */}
      <div className="flex items-center gap-1 border-b border-[#f5f5f4] mb-4">
        {[
          { k: 'movimientos', label: 'Movimientos' },
          { k: 'tipos',       label: 'Tipos de movimiento' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.k
                ? 'text-[#1c1917] border-[#1c1917]'
                : 'text-[#a8a29e] border-transparent hover:text-[#57534e]'
            }`}
            style={{ fontWeight: tab === t.k ? 500 : 400 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {tab === 'movimientos' && (
        <>
          {/* ── Vistas guardadas ── */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={usarVistaTemp}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                !vistaActiva
                  ? 'bg-[#1c1917] text-white'
                  : 'text-[#57534e] hover:bg-[#f5f5f4]'
              }`}
              style={{ fontWeight: 500 }}
            >
              Todos
            </button>
            {vistas.map(v => (
              <div key={v.id_vista} className="flex items-center gap-1">
                <button
                  onClick={() => cargarVista(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    vistaActiva?.id_vista === v.id_vista
                      ? 'bg-[#1c1917] text-white'
                      : 'text-[#57534e] hover:bg-[#f5f5f4]'
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {v.nombre}
                </button>
                {vistaActiva?.id_vista === v.id_vista && (
                  <button
                    onClick={() => handleEliminarVista(v.id_vista)}
                    className="w-6 h-6 flex items-center justify-center rounded text-[#a8a29e] hover:text-[#991b1b] hover:bg-[#fef2f2]"
                    title="Eliminar vista"
                  >
                    <Icon d={ICONS.x} size={11} />
                  </button>
                )}
              </div>
            ))}
            {tieneFiltrosActivos && (
              <button
                onClick={() => setModalGuardarVista(true)}
                className="text-xs text-[#57534e] hover:text-[#1c1917] flex items-center gap-1 px-2 py-1 rounded hover:bg-[#f5f5f4]"
                style={{ fontWeight: 500 }}
              >
                <Icon d={ICONS.plus} size={11} /> Guardar como vista
              </button>
            )}
          </div>

          {/* ── Filtros ── */}
          <Card padding="sm" className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-[140px]">
                <Select
                  value={config.filtros.tipo}
                  onChange={v => setFiltro('tipo', v)}
                  options={[
                    { value: '', label: 'Todos los tipos' },
                    { value: 'ingreso', label: 'Ingresos' },
                    { value: 'egreso', label: 'Egresos' },
                  ]}
                />
              </div>
              <div className="w-[180px]">
                <Select
                  value={config.filtros.idCuenta}
                  onChange={v => setFiltro('idCuenta', v)}
                  options={[
                    { value: '', label: 'Todas las cuentas' },
                    ...cuentas.filter(c => c.activa).map(c => ({
                      value: c.id_cuenta,
                      label: c.nombre + (c.alias ? ` (${c.alias})` : ''),
                    })),
                  ]}
                />
              </div>
              <div className="w-[200px]">
                <Select
                  value={config.filtros.idCuentaContable}
                  onChange={v => setFiltro('idCuentaContable', v)}
                  options={[
                    { value: '', label: 'Todas las cuentas contables' },
                    ...planCuentas.filter(p => p.permite_movimientos).map(p => ({
                      value: p.id_cuenta_contable,
                      label: `${p.codigo} — ${p.nombre}`,
                    })),
                  ]}
                />
              </div>
              <div className="w-[130px]">
                <Input type="date" value={config.filtros.desde} onChange={v => setFiltro('desde', v)} />
              </div>
              <div className="w-[130px]">
                <Input type="date" value={config.filtros.hasta} onChange={v => setFiltro('hasta', v)} />
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="relative">
                  <Icon d={ICONS.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
                  <input
                    value={config.filtros.busqueda}
                    onChange={e => setFiltro('busqueda', e.target.value)}
                    placeholder="Buscar concepto..."
                    style={{ fontWeight: 400 }}
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
                  />
                </div>
              </div>
              {tieneFiltrosActivos && (
                <button
                  onClick={limpiarFiltros}
                  className="text-xs text-[#57534e] hover:text-[#1c1917] px-2 py-1 rounded hover:bg-[#f5f5f4]"
                  style={{ fontWeight: 500 }}
                >
                  Limpiar
                </button>
              )}
            </div>
          </Card>

          {/* ── Resumen totales ── */}
          {!loading && movimientos.length > 0 && (
            <div className="flex items-center gap-4 mb-3 text-xs" style={{ fontWeight: 400 }}>
              <span className="text-[#57534e]">
                <span className="fin-num text-[#1c1917]" style={{ fontWeight: 600 }}>{movimientos.length}</span> de {count} movimientos
              </span>
              <span className="text-[#166534]">
                Ingresos: <span className="fin-num" style={{ fontWeight: 600 }}>{formatMoney(totales.ingresos)}</span>
              </span>
              <span className="text-[#991b1b]">
                Egresos: <span className="fin-num" style={{ fontWeight: 600 }}>{formatMoney(totales.egresos)}</span>
              </span>
              <span className={totales.neto >= 0 ? 'text-[#166534]' : 'text-[#991b1b]'}>
                Neto: <span className="fin-num" style={{ fontWeight: 600 }}>{formatMoney(totales.neto)}</span>
              </span>
            </div>
          )}

          {/* ── Tabla ── */}
          {loading ? (
            <LoadingState message="Cargando movimientos..." />
          ) : movimientos.length === 0 ? (
            <Card>
              <EmptyState
                icon={ICONS.exchange}
                title={tieneFiltrosActivos ? 'Sin coincidencias' : 'No hay movimientos'}
                description={tieneFiltrosActivos
                  ? 'Prueba con otros filtros o limpia la búsqueda.'
                  : 'Crea tu primer movimiento manual o registra ventas, pagos de deudas, etc.'}
                action={puedeCrear && !tieneFiltrosActivos && (
                  <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                    Crear movimiento
                  </Button>
                )}
              />
            </Card>
          ) : (
            <Card padding="sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#fafaf9] text-[10px] text-[#a8a29e] uppercase tracking-wider">
                    <tr>
                      {COLUMNAS_DISPONIBLES.filter(c => config.columnas.includes(c.key)).map(col => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 ${col.alineacion === 'right' ? 'text-right' : 'text-left'}`}
                          style={{ fontWeight: 500, width: col.ancho }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => (
                      <FilaMovimiento
                        key={m.id_movimiento}
                        movimiento={m}
                        columnas={config.columnas}
                        onClick={() => setMovimientoDetalle(m)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {count > 200 && (
                <p className="text-[11px] text-[#a8a29e] text-center mt-3" style={{ fontWeight: 400 }}>
                  Mostrando los primeros 200 de {count}. Usa filtros para acotar.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {tab === 'tipos' && (
        <PestanaTipos
          tipos={tipos}
          puedeModif={puedeModif}
          onRecargar={async () => {
            const t = await listarTiposMovimiento({ soloActivos: false });
            setTipos(t);
          }}
        />
      )}

      {/* ── Modal: crear movimiento ── */}
      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nuevo movimiento manual"
        size="lg"
      >
        <FormCrearMovimiento
          cuentas={cuentas}
          planCuentas={planCuentas}
          tipos={tipos}
          personas={personas}
          ubicaciones={ubicaciones}
          usuario={usuario}
          onSubmit={handleCrearMov}
          onCancel={() => setModalCrear(false)}
        />
      </Modal>

      {/* ── Modal: detalle ── */}
      {movimientoDetalle && (
        <Modal
          open={true}
          onClose={() => setMovimientoDetalle(null)}
          title="Detalle del movimiento"
          size="md"
        >
          <DetalleMovimiento
            movimiento={movimientoDetalle}
            cuentas={cuentas}
            planCuentas={planCuentas}
            puedeModif={puedeModif}
            onActualizar={(cambios) => handleActualizarMov(movimientoDetalle.id_movimiento, cambios)}
            onEliminar={() => setConfirmEliminar(movimientoDetalle)}
          />
        </Modal>
      )}

      {/* ── Modal: guardar vista ── */}
      {modalGuardarVista && (
        <ModalGuardarVista
          onConfirm={handleGuardarVistaNueva}
          onCancel={() => setModalGuardarVista(false)}
        />
      )}

      {/* ── Modal: confirmar eliminar ── */}
      {confirmEliminar && (
        <Modal
          open={true}
          onClose={() => setConfirmEliminar(null)}
          title="Eliminar movimiento"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmEliminar(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleEliminarMov(confirmEliminar.id_movimiento)}>
                Eliminar
              </Button>
            </>
          }
        >
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres eliminar este movimiento de{' '}
            <span style={{ fontWeight: 500, color: '#1c1917' }}>{formatMoney(confirmEliminar.monto)}</span>?
          </p>
          <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
            Los saldos de las cuentas afectadas se revertirán automáticamente. Esta acción no se puede deshacer.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FilaMovimiento - fila densa
   ══════════════════════════════════════════════════════════════════════════ */

function FilaMovimiento({ movimiento, columnas, onClick }) {
  const m = movimiento;

  const renderCelda = (key) => {
    switch (key) {
      case 'fecha':
        return (
          <td className="px-3 py-2 text-[#57534e] fin-num text-[11px]" style={{ fontWeight: 400 }}>
            {formatDate(m.fecha_movimiento)}
          </td>
        );
      case 'tipo':
        return (
          <td className="px-3 py-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${m.tipo === 'ingreso' ? 'bg-[#166534]' : 'bg-[#991b1b]'}`}
              title={m.tipo}
            />
          </td>
        );
      case 'concepto':
        return (
          <td className="px-3 py-2 text-[#1c1917]" style={{ fontWeight: 400 }}>
            <p className="truncate">{m.concepto}</p>
            {m.tiene_splits && (
              <span className="text-[10px] text-[#a8a29e]" style={{ fontWeight: 400 }}>· split multi-cuenta</span>
            )}
          </td>
        );
      case 'cuenta':
        return (
          <td className="px-3 py-2 text-[#57534e] text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.tiene_splits ? <span className="text-[#a8a29e]">— varias —</span> : (m.cuenta?.nombre || '—')}
          </td>
        );
      case 'cuenta_contable':
        return (
          <td className="px-3 py-2 text-[#57534e] text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.id_cuenta_contable
              ? <span className="text-[10px] font-mono bg-[#fafaf9] px-1.5 py-0.5 rounded">{m.id_cuenta_contable}</span>
              : <span className="text-[#a8a29e]">sin asignar</span>}
          </td>
        );
      case 'categoria':
        return (
          <td className="px-3 py-2 text-[#a8a29e] text-[11px]" style={{ fontWeight: 400 }}>
            {m.categoria || '—'}
          </td>
        );
      case 'persona':
        return (
          <td className="px-3 py-2 text-[#57534e] text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.persona?.nombre || '—'}
          </td>
        );
      case 'monto':
        return (
          <td
            className={`px-3 py-2 text-right fin-num ${m.tipo === 'ingreso' ? 'text-[#166534]' : 'text-[#991b1b]'}`}
            style={{ fontWeight: 500 }}
          >
            {m.tipo === 'ingreso' ? '+' : '−'}{formatMoney(m.monto)}
          </td>
        );
      default:
        return <td className="px-3 py-2">—</td>;
    }
  };

  return (
    <tr
      className="border-t border-[#f5f5f4] hover:bg-[#fafaf9] cursor-pointer transition-colors"
      onClick={onClick}
    >
      {COLUMNAS_DISPONIBLES.filter(c => columnas.includes(c.key)).map(col => (
        <React.Fragment key={col.key}>{renderCelda(col.key)}</React.Fragment>
      ))}
    </tr>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormCrearMovimiento
   ══════════════════════════════════════════════════════════════════════════ */

function FormCrearMovimiento({ cuentas, planCuentas, tipos, personas, ubicaciones = [], usuario, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    tipo: 'egreso',
    monto: 0,
    concepto: '',
    fecha: new Date().toISOString().slice(0, 16),
    id_cuenta: null,
    id_cuenta_contable: null,
    id_tipo: null,
    categoria: '',
    metodo: 'efectivo',
    id_persona: usuario?.id_persona || null,
  });
  const [modoSplit, setModoSplit] = useState(false);
  const [splits, setSplits] = useState([{ id_cuenta: null, monto: 0, id_ubicacion: null }]);
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const cuentasActivas = cuentas.filter(c => c.activa);
  const cuentasContablesImputables = planCuentas.filter(p => p.activa && p.permite_movimientos);

  const totalSplits = useMemo(
    () => splits.reduce((s, x) => s + (Number(x.monto) || 0), 0),
    [splits]
  );

  const handleSplitChange = (idx, field, value) => {
    setSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };
  const handleAddSplit = () => setSplits(prev => [...prev, { id_cuenta: null, monto: 0, id_ubicacion: null }]);
  const handleRemoveSplit = (idx) => setSplits(prev => prev.filter((_, i) => i !== idx));

  const validar = () => {
    const e = {};
    if (!form.concepto?.trim()) e.concepto = 'Requerido';
    if (!(Number(form.monto) > 0)) e.monto = 'Debe ser mayor a 0';
    if (!form.id_cuenta_contable) e.cc = 'La cuenta contable es obligatoria';
    if (!modoSplit && !form.id_cuenta) e.cuenta = 'Selecciona una cuenta';
    if (modoSplit) {
      if (splits.length === 0) e.splits = 'Agrega al menos un split';
      else if (splits.some(s => !s.id_cuenta)) e.splits = 'Cada split necesita cuenta';
      else if (Math.abs(totalSplits - Number(form.monto)) > 0.01) {
        e.splits = `Suma de splits (${formatMoney(totalSplits)}) ≠ monto (${formatMoney(form.monto)})`;
      } else {
        const ids = splits.map(s => s.id_cuenta);
        if (new Set(ids).size !== ids.length) e.splits = 'No puede haber splits con la misma cuenta';
      }
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      const payload = {
        tipo: form.tipo,
        monto: Number(form.monto),
        concepto: form.concepto.trim(),
        fecha: form.fecha ? new Date(form.fecha).toISOString() : null,
        idTipo: form.id_tipo || null,
        categoria: form.categoria || null,
        metodo: form.metodo,
        idPersona: form.id_persona || null,
        idCuentaContable: form.id_cuenta_contable,
      };

      if (modoSplit) {
        payload.splits = splits.map(s => ({
          id_cuenta: Number(s.id_cuenta),
          monto: Number(s.monto),
          id_ubicacion: s.id_ubicacion ? Number(s.id_ubicacion) : null,
        }));
      } else {
        payload.idCuenta = Number(form.id_cuenta);
      }
      await onSubmit(payload);
    } catch (e) {
      // padre muestra alert
    } finally {
      setGuardando(false);
    }
  };

  const opcionesCuentas = cuentasActivas.map(c => ({
    value: c.id_cuenta,
    label: `${c.nombre}${c.alias ? ` (${c.alias})` : ''} — ${formatMoney(c.saldo_actual)}`,
  }));

  const opcionesUbicaciones = [
    { value: '', label: '— Sin tienda (split) —' },
    ...ubicaciones.map(u => ({ value: u.id_ubicacion, label: u.nombre })),
  ];

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo" required>
          <Select
            value={form.tipo}
            onChange={v => setF('tipo', v)}
            options={[
              { value: 'ingreso', label: 'Ingreso' },
              { value: 'egreso', label: 'Egreso' },
            ]}
          />
        </Field>

        <Field label="Fecha y hora" required>
          <Input
            type="datetime-local"
            value={form.fecha}
            onChange={v => setF('fecha', v)}
          />
        </Field>
      </div>

      <Field label="Monto" required error={errs.monto}>
        <MoneyInput value={form.monto} onChange={v => setF('monto', v || 0)} />
      </Field>

      <Field label="Concepto" required error={errs.concepto}>
        <Input
          value={form.concepto}
          onChange={v => setF('concepto', v)}
          placeholder="Descripción del movimiento"
        />
      </Field>

      <Field label="Cuenta contable" required error={errs.cc}
             hint="Define cómo aparece este movimiento en el Estado de Resultados">
        <Select
          value={form.id_cuenta_contable || ''}
          onChange={v => setF('id_cuenta_contable', v ? Number(v) : null)}
          options={[
            { value: '', label: '— Elegir cuenta contable —' },
            ...cuentasContablesImputables.map(p => ({
              value: p.id_cuenta_contable,
              label: `${p.codigo} — ${p.nombre}`,
            })),
          ]}
        />
      </Field>

      {/* Toggle split */}
      <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={modoSplit}
            onChange={e => setModoSplit(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Pagar/cobrar desde varias cuentas (split)</p>
            <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Útil cuando el movimiento se distribuye entre múltiples cajas/cuentas. Opcional: indica qué tienda aporta cada línea (gastos comunes).
            </p>
          </div>
        </label>
      </div>

      {!modoSplit && (
        <Field label="Cuenta" required error={errs.cuenta}>
          <Select
            value={form.id_cuenta || ''}
            onChange={v => setF('id_cuenta', v ? Number(v) : null)}
            options={[{ value: '', label: '— Elegir cuenta —' }, ...opcionesCuentas]}
          />
        </Field>
      )}

      {modoSplit && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#57534e] uppercase tracking-wider" style={{ fontWeight: 500 }}>Cuentas</p>
            <p className="text-[11px] text-[#a8a29e] fin-num" style={{ fontWeight: 500 }}>
              Total: {formatMoney(totalSplits)} / {formatMoney(form.monto)}
            </p>
          </div>
          <div className="space-y-2">
            {splits.map((s, idx) => (
              <div key={idx} className="rounded-lg border border-[#f5f5f4] p-2 space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={s.id_cuenta || ''}
                      onChange={v => handleSplitChange(idx, 'id_cuenta', v ? Number(v) : null)}
                      options={[{ value: '', label: '— Cuenta —' }, ...opcionesCuentas]}
                    />
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <MoneyInput value={s.monto} onChange={v => handleSplitChange(idx, 'monto', v || 0)} />
                  </div>
                  {splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSplit(idx)}
                      className="w-9 h-10 flex items-center justify-center rounded-lg text-[#a8a29e] hover:text-[#991b1b] hover:bg-[#fef2f2] flex-shrink-0"
                    >
                      <Icon d={ICONS.x} size={14} />
                    </button>
                  )}
                </div>
                <div className="max-w-md">
                  <p className="text-[10px] uppercase text-[#a8a29e] mb-0.5" style={{ fontWeight: 500 }}>Tienda que aporta (opcional)</p>
                  <Select
                    value={s.id_ubicacion || ''}
                    onChange={v => handleSplitChange(idx, 'id_ubicacion', v ? Number(v) : null)}
                    options={opcionesUbicaciones}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddSplit}
            className="mt-2 text-xs text-[#57534e] hover:text-[#1c1917] flex items-center gap-1"
            style={{ fontWeight: 500 }}
          >
            <Icon d={ICONS.plus} size={12} /> Agregar otra cuenta
          </button>
          {errs.splits && (
            <p className="text-[11px] text-[#991b1b] mt-2" style={{ fontWeight: 500 }}>{errs.splits}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo de movimiento (operacional)" hint="Opcional, para clasificación interna">
          <Select
            value={form.id_tipo || ''}
            onChange={v => setF('id_tipo', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin tipo —' },
              ...tipos.map(t => ({ value: t.id_tipo, label: `${t.emoji || ''} ${t.nombre}`.trim() })),
            ]}
          />
        </Field>

        <Field label="Persona" hint="Quien registra o ejecuta">
          <Select
            value={form.id_persona || ''}
            onChange={v => setF('id_persona', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin persona —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Registrar movimiento'}
        </Button>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   DetalleMovimiento
   ══════════════════════════════════════════════════════════════════════════ */

function DetalleMovimiento({ movimiento, cuentas, planCuentas, puedeModif, onActualizar, onEliminar }) {
  const m = movimiento;
  const [splits, setSplits] = useState([]);
  const [editandoCC, setEditandoCC] = useState(false);
  const [nuevaCC, setNuevaCC] = useState(m.id_cuenta_contable || '');
  const [editandoConcepto, setEditandoConcepto] = useState(false);
  const [nuevoConcepto, setNuevoConcepto] = useState(m.concepto || '');

  useEffect(() => {
    if (m.tiene_splits) {
      listarSplitsDeMovimiento(m.id_movimiento)
        .then(setSplits)
        .catch(console.error);
    }
  }, [m.id_movimiento, m.tiene_splits]);

  const cuentaContable = planCuentas.find(p => p.id_cuenta_contable === m.id_cuenta_contable);

  const guardarCC = async () => {
    if (!nuevaCC) return;
    try {
      await onActualizar({ id_cuenta_contable: Number(nuevaCC) });
      setEditandoCC(false);
    } catch (e) {}
  };

  const guardarConcepto = async () => {
    if (!nuevoConcepto.trim()) return;
    try {
      await onActualizar({ concepto: nuevoConcepto.trim() });
      setEditandoConcepto(false);
    } catch (e) {}
  };

  const cuentasContablesImputables = planCuentas.filter(p => p.activa && p.permite_movimientos);

  return (
    <div>
      {/* Header con monto */}
      <div className="text-center pb-4 border-b border-[#f5f5f4]">
        <p className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>
          {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
        </p>
        <p
          className={`text-3xl fin-num mt-1 ${m.tipo === 'ingreso' ? 'text-[#166534]' : 'text-[#991b1b]'}`}
          style={{ fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          {m.tipo === 'ingreso' ? '+' : '−'}{formatMoney(m.monto)}
        </p>
        <p className="text-xs text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>
          {formatDate(m.fecha_movimiento)}
        </p>
      </div>

      {/* Concepto editable */}
      <div className="py-4 border-b border-[#f5f5f4]">
        <p className="text-[10px] uppercase tracking-wider text-[#a8a29e] mb-1" style={{ fontWeight: 500 }}>Concepto</p>
        {editandoConcepto && puedeModif ? (
          <div className="flex items-center gap-2">
            <Input value={nuevoConcepto} onChange={setNuevoConcepto} />
            <button
              onClick={guardarConcepto}
              className="px-3 py-2 rounded-lg bg-[#1c1917] text-white text-xs"
              style={{ fontWeight: 500 }}
            >
              Guardar
            </button>
            <button
              onClick={() => { setEditandoConcepto(false); setNuevoConcepto(m.concepto); }}
              className="px-3 py-2 text-xs text-[#57534e]"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 group">
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>{m.concepto}</p>
            {puedeModif && (
              <button
                onClick={() => setEditandoConcepto(true)}
                className="text-[#a8a29e] hover:text-[#1c1917] opacity-0 group-hover:opacity-100"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cuenta contable editable */}
      <div className="py-4 border-b border-[#f5f5f4]">
        <p className="text-[10px] uppercase tracking-wider text-[#a8a29e] mb-1" style={{ fontWeight: 500 }}>
          Cuenta contable (P&L)
        </p>
        {editandoCC && puedeModif ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                value={nuevaCC || ''}
                onChange={setNuevaCC}
                options={[
                  { value: '', label: '— Elegir —' },
                  ...cuentasContablesImputables.map(p => ({
                    value: p.id_cuenta_contable,
                    label: `${p.codigo} — ${p.nombre}`,
                  })),
                ]}
              />
            </div>
            <button
              onClick={guardarCC}
              className="px-3 py-2 rounded-lg bg-[#1c1917] text-white text-xs"
              style={{ fontWeight: 500 }}
            >
              Guardar
            </button>
            <button
              onClick={() => { setEditandoCC(false); setNuevaCC(m.id_cuenta_contable); }}
              className="px-3 py-2 text-xs text-[#57534e]"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 group">
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
              {cuentaContable ? `${cuentaContable.codigo} — ${cuentaContable.nombre}` : <span className="text-[#a8a29e]">Sin asignar</span>}
            </p>
            {puedeModif && (
              <button
                onClick={() => setEditandoCC(true)}
                className="text-[#a8a29e] hover:text-[#1c1917] opacity-0 group-hover:opacity-100"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cuenta(s) origen */}
      <div className="py-4 border-b border-[#f5f5f4]">
        <p className="text-[10px] uppercase tracking-wider text-[#a8a29e] mb-1" style={{ fontWeight: 500 }}>
          {m.tiene_splits ? 'Cuentas (split)' : 'Cuenta'}
        </p>
        {m.tiene_splits ? (
          <div className="space-y-1">
            {splits.length === 0 ? (
              <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>Cargando...</p>
            ) : (
              splits.map(s => (
                <div key={s.id_split} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-[#1c1917] min-w-0" style={{ fontWeight: 500 }}>
                    {s.cuenta?.nombre || '—'}
                    {s.ubicacion?.nombre && (
                      <span className="block text-[10px] text-[#a8a29e] font-normal">Aporte: {s.ubicacion.nombre}</span>
                    )}
                  </span>
                  <span className="text-[#1c1917] fin-num flex-shrink-0" style={{ fontWeight: 500 }}>{formatMoney(s.monto)}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>{m.cuenta?.nombre || '—'}</p>
        )}
      </div>

      {/* Otros campos */}
      <div className="py-3 space-y-1.5">
        {m.persona && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>Persona</span>
            <span className="text-[#1c1917]" style={{ fontWeight: 500 }}>{m.persona.nombre}</span>
          </div>
        )}
        {m.tipo_mov && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>Tipo</span>
            <span className="text-[#1c1917]" style={{ fontWeight: 500 }}>{m.tipo_mov.nombre}</span>
          </div>
        )}
        {m.deuda && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>Deuda asociada</span>
            <span className="text-[#1c1917]" style={{ fontWeight: 500 }}>{m.deuda.nombre}</span>
          </div>
        )}
        {m.costo && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>Costo asociado</span>
            <span className="text-[#1c1917]" style={{ fontWeight: 500 }}>{m.costo.nombre}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>ID</span>
          <span className="text-[#a8a29e] font-mono" style={{ fontWeight: 400 }}>#{m.id_movimiento}</span>
        </div>
      </div>

      {/* Acciones */}
      {puedeModif && (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[#f5f5f4]">
          <Button variant="danger" icon={ICONS.trash} onClick={onEliminar}>
            Eliminar movimiento
          </Button>
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   ModalGuardarVista
   ══════════════════════════════════════════════════════════════════════════ */

function ModalGuardarVista({ onConfirm, onCancel }) {
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await onConfirm(nombre.trim());
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Guardar vista"
      size="sm"
      footer={
        <>
          <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={guardando || !nombre.trim()}>
            {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar'}
          </Button>
        </>
      }
    >
      <Field label="Nombre de la vista" required hint="Ej: Egresos del mes, Pagos de Aly, etc.">
        <Input
          value={nombre}
          onChange={setNombre}
          placeholder="Mi vista"
          autoFocus
        />
      </Field>
      <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
        Guardará los filtros actuales para reusar esta vista cuando quieras.
      </p>
    </Modal>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   PestanaTipos - CRUD de tipos_movimiento_caja
   ══════════════════════════════════════════════════════════════════════════ */

const CATEGORIAS_TIPO = [
  { value: 'ingreso',          label: 'Ingreso' },
  { value: 'gasto_operativo',  label: 'Gasto operativo' },
  { value: 'gasto_personal',   label: 'Gasto de personal' },
  { value: 'devolucion',       label: 'Devolución' },
  { value: 'obligacion',       label: 'Obligación' },
  { value: 'transferencia',    label: 'Transferencia' },
  { value: 'retiro_dueno',     label: 'Retiro del dueño' },
  { value: 'ingreso_extra',    label: 'Ingreso extra' },
  { value: 'pago_deuda',       label: 'Pago de deuda' },
  { value: 'pago_costo_fijo',  label: 'Pago de costo fijo' },
];

const FLUJO_OPTIONS = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso',  label: 'Egreso' },
  { value: 'ambos',   label: 'Ambos' },
];

function PestanaTipos({ tipos, puedeModif, onRecargar }) {
  const [modalCrear, setModalCrear] = useState(false);
  const [edicion, setEdicion] = useState(null);

  useEffect(() => { onRecargar(); }, []); // recarga al entrar al tab

  const tiposActivos = tipos.filter(t => t.activo);
  const tiposInactivos = tipos.filter(t => !t.activo);

  const handleCrear = async (payload) => {
    try {
      await crearTipoMovimiento(payload);
      setModalCrear(false);
      await onRecargar();
    } catch (e) {
      alert('Error al crear tipo: ' + (e.message || ''));
      throw e;
    }
  };

  const handleActualizar = async (id, cambios) => {
    try {
      await actualizarTipoMovimiento(id, cambios);
      setEdicion(null);
      await onRecargar();
    } catch (e) {
      alert('Error al actualizar: ' + (e.message || ''));
      throw e;
    }
  };

  const handleArchivar = async (id) => {
    if (!window.confirm('¿Archivar este tipo? Los movimientos históricos lo conservarán.')) return;
    try {
      await archivarTipoMovimiento(id);
      await onRecargar();
    } catch (e) {
      alert('Error al archivar: ' + (e.message || ''));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
          Tipos operacionales que clasifican los movimientos del POS y del módulo Finanzas.
          Editables desde aquí. Distinto del Plan de Cuentas (que define la estructura del P&L).
        </p>
        {puedeModif && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
            Nuevo tipo
          </Button>
        )}
      </div>

      <Card padding="sm">
        <table className="w-full text-sm">
          <thead className="bg-[#fafaf9] text-[10px] text-[#a8a29e] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Código</th>
              <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Nombre</th>
              <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Categoría</th>
              <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Flujo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tiposActivos.map(t => (
              <tr key={t.id_tipo} className="border-t border-[#f5f5f4] hover:bg-[#fafaf9] group">
                <td className="px-3 py-2 font-mono text-[11px] text-[#a8a29e]">{t.codigo}</td>
                <td className="px-3 py-2 text-[#1c1917]" style={{ fontWeight: 500 }}>
                  {t.emoji && <span className="mr-1">{t.emoji}</span>}
                  {t.nombre}
                </td>
                <td className="px-3 py-2 text-[#57534e] text-[12px]" style={{ fontWeight: 400 }}>{t.categoria}</td>
                <td className="px-3 py-2 text-[#57534e] text-[12px]" style={{ fontWeight: 400 }}>{t.tipo_flujo}</td>
                <td className="px-3 py-2 text-right">
                  {puedeModif && (
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => setEdicion(t)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f4] text-[#57534e] hover:text-[#1c1917]"
                      >
                        <Icon d={ICONS.edit} size={13} />
                      </button>
                      <button
                        onClick={() => handleArchivar(t.id_tipo)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#fef2f2] text-[#a8a29e] hover:text-[#991b1b]"
                      >
                        <Icon d={ICONS.trash} size={13} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {tiposInactivos.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-[#a8a29e] cursor-pointer" style={{ fontWeight: 500 }}>
            Mostrar {tiposInactivos.length} tipos archivados
          </summary>
          <div className="mt-2 space-y-1">
            {tiposInactivos.map(t => (
              <div key={t.id_tipo} className="flex items-center gap-2 text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
                <span className="font-mono">{t.codigo}</span>
                <span>{t.nombre}</span>
                {puedeModif && (
                  <button
                    onClick={() => actualizarTipoMovimiento(t.id_tipo, { activo: true }).then(onRecargar)}
                    className="ml-auto text-[#57534e] hover:text-[#1c1917]"
                  >
                    Reactivar
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nuevo tipo de movimiento"
        size="md"
      >
        <FormTipoMovimiento onSubmit={handleCrear} onCancel={() => setModalCrear(false)} />
      </Modal>

      {edicion && (
        <Modal
          open={true}
          onClose={() => setEdicion(null)}
          title="Editar tipo de movimiento"
          size="md"
        >
          <FormTipoMovimiento
            valoresIniciales={edicion}
            onSubmit={(cambios) => handleActualizar(edicion.id_tipo, cambios)}
            onCancel={() => setEdicion(null)}
          />
        </Modal>
      )}
    </>
  );
}

function FormTipoMovimiento({ valoresIniciales, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    emoji: '',
    categoria: 'gasto_operativo',
    tipo_flujo: 'egreso',
    requiere_nota: false,
    orden: 99,
    ...(valoresIniciales || {}),
  });
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const validar = () => {
    const e = {};
    if (!form.codigo?.trim()) e.codigo = 'Requerido';
    else if (!/^[a-z0-9_]+$/.test(form.codigo)) e.codigo = 'Solo minúsculas, números y guion bajo';
    if (!form.nombre?.trim()) e.nombre = 'Requerido';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      await onSubmit({
        codigo: form.codigo.trim().toLowerCase(),
        nombre: form.nombre.trim(),
        emoji: form.emoji?.trim() || null,
        categoria: form.categoria,
        tipo_flujo: form.tipo_flujo,
        requiere_nota: !!form.requiere_nota,
        orden: Number(form.orden) || 99,
        activo: true,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Código" required error={errs.codigo} hint="snake_case">
          <Input
            value={form.codigo}
            onChange={v => setF('codigo', v.toLowerCase())}
            placeholder="pago_proveedor"
            error={errs.codigo}
          />
        </Field>
        <Field label="Nombre" required error={errs.nombre}>
          <Input value={form.nombre} onChange={v => setF('nombre', v)} placeholder="Pago a proveedor" />
        </Field>
        <Field label="Emoji" hint="Opcional, una sola emoji">
          <Input value={form.emoji} onChange={v => setF('emoji', v)} placeholder="📦" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Categoría" required>
          <Select value={form.categoria} onChange={v => setF('categoria', v)} options={CATEGORIAS_TIPO} />
        </Field>
        <Field label="Flujo" required>
          <Select value={form.tipo_flujo} onChange={v => setF('tipo_flujo', v)} options={FLUJO_OPTIONS} />
        </Field>
      </div>

      <div className="border-t border-[#f5f5f4] pt-4 mt-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.requiere_nota}
            onChange={e => setF('requiere_nota', e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Requiere nota obligatoria</p>
            <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Si está marcado, al usar este tipo el usuario debe escribir un concepto descriptivo.
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar tipo'}
        </Button>
      </div>
    </div>
  );
}