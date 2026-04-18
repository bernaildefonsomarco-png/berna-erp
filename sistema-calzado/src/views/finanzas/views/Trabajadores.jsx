import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listarTrabajadores, crearTrabajador, actualizarTrabajador, eliminarTrabajador,
  listarPagosTrabajador, obtenerCostoFijoTrabajador, pagarCostoFijo,
  listarCuentas, listarPermisosDePersona, asignarPermiso, revocarPermiso,
  listarUbicacionesTiendas, listarPersonasConAccesoFinanzas,
} from '../api/finanzasClient';
import { formatMoney, formatDate } from '../lib/calculos';
import { esAdmin, puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, Badge, Button, Modal, Field, Input, Select, MoneyInput,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
  SideSheet, AvatarInitials, InlineTabs,
} from '../components/UI';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const AREAS = [
  { value: 'taller',         label: 'Taller',         color: '#d97706', bg: '#fef3c7', icon: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z' },
  { value: 'tienda',         label: 'Tienda',         color: '#7c3aed', bg: '#ede9fe', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'administracion', label: 'Administración', color: '#0369a1', bg: '#e0f2fe', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
];

const CONTRATOS = [
  { value: 'fijo',    label: 'Fijo / Sueldo',       desc: 'Pago fijo mensual/semanal',         color: 'text-emerald-700 bg-emerald-50' },
  { value: 'destajo', label: 'Por producción',       desc: 'Pago por docena, par u otra unidad', color: 'text-blue-700 bg-blue-50' },
  { value: 'mixto',   label: 'Mixto',               desc: 'Base fija + componente variable',   color: 'text-purple-700 bg-purple-50' },
];

const FRECUENCIAS = [
  { value: 'semanal',   label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual',   label: 'Mensual' },
];

const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
];

const UNIDADES = [
  { value: 'docena', label: 'Docena' },
  { value: 'par',    label: 'Par' },
  { value: 'pieza',  label: 'Pieza' },
  { value: 'hora',   label: 'Hora' },
];

const CARGOS_SUGERIDOS_TALLER = ['Aparadora', 'Armador', 'Acabadora', 'Ayudante taller', 'Cortador', 'Montador'];
const CARGOS_SUGERIDOS_TIENDA = ['Vendedora', 'Cajera', 'Encargada', 'Auxiliar tienda'];
const CARGOS_SUGERIDOS_ADMIN = ['Administradora', 'Caja', 'Compras', 'Coordinación', 'Contabilidad'];

const NIVELES_FIN = [
  { value: 'ver',       label: 'Solo ver' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'editar',    label: 'Editar' },
  { value: 'admin',     label: 'Administrar' },
];

function getAreaConf(value) {
  return AREAS.find(a => a.value === value) || AREAS[0];
}

function getContratoConf(value) {
  return CONTRATOS.find(c => c.value === value) || CONTRATOS[0];
}

function getCargosSugeridos(area) {
  if (area === 'taller') return CARGOS_SUGERIDOS_TALLER;
  if (area === 'administracion') return CARGOS_SUGERIDOS_ADMIN;
  return CARGOS_SUGERIDOS_TIENDA;
}

function normalizarPuestosAdicionales(puestos, areasFallback = []) {
  if (Array.isArray(puestos) && puestos.length > 0) {
    return puestos
      .filter(Boolean)
      .map((p) => ({
        area: p.area,
        cargo: typeof p.cargo === 'string' ? p.cargo : '',
      }))
      .filter((p) => p.area);
  }
  return (areasFallback || []).map((area) => ({ area, cargo: '' }));
}

function obtenerAreasDesdePuestos(puestos) {
  return [...new Set((puestos || []).map((p) => p.area).filter(Boolean))];
}

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function Trabajadores({ usuario }) {
  const [trabajadores, setTrabajadores] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [sheetNuevo, setSheetNuevo] = useState(false);
  const [trabajadorDetalle, setTrabajadorDetalle] = useState(null);

  const puedeCrear  = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif  = puedeEditar(usuario, RECURSOS.FINANZAS);
  const esAdminFin  = esAdmin(usuario, RECURSOS.FINANZAS);

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [tw, cs, ubs] = await Promise.all([
        listarTrabajadores({ incluirInactivos: !soloActivos }),
        listarCuentas(),
        listarUbicacionesTiendas(),
      ]);
      setTrabajadores(tw); setCuentas(cs); setUbicaciones(ubs);
    } catch (e) { setError(e.message || 'Error al cargar'); }
    finally { setLoading(false); }
  }, [soloActivos]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    if (!filtroArea) return trabajadores;
    return trabajadores.filter(t => t.area === filtroArea);
  }, [trabajadores, filtroArea]);

  const stats = useMemo(() => ({
    total:  trabajadores.length,
    taller: trabajadores.filter(t => t.area === 'taller').length,
    tienda: trabajadores.filter(t => t.area === 'tienda').length,
    admin:  trabajadores.filter(t => t.area === 'administracion').length,
    nominaMensual: trabajadores.filter(t => t.tipo_contrato === 'fijo').reduce((s, t) => s + (Number(t.salario_base) || 0), 0),
  }), [trabajadores]);

  const handleCrear = async (payload) => {
    await crearTrabajador(payload);
    setSheetNuevo(false);
    await cargar();
  };

  if (loading) return <LoadingState message="Cargando trabajadores..." />;

  return (
    <>
      <PageHeader
        title="Trabajadores"
        description="Gestión de personal, nómina y pagos de todo el equipo."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => setSheetNuevo(true)}>
            Nuevo trabajador
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>
      )}

      {/* ── Stats de área ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total',          value: stats.total,          sub: 'activos' },
          { label: 'Taller',         value: stats.taller,         sub: 'trabajadores' },
          { label: 'Tienda',         value: stats.tienda,         sub: 'vendedoras/as' },
          { label: 'Nómina fija',    value: formatMoney(stats.nominaMensual), sub: '/mes estimado' },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{s.label}</p>
            <p className="text-xl font-semibold text-foreground fin-num">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
          {[{ value: '', label: 'Todos' }, ...AREAS].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFiltroArea(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-all',
                filtroArea === opt.value ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={e => setSoloActivos(e.target.checked)}
            className="rounded"
          />
          Solo activos
        </label>
      </div>

      {/* ── Grid de workers ── */}
      {filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.users}
            title="Sin trabajadores"
            description={filtroArea ? `No hay trabajadores en ${AREAS.find(a => a.value === filtroArea)?.label}.` : 'Agrega tu primer trabajador para gestionar pagos de nómina.'}
            action={puedeCrear && !filtroArea && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => setSheetNuevo(true)}>Agregar trabajador</Button>
            )}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map(t => (
            <TrabajadorCard
              key={t.id_persona}
              trabajador={t}
              onClick={() => setTrabajadorDetalle(t)}
            />
          ))}
        </div>
      )}

      {/* ── Sheet Nuevo trabajador ── */}
      <SideSheet
        open={sheetNuevo}
        onClose={() => setSheetNuevo(false)}
        title="Nuevo trabajador"
        description="Completa los datos básicos y configura su forma de pago."
        size="md"
      >
        <FormNuevoTrabajador
          ubicaciones={ubicaciones}
          onSubmit={handleCrear}
          onCancel={() => setSheetNuevo(false)}
        />
      </SideSheet>

      {/* ── Sheet Detalle ── */}
      {trabajadorDetalle && (
        <SheetDetalleTrabajador
          trabajador={trabajadorDetalle}
          cuentas={cuentas}
          ubicaciones={ubicaciones}
          usuario={usuario}
          puedeModif={puedeModif}
          puedeCrear={puedeCrear}
          esAdminFin={esAdminFin}
          onClose={() => setTrabajadorDetalle(null)}
          onRefresh={async () => {
            await cargar();
            const updated = (await listarTrabajadores({ incluirInactivos: !soloActivos }))
              .find(t => t.id_persona === trabajadorDetalle.id_persona);
            if (updated) setTrabajadorDetalle(updated);
          }}
        />
      )}
    </>
  );
}


