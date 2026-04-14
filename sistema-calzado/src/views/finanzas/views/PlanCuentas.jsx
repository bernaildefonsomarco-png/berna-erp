import React, { useState, useEffect, useMemo } from 'react';
import {
  listarPlanCuentas, crearCuentaContable, actualizarCuentaContable, archivarCuentaContable,
  SECCIONES_PL,
} from '../api/finanzasClient';
import { puedeRegistrar, puedeEditar, RECURSOS } from '../lib/permisos';
import {
  Card, Badge, Button, Modal, Field, Input, Select,
  EmptyState, LoadingState, PageHeader, Icon, ICONS, Spinner,
} from '../components/UI';

/* ──────────────────────────────────────────────────────────────────────────
   PLAN DE CUENTAS — Bloque 3.5.1
   ──────────────────────────────────────────────────────────────────────────
   Editor del árbol de cuentas contables que define cómo se agrupan los
   movimientos en el Estado de Resultados (P&L).

   - Lista jerárquica con expansión por sección del P&L
   - Crear cuenta padre o hija
   - Editar nombre, código, sección
   - Archivar
   - Toggle "permite movimientos" (cabecera vs hoja)

   Decisiones:
   - El usuario NO ve "nivel" ni "id_padre" como conceptos abstractos.
     En su lugar ve secciones del P&L y un selector de cuenta padre opcional.
   - No se puede archivar una cuenta que tiene hijas activas.
   - No se puede eliminar (solo archivar) — preserva referencias en
     movimientos históricos.
   ────────────────────────────────────────────────────────────────────────── */


