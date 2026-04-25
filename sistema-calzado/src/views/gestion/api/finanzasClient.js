import { supabase } from '../../../api/supabase';
import { hashPin, verifyPersonaPin } from '../../../lib/pinAuth';

/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS API CLIENT
   ──────────────────────────────────────────────────────────────────────────
   Todas las queries del módulo de finanzas viven aquí. Los componentes
   nunca hablan directo con supabase — siempre pasan por estas funciones.

   Bloque 3 agrega:
   - Pagos de deuda con capital/interes y splits multi-cuenta
   - Movimientos: listar con filtros, crear manual, actualizar, eliminar
   - Splits: leer por movimiento
   - Transferencias: crear (con préstamos), listar, marcar reembolso, anular
   - Vistas guardadas: CRUD
   - Costos fijos: CRUD básico
   - Eventos de deuda: registro de refinanciaciones/ajustes
   ──────────────────────────────────────────────────────────────────────────  */


/* ════════════════════════════════════════════════════════════════════════
   AUTH / PERMISOS
   ════════════════════════════════════════════════════════════════════════ */

export async function autenticarPorPin(pin) {
  const { data: permRows, error: e1 } = await supabase
    .from('permisos_persona')
    .select('id_persona')
    .eq('recurso', 'finanzas')
    .eq('activo', true);
  if (e1) throw e1;
  const ids = [...new Set((permRows || []).map(r => r.id_persona))];
  if (!ids.length) return null;

  const { data: candidatas, error: e2 } = await supabase
    .from('personas_tienda')
    .select('id_persona, nombre, pin, pin_hash, activa')
    .in('id_persona', ids)
    .eq('activa', true);
  if (e2) throw e2;

  for (const row of candidatas || []) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifyPersonaPin(row, pin);
    if (!ok) continue;
    const permisos = await obtenerPermisos(row.id_persona);
    const tieneFinanzas = permisos.some(p => p.recurso === 'finanzas' && p.activo);
    if (!tieneFinanzas) return { ...row, sinAcceso: true };
    return { ...row, permisos };
  }
  return null;
}

export async function obtenerPermisos(idPersona) {
  const { data, error } = await supabase
    .from('permisos_persona')
    .select('recurso, nivel_acceso, scope, activo')
    .eq('id_persona', idPersona)
    .eq('activo', true);

  if (error) throw error;
  return data || [];
}


/* ════════════════════════════════════════════════════════════════════════
   CUENTAS FINANCIERAS
   ════════════════════════════════════════════════════════════════════════ */

