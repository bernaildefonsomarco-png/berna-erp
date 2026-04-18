import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  listarTodasLasPersonas, crearPersona, actualizarPersona,
  listarPermisosDePersona, asignarPermiso, revocarPermiso,
  listarUbicacionesTiendas,
} from '../api/finanzasClient';
import { esAdmin, RECURSOS } from '../lib/permisos';
import {
  Card, Button, Badge, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

const NIVELES_FIN = [
  { value: 'ver', label: 'Solo ver' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'editar', label: 'Editar' },
  { value: 'admin', label: 'Administrar' },
];

export default function PersonasEquipo({ usuario }) {
  const [personas, setPersonas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [permisosPorId, setPermisosPorId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [editar, setEditar] = useState(null);

  const esAdministrador = esAdmin(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const [ps, ubs] = await Promise.all([
        listarTodasLasPersonas({ incluirInactivas: true }),
        listarUbicacionesTiendas(),
      ]);
      setPersonas(ps);
      setUbicaciones(ubs);
      const map = {};
      for (const p of ps) {
        // eslint-disable-next-line no-await-in-loop
        map[p.id_persona] = (await listarPermisosDePersona(p.id_persona)).filter(x => x.activo);
      }
      setPermisosPorId(map);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const permisoFin = (id) => (permisosPorId[id] || []).find(x => x.recurso === 'finanzas');
  const permisoCaja = (id) => (permisosPorId[id] || []).find(x => x.recurso === 'caja');
  const permisoRapido = (id) => (permisosPorId[id] || []).find(x => x.recurso === 'comando');

  const handleToggleCaja = async (idPersona, activar) => {
    try {
      if (activar) await asignarPermiso(idPersona, 'caja', 'ver');
      else await revocarPermiso(idPersona, 'caja');
      await cargar();
    } catch (e) {
      alert(e.message || 'Error al actualizar acceso a Caja');
    }
  };

  const handleNivelFinanzas = async (idPersona, nivel) => {
    try {
      await asignarPermiso(idPersona, 'finanzas', nivel);
      await cargar();
    } catch (e) {
      alert(e.message || 'Error');
    }
  };

  const handleRevocarFinanzas = async (idPersona) => {
    try {
      await revocarPermiso(idPersona, 'finanzas');
      await cargar();
    } catch (e) {
      alert(e.message || 'Error');
    }
  };

  const handleToggleRapido = async (idPersona, activar) => {
    try {
      if (activar) await asignarPermiso(idPersona, 'comando', 'registrar');
      else await revocarPermiso(idPersona, 'comando');
      await cargar();
    } catch (e) {
      alert(e.message || 'Error al actualizar acceso al Modo Rápido');
    }
  };

  if (loading) return <LoadingState message="Cargando equipo..." />;

  if (!esAdministrador) {
    return (
      <>
        <PageHeader title="Personas del negocio" description="Equipo y permisos" />
        <Card>
          <EmptyState
            icon={ICONS.shield}
            title="Sin acceso"
            description="Solo administradores de Finanzas pueden gestionar el equipo."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Personas del negocio"
        description="Equipo, tienda preferida, acceso a Caja del POS y nivel en Finanzas. Los detalles avanzados siguen en Configuración."
        actions={
          <Link to="/finanzas/configuracion" className="text-xs text-muted-foreground hover:text-foreground" style={{ fontWeight: 500 }}>
            Ir a Configuración →
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-destructive">{error}</div>
      )}

      <Card padding="md" className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>Listado</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Desactiva a quien ya no trabaja aquí; el historial de movimientos se conserva.
            </p>
          </div>
          <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>Nueva persona</Button>
        </div>

        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/30 text-[11px] text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Persona</th>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Estado</th>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Tienda preferida</th>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Caja POS</th>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Finanzas</th>
                <th className="px-3 py-2 text-left" style={{ fontWeight: 500 }}>Modo Rápido</th>
                <th className="px-3 py-2 text-right" style={{ fontWeight: 500 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {personas.map(p => {
                const pf = permisoFin(p.id_persona);
                const pc = permisoCaja(p.id_persona);
                const pr = permisoRapido(p.id_persona);
                const uPref = ubicaciones.find(u => u.id_ubicacion === p.id_ubicacion_preferida);
                return (
                  <tr key={p.id_persona} className="border-t border-border/50">
                    <td className="px-3 py-2.5">
                      <span style={{ fontWeight: 500 }}>{p.nombre}</span>
                      <div className="text-[10px] text-muted-foreground">
                        PIN: {(p.pin || p.pin_hash) ? '••••' : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.activa ? <Badge color="teal" size="sm">Activa</Badge> : <Badge color="gray" size="sm">Inactiva</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{uPref?.nombre || '—'}</td>
                    <td className="px-3 py-2.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!pc}
                          disabled={!p.activa}
                          onChange={e => handleToggleCaja(p.id_persona, e.target.checked)}
                        />
                        <span className="text-xs text-muted-foreground">Ver Caja</span>
                      </label>
                    </td>
                    <td className="px-3 py-2.5">
                      {pf ? (
                        <Select
                          value={pf.nivel_acceso}
                          onChange={v => handleNivelFinanzas(p.id_persona, v)}
                          options={NIVELES_FIN}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin acceso</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!pr}
                          disabled={!p.activa}
                          onChange={e => handleToggleRapido(p.id_persona, e.target.checked)}
                        />
                        <span className="text-xs text-muted-foreground">Activar</span>
                      </label>
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-1">
                      <Button size="sm" onClick={() => setEditar(p)}>Editar</Button>
                      {pf && (
                        <Button size="sm" variant="ghost" onClick={() => handleRevocarFinanzas(p.id_persona)}>
                          Quitar Finanzas
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nueva persona" size="md">
        <FormPersonaEquipo
          ubicaciones={ubicaciones}
          onSubmit={async (payload) => {
            await crearPersona(payload);
            setModalCrear(false);
            await cargar();
          }}
          onCancel={() => setModalCrear(false)}
        />
      </Modal>

      {editar && (
        <Modal open onClose={() => setEditar(null)} title={`Editar — ${editar.nombre}`} size="md">
          <FormEditarPersonaEquipo
            persona={editar}
            ubicaciones={ubicaciones}
            onSubmit={async (cambios) => {
              await actualizarPersona(editar.id_persona, cambios);
              setEditar(null);
              await cargar();
            }}
            onDarFinanzas={(nivel) => handleNivelFinanzas(editar.id_persona, nivel)}
            tieneFinanzas={!!permisoFin(editar.id_persona)}
            onCancel={() => setEditar(null)}
          />
        </Modal>
      )}
    </>
  );
}

function FormPersonaEquipo({ ubicaciones, onSubmit, onCancel }) {
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [idUb, setIdUb] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errs, setErrs] = useState({});

  const validar = () => {
    const e = {};
    if (!nombre.trim()) e.nombre = 'Requerido';
    if (pin && !/^\d{4,6}$/.test(pin)) e.pin = '4 a 6 dígitos';
    setErrs(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        pin: pin.trim() || null,
        id_ubicacion_preferida: idUb ? Number(idUb) : null,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <Field label="Nombre" required error={errs.nombre}>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: José" error={errs.nombre} />
      </Field>
      <Field label="PIN (opcional)" error={errs.pin} hint="POS y Finanzas si tiene permiso">
        <Input value={pin} onChange={setPin} inputMode="numeric" maxLength={6} error={errs.pin} />
      </Field>
      <Field label="Tienda preferida" hint="Opcional">
        <Select
          value={idUb}
          onChange={setIdUb}
          options={[{ value: '', label: '— Sin asignar —' }, ...ubicaciones.map(u => ({ value: u.id_ubicacion, label: u.nombre }))]}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/50">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={submit} disabled={guardando}>
          {guardando ? <><Spinner size={14} /> Guardando…</> : 'Crear'}
        </Button>
      </div>
    </div>
  );
}

function FormEditarPersonaEquipo({ persona, ubicaciones, onSubmit, onDarFinanzas, tieneFinanzas, onCancel }) {
  const [nombre, setNombre] = useState(persona.nombre);
  const [activa, setActiva] = useState(persona.activa);
  const [idUb, setIdUb] = useState(persona.id_ubicacion_preferida || '');
  const [nuevoPin, setNuevoPin] = useState('');
  const [nivelFin, setNivelFin] = useState('ver');
  const [guardando, setGuardando] = useState(false);

  const submit = async () => {
    setGuardando(true);
    try {
      const cambios = {
        nombre: nombre.trim(),
        activa,
        id_ubicacion_preferida: idUb ? Number(idUb) : null,
      };
      if (nuevoPin.trim()) {
        if (!/^\d{4,6}$/.test(nuevoPin.trim())) {
          alert('PIN: 4 a 6 dígitos');
          return;
        }
        cambios.pin = nuevoPin.trim();
      }
      await onSubmit(cambios);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Nombre" required>
        <Input value={nombre} onChange={setNombre} />
      </Field>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={activa} onChange={e => setActiva(e.target.checked)} />
        Persona activa
      </label>
      <Field label="Tienda preferida">
        <Select
          value={idUb || ''}
          onChange={v => setIdUb(v ? Number(v) : '')}
          options={[{ value: '', label: '— Sin asignar —' }, ...ubicaciones.map(u => ({ value: u.id_ubicacion, label: u.nombre }))]}
        />
      </Field>
      <Field label="Nuevo PIN" hint="Vacío = no cambiar. Al guardar se almacena de forma segura.">
        <Input value={nuevoPin} onChange={setNuevoPin} inputMode="numeric" maxLength={6} />
      </Field>

      {!tieneFinanzas && (
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2">Dar acceso a Finanzas</p>
          <div className="flex gap-2 flex-wrap">
            <Select value={nivelFin} onChange={setNivelFin} options={NIVELES_FIN} />
            <Button size="sm" variant="primary" onClick={() => onDarFinanzas(nivelFin)}>Dar acceso</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
        <Button onClick={onCancel} disabled={guardando}>Cerrar</Button>
        <Button variant="primary" onClick={submit} disabled={guardando}>
          {guardando ? <Spinner size={14} /> : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