/* ── TrabajadorCard ─────────────────────────────────────────────────────── */

function TrabajadorCard({ trabajador: t, onClick }) {
  const area = getAreaConf(t.area);
  const contrato = getContratoConf(t.tipo_contrato);
  const puestosAdicionales = normalizarPuestosAdicionales(t.puestos_adicionales, t.areas_adicionales);
  const esPorUnidad = t.es_por_unidad;
  const pagoDesc = esPorUnidad
    ? `${formatMoney(t.tarifa_por_unidad || 0)}/${t.unidad || 'unidad'}`
    : t.salario_base ? formatMoney(t.salario_base) : '—';
  const frec = { semanal: 'semanal', quincenal: 'quincenal', mensual: 'mensual' }[t.frecuencia_pago] || '';

  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-card rounded-xl border border-border p-4 hover:shadow-md hover:border-border-hover transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <AvatarInitials name={t.nombre} size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{t.nombre}</p>
            <p className="text-xs text-muted-foreground truncate">{t.cargo || area.label}</p>
          </div>
        </div>
        {!t.activa && <Badge color="gray" size="sm">Inactivo</Badge>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ backgroundColor: area.bg, color: area.color }}>
          <Icon d={area.icon} size={9} />
          {area.label}
        </span>
        {puestosAdicionales.map((puesto) => {
          const aC = AREAS.find(a => a.value === puesto.area);
          if (!aC) return null;
          return (
            <span key={`${puesto.area}-${puesto.cargo || 'sin-cargo'}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ backgroundColor: aC.bg, color: aC.color }}>
              <Icon d={aC.icon} size={9} />
              {puesto.cargo ? `${aC.label}: ${puesto.cargo}` : aC.label}
            </span>
          );
        })}
        {t.es_rotativo && t.area === 'tienda' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            ROTATIVA
          </span>
        )}
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold', contrato.color)}>
          {contrato.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pago</p>
          <p className="text-base font-bold text-foreground fin-num">{pagoDesc}</p>
          {frec && <p className="text-[10px] text-muted-foreground">{frec}</p>}
        </div>
        {Number(t.total_pagado_mes) > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Este mes</p>
            <p className="text-sm font-semibold text-emerald-700 fin-num">{formatMoney(t.total_pagado_mes)}</p>
            <p className="text-[10px] text-muted-foreground">{t.pagos_mes} pago{t.pagos_mes !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>
    </button>
  );
}


/* ── SheetDetalleTrabajador ─────────────────────────────────────────────── */

function SheetDetalleTrabajador({ trabajador, cuentas, ubicaciones, usuario, puedeModif, puedeCrear, esAdminFin, onClose, onRefresh }) {
  const [tab, setTab] = useState('nomina');
  const [pagos, setPagos] = useState([]);
  const [costoFijo, setCostoFijo] = useState(null);
  const [permisos, setPermisos] = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [sheetPago, setSheetPago] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    setLoadingPagos(true);
    Promise.all([
      listarPagosTrabajador(trabajador.id_persona),
      obtenerCostoFijoTrabajador(trabajador.id_persona),
      esAdminFin ? listarPermisosDePersona(trabajador.id_persona) : Promise.resolve([]),
    ])
      .then(([p, cf, pm]) => { setPagos(p); setCostoFijo(cf); setPermisos(pm.filter(x => x.activo)); })
      .catch(console.error)
      .finally(() => setLoadingPagos(false));
  }, [trabajador.id_persona, esAdminFin]);

  const area = getAreaConf(trabajador.area);
  const contrato = getContratoConf(trabajador.tipo_contrato);
  const puestosAdicionales = normalizarPuestosAdicionales(trabajador.puestos_adicionales, trabajador.areas_adicionales);
  const totalPagadoMes = pagos
    .filter(p => new Date(p.fecha_movimiento) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    .reduce((s, p) => s + Number(p.monto), 0);

  const handlePago = async (payload) => {
    await pagarCostoFijo(payload);
    setSheetPago(false);
    const [p] = await Promise.all([listarPagosTrabajador(trabajador.id_persona)]);
    setPagos(p);
    await onRefresh();
  };

  const handleTogglePerm = async (recurso, activar, nivel = 'ver') => {
    try {
      if (activar) await asignarPermiso(trabajador.id_persona, recurso, nivel);
      else         await revocarPermiso(trabajador.id_persona, recurso);
      const pm = await listarPermisosDePersona(trabajador.id_persona);
      setPermisos(pm.filter(x => x.activo));
    } catch (e) { alert(e.message || 'Error'); }
  };

  const handleEliminarTrabajador = async () => {
    setEliminando(true);
    try {
      const res = await eliminarTrabajador(trabajador.id_persona);
      setConfirmEliminar(false);
      onClose();
      await onRefresh();
      if (res.mode === 'archived') {
        alert('El trabajador tenía historial, así que fue archivado/desactivado en lugar de eliminarse.');
      } else {
        alert('Trabajador eliminado correctamente.');
      }
    } catch (e) {
      alert(e.message || 'No se pudo eliminar el trabajador');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <SideSheet
        open={true}
        onClose={onClose}
        title={trabajador.nombre}
        size="sm"
      >
        {/* Hero */}
        <div className="flex items-center gap-4 pb-4 mb-1 border-b border-border/50">
          <AvatarInitials name={trabajador.nombre} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                style={{ backgroundColor: area.bg, color: area.color }}>
                <Icon d={area.icon} size={9} />
                {area.label}
              </span>
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold', contrato.color)}>
                {contrato.label}
              </span>
              {!trabajador.activa && <Badge color="gray" size="sm">Inactivo</Badge>}
            </div>
            {trabajador.cargo && <p className="text-xs text-muted-foreground mt-1">{trabajador.cargo}</p>}
            {puestosAdicionales.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {puestosAdicionales.map((puesto) => {
                  const areaExtra = getAreaConf(puesto.area);
                  return (
                    <span
                      key={`${puesto.area}-${puesto.cargo || 'sin-cargo'}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                      style={{ backgroundColor: areaExtra.bg, color: areaExtra.color }}
                    >
                      <Icon d={areaExtra.icon} size={9} />
                      {puesto.cargo ? `${areaExtra.label}: ${puesto.cargo}` : areaExtra.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <InlineTabs
          tabs={[
            { k: 'nomina',   label: 'Nómina' },
            { k: 'pagos',    label: `Pagos (${pagos.length})` },
            { k: 'perfil',   label: 'Perfil' },
            ...(esAdminFin ? [{ k: 'permisos', label: 'Permisos' }] : []),
          ]}
          active={tab}
          onChange={setTab}
          className="mb-4"
        />

        {/* ── Tab Nómina ── */}
        {tab === 'nomina' && (
          <div className="space-y-4">
            {/* Resumen del mes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Pagado este mes</p>
                <p className="text-lg font-bold text-emerald-700 fin-num">{formatMoney(totalPagadoMes)}</p>
                <p className="text-[10px] text-muted-foreground">{pagos.filter(p => new Date(p.fecha_movimiento) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length} pago(s)</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {trabajador.tipo_contrato === 'destajo' ? 'Tarifa' : 'Sueldo base'}
                </p>
                {trabajador.es_por_unidad ? (
                  <>
                    <p className="text-lg font-bold text-foreground fin-num">{formatMoney(trabajador.tarifa_por_unidad || 0)}</p>
                    <p className="text-[10px] text-muted-foreground">por {trabajador.unidad || 'unidad'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-foreground fin-num">{formatMoney(trabajador.salario_base || 0)}</p>
                    <p className="text-[10px] text-muted-foreground">{trabajador.frecuencia_pago || 'mensual'}</p>
                  </>
                )}
              </div>
            </div>

            {/* Costo fijo vinculado */}
            {costoFijo && (
              <div className="p-3 rounded-xl border border-border/50 bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <Icon d={ICONS.document} size={12} className="text-muted-foreground" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Gasto fijo vinculado</p>
                </div>
                <p className="text-sm font-medium text-foreground">{costoFijo.nombre}</p>
                <p className="text-xs text-muted-foreground">{costoFijo.codigo}</p>
              </div>
            )}

            {puedeCrear && (
              <Button
                variant="primary"
                icon={ICONS.coins}
                onClick={() => setSheetPago(true)}
                className="w-full"
                disabled={!costoFijo}
              >
                {costoFijo ? 'Registrar pago' : 'Sin costo fijo vinculado'}
              </Button>
            )}

            {!costoFijo && puedeModif && (
              <p className="text-xs text-muted-foreground text-center">
                Edita el perfil para configurar el tipo de pago y se creará el costo fijo automáticamente.
              </p>
            )}
          </div>
        )}

        {/* ── Tab Pagos ── */}
        {tab === 'pagos' && (
          <div>
            {loadingPagos ? (
              <LoadingState message="Cargando pagos..." />
            ) : pagos.length === 0 ? (
              <EmptyState icon={ICONS.exchange} title="Sin pagos" description="Los pagos registrados aparecerán aquí." />
            ) : (
              <div className="space-y-2">
                {pagos.map(p => (
                  <div key={p.id_movimiento} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/20">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Icon d={ICONS.coins} size={13} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.cuenta?.nombre || '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(p.fecha_movimiento)}</p>
                      {p.datos_extra?.unidades && (
                        <p className="text-[10px] text-muted-foreground">
                          {p.datos_extra.unidades} {trabajador.unidad}s × {formatMoney(p.datos_extra.tarifa || 0)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-red-700 fin-num shrink-0">{formatMoney(p.monto)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab Perfil ── */}
        {tab === 'perfil' && (
          <div className="space-y-4">
            <FormEditarPerfil
              trabajador={trabajador}
              ubicaciones={ubicaciones}
              costoFijo={costoFijo}
              puedeModif={puedeModif}
              onSave={async (cambios) => {
                await actualizarTrabajador(trabajador.id_persona, cambios);
                await onRefresh();
              }}
            />
            {puedeModif && usuario?.id_persona !== trabajador.id_persona && (
              <div className="border-t border-border/60 pt-4">
                <Button variant="danger" icon={ICONS.trash} onClick={() => setConfirmEliminar(true)} className="w-full">
                  Eliminar trabajador
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Si el trabajador tiene historial, se archivará automáticamente para conservar los registros.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab Permisos ── */}
        {tab === 'permisos' && esAdminFin && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/50 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Finanzas</p>
                {permisos.find(p => p.recurso === 'finanzas') ? (
                  <div className="space-y-2">
                    <Select
                      value={permisos.find(p => p.recurso === 'finanzas')?.nivel_acceso || 'ver'}
                      onChange={v => handleTogglePerm('finanzas', true, v)}
                      options={NIVELES_FIN}
                    />
                    {usuario?.id_persona !== trabajador.id_persona && (
                      <button
                        onClick={() => handleTogglePerm('finanzas', false)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Revocar acceso a Finanzas
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground flex-1">Sin acceso</span>
                    <Button size="sm" variant="primary" onClick={() => handleTogglePerm('finanzas', true, 'ver')}>
                      Dar acceso
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Caja POS</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!permisos.find(p => p.recurso === 'caja')}
                  onChange={e => handleTogglePerm('caja', e.target.checked)}
                />
                Acceso a la caja del POS
              </label>
            </div>

            <div className="p-4 rounded-xl border border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Modo Rápido</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!permisos.find(p => p.recurso === 'comando')}
                  onChange={e => handleTogglePerm('comando', e.target.checked, 'registrar')}
                />
                Acceso al Modo Rápido
              </label>
            </div>
          </div>
        )}
      </SideSheet>

      {/* Sheet para pagar */}
      {sheetPago && costoFijo && (
        <SideSheet
          open={true}
          onClose={() => setSheetPago(false)}
          title={`Pagar a ${trabajador.nombre}`}
          size="sm"
        >
          <FormPagoTrabajador
            trabajador={trabajador}
            costoFijo={costoFijo}
            cuentas={cuentas}
            onSubmit={handlePago}
            onCancel={() => setSheetPago(false)}
          />
        </SideSheet>
      )}

      {confirmEliminar && (
        <Modal
          open={true}
          onClose={() => setConfirmEliminar(false)}
          title="Eliminar trabajador"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmEliminar(false)} disabled={eliminando}>Cancelar</Button>
              <Button variant="danger" onClick={handleEliminarTrabajador} disabled={eliminando}>
                {eliminando ? 'Procesando...' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar a <span className="font-medium text-foreground">{trabajador.nombre}</span>?
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Si ya tiene ventas, pagos, caja, deudas u otros registros relacionados, no se borrará físicamente: se marcará como inactivo para conservar el historial.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ── PuestosAdicionalesEditor ───────────────────────────────────────────── */

function PuestosAdicionalesEditor({ areaPrincipal, puestosAdicionales, onChange, disabled }) {
  const opciones = AREAS.filter(a => a.value !== areaPrincipal);
  const actual = puestosAdicionales || [];

  const toggle = (area) => {
    if (disabled) return;
    const existe = actual.some((p) => p.area === area);
    if (existe) {
      onChange(actual.filter((p) => p.area !== area));
      return;
    }
    onChange([...actual, { area, cargo: '' }]);
  };

  const setCargo = (area, cargo) => {
    onChange(actual.map((p) => (p.area === area ? { ...p, cargo } : p)));
  };

  if (opciones.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {opciones.map((a) => {
          const activo = actual.some((p) => p.area === a.value);
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => toggle(a.value)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all',
                activo
                  ? 'border-foreground bg-foreground/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              )}
            >
              <Icon d={a.icon} size={10} style={activo ? { color: a.color } : {}} />
              {a.label}
              {activo && <Icon d={ICONS.check} size={9} className="ml-0.5" />}
            </button>
          );
        })}
      </div>

      {actual.length > 0 && (
        <div className="space-y-2">
          {actual.map((puesto) => {
            const area = getAreaConf(puesto.area);
            const sugeridos = getCargosSugeridos(puesto.area);
            return (
              <div key={puesto.area} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ backgroundColor: area.bg, color: area.color }}
                  >
                    <Icon d={area.icon} size={9} />
                    {area.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">Puesto específico</span>
                </div>
                <Input
                  value={puesto.cargo}
                  onChange={(v) => setCargo(puesto.area, v)}
                  disabled={disabled}
                  placeholder={sugeridos[0] || 'Ej: Apoyo'}
                />
                {sugeridos.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sugeridos.map((cargo) => (
                      <button
                        key={`${puesto.area}-${cargo}`}
                        type="button"
                        onClick={() => setCargo(puesto.area, cargo)}
                        disabled={disabled}
                        className="px-2 py-0.5 text-[10px] rounded-full border border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground transition-colors"
                      >
                        {cargo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── FormEditarPerfil ───────────────────────────────────────────────────── */

function FormEditarPerfil({ trabajador, ubicaciones, costoFijo, puedeModif, onSave }) {
  const [nombre, setNombre]               = useState(trabajador.nombre);
  const [cargo, setCargo]                 = useState(trabajador.cargo || '');
  const [area, setArea]                   = useState(trabajador.area || 'tienda');
  const [idUbicacionPreferida, setIdUbicacionPreferida] = useState(trabajador.id_ubicacion_preferida || null);
  const [tipoContrato, setTipoContrato]   = useState(trabajador.tipo_contrato || 'fijo');
  const [salarioBase, setSalarioBase]     = useState(Number(trabajador.salario_base ?? trabajador.monto_estimado) || 0);
  const [frecuenciaPago, setFrecuencia]   = useState(trabajador.frecuencia_pago || 'mensual');
  const [diaPago, setDiaPago]             = useState(
    costoFijo?.dia_vencimiento ?? costoFijo?.dia_vencimiento_mes ?? costoFijo?.dia_vencimiento_semana ?? ''
  );
  const [tarifaUnidad, setTarifaUnidad]   = useState(Number(trabajador.tarifa_por_unidad) || 0);
  const [unidadPago, setUnidadPago]       = useState(trabajador.unidad || 'docena');
  const [puestosAdicionales, setPuestosAd] = useState(
    normalizarPuestosAdicionales(trabajador.puestos_adicionales, trabajador.areas_adicionales)
  );
  const [esRotativo, setEsRotativo]       = useState(trabajador.es_rotativo ?? false);
  const [telefono, setTelefono]           = useState(trabajador.telefono || '');
  const [notas, setNotas]                 = useState(trabajador.notas_trabajador || '');
  const [fechaIngreso, setFechaI]         = useState(trabajador.fecha_ingreso || '');
  const [activa, setActiva]               = useState(trabajador.activa);
  const [saving, setSaving]               = useState(false);
  const tiendasOptions = (ubicaciones || []).filter((u) => u.rol === 'Tienda');
  const talleresOptions = (ubicaciones || []).filter((u) => u.rol === 'Fabrica');
  const mostrarDiaMes = tipoContrato !== 'destajo' && ['mensual'].includes(frecuenciaPago);
  const mostrarDiaSemana = tipoContrato !== 'destajo' && frecuenciaPago === 'semanal';

  useEffect(() => {
    setDiaPago(costoFijo?.dia_vencimiento ?? costoFijo?.dia_vencimiento_mes ?? costoFijo?.dia_vencimiento_semana ?? '');
  }, [costoFijo?.dia_vencimiento, costoFijo?.dia_vencimiento_mes, costoFijo?.dia_vencimiento_semana]);

  // Si cambia el área principal, quitar esa área de adicionales
  const handleAreaChange = (v) => {
    setArea(v);
    setPuestosAd((prev) => prev.filter((p) => p.area !== v));
    if (v !== 'tienda') setEsRotativo(false);
    setIdUbicacionPreferida(null);
  };

  const handleSave = async () => {
    if (tipoContrato === 'destajo' && !(Number(tarifaUnidad) > 0)) {
      alert('Para modalidad por producción, la tarifa por unidad debe ser mayor a 0.');
      return;
    }
    if (mostrarDiaMes) {
      const d = Number(diaPago);
      if (!diaPago || d < 1 || d > 31) {
        alert('Ingresa un día de pago válido entre 1 y 31.');
        return;
      }
    }
    const faltan = puestosAdicionales.some((p) => !String(p.cargo || '').trim());
    if (faltan) {
      alert('Completa el puesto específico de cada área adicional.');
      return;
    }
    if (area === 'tienda' && !esRotativo && !idUbicacionPreferida) {
      alert('Selecciona la tienda asignada para esta vendedora.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        nombre: nombre.trim(),
        cargo: cargo.trim() || null,
        area,
        tipo_contrato: tipoContrato,
        salario_base: (tipoContrato === 'fijo' || tipoContrato === 'mixto') ? Number(salarioBase || 0) : 0,
        frecuencia_pago: frecuenciaPago,
        dia_vencimiento: (mostrarDiaMes || mostrarDiaSemana) ? Number(diaPago) : null,
        tarifa_por_unidad: (tipoContrato === 'destajo') ? Number(tarifaUnidad || 0) : null,
        unidad: (tipoContrato === 'destajo') ? unidadPago : null,
        areas_adicionales: obtenerAreasDesdePuestos(puestosAdicionales),
        puestos_adicionales: puestosAdicionales.map((p) => ({ area: p.area, cargo: (p.cargo || '').trim() })),
        es_rotativo: area === 'tienda' ? esRotativo : false,
        id_ubicacion_preferida: area === 'tienda'
          ? (esRotativo ? null : idUbicacionPreferida)
          : idUbicacionPreferida,
        telefono: telefono.trim() || null,
        notas_trabajador: notas.trim() || null,
        fecha_ingreso: fechaIngreso || null,
        activa,
      });
    } catch (e) { alert(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Field label="Nombre" required>
        <Input value={nombre} onChange={setNombre} disabled={!puedeModif} />
      </Field>
      <Field label="Cargo" hint="Ej: Aparadora, Vendedora, Armador">
        <Input value={cargo} onChange={setCargo} disabled={!puedeModif} placeholder="Cargo o función" />
      </Field>

      <div className="rounded-xl border border-border/60 p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configuración de pago</p>
        <Field label="Modalidad de pago">
          <Select
            value={tipoContrato}
            onChange={setTipoContrato}
            disabled={!puedeModif}
            options={CONTRATOS.map(c => ({ value: c.value, label: c.label }))}
          />
        </Field>

        {(tipoContrato === 'fijo' || tipoContrato === 'mixto') && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sueldo base">
              <MoneyInput value={salarioBase} onChange={v => setSalarioBase(v || 0)} />
            </Field>
            <Field label="Frecuencia de pago">
              <Select value={frecuenciaPago} onChange={setFrecuencia} options={FRECUENCIAS} disabled={!puedeModif} />
            </Field>
          </div>
        )}

        {mostrarDiaMes && (
          <Field label="Día de pago" hint="1–31">
            <Input type="number" value={diaPago} onChange={setDiaPago} disabled={!puedeModif} placeholder="Ej: 15" />
          </Field>
        )}

        {mostrarDiaSemana && (
          <Field label="Día de pago">
            <Select
              value={String(diaPago ?? '')}
              onChange={(v) => setDiaPago(v === '' ? '' : Number(v))}
              disabled={!puedeModif}
              options={DIAS_SEMANA.map(d => ({ value: d.value, label: d.label }))}
            />
          </Field>
        )}

        {tipoContrato === 'destajo' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tarifa por unidad" required>
              <MoneyInput value={tarifaUnidad} onChange={v => setTarifaUnidad(v || 0)} />
            </Field>
            <Field label="Unidad">
              <Select value={unidadPago} onChange={setUnidadPago} options={UNIDADES} disabled={!puedeModif} />
            </Field>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Área principal</p>
        <div className="grid grid-cols-3 gap-2">
          {AREAS.map(a => (
            <button
              key={a.value}
              type="button"
              onClick={() => handleAreaChange(a.value)}
              disabled={!puedeModif}
              className={cn(
                'flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all',
                area === a.value ? 'border-foreground' : 'border-border hover:border-foreground/30'
              )}
              style={area === a.value ? { backgroundColor: a.bg } : {}}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: a.bg }}>
                <Icon d={a.icon} size={11} style={{ color: a.color }} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Áreas adicionales */}
      <Field label="Puestos adicionales" hint="Elige el área adicional y especifica el puesto concreto">
        <PuestosAdicionalesEditor
          areaPrincipal={area}
          puestosAdicionales={puestosAdicionales}
          onChange={setPuestosAd}
          disabled={!puedeModif}
        />
      </Field>

      {/* Rotativo solo para tienda */}
      {area === 'tienda' && (
        <label className={cn(
          'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
          esRotativo ? 'border-amber-300 bg-amber-50' : 'border-border bg-muted/20'
        )}>
          <input
            type="checkbox"
            checked={esRotativo}
            onChange={e => setEsRotativo(e.target.checked)}
            disabled={!puedeModif}
            className="mt-0.5 rounded"
          />
          <div>
            <p className="text-sm font-medium text-foreground">Vendedora rotativa</p>
            <p className="text-xs text-muted-foreground">Puede trabajar en cualquier tienda. Aparece en el equipo de todas las tiendas.</p>
          </div>
        </label>
      )}

      {area === 'tienda' && !esRotativo && tiendasOptions.length > 0 && (
        <Field label="Tienda asignada" required hint="Esta vendedora solo trabajará en esta tienda.">
          <Select
            value={idUbicacionPreferida || ''}
            onChange={(v) => setIdUbicacionPreferida(v ? Number(v) : null)}
            disabled={!puedeModif}
            options={[
              { value: '', label: '— Elegir tienda —' },
              ...tiendasOptions.map((u) => ({ value: u.id_ubicacion, label: u.nombre })),
            ]}
          />
        </Field>
      )}

      {area === 'taller' && talleresOptions.length > 0 && (
        <Field label="Taller asignado" hint="Opcional si trabaja en taller general.">
          <Select
            value={idUbicacionPreferida || ''}
            onChange={(v) => setIdUbicacionPreferida(v ? Number(v) : null)}
            disabled={!puedeModif}
            options={[
              { value: '', label: '— Taller general / sin sede fija —' },
              ...talleresOptions.map((u) => ({ value: u.id_ubicacion, label: u.nombre })),
            ]}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono">
          <Input value={telefono} onChange={setTelefono} disabled={!puedeModif} placeholder="Opcional" />
        </Field>
        <Field label="Fecha de ingreso">
          <Input type="date" value={fechaIngreso} onChange={setFechaI} disabled={!puedeModif} />
        </Field>
      </div>
      <Field label="Notas">
        <Input value={notas} onChange={setNotas} disabled={!puedeModif} placeholder="Notas internas..." />
      </Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
        <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} disabled={!puedeModif} />
        Trabajador activo
      </label>
      {puedeModif && (
        <Button variant="primary" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <><Spinner size={14} /> Guardando...</> : 'Guardar cambios'}
        </Button>
      )}
    </div>
  );
}


/* ── FormPagoTrabajador ─────────────────────────────────────────────────── */

function FormPagoTrabajador({ trabajador, costoFijo, cuentas, onSubmit, onCancel }) {
  const esDestajo = costoFijo.es_por_unidad;
  const [unidades, setUnidades]       = useState(0);
  const [monto, setMonto]             = useState(esDestajo ? 0 : Number(costoFijo.monto_estimado) || 0);
  const [idCuenta, setIdCuenta]       = useState(costoFijo.id_cuenta_reserva || null);
  const [concepto, setConcepto]       = useState('');
  const [fecha, setFecha]             = useState(new Date().toISOString().slice(0, 16));
  const [errs, setErrs]               = useState({});
  const [guardando, setGuardando]     = useState(false);

  const cuentasActivas = cuentas.filter(c => c.activa);
  const montoCalc = esDestajo
    ? Number(unidades || 0) * Number(costoFijo.tarifa_por_unidad || 0)
    : Number(monto || 0);

  const cuentaSeleccionada = idCuenta ? cuentasActivas.find(c => c.id_cuenta === Number(idCuenta)) : null;
  const saldoTras = cuentaSeleccionada ? Number(cuentaSeleccionada.saldo_actual) - montoCalc : null;

  const validar = () => {
    const e = {};
    if (esDestajo && !(Number(unidades) > 0)) e.unidades = 'Ingresa la cantidad';
    if (!esDestajo && !(Number(monto) > 0)) e.monto = 'Monto requerido';
    if (!idCuenta) e.cuenta = 'Selecciona una cuenta';
    if (saldoTras !== null && saldoTras < 0) e.cuenta = `Saldo insuficiente en ${cuentaSeleccionada?.nombre}`;
    setErrs(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      await onSubmit({
        idCosto: costoFijo.id_costo,
        monto: esDestajo ? null : Number(monto),
        unidades: esDestajo ? Number(unidades) : null,
        concepto: concepto || `Pago ${trabajador.nombre} — ${new Date().toLocaleDateString('es-PE')}`,
        idCuenta: Number(idCuenta),
        splits: null,
        idPersona: null,
        fecha: fecha ? new Date(fecha).toISOString() : null,
      });
    } catch (e) { alert(e.message || 'Error'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-4">
      {/* Info trabajador */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
        <AvatarInitials name={trabajador.nombre} size={36} />
        <div>
          <p className="text-sm font-semibold text-foreground">{trabajador.nombre}</p>
          <p className="text-xs text-muted-foreground">{trabajador.cargo || getAreaConf(trabajador.area).label}</p>
        </div>
      </div>

      {esDestajo ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cantidad de ${costoFijo.unidad || 'unidades'}`} required error={errs.unidades}>
            <Input type="number" value={unidades} onChange={setUnidades} placeholder="0" />
          </Field>
          <Field label="Monto calculado">
            <div className="h-10 px-3 rounded-lg border border-border bg-muted/30 flex items-center gap-2">
              <span className="text-base font-bold text-foreground fin-num">{formatMoney(montoCalc)}</span>
              {unidades > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({unidades} × {formatMoney(costoFijo.tarifa_por_unidad)})
                </span>
              )}
            </div>
          </Field>
        </div>
      ) : (
        <Field label="Monto" required error={errs.monto}>
          <MoneyInput value={monto} onChange={v => setMonto(v || 0)} />
        </Field>
      )}

      <Field label="Fecha">
        <Input type="datetime-local" value={fecha} onChange={setFecha} />
      </Field>

      <Field label="Concepto" hint="Opcional">
        <Input
          value={concepto}
          onChange={setConcepto}
          placeholder={`Pago ${trabajador.nombre} — ${new Date().toLocaleDateString('es-PE')}`}
        />
      </Field>

      <Field label="Pagar desde" required error={errs.cuenta}>
        <Select
          value={idCuenta || ''}
          onChange={v => setIdCuenta(v ? Number(v) : null)}
          options={[
            { value: '', label: '— Elegir cuenta —' },
            ...cuentasActivas.map(c => ({
              value: c.id_cuenta,
              label: `${c.nombre} — ${formatMoney(c.saldo_actual)}`,
            })),
          ]}
        />
      </Field>

      {saldoTras !== null && saldoTras < 0 && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
          <span className="font-medium">Saldo insuficiente:</span> {cuentaSeleccionada?.nombre} tiene {formatMoney(cuentaSeleccionada?.saldo_actual)}.
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={onCancel} disabled={guardando} className="flex-1">Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando || montoCalc <= 0} className="flex-1">
          {guardando ? <><Spinner size={14} /> Pagando...</> : `Pagar ${formatMoney(montoCalc)}`}
        </Button>
      </div>
    </div>
  );
}


/* ── FormNuevoTrabajador ────────────────────────────────────────────────── */

function FormNuevoTrabajador({ ubicaciones, onSubmit, onCancel }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    nombre: '',
    cargo: '',
    area: 'tienda',
    puestos_adicionales: [],
    es_rotativo: false,
    tipo_contrato: 'fijo',
    salario_base: 0,
    frecuencia_pago: 'mensual',
    dia_vencimiento: '',
    tarifa_por_unidad: 0,
    unidad: 'docena',
    fecha_ingreso: '',
    telefono: '',
    pin: '',
    id_ubicacion_preferida: null,
  });
  const [errs, setErrs] = useState({});
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const tiendasOptions = (ubicaciones || []).filter((u) => u.rol === 'Tienda');
  const talleresOptions = (ubicaciones || []).filter((u) => u.rol === 'Fabrica');

  const cargosSugeridos = getCargosSugeridos(form.area);
  const mostrarDiaMes = form.tipo_contrato !== 'destajo' && form.frecuencia_pago === 'mensual';
  const mostrarDiaSemana = form.tipo_contrato !== 'destajo' && form.frecuencia_pago === 'semanal';
  const handleAreaChange = (v) => {
    setF('area', v);
    setF('puestos_adicionales', (form.puestos_adicionales || []).filter(p => p.area !== v));
    if (v !== 'tienda') setF('es_rotativo', false);
    setF('id_ubicacion_preferida', null);
  };

  const validarStep1 = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'Requerido';
    if ((form.puestos_adicionales || []).some((p) => !String(p.cargo || '').trim())) {
      e.puestos = 'Completa el puesto específico de cada área adicional';
    }
    if (form.area === 'tienda' && !form.es_rotativo && !form.id_ubicacion_preferida) {
      e.ubicacion = 'Selecciona la tienda asignada';
    }
    setErrs(e);
    return !Object.keys(e).length;
  };

  const validarStep2 = () => {
    const e = {};
    if (form.tipo_contrato === 'destajo' && !(Number(form.tarifa_por_unidad) > 0)) {
      e.tarifa = 'La tarifa debe ser mayor a 0';
    }
    if (mostrarDiaMes) {
      const d = Number(form.dia_vencimiento);
      if (!form.dia_vencimiento || d < 1 || d > 31) e.dia = 'Día 1–31';
    }
    setErrs(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validarStep2()) return;
    setSaving(true);
    try {
      const esDestajo = form.tipo_contrato === 'destajo';
      const esMixto   = form.tipo_contrato === 'mixto';
      await onSubmit({
        nombre:               form.nombre.trim(),
        cargo:                form.cargo.trim() || null,
        area:                 form.area,
        areas_adicionales:    obtenerAreasDesdePuestos(form.puestos_adicionales),
        puestos_adicionales:  (form.puestos_adicionales || []).map((p) => ({ area: p.area, cargo: (p.cargo || '').trim() })),
        es_rotativo:          form.area === 'tienda' ? form.es_rotativo : false,
        tipo_contrato:        form.tipo_contrato,
        salario_base:         (!esDestajo && Number(form.salario_base) > 0) ? Number(form.salario_base) : null,
        frecuencia_pago:      form.frecuencia_pago,
        dia_vencimiento:      (mostrarDiaMes || mostrarDiaSemana) ? Number(form.dia_vencimiento) : null,
        tarifa_por_unidad:    (esDestajo || esMixto) ? Number(form.tarifa_por_unidad) : null,
        unidad:               (esDestajo || esMixto) ? form.unidad : null,
        fecha_ingreso:        form.fecha_ingreso || null,
        telefono:             form.telefono.trim() || null,
        pin:                  form.pin.trim() || null,
        rol:                  form.area === 'administracion' ? 'admin' : 'operador',
        id_ubicacion_preferida: form.id_ubicacion_preferida || null,
      });
    } catch (e) { alert(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
              step >= s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
            )}>
              {step > s ? <Icon d={ICONS.check} size={10} /> : s}
            </div>
            <span className={cn('text-xs', step === s ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {s === 1 ? 'Datos básicos' : 'Tipo de pago'}
            </span>
            {s < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Nombre completo" required error={errs.nombre}>
            <Input value={form.nombre} onChange={v => setF('nombre', v)} placeholder="Ej: María García" error={errs.nombre} />
          </Field>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Área principal</p>
            <div className="grid grid-cols-3 gap-2">
              {AREAS.map(a => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => handleAreaChange(a.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all',
                    form.area === a.value ? 'border-foreground' : 'border-border hover:border-foreground/30'
                  )}
                  style={form.area === a.value ? { backgroundColor: a.bg } : {}}
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: a.bg }}>
                    <Icon d={a.icon} size={12} style={{ color: a.color }} />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Puestos adicionales */}
          <Field label="Puestos adicionales" hint="Elige el área adicional y especifica el puesto concreto" error={errs.puestos}>
            <PuestosAdicionalesEditor
              areaPrincipal={form.area}
              puestosAdicionales={form.puestos_adicionales}
              onChange={v => setF('puestos_adicionales', v)}
            />
          </Field>

          {/* Rotativo solo para tienda */}
          {form.area === 'tienda' && (
            <label className={cn(
              'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
              form.es_rotativo ? 'border-amber-300 bg-amber-50' : 'border-border bg-muted/20'
            )}>
              <input
                type="checkbox"
                checked={form.es_rotativo}
                onChange={e => {
                  setF('es_rotativo', e.target.checked);
                  if (e.target.checked) setF('id_ubicacion_preferida', null);
                }}
                className="mt-0.5 rounded"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Vendedora rotativa</p>
                <p className="text-xs text-muted-foreground">Puede trabajar en cualquier tienda, no tiene tienda fija asignada.</p>
              </div>
            </label>
          )}

          {form.area === 'tienda' && !form.es_rotativo && tiendasOptions.length > 0 && (
            <Field label="Tienda asignada" required error={errs.ubicacion} hint="Esta vendedora solo trabajará en esta tienda.">
              <Select
                value={form.id_ubicacion_preferida || ''}
                onChange={v => setF('id_ubicacion_preferida', v ? Number(v) : null)}
                options={[
                  { value: '', label: '— Elegir tienda —' },
                  ...tiendasOptions.map(u => ({ value: u.id_ubicacion, label: u.nombre })),
                ]}
              />
            </Field>
          )}

          {form.area === 'taller' && talleresOptions.length > 0 && (
            <Field label="Taller asignado" hint="Opcional si trabaja en taller general.">
              <Select
                value={form.id_ubicacion_preferida || ''}
                onChange={v => setF('id_ubicacion_preferida', v ? Number(v) : null)}
                options={[
                  { value: '', label: '— Taller general / sin sede fija —' },
                  ...talleresOptions.map(u => ({ value: u.id_ubicacion, label: u.nombre })),
                ]}
              />
            </Field>
          )}

          <Field label="Cargo o función" hint="Opcional">
            <Input value={form.cargo} onChange={v => setF('cargo', v)} placeholder={cargosSugeridos[0]} />
          </Field>
          {cargosSugeridos.length > 0 && (
            <div className="flex flex-wrap gap-1 -mt-2">
              {cargosSugeridos.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setF('cargo', c)}
                  className="px-2 py-0.5 text-[10px] rounded-full border border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Teléfono" hint="Opcional">
              <Input value={form.telefono} onChange={v => setF('telefono', v)} placeholder="9xx xxx xxx" />
            </Field>
            <Field label="Fecha de ingreso" hint="Opcional">
              <Input type="date" value={form.fecha_ingreso} onChange={v => setF('fecha_ingreso', v)} />
            </Field>
          </div>

          <Field label="PIN (opcional)" hint="4–6 dígitos. Necesario para acceder a Finanzas.">
            <Input value={form.pin} onChange={v => setF('pin', v)} inputMode="numeric" maxLength={6} placeholder="••••" />
          </Field>

          <Button
            variant="primary"
            onClick={() => { if (validarStep1()) setStep(2); }}
            className="w-full"
          >
            Siguiente: Tipo de pago
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Modalidad de pago</p>
            <div className="space-y-2">
              {CONTRATOS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setF('tipo_contrato', c.value)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                    form.tipo_contrato === c.value ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center',
                    form.tipo_contrato === c.value ? 'border-foreground bg-foreground' : 'border-border')}>
                    {form.tipo_contrato === c.value && <div className="w-1.5 h-1.5 rounded-full bg-background" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {(form.tipo_contrato === 'fijo' || form.tipo_contrato === 'mixto') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sueldo base">
                <MoneyInput value={form.salario_base} onChange={v => setF('salario_base', v || 0)} />
              </Field>
              <Field label="Frecuencia de pago">
                <Select value={form.frecuencia_pago} onChange={v => setF('frecuencia_pago', v)} options={FRECUENCIAS} />
              </Field>
            </div>
          )}

          {mostrarDiaMes && (
            <Field label="Día de pago" error={errs.dia} hint="1–31">
              <Input type="number" value={form.dia_vencimiento} onChange={v => setF('dia_vencimiento', v)} placeholder="Ej: 15" />
            </Field>
          )}

          {mostrarDiaSemana && (
            <Field label="Día de pago" error={errs.dia}>
              <Select
                value={String(form.dia_vencimiento ?? '')}
                onChange={v => setF('dia_vencimiento', v === '' ? '' : Number(v))}
                options={DIAS_SEMANA.map(d => ({ value: d.value, label: d.label }))}
              />
            </Field>
          )}

          {(form.tipo_contrato === 'destajo' || form.tipo_contrato === 'mixto') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tarifa por unidad" required error={errs.tarifa}>
                <MoneyInput value={form.tarifa_por_unidad} onChange={v => setF('tarifa_por_unidad', v || 0)} />
              </Field>
              <Field label="Unidad">
                <Select value={form.unidad} onChange={v => setF('unidad', v)} options={UNIDADES} />
              </Field>
            </div>
          )}

          {form.tipo_contrato === 'fijo' && !form.salario_base && (
            <p className="text-xs text-muted-foreground text-center">Si no hay sueldo definido, igual se crea el perfil. Puedes configurarlo luego.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => setStep(1)} disabled={saving} className="flex-1">Atrás</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving ? <><Spinner size={14} /> Creando...</> : 'Crear trabajador'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
