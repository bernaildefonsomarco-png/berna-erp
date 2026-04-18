import React, { useState, useEffect, useMemo } from 'react';
import {
  listarCuentas, crearCuenta, actualizarCuenta, archivarCuenta,
  listarPersonasConAccesoFinanzas, listarMovimientosCuenta
} from '../api/finanzasClient';
import {
  formatMoney, formatDate, agruparCuentasJerarquicas,
  calcularRollupCuenta, COLOR_TIPO_CUENTA
} from '../lib/calculos';
import { generarCodigoCuenta } from '../lib/codegen';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, MetricCard, Badge, Button, Modal, Field, Input, Select,
  MoneyInput, EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   CUENTAS (view principal)
   ────────────────────────────────────────────────────────────────────────── */

const TIPOS_CUENTA = [
  { value: 'operativa', label: 'Operativa' },
  { value: 'ahorro',    label: 'Ahorro'    },
  { value: 'bancaria',  label: 'Bancaria'  },
  { value: 'credito',   label: 'Crédito'   },
  { value: 'digital',   label: 'Digital'   },
  { value: 'reserva',   label: 'Reserva'   },
  { value: 'otra',      label: 'Otra'      },
];

export default function Cuentas({ usuario }) {
  const [cuentas, setCuentas] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalCrear, setModalCrear] = useState(false);
  const [cuentaPadrePreSelect, setCuentaPadrePreSelect] = useState(null);
  const [cuentaDetalle, setCuentaDetalle] = useState(null);
  const [confirmArchivar, setConfirmArchivar] = useState(null);

  const puedeCrear  = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif  = puedeEditar(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [cs, ps] = await Promise.all([
        listarCuentas(),
        listarPersonasConAccesoFinanzas(),
      ]);
      setCuentas(cs);
      setPersonas(ps);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const cuentasJerarquicas = useMemo(
    () => agruparCuentasJerarquicas(cuentas),
    [cuentas]
  );

  const totalActivos = useMemo(
    () => cuentas.reduce((sum, c) => sum + (Number(c.saldo_actual) || 0), 0),
    [cuentas]
  );

  const totalRaices = useMemo(
    () => cuentasJerarquicas.length,
    [cuentasJerarquicas]
  );

  const totalSubCuentas = useMemo(
    () => cuentas.length - totalRaices,
    [cuentas, totalRaices]
  );

  const handleAbrirCrear = (idPadre = null) => {
    setCuentaPadrePreSelect(idPadre);
    setModalCrear(true);
  };

  const handleCrear = async (payload) => {
    try {
      await crearCuenta(payload);
      setModalCrear(false);
      setCuentaPadrePreSelect(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al crear cuenta: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const handleActualizar = async (idCuenta, cambios) => {
    try {
      await actualizarCuenta(idCuenta, cambios);
      await cargar();
      if (cuentaDetalle?.id_cuenta === idCuenta) {
        const actualizada = (await listarCuentas()).find(c => c.id_cuenta === idCuenta);
        setCuentaDetalle(actualizada);
      }
    } catch (e) {
      console.error(e);
      alert('Error al actualizar: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const handleArchivar = async (idCuenta) => {
    try {
      await archivarCuenta(idCuenta);
      setConfirmArchivar(null);
      setCuentaDetalle(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al archivar: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  if (loading) return <LoadingState message="Cargando cuentas..." />;

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Cuentas donde vive el dinero del negocio. Jerárquicas con sub-cuentas."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => handleAbrirCrear(null)}>
            Nueva cuenta
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 text-sm text-destructive" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {personas.length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-700" style={{ fontWeight: 400 }}>
          Aún no hay personas con acceso a Finanzas registradas. Ve a{' '}
          <a href="/finanzas/configuracion" className="underline" style={{ fontWeight: 500 }}>Configuración</a>
          {' '}para dar acceso a Papá, Mamá u otras personas.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Total activos" value={totalActivos} />
        <MetricCard label="Cuentas raíz" value={totalRaices} isMoney={false} />
        <MetricCard label="Sub-cuentas" value={totalSubCuentas} isMoney={false} />
      </div>

      {cuentasJerarquicas.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.bank}
            title="No hay cuentas todavía"
            description="Crea tu primera cuenta para empezar a registrar los movimientos del negocio."
            action={puedeCrear && (
              <Button variant="primary" icon={ICONS.plus} onClick={() => handleAbrirCrear(null)}>
                Crear primera cuenta
              </Button>
            )}
          />
        </Card>
      ) : (
        <Card padding="sm">
          <div className="space-y-0.5">
            {cuentasJerarquicas.map(cuenta => (
              <CuentaItem
                key={cuenta.id_cuenta}
                cuenta={cuenta}
                nivel={0}
                onClick={(c) => setCuentaDetalle(c || cuenta)}
                onAddChild={puedeCrear ? (idPadre) => handleAbrirCrear(idPadre || cuenta.id_cuenta) : null}
              />
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={modalCrear}
        onClose={() => { setModalCrear(false); setCuentaPadrePreSelect(null); }}
        title={cuentaPadrePreSelect ? 'Nueva sub-cuenta' : 'Nueva cuenta'}
        size="md"
      >
        <FormCuenta
          cuentas={cuentas}
          personas={personas}
          padrePreSelect={cuentaPadrePreSelect}
          onSubmit={handleCrear}
          onCancel={() => { setModalCrear(false); setCuentaPadrePreSelect(null); }}
        />
      </Modal>

      {cuentaDetalle && (
        <Modal
          open={true}
          onClose={() => setCuentaDetalle(null)}
          title={cuentaDetalle.nombre}
          size="lg"
        >
          <DetalleCuenta
            cuenta={cuentaDetalle}
            personas={personas}
            cuentas={cuentas}
            puedeEditar={puedeModif}
            onActualizar={(cambios) => handleActualizar(cuentaDetalle.id_cuenta, cambios)}
            onArchivar={() => setConfirmArchivar(cuentaDetalle)}
            onAddSubcuenta={puedeCrear ? () => {
              setCuentaDetalle(null);
              handleAbrirCrear(cuentaDetalle.id_cuenta);
            } : null}
          />
        </Modal>
      )}

      {confirmArchivar && (
        <Modal
          open={true}
          onClose={() => setConfirmArchivar(null)}
          title="Archivar cuenta"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmArchivar(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleArchivar(confirmArchivar.id_cuenta)}>
                Archivar
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres archivar <span style={{ fontWeight: 500, color: '#1c1917' }}>{confirmArchivar.nombre}</span>?
          </p>
          <p className="text-xs text-muted-foreground mt-2" style={{ fontWeight: 400 }}>
            La cuenta no se elimina, solo se oculta. Los movimientos históricos se conservan.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ──────────────────────────────────────────────────────────────────────────
   CuentaItem - fila jerárquica con expansión recursiva
   ────────────────────────────────────────────────────────────────────────── */

function CuentaItem({ cuenta, nivel, onClick, onAddChild }) {
  const [expandido, setExpandido] = useState(true);
  const tieneHijos = cuenta.hijos && cuenta.hijos.length > 0;
  const colorTipo = COLOR_TIPO_CUENTA[cuenta.tipo_cuenta] || COLOR_TIPO_CUENTA.operativa;
  const saldoRollup = calcularRollupCuenta(cuenta);
  const indent = nivel * 24;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer group"
        style={{ paddingLeft: 12 + indent }}
        onClick={() => onClick(cuenta)}
      >
        {tieneHijos ? (
          <button
            onClick={e => { e.stopPropagation(); setExpandido(!expandido); }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted flex-shrink-0"
          >
            <Icon d={expandido ? ICONS.chevronDown : ICONS.chevronRight} size={14} className="text-muted-foreground" />
          </button>
        ) : (
          <div className="w-5 h-5 flex-shrink-0" />
        )}

        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: colorTipo.border }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-foreground truncate" style={{ fontWeight: 500 }}>{cuenta.nombre}</p>
            {cuenta.alias && (
              <span className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>· {cuenta.alias}</span>
            )}
            {cuenta.es_cuenta_personal && (
              <Badge color="warning" size="sm">Personal</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ backgroundColor: colorTipo.bg, color: colorTipo.text, fontWeight: 500 }}
            >
              {colorTipo.label}
            </span>
            {cuenta.custodio && (
              <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>{cuenta.custodio.nombre}</span>
            )}
            {tieneHijos && (
              <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 400 }}>
                · {cuenta.hijos.length} sub-cuenta{cuenta.hijos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-sm text-foreground fin-num" style={{ fontWeight: 500 }}>
            {formatMoney(cuenta.saldo_actual)}
          </p>
          {tieneHijos && saldoRollup !== Number(cuenta.saldo_actual) && (
            <p className="text-[11px] text-muted-foreground fin-num mt-0.5" style={{ fontWeight: 400 }}>
              Total {formatMoney(saldoRollup)}
            </p>
          )}
        </div>

        {onAddChild && (
          <button
            onClick={e => { e.stopPropagation(); onAddChild(cuenta.id_cuenta); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Agregar sub-cuenta"
          >
            <Icon d={ICONS.plus} size={14} />
          </button>
        )}
      </div>

      {tieneHijos && expandido && (
        <div>
          {cuenta.hijos.map(hijo => (
            <CuentaItem
              key={hijo.id_cuenta}
              cuenta={hijo}
              nivel={nivel + 1}
              onClick={onClick}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/* ──────────────────────────────────────────────────────────────────────────
   FormCuenta - formulario de creación/edición
   ────────────────────────────────────────────────────────────────────────── */

function FormCuenta({ cuentas, personas, padrePreSelect, onSubmit, onCancel, valoresIniciales }) {
  const [form, setForm] = useState({
    codigo: valoresIniciales?.codigo || '',
    nombre: '',
    alias: '',
    tipo_cuenta: 'operativa',
    id_cuenta_padre: padrePreSelect || null,
    id_custodio_actual: null,
    saldo_actual: 0,
    es_cuenta_personal: false,
    titular_legal: '',
    banco: '',
    notas: '',
    mostrar_en_cierre_tienda: false,
    ...(valoresIniciales || {}),
  });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState({});

  const cuentasPosiblesPadre = cuentas.filter(c =>
    c.id_cuenta !== valoresIniciales?.id_cuenta && c.activa
  );

  const validar = () => {
    const errs = {};
    if (!form.nombre?.trim()) errs.nombre = 'Requerido';
    if (!form.tipo_cuenta) errs.tipo_cuenta = 'Requerido';
    setErrorForm(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      const payload = {
        codigo: codigoAutoGenerado,
        nombre: form.nombre.trim(),
        alias: form.alias?.trim() || null,
        tipo_cuenta: form.tipo_cuenta,
        id_cuenta_padre: form.id_cuenta_padre || null,
        id_custodio_actual: form.id_custodio_actual || null,
        saldo_actual: Number(form.saldo_actual) || 0,
        es_cuenta_personal: !!form.es_cuenta_personal,
        titular_legal: form.titular_legal?.trim() || null,
        banco: form.banco?.trim() || null,
        notas: form.notas?.trim() || null,
        mostrar_en_cierre_tienda: !!form.mostrar_en_cierre_tienda,
        activa: true,
      };
      await onSubmit(payload);
    } finally {
      setGuardando(false);
    }
  };

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // Auto-generar código cuando cambia el tipo (solo en creación)
  const codigoAutoGenerado = useMemo(() => {
    if (valoresIniciales?.codigo) return valoresIniciales.codigo;
    return generarCodigoCuenta(form.tipo_cuenta, cuentas.map(c => c.codigo));
  }, [form.tipo_cuenta, cuentas, valoresIniciales]);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col justify-end">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Código (auto)</p>
          <p className="text-sm font-mono text-foreground bg-muted/30 border border-border rounded-lg px-3 py-2.5">{codigoAutoGenerado}</p>
        </div>

        <Field label="Tipo" required error={errorForm.tipo_cuenta}>
          <Select
            value={form.tipo_cuenta}
            onChange={v => setF('tipo_cuenta', v)}
            options={TIPOS_CUENTA}
          />
        </Field>
      </div>

      <Field label="Nombre formal" required error={errorForm.nombre} hint="El nombre profesional para reportes">
        <Input
          value={form.nombre}
          onChange={v => setF('nombre', v)}
          placeholder="Caja Producción"
          error={errorForm.nombre}
        />
      </Field>

      <Field label="Alias familiar" hint="Nombre coloquial opcional, ej: Caja de Papá">
        <Input
          value={form.alias}
          onChange={v => setF('alias', v)}
          placeholder="Caja de Papá"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Cuenta padre" hint="Vacío = cuenta raíz">
          <Select
            value={form.id_cuenta_padre || ''}
            onChange={v => setF('id_cuenta_padre', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Cuenta raíz —' },
              ...cuentasPosiblesPadre.map(c => ({
                value: c.id_cuenta,
                label: c.nombre + (c.alias ? ` (${c.alias})` : ''),
              })),
            ]}
          />
        </Field>

        <Field label="Custodio actual" hint="Solo personas con acceso a Finanzas">
          <Select
            value={form.id_custodio_actual || ''}
            onChange={v => setF('id_custodio_actual', v ? Number(v) : null)}
            options={[
              { value: '', label: '— Sin custodio —' },
              ...personas.map(p => ({ value: p.id_persona, label: p.nombre })),
            ]}
          />
        </Field>
      </div>

      <Field label="Saldo inicial" hint="Saldo actual al momento de crear la cuenta">
        <MoneyInput
          value={form.saldo_actual}
          onChange={v => setF('saldo_actual', v)}
          placeholder="0"
        />
      </Field>

      <div className="border-t border-border/50 pt-4 mt-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.es_cuenta_personal}
            onChange={e => setF('es_cuenta_personal', e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>Cuenta a nombre personal</p>
            <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>Marcar si legalmente está a nombre de una persona, no del negocio</p>
          </div>
        </label>
      </div>

      {form.es_cuenta_personal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 bg-amber-50/40/30 rounded-lg border border-amber-200">
          <Field label="Titular legal">
            <Input value={form.titular_legal} onChange={v => setF('titular_legal', v)} placeholder="Nombre del titular" />
          </Field>
          <Field label="Banco / institución">
            <Input value={form.banco} onChange={v => setF('banco', v)} placeholder="BCP, Interbank..." />
          </Field>
        </div>
      )}

      <div className="border-t border-border/50 pt-4 mt-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.mostrar_en_cierre_tienda}
            onChange={e => setF('mostrar_en_cierre_tienda', e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>Aparece como destino al cerrar tienda</p>
            <p className="text-xs text-muted-foreground" style={{ fontWeight: 400 }}>
              Si está marcado, esta cuenta aparece como opción al cerrar caja diaria en cualquier tienda.
              Por defecto solo Caja Producción y Caja Administración están marcadas.
            </p>
          </div>
        </label>
      </div>

      <Field label="Notas">
        <textarea
          value={form.notas || ''}
          onChange={e => setF('notas', e.target.value)}
          rows={2}
          placeholder="Observaciones, contexto..."
          style={{ fontWeight: 400 }}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:border-ring focus:ring-1 focus-visible:ring-ring/50"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border/50">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar cuenta'}
        </Button>
      </div>
    </div>
  );
}


/* ──────────────────────────────────────────────────────────────────────────
   DetalleCuenta - vista expandida con tabs
   ────────────────────────────────────────────────────────────────────────── */

function DetalleCuenta({ cuenta, personas, cuentas, puedeEditar, onActualizar, onArchivar, onAddSubcuenta }) {
  const [tab, setTab] = useState('info');
  const [editando, setEditando] = useState(false);
  const [movs, setMovs] = useState([]);
  const [loadingMovs, setLoadingMovs] = useState(false);

  const colorTipo = COLOR_TIPO_CUENTA[cuenta.tipo_cuenta] || COLOR_TIPO_CUENTA.operativa;

  useEffect(() => {
    if (tab === 'movimientos') {
      setLoadingMovs(true);
      listarMovimientosCuenta(cuenta.id_cuenta, { limit: 50 })
        .then(setMovs)
        .catch(console.error)
        .finally(() => setLoadingMovs(false));
    }
  }, [tab, cuenta.id_cuenta]);

  return (
    <div>
      <div className="flex items-start gap-4 pb-4 border-b border-border/50">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorTipo.bg }}
        >
          <Icon d={ICONS.bank} size={20} style={{ color: colorTipo.text }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[17px] text-foreground" style={{ fontWeight: 600 }}>{cuenta.nombre}</h2>
            <Badge color="gray" size="sm">{colorTipo.label}</Badge>
            {cuenta.es_cuenta_personal && <Badge color="warning" size="sm">Personal</Badge>}
          </div>
          {cuenta.alias && <p className="text-sm text-muted-foreground" style={{ fontWeight: 400 }}>{cuenta.alias}</p>}
          <p className="text-xs text-muted-foreground mt-1" style={{ fontWeight: 400 }}>Código: <span className="font-mono">{cuenta.codigo}</span></p>
        </div>
        <div className="text-right">
          <p className="text-[24px] text-foreground fin-num leading-none" style={{ fontWeight: 500, letterSpacing: '-0.02em' }}>
            {formatMoney(cuenta.saldo_actual)}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5" style={{ fontWeight: 400 }}>Saldo actual</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border/50 mt-4">
        {[
          { k: 'info',        label: 'Información' },
          { k: 'movimientos', label: 'Movimientos' },
          { k: 'config',      label: 'Configuración' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.k
                ? 'text-foreground border-ring'
                : 'text-muted-foreground border-transparent hover:text-muted-foreground'
            }`}
            style={{ fontWeight: tab === t.k ? 500 : 400 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-5">
        {tab === 'info' && (
          <div className="space-y-2.5">
            <DetalleField label="Custodio" value={cuenta.custodio?.nombre || '—'} />
            <DetalleField label="Tipo" value={colorTipo.label} />
            <DetalleField label="Moneda" value={cuenta.moneda} />
            {cuenta.es_cuenta_personal && (
              <>
                <DetalleField label="Titular legal" value={cuenta.titular_legal || '—'} />
                <DetalleField label="Banco" value={cuenta.banco || '—'} />
              </>
            )}
            <DetalleField
              label="Destino en cierre de tienda"
              value={cuenta.mostrar_en_cierre_tienda ? 'Sí, aparece al cerrar tienda' : 'No'}
            />
            <DetalleField label="Creada" value={formatDate(cuenta.created_at)} />
            <DetalleField label="Actualizada" value={formatDate(cuenta.updated_at)} />
            {cuenta.notas && (
              <div className="pt-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 500 }}>Notas</p>
                <p className="text-sm text-foreground bg-muted/30 rounded-lg p-3" style={{ fontWeight: 400 }}>{cuenta.notas}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'movimientos' && (
          <div>
            {loadingMovs ? (
              <LoadingState message="Cargando movimientos..." />
            ) : movs.length === 0 ? (
              <EmptyState
                icon={ICONS.exchange}
                title="Sin movimientos todavía"
                description="Cuando registres movimientos sobre esta cuenta, aparecerán aquí."
              />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left" style={{ fontWeight: 500 }}>Fecha</th>
                      <th className="px-4 py-2.5 text-left" style={{ fontWeight: 500 }}>Concepto</th>
                      <th className="px-4 py-2.5 text-right" style={{ fontWeight: 500 }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map(m => (
                      <tr key={m.id_movimiento} className="border-t border-border/50">
                        <td className="px-4 py-2.5 text-muted-foreground fin-num" style={{ fontWeight: 400 }}>{formatDate(m.fecha_movimiento)}</td>
                        <td className="px-4 py-2.5 text-foreground" style={{ fontWeight: 400 }}>{m.concepto}</td>
                        <td className={`px-4 py-2.5 text-right fin-num ${
                          m.tipo === 'ingreso' ? 'text-green-700' : 'text-destructive'
                        }`} style={{ fontWeight: 500 }}>
                          {m.tipo === 'ingreso' ? '+' : '−'}{formatMoney(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'config' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4" style={{ fontWeight: 400 }}>
              Acciones administrativas. Cambios aquí afectan el comportamiento de la cuenta en todo el sistema.
            </p>

            <div className="flex flex-col gap-2">
              {onAddSubcuenta && (
                <Button icon={ICONS.plus} onClick={onAddSubcuenta}>
                  Crear sub-cuenta debajo de esta
                </Button>
              )}
              {puedeEditar && !editando && (
                <Button icon={ICONS.edit} onClick={() => setEditando(true)}>
                  Editar información
                </Button>
              )}
              {puedeEditar && (
                <Button variant="danger" icon={ICONS.trash} onClick={onArchivar}>
                  Archivar cuenta
                </Button>
              )}
            </div>

            {editando && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-sm text-foreground mb-3" style={{ fontWeight: 500 }}>Editar cuenta</p>
                <FormCuenta
                  cuentas={cuentas}
                  personas={personas}
                  padrePreSelect={null}
                  valoresIniciales={cuenta}
                  onSubmit={async (cambios) => {
                    await onActualizar(cambios);
                    setEditando(false);
                  }}
                  onCancel={() => setEditando(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetalleField({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 500 }}>{label}</span>
      <span className="text-sm text-foreground" style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}