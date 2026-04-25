import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  listarUbicaciones, crearUbicacion, actualizarUbicacion, toggleActivaUbicacion,
  obtenerMiniKpisUbicaciones,
} from '../api/finanzasClient';
import { formatMoney } from '../lib/calculos';
import { puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Button, Modal, Field, Input,
  EmptyState, LoadingState, Icon, ICONS, Spinner,
} from '../components/UI';
import { cn } from '@/lib/utils';
import AbrirUbicacionWizard from './ubicaciones/AbrirUbicacionWizard';

/* ══════════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const ROLES = [
  {
    value: 'Tienda',
    label: 'Tienda',
    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    color: '#3b82f6',
    bg: '#eff6ff',
    description: 'Punto de venta al público',
  },
  {
    value: 'Fabrica',
    label: 'Taller / Fábrica',
    icon: 'M2 20h20M5 20V8l5 4V8l5 4V8l4 12',
    color: '#f59e0b',
    bg: '#fffbeb',
    description: 'Producción y manufactura',
  },
];

const rolMeta = (rol) => ROLES.find(r => r.value === rol) ?? ROLES[0];

/* ── período actual: mes en curso ── */
const periodoActual = () => {
  const hoy = new Date();
  const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  const hasta = hoy.toISOString().slice(0, 10);
  return { desde, hasta };
};

const initForm = () => ({ nombre: '', rol: 'Tienda', pin: '' });

/* ══════════════════════════════════════════════════════════════════════════
   FORMULARIO — crear o editar
   ══════════════════════════════════════════════════════════════════════════ */

function FormUbicacion({ inicial, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState(inicial ?? initForm());
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const validar = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido';
    if (form.nombre.trim().length > 80) e.nombre = 'Máximo 80 caracteres';
    return e;
  };

  const submit = () => {
    const e = validar();
    if (Object.keys(e).length) { setErrors(e); return; }
    onGuardar(form);
  };

  return (
    <div className="space-y-5">
      <Field label="Nombre" error={errors.nombre} required>
        <Input
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          placeholder="Ej: Tienda Centro, Taller Principal…"
          autoFocus
        />
      </Field>

      <Field label="Tipo" required>
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map(r => {
            const activo = form.rol === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => set('rol', r.value)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all duration-150',
                  activo
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-border bg-card hover:border-muted-foreground/40',
                )}
              >
                <span
                  className="mt-0.5 rounded-lg p-1.5 shrink-0"
                  style={{ background: activo ? r.bg : '#f3f4f6', color: activo ? r.color : '#6b7280' }}
                >
                  <Icon d={r.icon} size={18} />
                </span>
                <div>
                  <div className={cn('text-sm font-semibold', activo ? 'text-blue-700' : 'text-foreground')}>
                    {r.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label="PIN de acceso"
        hint="Número único para identificar esta ubicación en caja y reportes. Se genera uno automático si lo dejas vacío."
      >
        <Input
          value={form.pin}
          onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Ej: 1234 (opcional, se genera automático)"
          inputMode="numeric"
          maxLength={6}
        />
      </Field>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancelar} disabled={guardando} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={submit} disabled={guardando} className="flex-1">
          {guardando ? <Spinner size={14} className="mr-2" /> : null}
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear ubicación'}
        </Button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TARJETA HUB — clickable, muestra mini-KPIs
   ══════════════════════════════════════════════════════════════════════════ */

function UbicacionCard({ ub, kpis, onEditar, onToggleActiva, puedoEditar }) {
  const meta = rolMeta(ub.rol);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (e) => {
    e.preventDefault(); // evitar que el Link navegue
    if (toggling) return;
    setToggling(true);
    try { await onToggleActiva(ub.id_ubicacion, !ub.activa); }
    finally { setToggling(false); }
  };

  const handleEditar = (e) => {
    e.preventDefault();
    onEditar(ub);
  };

  // Mini-KPIs que se muestran según el rol
  const ventasMes    = kpis?.ventasPorUbic?.[ub.id_ubicacion] ?? null;
  const costosMes    = kpis?.costosPorUbic?.[ub.id_ubicacion] ?? null;
  const trabajadores = kpis?.trabPorUbic?.[ub.id_ubicacion] ?? null;
  const kpisLoaded   = kpis !== null;

  return (
    <Link
      to={`/gestion/ubicaciones/${ub.id_ubicacion}`}
      className={cn(
        'group relative block rounded-2xl border transition-all duration-200',
        ub.activa
          ? 'bg-card border-border hover:border-muted-foreground/40 hover:shadow-md hover:-translate-y-0.5'
          : 'bg-muted/30 border-border/50 opacity-60 pointer-events-none',
      )}
    >
      <div className="flex items-start gap-4 p-5">
        {/* Icono tipo */}
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: ub.activa ? meta.bg : '#f3f4f6', color: ub.activa ? meta.color : '#9ca3af' }}
        >
          <Icon d={meta.icon} size={24} />
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-foreground">{ub.nombre}</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: meta.bg, color: meta.color }}
            >
              <Icon d={meta.icon} size={10} />
              {meta.label}
            </span>
            {!ub.activa && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                Inactiva
              </span>
            )}
          </div>

          {/* Mini KPIs en línea */}
          {ub.activa && (
            <div className="mt-3 flex flex-wrap gap-4">
              {ub.rol === 'Tienda' && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Ventas del mes</span>
                  <span className="text-sm font-bold text-green-700">
                    {kpisLoaded ? (ventasMes !== null ? formatMoney(ventasMes) : '—') : <Skeleton />}
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Costos fijos/mes</span>
                <span className="text-sm font-bold text-red-700">
                  {kpisLoaded ? (costosMes !== null ? formatMoney(costosMes) : '—') : <Skeleton />}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Personal asignado</span>
                <span className="text-sm font-bold text-foreground">
                  {kpisLoaded ? (trabajadores !== null ? `${trabajadores} persona${trabajadores !== 1 ? 's' : ''}` : '0 personas') : <Skeleton />}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Acciones + flecha */}
        <div className="flex items-center gap-1 shrink-0">
          {puedoEditar && ub.activa && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleEditar}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={15} />
              </button>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                title="Desactivar"
              >
                {toggling
                  ? <Spinner size={13} />
                  : <Icon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" size={15} />
                }
              </button>
            </div>
          )}
          {puedoEditar && !ub.activa && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 pointer-events-auto"
              title="Reactivar"
            >
              {toggling ? <Spinner size={13} /> : <Icon d={ICONS.check} size={15} />}
            </button>
          )}
          <div className="ml-1 text-muted-foreground group-hover:text-foreground transition-colors">
            <Icon d={ICONS.chevronRight} size={18} />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* pequeño skeleton inline */
