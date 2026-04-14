import React, { useState, useEffect, useMemo } from 'react';
import {
  listarTransferencias, obtenerTransferencia, crearTransferencia,
  marcarReembolso, marcarReembolsoSinMovimiento, anularTransferencia,
  listarCuentas, listarPersonasConAccesoFinanzas,
} from '../api/finanzasClient';
import { formatMoney, formatDate, diasEntre } from '../lib/calculos';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, MetricCard, Badge, Button, Modal, Field, Input, Select,
  MoneyInput, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   TRANSFERENCIAS — Bloque 3.4
   ──────────────────────────────────────────────────────────────────────────
   Estructura:

     export default Transferencias                ← container
     ├── Sección 1: KPIs del header
     ├── Sección 2: PRÉSTAMOS PENDIENTES (solo si hay)
     │   └── PrestamoPendienteRow
     ├── Sección 3: Historial completo
     │   ├── Filtros (motivo / cuenta / rango / búsqueda)
     │   └── TransferenciaRow (densa)
     ├── Modal: Crear transferencia (FormTransferencia)
     ├── Modal: Detalle transferencia (DetalleTransferencia)
     ├── Modal: Marcar reembolso (FormMarcarReembolso)
     └── Modal: Confirmar anular

   Decisiones:
     - Préstamos pendientes son la zona prioritaria. Solo aparecen si existen.
     - KPI "Saldo neto papá ↔ mamá": se calcula por flujos entre cuentas con
       custodios distintos. Útil para detectar subsidios crónicos.
     - Reembolso permite cerrar SIN crear movimiento (solo auditoría) o
       crearlo como transferencia inversa real (default).
     - Anular borra los 2 movimientos vinculados → triggers revierten saldos.
   ────────────────────────────────────────────────────────────────────────── */


/* ──────────────────────────────────────────────────────────────────────────
   CONSTANTES
   ────────────────────────────────────────────────────────────────────────── */

const MOTIVOS = [
  { value: 'transferencia',      label: 'Transferencia',           color: 'gray'    },
  { value: 'cierre_tienda',      label: 'Cierre de tienda',        color: 'info'    },
  { value: 'prestamo_interno',   label: 'Préstamo interno',        color: 'warning' },
  { value: 'reembolso_prestamo', label: 'Reembolso de préstamo',   color: 'success' },
  { value: 'reasignacion',       label: 'Reasignación',            color: 'purple'  },
  { value: 'aporte_pedido',      label: 'Aporte para pedido',      color: 'teal'    },
  { value: 'pago_deuda_origen',  label: 'Pago de deuda',           color: 'gray'    },
  { value: 'ajuste',             label: 'Ajuste',                  color: 'gray'    },
];

const motivoLabel = (m) => MOTIVOS.find(x => x.value === m)?.label || m;
const motivoColor = (m) => MOTIVOS.find(x => x.value === m)?.color || 'gray';

const UMBRAL_PRESTAMO_ALERTA   = 30; // días
const UMBRAL_PRESTAMO_CRITICO  = 60;
const UMBRAL_PRESTAMO_VENCIDO  = 90;

function colorPrestamoPorDias(dias) {
  if (dias >= UMBRAL_PRESTAMO_VENCIDO)  return { bg: '#fee2e2', border: '#991b1b', text: '#991b1b', label: 'Vencido' };
  if (dias >= UMBRAL_PRESTAMO_CRITICO)  return { bg: '#fef3c7', border: '#854d0e', text: '#854d0e', label: 'Crítico' };
  if (dias >= UMBRAL_PRESTAMO_ALERTA)   return { bg: '#fef9c3', border: '#a16207', text: '#a16207', label: 'Atención' };
  return { bg: '#fafaf9', border: '#a8a29e', text: '#57534e', label: 'Reciente' };
}


