import React, { useState, useEffect, useMemo } from 'react';
import {
  listarDeudas, obtenerDeuda, crearDeuda, actualizarDeuda, archivarDeuda,
  pagarDeuda, listarPagosDeuda, listarEventosDeuda, registrarEventoDeuda,
  listarCuentas, listarPersonasConAccesoFinanzas,
} from '../api/finanzasClient';
import {
  formatMoney, formatDate, formatPercent, calcularCuotaFrancesa,
  generarCronograma, generarCronogramaDinamico, teaToTem,
  calcularProgresoDeuda, calcularSemaforo, SEMAFORO_COLORS,
  calcularProximoVencimiento, tceaEfectiva, costoFinancieroDiario,
} from '../lib/calculos';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, MetricCard, Badge, Button, Modal, Field, Input, Select,
  MoneyInput, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';
import MapaDeudas from './MapaDeudas';

/* ──────────────────────────────────────────────────────────────────────────
   DEUDAS — Bloque 3.3
   ──────────────────────────────────────────────────────────────────────────
   Estructura del archivo:

     export default Deudas              ← container principal
     ├─ DeudaRow                        ← fila de la tabla
     ├─ ModalCrearDeuda                 ← creación / edición rápida
     ├─ ModalDetalleDeuda               ← detalle con 4 tabs
     │   ├─ TabInfo
     │   ├─ TabCronograma               ← amortización francesa cuota a cuota
     │   ├─ TabPagos                    ← historial real desde movimientos
     │   └─ TabConfig                   ← refinanciar / archivar / asignar reserva
     └─ ModalPagarDeuda                 ← registro de pago capital/interés + splits

   Decisiones:
     - Capital/interés se sugieren desde el cronograma teórico de la cuota
       actual, pero son siempre editables (modo híbrido).
     - El modal de pago soporta cuenta única o split multi-cuenta vía toggle.
     - Refinanciación queda registrada como deuda_evento + actualización
       atómica de la deuda. Sin perder histórico.
   ────────────────────────────────────────────────────────────────────────── */


/* ──────────────────────────────────────────────────────────────────────────
   CONSTANTES
   ────────────────────────────────────────────────────────────────────────── */

const TIPOS_ACREEDOR = [
  { value: 'banco',       label: 'Banco' },
  { value: 'caja',        label: 'Caja municipal' },
  { value: 'financiera',  label: 'Financiera' },
  { value: 'prestamista', label: 'Prestamista' },
  { value: 'familiar',    label: 'Familiar' },
  { value: 'proveedor',   label: 'Proveedor' },
  { value: 'otro',        label: 'Otro' },
];

const FRECUENCIAS_CUOTA = [
  { value: 'mensual',    label: 'Mensual' },
  { value: 'diaria',     label: 'Diaria' },
  { value: 'semanal',    label: 'Semanal' },
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'variable',   label: 'Variable' },
  { value: 'unica',      label: 'Pago único' },
];

const ESTADOS_FILTRO = [
  { value: 'activa',       label: 'Activas' },
  { value: 'pagada',       label: 'Pagadas' },
  { value: 'refinanciada', label: 'Refinanciadas' },
  { value: 'en_mora',      label: 'En mora' },
  { value: 'pausada',      label: 'Pausadas' },
  { value: 'cancelada',    label: 'Canceladas' },
];

const COLOR_ESTADO = {
  activa:       'gray',
  pagada:       'success',
  refinanciada: 'info',
  en_mora:      'danger',
  pausada:      'warning',
  cancelada:    'gray',
};


/* ──────────────────────────────────────────────────────────────────────────
   HELPERS DE CÁLCULO ESPECÍFICOS DE DEUDAS
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Sugerencia capital/interés para el próximo pago, basada en el saldo actual
 * y el cronograma francés. Si la deuda tiene 0% TEA, todo es capital.
 * Si no hay datos suficientes, devuelve { capital: monto, interes: 0 }.
 */
function sugerirCapitalInteres(deuda, monto) {
  const m = Number(monto) || 0;
  if (m <= 0) return { capital: 0, interes: 0 };
  const tea = Number(deuda?.tea_pct) || 0;
  const saldo = Number(deuda?.saldo_actual) || 0;
  if (tea === 0 || saldo <= 0) return { capital: m, interes: 0 };

  // Interés del periodo actual sobre saldo pendiente
  const tem = teaToTem(tea);
  const interes = Math.min(m, +(saldo * tem).toFixed(2));
  const capital = +(m - interes).toFixed(2);
  return { capital, interes };
}

