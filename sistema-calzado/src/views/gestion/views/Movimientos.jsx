import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listarMovimientos, obtenerMovimiento,
  actualizarMovimiento, eliminarMovimiento, listarSplitsDeMovimiento,
  listarCuentas, listarPlanCuentas, listarTiposMovimiento,
  listarVistasGuardadas, guardarVista, eliminarVista,
} from '../api/finanzasClient';
import { formatMoney, formatDate } from '../lib/calculos';
import { puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, Badge, Button, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
  SearchableGroupedSelect,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   MOVIMIENTOS — Bloque 3.5
   ──────────────────────────────────────────────────────────────────────────
   Vista densa estilo Airtable: tabla con filtros, búsqueda, vistas guardadas,
   creación manual de movimientos (con splits multi-cuenta y cuenta contable
   obligatoria), edición inline donde es seguro, eliminar.

   Estructura:
     export default Movimientos
     ├── BarraVistas             (chips de vistas guardadas + nueva vista)
     ├── BarraFiltros
     ├── TablaMovimientos
     │   └── FilaMovimiento (con expansión de splits)
     ├── ModalCrearMovimiento
     └── ModalDetalleMovimiento
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
  const [searchParams] = useSearchParams();
  const [movimientos, setMovimientos] = useState([]);
  const [count, setCount] = useState(0);
  const [cuentas, setCuentas] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [vistas, setVistas] = useState([]);
  const [vistaActiva, setVistaActiva] = useState(null); // null = vista temporal
  const [config, setConfig] = useState(VISTA_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modales
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);
  const [modalGuardarVista, setModalGuardarVista] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(null);

  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);
  const filtroSeccionPL = searchParams.get('seccion_pl') || '';

  /* ── Cargar datos auxiliares (1 vez) ── */
  useEffect(() => {
    (async () => {
      try {
        const [cs, pc, tps, vs] = await Promise.all([
          listarCuentas(),
          listarPlanCuentas(),
          listarTiposMovimiento({ soloActivos: true }),
          listarVistasGuardadas('movimientos', usuario?.id_persona).catch(() => []),
        ]);
        setCuentas(cs);
        setPlanCuentas(pc);
        setTipos(tps);
        setVistas(vs);

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

  useEffect(() => {
    const tipoQuery = searchParams.get('tipo') || '';
    setConfig(prev => {
      if ((prev.filtros.tipo || '') === tipoQuery) return prev;
      return {
        ...prev,
        filtros: { ...prev.filtros, tipo: tipoQuery },
      };
    });
  }, [searchParams]);

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

      if (filtroSeccionPL) {
        dataFiltrada = dataFiltrada.filter(m => m.cuenta_contable?.seccion_pl === filtroSeccionPL);
      }

      setMovimientos(dataFiltrada);
      setCount(c);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  }, [config.filtros, filtroSeccionPL]);

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
        actions={null}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 text-sm text-destructive" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {/* ── Banner informativo ── */}
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            Para registrar un movimiento, usa <strong>Comando</strong>, la <strong>Caja</strong> de una ubicación, o el módulo correspondiente (POS, Producción).
          </div>

          {/* ── Vistas guardadas ── */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={usarVistaTemp}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                !vistaActiva
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
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
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {v.nombre}
                </button>
                {vistaActiva?.id_vista === v.id_vista && (
                  <button
                    onClick={() => handleEliminarVista(v.id_vista)}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted"
                style={{ fontWeight: 500 }}
              >
                <Icon d={ICONS.plus} size={11} /> Guardar como vista
              </button>
            )}
          </div>

          {/* ── KPI cards del período ── */}
          {!loading && movimientos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-card rounded-xl border border-border px-4 py-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ingresos</span>
                <span className="text-lg font-bold tabular-nums text-green-700">{formatMoney(totales.ingresos)}</span>
              </div>
              <div className="bg-card rounded-xl border border-border px-4 py-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Egresos</span>
                <span className="text-lg font-bold tabular-nums text-red-700">{formatMoney(totales.egresos)}</span>
              </div>
              <div className="bg-card rounded-xl border border-border px-4 py-3 flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Neto</span>
                <span className={`text-lg font-bold tabular-nums ${totales.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatMoney(totales.neto)}
                </span>
              </div>
              <div className="hidden sm:flex bg-card rounded-xl border border-border px-4 py-3 flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Movimientos</span>
                <span className="text-lg font-bold tabular-nums text-foreground">{movimientos.length}</span>
              </div>
            </div>
          )}

          {/* ── Filtros ── */}
          <Card padding="sm" className="mb-3">
            {/* Fila 1: tipo, cuenta, cuenta contable, búsqueda */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
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
              <div className="w-[220px]">
                <SearchableGroupedSelect
                  value={config.filtros.idCuentaContable}
                  onChange={v => setFiltro('idCuentaContable', v)}
                  placeholder="Todas las cuentas contables"
                  groups={(() => {
                    const secciones = {};
                    planCuentas.filter(p => p.permite_movimientos).forEach(p => {
                      const sec = p.seccion_pl || 'Otras';
                      if (!secciones[sec]) secciones[sec] = [];
                      secciones[sec].push({
                        value: p.id_cuenta_contable,
                        label: p.nombre,
                        sublabel: p.codigo,
                      });
                    });
                    const grupos = Object.entries(secciones).map(([label, options]) => ({ label, options }));
                    return [{ label: 'Todas', options: [{ value: '', label: 'Todas las cuentas contables' }] }, ...grupos];
                  })()}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="relative">
                  <Icon d={ICONS.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={config.filtros.busqueda}
                    onChange={e => setFiltro('busqueda', e.target.value)}
                    placeholder="Buscar concepto..."
                    style={{ fontWeight: 400 }}
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus:ring-1 focus-visible:ring-ring/50"
                  />
                </div>
              </div>
            </div>
            {/* Fila 2: presets de fecha + inputs fecha */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>Período:</span>
              {[
                { label: 'Hoy',     fn: () => { const h = new Date().toISOString().slice(0,10); setConfig(p => ({ ...p, filtros: { ...p.filtros, desde: h, hasta: h } })); } },
                { label: 'Semana',  fn: () => { const h = new Date(); const lun = new Date(h); lun.setDate(h.getDate() - ((h.getDay()+6)%7)); setConfig(p => ({ ...p, filtros: { ...p.filtros, desde: lun.toISOString().slice(0,10), hasta: h.toISOString().slice(0,10) } })); } },
                { label: 'Mes',     fn: () => { const h = new Date(); const ini = new Date(h.getFullYear(), h.getMonth(), 1); setConfig(p => ({ ...p, filtros: { ...p.filtros, desde: ini.toISOString().slice(0,10), hasta: h.toISOString().slice(0,10) } })); } },
                { label: 'Todo',    fn: () => setConfig(p => ({ ...p, filtros: { ...p.filtros, desde: '', hasta: '' } })) },
              ].map(pr => (
                <button
                  key={pr.label}
                  onClick={pr.fn}
                  className="px-2.5 py-1 text-xs rounded-full border border-border text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  {pr.label}
                </button>
              ))}
              <div className="w-[130px]">
                <Input type="date" value={config.filtros.desde} onChange={v => setFiltro('desde', v)} />
              </div>
              <div className="w-[130px]">
                <Input type="date" value={config.filtros.hasta} onChange={v => setFiltro('hasta', v)} />
              </div>
              {tieneFiltrosActivos && (
                <button
                  onClick={limpiarFiltros}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
                  style={{ fontWeight: 500 }}
                >
                  Limpiar todo
                </button>
              )}
            </div>
          </Card>

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
                  : 'Los movimientos se registran desde Caja, POS, Producción o el módulo Comando.'}
              />
            </Card>
          ) : (
            <Card padding="sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider">
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
                <p className="text-[11px] text-muted-foreground text-center mt-3" style={{ fontWeight: 400 }}>
                  Mostrando los primeros 200 de {count}. Usa filtros para acotar.
                </p>
              )}
            </Card>
          )}

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
          <p className="text-sm text-muted-foreground" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres eliminar este movimiento de{' '}
            <span style={{ fontWeight: 500, color: '#1c1917' }}>{formatMoney(confirmEliminar.monto)}</span>?
          </p>
          <p className="text-xs text-muted-foreground mt-2" style={{ fontWeight: 400 }}>
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
          <td className="px-3 py-2 text-muted-foreground fin-num text-[11px]" style={{ fontWeight: 400 }}>
            {formatDate(m.fecha_movimiento)}
          </td>
        );
      case 'tipo':
        return (
          <td className="px-3 py-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${m.tipo === 'ingreso' ? 'bg-green-700' : 'bg-destructive'}`}
              title={m.tipo}
            />
          </td>
        );
      case 'concepto':
        return (
          <td className="px-3 py-2 text-foreground" style={{ fontWeight: 400 }}>
            <p className="truncate">{m.concepto}</p>
            {m.tiene_splits && (
              <span className="text-[10px] text-muted-foreground" style={{ fontWeight: 400 }}>· split multi-cuenta</span>
            )}
          </td>
        );
      case 'cuenta':
        return (
          <td className="px-3 py-2 text-muted-foreground text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.tiene_splits ? <span className="text-muted-foreground">— varias —</span> : (m.cuenta?.nombre || '—')}
          </td>
        );
      case 'cuenta_contable':
        return (
          <td className="px-3 py-2 text-muted-foreground text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.id_cuenta_contable
              ? <span className="text-[10px] font-mono bg-muted/30 px-1.5 py-0.5 rounded">{m.id_cuenta_contable}</span>
              : <span className="text-muted-foreground">sin asignar</span>}
          </td>
        );
      case 'categoria':
        return (
          <td className="px-3 py-2 text-muted-foreground text-[11px]" style={{ fontWeight: 400 }}>
            {m.categoria || '—'}
          </td>
        );
      case 'persona':
        return (
          <td className="px-3 py-2 text-muted-foreground text-[12px] truncate" style={{ fontWeight: 400 }}>
            {m.persona?.nombre || '—'}
          </td>
        );
      case 'monto':
        return (
          <td
            className={`px-3 py-2 text-right fin-num ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-destructive'}`}
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
      className="border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {COLUMNAS_DISPONIBLES.filter(c => columnas.includes(c.key)).map(col => (
        <React.Fragment key={col.key}>{renderCelda(col.key)}</React.Fragment>
      ))}
    </tr>
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
      <div className="text-center pb-4 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>
          {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
        </p>
        <p
          className={`text-3xl fin-num mt-1 ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-destructive'}`}
          style={{ fontWeight: 500, letterSpacing: '-0.02em' }}
        >
          {m.tipo === 'ingreso' ? '+' : '−'}{formatMoney(m.monto)}
        </p>
        <p className="text-xs text-muted-foreground mt-1" style={{ fontWeight: 400 }}>
          {formatDate(m.fecha_movimiento)}
        </p>
      </div>

      {/* Concepto editable */}
      <div className="py-4 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1" style={{ fontWeight: 500 }}>Concepto</p>
        {editandoConcepto && puedeModif ? (
          <div className="flex items-center gap-2">
            <Input value={nuevoConcepto} onChange={setNuevoConcepto} />
            <button
              onClick={guardarConcepto}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs"
              style={{ fontWeight: 500 }}
            >
              Guardar
            </button>
            <button
              onClick={() => { setEditandoConcepto(false); setNuevoConcepto(m.concepto); }}
              className="px-3 py-2 text-xs text-muted-foreground"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 group">
            <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>{m.concepto}</p>
            {puedeModif && (
              <button
                onClick={() => setEditandoConcepto(true)}
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cuenta contable editable */}
      <div className="py-4 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
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
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs"
              style={{ fontWeight: 500 }}
            >
              Guardar
            </button>
            <button
              onClick={() => { setEditandoCC(false); setNuevaCC(m.id_cuenta_contable); }}
              className="px-3 py-2 text-xs text-muted-foreground"
              style={{ fontWeight: 500 }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 group">
            <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>
              {cuentaContable ? `${cuentaContable.codigo} — ${cuentaContable.nombre}` : <span className="text-muted-foreground">Sin asignar</span>}
            </p>
            {puedeModif && (
              <button
                onClick={() => setEditandoCC(true)}
                className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cuenta(s) origen */}
      <div className="py-4 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1" style={{ fontWeight: 500 }}>
          {m.tiene_splits ? 'Cuentas (split)' : 'Cuenta'}
        </p>
        {m.tiene_splits ? (
          <div className="space-y-1">
            {splits.length === 0 ? (
              <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>Cargando...</p>
            ) : (
              splits.map(s => (
                <div key={s.id_split} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-foreground min-w-0" style={{ fontWeight: 500 }}>
                    {s.cuenta?.nombre || '—'}
                    {s.ubicacion?.nombre && (
                      <span className="block text-[10px] text-muted-foreground font-normal">Aporte: {s.ubicacion.nombre}</span>
                    )}
                  </span>
                  <span className="text-foreground fin-num flex-shrink-0" style={{ fontWeight: 500 }}>{formatMoney(s.monto)}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>{m.cuenta?.nombre || '—'}</p>
        )}
      </div>

      {/* Otros campos */}
      <div className="py-3 space-y-1.5">
        {m.persona && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>Persona</span>
            <span className="text-foreground" style={{ fontWeight: 500 }}>{m.persona.nombre}</span>
          </div>
        )}
        {m.tipo_mov && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>Tipo</span>
            <span className="text-foreground" style={{ fontWeight: 500 }}>{m.tipo_mov.nombre}</span>
          </div>
        )}
        {m.deuda && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>Deuda asociada</span>
            <span className="text-foreground" style={{ fontWeight: 500 }}>{m.deuda.nombre}</span>
          </div>
        )}
        {m.costo && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>Costo asociado</span>
            <span className="text-foreground" style={{ fontWeight: 500 }}>{m.costo.nombre}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 500 }}>ID</span>
          <span className="text-muted-foreground font-mono" style={{ fontWeight: 400 }}>#{m.id_movimiento}</span>
        </div>
      </div>

      {/* Acciones */}
      {puedeModif && (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border/50">
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
      <p className="text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>
        Guardará los filtros actuales para reusar esta vista cuando quieras.
      </p>
    </Modal>
  );
}