/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function Transferencias({ usuario }) {
  const [transferencias, setTransferencias]   = useState([]);
  const [pendientes, setPendientes]           = useState([]);
  const [cuentas, setCuentas]                 = useState([]);
  const [personas, setPersonas]               = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState('');

  // Filtros del historial
  const [filtroMotivo, setFiltroMotivo]       = useState('');
  const [filtroCuenta, setFiltroCuenta]       = useState('');
  const [filtroDesde, setFiltroDesde]         = useState('');
  const [filtroHasta, setFiltroHasta]         = useState('');
  const [busqueda, setBusqueda]               = useState('');

  // Modales
  const [modalCrear, setModalCrear]                   = useState(false);
  const [transferenciaDetalle, setTransferenciaDetalle] = useState(null);
  const [modalReembolso, setModalReembolso]           = useState(null);
  const [confirmAnular, setConfirmAnular]             = useState(null);

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);

  /* ── Carga inicial ── */
  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [trsResp, pendResp, cs, ps] = await Promise.all([
        listarTransferencias({ limit: 200 }),
        listarTransferencias({ soloReembolsablesPendientes: true, limit: 100 }),
        listarCuentas(),
        listarPersonasConAccesoFinanzas(),
      ]);
      setTransferencias(trsResp.data);
      setPendientes(pendResp.data);
      setCuentas(cs);
      setPersonas(ps);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar transferencias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  /* ── KPIs ── */

  const kpis = useMemo(() => {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    let totalMes = 0;
    let cierresSemana = 0;

    transferencias.forEach(t => {
      const fecha = new Date(t.fecha);
      if (t.estado === 'anulada') return;
      if (fecha >= inicioMes) totalMes += Number(t.monto) || 0;
      if (t.motivo === 'cierre_tienda' && fecha >= inicioSemana) cierresSemana++;
    });

    const totalPendientes = pendientes.reduce((s, p) => s + (Number(p.monto) || 0), 0);

    /* Saldo neto entre custodios — métrica estratégica.
       Para cada transferencia activa: si origen y destino tienen custodios
       distintos, agregamos el flujo al "balance" del par. Mostramos el par
       con mayor desbalance absoluto. */
    const flujosPorPar = new Map();
    transferencias.forEach(t => {
      if (t.estado === 'anulada') return;
      const cOrigen = t.origen?.id_cuenta;
      const cDestino = t.destino?.id_cuenta;
      if (!cOrigen || !cDestino) return;
      const cuentaOrigen = cuentas.find(c => c.id_cuenta === cOrigen);
      const cuentaDestino = cuentas.find(c => c.id_cuenta === cDestino);
      const custO = cuentaOrigen?.custodio?.nombre;
      const custD = cuentaDestino?.custodio?.nombre;
      if (!custO || !custD || custO === custD) return;

      const par = [custO, custD].sort();
      const key = par.join('↔');
      const monto = Number(t.monto) || 0;
      const direccion = custO === par[0] ? +monto : -monto; // positivo: par[0] → par[1]
      flujosPorPar.set(key, (flujosPorPar.get(key) || 0) + direccion);
    });

    let saldoNetoLabel = '—';
    let saldoNetoValor = 0;
    let saldoNetoSub = 'Sin flujos entre personas';
    if (flujosPorPar.size > 0) {
      let maxAbs = 0;
      let maxKey = null;
      let maxVal = 0;
      flujosPorPar.forEach((val, key) => {
        if (Math.abs(val) > maxAbs) { maxAbs = Math.abs(val); maxKey = key; maxVal = val; }
      });
      if (maxKey) {
        const [a, b] = maxKey.split('↔');
        const desde = maxVal >= 0 ? a : b;
        const hacia = maxVal >= 0 ? b : a;
        saldoNetoLabel = `${desde} → ${hacia}`;
        saldoNetoValor = Math.abs(maxVal);
        saldoNetoSub = `Flujo neto histórico ${desde} → ${hacia}`;
      }
    }

    return {
      totalMes,
      totalPendientes,
      countPendientes: pendientes.length,
      cierresSemana,
      saldoNetoLabel,
      saldoNetoValor,
      saldoNetoSub,
    };
  }, [transferencias, pendientes, cuentas]);

  /* ── Préstamos pendientes ordenados por antigüedad ── */

  const pendientesOrdenados = useMemo(() => {
    return [...pendientes]
      .map(p => ({
        ...p,
        _dias: Math.abs(diasEntre(new Date(p.fecha), new Date())),
      }))
      .sort((a, b) => b._dias - a._dias);
  }, [pendientes]);

  /* ── Historial filtrado ── */

  const transferenciasFiltradas = useMemo(() => {
    let arr = transferencias;

    if (filtroMotivo) arr = arr.filter(t => t.motivo === filtroMotivo);
    if (filtroCuenta) {
      const cId = Number(filtroCuenta);
      arr = arr.filter(t => t.id_cuenta_origen === cId || t.id_cuenta_destino === cId);
    }
    if (filtroDesde) arr = arr.filter(t => new Date(t.fecha) >= new Date(filtroDesde));
    if (filtroHasta) {
      const hasta = new Date(filtroHasta);
      hasta.setHours(23, 59, 59, 999);
      arr = arr.filter(t => new Date(t.fecha) <= hasta);
    }
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      arr = arr.filter(t =>
        t.concepto?.toLowerCase().includes(q) ||
        t.origen?.nombre?.toLowerCase().includes(q) ||
        t.destino?.nombre?.toLowerCase().includes(q) ||
        t.notas?.toLowerCase().includes(q)
      );
    }

    return arr;
  }, [transferencias, filtroMotivo, filtroCuenta, filtroDesde, filtroHasta, busqueda]);

  const limpiarFiltros = () => {
    setFiltroMotivo(''); setFiltroCuenta(''); setFiltroDesde(''); setFiltroHasta(''); setBusqueda('');
  };

  const hayFiltros = filtroMotivo || filtroCuenta || filtroDesde || filtroHasta || busqueda;

  /* ── Handlers ── */

  const handleCrear = async (payload) => {
    try {
      await crearTransferencia(payload);
      setModalCrear(false);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al crear transferencia: ' + (e.message || 'Inténtalo de nuevo'));
      throw e;
    }
  };

  const handleReembolso = async (idTransferencia, opciones) => {
    try {
      if (opciones.crearMovimiento) {
        await marcarReembolso(idTransferencia, {
          fechaReembolso: opciones.fechaReembolso,
          conceptoReembolso: opciones.conceptoReembolso,
          idPersonaOrigen: opciones.idPersonaOrigen,
          idPersonaDestino: opciones.idPersonaDestino,
        });
      } else {
        // Cerrar sin crear movimiento (solo auditoría)
        await marcarReembolsoSinMovimiento(idTransferencia, {
          fechaReembolso: opciones.fechaReembolso,
        });
      }
      setModalReembolso(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al marcar reembolso: ' + (e.message || 'Inténtalo de nuevo'));
      throw e;
    }
  };

  const handleAnular = async (idTransferencia) => {
    try {
      await anularTransferencia(idTransferencia);
      setConfirmAnular(null);
      setTransferenciaDetalle(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al anular: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  /* ── Render ── */

  if (loading) return <LoadingState message="Cargando transferencias..." />;

  return (
    <>
      <PageHeader
        title="Transferencias"
        description="Movimientos entre cuentas, préstamos internos y entregas de cierre."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
            Nueva transferencia
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Transferido este mes" value={kpis.totalMes} />
        <MetricCard
          label="Préstamos pendientes"
          value={kpis.totalPendientes}
          accent={kpis.countPendientes > 0 ? 'warning' : undefined}
          sublabel={kpis.countPendientes > 0
            ? `${kpis.countPendientes} préstamo${kpis.countPendientes !== 1 ? 's' : ''} sin devolver`
            : 'Todo al día'}
        />
        <MetricCard
          label="Cierres esta semana"
          value={kpis.cierresSemana}
          isMoney={false}
          sublabel="Entregas de tienda registradas"
        />
        <MetricCard
          label={kpis.saldoNetoLabel}
          value={kpis.saldoNetoValor}
          sublabel={kpis.saldoNetoSub}
        />
      </div>

      {/* ── ZONA PRIORITARIA: Préstamos pendientes ── */}
      {pendientesOrdenados.length > 0 && (
        <Card className="mb-4" padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon d={ICONS.alert} size={16} className="text-[#854d0e]" />
              <h2 className="text-[15px] text-[#1c1917]" style={{ fontWeight: 600 }}>
                Préstamos pendientes de devolución
              </h2>
              <Badge color="warning" size="sm">{pendientesOrdenados.length}</Badge>
            </div>
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Ordenados por antigüedad
            </p>
          </div>

          <div className="space-y-1.5">
            {pendientesOrdenados.map(p => (
              <PrestamoPendienteRow
                key={p.id_transferencia}
                prestamo={p}
                onMarcarReembolso={puedeCrear ? () => setModalReembolso(p) : null}
                onClick={() => setTransferenciaDetalle(p)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── HISTORIAL ── */}
      <Card padding="sm" className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-[160px]">
            <Select
              value={filtroMotivo}
              onChange={setFiltroMotivo}
              options={[{ value: '', label: 'Todos los motivos' }, ...MOTIVOS.map(m => ({ value: m.value, label: m.label }))]}
            />
          </div>
          <div className="w-[200px]">
            <Select
              value={filtroCuenta}
              onChange={setFiltroCuenta}
              options={[
                { value: '', label: 'Todas las cuentas' },
                ...cuentas.filter(c => c.activa).map(c => ({
                  value: c.id_cuenta,
                  label: c.nombre + (c.alias ? ` (${c.alias})` : ''),
                })),
              ]}
            />
          </div>
          <div className="w-[140px]">
            <Input type="date" value={filtroDesde} onChange={setFiltroDesde} placeholder="Desde" />
          </div>
          <div className="w-[140px]">
            <Input type="date" value={filtroHasta} onChange={setFiltroHasta} placeholder="Hasta" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="relative">
              <Icon d={ICONS.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar concepto, cuenta o nota"
                style={{ fontWeight: 400 }}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
              />
            </div>
          </div>
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-xs text-[#57534e] hover:text-[#1c1917] px-2 py-1 rounded hover:bg-[#f5f5f4]"
              style={{ fontWeight: 500 }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </Card>

      {transferenciasFiltradas.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.exchange}
            title={hayFiltros ? 'Sin coincidencias' : 'No hay transferencias todavía'}
            description={hayFiltros
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Cuando muevas dinero entre cuentas, las transferencias aparecerán aquí.'}
            action={puedeCrear && !hayFiltros && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                Crear primera transferencia
              </Button>
            )}
          />
        </Card>
      ) : (
        <Card padding="sm">
          <div className="space-y-0.5">
            {transferenciasFiltradas.map(t => (
              <TransferenciaRow
                key={t.id_transferencia}
                transferencia={t}
                onClick={() => setTransferenciaDetalle(t)}
              />
            ))}
          </div>
          {transferenciasFiltradas.length >= 200 && (
            <p className="text-[11px] text-[#a8a29e] text-center mt-3" style={{ fontWeight: 400 }}>
              Mostrando las primeras 200 transferencias. Usa filtros para acotar.
            </p>
          )}
        </Card>
      )}

      {/* ── Modal: crear ── */}
      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nueva transferencia"
        size="lg"
      >
        <FormTransferencia
          cuentas={cuentas}
          personas={personas}
          usuario={usuario}
          onSubmit={handleCrear}
          onCancel={() => setModalCrear(false)}
        />
      </Modal>

      {/* ── Modal: detalle ── */}
      {transferenciaDetalle && (
        <Modal
          open={true}
          onClose={() => setTransferenciaDetalle(null)}
          title="Detalle de transferencia"
          size="lg"
        >
          <DetalleTransferencia
            transferencia={transferenciaDetalle}
            puedeAnular={puedeModif}
            onAnular={() => setConfirmAnular(transferenciaDetalle)}
            onMarcarReembolso={puedeCrear ? () => {
              setModalReembolso(transferenciaDetalle);
              setTransferenciaDetalle(null);
            } : null}
          />
        </Modal>
      )}

      {/* ── Modal: marcar reembolso ── */}
      {modalReembolso && (
        <Modal
          open={true}
          onClose={() => setModalReembolso(null)}
          title="Marcar préstamo como reembolsado"
          size="md"
        >
          <FormMarcarReembolso
            prestamo={modalReembolso}
            usuario={usuario}
            onSubmit={(opciones) => handleReembolso(modalReembolso.id_transferencia, opciones)}
            onCancel={() => setModalReembolso(null)}
          />
        </Modal>
      )}

      {/* ── Modal: confirmar anular ── */}
      {confirmAnular && (
        <Modal
          open={true}
          onClose={() => setConfirmAnular(null)}
          title="Anular transferencia"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmAnular(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleAnular(confirmAnular.id_transferencia)}>
                Anular
              </Button>
            </>
          }
        >
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres anular esta transferencia de{' '}
            <span style={{ fontWeight: 500, color: '#1c1917' }}>{formatMoney(confirmAnular.monto)}</span>?
          </p>
          <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
            Los movimientos vinculados se eliminarán y los saldos de las cuentas se revertirán automáticamente.
            Esta acción queda registrada en auditoría.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   PrestamoPendienteRow - destacada en zona prioritaria
   ══════════════════════════════════════════════════════════════════════════ */

function PrestamoPendienteRow({ prestamo, onMarcarReembolso, onClick }) {
  const dias = prestamo._dias;
  const color = colorPrestamoPorDias(dias);
  const venceEn = prestamo.fecha_reembolso_esperada
    ? diasEntre(new Date(prestamo.fecha_reembolso_esperada), new Date())
    : null;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer group transition-colors"
      style={{ backgroundColor: color.bg, borderColor: color.border + '40' }}
      onClick={onClick}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color.border }} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
            {prestamo.origen?.nombre || '—'}
            {' '}
            <span className="text-[#a8a29e]">→</span>
            {' '}
            {prestamo.destino?.nombre || '—'}
          </p>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'white', color: color.text, fontWeight: 500 }}>
            {color.label}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] fin-num" style={{ fontWeight: 500, color: color.text }}>
            {dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}
          </span>
          {venceEn !== null && (
            <span className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
              · {venceEn < 0
                  ? `vencido hace ${Math.abs(venceEn)}d`
                  : venceEn === 0
                    ? 'vence hoy'
                    : `vence en ${venceEn}d`}
            </span>
          )}
          {prestamo.concepto && (
            <span className="text-[11px] text-[#57534e] truncate" style={{ fontWeight: 400 }}>
              · {prestamo.concepto}
            </span>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm fin-num" style={{ fontWeight: 600, color: color.text }}>
          {formatMoney(prestamo.monto)}
        </p>
      </div>

      {onMarcarReembolso && (
        <button
          onClick={e => { e.stopPropagation(); onMarcarReembolso(); }}
          className="px-3 py-1.5 rounded-lg text-xs bg-white border text-[#1c1917] hover:bg-[#fafaf9] transition-colors flex-shrink-0"
          style={{ fontWeight: 500, borderColor: color.border + '60' }}
        >
          Marcar devuelto
        </button>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   TransferenciaRow - fila densa del historial
   ══════════════════════════════════════════════════════════════════════════ */

function TransferenciaRow({ transferencia, onClick }) {
  const t = transferencia;
  const anulada = t.estado === 'anulada';
  const reembolsoYa = t.reembolsado;
  const esPendiente = t.es_reembolsable && !t.reembolsado && !anulada;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#fafaf9] transition-colors cursor-pointer ${anulada ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div className="w-9 flex-shrink-0 text-[11px] text-[#a8a29e] fin-num text-center" style={{ fontWeight: 400 }}>
        {formatDate(t.fecha)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-[#1c1917] truncate" style={{ fontWeight: 500 }}>
            {t.origen?.nombre || '—'}
            <span className="text-[#a8a29e] mx-1.5">→</span>
            {t.destino?.nombre || '—'}
          </p>
          <Badge color={motivoColor(t.motivo)} size="sm">{motivoLabel(t.motivo)}</Badge>
          {anulada && <Badge color="gray" size="sm">Anulada</Badge>}
          {esPendiente && <Badge color="warning" size="sm">Pendiente</Badge>}
          {reembolsoYa && <Badge color="success" size="sm">Reembolsado</Badge>}
        </div>
        {t.concepto && (
          <p className="text-[11px] text-[#a8a29e] truncate mt-0.5" style={{ fontWeight: 400 }}>
            {t.concepto}
          </p>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <p className={`text-sm fin-num ${anulada ? 'line-through text-[#a8a29e]' : 'text-[#1c1917]'}`}
           style={{ fontWeight: 500 }}>
          {formatMoney(t.monto)}
        </p>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormTransferencia - crear nueva
   ══════════════════════════════════════════════════════════════════════════ */

function FormTransferencia({ cuentas, personas, usuario, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    motivo: 'transferencia',
    id_cuenta_origen: null,
    id_cuenta_destino: null,
    monto: 0,
    concepto: '',
    es_reembolsable: false,
    fecha_reembolso_esperada: '',
    id_persona_origen: usuario?.id_persona || null,
    id_persona_destino: null,
  });
  const [guardando, setGuardando] = useState(false);
  const [errs, setErrs] = useState({});

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  /* Si el motivo es préstamo interno, asumir reembolsable por default */
  useEffect(() => {
    if (form.motivo === 'prestamo_interno' && !form.es_reembolsable) {
      setF('es_reembolsable', true);
    }
    if (form.motivo !== 'prestamo_interno' && form.es_reembolsable) {
      setF('es_reembolsable', false);
      setF('fecha_reembolso_esperada', '');
    }
  }, [form.motivo]);

  const cuentasActivas = cuentas.filter(c => c.activa);
  const cuentaOrigen = cuentas.find(c => c.id_cuenta === form.id_cuenta_origen);
  const saldoOrigen = Number(cuentaOrigen?.saldo_actual) || 0;
  const monto = Number(form.monto) || 0;
  const sobregira = form.id_cuenta_origen && monto > saldoOrigen;

  const validar = () => {
    const e = {};
    if (!form.motivo) e.motivo = 'Requerido';
    if (!form.id_cuenta_origen) e.origen = 'Requerido';
    if (!form.id_cuenta_destino) e.destino = 'Requerido';
    if (form.id_cuenta_origen && form.id_cuenta_destino && form.id_cuenta_origen === form.id_cuenta_destino) {
      e.destino = 'Origen y destino deben ser distintos';
    }
    if (monto <= 0) e.monto = 'Debe ser mayor a 0';
    if (form.es_reembolsable && form.fecha_reembolso_esperada) {
      const fr = new Date(form.fecha_reembolso_esperada);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      if (fr < hoy) e.fecha_reembolso_esperada = 'Debe ser una fecha futura';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      await onSubmit({
        origen: form.id_cuenta_origen,
        destino: form.id_cuenta_destino,
        monto,
        motivo: form.motivo,
        concepto: form.concepto?.trim() || null,
        idPersonaOrigen: form.id_persona_origen || null,
        idPersonaDestino: form.id_persona_destino || null,
        esReembolsable: form.es_reembolsable,
        fechaReembolsoEsperada: form.fecha_reembolso_esperada || null,
      });
    } catch (e) {
      // padre muestra alert
    } finally {
      setGuardando(false);
    }
  };

  const opcionesCuenta = (excluirId) => [
    { value: '', label: '— Elegir cuenta —' },
    ...cuentasActivas
      .filter(c => c.id_cuenta !== excluirId)
      .map(c => ({
        value: c.id_cuenta,
        label: `${c.nombre}${c.alias ? ` (${c.alias})` : ''} — ${formatMoney(c.saldo_actual)}`,
      })),
  ];

  return (
    <div>
      <Field label="Motivo" required error={errs.motivo}>
        <Select
          value={form.motivo}
          onChange={v => setF('motivo', v)}
          options={MOTIVOS.filter(m => m.value !== 'reembolso_prestamo').map(m => ({ value: m.value, label: m.label }))}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Desde (origen)" required error={errs.origen}>
          <Select
            value={form.id_cuenta_origen || ''}
            onChange={v => setF('id_cuenta_origen', v ? Number(v) : null)}
            options={opcionesCuenta(form.id_cuenta_destino)}
          />
        </Field>

        <Field label="Hacia (destino)" required error={errs.destino}>
          <Select
            value={form.id_cuenta_destino || ''}
            onChange={v => setF('id_cuenta_destino', v ? Number(v) : null)}
            options={opcionesCuenta(form.id_cuenta_origen)}
          />
        </Field>
      </div>

      <Field label="Monto" required error={errs.monto}
             hint={cuentaOrigen ? `Saldo en ${cuentaOrigen.nombre}: ${formatMoney(saldoOrigen)}` : null}>
        <MoneyInput value={form.monto} onChange={v => setF('monto', v || 0)} />
      </Field>

      {sobregira && (
        <div className="-mt-2 mb-4 p-2 rounded-lg bg-[#fef3c7] border border-[#fcd34d] text-[11px] text-[#854d0e]" style={{ fontWeight: 400 }}>
          <span style={{ fontWeight: 500 }}>Atención:</span> el monto excede el saldo actual de la cuenta de origen.
          La transferencia se registrará igual y la cuenta quedará en negativo.
        </div>
      )}

      <Field label="Concepto" hint="Descripción breve, ej: 'Compra de cuero para pedido del lunes'">
        <Input
          value={form.concepto}
          onChange={v => setF('concepto', v)}
          placeholder="Concepto de la transferencia"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Entregado por" hint="Persona del lado origen">
          <Select
            value={form.id_persona_origen || ''}
            onChange={v => setF('id_persona_origen', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin especificar —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>

        <Field label="Recibido por" hint="Persona del lado destino">
          <Select
            value={form.id_persona_destino || ''}
            onChange={v => setF('id_persona_destino', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin especificar —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>
      </div>

      {/* Préstamo reembolsable */}
      {form.motivo === 'prestamo_interno' && (
        <div className="mt-3 p-3 bg-[#fef9c3] border border-[#fde68a] rounded-lg">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.es_reembolsable}
              onChange={e => setF('es_reembolsable', e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-sm text-[#854d0e]" style={{ fontWeight: 500 }}>
                Marcar como reembolsable
              </p>
              <p className="text-[11px] text-[#a16207]" style={{ fontWeight: 400 }}>
                Aparecerá en la zona de "Préstamos pendientes" hasta que se marque como devuelto.
              </p>
            </div>
          </label>

          {form.es_reembolsable && (
            <div className="mt-3">
              <Field label="Fecha esperada de devolución" hint="Opcional. Solo para tracking." error={errs.fecha_reembolso_esperada}>
                <Input
                  type="date"
                  value={form.fecha_reembolso_esperada}
                  onChange={v => setF('fecha_reembolso_esperada', v)}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Registrando...</> : 'Registrar transferencia'}
        </Button>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   DetalleTransferencia
   ══════════════════════════════════════════════════════════════════════════ */

function DetalleTransferencia({ transferencia, puedeAnular, onAnular, onMarcarReembolso }) {
  const t = transferencia;
  const anulada = t.estado === 'anulada';
  const esPendiente = t.es_reembolsable && !t.reembolsado && !anulada;

  return (
    <div>
      {/* Header visual: origen → destino */}
      <div className="flex items-center justify-center gap-4 py-4 border-b border-[#f5f5f4]">
        <div className="text-center flex-1 min-w-0">
          <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Desde</p>
          <p className="text-sm text-[#1c1917] truncate" style={{ fontWeight: 500 }}>{t.origen?.nombre || '—'}</p>
          {t.origen?.alias && (
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>{t.origen.alias}</p>
          )}
        </div>

        <div className="flex flex-col items-center flex-shrink-0">
          <Icon d={ICONS.arrowRight} size={20} className="text-[#a8a29e]" />
          <p className="text-xl text-[#1c1917] fin-num mt-1" style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>
            {formatMoney(t.monto)}
          </p>
        </div>

        <div className="text-center flex-1 min-w-0">
          <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Hacia</p>
          <p className="text-sm text-[#1c1917] truncate" style={{ fontWeight: 500 }}>{t.destino?.nombre || '—'}</p>
          {t.destino?.alias && (
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>{t.destino.alias}</p>
          )}
        </div>
      </div>

      {/* Badges de estado */}
      <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
        <Badge color={motivoColor(t.motivo)} size="md">{motivoLabel(t.motivo)}</Badge>
        {anulada && <Badge color="gray" size="md">Anulada</Badge>}
        {esPendiente && <Badge color="warning" size="md">Pendiente de reembolso</Badge>}
        {t.reembolsado && <Badge color="success" size="md">Reembolsado</Badge>}
      </div>

      {/* Datos */}
      <div className="space-y-2.5 mt-5">
        <DetalleField label="Fecha" value={formatDate(t.fecha)} />
        {t.concepto && <DetalleField label="Concepto" value={t.concepto} />}
        {t.persona_origen && <DetalleField label="Entregado por" value={t.persona_origen.nombre} />}
        {t.persona_destino && <DetalleField label="Recibido por" value={t.persona_destino.nombre} />}
        {t.fecha_reembolso_esperada && (
          <DetalleField label="Devolución esperada" value={formatDate(t.fecha_reembolso_esperada)} />
        )}
        {t.fecha_reembolso_real && (
          <DetalleField label="Devuelto el" value={formatDate(t.fecha_reembolso_real)} />
        )}
        <DetalleField label="ID" value={`#${t.id_transferencia}`} />
      </div>

      {t.notas && (
        <div className="mt-4">
          <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-1.5" style={{ fontWeight: 500 }}>Notas</p>
          <p className="text-sm text-[#1c1917] bg-[#fafaf9] rounded-lg p-3" style={{ fontWeight: 400 }}>{t.notas}</p>
        </div>
      )}

      {/* Acciones */}
      {!anulada && (
        <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
          {onMarcarReembolso && esPendiente && (
            <Button variant="primary" icon={ICONS.check} onClick={onMarcarReembolso}>
              Marcar como reembolsado
            </Button>
          )}
          {puedeAnular && !t.reembolsado && (
            <Button variant="danger" icon={ICONS.trash} onClick={onAnular}>
              Anular transferencia
            </Button>
          )}
          {puedeAnular && t.reembolsado && (
            <p className="text-[11px] text-[#a8a29e] text-center" style={{ fontWeight: 400 }}>
              No se puede anular: ya tiene reembolso vinculado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DetalleField({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[#a8a29e] uppercase tracking-wider" style={{ fontWeight: 500 }}>{label}</span>
      <span className="text-sm text-[#1c1917] fin-num text-right" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormMarcarReembolso
   ══════════════════════════════════════════════════════════════════════════ */

function FormMarcarReembolso({ prestamo, usuario, onSubmit, onCancel }) {
  const [crearMovimiento, setCrearMovimiento] = useState(true);
  const [fechaReembolso, setFechaReembolso] = useState(new Date().toISOString().slice(0, 10));
  const [conceptoReembolso, setConceptoReembolso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async () => {
    setGuardando(true);
    try {
      await onSubmit({
        crearMovimiento,
        fechaReembolso,
        conceptoReembolso: conceptoReembolso.trim() || null,
        idPersonaOrigen: usuario?.id_persona || null,
        idPersonaDestino: prestamo.id_persona_origen || null,
      });
    } catch (e) {
      // padre muestra alert
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="bg-[#fafaf9] rounded-lg p-3 mb-4">
        <p className="text-xs text-[#a8a29e] uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>Préstamo original</p>
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
            {prestamo.origen?.nombre} <span className="text-[#a8a29e]">→</span> {prestamo.destino?.nombre}
          </p>
          <p className="text-base text-[#1c1917] fin-num" style={{ fontWeight: 600 }}>{formatMoney(prestamo.monto)}</p>
        </div>
        {prestamo.concepto && (
          <p className="text-[11px] text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>{prestamo.concepto}</p>
        )}
        <p className="text-[11px] text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>
          Otorgado el {formatDate(prestamo.fecha)}
        </p>
      </div>

      <Field label="Fecha de devolución" required>
        <Input type="date" value={fechaReembolso} onChange={setFechaReembolso} />
      </Field>

      {/* Toggle: crear movimiento real o solo cerrar */}
      <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
        <p className="text-xs text-[#57534e] uppercase tracking-wider mb-3" style={{ fontWeight: 500 }}>
          ¿Cómo quieres registrarlo?
        </p>

        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input
            type="radio"
            name="modo_reembolso"
            checked={crearMovimiento}
            onChange={() => setCrearMovimiento(true)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
              Crear transferencia inversa (recomendado)
            </p>
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Se crea una transferencia de {prestamo.destino?.nombre} → {prestamo.origen?.nombre} por {formatMoney(prestamo.monto)}.
              Los saldos de las cuentas se actualizan automáticamente.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="modo_reembolso"
            checked={!crearMovimiento}
            onChange={() => setCrearMovimiento(false)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
              Solo cerrar el caso (sin movimiento)
            </p>
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Marca el préstamo como reembolsado pero no crea ninguna transferencia.
              Útil cuando el dinero ya volvió por otro medio o cuando no se va a devolver formalmente.
              Los saldos NO se modifican.
            </p>
          </div>
        </label>
      </div>

      {crearMovimiento && (
        <Field label="Concepto del reembolso" hint={`Por defecto: "Reembolso de: ${prestamo.concepto || 'préstamo interno'}"`}>
          <Input
            value={conceptoReembolso}
            onChange={setConceptoReembolso}
            placeholder="Concepto opcional"
          />
        </Field>
      )}

      {!crearMovimiento && (
        <div className="p-3 rounded-lg bg-[#fef9c3] border border-[#fde68a] mb-4">
          <p className="text-[11px] text-[#854d0e]" style={{ fontWeight: 500 }}>
            Atención: este modo no afecta saldos. Úsalo solo si las cuentas ya están cuadradas por otro lado.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Procesando...</> : 'Confirmar reembolso'}
        </Button>
      </div>
    </div>
  );
}