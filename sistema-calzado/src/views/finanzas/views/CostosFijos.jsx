import React, { useState, useEffect, useMemo } from 'react';
import {
  listarCostosFijos, crearCostoFijo, actualizarCostoFijo, archivarCostoFijo,
  obtenerCostoFijo, pagarCostoFijo, listarPagosCostoFijo,
  listarCuentas, listarPlanCuentas, listarPersonasConAccesoFinanzas,
} from '../api/finanzasClient';
import { formatMoney, formatDate, formatPercent } from '../lib/calculos';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, MetricCard, Badge, Button, Modal, Field, Input, Select,
  MoneyInput, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   COSTOS FIJOS — Bloque 3.7
   ──────────────────────────────────────────────────────────────────────────
   Vista de gestión de todos los costos recurrentes del negocio:
   - Servicios (luz, agua, internet, gas)
   - Alquileres (tiendas, taller, almacén)
   - Personal (sueldos, adelantos, trabajadores por docena)
   - Suscripciones (software, plataformas)
   - Impuestos (SUNAT, predial, arbitrios)
   - Seguros
   - Otros

   Categorías especiales:
   - "Personal - por unidad" (aparadores, armador): monto calculado como
     cantidad × tarifa al momento de pagar
   ────────────────────────────────────────────────────────────────────────── */


