import React, { useState, useEffect } from 'react';
import {
  listarTodasLasPersonas, crearPersona, actualizarPersona,
  listarPermisosDePersona, asignarPermiso, revocarPermiso
} from '../api/finanzasClient';
import { formatDate } from '../lib/calculos';
import { esAdmin, RECURSOS } from '../lib/permisos';
import {
  Card, Button, Badge, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   CONFIGURACIÓN · gestión de personas y permisos
   ────────────────────────────────────────────────────────────────────────── */

const NIVELES = [
  { value: 'ver',       label: 'Solo ver'   },
  { value: 'registrar', label: 'Registrar'  },
  { value: 'editar',    label: 'Editar'     },
  { value: 'admin',     label: 'Administrar'},
];

const NIVEL_BADGE_COLOR = {
  ver: 'info',
  registrar: 'teal',
  editar: 'purple',
  admin: 'warning',
};

export default function Configuracion({ usuario }) {
  const [personas, setPersonas] = useState([]);
  const [permisos, setPermisos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalCrear, setModalCrear] = useState(false);
  const [personaDetalle, setPersonaDetalle] = useState(null);

  const esAdministrador = esAdmin(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const ps = await listarTodasLasPersonas({ incluirInactivas: false });
      setPersonas(ps);
      const permisosObj = {};
      for (const p of ps) {
        const pp = await listarPermisosDePersona(p.id_persona);
        permisosObj[p.id_persona] = pp.filter(x => x.activo);
      }
      setPermisos(permisosObj);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleCrearPersona = async ({ nombre, pin }) => {
    try {
      const nueva = await crearPersona({ nombre, pin });
      setModalCrear(false);
      await cargar();
      setPersonaDetalle(nueva);
    } catch (e) {
      console.error(e);
      alert('Error al crear persona: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const handleActualizarPersona = async (idPersona, cambios) => {
    try {
      await actualizarPersona(idPersona, cambios);
      await cargar();
      if (personaDetalle?.id_persona === idPersona) {
        const actualizada = (await listarTodasLasPersonas()).find(p => p.id_persona === idPersona);
        setPersonaDetalle(actualizada);
      }
    } catch (e) {
      console.error(e);
      alert('Error al actualizar: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const handleAsignarPermiso = async (idPersona, nivel) => {
    try {
      await asignarPermiso(idPersona, 'finanzas', nivel);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al asignar permiso: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const handleRevocarPermiso = async (idPersona) => {
    try {
      await revocarPermiso(idPersona, 'finanzas');
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al revocar permiso: ' + (e.message || 'Inténtalo de nuevo'));
    }
  };

  const tieneFinanzas = (idPersona) => {
    const lista = permisos[idPersona] || [];
    return lista.find(p => p.recurso === 'finanzas');
  };

  if (loading) return <LoadingState message="Cargando configuración..." />;

  if (!esAdministrador) {
    return (
      <>
        <PageHeader title="Configuración" description="Gestión del sistema" />
        <Card>
          <EmptyState
            icon={ICONS.shield}
            title="Sin acceso"
            description="Solo los administradores pueden ver y modificar la configuración del sistema."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Gestión de personas, permisos y accesos al sistema."
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      <Card padding="md" className="mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[15px] text-[#1c1917]" style={{ fontWeight: 600 }}>Personas del sistema</h2>
            <p className="text-xs text-[#a8a29e] mt-0.5" style={{ fontWeight: 400 }}>
              Todas las personas registradas. Asigna acceso a Finanzas aquí.
            </p>
          </div>
          <Button variant="primary" icon={ICONS.plus} onClick={() => setModalCrear(true)}>
            Nueva persona
          </Button>
        </div>

        {personas.length === 0 ? (
          <EmptyState
            icon={ICONS.users}
            title="No hay personas registradas"
            description="Crea la primera persona para empezar."
          />
        ) : (
          <div className="border border-[#e7e5e4] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#fafaf9] text-[11px] text-[#a8a29e] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 500 }}>Persona</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 500 }}>PIN</th>
                  <th className="px-4 py-3 text-left" style={{ fontWeight: 500 }}>Acceso a Finanzas</th>
                  <th className="px-4 py-3 text-right" style={{ fontWeight: 500 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {personas.map(p => {
                  const perm = tieneFinanzas(p.id_persona);
                  return (
                    <tr key={p.id_persona} className="border-t border-[#f5f5f4] hover:bg-[#fafaf9] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#f5f5f4] flex items-center justify-center text-[#57534e] text-xs" style={{ fontWeight: 500 }}>
                            {p.nombre.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[#1c1917]" style={{ fontWeight: 500 }}>{p.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#57534e]" style={{ fontWeight: 400 }}>
                        {(p.pin || p.pin_hash) ? <span className="font-mono text-xs">••••</span> : <span className="text-[#a8a29e]">Sin PIN</span>}
                      </td>
                      <td className="px-4 py-3">
                        {perm ? (
                          <Badge color={NIVEL_BADGE_COLOR[perm.nivel_acceso] || 'gray'}>
                            {NIVELES.find(n => n.value === perm.nivel_acceso)?.label || perm.nivel_acceso}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>Sin acceso</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => setPersonaDetalle(p)}>
                          Gestionar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalCrear}
        onClose={() => setModalCrear(false)}
        title="Nueva persona"
        size="sm"
      >
        <FormPersona onSubmit={handleCrearPersona} onCancel={() => setModalCrear(false)} />
      </Modal>

      {personaDetalle && (
        <Modal
          open={true}
          onClose={() => setPersonaDetalle(null)}
          title={personaDetalle.nombre}
          size="md"
        >
          <DetallePersona
            persona={personaDetalle}
            permisoActual={tieneFinanzas(personaDetalle.id_persona)}
            onActualizar={(cambios) => handleActualizarPersona(personaDetalle.id_persona, cambios)}
            onAsignarPermiso={(nivel) => handleAsignarPermiso(personaDetalle.id_persona, nivel)}
            onRevocarPermiso={() => handleRevocarPermiso(personaDetalle.id_persona)}
            esSelf={usuario?.id_persona === personaDetalle.id_persona}
          />
        </Modal>
      )}
    </>
  );
}


/* ─── FormPersona ─────────────────────────────────────────────────────── */

function FormPersona({ onSubmit, onCancel, valoresIniciales }) {
  const [nombre, setNombre] = useState(valoresIniciales?.nombre || '');
  const [pin, setPin] = useState(valoresIniciales?.pin || '');
  const [errorForm, setErrorForm] = useState({});
  const [guardando, setGuardando] = useState(false);

  const validar = () => {
    const errs = {};
    if (!nombre.trim()) errs.nombre = 'Requerido';
    if (pin && !/^\d{4,6}$/.test(pin)) errs.pin = 'El PIN debe tener 4 a 6 dígitos';
    setErrorForm(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setGuardando(true);
    try {
      await onSubmit({ nombre: nombre.trim(), pin: pin.trim() || null });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <Field label="Nombre" required error={errorForm.nombre}>
        <Input
          value={nombre}
          onChange={setNombre}
          placeholder="Ej: Papá, Mamá, Juan..."
          error={errorForm.nombre}
        />
      </Field>

      <Field
        label="PIN (opcional)"
        error={errorForm.pin}
        hint="4 a 6 dígitos. Necesario si esta persona va a entrar a Finanzas."
      >
        <Input
          value={pin}
          onChange={setPin}
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••"
          error={errorForm.pin}
        />
      </Field>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Crear persona'}
        </Button>
      </div>
    </div>
  );
}


/* ─── DetallePersona ──────────────────────────────────────────────────── */

function DetallePersona({ persona, permisoActual, onActualizar, onAsignarPermiso, onRevocarPermiso, esSelf }) {
  const [tab, setTab] = useState('acceso');
  const [editando, setEditando] = useState(false);
  const [nuevoPin, setNuevoPin] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const [nivelSeleccionado, setNivelSeleccionado] = useState(permisoActual?.nivel_acceso || 'ver');

  const handleCambiarPin = async () => {
    if (nuevoPin && !/^\d{4,6}$/.test(nuevoPin)) {
      setErrorPin('El PIN debe tener 4 a 6 dígitos');
      return;
    }
    setErrorPin('');
    await onActualizar({ pin: nuevoPin || null });
    setNuevoPin('');
  };

  return (
    <div>
      <div className="flex items-center gap-3 pb-4 border-b border-[#f5f5f4]">
        <div className="w-12 h-12 rounded-full bg-[#1c1917] flex items-center justify-center text-white text-sm" style={{ fontWeight: 600 }}>
          {persona.nombre.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <h3 className="text-[16px] text-[#1c1917]" style={{ fontWeight: 600 }}>{persona.nombre}</h3>
          <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
            {permisoActual ? (
              <>Acceso actual: <Badge color={NIVEL_BADGE_COLOR[permisoActual.nivel_acceso] || 'gray'} size="sm">{NIVELES.find(n => n.value === permisoActual.nivel_acceso)?.label}</Badge></>
            ) : (
              'Sin acceso a Finanzas'
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[#f5f5f4] mt-4">
        {[
          { k: 'acceso', label: 'Acceso a Finanzas' },
          { k: 'pin',    label: 'PIN' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
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
        {tab === 'acceso' && (
          <div>
            <p className="text-sm text-[#57534e] mb-4" style={{ fontWeight: 400 }}>
              Define qué puede hacer esta persona en el módulo de Finanzas.
            </p>

            <Field label="Nivel de acceso">
              <Select
                value={nivelSeleccionado}
                onChange={setNivelSeleccionado}
                options={NIVELES}
              />
            </Field>

            <div className="text-xs text-[#57534e] bg-[#fafaf9] rounded-lg p-3 mb-4" style={{ fontWeight: 400 }}>
              <p className="mb-1.5"><span style={{ fontWeight: 500 }}>Solo ver:</span> puede entrar y ver datos pero no modifica nada.</p>
              <p className="mb-1.5"><span style={{ fontWeight: 500 }}>Registrar:</span> puede agregar movimientos, pagos y transferencias.</p>
              <p className="mb-1.5"><span style={{ fontWeight: 500 }}>Editar:</span> puede modificar cuentas, deudas y costos existentes.</p>
              <p><span style={{ fontWeight: 500 }}>Administrar:</span> control total, incluye configurar otros usuarios.</p>
            </div>

            <div className="flex gap-2">
              {permisoActual ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() => onAsignarPermiso(nivelSeleccionado)}
                    disabled={nivelSeleccionado === permisoActual.nivel_acceso}
                  >
                    Actualizar nivel
                  </Button>
                  {!esSelf && (
                    <Button variant="danger" onClick={onRevocarPermiso}>
                      Revocar acceso
                    </Button>
                  )}
                </>
              ) : (
                <Button variant="primary" onClick={() => onAsignarPermiso(nivelSeleccionado)}>
                  Dar acceso a Finanzas
                </Button>
              )}
            </div>

            {esSelf && (
              <p className="text-xs text-[#a8a29e] mt-3" style={{ fontWeight: 400 }}>
                No puedes revocar tu propio acceso para evitar quedarte bloqueado.
              </p>
            )}
          </div>
        )}

        {tab === 'pin' && (
          <div>
            <p className="text-sm text-[#57534e] mb-4" style={{ fontWeight: 400 }}>
              PIN para entrar a la app. Si la persona tiene acceso a Finanzas, lo usará aquí también.
            </p>

            <Field label="PIN actual">
              <div className="flex items-center gap-2">
                <div className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
                  {(persona.pin || persona.pin_hash) ? <span className="font-mono">••••</span> : <span className="text-[#a8a29e]">Sin PIN asignado</span>}
                </div>
              </div>
            </Field>

            <Field label="Nuevo PIN" error={errorPin} hint="4 a 6 dígitos. Vacío para quitar el PIN.">
              <Input
                value={nuevoPin}
                onChange={setNuevoPin}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••"
                error={errorPin}
              />
            </Field>

            <Button variant="primary" onClick={handleCambiarPin}>
              Guardar PIN
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}