function Skeleton() {
  return <span className="inline-block h-3 w-16 rounded-full bg-muted animate-pulse" />;
}

/* ══════════════════════════════════════════════════════════════════════════
   SECCIÓN AGRUPADA (Tiendas / Talleres)
   ══════════════════════════════════════════════════════════════════════════ */

function SeccionGrupo({ rol, items, kpis, onEditar, onToggleActiva, puedoEditar }) {
  const meta = rolMeta(rol);
  const activas = items.filter(u => u.activa).length;
  if (!items.length) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: meta.bg, color: meta.color }}
        >
          <Icon d={meta.icon} size={16} />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{meta.label}s</h2>
        <span className="text-xs text-muted-foreground">
          {activas} activa{activas !== 1 ? 's' : ''} · {items.length} total
        </span>
      </div>
      <div className="space-y-2">
        {items.map(ub => (
          <UbicacionCard
            key={ub.id_ubicacion}
            ub={ub}
            kpis={kpis}
            onEditar={onEditar}
            onToggleActiva={onToggleActiva}
            puedoEditar={puedoEditar}
          />
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN — Ubicaciones (lista)
   ══════════════════════════════════════════════════════════════════════════ */

export default function Ubicaciones({ usuario }) {
  const [ubicaciones, setUbicaciones]   = useState([]);
  const [kpis, setKpis]                 = useState(null); // null = cargando
  const [cargando, setCargando]         = useState(true);
  const [error, setError]               = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando]         = useState(null);
  const [guardando, setGuardando]       = useState(false);
  const [guardError, setGuardError]     = useState(null);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [wizardAbierto, setWizardAbierto] = useState(false);

  const puedoEditar = puedeEditar(usuario, RECURSOS.configuracion);
  const periodo = useMemo(() => periodoActual(), []);

  /* ── carga ubicaciones ── */
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const data = await listarUbicaciones();
      setUbicaciones(data);
      // Cargar mini-KPIs en paralelo (no bloquea el render)
      obtenerMiniKpisUbicaciones(periodo.desde, periodo.hasta)
        .then(k => setKpis(k))
        .catch(() => setKpis({})); // error silencioso
    } catch (e) {
      setError(e.message ?? 'Error al cargar ubicaciones');
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── guardar ── */
  const handleGuardar = async (form) => {
    setGuardando(true); setGuardError(null);
    try {
      if (editando) {
        const updated = await actualizarUbicacion(editando.id_ubicacion, form);
        setUbicaciones(prev => prev.map(u => u.id_ubicacion === updated.id_ubicacion ? updated : u));
      } else {
        const nueva = await crearUbicacion(form);
        setUbicaciones(prev => [...prev, nueva]);
      }
      setModalAbierto(false);
      setEditando(null);
    } catch (e) {
      setGuardError(e.message ?? 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  /* ── toggle activa ── */
  const handleToggleActiva = async (id, activa) => {
    const updated = await toggleActivaUbicacion(id, activa);
    setUbicaciones(prev => prev.map(u => u.id_ubicacion === updated.id_ubicacion ? updated : u));
  };

  /* ── abrir modales ── */
  const abrirNuevo   = () => { setEditando(null); setGuardError(null); setModalAbierto(true); };
  const abrirEditar  = (ub) => { setEditando(ub); setGuardError(null); setModalAbierto(true); };

  /* ── datos filtrados ── */
  const visibles = mostrarInactivas ? ubicaciones : ubicaciones.filter(u => u.activa);
  const tiendas  = visibles.filter(u => u.rol === 'Tienda');
  const talleres = visibles.filter(u => u.rol === 'Fabrica');

  /* ── KPIs globales ── */
  const totalTiendas  = ubicaciones.filter(u => u.rol === 'Tienda'  && u.activa).length;
  const totalTalleres = ubicaciones.filter(u => u.rol === 'Fabrica' && u.activa).length;
  const totalInact    = ubicaciones.filter(u => !u.activa).length;
  const totalVentas   = kpis ? Object.values(kpis.ventasPorUbic || {}).reduce((s, v) => s + v, 0) : null;
  const totalCostos   = kpis ? Object.values(kpis.costosPorUbic || {}).reduce((s, v) => s + v, 0) : null;

  /* ── render ── */
  if (cargando) return <LoadingState />;
  if (error) return (
    <div className="p-8 text-center">
      <p className="text-red-600 text-sm mb-3">{error}</p>
      <Button variant="outline" onClick={cargar}>Reintentar</Button>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tiendas y Talleres</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona los puntos de venta y producción · Haz clic en cualquier ubicación para ver su hub completo
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {puedoEditar && (
            <Button onClick={() => setWizardAbierto(true)} className="flex items-center gap-2" style={{ background: '#1c1917' }}>
              <Icon d={ICONS.plus} size={16} />
              Abrir nueva ubicación
            </Button>
          )}
          {puedoEditar && (
            <Button onClick={abrirNuevo} variant="outline" className="flex items-center gap-2">
              <Icon d={ICONS.plus} size={16} />
              Nueva ubicación
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI strip global ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Tiendas activas</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-foreground">{totalTiendas}</span>
            <span className="text-xs text-blue-600 mb-0.5 font-medium">puntos de venta</span>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Talleres activos</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-foreground">{totalTalleres}</span>
            <span className="text-xs text-amber-600 mb-0.5 font-medium">de producción</span>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Ventas totales — mes</p>
          <div className="flex items-end gap-2">
            {totalVentas !== null
              ? <span className="text-xl font-bold text-green-700">{formatMoney(totalVentas)}</span>
              : <span className="h-5 w-24 rounded-full bg-muted animate-pulse inline-block" />
            }
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Costos totales — mes</p>
          <div className="flex items-end gap-2">
            {totalCostos !== null
              ? <span className="text-xl font-bold text-red-700">{formatMoney(totalCostos)}</span>
              : <span className="h-5 w-24 rounded-full bg-muted animate-pulse inline-block" />
            }
          </div>
        </div>
      </div>

      {/* ── Filtro inactivas ── */}
      {totalInact > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setMostrarInactivas(p => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon d={ICONS.eye} size={13} />
            {mostrarInactivas ? 'Ocultar inactivas' : `Mostrar ${totalInact} inactiva${totalInact !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* ── Contenido ── */}
      {ubicaciones.length === 0 ? (
        <EmptyState
          title="Sin ubicaciones registradas"
          description="Agrega tus tiendas y talleres para organizar gastos, costos y reportes por ubicación."
          action={puedoEditar && (
            <Button onClick={abrirNuevo} className="flex items-center gap-2">
              <Icon d={ICONS.plus} size={15} />
              Agregar primera ubicación
            </Button>
          )}
        />
      ) : (
        <div className="space-y-8">
          <SeccionGrupo
            rol="Tienda"
            items={tiendas}
            kpis={kpis}
            onEditar={abrirEditar}
            onToggleActiva={handleToggleActiva}
            puedoEditar={puedoEditar}
          />
          <SeccionGrupo
            rol="Fabrica"
            items={talleres}
            kpis={kpis}
            onEditar={abrirEditar}
            onToggleActiva={handleToggleActiva}
            puedoEditar={puedoEditar}
          />
        </div>
      )}

      {/* ── Wizard abrir nueva ubicación ── */}
      {wizardAbierto && <AbrirUbicacionWizard onClose={() => setWizardAbierto(false)} />}

      {/* ── Modal crear / editar ── */}
      <Modal
        open={modalAbierto}
        onClose={() => { setModalAbierto(false); setEditando(null); }}
        title={editando ? `Editar: ${editando.nombre}` : 'Nueva ubicación'}
      >
        {guardError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {guardError}
          </div>
        )}
        <FormUbicacion
          inicial={editando ? { nombre: editando.nombre, rol: editando.rol, pin: editando.pin ?? '' } : null}
          onGuardar={handleGuardar}
          onCancelar={() => { setModalAbierto(false); setEditando(null); }}
          guardando={guardando}
        />
      </Modal>
    </div>
  );
}