function calcularCargaDiaria(deuda) {
  const cuota = Number(deuda?.cuota_monto) || 0;
  if (!cuota) return 0;
  switch (deuda.frecuencia_cuota) {
    case 'diaria':    return cuota;
    case 'semanal':   return cuota / 7;
    case 'quincenal': return cuota / 15;
    case 'mensual':   return cuota / 30;
    default:          return 0;
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function Deudas({ usuario }) {
  const [deudas, setDeudas]       = useState([]);
  const [cuentas, setCuentas]     = useState([]);
  const [personas, setPersonas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('activa');
  const [busqueda, setBusqueda]   = useState('');

  const [modalCrear, setModalCrear]       = useState(false);
  const [deudaDetalle, setDeudaDetalle]   = useState(null);
  const [modalPagar, setModalPagar]       = useState(null);
  const [confirmArchivar, setConfirmArchivar] = useState(null);
  const [mapaAbierto, setMapaAbierto]     = useState(false);

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [ds, cs, ps] = await Promise.all([
        listarDeudas({ estado: estadoFiltro }),
        listarCuentas(),
        listarPersonasConAccesoFinanzas(),
      ]);
      setDeudas(ds);
      setCuentas(cs);
      setPersonas(ps);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar deudas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [estadoFiltro]);

  /* Recargar la deuda del modal detalle si los datos cambian */
  const recargarDetalle = async () => {
    if (!deudaDetalle) return;
    try {
      const fresca = await obtenerDeuda(deudaDetalle.id_deuda);
      setDeudaDetalle(fresca);
    } catch (e) { console.error(e); }
  };

  /* ── KPIs ── */

  const kpis = useMemo(() => {
    const activas = deudas.filter(d => d.estado === 'activa');
    const totalDeuda    = activas.reduce((s, d) => s + (Number(d.saldo_actual) || 0), 0);
    const cuotaMensual  = activas
      .filter(d => d.frecuencia_cuota === 'mensual')
      .reduce((s, d) => s + (Number(d.cuota_monto) || 0), 0);
    const cargaDiaria   = activas.reduce((s, d) => s + calcularCargaDiaria(d), 0);

    let masCara = null;
    let mayorTea = -1;
    activas.forEach(d => {
      const tea = Number(d.tea_pct) || 0;
      if (tea > mayorTea) { mayorTea = tea; masCara = d; }
    });

    let proxima = null;
    let menosDias = Infinity;
    activas.forEach(d => {
      const v = calcularProximoVencimiento(d);
      if (v && v.dias < menosDias) { menosDias = v.dias; proxima = { ...d, _venc: v }; }
    });

    return { totalDeuda, cuotaMensual, cargaDiaria, masCara, proxima };
  }, [deudas]);

  /* ── Filtro de búsqueda ── */

  const deudasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return deudas;
    const q = busqueda.toLowerCase();
    return deudas.filter(d =>
      d.nombre?.toLowerCase().includes(q) ||
      d.acreedor?.toLowerCase().includes(q) ||
      d.codigo?.toLowerCase().includes(q)
    );
  }, [deudas, busqueda]);

  /* ── Handlers ── */

  const handleCrear = async (payload) => {
    try {
      await crearDeuda(payload);
      setModalCrear(false);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al crear deuda: ' + (e.message || 'Inténtalo de nuevo'));
      throw e;
    }
  };

  const handleActualizar = async (idDeuda, cambios, evento = null) => {
    try {
      await actualizarDeuda(idDeuda, cambios);
      if (evento) {
        await registrarEventoDeuda({
          idDeuda,
          tipoEvento: evento.tipo,
          montoAfectado: evento.monto || null,
          descripcion: evento.descripcion || null,
          datosAntes: evento.antes || null,
          datosDespues: evento.despues || null,
          registradoPor: usuario?.id_persona || null,
        });
      }
      await cargar();
      await recargarDetalle();
    } catch (e) {
      console.error(e);
      alert('Error al actualizar: ' + (e.message || 'Inténtalo de nuevo'));
      throw e;
    }
  };

  const handlePagar = async (payload) => {
    try {
      await pagarDeuda(payload);
      setModalPagar(null);
      await cargar();
      await recargarDetalle();
    } catch (e) {
      console.error(e);
      alert('Error al registrar pago: ' + (e.message || 'Inténtalo de nuevo'));
      throw e;
    }
  };

  const handleArchivar = async (idDeuda) => {
    try {
      await archivarDeuda(idDeuda);
      setConfirmArchivar(null);
      setDeudaDetalle(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al archivar: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  /* ── Render ── */

  if (loading) return <LoadingState message="Cargando deudas..." />;

  return (
    <>
      <PageHeader
        title="Deudas"
        description="Compromisos de pago activos. Cronograma, pagos e intereses."
        actions={
          <div className="flex items-center gap-2">
            {deudas.length > 0 && (
              <Button icon={ICONS.dashboard} onClick={() => setMapaAbierto(true)}>
                Ver mapa de deudas
              </Button>
            )}
            {puedeCrear && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                Nueva deuda
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <MetricCard label="Deuda total" value={kpis.totalDeuda} accent="danger" />
        <MetricCard label="Cuota mensual" value={kpis.cuotaMensual}
                    sublabel="Suma de cuotas de frecuencia mensual" />
        <MetricCard label="Carga diaria" value={kpis.cargaDiaria}
                    sublabel="Promedio diario de obligaciones" />
        <MetricCard
          label="Próximo pago"
          value={kpis.proxima ? Number(kpis.proxima.cuota_monto || 0) : 0}
          sublabel={kpis.proxima
            ? `${kpis.proxima.nombre} · ${
                kpis.proxima._venc.dias === 0 ? 'hoy'
                : kpis.proxima._venc.dias === 1 ? 'mañana'
                : `en ${kpis.proxima._venc.dias} días`
              }`
            : 'Sin vencimientos'}
          accent={kpis.proxima && kpis.proxima._venc.dias <= 3 ? 'danger'
                : kpis.proxima && kpis.proxima._venc.dias <= 10 ? 'warning'
                : undefined}
        />
      </div>

      {kpis.masCara && Number(kpis.masCara.tea_pct) > 0 && (
        <div className="mb-6 p-3 rounded-lg bg-[#fef9c3] border border-[#fde68a] flex items-start gap-3">
          <Icon d={ICONS.alert} size={16} className="text-[#854d0e] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[#854d0e]" style={{ fontWeight: 400 }}>
            <span style={{ fontWeight: 500 }}>Atención:</span>{' '}
            <span style={{ fontWeight: 500 }}>{kpis.masCara.nombre}</span> es la deuda más cara con TEA de{' '}
            <span className="fin-num" style={{ fontWeight: 500 }}>{formatPercent(kpis.masCara.tea_pct, { decimals: 2 })}</span>.
            Considera priorizarla en los pagos.
          </div>
        </div>
      )}

      {/* ── Filtros / búsqueda ── */}
      <Card padding="sm" className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {ESTADOS_FILTRO.map(e => (
              <button
                key={e.value}
                onClick={() => setEstadoFiltro(e.value)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  estadoFiltro === e.value
                    ? 'bg-[#1c1917] text-white'
                    : 'text-[#57534e] hover:bg-[#f5f5f4]'
                }`}
                style={{ fontWeight: 500 }}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <Icon d={ICONS.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, acreedor o código"
                style={{ fontWeight: 400 }}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ── Lista de deudas ── */}
      {deudasFiltradas.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.coins}
            title={busqueda ? 'Sin coincidencias' : 'No hay deudas en este estado'}
            description={busqueda
              ? 'Prueba con otros términos de búsqueda.'
              : estadoFiltro === 'activa'
                ? 'Cuando registres una deuda, aparecerá aquí con su cronograma y vencimientos.'
                : 'Cambia el filtro de estado para ver otras deudas.'}
            action={puedeCrear && estadoFiltro === 'activa' && !busqueda && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                Crear primera deuda
              </Button>
            )}
          />
        </Card>
      ) : (
        <Card padding="sm">
          <div className="space-y-0.5">
            {deudasFiltradas.map(d => (
              <DeudaRow
                key={d.id_deuda}
                deuda={d}
                onClick={() => setDeudaDetalle(d)}
                onPagar={puedeCrear ? () => setModalPagar(d) : null}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Modal: crear deuda ── */}
      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nueva deuda"
        size="lg"
      >
        <FormDeuda
          cuentas={cuentas}
          personas={personas}
          onSubmit={handleCrear}
          onCancel={() => setModalCrear(false)}
        />
      </Modal>

      {/* ── Modal: detalle de deuda ── */}
      {deudaDetalle && (
        <Modal
          open={true}
          onClose={() => setDeudaDetalle(null)}
          title={deudaDetalle.nombre}
          size="xl"
        >
          <DetalleDeuda
            deuda={deudaDetalle}
            cuentas={cuentas}
            personas={personas}
            puedeEditar={puedeModif}
            puedePagar={puedeCrear}
            onActualizar={(cambios, evento) => handleActualizar(deudaDetalle.id_deuda, cambios, evento)}
            onPagar={() => setModalPagar(deudaDetalle)}
            onArchivar={() => setConfirmArchivar(deudaDetalle)}
            usuario={usuario}
          />
        </Modal>
      )}

      {/* ── Modal: pagar deuda ── */}
      {modalPagar && (
        <Modal
          open={true}
          onClose={() => setModalPagar(null)}
          title={`Pagar — ${modalPagar.nombre}`}
          size="lg"
        >
          <FormPagarDeuda
            deuda={modalPagar}
            cuentas={cuentas}
            usuario={usuario}
            onSubmit={handlePagar}
            onCancel={() => setModalPagar(null)}
          />
        </Modal>
      )}

      {/* ── Modal: confirmar archivar ── */}
      {confirmArchivar && (
        <Modal
          open={true}
          onClose={() => setConfirmArchivar(null)}
          title="Archivar deuda"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmArchivar(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleArchivar(confirmArchivar.id_deuda)}>
                Archivar
              </Button>
            </>
          }
        >
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres archivar <span style={{ fontWeight: 500, color: '#1c1917' }}>{confirmArchivar.nombre}</span>?
          </p>
          <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
            La deuda pasa a estado "cancelada". Los pagos históricos se conservan.
          </p>
        </Modal>
      )}

      {/* ── Mapa de deudas (vista completa) ── */}
      {mapaAbierto && (
        <MapaDeudas
          deudas={deudas}
          cuentas={cuentas}
          onClose={() => setMapaAbierto(false)}
          onAbrirDeuda={(d) => {
            setMapaAbierto(false);
            setDeudaDetalle(d);
          }}
          onPagarDeuda={puedeCrear ? (d) => {
            setMapaAbierto(false);
            setModalPagar(d);
          } : null}
        />
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   DeudaRow - fila resumen
   ══════════════════════════════════════════════════════════════════════════ */

function DeudaRow({ deuda, onClick, onPagar }) {
  const venc = calcularProximoVencimiento(deuda);
  const sem = SEMAFORO_COLORS[venc ? calcularSemaforo(venc.dias) : 'gris'];
  const progreso = calcularProgresoDeuda(deuda);
  const tea = Number(deuda.tea_pct) || 0;

  return (
    <div
      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#fafaf9] transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sem.border }} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-[#1c1917] truncate" style={{ fontWeight: 500 }}>{deuda.nombre}</p>
          <Badge color={COLOR_ESTADO[deuda.estado] || 'gray'} size="sm">{deuda.estado}</Badge>
          {tea > 0 && (
            <span className="text-[11px] text-[#57534e] fin-num" style={{ fontWeight: 500 }}>
              TEA {formatPercent(tea, { decimals: 1 })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>{deuda.acreedor}</span>
          {venc && (
            <span className="text-[11px] fin-num" style={{ fontWeight: 500, color: sem.text }}>
              · {venc.dias === 0 ? 'vence hoy'
                : venc.dias === 1 ? 'vence mañana'
                : venc.dias < 0 ? `vencida hace ${Math.abs(venc.dias)}d`
                : `en ${venc.dias} días`}
            </span>
          )}
          {Number(deuda.cuota_monto) > 0 && (
            <span className="text-[11px] text-[#a8a29e] fin-num" style={{ fontWeight: 400 }}>
              · cuota {formatMoney(deuda.cuota_monto)}
            </span>
          )}
        </div>
        {progreso && Number(deuda.monto_original) > 0 && (
          <div className="mt-2 h-1 bg-[#f5f5f4] rounded-full overflow-hidden max-w-[280px]">
            <div
              className="h-full bg-[#1c1917] transition-all"
              style={{ width: `${Math.min(100, progreso.pct_pagado * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm text-[#1c1917] fin-num" style={{ fontWeight: 500 }}>
          {formatMoney(deuda.saldo_actual)}
        </p>
        <p className="text-[11px] text-[#a8a29e] fin-num mt-0.5" style={{ fontWeight: 400 }}>
          de {formatMoney(deuda.monto_original)}
        </p>
      </div>

      {onPagar && (
        <button
          onClick={e => { e.stopPropagation(); onPagar(); }}
          className="px-3 py-1.5 rounded-lg text-xs bg-[#1c1917] text-white hover:bg-[#292524] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          style={{ fontWeight: 500 }}
        >
          Pagar
        </button>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormDeuda - creación / edición
   ══════════════════════════════════════════════════════════════════════════ */

function FormDeuda({ cuentas, personas, valoresIniciales, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    acreedor: '',
    tipo_acreedor: 'banco',
    id_responsable: null,
    monto_original: 0,
    moneda: 'PEN',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    plazo_meses: 12,
    tea_pct: 0,
    tcea_pct: null,
    cuota_monto: 0,
    frecuencia_cuota: 'mensual',
    dia_pago_mes: 1,
    dia_pago_semana: null,
    id_cuenta_reserva: null,
    estado: 'activa',
    numero_contrato: '',
    notas: '',
    comision_mensual: null,
    seguro_mensual: null,
    portes_mensual: null,
    itf_pct: null,
    otros_cargos_mensual: null,
    ...(valoresIniciales || {}),
  });
  const [guardando, setGuardando] = useState(false);
  const [errs, setErrs] = useState({});
  const [autoCuota, setAutoCuota] = useState(true);
  const [mostrarCargos, setMostrarCargos] = useState(
    !!(valoresIniciales && (
      valoresIniciales.tcea_pct || valoresIniciales.comision_mensual ||
      valoresIniciales.seguro_mensual || valoresIniciales.portes_mensual ||
      valoresIniciales.itf_pct || valoresIniciales.otros_cargos_mensual
    ))
  );

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  /* Auto-calcular cuota cuando cambian monto/plazo/TEA */
  useEffect(() => {
    if (!autoCuota) return;
    if (form.frecuencia_cuota !== 'mensual') return;
    const cuota = calcularCuotaFrancesa(
      Number(form.monto_original) || 0,
      Number(form.tea_pct) || 0,
      Number(form.plazo_meses) || 0,
    );
    setF('cuota_monto', +cuota.toFixed(2));
  }, [form.monto_original, form.tea_pct, form.plazo_meses, form.frecuencia_cuota, autoCuota]);

  const validar = () => {
    const e = {};
    if (!form.codigo?.trim()) e.codigo = 'Requerido';
    else if (!/^[A-Z0-9_]+$/.test(form.codigo)) e.codigo = 'Solo mayúsculas, números y guion bajo';
    if (!form.nombre?.trim()) e.nombre = 'Requerido';
    if (!form.acreedor?.trim()) e.acreedor = 'Requerido';
    if (!(Number(form.monto_original) > 0)) e.monto_original = 'Debe ser mayor a 0';
    if (!form.fecha_inicio) e.fecha_inicio = 'Requerida';
    if (form.frecuencia_cuota === 'mensual' && !(Number(form.dia_pago_mes) >= 1 && Number(form.dia_pago_mes) <= 31)) {
      e.dia_pago_mes = 'Día entre 1 y 31';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        nombre: form.nombre.trim(),
        acreedor: form.acreedor.trim(),
        tipo_acreedor: form.tipo_acreedor,
        id_responsable: form.id_responsable || null,
        monto_original: Number(form.monto_original) || 0,
        moneda: form.moneda,
        fecha_inicio: form.fecha_inicio,
        plazo_meses: Number(form.plazo_meses) || null,
        tea_pct: Number(form.tea_pct) || 0,
        tcea_pct: form.tcea_pct != null && form.tcea_pct !== '' ? Number(form.tcea_pct) : null,
        cuota_monto: Number(form.cuota_monto) || 0,
        frecuencia_cuota: form.frecuencia_cuota,
        dia_pago_mes: form.frecuencia_cuota === 'mensual' ? Number(form.dia_pago_mes) : null,
        dia_pago_semana: form.frecuencia_cuota === 'semanal' ? Number(form.dia_pago_semana) : null,
        id_cuenta_reserva: form.id_cuenta_reserva || null,
        estado: form.estado,
        numero_contrato: form.numero_contrato?.trim() || null,
        notas: form.notas?.trim() || null,
        comision_mensual: form.comision_mensual != null && form.comision_mensual !== '' ? Number(form.comision_mensual) : null,
        seguro_mensual: form.seguro_mensual != null && form.seguro_mensual !== '' ? Number(form.seguro_mensual) : null,
        portes_mensual: form.portes_mensual != null && form.portes_mensual !== '' ? Number(form.portes_mensual) : null,
        itf_pct: form.itf_pct != null && form.itf_pct !== '' ? Number(form.itf_pct) : null,
        otros_cargos_mensual: form.otros_cargos_mensual != null && form.otros_cargos_mensual !== '' ? Number(form.otros_cargos_mensual) : null,
      };
      await onSubmit(payload);
    } catch (e) {
      // El padre ya muestra alert
    } finally {
      setGuardando(false);
    }
  };

  const cuentasReserva = cuentas.filter(c => c.activa);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Código" required error={errs.codigo} hint="Ej: MI_BANCO, CAJA_AREQUIPA">
          <Input
            value={form.codigo}
            onChange={v => setF('codigo', v.toUpperCase())}
            placeholder="MI_BANCO"
            error={errs.codigo}
          />
        </Field>

        <Field label="Tipo de acreedor" required>
          <Select
            value={form.tipo_acreedor}
            onChange={v => setF('tipo_acreedor', v)}
            options={TIPOS_ACREEDOR}
          />
        </Field>
      </div>

      <Field label="Nombre" required error={errs.nombre}>
        <Input
          value={form.nombre}
          onChange={v => setF('nombre', v)}
          placeholder="Préstamo Mi Banco"
          error={errs.nombre}
        />
      </Field>

      <Field label="Acreedor" required error={errs.acreedor} hint="Banco, persona o entidad a quien se debe">
        <Input
          value={form.acreedor}
          onChange={v => setF('acreedor', v)}
          placeholder="Mi Banco"
          error={errs.acreedor}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Monto original" required error={errs.monto_original}>
          <MoneyInput value={form.monto_original} onChange={v => setF('monto_original', v)} />
        </Field>

        <Field label="Plazo (meses)" hint="Vacío si es indefinido">
          <Input
            type="number"
            value={form.plazo_meses ?? ''}
            onChange={v => setF('plazo_meses', v ? Number(v) : null)}
            placeholder="18"
          />
        </Field>

        <Field label="TEA (decimal)" hint="0.24 = 24%. Cero si no hay interés.">
          <Input
            type="number"
            step="0.0001"
            value={form.tea_pct ?? ''}
            onChange={v => setF('tea_pct', v ? Number(v) : 0)}
            placeholder="0.24"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Frecuencia">
          <Select
            value={form.frecuencia_cuota}
            onChange={v => setF('frecuencia_cuota', v)}
            options={FRECUENCIAS_CUOTA}
          />
        </Field>

        <Field label="Cuota" hint={autoCuota ? 'Calculada automáticamente' : 'Editada manualmente'}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <MoneyInput
                value={form.cuota_monto}
                onChange={v => { setAutoCuota(false); setF('cuota_monto', v); }}
              />
            </div>
            {!autoCuota && (
              <button
                type="button"
                onClick={() => setAutoCuota(true)}
                className="text-[11px] text-[#57534e] hover:text-[#1c1917] px-2 py-1 rounded hover:bg-[#f5f5f4]"
                style={{ fontWeight: 500 }}
                title="Recalcular automáticamente"
              >
                Auto
              </button>
            )}
          </div>
        </Field>

        {form.frecuencia_cuota === 'mensual' && (
          <Field label="Día de pago" required error={errs.dia_pago_mes}>
            <Input
              type="number"
              min="1"
              max="31"
              value={form.dia_pago_mes ?? ''}
              onChange={v => setF('dia_pago_mes', v ? Number(v) : null)}
              error={errs.dia_pago_mes}
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Fecha de inicio" required error={errs.fecha_inicio}>
          <Input
            type="date"
            value={form.fecha_inicio}
            onChange={v => setF('fecha_inicio', v)}
            error={errs.fecha_inicio}
          />
        </Field>

        <Field label="Responsable" hint="Quien gestiona esta deuda en la familia">
          <Select
            value={form.id_responsable || ''}
            onChange={v => setF('id_responsable', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin responsable —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>
      </div>

      <Field label="Cuenta de reserva" hint="Sub-cuenta donde se acumula dinero para esta deuda. Opcional.">
        <Select
          value={form.id_cuenta_reserva || ''}
          onChange={v => setF('id_cuenta_reserva', v ? Number(v) : null)}
          options={[
            { value: '', label: '— Sin reserva asignada —' },
            ...cuentasReserva.map(c => ({
              value: c.id_cuenta,
              label: c.nombre + (c.alias ? ` (${c.alias})` : ''),
            })),
          ]}
        />
      </Field>

      <Field label="Número de contrato" hint="Opcional, para referencia">
        <Input value={form.numero_contrato} onChange={v => setF('numero_contrato', v)} placeholder="N° 1234567890" />
      </Field>

      {/* ── Sección colapsable: costos adicionales ── */}
      <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
        <button
          type="button"
          onClick={() => setMostrarCargos(!mostrarCargos)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
              Costos adicionales y TCEA
            </p>
            <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Comisiones, seguros, portes, ITF. Todos opcionales.
            </p>
          </div>
          <Icon
            d={mostrarCargos ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6'}
            size={16}
            className="text-[#a8a29e]"
          />
        </button>

        {mostrarCargos && (
          <div className="mt-4 pt-4 border-t border-[#f5f5f4]">
            <Field label="TCEA del contrato (decimal)"
                   hint="Si tu contrato dice TCEA explícita, ponla aquí. Si no, se estima desde TEA + cargos.">
              <Input
                type="number"
                step="0.0001"
                value={form.tcea_pct ?? ''}
                onChange={v => setF('tcea_pct', v === '' ? null : Number(v))}
                placeholder="0.3245"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Comisión mensual" hint="Cargo fijo mensual del acreedor">
                <MoneyInput
                  value={form.comision_mensual}
                  onChange={v => setF('comision_mensual', v)}
                />
              </Field>
              <Field label="Seguro mensual" hint="Desgravamen u otros seguros">
                <MoneyInput
                  value={form.seguro_mensual}
                  onChange={v => setF('seguro_mensual', v)}
                />
              </Field>
              <Field label="Portes mensuales" hint="Envío de estado de cuenta, etc.">
                <MoneyInput
                  value={form.portes_mensual}
                  onChange={v => setF('portes_mensual', v)}
                />
              </Field>
              <Field label="Otros cargos mensuales">
                <MoneyInput
                  value={form.otros_cargos_mensual}
                  onChange={v => setF('otros_cargos_mensual', v)}
                />
              </Field>
            </div>

            <Field label="ITF (decimal)" hint="0.00005 = 0.005%. Aplica a cada movimiento bancario.">
              <Input
                type="number"
                step="0.000001"
                value={form.itf_pct ?? ''}
                onChange={v => setF('itf_pct', v === '' ? null : Number(v))}
                placeholder="0.00005"
              />
            </Field>
          </div>
        )}
      </div>

      <Field label="Notas">
        <textarea
          value={form.notas || ''}
          onChange={e => setF('notas', e.target.value)}
          rows={2}
          placeholder="Garantías, condiciones especiales, contacto..."
          style={{ fontWeight: 400 }}
          className="w-full px-3 py-2 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar deuda'}
        </Button>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   DetalleDeuda - modal con tabs
   ══════════════════════════════════════════════════════════════════════════ */

function DetalleDeuda({ deuda, cuentas, personas, puedeEditar, puedePagar, onActualizar, onPagar, onArchivar, usuario }) {
  const [tab, setTab] = useState('info');

  const progreso = calcularProgresoDeuda(deuda);
  const venc = calcularProximoVencimiento(deuda);
  const sem = SEMAFORO_COLORS[venc ? calcularSemaforo(venc.dias) : 'gris'];

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start gap-4 pb-4 border-b border-[#f5f5f4]">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: sem.bg }}
        >
          <Icon d={ICONS.coins} size={20} style={{ color: sem.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[17px] text-[#1c1917]" style={{ fontWeight: 600 }}>{deuda.nombre}</h2>
            <Badge color={COLOR_ESTADO[deuda.estado] || 'gray'} size="sm">{deuda.estado}</Badge>
          </div>
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>{deuda.acreedor}</p>
          <p className="text-xs text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>
            Código: <span className="font-mono">{deuda.codigo}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[24px] text-[#1c1917] fin-num leading-none" style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>
            {formatMoney(deuda.saldo_actual)}
          </p>
          <p className="text-xs text-[#a8a29e] mt-1.5" style={{ fontWeight: 400 }}>
            de {formatMoney(deuda.monto_original)} originales
          </p>
        </div>
      </div>

      {/* ── Mini KPIs en el header ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
        <MiniMetric label="Pagado capital" value={formatMoney(deuda.capital_pagado)} />
        <MiniMetric label="Pagado interés" value={formatMoney(deuda.interes_pagado)} />
        <MiniMetric label="TEA" value={formatPercent(deuda.tea_pct, { decimals: 2 })} />
        <MiniMetric
          label="TCEA"
          value={Number(deuda.tcea_pct) > 0
            ? formatPercent(deuda.tcea_pct, { decimals: 2 })
            : Number(deuda.tea_pct) > 0
              ? `~${formatPercent(tceaEfectiva(deuda), { decimals: 2 })}`
              : '—'}
          accent={Number(tceaEfectiva(deuda)) >= 0.30 ? 'danger' : null}
        />
        <MiniMetric
          label="Costo diario"
          value={formatMoney(costoFinancieroDiario(deuda))}
          accent={costoFinancieroDiario(deuda) > 0 ? 'warning' : null}
        />
      </div>

      {progreso && Number(deuda.monto_original) > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-[#a8a29e] mb-1.5" style={{ fontWeight: 400 }}>
            <span>Progreso</span>
            <span className="fin-num" style={{ fontWeight: 500, color: '#1c1917' }}>
              {(progreso.pct_pagado * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-[#f5f5f4] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1c1917] transition-all"
              style={{ width: `${Math.min(100, progreso.pct_pagado * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Acción primaria ── */}
      {puedePagar && deuda.estado === 'activa' && (
        <div className="mt-4">
          <Button variant="primary" icon={ICONS.coins} onClick={onPagar} className="w-full sm:w-auto">
            Registrar pago
          </Button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-[#f5f5f4] mt-5 overflow-x-auto">
        {[
          { k: 'info',       label: 'Información' },
          { k: 'cronograma', label: 'Cronograma' },
          { k: 'pagos',      label: 'Pagos' },
          { k: 'config',     label: 'Configuración' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap ${
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

      <div className="py-5">
        {tab === 'info'       && <TabInfoDeuda deuda={deuda} />}
        {tab === 'cronograma' && <TabCronograma deuda={deuda} />}
        {tab === 'pagos'      && <TabPagos deuda={deuda} />}
        {tab === 'config'     && (
          <TabConfigDeuda
            deuda={deuda}
            cuentas={cuentas}
            personas={personas}
            puedeEditar={puedeEditar}
            onActualizar={onActualizar}
            onArchivar={onArchivar}
            usuario={usuario}
          />
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, accent }) {
  const color = accent === 'danger' ? '#991b1b'
              : accent === 'warning' ? '#854d0e'
              : '#1c1917';
  return (
    <div className="bg-[#fafaf9] rounded-lg p-2.5">
      <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>{label}</p>
      <p className="text-sm fin-num" style={{ fontWeight: 500, color }}>{value}</p>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Tab: Información
   ══════════════════════════════════════════════════════════════════════════ */

function TabInfoDeuda({ deuda }) {
  const venc = calcularProximoVencimiento(deuda);
  const tieneCargos = Number(deuda.comision_mensual) > 0 || Number(deuda.seguro_mensual) > 0
                   || Number(deuda.portes_mensual) > 0 || Number(deuda.otros_cargos_mensual) > 0
                   || Number(deuda.itf_pct) > 0;

  return (
    <div className="space-y-2.5">
      <DetalleField label="Acreedor" value={deuda.acreedor} />
      <DetalleField label="Tipo" value={TIPOS_ACREEDOR.find(t => t.value === deuda.tipo_acreedor)?.label || deuda.tipo_acreedor} />
      <DetalleField label="Responsable" value={deuda.responsable?.nombre || '—'} />
      <DetalleField label="Monto original" value={formatMoney(deuda.monto_original)} />
      <DetalleField label="Saldo actual" value={formatMoney(deuda.saldo_actual)} />
      <DetalleField label="Capital pagado" value={formatMoney(deuda.capital_pagado)} />
      <DetalleField label="Interés pagado" value={formatMoney(deuda.interes_pagado)} />
      <DetalleField label="TEA" value={formatPercent(deuda.tea_pct, { decimals: 2 })} />
      <DetalleField
        label="TCEA"
        value={Number(deuda.tcea_pct) > 0
          ? formatPercent(deuda.tcea_pct, { decimals: 2 })
          : `~${formatPercent(tceaEfectiva(deuda), { decimals: 2 })} (estimada)`}
      />
      <DetalleField label="Costo financiero diario" value={formatMoney(costoFinancieroDiario(deuda))} />
      <DetalleField label="Frecuencia" value={FRECUENCIAS_CUOTA.find(f => f.value === deuda.frecuencia_cuota)?.label || deuda.frecuencia_cuota} />
      <DetalleField label="Cuota" value={formatMoney(deuda.cuota_monto)} />
      {deuda.frecuencia_cuota === 'mensual' && (
        <DetalleField label="Día de pago" value={`${deuda.dia_pago_mes} de cada mes`} />
      )}
      {venc && (
        <DetalleField
          label="Próximo vencimiento"
          value={venc.dias === 0 ? 'Hoy'
            : venc.dias === 1 ? 'Mañana'
            : venc.dias < 0 ? `Vencido hace ${Math.abs(venc.dias)} días`
            : `En ${venc.dias} días`}
        />
      )}
      <DetalleField label="Plazo" value={deuda.plazo_meses ? `${deuda.plazo_meses} meses` : '—'} />
      <DetalleField label="Inicio" value={formatDate(deuda.fecha_inicio)} />
      <DetalleField label="Cuenta de reserva" value={deuda.cuenta_reserva ? deuda.cuenta_reserva.nombre : '—'} />
      <DetalleField label="N° de contrato" value={deuda.numero_contrato || '—'} />

      {tieneCargos && (
        <div className="pt-3 mt-3 border-t border-[#f5f5f4]">
          <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>Cargos adicionales</p>
          {Number(deuda.comision_mensual) > 0 && <DetalleField label="Comisión mensual" value={formatMoney(deuda.comision_mensual)} />}
          {Number(deuda.seguro_mensual) > 0 && <DetalleField label="Seguro mensual" value={formatMoney(deuda.seguro_mensual)} />}
          {Number(deuda.portes_mensual) > 0 && <DetalleField label="Portes mensuales" value={formatMoney(deuda.portes_mensual)} />}
          {Number(deuda.otros_cargos_mensual) > 0 && <DetalleField label="Otros cargos" value={formatMoney(deuda.otros_cargos_mensual)} />}
          {Number(deuda.itf_pct) > 0 && <DetalleField label="ITF" value={formatPercent(deuda.itf_pct, { decimals: 4 })} />}
        </div>
      )}

      {deuda.notas && (
        <div className="pt-3">
          <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-1.5" style={{ fontWeight: 500 }}>Notas</p>
          <p className="text-sm text-[#1c1917] bg-[#fafaf9] rounded-lg p-3" style={{ fontWeight: 400 }}>{deuda.notas}</p>
        </div>
      )}
    </div>
  );
}

function DetalleField({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-[#a8a29e] uppercase tracking-wider" style={{ fontWeight: 500 }}>{label}</span>
      <span className="text-sm text-[#1c1917] fin-num" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Tab: Cronograma de amortización (sub-tabs: teórico vs proyectado)
   ══════════════════════════════════════════════════════════════════════════ */

function TabCronograma({ deuda }) {
  const [subTab, setSubTab] = useState('proyectado');

  const cronogramaTeorico = useMemo(() => {
    if (deuda.frecuencia_cuota !== 'mensual' || !deuda.plazo_meses) return [];
    return generarCronograma(
      Number(deuda.monto_original) || 0,
      Number(deuda.tea_pct) || 0,
      Number(deuda.plazo_meses) || 0,
      new Date(deuda.fecha_inicio),
    );
  }, [deuda]);

  const cronogramaProyectado = useMemo(() => {
    return generarCronogramaDinamico(deuda);
  }, [deuda]);

  if (deuda.frecuencia_cuota !== 'mensual' && cronogramaProyectado.length === 0) {
    return (
      <EmptyState
        icon={ICONS.calendar}
        title="Sin cronograma calculado"
        description={`Las deudas de frecuencia ${deuda.frecuencia_cuota} no generan cronograma de amortización francesa estándar. Revisa los pagos en la pestaña Pagos.`}
      />
    );
  }

  const cronograma = subTab === 'teorico' ? cronogramaTeorico : cronogramaProyectado;
  const totalCapital = cronograma.reduce((s, c) => s + c.capital, 0);
  const totalInteres = cronograma.reduce((s, c) => s + c.interes, 0);
  const totalCuotas  = cronograma.reduce((s, c) => s + c.cuota_total, 0);

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-4 bg-[#fafaf9] rounded-lg p-1 w-fit">
        <button
          onClick={() => setSubTab('proyectado')}
          className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
            subTab === 'proyectado' ? 'bg-white text-[#1c1917] shadow-sm' : 'text-[#57534e] hover:text-[#1c1917]'
          }`}
          style={{ fontWeight: 500 }}
        >
          Proyectado
        </button>
        <button
          onClick={() => setSubTab('teorico')}
          className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
            subTab === 'teorico' ? 'bg-white text-[#1c1917] shadow-sm' : 'text-[#57534e] hover:text-[#1c1917]'
          }`}
          style={{ fontWeight: 500 }}
        >
          Teórico original
        </button>
      </div>

      <p className="text-[11px] text-[#a8a29e] mb-3" style={{ fontWeight: 400 }}>
        {subTab === 'proyectado'
          ? 'Cronograma calculado desde el saldo actual real. Se recalcula automáticamente con cada pago, refinanciación o ajuste.'
          : 'Cronograma original calculado al momento de crear la deuda, sobre el monto inicial. No refleja pagos posteriores.'}
      </p>

      {cronograma.length === 0 ? (
        <EmptyState
          icon={ICONS.calendar}
          title="Sin datos para este cronograma"
          description={subTab === 'teorico'
            ? 'Faltan monto original, plazo o TEA para calcular el cronograma teórico.'
            : 'El saldo actual ya es cero o faltan datos para proyectar.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-[#fafaf9] rounded-lg p-2.5">
              <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Total capital</p>
              <p className="text-sm fin-num text-[#1c1917]" style={{ fontWeight: 500 }}>{formatMoney(totalCapital)}</p>
            </div>
            <div className="bg-[#fafaf9] rounded-lg p-2.5">
              <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Total interés</p>
              <p className="text-sm fin-num text-[#991b1b]" style={{ fontWeight: 500 }}>{formatMoney(totalInteres)}</p>
            </div>
            <div className="bg-[#fafaf9] rounded-lg p-2.5">
              <p className="text-[10px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Total a pagar</p>
              <p className="text-sm fin-num text-[#1c1917]" style={{ fontWeight: 500 }}>{formatMoney(totalCuotas)}</p>
            </div>
          </div>

          <div className="border border-[#e7e5e4] rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#fafaf9] text-[11px] text-[#a8a29e] uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>#</th>
                    <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Fecha</th>
                    <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Cuota</th>
                    <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Capital</th>
                    <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Interés</th>
                    <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {cronograma.map(c => (
                    <tr key={c.cuota_num} className="border-t border-[#f5f5f4]">
                      <td className="px-3 py-2 text-[#a8a29e] fin-num" style={{ fontWeight: 400 }}>{c.cuota_num}</td>
                      <td className="px-3 py-2 text-[#57534e] fin-num" style={{ fontWeight: 400 }}>{formatDate(c.fecha)}</td>
                      <td className="px-3 py-2 text-right text-[#1c1917] fin-num" style={{ fontWeight: 500 }}>{formatMoney(c.cuota_total, { decimals: true })}</td>
                      <td className="px-3 py-2 text-right text-[#166534] fin-num" style={{ fontWeight: 400 }}>{formatMoney(c.capital, { decimals: true })}</td>
                      <td className="px-3 py-2 text-right text-[#991b1b] fin-num" style={{ fontWeight: 400 }}>{formatMoney(c.interes, { decimals: true })}</td>
                      <td className="px-3 py-2 text-right text-[#57534e] fin-num" style={{ fontWeight: 400 }}>{formatMoney(c.saldo_pendiente, { decimals: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Tab: Pagos (historial real desde movimientos)
   ══════════════════════════════════════════════════════════════════════════ */

function TabPagos({ deuda }) {
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listarPagosDeuda(deuda.id_deuda)
      .then(data => { if (!cancelled) setPagos(data); })
      .catch(e => {
        console.error('listarPagosDeuda error:', e);
        if (!cancelled) setError(e.message || 'Error al cargar los pagos');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [deuda.id_deuda]);

  if (loading) return <LoadingState message="Cargando pagos..." />;

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-[#fef2f2] border border-[#fca5a5]">
        <p className="text-sm text-[#991b1b]" style={{ fontWeight: 500 }}>No se pudieron cargar los pagos</p>
        <p className="text-xs text-[#991b1b] mt-1 font-mono" style={{ fontWeight: 400 }}>{error}</p>
      </div>
    );
  }

  if (pagos.length === 0) {
    return (
      <EmptyState
        icon={ICONS.exchange}
        title="Sin pagos registrados"
        description="Los pagos aparecerán aquí cuando se registren desde el botón Pagar o desde Movimientos."
      />
    );
  }

  return (
    <div className="border border-[#e7e5e4] rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[#fafaf9] text-[11px] text-[#a8a29e] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Fecha</th>
            <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Cuenta / Concepto</th>
            <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Capital</th>
            <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Interés</th>
            <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {pagos.map(p => {
            const cap = Number(p.datos_extra?.capital ?? p.monto) || 0;
            const inte = Number(p.datos_extra?.interes ?? 0) || 0;
            return (
              <tr key={p.id_movimiento} className="border-t border-[#f5f5f4]">
                <td className="px-3 py-2 text-[#57534e] fin-num align-top" style={{ fontWeight: 400 }}>{formatDate(p.fecha_movimiento)}</td>
                <td className="px-3 py-2 align-top">
                  <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
                    {p.tiene_splits ? 'Pago split (varias cuentas)' : (p.cuenta?.nombre || '—')}
                  </p>
                  <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>{p.concepto}</p>
                  {p.persona && (
                    <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>por {p.persona.nombre}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-[#166534] fin-num align-top" style={{ fontWeight: 500 }}>{formatMoney(cap)}</td>
                <td className="px-3 py-2 text-right text-[#991b1b] fin-num align-top" style={{ fontWeight: 500 }}>{formatMoney(inte)}</td>
                <td className="px-3 py-2 text-right text-[#1c1917] fin-num align-top" style={{ fontWeight: 600 }}>{formatMoney(p.monto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   Tab: Configuración (refinanciar, archivar, asignar reserva, editar)
   ══════════════════════════════════════════════════════════════════════════ */

function TabConfigDeuda({ deuda, cuentas, personas, puedeEditar, onActualizar, onArchivar, usuario }) {
  const [editando, setEditando] = useState(false);
  const [refinanciando, setRefinanciando] = useState(false);

  if (!puedeEditar) {
    return (
      <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
        No tienes permisos para modificar esta deuda.
      </p>
    );
  }

  if (editando) {
    return (
      <div>
        <p className="text-sm text-[#1c1917] mb-3" style={{ fontWeight: 500 }}>Editar deuda</p>
        <FormDeuda
          cuentas={cuentas}
          personas={personas}
          valoresIniciales={deuda}
          onSubmit={async (cambios) => {
            await onActualizar(cambios);
            setEditando(false);
          }}
          onCancel={() => setEditando(false)}
        />
      </div>
    );
  }

  if (refinanciando) {
    return (
      <FormRefinanciar
        deuda={deuda}
        onSubmit={async (cambios, evento) => {
          await onActualizar(cambios, evento);
          setRefinanciando(false);
        }}
        onCancel={() => setRefinanciando(false)}
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-[#57534e] mb-4" style={{ fontWeight: 400 }}>
        Acciones administrativas. Cambios aquí afectan el cálculo de intereses y el cronograma.
      </p>

      <div className="flex flex-col gap-2">
        <Button icon={ICONS.edit} onClick={() => setEditando(true)}>
          Editar información
        </Button>
        <Button icon={ICONS.refresh} onClick={() => setRefinanciando(true)}>
          Refinanciar deuda
        </Button>
        <Button variant="danger" icon={ICONS.trash} onClick={onArchivar}>
          Archivar deuda
        </Button>
      </div>

      <HistorialEventos idDeuda={deuda.id_deuda} />
    </div>
  );
}

function FormRefinanciar({ deuda, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    nuevo_saldo: Number(deuda.saldo_actual) || 0,
    nueva_tea: Number(deuda.tea_pct) || 0,
    nuevo_plazo: Number(deuda.plazo_meses) || 12,
    nueva_cuota: Number(deuda.cuota_monto) || 0,
    descripcion: '',
  });
  const [guardando, setGuardando] = useState(false);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  /* Recalcular cuota cuando cambian saldo/tea/plazo */
  useEffect(() => {
    const cuota = calcularCuotaFrancesa(
      Number(form.nuevo_saldo) || 0,
      Number(form.nueva_tea) || 0,
      Number(form.nuevo_plazo) || 0,
    );
    setF('nueva_cuota', +cuota.toFixed(2));
  }, [form.nuevo_saldo, form.nueva_tea, form.nuevo_plazo]);

  const handleSubmit = async () => {
    if (!form.descripcion.trim()) {
      alert('Describe el motivo de la refinanciación.');
      return;
    }
    setGuardando(true);
    try {
      const antes = {
        saldo_actual: deuda.saldo_actual,
        tea_pct: deuda.tea_pct,
        plazo_meses: deuda.plazo_meses,
        cuota_monto: deuda.cuota_monto,
      };
      const despues = {
        saldo_actual: Number(form.nuevo_saldo),
        tea_pct: Number(form.nueva_tea),
        plazo_meses: Number(form.nuevo_plazo),
        cuota_monto: Number(form.nueva_cuota),
      };
      await onSubmit(
        despues,
        {
          tipo: 'refinanciacion',
          monto: Number(form.nuevo_saldo),
          descripcion: form.descripcion.trim(),
          antes,
          despues,
        }
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-[#1c1917] mb-1" style={{ fontWeight: 500 }}>Refinanciar deuda</p>
      <p className="text-xs text-[#a8a29e] mb-4" style={{ fontWeight: 400 }}>
        Esto modifica las condiciones de la deuda y registra un evento de auditoría. No borra los pagos históricos.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nuevo saldo">
          <MoneyInput value={form.nuevo_saldo} onChange={v => setF('nuevo_saldo', v)} />
        </Field>
        <Field label="Nueva TEA (decimal)">
          <Input
            type="number"
            step="0.0001"
            value={form.nueva_tea}
            onChange={v => setF('nueva_tea', v ? Number(v) : 0)}
          />
        </Field>
        <Field label="Nuevo plazo (meses)">
          <Input
            type="number"
            value={form.nuevo_plazo}
            onChange={v => setF('nuevo_plazo', v ? Number(v) : 0)}
          />
        </Field>
        <Field label="Nueva cuota (auto)">
          <MoneyInput value={form.nueva_cuota} onChange={v => setF('nueva_cuota', v)} />
        </Field>
      </div>

      <Field label="Motivo / descripción" required>
        <textarea
          value={form.descripcion}
          onChange={e => setF('descripcion', e.target.value)}
          rows={3}
          placeholder="Ej: Renegociación con el banco, baja de TEA del 32% al 24%, ampliación del plazo a 24 meses."
          style={{ fontWeight: 400 }}
          className="w-full px-3 py-2 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Confirmar refinanciación'}
        </Button>
      </div>
    </div>
  );
}

function HistorialEventos({ idDeuda }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listarEventosDeuda(idDeuda)
      .then(setEventos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [idDeuda]);

  if (loading) return null;
  if (eventos.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-[#f5f5f4]">
      <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-2" style={{ fontWeight: 500 }}>
        Historial de eventos
      </p>
      <div className="space-y-2">
        {eventos.map(e => (
          <div key={e.id_evento} className="bg-[#fafaf9] rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>{e.tipo_evento.replace(/_/g, ' ')}</p>
                {e.descripcion && (
                  <p className="text-xs text-[#57534e] mt-0.5" style={{ fontWeight: 400 }}>{e.descripcion}</p>
                )}
              </div>
              <p className="text-[11px] text-[#a8a29e] fin-num" style={{ fontWeight: 400 }}>{formatDate(e.fecha_evento)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormPagarDeuda - el formulario más importante del bloque
   ══════════════════════════════════════════════════════════════════════════ */

function FormPagarDeuda({ deuda, cuentas, usuario, onSubmit, onCancel }) {
  const cuotaSugerida = Number(deuda.cuota_monto) || 0;

  const [monto, setMonto]               = useState(cuotaSugerida);
  const [capital, setCapital]           = useState(0);
  const [interes, setInteres]           = useState(0);
  const [autoSplit, setAutoSplit]       = useState(true);  // sugerir capital/interés automático
  const [modoSplit, setModoSplit]       = useState(false); // pagar desde múltiples cuentas
  const [idCuenta, setIdCuenta]         = useState(deuda.id_cuenta_reserva || null);
  const [splits, setSplits]             = useState([{ id_cuenta: null, monto: 0 }]);
  const [concepto, setConcepto]         = useState('');
  const [guardando, setGuardando]       = useState(false);
  const [errs, setErrs]                 = useState({});

  const cuentasActivas = cuentas.filter(c => c.activa);

  /* Auto-sugerir capital/interés cuando cambia el monto */
  useEffect(() => {
    if (!autoSplit) return;
    const sug = sugerirCapitalInteres(deuda, monto);
    setCapital(sug.capital);
    setInteres(sug.interes);
  }, [monto, autoSplit, deuda]);

  /* Si el usuario edita capital, recalcular interés */
  const handleCapitalChange = (v) => {
    setAutoSplit(false);
    const c = Number(v) || 0;
    setCapital(c);
    setInteres(+(Number(monto) - c).toFixed(2));
  };
  const handleInteresChange = (v) => {
    setAutoSplit(false);
    const i = Number(v) || 0;
    setInteres(i);
    setCapital(+(Number(monto) - i).toFixed(2));
  };

  const handleAddSplit = () => {
    setSplits(prev => [...prev, { id_cuenta: null, monto: 0 }]);
  };
  const handleRemoveSplit = (idx) => {
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };
  const handleSplitChange = (idx, field, value) => {
    setSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const totalSplits = useMemo(
    () => splits.reduce((s, x) => s + (Number(x.monto) || 0), 0),
    [splits]
  );

  const validar = () => {
    const e = {};
    const m = Number(monto) || 0;
    if (m <= 0) e.monto = 'Debe ser mayor a 0';
    if (Math.abs((Number(capital) || 0) + (Number(interes) || 0) - m) > 0.01) {
      e.split = `Capital + interés (${formatMoney((Number(capital)||0)+(Number(interes)||0))}) no coincide con el monto (${formatMoney(m)})`;
    }
    if (m > Number(deuda.saldo_actual) + 0.01 && Number(capital) > Number(deuda.saldo_actual) + 0.01) {
      e.monto = `El capital no puede exceder el saldo actual (${formatMoney(deuda.saldo_actual)})`;
    }
    if (!modoSplit && !idCuenta) {
      e.cuenta = 'Selecciona una cuenta';
    }
    if (modoSplit) {
      if (splits.length === 0) e.splits = 'Agrega al menos un split';
      else if (splits.some(s => !s.id_cuenta)) e.splits = 'Cada split necesita una cuenta';
      else if (Math.abs(totalSplits - m) > 0.01) {
        e.splits = `Suma de splits (${formatMoney(totalSplits)}) no coincide con el monto (${formatMoney(m)})`;
      } else {
        // Detectar cuentas duplicadas
        const ids = splits.map(s => s.id_cuenta);
        if (new Set(ids).size !== ids.length) {
          e.splits = 'No puede haber dos splits desde la misma cuenta';
        }
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
        idDeuda: deuda.id_deuda,
        monto: Number(monto),
        capital: Number(capital),
        interes: Number(interes),
        concepto: concepto.trim() || null,
        idPersona: usuario?.id_persona || null,
      };
      if (modoSplit) {
        payload.splits = splits.map(s => ({
          id_cuenta: Number(s.id_cuenta),
          monto: Number(s.monto),
        }));
      } else {
        payload.idCuenta = Number(idCuenta);
      }
      await onSubmit(payload);
    } catch (e) {
      // padre muestra alert
    } finally {
      setGuardando(false);
    }
  };

  /* Cuenta única seleccionada → calcular si va a quedar en negativo */
  const cuentaSeleccionada = !modoSplit && idCuenta
    ? cuentasActivas.find(c => c.id_cuenta === Number(idCuenta))
    : null;
  const saldoTrasPago = cuentaSeleccionada
    ? Number(cuentaSeleccionada.saldo_actual) - Number(monto || 0)
    : null;
  const irAQuedarNegativa = saldoTrasPago !== null && saldoTrasPago < 0;

  /* En modo split: detectar splits que dejan su cuenta en negativo */
  const splitsNegativos = useMemo(() => {
    if (!modoSplit) return [];
    return splits
      .filter(s => s.id_cuenta && Number(s.monto) > 0)
      .map(s => {
        const c = cuentasActivas.find(x => x.id_cuenta === Number(s.id_cuenta));
        if (!c) return null;
        const tras = Number(c.saldo_actual) - Number(s.monto);
        return tras < 0 ? { cuenta: c, monto: s.monto, tras } : null;
      })
      .filter(Boolean);
  }, [splits, modoSplit, cuentasActivas]);

  /* Cuenta sugerida (reserva) destacada en el dropdown */
  const opcionesCuentas = cuentasActivas.map(c => ({
    value: c.id_cuenta,
    label: (c.id_cuenta === deuda.id_cuenta_reserva ? '★ ' : '') +
           c.nombre + (c.alias ? ` (${c.alias})` : '') +
           ` — ${formatMoney(c.saldo_actual)}`,
  }));

  return (
    <div>
      {/* ── Resumen de la deuda ── */}
      <div className="bg-[#fafaf9] rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#a8a29e] uppercase tracking-wider" style={{ fontWeight: 500 }}>Saldo pendiente</span>
          <span className="text-base text-[#1c1917] fin-num" style={{ fontWeight: 600 }}>{formatMoney(deuda.saldo_actual)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#a8a29e] uppercase tracking-wider" style={{ fontWeight: 500 }}>Cuota sugerida</span>
          <span className="text-sm text-[#57534e] fin-num" style={{ fontWeight: 500 }}>{formatMoney(cuotaSugerida)}</span>
        </div>
      </div>

      {/* ── Monto ── */}
      <Field label="Monto a pagar" required error={errs.monto}>
        <MoneyInput value={monto} onChange={v => setMonto(v || 0)} />
      </Field>

      {/* ── Capital / Interés ── */}
      <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#57534e] uppercase tracking-wider" style={{ fontWeight: 500 }}>
            Desglose capital / interés
          </p>
          {!autoSplit && (
            <button
              type="button"
              onClick={() => setAutoSplit(true)}
              className="text-[11px] text-[#57534e] hover:text-[#1c1917] px-2 py-1 rounded hover:bg-[#f5f5f4]"
              style={{ fontWeight: 500 }}
            >
              Recalcular auto
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capital" hint={autoSplit ? 'Sugerido automáticamente' : 'Editado manualmente'}>
            <MoneyInput value={capital} onChange={handleCapitalChange} />
          </Field>
          <Field label="Interés" hint={autoSplit ? 'Sugerido automáticamente' : 'Editado manualmente'}>
            <MoneyInput value={interes} onChange={handleInteresChange} />
          </Field>
        </div>
        {errs.split && (
          <p className="text-[11px] text-[#991b1b] mt-1" style={{ fontWeight: 500 }}>{errs.split}</p>
        )}
        <p className="text-[11px] text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
          El capital reduce el saldo de la deuda. El interés es costo financiero del periodo.
        </p>
      </div>

      {/* ── Toggle modo split ── */}
      <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={modoSplit}
            onChange={e => setModoSplit(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Pagar desde varias cuentas (split)</p>
            <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Útil cuando el dinero se junta de la caja de papá, mamá y/o ahorro BCP.
            </p>
          </div>
        </label>
      </div>

      {/* ── Cuenta única ── */}
      {!modoSplit && (
        <Field label="Pagar desde" required error={errs.cuenta}
               hint={deuda.id_cuenta_reserva ? '★ marca la cuenta de reserva asignada a esta deuda' : null}>
          <Select
            value={idCuenta || ''}
            onChange={v => setIdCuenta(v ? Number(v) : null)}
            options={[{ value: '', label: '— Elegir cuenta —' }, ...opcionesCuentas]}
          />
        </Field>
      )}

      {/* Alerta de saldo negativo en cuenta única */}
      {!modoSplit && irAQuedarNegativa && (
        <div className="-mt-2 mb-4 p-2.5 rounded-lg bg-[#fef3c7] border border-[#fcd34d] flex items-start gap-2">
          <Icon d={ICONS.alert} size={14} className="text-[#854d0e] mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-[#854d0e]" style={{ fontWeight: 400 }}>
            <span style={{ fontWeight: 500 }}>Atención:</span> {cuentaSeleccionada?.nombre} quedará en{' '}
            <span className="fin-num" style={{ fontWeight: 500 }}>{formatMoney(saldoTrasPago)}</span>{' '}
            tras el pago. El sistema lo permite (saldo negativo es válido), pero recuerda reponerlo
            con una transferencia o ingreso.
          </div>
        </div>
      )}

      {/* ── Splits ── */}
      {modoSplit && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#57534e] uppercase tracking-wider" style={{ fontWeight: 500 }}>Cuentas origen</p>
            <p className="text-[11px] text-[#a8a29e] fin-num" style={{ fontWeight: 500 }}>
              Total: {formatMoney(totalSplits)} / {formatMoney(monto)}
            </p>
          </div>

          <div className="space-y-2">
            {splits.map((s, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    value={s.id_cuenta || ''}
                    onChange={v => handleSplitChange(idx, 'id_cuenta', v ? Number(v) : null)}
                    options={[{ value: '', label: '— Cuenta —' }, ...opcionesCuentas]}
                  />
                </div>
                <div className="w-32">
                  <MoneyInput
                    value={s.monto}
                    onChange={v => handleSplitChange(idx, 'monto', v || 0)}
                  />
                </div>
                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSplit(idx)}
                    className="w-9 h-10 flex items-center justify-center rounded-lg text-[#a8a29e] hover:text-[#991b1b] hover:bg-[#fef2f2] flex-shrink-0"
                    title="Quitar"
                  >
                    <Icon d={ICONS.x} size={14} />
                  </button>
                )}
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

          {/* Alerta de splits que dejan cuentas en negativo */}
          {splitsNegativos.length > 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-[#fef3c7] border border-[#fcd34d] flex items-start gap-2">
              <Icon d={ICONS.alert} size={14} className="text-[#854d0e] mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-[#854d0e] flex-1" style={{ fontWeight: 400 }}>
                <span style={{ fontWeight: 500 }}>Atención:</span>{' '}
                {splitsNegativos.length === 1
                  ? `${splitsNegativos[0].cuenta.nombre} quedará en `
                  : `${splitsNegativos.length} cuentas quedarán en negativo: `}
                {splitsNegativos.map((s, i) => (
                  <span key={i}>
                    {splitsNegativos.length > 1 && (i > 0 ? ', ' : '')}
                    <span className="fin-num" style={{ fontWeight: 500 }}>
                      {splitsNegativos.length > 1 ? `${s.cuenta.nombre} ${formatMoney(s.tras)}` : formatMoney(s.tras)}
                    </span>
                  </span>
                ))}
                . El sistema lo permite, pero recuerda reponer.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Concepto ── */}
      <Field label="Concepto" hint={`Si lo dejas vacío: "Pago ${deuda.nombre}"`}>
        <Input
          value={concepto}
          onChange={setConcepto}
          placeholder={`Pago ${deuda.nombre}`}
        />
      </Field>

      {/* ── Footer ── */}
      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Registrando...</> : `Registrar pago de ${formatMoney(monto)}`}
        </Button>
      </div>
    </div>
  );
}