export async function listarCuentas({ incluirInactivas = false } = {}) {
  let query = supabase
    .from('cuentas_financieras')
    .select(`
      id_cuenta, codigo, nombre, alias, tipo_cuenta,
      id_cuenta_padre, id_custodio_actual, id_ubicacion,
      saldo_actual, saldo_minimo_alerta, moneda,
      es_cuenta_personal, titular_legal, banco, numero_enmascarado,
      color_hex, icono, orden_display, activa, notas,
      created_at, updated_at,
      custodio:personas_tienda!id_custodio_actual(id_persona, nombre)
    `)
    .order('orden_display', { ascending: true })
    .order('nombre', { ascending: true });

  if (!incluirInactivas) query = query.eq('activa', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerCuenta(idCuenta) {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .select(`
      *,
      custodio:personas_tienda!id_custodio_actual(id_persona, nombre)
    `)
    .eq('id_cuenta', idCuenta)
    .single();

  if (error) throw error;
  return data;
}

export async function obtenerRollupCuentas() {
  const { data, error } = await supabase.from('v_cuentas_rollup').select('*');
  if (error) throw error;
  return data || [];
}

export async function obtenerSaldosCalculados() {
  const { data, error } = await supabase.from('v_cuentas_saldo_calculado').select('*');
  if (error) throw error;
  return data || [];
}

export async function crearCuenta(payload) {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarCuenta(idCuenta, cambios) {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .update(cambios)
    .eq('id_cuenta', idCuenta)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivarCuenta(idCuenta) {
  return actualizarCuenta(idCuenta, { activa: false });
}


/* ════════════════════════════════════════════════════════════════════════
   PERSONAS (custodios y configuración)
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Lista SOLO las personas con acceso a finanzas.
 * Estas son las únicas que pueden ser custodios de cuentas, responsables
 * de deudas, etc. José (vendedor) NO aparece aquí.
 */
export async function listarPersonasConAccesoFinanzas() {
  const { data, error } = await supabase
    .from('permisos_persona')
    .select(`
      id_persona,
      nivel_acceso,
      persona:personas_tienda!id_persona(id_persona, nombre, activa)
    `)
    .eq('recurso', 'finanzas')
    .eq('activo', true);

  if (error) throw error;
  return (data || [])
    .filter(p => p.persona && p.persona.activa)
    .map(p => ({
      id_persona: p.persona.id_persona,
      nombre: p.persona.nombre,
      nivel_acceso: p.nivel_acceso,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Lista TODAS las personas activas (incluso sin acceso a finanzas).
 * Se usa solo en Configuración para dar/quitar permisos.
 */
export async function listarTodasLasPersonas({ incluirInactivas = false } = {}) {
  let query = supabase
    .from('personas_tienda')
    .select('id_persona, nombre, activa, pin, pin_hash, id_ubicacion_preferida')
    .order('nombre');

  if (!incluirInactivas) query = query.eq('activa', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function crearPersona({ nombre, pin, activa = true, id_ubicacion_preferida = null }) {
  const row = {
    nombre: nombre.trim(),
    activa,
    pin: null,
    id_ubicacion_preferida: id_ubicacion_preferida || null,
  };
  if (pin) row.pin_hash = await hashPin(pin);
  else row.pin_hash = null;

  const { data, error } = await supabase
    .from('personas_tienda')
    .insert([row])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarPersona(idPersona, cambios) {
  const payload = { ...cambios };
  if (Object.prototype.hasOwnProperty.call(payload, 'pin')) {
    if (payload.pin) {
      payload.pin_hash = await hashPin(payload.pin);
      payload.pin = null;
    } else {
      payload.pin = null;
      payload.pin_hash = null;
    }
  }
  const { data, error } = await supabase
    .from('personas_tienda')
    .update(payload)
    .eq('id_persona', idPersona)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Tiendas retail (para asignar persona → tienda preferida). */
export async function listarUbicacionesTiendas() {
  const { data, error } = await supabase
    .from('ubicaciones')
    .select('id_ubicacion, nombre, rol')
    .eq('activa', true)
    .eq('rol', 'Tienda')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

/** Lista TODAS las ubicaciones (tiendas + talleres), activas e inactivas. */
export async function listarUbicaciones({ soloActivas = false } = {}) {
  let q = supabase
    .from('ubicaciones')
    .select('id_ubicacion, nombre, rol, activa, pin')
    .order('rol')
    .order('nombre');
  if (soloActivas) q = q.eq('activa', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Crea una nueva tienda o taller. */
export async function crearUbicacion({ nombre, rol, pin = null }) {
  const { data, error } = await supabase
    .from('ubicaciones')
    .insert({ nombre: nombre.trim(), rol, pin: pin || String(Math.floor(1000 + Math.random() * 9000)), activa: true })
    .select('id_ubicacion, nombre, rol, activa, pin')
    .single();
  if (error) throw error;
  return data;
}

/** Actualiza nombre, rol o PIN de una ubicación. */
export async function actualizarUbicacion(idUbicacion, campos) {
  const payload = {};
  if (campos.nombre !== undefined) payload.nombre = campos.nombre.trim();
  if (campos.rol !== undefined) payload.rol = campos.rol;
  if (campos.pin !== undefined) payload.pin = campos.pin || null;
  const { data, error } = await supabase
    .from('ubicaciones')
    .update(payload)
    .eq('id_ubicacion', idUbicacion)
    .select('id_ubicacion, nombre, rol, activa, pin')
    .single();
  if (error) throw error;
  return data;
}

/** Archiva (desactiva) o reactiva una ubicación. */
export async function toggleActivaUbicacion(idUbicacion, activa) {
  const { data, error } = await supabase
    .from('ubicaciones')
    .update({ activa })
    .eq('id_ubicacion', idUbicacion)
    .select('id_ubicacion, nombre, rol, activa')
    .single();
  if (error) throw error;
  return data;
}

/** Lee varias claves de configuracion_sistema (clave → valor texto). */
export async function obtenerConfiguracionClaves(claves) {
  if (!claves?.length) return {};
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('clave, valor')
    .in('clave', claves);
  if (error) throw error;
  const map = {};
  (data || []).forEach(r => { map[r.clave] = r.valor; });
  return map;
}

export async function guardarConfiguracionClave(clave, valor) {
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .upsert([{ clave, valor: valor == null ? null : String(valor) }], { onConflict: 'clave' })
    .select()
    .single();
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   GESTIÓN DE PERMISOS
   ════════════════════════════════════════════════════════════════════════ */

export async function listarPermisosDePersona(idPersona) {
  const { data, error } = await supabase
    .from('permisos_persona')
    .select('id_permiso, recurso, nivel_acceso, scope, activo')
    .eq('id_persona', idPersona);
  if (error) throw error;
  return data || [];
}

export async function asignarPermiso(idPersona, recurso, nivelAcceso) {
  const { data: existente } = await supabase
    .from('permisos_persona')
    .select('id_permiso')
    .eq('id_persona', idPersona)
    .eq('recurso', recurso)
    .maybeSingle();

  if (existente) {
    const { data, error } = await supabase
      .from('permisos_persona')
      .update({ nivel_acceso: nivelAcceso, activo: true })
      .eq('id_permiso', existente.id_permiso)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('permisos_persona')
    .insert([{
      id_persona: idPersona,
      recurso,
      nivel_acceso: nivelAcceso,
      activo: true,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revocarPermiso(idPersona, recurso) {
  const { error } = await supabase
    .from('permisos_persona')
    .update({ activo: false })
    .eq('id_persona', idPersona)
    .eq('recurso', recurso);
  if (error) throw error;
}


/* ════════════════════════════════════════════════════════════════════════
   DEUDAS
   ════════════════════════════════════════════════════════════════════════ */

export async function listarDeudas({ estado = 'activa' } = {}) {
  let query = supabase
    .from('deudas')
    .select(`
      *,
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias)
    `)
    .order('dia_pago_mes', { ascending: true, nullsFirst: false });

  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function obtenerDeuda(idDeuda) {
  const { data, error } = await supabase
    .from('deudas')
    .select(`
      *,
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias)
    `)
    .eq('id_deuda', idDeuda)
    .single();
  if (error) throw error;
  return data;
}

export async function obtenerProximosVencimientos() {
  const { data, error } = await supabase
    .from('v_deudas_proximo_vencimiento')
    .select('*')
    .order('dias_hasta_vencimiento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerSaldosDeudasCalculados() {
  const { data, error } = await supabase
    .from('v_deudas_saldo_calculado')
    .select('*');
  if (error) throw error;
  return data || [];
}

export async function crearDeuda(payload) {
  const { data, error } = await supabase
    .from('deudas')
    .insert([{ ...payload, saldo_actual: payload.monto_original || 0 }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarDeuda(idDeuda, cambios) {
  const { data, error } = await supabase
    .from('deudas')
    .update(cambios)
    .eq('id_deuda', idDeuda)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivarDeuda(idDeuda) {
  return actualizarDeuda(idDeuda, { estado: 'cancelada' });
}

/**
 * Lista los pagos (movimientos) de una deuda específica con sus splits.
 * Incluye desglose capital/interes desde datos_extra.
 *
 * NOTA: requiere que exista la FK movimientos_caja.id_persona → personas_tienda
 * (agregada en parche 3.4.1). Antes del parche esta query fallaba silenciosamente
 * porque PostgREST no podía resolver el embedding sin FK declarada.
 */
export async function listarPagosDeuda(idDeuda) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, fecha_movimiento, monto, concepto, datos_extra,
      id_cuenta_financiera, tiene_splits, id_persona,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias),
      persona:personas_tienda!id_persona(id_persona, nombre)
    `)
    .eq('id_deuda', idDeuda)
    .eq('tipo', 'egreso')
    .order('fecha_movimiento', { ascending: false });
  if (error) throw error;
  return data || [];
}


/* ════════════════════════════════════════════════════════════════════════
   PAGO DE DEUDA (helper atómico vía RPC)
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Registra un pago de deuda usando fn_pagar_deuda.
 *
 * Modos:
 *   A) Pago desde una sola cuenta:
 *      pagarDeuda({ idDeuda, monto, capital, interes, idCuenta: 5 })
 *
 *   B) Pago split desde N cuentas:
 *      pagarDeuda({
 *        idDeuda, monto, capital, interes,
 *        splits: [
 *          { id_cuenta: 1, monto: 300 },
 *          { id_cuenta: 3, monto: 200 }
 *        ]
 *      })
 *
 * Validaciones (server-side):
 *   - capital + interes debe igualar monto (±0.01)
 *   - Si hay splits, su suma debe igualar monto
 *   - idCuenta y splits son mutuamente excluyentes
 *
 * @returns id_movimiento creado
 */
export async function pagarDeuda({
  idDeuda, monto, capital, interes,
  idCuenta = null, splits = null,
  concepto = null, idPersona = null, fecha = null,
}) {
  const { data, error } = await supabase.rpc('fn_pagar_deuda', {
    p_id_deuda:   idDeuda,
    p_monto:      monto,
    p_capital:    capital,
    p_interes:    interes,
    p_concepto:   concepto,
    p_id_cuenta:  idCuenta,
    p_splits:     splits,
    p_id_persona: idPersona,
    p_fecha:      fecha,
  });
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   EVENTOS DE DEUDA (refinanciaciones, ajustes manuales)
   ════════════════════════════════════════════════════════════════════════ */

export async function listarEventosDeuda(idDeuda) {
  const { data, error } = await supabase
    .from('deudas_eventos')
    .select('*')
    .eq('id_deuda', idDeuda)
    .order('fecha_evento', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function registrarEventoDeuda({
  idDeuda, tipoEvento, montoAfectado = null,
  descripcion = null, datosAntes = null, datosDespues = null,
  registradoPor = null,
}) {
  const { data, error } = await supabase
    .from('deudas_eventos')
    .insert([{
      id_deuda: idDeuda,
      tipo_evento: tipoEvento,
      monto_afectado: montoAfectado,
      descripcion,
      datos_antes: datosAntes,
      datos_despues: datosDespues,
      registrado_por: registradoPor,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   PATRIMONIO NETO
   ════════════════════════════════════════════════════════════════════════ */

export async function obtenerPatrimonioNeto() {
  const { data, error } = await supabase
    .from('v_patrimonio_neto')
    .select('*')
    .single();
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   MOVIMIENTOS — listar, crear, actualizar, eliminar
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Lista movimientos con filtros opcionales. Incluye joins a cuenta, deuda,
 * costo, persona, tipo, transferencia.
 *
 * filtros:
 *   - desde, hasta:        rango de fecha_movimiento (ISO strings o Date)
 *   - idCuenta:            number | number[]
 *   - idDeuda:             number
 *   - idCostoFijo:         number
 *   - idTransferencia:     number
 *   - tipo:                'ingreso' | 'egreso'
 *   - categoria:           string
 *   - idTipo:              number (FK a tipos_movimiento_caja)
 *   - busqueda:            string (busca en concepto, ilike)
 *   - soloConSplits:       boolean
 *   - excluirTransferencias: boolean (oculta movimientos auto-generados de transferencias)
 *   - limit, offset
 */
export async function listarMovimientos(filtros = {}) {
  const {
    desde, hasta,
    idCuenta, idDeuda, idCostoFijo, idTransferencia, idCuentaContable,
    tipo, categoria, idTipo, busqueda,
    soloConSplits = false,
    excluirTransferencias = false,
    limit = 100, offset = 0,
  } = filtros;

  let query = supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, fecha_movimiento, tipo, monto, concepto, categoria, metodo,
      id_cuenta_financiera, id_deuda, id_costo_fijo, id_transferencia, id_tipo,
      id_persona, id_ubicacion, tiene_splits, datos_extra, id_cuenta_contable,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias, tipo_cuenta),
      cuenta_contable:plan_cuentas!id_cuenta_contable(id_cuenta_contable, codigo, nombre, seccion_pl),
      deuda:deudas!id_deuda(id_deuda, nombre, codigo),
      costo:costos_fijos!id_costo_fijo(id_costo, nombre, codigo),
      tipo_mov:tipos_movimiento_caja!id_tipo(id_tipo, codigo, nombre, categoria),
      persona:personas_tienda!id_persona(id_persona, nombre)
    `, { count: 'exact' })
    .order('fecha_movimiento', { ascending: false })
    .range(offset, offset + limit - 1);

  if (desde) query = query.gte('fecha_movimiento', desde);
  if (hasta) query = query.lte('fecha_movimiento', hasta);
  if (Array.isArray(idCuenta) && idCuenta.length > 0) query = query.in('id_cuenta_financiera', idCuenta);
  else if (idCuenta) query = query.eq('id_cuenta_financiera', idCuenta);
  if (idDeuda) query = query.eq('id_deuda', idDeuda);
  if (idCostoFijo) query = query.eq('id_costo_fijo', idCostoFijo);
  if (idTransferencia) query = query.eq('id_transferencia', idTransferencia);
  if (idCuentaContable) query = query.eq('id_cuenta_contable', idCuentaContable);
  if (tipo) query = query.eq('tipo', tipo);
  if (categoria) query = query.eq('categoria', categoria);
  if (idTipo) query = query.eq('id_tipo', idTipo);
  if (busqueda) query = query.ilike('concepto', `%${busqueda}%`);
  if (soloConSplits) query = query.eq('tiene_splits', true);
  if (excluirTransferencias) query = query.is('id_transferencia', null);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function obtenerMovimiento(idMovimiento) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      *,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias),
      deuda:deudas!id_deuda(id_deuda, nombre, codigo),
      costo:costos_fijos!id_costo_fijo(id_costo, nombre, codigo),
      tipo_mov:tipos_movimiento_caja!id_tipo(id_tipo, codigo, nombre),
      persona:personas_tienda!id_persona(id_persona, nombre)
    `)
    .eq('id_movimiento', idMovimiento)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Crea un movimiento manual. Si se pasan splits, marca tiene_splits=true
 * y crea las filas en movimiento_splits. La validación de suma de splits
 * vs monto se hace client-side antes de llamar.
 */
export async function crearMovimientoManual({
  tipo, monto, concepto, fecha = null,
  idCuenta = null, splits = null,
  idTipo = null, categoria = null, metodo = 'efectivo',
  idPersona = null, idUbicacion = null,
  idDeuda = null, idCostoFijo = null,
  idCuentaContable = null,
  datosExtra = {},
}) {
  if (!tipo || !monto || !concepto) {
    throw new Error('crearMovimientoManual: tipo, monto y concepto son requeridos');
  }
  if (idCuenta && splits) {
    throw new Error('crearMovimientoManual: idCuenta y splits son mutuamente excluyentes');
  }
  if (splits) {
    const total = splits.reduce((s, x) => s + Number(x.monto || 0), 0);
    if (Math.abs(total - Number(monto)) > 0.01) {
      throw new Error(`Suma de splits (${total}) no coincide con monto (${monto})`);
    }
  }

  const payload = {
    tipo, monto, concepto,
    fecha_movimiento: fecha || new Date().toISOString(),
    id_cuenta_financiera: splits ? null : idCuenta,
    id_tipo: idTipo,
    categoria,
    metodo,
    id_persona: idPersona,
    id_ubicacion: idUbicacion,
    id_deuda: idDeuda,
    id_costo_fijo: idCostoFijo,
    id_cuenta_contable: idCuentaContable,
    tiene_splits: !!splits,
    datos_extra: datosExtra || {},
  };

  const { data: mov, error: errMov } = await supabase
    .from('movimientos_caja')
    .insert([payload])
    .select()
    .single();
  if (errMov) throw errMov;

  if (splits && splits.length > 0) {
    const splitRows = splits.map(s => ({
      id_movimiento: mov.id_movimiento,
      id_cuenta: s.id_cuenta || null,
      id_caja_dia: s.id_caja_dia || null,
      id_ubicacion: s.id_ubicacion || null,
      monto: s.monto,
      notas: s.notas || null,
    }));
    const { error: errSplit } = await supabase
      .from('movimiento_splits')
      .insert(splitRows);
    if (errSplit) {
      // Rollback manual: borrar el movimiento padre si fallaron los splits
      await supabase.from('movimientos_caja').delete().eq('id_movimiento', mov.id_movimiento);
      throw errSplit;
    }
  }

  return mov;
}

export async function actualizarMovimiento(idMovimiento, cambios) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .update(cambios)
    .eq('id_movimiento', idMovimiento)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarMovimiento(idMovimiento) {
  const { error } = await supabase
    .from('movimientos_caja')
    .delete()
    .eq('id_movimiento', idMovimiento);
  if (error) throw error;
}

/** Lista movimientos asociados a una cuenta — atajo cómodo para vista detalle. */
export async function listarMovimientosCuenta(idCuenta, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('id_movimiento, fecha_movimiento, tipo, monto, concepto, categoria, metodo, id_deuda, id_costo_fijo, id_transferencia')
    .eq('id_cuenta_financiera', idCuenta)
    .order('fecha_movimiento', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}


/* ════════════════════════════════════════════════════════════════════════
   SPLITS
   ════════════════════════════════════════════════════════════════════════ */

export async function listarSplitsDeMovimiento(idMovimiento) {
  const { data, error } = await supabase
    .from('movimiento_splits')
    .select(`
      id_split, id_cuenta, id_caja_dia, id_ubicacion, monto, porcentaje, notas, created_at,
      cuenta:cuentas_financieras!id_cuenta(id_cuenta, nombre, alias),
      ubicacion:ubicaciones!id_ubicacion(id_ubicacion, nombre)
    `)
    .eq('id_movimiento', idMovimiento)
    .order('id_split');
  if (error) throw error;
  return data || [];
}


/* ════════════════════════════════════════════════════════════════════════
   TRANSFERENCIAS INTERNAS
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Crea una transferencia interna usando fn_crear_transferencia.
 * Soporta motivos: transferencia, cierre_tienda, prestamo_interno,
 * reembolso_prestamo, ajuste, reasignacion, pago_deuda_origen, aporte_pedido.
 *
 * Si motivo='prestamo_interno', se puede pasar esReembolsable=true y
 * fechaReembolsoEsperada.
 */
export async function crearTransferencia({
  origen, destino, monto, motivo = 'transferencia',
  concepto = null, idCajaDia = null,
  idPersonaOrigen = null, idPersonaDestino = null,
  esReembolsable = false, fechaReembolsoEsperada = null,
}) {
  const { data, error } = await supabase.rpc('fn_crear_transferencia', {
    p_origen:           origen,
    p_destino:          destino,
    p_monto:            monto,
    p_motivo:           motivo,
    p_concepto:         concepto,
    p_caja_dia:         idCajaDia,
    p_persona_origen:   idPersonaOrigen,
    p_persona_destino:  idPersonaDestino,
    p_es_reembolsable:  esReembolsable,
    p_fecha_reembolso:  fechaReembolsoEsperada,
  });
  if (error) throw error;
  return data;
}

/**
 * Lista transferencias con filtros.
 *
 * filtros:
 *   - desde, hasta
 *   - motivo:               string | string[]
 *   - idCuenta:             number (origen O destino)
 *   - estado:               'pendiente' | 'confirmada' | 'anulada' | 'corregida'
 *   - soloReembolsablesPendientes: boolean (es_reembolsable=true AND reembolsado=false)
 *   - limit, offset
 */
export async function listarTransferencias(filtros = {}) {
  const {
    desde, hasta, motivo, idCuenta, estado,
    soloReembolsablesPendientes = false,
    limit = 100, offset = 0,
  } = filtros;

  let query = supabase
    .from('transferencias_internas')
    .select(`
      id_transferencia, fecha, monto, motivo, concepto, estado,
      id_cuenta_origen, id_cuenta_destino,
      es_reembolsable, fecha_reembolso_esperada, reembolsado, fecha_reembolso_real,
      id_transferencia_reembolso, id_caja_origen_dia,
      id_persona_origen, id_persona_destino, notas,
      origen:cuentas_financieras!id_cuenta_origen(id_cuenta, nombre, alias),
      destino:cuentas_financieras!id_cuenta_destino(id_cuenta, nombre, alias),
      persona_origen:personas_tienda!id_persona_origen(id_persona, nombre),
      persona_destino:personas_tienda!id_persona_destino(id_persona, nombre)
    `, { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(offset, offset + limit - 1);

  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  if (Array.isArray(motivo) && motivo.length > 0) query = query.in('motivo', motivo);
  else if (motivo) query = query.eq('motivo', motivo);
  if (estado) query = query.eq('estado', estado);
  if (idCuenta) query = query.or(`id_cuenta_origen.eq.${idCuenta},id_cuenta_destino.eq.${idCuenta}`);
  if (soloReembolsablesPendientes) {
    query = query.eq('es_reembolsable', true).eq('reembolsado', false);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

export async function obtenerTransferencia(idTransferencia) {
  const { data, error } = await supabase
    .from('transferencias_internas')
    .select(`
      *,
      origen:cuentas_financieras!id_cuenta_origen(id_cuenta, nombre, alias),
      destino:cuentas_financieras!id_cuenta_destino(id_cuenta, nombre, alias),
      persona_origen:personas_tienda!id_persona_origen(id_persona, nombre),
      persona_destino:personas_tienda!id_persona_destino(id_persona, nombre)
    `)
    .eq('id_transferencia', idTransferencia)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Marca una transferencia reembolsable como reembolsada.
 * Crea una NUEVA transferencia en sentido contrario (reembolso) y vincula
 * ambas vía id_transferencia_reembolso.
 */
export async function marcarReembolso(idTransferenciaOriginal, {
  fechaReembolso = null, conceptoReembolso = null,
  idPersonaOrigen = null, idPersonaDestino = null,
} = {}) {
  // 1. Leer la transferencia original
  const original = await obtenerTransferencia(idTransferenciaOriginal);
  if (!original) throw new Error('Transferencia original no encontrada');
  if (!original.es_reembolsable) throw new Error('Esta transferencia no es reembolsable');
  if (original.reembolsado) throw new Error('Esta transferencia ya fue reembolsada');

  // 2. Crear transferencia inversa (destino → origen)
  const idReembolso = await crearTransferencia({
    origen: original.id_cuenta_destino,
    destino: original.id_cuenta_origen,
    monto: original.monto,
    motivo: 'reembolso_prestamo',
    concepto: conceptoReembolso || `Reembolso de: ${original.concepto || 'préstamo interno'}`,
    idPersonaOrigen,
    idPersonaDestino,
  });

  // 3. Marcar la original como reembolsada y vincular
  const { data, error } = await supabase
    .from('transferencias_internas')
    .update({
      reembolsado: true,
      fecha_reembolso_real: fechaReembolso || new Date().toISOString().slice(0, 10),
      id_transferencia_reembolso: idReembolso,
    })
    .eq('id_transferencia', idTransferenciaOriginal)
    .select()
    .single();
  if (error) throw error;
  return { original: data, idReembolso };
}

/**
 * Marca un préstamo como reembolsado SIN crear transferencia inversa.
 * Solo actualiza los flags de la fila original. No afecta saldos.
 *
 * Útil cuando:
 *   - El dinero ya volvió por un canal informal y los saldos están cuadrados
 *   - El "préstamo" se decide condonar y solo se quiere cerrar el caso
 *   - Corrección de errores de registro
 *
 * Para un reembolso contable real (con movimientos), usar marcarReembolso().
 */
export async function marcarReembolsoSinMovimiento(idTransferenciaOriginal, {
  fechaReembolso = null,
} = {}) {
  const original = await obtenerTransferencia(idTransferenciaOriginal);
  if (!original) throw new Error('Transferencia original no encontrada');
  if (!original.es_reembolsable) throw new Error('Esta transferencia no es reembolsable');
  if (original.reembolsado) throw new Error('Esta transferencia ya fue reembolsada');

  const { data, error } = await supabase
    .from('transferencias_internas')
    .update({
      reembolsado: true,
      fecha_reembolso_real: fechaReembolso || new Date().toISOString().slice(0, 10),
    })
    .eq('id_transferencia', idTransferenciaOriginal)
    .select()
    .single();
  if (error) throw error;
  return data;
}


/**
 * Anula una transferencia. Marca estado='anulada' y BORRA los movimientos
 * vinculados (lo cual revierte saldos vía triggers). Solo permitido si la
 * transferencia no tiene reembolso vinculado.
 */
export async function anularTransferencia(idTransferencia) {
  const tr = await obtenerTransferencia(idTransferencia);
  if (!tr) throw new Error('Transferencia no encontrada');
  if (tr.estado === 'anulada') throw new Error('Ya está anulada');
  if (tr.reembolsado) throw new Error('No se puede anular una transferencia ya reembolsada');

  // Borrar los 2 movimientos vinculados — los triggers revierten saldos
  const { error: errMov } = await supabase
    .from('movimientos_caja')
    .delete()
    .eq('id_transferencia', idTransferencia);
  if (errMov) throw errMov;

  const { data, error } = await supabase
    .from('transferencias_internas')
    .update({ estado: 'anulada' })
    .eq('id_transferencia', idTransferencia)
    .select()
    .single();
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   COSTOS FIJOS (CRUD básico — la view real llega en 3.6)
   ════════════════════════════════════════════════════════════════════════ */

function normalizarCostoFijoRow(row) {
  if (!row) return row;
  const diaVencimiento = row.dia_vencimiento_mes ?? row.dia_vencimiento_semana ?? null;
  return {
    ...row,
    descripcion: row.descripcion ?? row.notas ?? null,
    notas: row.notas ?? row.descripcion ?? null,
    dia_vencimiento: diaVencimiento,
  };
}

function mapearPayloadCostoFijo(payload = {}) {
  const mapped = { ...payload };

  if (Object.prototype.hasOwnProperty.call(mapped, 'descripcion') && !Object.prototype.hasOwnProperty.call(mapped, 'notas')) {
    mapped.notas = mapped.descripcion;
  }
  delete mapped.descripcion;

  if (Object.prototype.hasOwnProperty.call(mapped, 'dia_vencimiento')) {
    const dia = mapped.dia_vencimiento == null || mapped.dia_vencimiento === ''
      ? null
      : Number(mapped.dia_vencimiento);
    if (mapped.frecuencia === 'semanal') mapped.dia_vencimiento_semana = dia;
    else mapped.dia_vencimiento_mes = dia;
    delete mapped.dia_vencimiento;
  }

  if (Object.prototype.hasOwnProperty.call(mapped, 'dia_vencimiento_mes')) {
    mapped.dia_vencimiento_mes = mapped.dia_vencimiento_mes == null || mapped.dia_vencimiento_mes === ''
      ? null
      : Number(mapped.dia_vencimiento_mes);
  }

  if (Object.prototype.hasOwnProperty.call(mapped, 'dia_vencimiento_semana')) {
    mapped.dia_vencimiento_semana = mapped.dia_vencimiento_semana == null || mapped.dia_vencimiento_semana === ''
      ? null
      : Number(mapped.dia_vencimiento_semana);
  }

  if (mapped.frecuencia === 'semanal') mapped.dia_vencimiento_mes = null;
  else if (Object.prototype.hasOwnProperty.call(mapped, 'frecuencia')) mapped.dia_vencimiento_semana = null;

  return mapped;
}

export async function listarCostosFijos({ incluirInactivos = false } = {}) {
  let query = supabase
    .from('costos_fijos')
    .select(`
      *,
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias),
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      ubicacion:ubicaciones!id_ubicacion(id_ubicacion, nombre)
    `)
    .order('dia_vencimiento_mes', { ascending: true, nullsFirst: false })
    .order('dia_vencimiento_semana', { ascending: true, nullsFirst: false });

  if (!incluirInactivos) query = query.eq('activo', true);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizarCostoFijoRow);
}

export async function crearCostoFijo(payload) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .insert([mapearPayloadCostoFijo(payload)])
    .select()
    .single();
  if (error) throw error;
  return normalizarCostoFijoRow(data);
}

export async function actualizarCostoFijo(idCosto, cambios) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .update(mapearPayloadCostoFijo(cambios))
    .eq('id_costo', idCosto)
    .select()
    .single();
  if (error) throw error;
  return normalizarCostoFijoRow(data);
}


/* ════════════════════════════════════════════════════════════════════════
   TIPOS DE MOVIMIENTO (catálogo, para selects)
   ════════════════════════════════════════════════════════════════════════ */

export async function listarTiposMovimiento({ soloActivos = true } = {}) {
  let query = supabase
    .from('tipos_movimiento_caja')
    .select('id_tipo, codigo, nombre, categoria, tipo_flujo, requiere_nota, activo, orden')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (soloActivos) query = query.eq('activo', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}


/* ════════════════════════════════════════════════════════════════════════
   VISTAS GUARDADAS (filtros/columnas personalizados por usuario)
   ════════════════════════════════════════════════════════════════════════ */

export async function listarVistasGuardadas(modulo, idPersona = null) {
  let query = supabase
    .from('vistas_guardadas')
    .select('*')
    .eq('modulo', modulo)
    .order('orden_display', { ascending: true })
    .order('nombre', { ascending: true });

  if (idPersona) {
    // Vistas propias + compartidas
    query = query.or(`id_persona.eq.${idPersona},es_compartida.eq.true`);
  } else {
    query = query.eq('es_compartida', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function guardarVista({
  idPersona, modulo, nombre, configuracion,
  esCompartida = false, esDefault = false,
}) {
  const { data, error } = await supabase
    .from('vistas_guardadas')
    .insert([{
      id_persona: idPersona,
      modulo,
      nombre: nombre.trim(),
      configuracion,
      es_compartida: esCompartida,
      es_default: esDefault,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarVista(idVista, cambios) {
  const { data, error } = await supabase
    .from('vistas_guardadas')
    .update(cambios)
    .eq('id_vista', idVista)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarVista(idVista) {
  const { error } = await supabase
    .from('vistas_guardadas')
    .delete()
    .eq('id_vista', idVista);
  if (error) throw error;
}


/* ════════════════════════════════════════════════════════════════════════
   PLAN DE CUENTAS (CRUD)
   ════════════════════════════════════════════════════════════════════════ */

export const SECCIONES_PL = [
  { value: 'ingresos',          label: 'Ingresos operativos',      orden: 1 },
  { value: 'costo_ventas',      label: 'Costo de ventas',          orden: 2 },
  { value: 'costo_produccion',  label: 'Costo de producción',      orden: 3 },
  { value: 'gastos_operativos', label: 'Gastos operativos',        orden: 4 },
  { value: 'gastos_personal',   label: 'Gastos de personal',       orden: 5 },
  { value: 'gastos_financieros',label: 'Gastos financieros',       orden: 6 },
  { value: 'impuestos',         label: 'Impuestos y tributos',     orden: 7 },
  { value: 'otros_ingresos',    label: 'Otros ingresos',           orden: 8 },
  { value: 'otros_egresos',     label: 'Otros egresos',            orden: 9 },
  { value: 'sin_impacto',       label: 'Sin impacto en P&L',       orden: 10 },
];

export async function listarPlanCuentas({ incluirInactivas = false } = {}) {
  let query = supabase
    .from('plan_cuentas')
    .select('*')
    .order('orden', { ascending: true })
    .order('codigo', { ascending: true });
  if (!incluirInactivas) query = query.eq('activa', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function crearCuentaContable(payload) {
  // Calcular nivel automáticamente
  let nivel = 1;
  if (payload.id_padre) {
    const { data: padre } = await supabase
      .from('plan_cuentas')
      .select('nivel')
      .eq('id_cuenta_contable', payload.id_padre)
      .single();
    if (padre) nivel = (padre.nivel || 1) + 1;
  }
  const { data, error } = await supabase
    .from('plan_cuentas')
    .insert([{ ...payload, nivel }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarCuentaContable(idCuentaContable, cambios) {
  const { data, error } = await supabase
    .from('plan_cuentas')
    .update(cambios)
    .eq('id_cuenta_contable', idCuentaContable)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivarCuentaContable(idCuentaContable) {
  return actualizarCuentaContable(idCuentaContable, { activa: false });
}

// Actualizar el campo `orden` de múltiples cuentas contables en lote
// updates = [{ id_cuenta_contable, orden }, ...]
export async function reordenarCuentasContables(updates) {
  await Promise.all(
    updates.map(({ id_cuenta_contable, orden }) =>
      supabase.from('plan_cuentas').update({ orden }).eq('id_cuenta_contable', id_cuenta_contable)
    )
  );
}


/* ════════════════════════════════════════════════════════════════════════
   COSTOS FIJOS (CRUD completo)
   ════════════════════════════════════════════════════════════════════════ */

export async function obtenerCostoFijo(idCosto) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .select(`
      *,
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias),
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      cuenta_contable:plan_cuentas!id_cuenta_contable(id_cuenta_contable, codigo, nombre, seccion_pl)
    `)
    .eq('id_costo', idCosto)
    .single();
  if (error) throw error;
  return normalizarCostoFijoRow(data);
}

export async function archivarCostoFijo(idCosto) {
  return actualizarCostoFijo(idCosto, { activo: false });
}

/**
 * Lista pagos (movimientos) de un costo fijo específico.
 */
export async function listarPagosCostoFijo(idCosto) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, fecha_movimiento, monto, concepto, datos_extra,
      id_cuenta_financiera, tiene_splits, id_persona,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias),
      persona:personas_tienda!id_persona(id_persona, nombre)
    `)
    .eq('id_costo_fijo', idCosto)
    .eq('tipo', 'egreso')
    .order('fecha_movimiento', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Helper RPC para pagar un costo fijo.
 * Soporta cuenta única, splits y modo "por unidad" (calcula monto = unidades × tarifa).
 */
export async function pagarCostoFijo({
  idCosto, monto = null, unidades = null,
  idCuenta = null, splits = null,
  concepto = null, idPersona = null, fecha = null,
}) {
  const { data, error } = await supabase.rpc('fn_pagar_costo_fijo', {
    p_id_costo:   idCosto,
    p_monto:      monto,
    p_unidades:   unidades,
    p_concepto:   concepto,
    p_id_cuenta:  idCuenta,
    p_splits:     splits,
    p_id_persona: idPersona,
    p_fecha:      fecha,
  });
  if (error) throw error;
  return data;
}


/* ════════════════════════════════════════════════════════════════════════
   TIPOS DE MOVIMIENTO (CRUD completo)
   ════════════════════════════════════════════════════════════════════════ */

export async function crearTipoMovimiento(payload) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarTipoMovimiento(idTipo, cambios) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .update(cambios)
    .eq('id_tipo', idTipo)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivarTipoMovimiento(idTipo) {
  return actualizarTipoMovimiento(idTipo, { activo: false });
}


/* ════════════════════════════════════════════════════════════════════════
   CIERRE DE TIENDA - distribución del efectivo a cuentas financieras
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Lista las cuentas que aparecen como destino al cerrar caja diaria.
 * Solo las marcadas con mostrar_en_cierre_tienda = true.
 */
export async function listarCuentasDestinoCierre() {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .select('id_cuenta, codigo, nombre, alias, tipo_cuenta, saldo_actual, orden_display, custodio:personas_tienda!id_custodio_actual(id_persona, nombre)')
    .eq('activa', true)
    .eq('mostrar_en_cierre_tienda', true)
    .order('orden_display', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Registra la distribución del efectivo del cierre de caja diaria
 * a una o más cuentas financieras.
 *
 * IMPLEMENTACIÓN: como la "caja diaria" de tienda NO es una cuenta financiera
 * persistente (es una sesión en la tabla `cajas`), no podemos usar
 * transferencias_internas (que requieren origen y destino que sean cuentas).
 *
 * En su lugar, creamos movimientos directos de tipo INGRESO en cada cuenta
 * destino, vinculados a la caja diaria via id_caja. Los triggers ya
 * actualizan los saldos automáticamente. El motivo se registra en datos_extra.
 *
 * @param {object} params
 * @param {number} params.idCajaDia - id de la caja (sesión diaria) que se cerró
 * @param {number} params.idUbicacionTienda - id de la tienda (para metadata)
 * @param {number} params.idPersonaOrigen - id de la persona que entrega
 * @param {Array<{id_cuenta, monto, concepto}>} params.destinos - distribución
 * @param {number} params.montoQueda - monto que queda en tienda (informativo)
 */
export async function registrarDistribucionCierre({
  idCajaDia, idUbicacionTienda, idPersonaOrigen,
  destinos = [], montoQueda = 0,
}) {
  if (!Array.isArray(destinos)) throw new Error('destinos debe ser un array');

  // Lookup tipo y cuenta contable
  const { data: tipo } = await supabase
    .from('tipos_movimiento_caja')
    .select('id_tipo')
    .eq('codigo', 'transf_cierre_tienda')
    .maybeSingle();

  const { data: cuentaContable } = await supabase
    .from('plan_cuentas')
    .select('id_cuenta_contable')
    .eq('codigo', 'SI_CIERRE')
    .maybeSingle();

  const idsCreados = [];

  for (const d of destinos) {
    if (!d.id_cuenta || !d.monto || d.monto <= 0) continue;

    const concepto = d.concepto
      || `Entrega cierre tienda${idUbicacionTienda ? ' #' + idUbicacionTienda : ''}`;

    const { data: mov, error } = await supabase
      .from('movimientos_caja')
      .insert([{
        tipo: 'ingreso',
        monto: d.monto,
        concepto,
        fecha_movimiento: new Date().toISOString(),
        id_cuenta_financiera: d.id_cuenta,
        id_caja: idCajaDia,
        id_ubicacion: idUbicacionTienda,
        id_persona: idPersonaOrigen,
        id_tipo: tipo?.id_tipo || null,
        id_cuenta_contable: cuentaContable?.id_cuenta_contable || null,
        categoria: 'transferencia',
        metodo: 'efectivo',
        datos_extra: {
          origen: 'cierre_tienda',
          id_caja_dia: idCajaDia,
          id_ubicacion_tienda: idUbicacionTienda,
        },
      }])
      .select('id_movimiento')
      .single();
    if (error) throw error;
    idsCreados.push(mov.id_movimiento);
  }

  return { idsCreados, montoQueda };
}


/* ════════════════════════════════════════════════════════════════════════
   TRABAJADORES (ERP nómina)
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Lista trabajadores directamente desde personas_tienda.
 * No depende de la vista v_nomina_resumen.
 * Los campos de nómina (tipo_contrato, area, cargo, etc.) los entrega la
 * migración 20260415; si aún no se aplicó, devuelven null (se usan defaults
 * en el componente).
 */
export async function listarTrabajadores({ incluirInactivos = false } = {}) {
  const { error: puestosErr } = await supabase
    .from('personas_tienda')
    .select('puestos_adicionales')
    .limit(1);
  const tienePuestosAdicionales = !puestosErr;

  let query = supabase
    .from('personas_tienda')
    .select(
      tienePuestosAdicionales
        ? 'id_persona, nombre, activa, rol, id_ubicacion_preferida, pin_hash, pin, tipo_contrato, area, areas_adicionales, puestos_adicionales, es_rotativo, cargo, salario_base, frecuencia_pago, fecha_ingreso, telefono, notas_trabajador'
        : 'id_persona, nombre, activa, rol, id_ubicacion_preferida, pin_hash, pin, tipo_contrato, area, areas_adicionales, es_rotativo, cargo, salario_base, frecuencia_pago, fecha_ingreso, telefono, notas_trabajador'
    )
    .order('nombre', { ascending: true });
  if (!incluirInactivos) query = query.eq('activa', true);
  const { data: personas, error } = await query;
  if (error) throw error;
  if (!personas?.length) return [];

  // Obtener costos_fijos de nómina vinculados (categoría = salario)
  const ids = personas.map(p => p.id_persona);
  const { data: costos } = await supabase
    .from('costos_fijos')
    .select('id_costo, id_responsable, monto_estimado, es_por_unidad, tarifa_por_unidad, unidad')
    .in('id_responsable', ids)
    .eq('categoria', 'salario')
    .eq('activo', true);

  // Obtener pagos del mes actual para esos costos
  const idsCostos = (costos || []).map(c => c.id_costo);
  let pagosMes = [];
  if (idsCostos.length) {
    const fechaInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: movs } = await supabase
      .from('movimientos_caja')
      .select('id_costo_fijo, monto')
      .in('id_costo_fijo', idsCostos)
      .eq('tipo', 'egreso')
      .gte('fecha_movimiento', fechaInicio);
    pagosMes = movs || [];
  }

  // Combinar
  return personas.map(p => {
    const cf = (costos || []).find(c => c.id_responsable === p.id_persona) || null;
    const pagosTrabajador = cf
      ? pagosMes.filter(m => m.id_costo_fijo === cf.id_costo)
      : [];
    const totalPagadoMes = pagosTrabajador.reduce((s, m) => s + Number(m.monto), 0);
    return {
      ...p,
      id_costo:          cf?.id_costo          ?? null,
      monto_estimado:    cf?.monto_estimado     ?? null,
      es_por_unidad:     cf?.es_por_unidad      ?? false,
      tarifa_por_unidad: cf?.tarifa_por_unidad  ?? null,
      unidad:            cf?.unidad             ?? null,
      total_pagado_mes:  totalPagadoMes,
      pagos_mes:         pagosTrabajador.length,
    };
  });
}

/**
 * Crea un trabajador en personas_tienda y auto-crea su costos_fijos de nómina.
 * payload: { nombre, pin?, rol?, tipo_contrato, area, cargo, salario_base?,
 *            frecuencia_pago, dia_vencimiento?, fecha_ingreso?, telefono?, notas_trabajador?,
 *            id_ubicacion_preferida?, tarifa_por_unidad?, unidad? }
 */
export async function crearTrabajador(payload) {
  // Detectar si las columnas ERP de nómina ya existen (migración aplicada)
  // intentando un SELECT limitado; si falla, usamos sólo columnas base.
  const { error: testErr } = await supabase
    .from('personas_tienda')
    .select('tipo_contrato')
    .limit(1);
  const tieneColumnasErp = !testErr;
  const { error: puestosErr } = await supabase
    .from('personas_tienda')
    .select('puestos_adicionales')
    .limit(1);
  const tienePuestosAdicionales = !puestosErr;

  const baseRow = {
    nombre:                 payload.nombre,
    pin:                    payload.pin || null,
    rol:                    payload.rol || 'operador',
    activa:                 true,
    id_ubicacion_preferida: payload.id_ubicacion_preferida || null,
  };

  const erpRow = tieneColumnasErp ? {
    tipo_contrato:      payload.tipo_contrato      || 'fijo',
    area:               payload.area               || 'tienda',
    cargo:              payload.cargo              || null,
    salario_base:       payload.salario_base       || null,
    frecuencia_pago:    payload.frecuencia_pago    || 'mensual',
    fecha_ingreso:      payload.fecha_ingreso      || null,
    telefono:           payload.telefono           || null,
    notas_trabajador:   payload.notas_trabajador   || null,
    es_rotativo:        payload.area === 'tienda' ? (payload.es_rotativo ?? false) : false,
    areas_adicionales:  payload.areas_adicionales  || [],
    ...(tienePuestosAdicionales ? { puestos_adicionales: payload.puestos_adicionales || [] } : {}),
  } : {};

  const { data: persona, error: e1 } = await supabase
    .from('personas_tienda')
    .insert([{ ...baseRow, ...erpRow }])
    .select()
    .single();
  if (e1) throw e1;

  // Auto-crear costos_fijos si tiene salario o tarifa definida
  const tieneMonto = payload.salario_base || payload.tarifa_por_unidad;
  if (tieneMonto) {
    const esPorUnidad = payload.tipo_contrato === 'destajo';
    const ubicRol = payload.area === 'taller' ? 'Fabrica' : 'Tienda';

    // Buscar cuenta contable sugerida
    let idCuentaContable = null;
    const { data: mapeo } = await supabase
      .from('mapeo_categoria_cuenta')
      .select('id_cuenta_contable')
      .eq('categoria_costo', 'salario')
      .or(`ubicacion_rol.is.null,ubicacion_rol.eq.${ubicRol}`)
      .eq('activo', true)
      .order('ubicacion_rol', { ascending: false }) // preferir específico
      .limit(1)
      .maybeSingle();
    if (mapeo) idCuentaContable = mapeo.id_cuenta_contable;

    await supabase.from('costos_fijos').insert([{
      codigo:            `SAL-${persona.id_persona}`,
      nombre:            `${persona.nombre}`,
      categoria:         'salario',
      frecuencia:        payload.frecuencia_pago || 'mensual',
      monto_estimado:    payload.salario_base || 0,
      ...mapearPayloadCostoFijo({ frecuencia: payload.frecuencia_pago || 'mensual', dia_vencimiento: payload.dia_vencimiento ?? null }),
      es_por_unidad:     esPorUnidad,
      unidad:            esPorUnidad ? (payload.unidad || 'docena') : null,
      tarifa_por_unidad: esPorUnidad ? (payload.tarifa_por_unidad || null) : null,
      id_responsable:    persona.id_persona,
      id_cuenta_contable: idCuentaContable,
      activo:            true,
      fecha_inicio:      payload.fecha_ingreso || new Date().toISOString().slice(0, 10),
    }]);
  }

  return persona;
}

export async function actualizarTrabajador(idPersona, cambios) {
  // Separar columnas base (siempre existen) de columnas ERP (requieren migración)
  const ERP_COLS = new Set(['tipo_contrato','area','cargo','salario_base','frecuencia_pago','fecha_ingreso','telefono','notas_trabajador','es_rotativo','areas_adicionales','puestos_adicionales']);
  const COSTO_NOMINA_COLS = new Set(['tarifa_por_unidad', 'unidad', 'dia_vencimiento']);
  const baseChanges = Object.fromEntries(Object.entries(cambios).filter(([k]) => !ERP_COLS.has(k) && !COSTO_NOMINA_COLS.has(k)));
  const erpChanges  = Object.fromEntries(Object.entries(cambios).filter(([k]) =>  ERP_COLS.has(k)));

  let payload = baseChanges;
  if (Object.keys(erpChanges).length) {
    // Solo incluir si las columnas existen (migración aplicada)
    const { error: testErr } = await supabase.from('personas_tienda').select('tipo_contrato').limit(1);
    if (!testErr) {
      const { error: puestosErr } = await supabase.from('personas_tienda').select('puestos_adicionales').limit(1);
      const erpSafeChanges = { ...erpChanges };
      if (puestosErr) delete erpSafeChanges.puestos_adicionales;
      payload = { ...baseChanges, ...erpSafeChanges };
    }
  }

  const { data, error } = await supabase
    .from('personas_tienda')
    .update(payload)
    .eq('id_persona', idPersona)
    .select()
    .single();
  if (error) throw error;

  // Sincronizar costo fijo de nómina cuando cambian modalidad/salario/tarifa.
  const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
  const nominaTouched = ['tipo_contrato', 'salario_base', 'frecuencia_pago', 'dia_vencimiento', 'tarifa_por_unidad', 'unidad', 'fecha_ingreso', 'cargo', 'area', 'nombre']
    .some((k) => Object.prototype.hasOwnProperty.call(cambios, k));

  if (nominaTouched) {
    const tipoContrato = cambios.tipo_contrato ?? data.tipo_contrato ?? 'fijo';
    const esPorUnidad = tipoContrato === 'destajo';
    const salarioBase = toNum(cambios.salario_base ?? data.salario_base);
    const tarifaPorUnidad = toNum(cambios.tarifa_por_unidad);
    const unidad = cambios.unidad || 'docena';
    const frecuenciaPago = cambios.frecuencia_pago ?? data.frecuencia_pago ?? 'mensual';
    const diaVencimiento = cambios.dia_vencimiento ?? null;
    const fechaInicio = cambios.fecha_ingreso || data.fecha_ingreso || new Date().toISOString().slice(0, 10);

    const tieneMontoNomina = salarioBase > 0 || (esPorUnidad && tarifaPorUnidad > 0);

    const { data: costoActual, error: costoErr } = await supabase
      .from('costos_fijos')
      .select('id_costo, id_cuenta_contable')
      .eq('id_responsable', idPersona)
      .eq('categoria', 'salario')
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    if (costoErr) throw costoErr;

    if (costoActual) {
      const { error: upCostoErr } = await supabase
        .from('costos_fijos')
        .update({
          nombre: data.nombre,
          monto_estimado: esPorUnidad ? 0 : salarioBase,
          frecuencia: frecuenciaPago,
          ...mapearPayloadCostoFijo({ frecuencia: frecuenciaPago, dia_vencimiento: esPorUnidad ? null : diaVencimiento }),
          es_por_unidad: esPorUnidad,
          unidad: esPorUnidad ? unidad : null,
          tarifa_por_unidad: esPorUnidad ? tarifaPorUnidad : null,
          fecha_inicio: fechaInicio,
          activo: tieneMontoNomina ? true : false,
        })
        .eq('id_costo', costoActual.id_costo);
      if (upCostoErr) throw upCostoErr;
    } else if (tieneMontoNomina) {
      let idCuentaContable = null;
      const ubicRol = (cambios.area ?? data.area) === 'taller' ? 'Fabrica' : 'Tienda';
      const { data: mapeo } = await supabase
        .from('mapeo_categoria_cuenta')
        .select('id_cuenta_contable')
        .eq('categoria_costo', 'salario')
        .or(`ubicacion_rol.is.null,ubicacion_rol.eq.${ubicRol}`)
        .eq('activo', true)
        .order('ubicacion_rol', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mapeo) idCuentaContable = mapeo.id_cuenta_contable;

      const { error: insCostoErr } = await supabase
        .from('costos_fijos')
        .insert([{
          codigo: `SAL-${idPersona}`,
          nombre: data.nombre,
          categoria: 'salario',
          frecuencia: frecuenciaPago,
          monto_estimado: esPorUnidad ? 0 : salarioBase,
          ...mapearPayloadCostoFijo({ frecuencia: frecuenciaPago, dia_vencimiento: esPorUnidad ? null : diaVencimiento }),
          es_por_unidad: esPorUnidad,
          unidad: esPorUnidad ? unidad : null,
          tarifa_por_unidad: esPorUnidad ? tarifaPorUnidad : null,
          id_responsable: idPersona,
          id_cuenta_contable: idCuentaContable,
          activo: true,
          fecha_inicio: fechaInicio,
        }]);
      if (insCostoErr) throw insCostoErr;
    }
  }

  return data;
}

export async function eliminarTrabajador(idPersona) {
  const [
    cajasRes,
    movsRes,
    ventasRes,
    deudasRes,
    deudasEventosRes,
    transfOrigenRes,
    transfDestinoRes,
    transfAprobadaRes,
    cuentasCustodioRes,
    permisosRes,
    costosRes,
    vistasRes,
  ] = await Promise.all([
    supabase.from('cajas').select('id_caja', { count: 'exact', head: true }).eq('id_persona', idPersona),
    supabase.from('movimientos_caja').select('id_movimiento', { count: 'exact', head: true }).eq('id_persona', idPersona),
    supabase.from('ventas').select('id_venta', { count: 'exact', head: true }).eq('id_persona', idPersona),
    supabase.from('deudas').select('id_deuda', { count: 'exact', head: true }).eq('id_responsable', idPersona),
    supabase.from('deudas_eventos').select('id_evento', { count: 'exact', head: true }).eq('registrado_por', idPersona),
    supabase.from('transferencias_internas').select('id_transferencia', { count: 'exact', head: true }).eq('id_persona_origen', idPersona),
    supabase.from('transferencias_internas').select('id_transferencia', { count: 'exact', head: true }).eq('id_persona_destino', idPersona),
    supabase.from('transferencias_internas').select('id_transferencia', { count: 'exact', head: true }).eq('aprobada_por', idPersona),
    supabase.from('cuentas_financieras').select('id_cuenta', { count: 'exact', head: true }).eq('id_custodio_actual', idPersona),
    supabase.from('permisos_persona').select('id_permiso', { count: 'exact', head: true }).eq('id_persona', idPersona),
    supabase.from('costos_fijos').select('id_costo', { count: 'exact', head: true }).eq('id_responsable', idPersona),
    supabase.from('vistas_guardadas').select('id_vista', { count: 'exact', head: true }).eq('id_persona', idPersona),
  ]);

  const results = [cajasRes, movsRes, ventasRes, deudasRes, deudasEventosRes, transfOrigenRes, transfDestinoRes, transfAprobadaRes, cuentasCustodioRes, permisosRes, costosRes, vistasRes];
  const firstErr = results.find((r) => r.error)?.error;
  if (firstErr) throw firstErr;

  const historialBloqueante =
    (cajasRes.count || 0) +
    (movsRes.count || 0) +
    (ventasRes.count || 0) +
    (deudasRes.count || 0) +
    (deudasEventosRes.count || 0) +
    (transfOrigenRes.count || 0) +
    (transfDestinoRes.count || 0) +
    (transfAprobadaRes.count || 0) +
    (cuentasCustodioRes.count || 0);

  if (historialBloqueante > 0) {
    const [personaRes, costosActErr, permisosActErr] = await Promise.all([
      supabase
        .from('personas_tienda')
        .update({ activa: false })
        .eq('id_persona', idPersona)
        .select('id_persona, nombre, activa')
        .single(),
      supabase.from('costos_fijos').update({ activo: false }).eq('id_responsable', idPersona),
      supabase.from('permisos_persona').update({ activo: false }).eq('id_persona', idPersona),
    ]);
    if (personaRes.error) throw personaRes.error;
    if (costosActErr.error) throw costosActErr.error;
    if (permisosActErr.error) throw permisosActErr.error;
    return { mode: 'archived', persona: personaRes.data };
  }

  const deleteOps = await Promise.all([
    supabase.from('permisos_persona').delete().eq('id_persona', idPersona),
    supabase.from('costos_fijos').delete().eq('id_responsable', idPersona),
    supabase.from('vistas_guardadas').delete().eq('id_persona', idPersona),
  ]);
  const deleteErr = deleteOps.find((r) => r.error)?.error;
  if (deleteErr) throw deleteErr;

  const { data, error } = await supabase
    .from('personas_tienda')
    .delete()
    .eq('id_persona', idPersona)
    .select('id_persona, nombre')
    .single();
  if (error) throw error;
  return { mode: 'deleted', persona: data };
}

/**
 * Lista los pagos (movimientos) de un trabajador buscando
 * sus costos_fijos vinculados.
 */
export async function listarPagosTrabajador(idPersona, { limite = 50, fechaDesde = null } = {}) {
  const { data: costos } = await supabase
    .from('costos_fijos')
    .select('id_costo')
    .eq('id_responsable', idPersona)
    .eq('categoria', 'salario');
  if (!costos?.length) return [];

  const idsCostos = costos.map(c => c.id_costo);
  let query = supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, fecha_movimiento, monto, concepto, datos_extra,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias)
    `)
    .in('id_costo_fijo', idsCostos)
    .eq('tipo', 'egreso')
    .order('fecha_movimiento', { ascending: false })
    .limit(limite);
  if (fechaDesde) query = query.gte('fecha_movimiento', fechaDesde);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene el costo_fijo de nómina de un trabajador (si existe).
 */
export async function obtenerCostoFijoTrabajador(idPersona) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .select(`
      *,
      cuenta_contable:plan_cuentas!id_cuenta_contable(id_cuenta_contable, codigo, nombre, seccion_pl)
    `)
    .eq('id_responsable', idPersona)
    .eq('categoria', 'salario')
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizarCostoFijoRow(data) : null;
}


/* ════════════════════════════════════════════════════════════════════════
   MAPEO CATEGORÍA → CUENTA CONTABLE
   ════════════════════════════════════════════════════════════════════════ */

export async function listarMapeoCategoriaCuenta() {
  const { data, error } = await supabase
    .from('mapeo_categoria_cuenta')
    .select(`
      id, categoria_costo, ubicacion_rol, activo,
      cuenta_contable:plan_cuentas!id_cuenta_contable(id_cuenta_contable, codigo, nombre, seccion_pl)
    `)
    .eq('activo', true)
    .order('categoria_costo');
  if (error) throw error;
  return data || [];
}

/**
 * Devuelve el id_cuenta_contable sugerido para una categoría y ubicación.
 * Primero busca mapeo específico (ubicacion_rol = rol), luego genérico (NULL).
 */
export async function obtenerCuentaContableSugerida(categoriaCosto, ubicacionRol = null) {
  if (ubicacionRol) {
    const { data } = await supabase
      .from('mapeo_categoria_cuenta')
      .select('id_cuenta_contable')
      .eq('categoria_costo', categoriaCosto)
      .eq('ubicacion_rol', ubicacionRol)
      .eq('activo', true)
      .limit(1)
      .maybeSingle();
    if (data?.id_cuenta_contable) return data.id_cuenta_contable;
  }
  const { data } = await supabase
    .from('mapeo_categoria_cuenta')
    .select('id_cuenta_contable')
    .eq('categoria_costo', categoriaCosto)
    .is('ubicacion_rol', null)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();
  return data?.id_cuenta_contable || null;
}

export async function guardarMapeoCategoriaCuenta(mapeos) {
  const { error } = await supabase
    .from('mapeo_categoria_cuenta')
    .upsert(mapeos.map(m => ({ ...m, activo: true })));
  if (error) throw error;
}


/* ════════════════════════════════════════════════════════════════════════
   HUB EMPRESARIAL — funciones dedicadas al detalle de ubicación
   ════════════════════════════════════════════════════════════════════════ */

/** Obtiene una única ubicación con su metadata. */
export async function obtenerUbicacion(idUbicacion) {
  const { data, error } = await supabase
    .from('ubicaciones')
    .select('id_ubicacion, nombre, rol, activa, pin')
    .eq('id_ubicacion', idUbicacion)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Resumen agregado de una ubicación para la KPI strip:
 * - count trabajadores activos asignados
 * - count + suma mensualizada de costos fijos activos
 * - últimos movimientos
 */
export async function obtenerResumenUbicacion(idUbicacion) {
  const [ubRes, trabRes, costosRes] = await Promise.all([
    supabase
      .from('ubicaciones')
      .select('rol')
      .eq('id_ubicacion', idUbicacion)
      .single(),
    supabase
      .from('personas_tienda')
      .select('id_persona, area, es_rotativo, id_ubicacion_preferida')
      .eq('activa', true),
    supabase
      .from('costos_fijos')
      .select('id_costo, monto_estimado, frecuencia, es_por_unidad, tarifa_por_unidad, unidad')
      .eq('id_ubicacion', idUbicacion)
      .eq('activo', true),
  ]);

  if (ubRes.error) throw ubRes.error;
  if (costosRes.error) throw costosRes.error;

  const rol = ubRes.data?.rol;
  const areaEquivalente = rol === 'Fabrica' ? 'taller' : rol === 'Tienda' ? 'tienda' : null;

  // Contar trabajadores: asignados fijos + rotativos/sin asignar del área
  const personas = trabRes.data || [];
  const conteo = personas.filter(p => {
    if (p.id_ubicacion_preferida === idUbicacion) return true;
    if (!areaEquivalente) return false;
    if (areaEquivalente === 'taller') return p.area === 'taller' && !p.id_ubicacion_preferida;
    if (areaEquivalente === 'tienda') return p.area === 'tienda' && p.es_rotativo && !p.id_ubicacion_preferida;
    return false;
  }).length;

  const FACTORES = { diaria: 30, semanal: 4.33, quincenal: 2, mensual: 1, anual: 1 / 12 };
  const totalCostosMens = (costosRes.data || []).reduce((sum, c) => {
    const base = Number(c.monto_estimado) || 0;
    const f = FACTORES[c.frecuencia] ?? 1;
    return sum + base * f;
  }, 0);

  return {
    trabajadores: conteo,
    costos: (costosRes.data || []).length,
    totalCostosMens,
  };
}

/** Lista costos fijos asignados a una ubicación específica. */
export async function listarCostosPorUbicacion(idUbicacion, { incluirInactivos = false } = {}) {
  let q = supabase
    .from('costos_fijos')
    .select(`
      *,
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias),
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      ubicacion:ubicaciones!id_ubicacion(id_ubicacion, nombre),
      cuenta_contable:plan_cuentas!id_cuenta_contable(id_cuenta_contable, codigo, nombre, seccion_pl)
    `)
    .eq('id_ubicacion', idUbicacion)
    .order('categoria')
    .order('nombre');
  if (!incluirInactivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizarCostoFijoRow);
}

/** Lista trabajadores asignados a una ubicación como sede preferida. */
/**
 * Lista trabajadores de una ubicación.
 * Incluye:
 *  - Trabajadores con id_ubicacion_preferida = idUbicacion (asignados fijos)
 *  - Trabajadores cuya área coincide con el rol de la ubicación y NO tienen
 *    ubicación preferida (rotativos / sin asignar)
 *
 * @param {number} idUbicacion
 * @param {{ incluirInactivos?: boolean, ubicacionRol?: string }} opts
 *   ubicacionRol: 'Tienda' | 'Fabrica' — rol de la ubicación para mapear area
 */
/**
 * Lista trabajadores de una ubicación.
 * - Tienda: asignados fijos (id_ubicacion_preferida) + vendedoras rotativas (es_rotativo=true, sin preferida)
 * - Fabrica: asignados fijos + trabajadores de taller sin ubicación asignada
 */
export async function listarTrabajadoresPorUbicacion(idUbicacion, { incluirInactivos = false, ubicacionRol = null } = {}) {
  const { error: puestosErr } = await supabase
    .from('personas_tienda')
    .select('puestos_adicionales')
    .limit(1);
  const tienePuestosAdicionales = !puestosErr;

  let q = supabase
    .from('personas_tienda')
    .select(
      tienePuestosAdicionales
        ? 'id_persona, nombre, activa, rol, cargo, area, areas_adicionales, puestos_adicionales, es_rotativo, tipo_contrato, salario_base, frecuencia_pago, fecha_ingreso, telefono, id_ubicacion_preferida'
        : 'id_persona, nombre, activa, rol, cargo, area, areas_adicionales, es_rotativo, tipo_contrato, salario_base, frecuencia_pago, fecha_ingreso, telefono, id_ubicacion_preferida'
    )
    .order('nombre');

  if (!incluirInactivos) q = q.eq('activa', true);

  if (ubicacionRol === 'Tienda') {
    // Asignados a esta tienda + vendedoras rotativas sin preferida
    q = q.or(
      `id_ubicacion_preferida.eq.${idUbicacion},and(area.eq.tienda,es_rotativo.eq.true,id_ubicacion_preferida.is.null)`
    );
  } else if (ubicacionRol === 'Fabrica') {
    // Asignados a esta fábrica + trabajadores de taller sin preferida
    q = q.or(
      `id_ubicacion_preferida.eq.${idUbicacion},and(area.eq.taller,id_ubicacion_preferida.is.null)`
    );
  } else {
    q = q.eq('id_ubicacion_preferida', idUbicacion);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Lista movimientos asociados a una ubicación, con paginación simple. */
export async function listarMovimientosPorUbicacion(idUbicacion, { desde, hasta, limit = 50 } = {}) {
  let q = supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, fecha_movimiento, tipo, monto, concepto, categoria, metodo,
      id_cuenta_financiera, id_costo_fijo, id_ubicacion,
      cuenta:cuentas_financieras!id_cuenta_financiera(id_cuenta, nombre, alias, tipo_cuenta),
      costo:costos_fijos!id_costo_fijo(id_costo, nombre)
    `)
    .eq('id_ubicacion', idUbicacion)
    .order('fecha_movimiento', { ascending: false })
    .limit(limit);
  if (desde) q = q.gte('fecha_movimiento', desde);
  if (hasta) q = q.lte('fecha_movimiento', hasta);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Resumen de ventas para una tienda específica (por período). */
export async function obtenerResumenVentasTienda(idUbicacion, fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('ventas')
    .select('id_venta, fecha_hora, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado, id_persona, persona:personas_tienda!id_persona(nombre)')
    .eq('id_ubicacion', idUbicacion)
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (error) throw error;

  const rows = data || [];
  const totalVentas = rows.reduce((s, v) =>
    s + (Number(v.pago_efectivo) || 0) + (Number(v.pago_yape) || 0) +
    (Number(v.pago_plin) || 0) + (Number(v.pago_tarjeta) || 0) - (Number(v.descuento_aplicado) || 0), 0);

  // Agrupar por día
  const porDia = {};
  rows.forEach(v => {
    const dia = v.fecha_hora?.slice(0, 10) || '';
    if (!porDia[dia]) porDia[dia] = { fecha: dia, total: 0, cantidad: 0 };
    const t = (Number(v.pago_efectivo) || 0) + (Number(v.pago_yape) || 0) +
      (Number(v.pago_plin) || 0) + (Number(v.pago_tarjeta) || 0) - (Number(v.descuento_aplicado) || 0);
    porDia[dia].total += t;
    porDia[dia].cantidad += 1;
  });

  // Agrupar por método
  const metodos = { efectivo: 0, yape: 0, plin: 0, tarjeta: 0 };
  rows.forEach(v => {
    metodos.efectivo += Number(v.pago_efectivo) || 0;
    metodos.yape     += Number(v.pago_yape) || 0;
    metodos.plin     += Number(v.pago_plin) || 0;
    metodos.tarjeta  += Number(v.pago_tarjeta) || 0;
  });

  return {
    totalVentas,
    cantidadVentas: rows.length,
    porDia: Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porMetodo: Object.entries(metodos)
      .map(([metodo, total]) => ({ metodo, total }))
      .filter(m => m.total > 0),
  };
}

/** Mini-KPIs para las tarjetas de la lista de ubicaciones (carga en batch). */
export async function obtenerMiniKpisUbicaciones(desde, hasta) {
  const [ventasRes, costosRes, trabRes, ubicRes] = await Promise.all([
    supabase
      .from('ventas')
      .select('id_ubicacion, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
      .gte('fecha_hora', desde)
      .lte('fecha_hora', hasta + 'T23:59:59'),
    supabase
      .from('costos_fijos')
      .select('id_ubicacion, monto_estimado, frecuencia, activo')
      .eq('activo', true),
    supabase
      .from('personas_tienda')
      .select('id_ubicacion_preferida, area, es_rotativo')
      .eq('activa', true),
    supabase
      .from('ubicaciones')
      .select('id_ubicacion, rol')
      .eq('activa', true),
  ]);

  const FACTORES = { diaria: 30, semanal: 4.33, quincenal: 2, mensual: 1, anual: 1 / 12 };

  // Mapa rol de cada ubicación
  const rolPorUbic = {};
  (ubicRes.data || []).forEach(u => { rolPorUbic[u.id_ubicacion] = u.rol; });

  // Ventas por ubicación
  const ventasPorUbic = {};
  (ventasRes.data || []).forEach(v => {
    const id = v.id_ubicacion;
    if (!id) return;
    if (!ventasPorUbic[id]) ventasPorUbic[id] = 0;
    ventasPorUbic[id] += (Number(v.pago_efectivo) || 0) + (Number(v.pago_yape) || 0) +
      (Number(v.pago_plin) || 0) + (Number(v.pago_tarjeta) || 0) - (Number(v.descuento_aplicado) || 0);
  });

  // Costos por ubicación (mensualizado)
  const costosPorUbic = {};
  (costosRes.data || []).forEach(c => {
    const id = c.id_ubicacion;
    if (!id) return;
    if (!costosPorUbic[id]) costosPorUbic[id] = 0;
    const f = FACTORES[c.frecuencia] ?? 1;
    costosPorUbic[id] += (Number(c.monto_estimado) || 0) * f;
  });

  // Trabajadores por ubicación:
  //  - Asignados fijos (id_ubicacion_preferida)
  //  - Taller sin preferida → se asignan a todas las Fabrica
  //  - Tienda rotativo sin preferida → se asignan a todas las Tiendas
  const trabPorUbic = {};
  const todasUbicaciones = Object.keys(rolPorUbic).map(Number);

  (trabRes.data || []).forEach(p => {
    if (p.id_ubicacion_preferida) {
      // Asignado fijo
      trabPorUbic[p.id_ubicacion_preferida] = (trabPorUbic[p.id_ubicacion_preferida] || 0) + 1;
    } else if (p.area === 'taller') {
      // Trabajador de taller sin ubicación → contar en todas las Fábricas
      todasUbicaciones.filter(id => rolPorUbic[id] === 'Fabrica').forEach(id => {
        trabPorUbic[id] = (trabPorUbic[id] || 0) + 1;
      });
    } else if (p.area === 'tienda' && p.es_rotativo) {
      // Vendedora rotativa → contar en todas las Tiendas
      todasUbicaciones.filter(id => rolPorUbic[id] === 'Tienda').forEach(id => {
        trabPorUbic[id] = (trabPorUbic[id] || 0) + 1;
      });
    }
  });

  return { ventasPorUbic, costosPorUbic, trabPorUbic };
}