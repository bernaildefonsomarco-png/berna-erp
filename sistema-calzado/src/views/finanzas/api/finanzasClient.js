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

export async function listarCostosFijos({ incluirInactivos = false } = {}) {
  let query = supabase
    .from('costos_fijos')
    .select(`
      *,
      cuenta_reserva:cuentas_financieras!id_cuenta_reserva(id_cuenta, nombre, alias),
      responsable:personas_tienda!id_responsable(id_persona, nombre),
      ubicacion:ubicaciones!id_ubicacion(id_ubicacion, nombre)
    `)
    .order('dia_vencimiento_mes', { ascending: true, nullsFirst: false });

  if (!incluirInactivos) query = query.eq('activo', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function crearCostoFijo(payload) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarCostoFijo(idCosto, cambios) {
  const { data, error } = await supabase
    .from('costos_fijos')
    .update(cambios)
    .eq('id_costo', idCosto)
    .select()
    .single();
  if (error) throw error;
  return data;
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
  return data;
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