/* ── Configuración de categorías ── */
const CATEGORIAS = [
  { value: 'servicio',     label: 'Servicios públicos',   color: '#3b82f6', orden: 1, icon: ICONS.lightning || ICONS.zap || 'M13 10V3L4 14h7v7l9-11h-7z' },
  { value: 'alquiler',     label: 'Alquileres',           color: '#8b5cf6', orden: 2, icon: ICONS.building || ICONS.home || 'M3 21V7l9-5 9 5v14M9 22V12h6v10' },
  { value: 'salario',      label: 'Personal',             color: '#059669', orden: 3, icon: ICONS.users || ICONS.user || 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z' },
  { value: 'suscripcion',  label: 'Suscripciones',        color: '#0891b2', orden: 4, icon: ICONS.star || 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { value: 'impuesto',     label: 'Impuestos y tributos', color: '#dc2626', orden: 5, icon: ICONS.document || 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { value: 'seguro',       label: 'Seguros',              color: '#9333ea', orden: 6, icon: ICONS.shield || 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { value: 'otro',         label: 'Otros',                color: '#6b7280', orden: 7, icon: ICONS.dots || 'M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z' },
];

const FRECUENCIAS = [
  { value: 'mensual',    label: 'Mensual',    diasProximoCalc: 30 },
  { value: 'semanal',    label: 'Semanal',    diasProximoCalc: 7 },
  { value: 'quincenal',  label: 'Quincenal',  diasProximoCalc: 15 },
  { value: 'anual',      label: 'Anual',      diasProximoCalc: 365 },
  { value: 'por_uso',    label: 'Por uso',    diasProximoCalc: 0 },
];

const UNIDADES_COMUNES = [
  { value: 'docena',  label: 'Docena' },
  { value: 'par',     label: 'Par' },
  { value: 'pieza',   label: 'Pieza' },
  { value: 'hora',    label: 'Hora' },
  { value: 'dia',     label: 'Día' },
];


/* ══════════════════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════════════════ */

function calcularProximoVencimiento(costo) {
  if (!costo.activo) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (costo.frecuencia === 'mensual' && costo.dia_vencimiento) {
    const venc = new Date(hoy.getFullYear(), hoy.getMonth(), costo.dia_vencimiento);
    if (venc < hoy) venc.setMonth(venc.getMonth() + 1);
    const dias = Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
    return { fecha: venc, dias };
  }
  if (costo.frecuencia === 'semanal') {
    // Asumimos siguiente semana
    const venc = new Date(hoy);
    venc.setDate(venc.getDate() + 7);
    return { fecha: venc, dias: 7 };
  }
  if (costo.frecuencia === 'quincenal') {
    const venc = new Date(hoy);
    venc.setDate(venc.getDate() + 15);
    return { fecha: venc, dias: 15 };
  }
  if (costo.frecuencia === 'anual' && costo.dia_vencimiento) {
    // Próximo mismo día del año
    const venc = new Date(hoy.getFullYear(), hoy.getMonth(), costo.dia_vencimiento);
    if (venc < hoy) venc.setFullYear(venc.getFullYear() + 1);
    const dias = Math.round((venc - hoy) / (1000 * 60 * 60 * 24));
    return { fecha: venc, dias };
  }
  return null;
}

function montoMensualizado(costo) {
  const base = Number(costo.monto_estimado) || 0;
  switch (costo.frecuencia) {
    case 'mensual':   return base;
    case 'semanal':   return base * 4.33;
    case 'quincenal': return base * 2;
    case 'anual':     return base / 12;
    case 'por_uso':   return base;
    default: return base;
  }
}


/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function CostosFijos({ usuario }) {
  const [costos, setCostos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [planCuentas, setPlanCuentas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  // Modales
  const [modalCrear, setModalCrear] = useState(false);
  const [costoDetalle, setCostoDetalle] = useState(null);
  const [modalPagar, setModalPagar] = useState(null);
  const [confirmArchivar, setConfirmArchivar] = useState(null);
  const [costoEdicion, setCostoEdicion] = useState(null);

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [cf, cs, pc, ps] = await Promise.all([
        listarCostosFijos({ soloActivos: true }),
        listarCuentas(),
        listarPlanCuentas(),
        listarPersonasConAccesoFinanzas(),
      ]);
      setCostos(cf);
      setCuentas(cs);
      setPlanCuentas(pc);
      setPersonas(ps);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar costos fijos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  /* ── Filtros aplicados ── */
  const costosFiltrados = useMemo(() => {
    let list = costos;
    if (filtroCategoria) list = list.filter(c => c.categoria === filtroCategoria);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      list = list.filter(c =>
        c.nombre?.toLowerCase().includes(q) ||
        c.codigo?.toLowerCase().includes(q) ||
        c.descripcion?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [costos, filtroCategoria, busqueda]);

  /* ── Agrupado por categoría ── */
  const grupos = useMemo(() => {
    const map = new Map();
    CATEGORIAS.forEach(cat => map.set(cat.value, { ...cat, items: [], total: 0 }));
    costosFiltrados.forEach(c => {
      const cat = map.get(c.categoria) || map.get('otro');
      cat.items.push(c);
      cat.total += montoMensualizado(c);
    });
    return Array.from(map.values())
      .filter(g => g.items.length > 0)
      .sort((a, b) => a.orden - b.orden);
  }, [costosFiltrados]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const totalMensual = costos.reduce((s, c) => s + montoMensualizado(c), 0);

    // Próximos 7 días: costos cuyo próximo vencimiento cae en ≤7 días
    const proximos7 = costos.filter(c => {
      const v = calcularProximoVencimiento(c);
      return v && v.dias >= 0 && v.dias <= 7;
    });
    const totalProximos7 = proximos7.reduce((s, c) => {
      // Para costos por unidad usamos el monto_estimado como proyección
      return s + (Number(c.monto_estimado) || 0);
    }, 0);

    // Por categoría
    const porCategoria = {};
    costos.forEach(c => {
      const m = montoMensualizado(c);
      porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + m;
    });

    return {
      totalMensual,
      totalAnual: totalMensual * 12,
      cantidad: costos.length,
      proximos7,
      totalProximos7,
      porCategoria,
    };
  }, [costos]);

  /* ── Vencimientos próximos (lista destacada) ── */
  const vencimientosDestacados = useMemo(() => {
    return costos
      .map(c => ({ costo: c, venc: calcularProximoVencimiento(c) }))
      .filter(x => x.venc && x.venc.dias >= 0 && x.venc.dias <= 10)
      .sort((a, b) => a.venc.dias - b.venc.dias);
  }, [costos]);

  /* ── Handlers ── */

  const handleCrearCosto = async (payload) => {
    try {
      await crearCostoFijo(payload);
      setModalCrear(false);
      await cargar();
    } catch (e) {
      alert('Error al crear: ' + (e.message || ''));
      throw e;
    }
  };

  const handleActualizarCosto = async (id, cambios) => {
    try {
      await actualizarCostoFijo(id, cambios);
      setCostoEdicion(null);
      await cargar();
    } catch (e) {
      alert('Error al actualizar: ' + (e.message || ''));
      throw e;
    }
  };

  const handleArchivarCosto = async (id) => {
    try {
      await archivarCostoFijo(id);
      setConfirmArchivar(null);
      setCostoDetalle(null);
      await cargar();
    } catch (e) {
      alert('Error al archivar: ' + (e.message || ''));
    }
  };

  const handlePagar = async (payload) => {
    try {
      await pagarCostoFijo(payload);
      setModalPagar(null);
      await cargar();
    } catch (e) {
      alert('Error al registrar pago: ' + (e.message || ''));
      throw e;
    }
  };

  if (loading) return <LoadingState message="Cargando costos fijos..." />;

  return (
    <>
      <PageHeader
        title="Costos fijos"
        description="Gastos recurrentes: servicios, alquileres, personal, suscripciones, impuestos."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
            Nuevo costo
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Total mensual"
          value={kpis.totalMensual}
          sublabel={`${formatMoney(kpis.totalAnual)} al año`}
        />
        <MetricCard
          label="Próximos 7 días"
          value={kpis.totalProximos7}
          accent={kpis.proximos7.length > 0 ? 'warning' : null}
          sublabel={`${kpis.proximos7.length} vencimiento${kpis.proximos7.length !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Total de costos"
          value={String(kpis.cantidad)}
          sublabel="activos"
        />
        <MetricCard
          label="Más pesado"
          value={(() => {
            const entries = Object.entries(kpis.porCategoria).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) return '—';
            const [cat] = entries[0];
            return CATEGORIAS.find(c => c.value === cat)?.label || cat;
          })()}
          sublabel={(() => {
            const entries = Object.entries(kpis.porCategoria).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) return '';
            return formatMoney(entries[0][1]) + '/mes';
          })()}
        />
      </div>

      {/* ── Chips por categoría (filtro rápido) ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFiltroCategoria(null)}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            !filtroCategoria ? 'bg-[#1c1917] text-white' : 'text-[#57534e] hover:bg-[#f5f5f4]'
          }`}
          style={{ fontWeight: 500 }}
        >
          Todos ({costos.length})
        </button>
        {CATEGORIAS.map(cat => {
          const count = costos.filter(c => c.categoria === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFiltroCategoria(cat.value === filtroCategoria ? null : cat.value)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                filtroCategoria === cat.value ? 'bg-[#1c1917] text-white' : 'text-[#57534e] hover:bg-[#f5f5f4]'
              }`}
              style={{ fontWeight: 500 }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: filtroCategoria === cat.value ? 'white' : cat.color }}
              />
              {cat.label}
              <span className={filtroCategoria === cat.value ? 'text-slate-300' : 'text-[#a8a29e]'}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* ── Búsqueda ── */}
      <div className="mb-4 relative max-w-sm">
        <Icon d={ICONS.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código..."
          style={{ fontWeight: 400 }}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#e7e5e4] bg-white text-sm placeholder:text-[#a8a29e] focus:outline-none focus:border-[#1c1917] focus:ring-1 focus:ring-[#1c1917]"
        />
      </div>

      {/* ── Vencimientos próximos (destacados) ── */}
      {vencimientosDestacados.length > 0 && !filtroCategoria && !busqueda && (
        <Card padding="md" className="mb-4" style={{ borderColor: '#fde68a', backgroundColor: '#fef9c3' }}>
          <div className="flex items-center gap-2 mb-3">
            <Icon d={ICONS.alert} size={14} className="text-[#854d0e]" />
            <p className="text-[11px] uppercase tracking-wider text-[#854d0e]" style={{ fontWeight: 600 }}>
              Próximos a vencer
            </p>
          </div>
          <div className="space-y-1.5">
            {vencimientosDestacados.map(({ costo, venc }) => (
              <button
                key={costo.id_costo}
                onClick={() => setCostoDetalle(costo)}
                className="w-full flex items-center justify-between text-left py-1.5 hover:bg-[#fef3c7] rounded px-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                    backgroundColor: venc.dias <= 2 ? '#dc2626' : venc.dias <= 5 ? '#d97706' : '#854d0e'
                  }} />
                  <p className="text-sm text-[#1c1917] truncate" style={{ fontWeight: 500 }}>
                    {costo.nombre}
                  </p>
                  <span className="text-[11px] text-[#854d0e] flex-shrink-0" style={{ fontWeight: 500 }}>
                    {venc.dias === 0 ? 'hoy'
                      : venc.dias === 1 ? 'mañana'
                      : `en ${venc.dias} días`}
                  </span>
                </div>
                <span className="text-sm text-[#1c1917] fin-num flex-shrink-0 ml-2" style={{ fontWeight: 600 }}>
                  {formatMoney(costo.monto_estimado)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── Lista agrupada por categoría ── */}
      {grupos.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.document}
            title={filtroCategoria || busqueda ? 'Sin coincidencias' : 'Sin costos fijos'}
            description={filtroCategoria || busqueda
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Registra tu primer costo fijo: servicios, alquileres, sueldos, suscripciones.'}
            action={puedeCrear && !filtroCategoria && !busqueda && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
                Crear primer costo
              </Button>
            )}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map(grupo => (
            <Card key={grupo.value} padding="md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: grupo.color }} />
                  <h2 className="text-[15px] text-[#1c1917]" style={{ fontWeight: 600 }}>
                    {grupo.label}
                  </h2>
                  <Badge color="gray" size="sm">{grupo.items.length}</Badge>
                </div>
                <p className="text-sm text-[#57534e] fin-num" style={{ fontWeight: 500 }}>
                  {formatMoney(grupo.total)}
                  <span className="text-[11px] text-[#a8a29e] ml-1" style={{ fontWeight: 400 }}>/mes</span>
                </p>
              </div>

              <div className="space-y-0.5">
                {grupo.items.map(costo => (
                  <CostoFijoRow
                    key={costo.id_costo}
                    costo={costo}
                    puedeCrear={puedeCrear}
                    onVer={() => setCostoDetalle(costo)}
                    onPagar={() => setModalPagar(costo)}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal crear ── */}
      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nuevo costo fijo"
        size="lg"
      >
        <FormCostoFijo
          cuentas={cuentas}
          planCuentas={planCuentas}
          personas={personas}
          onSubmit={handleCrearCosto}
          onCancel={() => setModalCrear(false)}
        />
      </Modal>

      {/* ── Modal editar ── */}
      {costoEdicion && (
        <Modal
          open={true}
          onClose={() => setCostoEdicion(null)}
          title="Editar costo fijo"
          size="lg"
        >
          <FormCostoFijo
            valoresIniciales={costoEdicion}
            cuentas={cuentas}
            planCuentas={planCuentas}
            personas={personas}
            onSubmit={(cambios) => handleActualizarCosto(costoEdicion.id_costo, cambios)}
            onCancel={() => setCostoEdicion(null)}
          />
        </Modal>
      )}

      {/* ── Modal detalle ── */}
      {costoDetalle && (
        <Modal
          open={true}
          onClose={() => setCostoDetalle(null)}
          title="Detalle del costo"
          size="md"
        >
          <DetalleCosto
            costo={costoDetalle}
            planCuentas={planCuentas}
            puedeModif={puedeModif}
            puedeCrear={puedeCrear}
            onPagar={() => setModalPagar(costoDetalle)}
            onEditar={() => { setCostoDetalle(null); setCostoEdicion(costoDetalle); }}
            onArchivar={() => setConfirmArchivar(costoDetalle)}
          />
        </Modal>
      )}

      {/* ── Modal pagar ── */}
      {modalPagar && (
        <Modal
          open={true}
          onClose={() => setModalPagar(null)}
          title={`Pagar ${modalPagar.nombre}`}
          size="md"
        >
          <FormPagarCosto
            costo={modalPagar}
            cuentas={cuentas}
            personas={personas}
            onSubmit={handlePagar}
            onCancel={() => setModalPagar(null)}
          />
        </Modal>
      )}

      {/* ── Confirmar archivar ── */}
      {confirmArchivar && (
        <Modal
          open={true}
          onClose={() => setConfirmArchivar(null)}
          title="Archivar costo fijo"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmArchivar(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleArchivarCosto(confirmArchivar.id_costo)}>
                Archivar
              </Button>
            </>
          }
        >
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres archivar <span style={{ fontWeight: 500, color: '#1c1917' }}>{confirmArchivar.nombre}</span>?
          </p>
          <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
            El costo pasa a inactivo y deja de aparecer en la lista. Los pagos históricos se conservan.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CostoFijoRow - fila de costo en la lista
   ══════════════════════════════════════════════════════════════════════════ */

function CostoFijoRow({ costo, puedeCrear, onVer, onPagar }) {
  const venc = calcularProximoVencimiento(costo);
  const esVariable = costo.es_por_unidad;

  const descripcionMonto = esVariable
    ? `${formatMoney(costo.tarifa_por_unidad)}/${costo.unidad || 'unidad'}`
    : formatMoney(costo.monto_estimado);

  const frec = FRECUENCIAS.find(f => f.value === costo.frecuencia)?.label || costo.frecuencia;

  return (
    <div className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-[#fafaf9] transition-colors group cursor-pointer"
         onClick={onVer}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>
            {costo.nombre}
          </p>
          {esVariable && <Badge color="info" size="sm">Por {costo.unidad}</Badge>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-[#a8a29e]" style={{ fontWeight: 400 }}>
            {frec}
            {costo.dia_vencimiento && ` · día ${costo.dia_vencimiento}`}
            {venc && venc.dias <= 10 && (
              <span className={`ml-1 ${venc.dias <= 2 ? 'text-[#991b1b]' : venc.dias <= 5 ? 'text-[#854d0e]' : 'text-[#57534e]'}`} style={{ fontWeight: 500 }}>
                · {venc.dias === 0 ? 'vence hoy' : venc.dias === 1 ? 'vence mañana' : `vence en ${venc.dias}d`}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <p className="text-sm text-[#1c1917] fin-num" style={{ fontWeight: 500 }}>
          {descripcionMonto}
        </p>
        {puedeCrear && (
          <button
            onClick={e => { e.stopPropagation(); onPagar(); }}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-[#1c1917] text-white opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ fontWeight: 500 }}
          >
            Pagar
          </button>
        )}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   DetalleCosto
   ══════════════════════════════════════════════════════════════════════════ */

function DetalleCosto({ costo, planCuentas, puedeModif, puedeCrear, onPagar, onEditar, onArchivar }) {
  const [pagos, setPagos] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(true);
  const [tab, setTab] = useState('info');

  useEffect(() => {
    listarPagosCostoFijo(costo.id_costo)
      .then(setPagos)
      .catch(e => console.error('listarPagosCostoFijo:', e))
      .finally(() => setLoadingPagos(false));
  }, [costo.id_costo]);

  const venc = calcularProximoVencimiento(costo);
  const esVariable = costo.es_por_unidad;
  const cuentaContable = planCuentas.find(p => p.id_cuenta_contable === costo.id_cuenta_contable);
  const cat = CATEGORIAS.find(c => c.value === costo.categoria);
  const frec = FRECUENCIAS.find(f => f.value === costo.frecuencia)?.label;

  return (
    <div>
      <div className="text-center pb-4 border-b border-[#f5f5f4]">
        <div className="flex items-center justify-center gap-2 mb-1">
          {cat && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />}
          <p className="text-[10px] uppercase tracking-wider text-[#a8a29e]" style={{ fontWeight: 500 }}>
            {cat?.label || costo.categoria}
          </p>
        </div>
        <p className="text-xl text-[#1c1917]" style={{ fontWeight: 600 }}>{costo.nombre}</p>
        {esVariable ? (
          <div className="mt-2">
            <p className="text-2xl text-[#1c1917] fin-num" style={{ fontWeight: 500 }}>
              {formatMoney(costo.tarifa_por_unidad)}<span className="text-sm text-[#a8a29e]" style={{ fontWeight: 400 }}>/{costo.unidad}</span>
            </p>
            <p className="text-[11px] text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>
              Proyección: {formatMoney(costo.monto_estimado)}/{frec?.toLowerCase()}
            </p>
          </div>
        ) : (
          <p className="text-2xl text-[#1c1917] fin-num mt-2" style={{ fontWeight: 500 }}>
            {formatMoney(costo.monto_estimado)}
            <span className="text-sm text-[#a8a29e]" style={{ fontWeight: 400 }}> / {frec?.toLowerCase()}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[#f5f5f4] mt-4">
        {[
          { k: 'info', label: 'Información' },
          { k: 'pagos', label: `Pagos (${pagos.length})` },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-xs transition-colors border-b-2 -mb-px ${
              tab === t.k ? 'text-[#1c1917] border-[#1c1917]' : 'text-[#a8a29e] border-transparent hover:text-[#57534e]'
            }`}
            style={{ fontWeight: tab === t.k ? 500 : 400 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === 'info' && (
          <div className="space-y-2.5 text-sm">
            <DetField label="Código" value={costo.codigo} />
            <DetField label="Frecuencia" value={frec} />
            {costo.dia_vencimiento && <DetField label="Día de vencimiento" value={`Día ${costo.dia_vencimiento}`} />}
            {venc && <DetField label="Próximo vencimiento" value={venc.dias === 0 ? 'Hoy' : venc.dias === 1 ? 'Mañana' : `En ${venc.dias} días`} />}
            {esVariable && (
              <>
                <DetField label="Modalidad" value="Variable por unidad" />
                <DetField label="Unidad" value={costo.unidad} />
                <DetField label="Tarifa" value={formatMoney(costo.tarifa_por_unidad)} />
              </>
            )}
            {costo.cuenta_reserva && (
              <DetField label="Cuenta de reserva sugerida" value={costo.cuenta_reserva.nombre} />
            )}
            {cuentaContable && (
              <DetField label="Cuenta contable (P&L)" value={`${cuentaContable.codigo} — ${cuentaContable.nombre}`} />
            )}
            {costo.descripcion && (
              <div className="pt-2">
                <p className="text-[11px] text-[#a8a29e] uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Descripción</p>
                <p className="text-sm text-[#1c1917] bg-[#fafaf9] rounded-lg p-3" style={{ fontWeight: 400 }}>{costo.descripcion}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'pagos' && (
          loadingPagos ? <LoadingState message="Cargando pagos..." />
          : pagos.length === 0 ? (
            <EmptyState
              icon={ICONS.exchange}
              title="Sin pagos registrados"
              description="Los pagos aparecerán aquí cuando registres el primero con el botón Pagar."
            />
          ) : (
            <div className="border border-[#e7e5e4] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#fafaf9] text-[10px] text-[#a8a29e] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Fecha</th>
                    <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Cuenta</th>
                    <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map(p => (
                    <tr key={p.id_movimiento} className="border-t border-[#f5f5f4]">
                      <td className="px-3 py-2 text-[#57534e] fin-num text-[11px]" style={{ fontWeight: 400 }}>
                        {formatDate(p.fecha_movimiento)}
                      </td>
                      <td className="px-3 py-2 text-[#1c1917] text-[12px]" style={{ fontWeight: 400 }}>
                        {p.tiene_splits ? <span className="text-[#a8a29e]">— split —</span> : (p.cuenta?.nombre || '—')}
                        {p.datos_extra?.unidades && (
                          <span className="text-[10px] text-[#a8a29e] ml-1">
                            ({p.datos_extra.unidades} × {formatMoney(p.datos_extra.tarifa || 0)})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-[#991b1b] fin-num" style={{ fontWeight: 500 }}>
                        {formatMoney(p.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <div className="flex items-center gap-1">
          {puedeModif && (
            <>
              <button
                onClick={onEditar}
                className="text-xs px-3 py-2 rounded-lg text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5f5f4]"
                style={{ fontWeight: 500 }}
              >
                Editar
              </button>
              <button
                onClick={onArchivar}
                className="text-xs px-3 py-2 rounded-lg text-[#a8a29e] hover:text-[#991b1b] hover:bg-[#fef2f2]"
                style={{ fontWeight: 500 }}
              >
                Archivar
              </button>
            </>
          )}
        </div>
        {puedeCrear && (
          <Button variant="primary" onClick={onPagar}>
            Registrar pago
          </Button>
        )}
      </div>
    </div>
  );
}

function DetField({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#a8a29e] uppercase tracking-wider" style={{ fontWeight: 500 }}>{label}</span>
      <span className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormCostoFijo - crear/editar
   ══════════════════════════════════════════════════════════════════════════ */

function FormCostoFijo({ cuentas, planCuentas, personas, valoresIniciales, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria: 'servicio',
    frecuencia: 'mensual',
    monto_estimado: 0,
    dia_vencimiento: 1,
    id_responsable: null,
    id_cuenta_reserva: null,
    id_cuenta_contable: null,
    es_por_unidad: false,
    unidad: 'docena',
    tarifa_por_unidad: 0,
    activo: true,
    ...(valoresIniciales || {}),
  });
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const cuentasContablesImputables = planCuentas.filter(p => p.activa && p.permite_movimientos);
  const cuentasActivas = cuentas.filter(c => c.activa);

  // Cuando el usuario selecciona "personal", sugerir activar por_unidad
  const sugerirPorUnidad = form.categoria === 'salario';

  const validar = () => {
    const e = {};
    if (!form.codigo?.trim()) e.codigo = 'Requerido';
    if (!form.nombre?.trim()) e.nombre = 'Requerido';
    if (!form.categoria) e.categoria = 'Requerido';
    if (!form.frecuencia) e.frecuencia = 'Requerido';
    if (form.es_por_unidad) {
      if (!form.unidad?.trim()) e.unidad = 'Requerido';
      if (!(Number(form.tarifa_por_unidad) > 0)) e.tarifa = 'Debe ser > 0';
    } else {
      if (!(Number(form.monto_estimado) >= 0)) e.monto = 'Monto inválido';
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
        descripcion: form.descripcion?.trim() || null,
        categoria: form.categoria,
        frecuencia: form.frecuencia,
        monto_estimado: Number(form.monto_estimado) || 0,
        dia_vencimiento: form.frecuencia === 'mensual' || form.frecuencia === 'anual'
          ? Number(form.dia_vencimiento) || null
          : null,
        id_responsable: form.id_responsable || null,
        id_cuenta_reserva: form.id_cuenta_reserva || null,
        id_cuenta_contable: form.id_cuenta_contable || null,
        es_por_unidad: !!form.es_por_unidad,
        unidad: form.es_por_unidad ? form.unidad : null,
        tarifa_por_unidad: form.es_por_unidad ? Number(form.tarifa_por_unidad) || null : null,
        activo: form.activo !== false,
      };
      await onSubmit(payload);
    } catch (e) {
      // padre muestra alert
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Código" required error={errs.codigo} hint="Identificador único, ej: LUZ_T1039">
          <Input
            value={form.codigo}
            onChange={v => setF('codigo', v.toUpperCase())}
            placeholder="LUZ_T1039"
            error={errs.codigo}
          />
        </Field>
        <Field label="Categoría" required error={errs.categoria}>
          <Select
            value={form.categoria}
            onChange={v => setF('categoria', v)}
            options={CATEGORIAS.map(c => ({ value: c.value, label: c.label }))}
          />
        </Field>
      </div>

      <Field label="Nombre" required error={errs.nombre}>
        <Input
          value={form.nombre}
          onChange={v => setF('nombre', v)}
          placeholder="Ej: Luz tienda 1039"
          error={errs.nombre}
        />
      </Field>

      <Field label="Descripción" hint="Opcional, notas adicionales">
        <Input value={form.descripcion} onChange={v => setF('descripcion', v)} />
      </Field>

      {/* Modalidad */}
      {sugerirPorUnidad && (
        <div className="border border-[#e7e5e4] rounded-lg p-3 mb-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.es_por_unidad}
              onChange={e => setF('es_por_unidad', e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Variable por unidad de producción</p>
              <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
                Para pagos tipo aparadores S/.40/docena o armador S/.30/docena. Al pagar se ingresan unidades
                reales y el monto se calcula automáticamente.
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Frecuencia + monto / por unidad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Frecuencia" required error={errs.frecuencia}>
          <Select
            value={form.frecuencia}
            onChange={v => setF('frecuencia', v)}
            options={FRECUENCIAS.map(f => ({ value: f.value, label: f.label }))}
          />
        </Field>

        {form.es_por_unidad ? (
          <Field label="Unidad" required error={errs.unidad}>
            <Select
              value={form.unidad}
              onChange={v => setF('unidad', v)}
              options={UNIDADES_COMUNES}
            />
          </Field>
        ) : (
          (form.frecuencia === 'mensual' || form.frecuencia === 'anual') && (
            <Field label="Día de vencimiento" hint="Día del mes o año">
              <Input
                type="number"
                value={form.dia_vencimiento}
                onChange={v => setF('dia_vencimiento', v)}
                placeholder="1-31"
              />
            </Field>
          )
        )}
      </div>

      {form.es_por_unidad ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tarifa por unidad" required error={errs.tarifa} hint={`S/. por ${form.unidad || 'unidad'}`}>
            <MoneyInput
              value={form.tarifa_por_unidad}
              onChange={v => setF('tarifa_por_unidad', v || 0)}
            />
          </Field>
          <Field label={`Proyección ${form.frecuencia}`} hint="Monto estimado para el dashboard">
            <MoneyInput value={form.monto_estimado} onChange={v => setF('monto_estimado', v || 0)} />
          </Field>
        </div>
      ) : (
        <Field label="Monto estimado" required error={errs.monto}>
          <MoneyInput value={form.monto_estimado} onChange={v => setF('monto_estimado', v || 0)} />
        </Field>
      )}

      <Field label="Cuenta contable (P&L)" hint="Define a qué sección del Estado de Resultados afecta">
        <Select
          value={form.id_cuenta_contable || ''}
          onChange={v => setF('id_cuenta_contable', v ? Number(v) : null)}
          options={[
            { value: '', label: '— Sin asignar —' },
            ...cuentasContablesImputables.map(p => ({
              value: p.id_cuenta_contable,
              label: `${p.codigo} — ${p.nombre}`,
            })),
          ]}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Responsable" hint="Quien tiene que pagarlo (informativo)">
          <Select
            value={form.id_responsable || ''}
            onChange={v => setF('id_responsable', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin responsable —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>
        <Field label="Cuenta de reserva" hint="Cuenta sugerida al pagar">
          <Select
            value={form.id_cuenta_reserva || ''}
            onChange={v => setF('id_cuenta_reserva', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin reserva —' },
              ...cuentasActivas.map(c => ({
                value: c.id_cuenta,
                label: c.nombre + (c.alias ? ` (${c.alias})` : ''),
              })),
            ]}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormPagarCosto - registrar un pago contra un costo
   ══════════════════════════════════════════════════════════════════════════ */

function FormPagarCosto({ costo, cuentas, personas, onSubmit, onCancel }) {
  const esVariable = costo.es_por_unidad;

  const [unidades, setUnidades] = useState(0);
  const [monto, setMonto] = useState(esVariable ? 0 : Number(costo.monto_estimado) || 0);
  const [concepto, setConcepto] = useState('');
  const [modoSplit, setModoSplit] = useState(false);
  const [idCuenta, setIdCuenta] = useState(costo.id_cuenta_reserva || null);
  const [splits, setSplits] = useState([{ id_cuenta: null, monto: 0 }]);
  const [idPersona, setIdPersona] = useState(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 16));
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cuentasActivas = cuentas.filter(c => c.activa);

  /* Monto calculado cuando es por unidad */
  const montoCalculado = esVariable
    ? Number(unidades || 0) * Number(costo.tarifa_por_unidad || 0)
    : Number(monto || 0);

  /* Split totals */
  const totalSplits = useMemo(() => splits.reduce((s, x) => s + (Number(x.monto) || 0), 0), [splits]);

  const handleSplitChange = (idx, field, value) => {
    setSplits(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };
  const handleAddSplit = () => setSplits(prev => [...prev, { id_cuenta: null, monto: 0 }]);
  const handleRemoveSplit = (idx) => setSplits(prev => prev.filter((_, i) => i !== idx));

  /* Cuenta única queda en negativo */
  const cuentaSeleccionada = !modoSplit && idCuenta
    ? cuentasActivas.find(c => c.id_cuenta === Number(idCuenta))
    : null;
  const saldoTrasPago = cuentaSeleccionada
    ? Number(cuentaSeleccionada.saldo_actual) - montoCalculado
    : null;
  const irAQuedarNegativa = saldoTrasPago !== null && saldoTrasPago < 0;

  /* Splits negativos */
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

  const validar = () => {
    const e = {};
    if (esVariable && !(Number(unidades) > 0)) e.unidades = 'Unidades debe ser > 0';
    if (!esVariable && !(Number(monto) > 0)) e.monto = 'Monto debe ser > 0';
    if (!modoSplit && !idCuenta) e.cuenta = 'Selecciona una cuenta';
    if (modoSplit) {
      if (splits.some(s => !s.id_cuenta)) e.splits = 'Cada split necesita cuenta';
      else if (Math.abs(totalSplits - montoCalculado) > 0.01) {
        e.splits = `Suma de splits (${formatMoney(totalSplits)}) ≠ monto (${formatMoney(montoCalculado)})`;
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
      await onSubmit({
        idCosto: costo.id_costo,
        monto: esVariable ? null : Number(monto),
        unidades: esVariable ? Number(unidades) : null,
        concepto: concepto || null,
        idCuenta: modoSplit ? null : Number(idCuenta),
        splits: modoSplit ? splits.map(s => ({ id_cuenta: Number(s.id_cuenta), monto: Number(s.monto) })) : null,
        idPersona: idPersona || null,
        fecha: fecha ? new Date(fecha).toISOString() : null,
      });
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

  return (
    <div>
      <div className="bg-[#fafaf9] rounded-lg p-3 mb-4 text-center">
        <p className="text-[10px] uppercase tracking-wider text-[#a8a29e] mb-1" style={{ fontWeight: 500 }}>Pagando</p>
        <p className="text-lg text-[#1c1917]" style={{ fontWeight: 600 }}>{costo.nombre}</p>
        {esVariable && (
          <p className="text-[11px] text-[#a8a29e] mt-1" style={{ fontWeight: 400 }}>
            {formatMoney(costo.tarifa_por_unidad)} por {costo.unidad}
          </p>
        )}
      </div>

      {esVariable ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={`Cantidad de ${costo.unidad}s`} required error={errs.unidades}>
              <Input
                type="number"
                value={unidades}
                onChange={setUnidades}
                placeholder="Ej: 5"
              />
            </Field>
            <Field label="Monto calculado">
              <div className="h-10 px-3 rounded-lg border border-[#e7e5e4] bg-[#fafaf9] flex items-center">
                <span className="text-base text-[#1c1917] fin-num" style={{ fontWeight: 600 }}>
                  {formatMoney(montoCalculado)}
                </span>
                <span className="text-[11px] text-[#a8a29e] ml-2" style={{ fontWeight: 400 }}>
                  ({unidades || 0} × {formatMoney(costo.tarifa_por_unidad)})
                </span>
              </div>
            </Field>
          </div>
        </>
      ) : (
        <Field label="Monto" required error={errs.monto}>
          <MoneyInput value={monto} onChange={v => setMonto(v || 0)} />
        </Field>
      )}

      <Field label="Concepto" hint="Opcional, se agrega al movimiento">
        <Input
          value={concepto}
          onChange={setConcepto}
          placeholder={`Ej: ${costo.nombre} - ${new Date().toLocaleDateString('es-PE')}`}
        />
      </Field>

      <Field label="Fecha" required>
        <Input type="datetime-local" value={fecha} onChange={setFecha} />
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
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Pagar desde varias cuentas</p>
            <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Útil cuando el pago se divide entre caja producción y administración.
            </p>
          </div>
        </label>
      </div>

      {!modoSplit && (
        <>
          <Field label="Pagar desde" required error={errs.cuenta}
                 hint={costo.id_cuenta_reserva ? 'Se sugirió la cuenta de reserva' : null}>
            <Select
              value={idCuenta || ''}
              onChange={v => setIdCuenta(v ? Number(v) : null)}
              options={[{ value: '', label: '— Elegir cuenta —' }, ...opcionesCuentas]}
            />
          </Field>

          {irAQuedarNegativa && (
            <div className="-mt-2 mb-4 p-2.5 rounded-lg bg-[#fef3c7] border border-[#fcd34d] flex items-start gap-2">
              <Icon d={ICONS.alert} size={14} className="text-[#854d0e] mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-[#854d0e]" style={{ fontWeight: 400 }}>
                <span style={{ fontWeight: 500 }}>Atención:</span> {cuentaSeleccionada?.nombre} quedará en{' '}
                <span className="fin-num" style={{ fontWeight: 500 }}>{formatMoney(saldoTrasPago)}</span>
                . El sistema lo permite, pero recuerda reponerlo.
              </div>
            </div>
          )}
        </>
      )}

      {modoSplit && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#57534e] uppercase tracking-wider" style={{ fontWeight: 500 }}>Cuentas</p>
            <p className="text-[11px] text-[#a8a29e] fin-num" style={{ fontWeight: 500 }}>
              Total: {formatMoney(totalSplits)} / {formatMoney(montoCalculado)}
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

          {splitsNegativos.length > 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-[#fef3c7] border border-[#fcd34d] flex items-start gap-2">
              <Icon d={ICONS.alert} size={14} className="text-[#854d0e] mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-[#854d0e] flex-1" style={{ fontWeight: 400 }}>
                <span style={{ fontWeight: 500 }}>Atención:</span>{' '}
                {splitsNegativos.length === 1
                  ? `${splitsNegativos[0].cuenta.nombre} quedará en ${formatMoney(splitsNegativos[0].tras)}`
                  : `${splitsNegativos.length} cuentas quedarán en negativo`}
                . El sistema lo permite, pero recuerda reponer.
              </div>
            </div>
          )}
        </div>
      )}

      <Field label="Pagado por" hint="Quien registra el pago">
        <Select
          value={idPersona || ''}
          onChange={v => setIdPersona(v ? Number(v) : null)}
          options={[
            { value: '', label: '— Sin persona —' },
            ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
          ]}
        />
      </Field>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Pagando...</> : `Registrar pago ${formatMoney(montoCalculado)}`}
        </Button>
      </div>
    </div>
  );
}