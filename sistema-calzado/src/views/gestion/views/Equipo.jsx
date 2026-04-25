import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  listarTodasLasPersonas,
  listarPermisosDePersona, asignarPermiso, revocarPermiso,
  actualizarPersona,
  listarCuentas,
  obtenerConfiguracionClaves, guardarConfiguracionClave,
} from '../api/finanzasClient';
import { esAdmin, RECURSOS } from '../lib/permisos';
import {
  Card, Button, Badge, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
  SideSheet, AvatarInitials, InlineTabs,
} from '../components/UI';
import { cn } from '@/lib/utils';

/* ══════════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const NIVELES_FIN = [
  { value: 'ver',       label: 'Ver' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'editar',    label: 'Editar' },
  { value: 'admin',     label: 'Admin' },
];

const NIVEL_COLORS = {
  ver:       'text-blue-700 bg-blue-50',
  registrar: 'text-teal-700 bg-teal-50',
  editar:    'text-purple-700 bg-purple-50',
  admin:     'text-amber-700 bg-amber-50',
};

const CLAVE_LIQUIDEZ = 'finanzas_cuentas_liquidez_lunes';

/* ══════════════════════════════════════════════════════════════════════════
   ROOT
   ══════════════════════════════════════════════════════════════════════════ */

export default function Equipo({ usuario }) {
  const [tab, setTab] = useState('permisos');

  if (!esAdmin(usuario, RECURSOS.FINANZAS)) {
    return (
      <>
        <PageHeader title="Equipo" description="Permisos y configuración del sistema" />
        <Card>
          <EmptyState
            icon={ICONS.shield}
            title="Sin acceso"
            description="Solo administradores de Finanzas pueden gestionar permisos y ajustes."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Permisos de acceso al sistema y configuración global."
      />

      {/* Link a Trabajadores */}
      <Link
        to="/gestion/trabajadores"
        className="mb-5 flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Icon d={ICONS.users} size={16} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900">Gestión de trabajadores</p>
            <p className="text-xs text-emerald-700">Perfiles, nómina, pagos y cargos del personal — ir a Trabajadores</p>
          </div>
        </div>
        <Icon d={ICONS.arrowRight} size={14} className="text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      <InlineTabs
        tabs={[
          { k: 'permisos', label: 'Permisos de acceso' },
          { k: 'ajustes',  label: 'Ajustes del sistema' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === 'permisos' && <TabPermisos usuario={usuario} />}
      {tab === 'ajustes'  && <TabAjustes />}
    </>
  );
}


/* ── Tab Permisos ───────────────────────────────────────────────────────── */

function TabPermisos({ usuario }) {
  const [personas, setPersonas]       = useState([]);
  const [permisosPorId, setPermPorId] = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [gestionando, setGestionando] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const ps = await listarTodasLasPersonas({ incluirInactivas: true });
      setPersonas(ps);
      // Fetch permissions in parallel (not N+1)
      const entries = await Promise.all(
        ps.map(p => listarPermisosDePersona(p.id_persona).then(rows => [p.id_persona, rows.filter(x => x.activo)]))
      );
      setPermPorId(Object.fromEntries(entries));
    } catch (e) { setError(e.message || 'Error al cargar'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const permOf = (id, r) => (permisosPorId[id] || []).find(x => x.recurso === r);

  const handleToggle = async (id, recurso, activar, nivel = 'ver') => {
    try {
      if (activar) await asignarPermiso(id, recurso, nivel);
      else         await revocarPermiso(id, recurso);
      await cargar();
    } catch (e) { alert(e.message || 'Error'); }
  };

  if (loading) return <LoadingState message="Cargando permisos..." />;

  const activas  = personas.filter(p => p.activa);
  const inactivas = personas.filter(p => !p.activa);

  return (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>
      )}

      <p className="text-xs text-muted-foreground mb-3">
        Haz clic en <span className="font-medium text-foreground">Gestionar</span> para cambiar el nivel de acceso, el PIN, o desactivar una persona.
        Para editar cargo, área y nómina, ve a <Link to="/gestion/trabajadores" className="text-primary underline">Trabajadores</Link>.
      </p>

      {/* Activos */}
      <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Activos · {activas.length}
          </p>
        </div>
        <div className="divide-y divide-border/30">
          {activas.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Sin personas activas.</p>
          ) : activas.map(p => (
            <PersonaRow
              key={p.id_persona}
              persona={p}
              permFin={permOf(p.id_persona, 'finanzas')}
              permCaja={permOf(p.id_persona, 'caja')}
              permRapido={permOf(p.id_persona, 'comando')}
              esSelf={usuario?.id_persona === p.id_persona}
              onToggle={handleToggle}
              onGestionar={() => setGestionando(p)}
            />
          ))}
        </div>
      </div>

      {/* Inactivos */}
      {inactivas.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden opacity-75">
          <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Inactivos · {inactivas.length}
            </p>
          </div>
          <div className="divide-y divide-border/20">
            {inactivas.map(p => (
              <PersonaRow
                key={p.id_persona}
                persona={p}
                permFin={permOf(p.id_persona, 'finanzas')}
                permCaja={permOf(p.id_persona, 'caja')}
                permRapido={permOf(p.id_persona, 'comando')}
                esSelf={false}
                disabled
                onToggle={handleToggle}
                onGestionar={() => setGestionando(p)}
              />
            ))}
          </div>
        </div>
      )}

      {gestionando && (
        <SideSheet
          open={true}
          onClose={() => setGestionando(null)}
          title={gestionando.nombre}
          size="sm"
        >
          <SheetGestionar
            persona={gestionando}
            permisos={permisosPorId[gestionando.id_persona] || []}
            esSelf={usuario?.id_persona === gestionando.id_persona}
            onClose={() => setGestionando(null)}
            onRefresh={async () => { await cargar(); }}
          />
        </SideSheet>
      )}
    </>
  );
}


