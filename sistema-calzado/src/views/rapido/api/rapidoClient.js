// src/views/rapido/api/rapidoClient.js
import { supabase } from '../../../api/supabase';
import { verifyPersonaPin } from '../../../lib/pinAuth';

/* ─── Auth ──────────────────────────────────────────────────────────────── */

export async function loginRapido(pin) {
  // 1. Obtener personas con permiso 'rapido' activo
  const { data: permRows, error: e1 } = await supabase
    .from('permisos_persona')
    .select('id_persona')
    .eq('recurso', 'rapido')
    .eq('activo', true);
  if (e1) throw e1;

  const ids = [...new Set((permRows || []).map(r => r.id_persona))];
  if (!ids.length) {
    const err = new Error('No hay personas con acceso al Modo Rápido configurado');
    err.code = 'NO_PERMISSION';
    throw err;
  }

  // 2. Cargar las personas activas con ese permiso
  const { data: candidatas, error: e2 } = await supabase
    .from('personas_tienda')
    .select('id_persona, nombre, pin, pin_hash, activa')
    .in('id_persona', ids)
    .eq('activa', true);
  if (e2) throw e2;

  // 3. Comparar PIN
  for (const row of candidatas || []) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifyPersonaPin(row, pin);
    if (!ok) continue;

    // 4. Cargar todos sus permisos
    const { data: permisos } = await supabase
      .from('permisos_persona')
      .select('recurso, nivel_acceso, activo')
      .eq('id_persona', row.id_persona)
      .eq('activo', true);

    const nivelRapido = (permisos || []).find(x => x.recurso === 'rapido')?.nivel_acceso;
    const nivelesValidos = ['registrar', 'editar', 'admin'];
    if (!nivelesValidos.includes(nivelRapido)) {
      const err = new Error('Esta persona no tiene acceso al Modo Rápido');
      err.code = 'NO_PERMISSION';
      throw err;
    }

    return { ...row, permisos: permisos || [] };
  }

  const err = new Error('PIN incorrecto');
  err.code = 'INVALID_PIN';
  throw err;
}

/* ─── Cuentas ────────────────────────────────────────────────────────────── */

export async function listarCuentasRapido() {
  const { data, error } = await supabase.from('v_rapido_cuentas').select('*');
  if (error) throw error;
  return data || [];
}

/* ─── Tipos de gasto ────────────────────────────────────────────────────── */

export async function listarTiposGasto() {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('id_tipo, nombre, icono, color_hex, tipo_flujo')
    .in('tipo_flujo', ['egreso', 'ambos'])
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data || [];
}

/* ─── Deudas activas ────────────────────────────────────────────────────── */

export async function listarDeudasActivas() {
  const { data, error } = await supabase
    .from('deudas')
    .select('id_deuda, codigo, nombre, acreedor, saldo_actual, cuota_monto')
    .eq('estado', 'activa')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

/* ─── Obligaciones próximas ─────────────────────────────────────────────── */

export async function obtenerObligacionesProximas() {
  const { data, error } = await supabase
    .from('v_obligaciones_proximas')
    .select('*')
    .order('fecha_proxima');
  if (error) throw error;
  return data || [];
}

/* ─── Registrar gasto ───────────────────────────────────────────────────── */

export async function registrarGastoRapido({ idCuenta, monto, concepto, idTipo, idPersona }) {
  // 1. Insertar movimiento
  const { data: mov, error: e1 } = await supabase
    .from('movimientos_caja')
    .insert({
      tipo: 'egreso',
      monto: Number(monto),
      concepto,
      id_cuenta_financiera: idCuenta,
      id_tipo: idTipo || null,
      id_persona: idPersona,
      metodo: 'efectivo',
    })
    .select()
    .single();
  if (e1) throw e1;

  // 2. Actualizar saldo de la cuenta (patrón existente del módulo)
  const { data: cuenta, error: e2 } = await supabase
    .from('cuentas_financieras')
    .select('saldo_actual')
    .eq('id_cuenta', idCuenta)
    .single();
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from('cuentas_financieras')
    .update({ saldo_actual: Number(cuenta.saldo_actual) - Number(monto) })
    .eq('id_cuenta', idCuenta);
  if (e3) throw e3;

  return mov;
}

/* ─── Registrar pago de deuda ───────────────────────────────────────────── */

export async function registrarPagoDeudaRapido({ idDeuda, idCuenta, monto, idPersona }) {
  // 1. Insertar movimiento con referencia a la deuda
  const { data: mov, error: e1 } = await supabase
    .from('movimientos_caja')
    .insert({
      tipo: 'egreso',
      monto: Number(monto),
      concepto: 'Pago de deuda',
      id_cuenta_financiera: idCuenta,
      id_deuda: idDeuda,
      id_persona: idPersona,
      metodo: 'efectivo',
    })
    .select()
    .single();
  if (e1) throw e1;

  // 2. Descontar saldo de la cuenta financiera
  const { data: cuenta, error: e2 } = await supabase
    .from('cuentas_financieras')
    .select('saldo_actual')
    .eq('id_cuenta', idCuenta)
    .single();
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from('cuentas_financieras')
    .update({ saldo_actual: Number(cuenta.saldo_actual) - Number(monto) })
    .eq('id_cuenta', idCuenta);
  if (e3) throw e3;

  // 3. Reducir saldo de la deuda
  const { data: deuda, error: e4 } = await supabase
    .from('deudas')
    .select('saldo_actual')
    .eq('id_deuda', idDeuda)
    .single();
  if (e4) throw e4;

  const nuevoSaldoDeuda = Math.max(0, Number(deuda.saldo_actual) - Number(monto));
  const { error: e5 } = await supabase
    .from('deudas')
    .update({ saldo_actual: nuevoSaldoDeuda })
    .eq('id_deuda', idDeuda);
  if (e5) throw e5;

  return mov;
}

/* ─── Transferencia entre cuentas ──────────────────────────────────────── */

export async function registrarTransferenciaRapido({ idCuentaOrigen, idCuentaDestino, monto, concepto, idPersona }) {
  // Insertar dos movimientos: egreso origen + ingreso destino
  const montoN = Number(monto);

  const { error: e1 } = await supabase.from('movimientos_caja').insert({
    tipo: 'egreso',
    monto: montoN,
    concepto: concepto || 'Transferencia entre cuentas',
    id_cuenta_financiera: idCuentaOrigen,
    id_persona: idPersona,
    metodo: 'transferencia',
  });
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('movimientos_caja').insert({
    tipo: 'ingreso',
    monto: montoN,
    concepto: concepto || 'Transferencia entre cuentas',
    id_cuenta_financiera: idCuentaDestino,
    id_persona: idPersona,
    metodo: 'transferencia',
  });
  if (e2) throw e2;

  // Actualizar saldos
  const [{ data: origen }, { data: destino }] = await Promise.all([
    supabase.from('cuentas_financieras').select('saldo_actual').eq('id_cuenta', idCuentaOrigen).single(),
    supabase.from('cuentas_financieras').select('saldo_actual').eq('id_cuenta', idCuentaDestino).single(),
  ]);

  await Promise.all([
    supabase.from('cuentas_financieras').update({ saldo_actual: Number(origen.saldo_actual) - montoN }).eq('id_cuenta', idCuentaOrigen),
    supabase.from('cuentas_financieras').update({ saldo_actual: Number(destino.saldo_actual) + montoN }).eq('id_cuenta', idCuentaDestino),
  ]);
}
