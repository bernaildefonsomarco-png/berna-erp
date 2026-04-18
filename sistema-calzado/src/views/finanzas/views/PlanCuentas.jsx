import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listarPlanCuentas, crearCuentaContable, actualizarCuentaContable, archivarCuentaContable,
  reordenarCuentasContables, SECCIONES_PL,
} from '../api/finanzasClient';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import { generarCodigoPlanCuentas } from '../lib/codegen';
import {
  Card, Badge, Button, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner, SideSheet,
} from '../components/UI';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE SECCIONES P&L CON COLORES Y DESCRIPCIONES CLARAS
   ══════════════════════════════════════════════════════════════════════════ */

const SECCIONES_CONFIG = {
  ingresos:           { color: '#16a34a', bg: '#dcfce7', border: '#86efac', signo: 1,  desc: 'Todo lo que entra: ventas de calzado, servicios, etc.' },
  costo_ventas:       { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5', signo: -1, desc: 'Costo directo de lo que se vende (materiales, insumos).' },
  costo_produccion:   { color: '#d97706', bg: '#fef3c7', border: '#fcd34d', signo: -1, desc: 'Costos de fabricar el calzado: taller, mano de obra.' },
  gastos_operativos:  { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd', signo: -1, desc: 'Gastos del día a día: luz, agua, alquiler, internet.' },
  gastos_personal:    { color: '#0369a1', bg: '#dbeafe', border: '#93c5fd', signo: -1, desc: 'Sueldos y pagos a trabajadores de tienda y administración.' },
  gastos_financieros: { color: '#9333ea', bg: '#faf5ff', border: '#d8b4fe', signo: -1, desc: 'Intereses de préstamos, comisiones bancarias.' },
  impuestos:          { color: '#be185d', bg: '#fce7f3', border: '#f9a8d4', signo: -1, desc: 'IGV, impuesto a la renta, SUNAT, predial.' },
  otros_ingresos:     { color: '#059669', bg: '#d1fae5', border: '#6ee7b7', signo: 1,  desc: 'Ingresos esporádicos: ventas de activos, recuperaciones.' },
  otros_egresos:      { color: '#b45309', bg: '#fef3c7', border: '#fcd34d', signo: -1, desc: 'Gastos extraordinarios y no recurrentes.' },
  sin_impacto:        { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', signo: 1,  desc: 'Movimientos internos que no afectan el resultado (traslados).' },
};

function getSecConfig(value) {
  return SECCIONES_CONFIG[value] || { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', signo: 1, desc: '' };
}

const DRAG_HANDLE = 'M9 5h2M9 9h2M9 13h2M13 5h2M13 9h2M13 13h2';

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlanCuentas({ usuario }) {
  const [cuentas, setCuentas]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [sheetCrear, setSheetCrear]         = useState(false);
  const [seccionPreSelect, setSeccionPre]   = useState(null);
  const [padrePreSelect, setPadrePre]       = useState(null);
  const [cuentaEdicion, setCuentaEdicion]   = useState(null);
  const [confirmArchivar, setConfirmArch]   = useState(null);
  const [seccionExpandida, setSecExp]       = useState({});
  const [busqueda, setBusqueda]             = useState('');

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await listarPlanCuentas({ incluirInactivas: false });
      setCuentas(data);
      if (Object.keys(seccionExpandida).length === 0) {
        const secs = {};
        data.forEach(c => { secs[c.seccion_pl] = true; });
        setSecExp(secs);
      }
    } catch (e) { setError(e.message || 'Error al cargar plan de cuentas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── Árbol por sección ── */
  const porSeccion = useMemo(() => {
    const grupos = new Map();
    SECCIONES_PL.forEach(s => grupos.set(s.value, []));
    cuentas.forEach(c => {
      if (!grupos.has(c.seccion_pl)) grupos.set(c.seccion_pl, []);
      grupos.get(c.seccion_pl).push(c);
    });
    return SECCIONES_PL
      .map(s => ({ ...s, cuentas: grupos.get(s.value) || [] }))
      .filter(s => s.cuentas.length > 0);
  }, [cuentas]);

  const arbolPorSeccion = useMemo(() => {
    const result = {};
    porSeccion.forEach(sec => {
      const map = new Map();
      sec.cuentas.forEach(c => map.set(c.id_cuenta_contable, { ...c, hijos: [] }));
      const raices = [];
      map.forEach(c => {
        if (c.id_padre && map.has(c.id_padre)) map.get(c.id_padre).hijos.push(c);
        else raices.push(c);
      });
      result[sec.value] = raices;
    });
    return result;
  }, [porSeccion]);

  /* ── Handlers ── */
  const handleCrear = async (payload) => {
    await crearCuentaContable(payload);
    setSheetCrear(false);
    setSeccionPre(null);
    setPadrePre(null);
    await cargar();
  };

  const handleActualizar = async (id, cambios) => {
    await actualizarCuentaContable(id, cambios);
    setCuentaEdicion(null);
    await cargar();
  };

  const handleArchivar = async (cuenta) => {
    if (cuentas.some(c => c.id_padre === cuenta.id_cuenta_contable)) {
      alert('No puedes archivar esta cuenta porque tiene sub-cuentas activas.');
      return;
    }
    await archivarCuentaContable(cuenta.id_cuenta_contable);
    setConfirmArch(null);
    await cargar();
  };

  const handleDragEnd = useCallback(async (event, seccionValue) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const raices = arbolPorSeccion[seccionValue] || [];
    const oldIdx = raices.findIndex(c => c.id_cuenta_contable === active.id);
    const newIdx = raices.findIndex(c => c.id_cuenta_contable === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordenado = arrayMove(raices, oldIdx, newIdx);
    setCuentas(prev => {
      const otras = prev.filter(c => c.seccion_pl !== seccionValue || c.id_padre !== null);
      return [...otras, ...reordenado.map((c, i) => ({ ...c, orden: i + 1 }))].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
    });
    try {
      await reordenarCuentasContables(reordenado.map((c, i) => ({ id_cuenta_contable: c.id_cuenta_contable, orden: i + 1 })));
    } catch { await cargar(); }
  }, [arbolPorSeccion]);

  if (loading) return <LoadingState message="Cargando plan de cuentas..." />;

  const totalActivas    = cuentas.length;
  const totalImputables = cuentas.filter(c => c.permite_movimientos).length;

  return (
    <>
      <PageHeader
        title="Plan de cuentas"
        description="Estructura contable del negocio. Define cómo se agrupan los movimientos en el Estado de Resultados."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => { setSeccionPre(null); setPadrePre(null); setSheetCrear(true); }}>
            Nueva cuenta
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>
      )}

      {/* Stats + búsqueda */}
      <div className="flex items-center flex-wrap gap-4 mb-5">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><span className="font-semibold text-foreground fin-num">{totalActivas}</span> cuentas activas</span>
          <span><span className="font-semibold text-foreground fin-num">{totalImputables}</span> imputables</span>
          <span><span className="font-semibold text-foreground fin-num">{porSeccion.length}</span> secciones</span>
        </div>
        <div className="ml-auto relative w-52">
          <Icon d={ICONS.search} size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cuenta..."
            className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <Icon d={ICONS.x} size={12} />
            </button>
          )}
        </div>
      </div>

      {porSeccion.length === 0 ? (
        <Card>
          <EmptyState icon={ICONS.document} title="Sin plan de cuentas" description="No hay cuentas contables creadas." />
        </Card>
      ) : (
        <div className="space-y-2">
          {porSeccion.map(seccion => {
            const cfg = getSecConfig(seccion.value);
            const raices = arbolPorSeccion[seccion.value] || [];
            const busq = busqueda.trim().toLowerCase();
            const raicesFiltradas = busq
              ? raices.filter(r =>
                  r.nombre.toLowerCase().includes(busq) ||
                  r.codigo.toLowerCase().includes(busq) ||
                  r.hijos?.some(h => h.nombre.toLowerCase().includes(busq) || h.codigo.toLowerCase().includes(busq))
                )
              : raices;
            if (busq && raicesFiltradas.length === 0) return null;

            const expanded = seccionExpandida[seccion.value] !== false;

            return (
              <div key={seccion.value} className="rounded-xl border overflow-hidden" style={{ borderColor: cfg.border }}>
                {/* Header de sección */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:brightness-95"
                  style={{ backgroundColor: cfg.bg }}
                  onClick={() => setSecExp(p => ({ ...p, [seccion.value]: !expanded }))}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: cfg.color }}>{seccion.label}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: cfg.color, opacity: 0.75 }}>{cfg.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: cfg.color + '22', color: cfg.color }}
                    >
                      {seccion.cuentas.length}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ color: cfg.color, backgroundColor: cfg.color + '15' }}>
                      {cfg.signo > 0 ? '+ Ingreso' : '− Gasto'}
                    </span>
                    {puedeCrear && (
                      <button
                        onClick={e => { e.stopPropagation(); setSeccionPre(seccion.value); setPadrePre(null); setSheetCrear(true); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors"
                        style={{ color: cfg.color, backgroundColor: cfg.color + '15' }}
                        title="Agregar cuenta en esta sección"
                      >
                        <Icon d={ICONS.plus} size={10} />
                        Agregar
                      </button>
                    )}
                    <Icon d={expanded ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6'} size={13} style={{ color: cfg.color }} />
                  </div>
                </button>

                {/* Árbol de cuentas */}
                {expanded && (
                  <div className="bg-card">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, seccion.value)}>
                      <SortableContext items={raicesFiltradas.map(r => r.id_cuenta_contable)} strategy={verticalListSortingStrategy}>
                        <div>
                          {raicesFiltradas.map((raiz, idx) => (
                            <CuentaNode
                              key={raiz.id_cuenta_contable}
                              cuenta={raiz}
                              nivel={0}
                              seccionConfig={cfg}
                              isLast={idx === raicesFiltradas.length - 1}
                              puedeModif={puedeModif}
                              puedeCrear={puedeCrear}
                              isDraggable={puedeModif && !busq}
                              onEditar={setCuentaEdicion}
                              onArchivar={setConfirmArch}
                              onCrearHija={p => { setSeccionPre(p.seccion_pl); setPadrePre(p.id_cuenta_contable); setSheetCrear(true); }}
                              onRenombrar={(id, nombre) => actualizarCuentaContable(id, { nombre }).then(cargar)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sheet Crear */}
      <SideSheet
        open={sheetCrear}
        onClose={() => { setSheetCrear(false); setSeccionPre(null); setPadrePre(null); }}
        title="Nueva cuenta contable"
        description="Define cómo clasificar un tipo de movimiento en el P&L."
        size="md"
      >
        <FormCuentaContable
          cuentas={cuentas}
          seccionPreSelect={seccionPreSelect}
          padrePreSelect={padrePreSelect}
          onSubmit={handleCrear}
          onCancel={() => { setSheetCrear(false); setSeccionPre(null); setPadrePre(null); }}
        />
      </SideSheet>

      {/* Sheet Editar */}
      {cuentaEdicion && (
        <SideSheet
          open={true}
          onClose={() => setCuentaEdicion(null)}
          title="Editar cuenta contable"
          size="md"
        >
          <FormCuentaContable
            cuentas={cuentas}
            valoresIniciales={cuentaEdicion}
            onSubmit={cambios => handleActualizar(cuentaEdicion.id_cuenta_contable, cambios)}
            onCancel={() => setCuentaEdicion(null)}
          />
        </SideSheet>
      )}

      {/* Modal archivar */}
      {confirmArchivar && (
        <Modal
          open={true}
          onClose={() => setConfirmArch(null)}
          title="Archivar cuenta"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmArch(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleArchivar(confirmArchivar)}>Archivar</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            ¿Archivar <span className="font-medium text-foreground">{confirmArchivar.nombre}</span>?
            Los movimientos históricos conservan la referencia.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ── CuentaNode ─────────────────────────────────────────────────────────── */

function CuentaNode({ cuenta, nivel, seccionConfig, isLast, puedeModif, puedeCrear, isDraggable, onEditar, onArchivar, onCrearHija, onRenombrar }) {
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEdit, setNombreEdit]         = useState(cuenta.nombre);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const indent = nivel * 20;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cuenta.id_cuenta_contable,
    disabled: !isDraggable || nivel > 0,
  });

  const style = isDraggable && nivel === 0 ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } : {};

  const handleNombreBlur = async () => {
    const nuevo = nombreEdit.trim();
    if (!nuevo || nuevo === cuenta.nombre) { setEditandoNombre(false); setNombreEdit(cuenta.nombre); return; }
    setGuardandoNombre(true);
    try { await onRenombrar(cuenta.id_cuenta_contable, nuevo); }
    catch { setNombreEdit(cuenta.nombre); }
    finally { setGuardandoNombre(false); setEditandoNombre(false); }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="flex items-center gap-2 py-2 pr-3 hover:bg-muted/30 transition-colors group border-b border-border/30 last:border-0"
        style={{ paddingLeft: 16 + indent }}
      >
        {/* Indicador visual de jerarquía */}
        {nivel === 0 && isDraggable ? (
          <button
            className="opacity-0 group-hover:opacity-100 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
            {...attributes}
            {...listeners}
          >
            <Icon d={DRAG_HANDLE} size={12} />
          </button>
        ) : nivel > 0 ? (
          <div className="flex items-center gap-0 shrink-0" style={{ marginLeft: -4 }}>
            <div className="w-3 h-px" style={{ backgroundColor: seccionConfig.border }} />
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: seccionConfig.border }} />
          </div>
        ) : (
          <div className="w-3.5 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editandoNombre ? (
              <input
                autoFocus
                value={nombreEdit}
                onChange={e => setNombreEdit(e.target.value)}
                onBlur={handleNombreBlur}
                onKeyDown={e => { if (e.key === 'Enter') handleNombreBlur(); if (e.key === 'Escape') { setEditandoNombre(false); setNombreEdit(cuenta.nombre); } }}
                disabled={guardandoNombre}
                className="text-sm text-foreground border-b border-ring bg-transparent outline-none min-w-[100px]"
                style={{ fontWeight: cuenta.permite_movimientos ? 400 : 600 }}
              />
            ) : (
              <p
                className={cn('text-sm text-foreground', puedeModif && 'cursor-text')}
                style={{ fontWeight: cuenta.permite_movimientos ? 400 : 600 }}
                onDoubleClick={() => puedeModif && (setEditandoNombre(true), setNombreEdit(cuenta.nombre))}
                title={puedeModif ? 'Doble clic para renombrar' : undefined}
              >
                {cuenta.nombre}
              </p>
            )}
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
              {cuenta.codigo}
            </span>
            {!cuenta.permite_movimientos && (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: seccionConfig.bg, color: seccionConfig.color }}>
                Grupo
              </span>
            )}
          </div>
          {cuenta.descripcion && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cuenta.descripcion}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {puedeCrear && (
            <button
              onClick={() => onCrearHija(cuenta)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Agregar sub-cuenta"
            >
              <Icon d={ICONS.plus} size={12} />
            </button>
          )}
          {puedeModif && (
            <>
              <button
                onClick={() => onEditar(cuenta)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={12} />
              </button>
              <button
                onClick={() => onArchivar(cuenta)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Archivar"
              >
                <Icon d={ICONS.trash} size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hijos recursivos */}
      {cuenta.hijos?.map((hijo, idx) => (
        <CuentaNode
          key={hijo.id_cuenta_contable}
          cuenta={hijo}
          nivel={nivel + 1}
          seccionConfig={seccionConfig}
          isLast={idx === cuenta.hijos.length - 1}
          puedeModif={puedeModif}
          puedeCrear={puedeCrear}
          isDraggable={false}
          onEditar={onEditar}
          onArchivar={onArchivar}
          onCrearHija={onCrearHija}
          onRenombrar={onRenombrar}
        />
      ))}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FORM CUENTA CONTABLE — simplificado
   ══════════════════════════════════════════════════════════════════════════ */

function FormCuentaContable({ cuentas, seccionPreSelect, padrePreSelect, valoresIniciales, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    seccion_pl: seccionPreSelect || 'gastos_operativos',
    id_padre: padrePreSelect || null,
    permite_movimientos: true,
    ...(valoresIniciales || {}),
  });
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const codigoAuto = useMemo(() =>
    valoresIniciales?.codigo || generarCodigoPlanCuentas(form.seccion_pl, form.id_padre || null, cuentas),
    [form.seccion_pl, form.id_padre, cuentas, valoresIniciales]
  );

  const padresPosibles = useMemo(() =>
    cuentas.filter(c =>
      c.seccion_pl === form.seccion_pl &&
      c.id_cuenta_contable !== valoresIniciales?.id_cuenta_contable &&
      !c.permite_movimientos
    ),
    [cuentas, form.seccion_pl, valoresIniciales]
  );

  const cfgSeccion = getSecConfig(form.seccion_pl);

  const validar = () => {
    const e = {};
    if (!form.nombre?.trim()) e.nombre = 'Requerido';
    if (!form.seccion_pl) e.seccion_pl = 'Requerido';
    setErrs(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      const signo = SECCIONES_CONFIG[form.seccion_pl]?.signo ?? -1;
      await onSubmit({
        codigo: codigoAuto,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion?.trim() || null,
        seccion_pl: form.seccion_pl,
        id_padre: form.id_padre || null,
        permite_movimientos: !!form.permite_movimientos,
        signo_pl: signo,
        orden: Number(valoresIniciales?.orden) || 99,
      });
    } catch (e) { alert(e.message || 'Error'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-5">
      {/* Tipo de cuenta: agrupación vs registro */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tipo de cuenta</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true,  label: 'De registro',   desc: 'Recibe movimientos directamente',   icon: ICONS.document },
            { v: false, label: 'De agrupación',  desc: 'Solo agrupa otras sub-cuentas',     icon: ICONS.trending },
          ].map(opt => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => setF('permite_movimientos', opt.v)}
              className={cn(
                'flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all',
                form.permite_movimientos === opt.v ? 'border-foreground bg-foreground/5' : 'border-border hover:border-foreground/30'
              )}
            >
              <Icon d={opt.icon} size={14} className={form.permite_movimientos === opt.v ? 'text-foreground' : 'text-muted-foreground'} />
              <p className={cn('text-xs font-semibold', form.permite_movimientos === opt.v ? 'text-foreground' : 'text-muted-foreground')}>
                {opt.label}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Sección del P&L — selector visual con descripción */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sección del Estado de Resultados</p>
        <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
          {SECCIONES_PL.map(sec => {
            const cfg = getSecConfig(sec.value);
            const isSelected = form.seccion_pl === sec.value;
            return (
              <button
                key={sec.value}
                type="button"
                onClick={() => { setF('seccion_pl', sec.value); setF('id_padre', null); }}
                className={cn(
                  'flex items-start gap-2 p-2.5 rounded-xl border-2 text-left transition-all',
                  isSelected ? 'border-2' : 'border-border hover:border-foreground/30'
                )}
                style={isSelected ? { borderColor: cfg.color, backgroundColor: cfg.bg } : {}}
              >
                <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: cfg.color }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-tight" style={{ color: isSelected ? cfg.color : undefined }}>
                    {sec.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{cfg.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Nombre" required error={errs.nombre}>
        <Input
          value={form.nombre}
          onChange={v => setF('nombre', v)}
          placeholder="Ej: Servicios de limpieza"
          error={errs.nombre}
        />
      </Field>

      <Field label="Descripción" hint="Opcional">
        <Input
          value={form.descripcion || ''}
          onChange={v => setF('descripcion', v)}
          placeholder="Describe qué abarca esta cuenta"
        />
      </Field>

      {padresPosibles.length > 0 && (
        <Field label="Cuenta padre" hint="Opcional. Solo cuentas de agrupación de la misma sección.">
          <Select
            value={form.id_padre || ''}
            onChange={v => setF('id_padre', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin padre (cuenta raíz) —' },
              ...padresPosibles.map(c => ({ value: c.id_cuenta_contable, label: `${c.codigo} — ${c.nombre}` })),
            ]}
          />
        </Field>
      )}

      {/* Código auto */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
        <Icon d={ICONS.key} size={12} className="text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground flex-1">
          Código: <span className="font-mono font-medium text-foreground">{codigoAuto}</span>
          {cfgSeccion.signo > 0 ? ' · impacto positivo en P&L' : ' · impacto negativo en P&L'}
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={onCancel} disabled={guardando} className="flex-1">Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando} className="flex-1">
          {guardando ? <><Spinner size={14} /> Guardando...</> : valoresIniciales ? 'Guardar cambios' : 'Crear cuenta'}
        </Button>
      </div>
    </div>
  );
}
