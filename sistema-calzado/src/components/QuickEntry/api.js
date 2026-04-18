// src/components/QuickEntry/api.js
import { supabase } from '../../api/supabase';

export async function fetchTiposPorScope(scope) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('*')
    .eq('activo', true)
    .contains('scope', [scope])
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchUbicaciones() {
  const { data, error } = await supabase
    .from('ubicaciones')
    .select('id_ubicacion,nombre,rol,activa')
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function fetchMapeos() {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .select('id_tipo,ubicacion_rol,id_cuenta_contable,activo')
    .eq('activo', true);
  if (error) throw error;
  return data;
}

export async function fetchCuentasFinancieras() {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .select('id_cuenta,nombre,activa,saldo_actual,moneda')
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function fetchPersonas() {
  const { data, error } = await supabase
    .from('personas_tienda')
    .select('id_persona,nombre,rol,salario_base,id_ubicacion_preferida')
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function registrarHechoEconomico({
  p_id_tipo,
  p_monto,
  p_id_ubicacion = null,
  p_id_cuenta_financiera = null,
  p_splits = null,
  p_id_caja = null,
  p_id_plantilla_origen = null,
  p_id_venta = null,
  p_id_lote_produccion = null,
  p_concepto = null,
  p_datos_extra = {},
}) {
  const { data, error } = await supabase.rpc('fn_registrar_hecho_economico', {
    p_id_tipo,
    p_monto,
    p_id_ubicacion,
    p_id_cuenta_financiera,
    p_splits,
    p_id_caja,
    p_id_plantilla_origen,
    p_id_venta,
    p_id_lote_produccion,
    p_concepto,
    p_datos_extra,
  });
  if (error) throw error;
  return data; // id_movimiento
}
