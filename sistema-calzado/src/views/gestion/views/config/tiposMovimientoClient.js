import { supabase } from '../../../../api/supabase';

/** @param {string} categoriaMacro @param {string} [ubicacionRol] */
export async function fnSugerirCuentaParaTipo(categoriaMacro, ubicacionRol = '*') {
  const { data, error } = await supabase.rpc('fn_sugerir_cuenta_para_tipo', {
    p_categoria_macro: categoriaMacro,
    p_ubicacion_rol: ubicacionRol,
  });
  if (error) throw error;
  return data;
}

export async function listPlanCuentasArbol() {
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('id_cuenta_contable, codigo, nombre, id_padre, nivel, permite_movimientos, activa')
    .eq('activa', true)
    .order('codigo');
  if (error) throw error;
  return data || [];
}

export async function fetchCuentaById(id) {
  if (id == null) return null;
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('id_cuenta_contable, codigo, nombre, seccion_pl, permite_movimientos')
    .eq('id_cuenta_contable', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTiposMovimiento() {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('id_tipo, codigo, nombre, emoji, categoria, direccion, activo, orden, id_cuenta_contable_default')
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listMapeosResumen() {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .select('id_mapeo, ubicacion_rol, activo, tipo:tipos_movimiento_caja(nombre,codigo), cuenta:plan_cuentas(codigo,nombre)')
    .order('id_tipo');
  if (error) throw error;
  return data || [];
}

export async function getTipoById(id_tipo) {
  const { data, error } = await supabase.from('tipos_movimiento_caja').select('*').eq('id_tipo', id_tipo).single();
  if (error) throw error;
  return data;
}

/**
 * Actualiza un tipo existente. Si cambia `id_cuenta_contable_default`, actualiza
 * todas las filas de `mapeo_tipo_cuenta` de ese tipo a la misma cuenta.
 */
export async function updateTipoMovimiento(id_tipo, form) {
  const { data: cur, error: e0 } = await supabase.from('tipos_movimiento_caja').select('*').eq('id_tipo', id_tipo).single();
  if (e0) throw e0;

  const idCuentaNueva = form.id_cuenta_contable_default;
  const cuentaCambio =
    idCuentaNueva != null && idCuentaNueva !== cur.id_cuenta_contable_default;

  const updateRow = {
    codigo: form.codigo,
    nombre: form.nombre,
    emoji: form.emoji,
    categoria: form.categoria,
    tipo_flujo: form.tipo_flujo,
    direccion: form.direccion,
    requiere_nota: form.requiere_nota,
    activo: form.activo,
    orden: form.orden,
    id_cuenta_contable_default: idCuentaNueva,
    scope: form.scope,
    solo_admin: form.solo_admin,
  };
  if (form.naturaleza !== undefined) updateRow.naturaleza = form.naturaleza;

  const { data: tipo, error: e1 } = await supabase
    .from('tipos_movimiento_caja')
    .update(updateRow)
    .eq('id_tipo', id_tipo)
    .select()
    .single();
  if (e1) throw e1;

  if (cuentaCambio) {
    const { error: e2 } = await supabase
      .from('mapeo_tipo_cuenta')
      .update({ id_cuenta_contable: idCuentaNueva })
      .eq('id_tipo', id_tipo);
    if (e2) throw e2;
  }

  return tipo;
}

/**
 * Crea tipo + mapeos según ámbito. Mapea macro → dirección + tipo_flujo reales.
 */
export async function crearTipoMovimientoWizard(datos) {
  const { categoria_macro, nombre, emoji, codigo, ambito, id_cuenta_contable, ubicaciones_especificas, roles_permitidos } = datos;
  const { direccion, tipo_flujo } = macroAFlujo(categoria_macro);
  const scope = buildScope(roles_permitidos);

  const row = {
    codigo: codigo.trim(),
    nombre: nombre.trim(),
    emoji: emoji?.trim() || null,
    categoria: categoria_macro,
    tipo_flujo: tipo_flujo,
    direccion: direccion,
    requiere_nota: false,
    activo: true,
    orden: 99,
    id_cuenta_contable_default: id_cuenta_contable,
    scope,
    comportamientos: [],
    campos_requeridos: [],
    solo_admin: false,
  };

  const { data: tipo, error: e1 } = await supabase
    .from('tipos_movimiento_caja')
    .insert(row)
    .select()
    .single();
  if (e1) throw e1;

  let mapeoRows;
  if (ambito === 'especificas') {
    mapeoRows = await mapeoRowsEspecificas(tipo.id_tipo, id_cuenta_contable, ubicaciones_especificas);
  } else {
    mapeoRows = mapeoRowsForAmbito(tipo.id_tipo, id_cuenta_contable, ambito);
  }
  if (mapeoRows.length) {
    const { error: e2 } = await supabase.from('mapeo_tipo_cuenta').insert(mapeoRows);
    if (e2) throw e2;
  }

  return tipo;
}

export function macroAFlujo(macro) {
  if (macro === 'ingreso') {
    return { direccion: 'entrada', tipo_flujo: 'ingreso' };
  }
  if (macro === 'traslado') {
    return { direccion: 'transferencia', tipo_flujo: 'ambos' };
  }
  return { direccion: 'salida', tipo_flujo: 'egreso' };
}

function buildScope(roles) {
  const r = Array.isArray(roles) && roles.length ? roles : [];
  return ['manual', ...r];
}

/**
 * @param {number} idTipo
 * @param {number} idCuenta
 * @param {'cualquier'|'tiendas'|'talleres'} ambito
 */
function mapeoRowsForAmbito(idTipo, idCuenta, ambito) {
  const base = (rol) => ({
    id_tipo: idTipo,
    ubicacion_rol: rol,
    id_cuenta_contable: idCuenta,
    activo: true,
  });

  if (ambito === 'cualquier') {
    return [base('*')];
  }
  if (ambito === 'tiendas') {
    return [base('Tienda')];
  }
  if (ambito === 'talleres') {
    return [base('Fabrica')];
  }
  return [base('*')];
}

/** @param {number[]} [idsUbicacion] */
export async function mapeoRowsEspecificas(idTipo, idCuenta, idsUbicacion) {
  if (!idsUbicacion?.length) return [buildRow(idTipo, idCuenta, '*')];
  const { data: ubs, error } = await supabase
    .from('ubicaciones')
    .select('id_ubicacion, rol')
    .in('id_ubicacion', idsUbicacion);
  if (error) throw error;
  const roles = [...new Set((ubs || []).map((u) => (u.rol === 'Fabrica' ? 'Fabrica' : 'Tienda')))];
  if (!roles.length) return [buildRow(idTipo, idCuenta, '*')];
  return roles.map((r) => buildRow(idTipo, idCuenta, r));
}

function buildRow(idTipo, idCuenta, rol) {
  return { id_tipo: idTipo, ubicacion_rol: rol, id_cuenta_contable: idCuenta, activo: true };
}
