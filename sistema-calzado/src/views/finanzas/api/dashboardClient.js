// src/views/finanzas/api/dashboardClient.js
import { supabase } from '../../../api/supabase';

export async function obtenerPLResumen(fechaInicio, fechaFin, idUbicacion = null) {
  const { data, error } = await supabase.rpc('fn_pl_resumen', {
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_id_ubicacion: idUbicacion,
  });
  if (error) throw error;
  return data || [];
}

export async function obtenerFlujoCajaDiario(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('v_flujo_caja_diario')
    .select('*')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function obtenerFlujoCajaMensual(meses = 12) {
  const { data, error } = await supabase
    .from('v_flujo_caja_mensual')
    .select('*')
    .limit(meses);
  if (error) throw error;
  return (data || []).reverse(); // cronológico para el gráfico
}

export async function obtenerPatrimonioTotales() {
  const { data, error } = await supabase.rpc('fn_patrimonio_totales');
  if (error) throw error;
  return data?.[0] || { total_activos: 0, total_pasivos: 0, patrimonio_neto: 0 };
}

export async function obtenerPatrimonioDetalle() {
  const { data, error } = await supabase
    .from('v_patrimonio_snapshot')
    .select('*')
    .order('monto', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerObligacionesProximas() {
  const { data, error } = await supabase
    .from('v_obligaciones_proximas')
    .select('*')
    .order('fecha_proxima', { ascending: true });
  if (error) throw error;
  return data || [];
}