/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlanCuentas({ usuario }) {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [seccionPreSelect, setSeccionPreSelect] = useState(null);
  const [padrePreSelect, setPadrePreSelect] = useState(null);
  const [cuentaEdicion, setCuentaEdicion] = useState(null);
  const [confirmArchivar, setConfirmArchivar] = useState(null);
  const [seccionExpandida, setSeccionExpandida] = useState({});

  const puedeCrear = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  const puedeModif = puedeEditar(usuario, RECURSOS.FINANZAS);

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listarPlanCuentas({ incluirInactivas: false });
      setCuentas(data);
      // Expandir todas las secciones por default la primera vez
      if (Object.keys(seccionExpandida).length === 0) {
        const secs = {};
        data.forEach(c => { secs[c.seccion_pl] = true; });
        setSeccionExpandida(secs);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || 'Error al cargar plan de cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  /* ── Agrupar por sección del P&L ── */
  const porSeccion = useMemo(() => {
    const grupos = new Map();
    SECCIONES_PL.forEach(s => grupos.set(s.value, []));

    cuentas.forEach(c => {
      if (!grupos.has(c.seccion_pl)) grupos.set(c.seccion_pl, []);
      grupos.get(c.seccion_pl).push(c);
    });

    return SECCIONES_PL
      .map(s => ({
        ...s,
        cuentas: grupos.get(s.value) || [],
      }))
      .filter(s => s.cuentas.length > 0);
  }, [cuentas]);

  /* ── Construir árbol jerárquico dentro de cada sección ── */
  const arbolPorSeccion = useMemo(() => {
    const resultado = {};
    porSeccion.forEach(seccion => {
      const lista = seccion.cuentas;
      const map = new Map();
      lista.forEach(c => map.set(c.id_cuenta_contable, { ...c, hijos: [] }));
      const raices = [];
      map.forEach(c => {
        if (c.id_padre && map.has(c.id_padre)) {
          map.get(c.id_padre).hijos.push(c);
        } else {
          raices.push(c);
        }
      });
      resultado[seccion.value] = raices;
    });
    return resultado;
  }, [porSeccion]);

  const totalActivas = cuentas.length;
  const totalImputables = cuentas.filter(c => c.permite_movimientos).length;

  /* ── Handlers ── */

  const handleCrear = async (payload) => {
    try {
      await crearCuentaContable(payload);
      setModalCrear(false);
      setSeccionPreSelect(null);
      setPadrePreSelect(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al crear cuenta: ' + (e.message || ''));
      throw e;
    }
  };

  const handleActualizar = async (id, cambios) => {
    try {
      await actualizarCuentaContable(id, cambios);
      setCuentaEdicion(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al actualizar: ' + (e.message || ''));
      throw e;
    }
  };

  const handleArchivar = async (cuenta) => {
    // Validar: no puede tener hijos activos
    const tieneHijos = cuentas.some(c => c.id_padre === cuenta.id_cuenta_contable);
    if (tieneHijos) {
      alert('No puedes archivar esta cuenta porque tiene sub-cuentas activas. Archiva primero las sub-cuentas.');
      return;
    }
    try {
      await archivarCuentaContable(cuenta.id_cuenta_contable);
      setConfirmArchivar(null);
      await cargar();
    } catch (e) {
      console.error(e);
      alert('Error al archivar: ' + (e.message || ''));
    }
  };

  const abrirCrearEnSeccion = (seccion) => {
    setSeccionPreSelect(seccion);
    setPadrePreSelect(null);
    setModalCrear(true);
  };

  const abrirCrearHija = (padre) => {
    setSeccionPreSelect(padre.seccion_pl);
    setPadrePreSelect(padre.id_cuenta_contable);
    setModalCrear(true);
  };

  const toggleSeccion = (seccion) => {
    setSeccionExpandida(prev => ({ ...prev, [seccion]: !prev[seccion] }));
  };

  if (loading) return <LoadingState message="Cargando plan de cuentas..." />;

  return (
    <>
      <PageHeader
        title="Plan de cuentas"
        description="Estructura contable del negocio. Define cómo se agrupan los movimientos en el Estado de Resultados."
        actions={puedeCrear && (
          <Button variant="primary" icon={ICONS.plus} onClick={() => { setSeccionPreSelect(null); setPadrePreSelect(null); setModalCrear(true); }}>
            Nueva cuenta
          </Button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#fef2f2] border border-[#fca5a5] text-sm text-[#991b1b]" style={{ fontWeight: 400 }}>
          {error}
        </div>
      )}

      {/* Mini stats */}
      <div className="flex items-center gap-4 mb-4 text-xs text-[#57534e]" style={{ fontWeight: 400 }}>
        <span><span className="fin-num text-[#1c1917]" style={{ fontWeight: 600 }}>{totalActivas}</span> cuentas activas</span>
        <span><span className="fin-num text-[#1c1917]" style={{ fontWeight: 600 }}>{totalImputables}</span> imputables</span>
        <span><span className="fin-num text-[#1c1917]" style={{ fontWeight: 600 }}>{porSeccion.length}</span> secciones</span>
      </div>

      {porSeccion.length === 0 ? (
        <Card>
          <EmptyState
            icon={ICONS.document}
            title="Sin plan de cuentas"
            description="No hay cuentas contables creadas. Aplica el parche SQL 3.5.0 para sembrar el plan inicial."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {porSeccion.map(seccion => (
            <Card key={seccion.value} padding="md">
              <button
                onClick={() => toggleSeccion(seccion.value)}
                className="w-full flex items-center justify-between text-left mb-3"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    d={seccionExpandida[seccion.value] ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6'}
                    size={14}
                    className="text-[#a8a29e]"
                  />
                  <h2 className="text-[15px] text-[#1c1917]" style={{ fontWeight: 600 }}>
                    {seccion.label}
                  </h2>
                  <Badge color="gray" size="sm">{seccion.cuentas.length}</Badge>
                </div>
                {puedeCrear && (
                  <button
                    onClick={e => { e.stopPropagation(); abrirCrearEnSeccion(seccion.value); }}
                    className="text-[11px] text-[#57534e] hover:text-[#1c1917] flex items-center gap-1 px-2 py-1 rounded hover:bg-[#f5f5f4]"
                    style={{ fontWeight: 500 }}
                  >
                    <Icon d={ICONS.plus} size={12} />
                    Agregar
                  </button>
                )}
              </button>

              {seccionExpandida[seccion.value] && (
                <div className="space-y-0.5">
                  {arbolPorSeccion[seccion.value]?.map(raiz => (
                    <CuentaContableRow
                      key={raiz.id_cuenta_contable}
                      cuenta={raiz}
                      nivel={0}
                      puedeModif={puedeModif}
                      puedeCrear={puedeCrear}
                      onEditar={setCuentaEdicion}
                      onArchivar={setConfirmArchivar}
                      onCrearHija={abrirCrearHija}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal crear */}
      <Modal
        open={modalCrear}
        onClose={() => { setModalCrear(false); setSeccionPreSelect(null); setPadrePreSelect(null); }}
        title="Nueva cuenta contable"
        size="md"
      >
        <FormCuentaContable
          cuentas={cuentas}
          seccionPreSelect={seccionPreSelect}
          padrePreSelect={padrePreSelect}
          onSubmit={handleCrear}
          onCancel={() => { setModalCrear(false); setSeccionPreSelect(null); setPadrePreSelect(null); }}
        />
      </Modal>

      {/* Modal editar */}
      {cuentaEdicion && (
        <Modal
          open={true}
          onClose={() => setCuentaEdicion(null)}
          title="Editar cuenta contable"
          size="md"
        >
          <FormCuentaContable
            cuentas={cuentas}
            valoresIniciales={cuentaEdicion}
            onSubmit={(cambios) => handleActualizar(cuentaEdicion.id_cuenta_contable, cambios)}
            onCancel={() => setCuentaEdicion(null)}
          />
        </Modal>
      )}

      {/* Confirmar archivar */}
      {confirmArchivar && (
        <Modal
          open={true}
          onClose={() => setConfirmArchivar(null)}
          title="Archivar cuenta contable"
          size="sm"
          footer={
            <>
              <Button onClick={() => setConfirmArchivar(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => handleArchivar(confirmArchivar)}>Archivar</Button>
            </>
          }
        >
          <p className="text-sm text-[#57534e]" style={{ fontWeight: 400 }}>
            ¿Seguro que quieres archivar <span style={{ fontWeight: 500, color: '#1c1917' }}>{confirmArchivar.nombre}</span>?
          </p>
          <p className="text-xs text-[#a8a29e] mt-2" style={{ fontWeight: 400 }}>
            La cuenta no se elimina, solo se oculta. Los movimientos históricos asociados se conservan
            con la referencia intacta.
          </p>
        </Modal>
      )}
    </>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   CuentaContableRow - fila jerárquica recursiva
   ══════════════════════════════════════════════════════════════════════════ */

function CuentaContableRow({ cuenta, nivel, puedeModif, puedeCrear, onEditar, onArchivar, onCrearHija }) {
  const tieneHijos = cuenta.hijos && cuenta.hijos.length > 0;
  const indent = nivel * 20;

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#fafaf9] transition-colors group"
        style={{ paddingLeft: 8 + indent }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#a8a29e] flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: cuenta.permite_movimientos ? 400 : 600 }}>
              {cuenta.nombre}
            </p>
            <span className="text-[10px] font-mono text-[#a8a29e] bg-[#fafaf9] px-1.5 py-0.5 rounded">
              {cuenta.codigo}
            </span>
            {!cuenta.permite_movimientos && (
              <Badge color="gray" size="sm">Cabecera</Badge>
            )}
          </div>
          {cuenta.descripcion && (
            <p className="text-[11px] text-[#a8a29e] mt-0.5" style={{ fontWeight: 400 }}>
              {cuenta.descripcion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {puedeCrear && (
            <button
              onClick={() => onCrearHija(cuenta)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f4] text-[#57534e] hover:text-[#1c1917]"
              title="Agregar sub-cuenta"
            >
              <Icon d={ICONS.plus} size={13} />
            </button>
          )}
          {puedeModif && (
            <>
              <button
                onClick={() => onEditar(cuenta)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f4] text-[#57534e] hover:text-[#1c1917]"
                title="Editar"
              >
                <Icon d={ICONS.edit} size={13} />
              </button>
              <button
                onClick={() => onArchivar(cuenta)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#fef2f2] text-[#a8a29e] hover:text-[#991b1b]"
                title="Archivar"
              >
                <Icon d={ICONS.trash} size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {tieneHijos && (
        <div>
          {cuenta.hijos.map(h => (
            <CuentaContableRow
              key={h.id_cuenta_contable}
              cuenta={h}
              nivel={nivel + 1}
              puedeModif={puedeModif}
              puedeCrear={puedeCrear}
              onEditar={onEditar}
              onArchivar={onArchivar}
              onCrearHija={onCrearHija}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   FormCuentaContable
   ══════════════════════════════════════════════════════════════════════════ */

function FormCuentaContable({ cuentas, seccionPreSelect, padrePreSelect, valoresIniciales, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    seccion_pl: seccionPreSelect || 'gastos_operativos',
    id_padre: padrePreSelect || null,
    permite_movimientos: true,
    signo_pl: 1,
    orden: 99,
    ...(valoresIniciales || {}),
  });
  const [errs, setErrs] = useState({});
  const [guardando, setGuardando] = useState(false);

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  /* Padres posibles dentro de la misma sección, excluyendo la cuenta misma */
  const padresPosibles = useMemo(() => {
    return cuentas.filter(c =>
      c.seccion_pl === form.seccion_pl
      && c.id_cuenta_contable !== valoresIniciales?.id_cuenta_contable
      && !c.permite_movimientos // solo cabeceras pueden ser padres
    );
  }, [cuentas, form.seccion_pl, valoresIniciales]);

  const validar = () => {
    const e = {};
    if (!form.codigo?.trim()) e.codigo = 'Requerido';
    else if (!/^[A-Z0-9_]+$/.test(form.codigo)) e.codigo = 'Solo mayúsculas, números y guion bajo';
    if (!form.nombre?.trim()) e.nombre = 'Requerido';
    if (!form.seccion_pl) e.seccion_pl = 'Requerido';
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
        seccion_pl: form.seccion_pl,
        id_padre: form.id_padre || null,
        permite_movimientos: !!form.permite_movimientos,
        signo_pl: Number(form.signo_pl) || 1,
        orden: Number(form.orden) || 99,
      };
      await onSubmit(payload);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Código" required error={errs.codigo} hint="Ej: GO_LUZ_TIENDA">
          <Input
            value={form.codigo}
            onChange={v => setF('codigo', v.toUpperCase())}
            placeholder="GO_LUZ_TIENDA"
            error={errs.codigo}
          />
        </Field>

        <Field label="Sección del P&L" required error={errs.seccion_pl}>
          <Select
            value={form.seccion_pl}
            onChange={v => setF('seccion_pl', v)}
            options={SECCIONES_PL.map(s => ({ value: s.value, label: s.label }))}
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

      <Field label="Descripción" hint="Opcional, ayuda a recordar qué cubre esta cuenta">
        <Input
          value={form.descripcion}
          onChange={v => setF('descripcion', v)}
          placeholder="Ej: Recibo de luz mensual de la tienda principal"
        />
      </Field>

      <Field label="Cuenta padre" hint="Opcional. Solo cabeceras de la misma sección pueden ser padres.">
        <Select
          value={form.id_padre || ''}
          onChange={v => setF('id_padre', v ? Number(v) : null)}
          options={[
            { value: '', label: '— Sin padre (cuenta raíz) —' },
            ...padresPosibles.map(c => ({
              value: c.id_cuenta_contable,
              label: `${c.codigo} — ${c.nombre}`,
            })),
          ]}
        />
      </Field>

      <div className="border-t border-[#f5f5f4] pt-4 mt-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.permite_movimientos}
            onChange={e => setF('permite_movimientos', e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm text-[#1c1917]" style={{ fontWeight: 500 }}>Permite movimientos directos</p>
            <p className="text-xs text-[#a8a29e]" style={{ fontWeight: 400 }}>
              Si está marcado, los movimientos se pueden imputar directamente a esta cuenta. Si no, es solo
              una cabecera de agrupación que contiene sub-cuentas.
            </p>
          </div>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#f5f5f4]">
        <Button onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={guardando}>
          {guardando ? <><Spinner size={14}/> Guardando...</> : 'Guardar cuenta'}
        </Button>
      </div>
    </div>
  );
}