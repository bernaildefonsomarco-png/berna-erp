// src/views/gestion/api/catalogoClient.js
import { supabase } from '../../../api/supabase';

// ── tipos_movimiento_caja ──────────────────────────────────────────────────
export async function listTipos() {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('*')
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}
export async function upsertTipo(row) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .upsert(row, { onConflict: 'id_tipo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── plantillas_recurrentes ────────────────────────────────────────────────
export async function listPlantillas() {
  const { data, error } = await supabase
    .from('plantillas_recurrentes')
    .select('*, tipo:tipos_movimiento_caja(nombre,codigo), ubicacion:ubicaciones(nombre,rol)')
    .order('codigo');
  if (error) throw error;
  return data;
}
export async function upsertPlantilla(row) {
  const { data, error } = await supabase
    .from('plantillas_recurrentes')
    .upsert(row, { onConflict: 'id_plantilla' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── mapeo_tipo_cuenta ─────────────────────────────────────────────────────
export async function listMapeos() {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .select('*, tipo:tipos_movimiento_caja(nombre,codigo), cuenta:plan_cuentas(codigo,nombre)')
    .order('id_tipo');
  if (error) throw error;
  return data;
}
export async function upsertMapeo(row) {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .upsert(row, { onConflict: 'id_tipo,ubicacion_rol' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── roles_persona ─────────────────────────────────────────────────────────
export async function listRoles() {
  const { data, error } = await supabase.from('roles_persona').select('*').order('orden');
  if (error) throw error;
  return data;
}
export async function upsertRol(row) {
  const { data, error } = await supabase
    .from('roles_persona')
    .upsert(row, { onConflict: 'id_rol' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── catalogos_auxiliares ──────────────────────────────────────────────────
export async function listCatalogosAux() {
  const { data, error } = await supabase
    .from('catalogos_auxiliares')
    .select('*')
    .order('codigo');
  if (error) throw error;
  return data;
}
export async function upsertCatalogoAux(row) {
  const { data, error } = await supabase
    .from('catalogos_auxiliares')
    .upsert(row, { onConflict: 'id_catalogo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── periodos_contables ────────────────────────────────────────────────────
export async function listPeriodos() {
  const { data, error } = await supabase
    .from('periodos_contables')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data;
}
export async function cambiarEstadoPeriodo(id_periodo, estado, { motivo_reapertura, cerrado_por } = {}) {
  const parche = { estado };
  if (estado === 'cerrado') {
    parche.cerrado_por = cerrado_por;
    parche.cerrado_en = new Date().toISOString();
  } else if (estado === 'abierto') {
    parche.motivo_reapertura = motivo_reapertura;
  }
  const { data, error } = await supabase
    .from('periodos_contables')
    .update(parche)
    .eq('id_periodo', id_periodo)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── plan_cuentas (for selects in mapeo) ──────────────────────────────────
export async function listPlanCuentas() {
  const { data, error } = await supabase
    .from('plan_cuentas')
    .select('id_cuenta_contable,codigo,nombre')
    .order('codigo');
  if (error) throw error;
  return data;
}

// ── salud ─────────────────────────────────────────────────────────────────
export async function fetchSalud() {
  const { data, error } = await supabase.from('v_sistema_salud').select('*').single();
  if (error) throw error;
  return data;
}