/* ── PersonaRow ─────────────────────────────────────────────────────────── */

function PersonaRow({ persona, permFin, permCaja, permRapido, esSelf, disabled, onToggle, onGestionar }) {
  const nivelFin = permFin?.nivel_acceso;

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 group', disabled && 'opacity-60')}>
      <AvatarInitials name={persona.nombre} size={34} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{persona.nombre}</p>
          {nivelFin && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold', NIVEL_COLORS[nivelFin])}>
              Finanzas: {NIVELES_FIN.find(n => n.value === nivelFin)?.label}
            </span>
          )}
          {permCaja && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-foreground bg-muted">
              POS
            </span>
          )}
          {permRapido && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-orange-700 bg-orange-50">
              Rápido
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{persona.rol || '—'}</p>
      </div>

      <button
        onClick={onGestionar}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-all"
      >
        Gestionar
      </button>
    </div>
  );
}


/* ── SheetGestionar ─────────────────────────────────────────────────────── */

function SheetGestionar({ persona, permisos, esSelf, onClose, onRefresh }) {
  const [tabActivo, setTabActivo] = useState('permisos');
  const [saving, setSaving]       = useState(false);
  const [nombre, setNombre]       = useState(persona.nombre);
  const [activa, setActiva]       = useState(persona.activa);
  const [nuevoPin, setNuevoPin]   = useState('');
  const [pinError, setPinError]   = useState('');
  const [pinMsg, setPinMsg]       = useState('');

  const pf = permisos.find(x => x.recurso === 'finanzas');
  const pc = permisos.find(x => x.recurso === 'caja');
  const pr = permisos.find(x => x.recurso === 'comando');
  const [nivelFin, setNivelFin] = useState(pf?.nivel_acceso || 'ver');

  const wrap = async (fn) => {
    setSaving(true);
    try { await fn(); await onRefresh(); }
    catch (e) { alert(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  const guardarInfo = () => wrap(() => actualizarPersona(persona.id_persona, {
    nombre: nombre.trim(),
    activa,
  }));

  const guardarPin = async () => {
    const pin = nuevoPin.trim();
    if (pin && !/^\d{4,6}$/.test(pin)) { setPinError('4 a 6 dígitos'); return; }
    setPinError(''); setSaving(true);
    try {
      await actualizarPersona(persona.id_persona, { pin: pin || null });
      setPinMsg(pin ? 'PIN actualizado.' : 'PIN eliminado.');
      setNuevoPin('');
    } catch (e) { setPinMsg(e.message || 'Error'); }
    finally { setSaving(false); }
  };

  const togglePerm = (recurso, activar, nivel = 'ver') => wrap(() =>
    activar ? asignarPermiso(persona.id_persona, recurso, nivel) : revocarPermiso(persona.id_persona, recurso)
  );

  const asignarFin = (nivel) => wrap(() => asignarPermiso(persona.id_persona, 'finanzas', nivel));
  const revocarFin = () => wrap(() => revocarPermiso(persona.id_persona, 'finanzas'));

  return (
    <div>
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-border/50">
        <AvatarInitials name={persona.nombre} size={40} />
        <div>
          <p className="text-sm font-semibold text-foreground">{persona.nombre}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {!persona.activa && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">Inactivo</span>}
            {pf && <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', NIVEL_COLORS[pf.nivel_acceso])}>{NIVELES_FIN.find(n => n.value === pf.nivel_acceso)?.label}</span>}
            {pc && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-foreground bg-muted">POS</span>}
          </div>
        </div>
      </div>

      <InlineTabs
        tabs={[
          { k: 'permisos', label: 'Permisos' },
          { k: 'info',     label: 'Información' },
          { k: 'pin',      label: 'PIN' },
        ]}
        active={tabActivo}
        onChange={setTabActivo}
        className="mb-4"
      />

      {tabActivo === 'permisos' && (
        <div className="space-y-4">
          {/* Finanzas */}
          <div className="p-4 rounded-xl border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Finanzas</p>
            {pf ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={nivelFin}
                    onChange={v => { setNivelFin(v); asignarFin(v); }}
                    options={NIVELES_FIN}
                  />
                  <span className={cn('inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold shrink-0', NIVEL_COLORS[nivelFin])}>
                    {NIVELES_FIN.find(n => n.value === nivelFin)?.label}
                  </span>
                </div>
                {!esSelf ? (
                  <button onClick={revocarFin} className="text-xs text-destructive hover:underline">
                    Revocar acceso a Finanzas
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">No puedes revocar tu propio acceso.</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Select value={nivelFin} onChange={setNivelFin} options={NIVELES_FIN} />
                </div>
                <Button size="sm" variant="primary" onClick={() => asignarFin(nivelFin)}>
                  Dar acceso a Finanzas
                </Button>
              </div>
            )}
          </div>

          {/* Caja POS */}
          <div className="p-4 rounded-xl border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Caja POS</p>
            <label className={cn('flex items-center gap-2 text-sm cursor-pointer', !persona.activa && 'opacity-50 pointer-events-none')}>
              <input
                type="checkbox"
                checked={!!pc}
                onChange={e => togglePerm('caja', e.target.checked)}
                disabled={!persona.activa || saving}
              />
              <span className="text-foreground">Acceso a la caja del POS</span>
            </label>
          </div>

          {/* Modo Rápido */}
          <div className="p-4 rounded-xl border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Modo Rápido</p>
            <label className={cn('flex items-center gap-2 text-sm cursor-pointer', !persona.activa && 'opacity-50 pointer-events-none')}>
              <input
                type="checkbox"
                checked={!!pr}
                onChange={e => togglePerm('comando', e.target.checked, 'registrar')}
                disabled={!persona.activa || saving}
              />
              <span className="text-foreground">Acceso al Modo Rápido</span>
            </label>
          </div>

          <button onClick={onClose} className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2">
            Cerrar
          </button>
        </div>
      )}

      {tabActivo === 'info' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl border border-border/50 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1">
              Para editar cargo, área y modalidad de pago del trabajador,
              ve a <Link to="/gestion/trabajadores" className="text-primary underline font-medium" onClick={onClose}>Trabajadores</Link>.
            </p>
          </div>

          <Field label="Nombre" required>
            <Input value={nombre} onChange={setNombre} />
          </Field>

          <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
            <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} />
            Persona activa
          </label>

          <div className="flex gap-2 pt-2">
            <Button onClick={onClose} disabled={saving} className="flex-1">Cancelar</Button>
            <Button variant="primary" onClick={guardarInfo} disabled={saving} className="flex-1">
              {saving ? <><Spinner size={14} /> Guardando...</> : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      {tabActivo === 'pin' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">PIN actual</p>
            <p className="text-sm text-foreground">
              {(persona.pin || persona.pin_hash)
                ? <span className="font-mono tracking-widest text-xl">••••</span>
                : <span className="text-muted-foreground italic">Sin PIN asignado</span>}
            </p>
          </div>

          <Field label="Nuevo PIN" error={pinError} hint="4–6 dígitos. Deja vacío para quitar el PIN.">
            <Input
              value={nuevoPin}
              onChange={v => { setNuevoPin(v); setPinMsg(''); setPinError(''); }}
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              error={pinError}
            />
          </Field>

          {pinMsg && (
            <p className={cn('text-sm font-medium', pinMsg.includes('Error') ? 'text-destructive' : 'text-emerald-700')}>
              {pinMsg}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={onClose} className="flex-1">Cancelar</Button>
            <Button variant="primary" onClick={guardarPin} disabled={saving} className="flex-1">
              {saving ? <><Spinner size={14} /> Guardando...</> : 'Actualizar PIN'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ── Tab Ajustes ────────────────────────────────────────────────────────── */

function TabAjustes() {
  const [cuentas, setCuentas]         = useState([]);
  const [idsLiquidez, setIdsLiquidez] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cs, cfg] = await Promise.all([
          listarCuentas({ incluirInactivas: false }),
          obtenerConfiguracionClaves([CLAVE_LIQUIDEZ]),
        ]);
        setCuentas(cs);
        let arr = [];
        try { arr = JSON.parse(cfg[CLAVE_LIQUIDEZ] || '[]'); if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
        setIdsLiquidez(arr.map(Number).filter(n => !Number.isNaN(n)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const guardar = async () => {
    setSaving(true); setMsg('');
    try {
      await guardarConfiguracionClave(CLAVE_LIQUIDEZ, JSON.stringify(idsLiquidez));
      setMsg('Cambios guardados.');
    } catch (e) { setMsg(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState message="Cargando ajustes..." />;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Cuentas para liquidez de lunes</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Las cuentas marcadas se suman en el widget del Dashboard para mostrar el capital disponible para compra de materiales.
        </p>

        {cuentas.length === 0 ? (
          <EmptyState icon={ICONS.bank} title="Sin cuentas" description="Crea cuentas financieras para configurarlas aquí." />
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border/40">
            {cuentas.map(c => (
              <label
                key={c.id_cuenta}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors',
                  idsLiquidez.includes(c.id_cuenta) && 'bg-muted/20'
                )}
              >
                <input
                  type="checkbox"
                  className="rounded"
                  checked={idsLiquidez.includes(c.id_cuenta)}
                  onChange={() => setIdsLiquidez(p =>
                    p.includes(c.id_cuenta) ? p.filter(x => x !== c.id_cuenta) : [...p, c.id_cuenta]
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.nombre}</p>
                  {c.alias && <p className="text-[10px] text-muted-foreground">{c.alias}</p>}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{c.codigo}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <p className={cn('text-sm font-medium', msg.includes('Error') ? 'text-destructive' : 'text-emerald-700')}>
          {msg}
        </p>
      )}

      <Button variant="primary" onClick={guardar} disabled={saving || cuentas.length === 0}>
        {saving ? <><Spinner size={14} /> Guardando...</> : 'Guardar ajustes'}
      </Button>
    </div>
  );
}
