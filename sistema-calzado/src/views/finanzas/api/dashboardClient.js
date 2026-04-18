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

// ── VENTAS ────────────────────────────────────────────────────────────────

export async function obtenerVentasPorTienda(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('ventas')
    .select('id_ubicacion, ubicaciones(nombre), pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (error) throw error;
  const map = {};
  (data || []).forEach(v => {
    const id = v.id_ubicacion;
    const nombre = v.ubicaciones?.nombre || 'Sin tienda';
    if (!map[id]) map[id] = { id_ubicacion: id, nombre, total: 0, cantidad: 0 };
    const total = (Number(v.pago_efectivo) || 0) + (Number(v.pago_yape) || 0)
      + (Number(v.pago_plin) || 0) + (Number(v.pago_tarjeta) || 0) - (Number(v.descuento_aplicado) || 0);
    map[id].total += total;
    map[id].cantidad += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export async function obtenerVentasPorMetodo(fechaInicio, fechaFin, idUbicacion = null) {
  let q = supabase
    .from('ventas')
    .select('pago_efectivo, pago_yape, pago_plin, pago_tarjeta')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (idUbicacion) q = q.eq('id_ubicacion', idUbicacion);
  const { data, error } = await q;
  if (error) throw error;
  let efectivo = 0, yape = 0, plin = 0, tarjeta = 0;
  (data || []).forEach(v => {
    efectivo += Number(v.pago_efectivo) || 0;
    yape     += Number(v.pago_yape)     || 0;
    plin     += Number(v.pago_plin)     || 0;
    tarjeta  += Number(v.pago_tarjeta)  || 0;
  });
  return [
    { metodo: 'Efectivo', total: efectivo, fill: '#1c1917' },
    { metodo: 'Yape',     total: yape,     fill: '#7c3aed' },
    { metodo: 'Plin',     total: plin,     fill: '#0ea5e9' },
    { metodo: 'Tarjeta',  total: tarjeta,  fill: '#059669' },
  ].filter(m => m.total > 0);
}

export async function obtenerTopModelos(fechaInicio, fechaFin, limit = 10) {
  const { data, error } = await supabase
    .from('ventas_detalle')
    .select('id_producto, modelo, marca, precio_final_venta, cantidad, ventas!inner(fecha_hora)')
    .gte('ventas.fecha_hora', fechaInicio)
    .lte('ventas.fecha_hora', fechaFin + 'T23:59:59');
  if (error) throw error;
  const map = {};
  (data || []).forEach(d => {
    const id = d.id_producto || d.modelo; // fallback a nombre si sin id
    if (!id) return;
    const nombre = d.modelo || 'Sin modelo';
    const marca  = d.marca  || '';
    if (!map[id]) map[id] = { id_producto: id, nombre, marca, pares: 0, monto: 0 };
    map[id].pares += Number(d.cantidad) || 1;
    map[id].monto += Number(d.precio_final_venta) || 0;
  });
  return Object.values(map).sort((a, b) => b.pares - a.pares).slice(0, limit);
}

export async function obtenerVentasPorDiaSemana(fechaInicio, fechaFin, idUbicacion = null) {
  let q = supabase
    .from('ventas')
    .select('fecha_hora, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (idUbicacion) q = q.eq('id_ubicacion', idUbicacion);
  const { data, error } = await q;
  if (error) throw error;
  const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const acum = Array.from({ length: 7 }, (_, i) => ({ dia: i, nombre: nombres[i], total: 0, cantidad: 0 }));
  (data || []).forEach(v => {
    const d = new Date(v.fecha_hora).getDay();
    const total = (Number(v.pago_efectivo)||0)+(Number(v.pago_yape)||0)+(Number(v.pago_plin)||0)+(Number(v.pago_tarjeta)||0)-(Number(v.descuento_aplicado)||0);
    acum[d].total    += total;
    acum[d].cantidad += 1;
  });
  // Reordenar Lun→Dom
  return [...acum.slice(1), acum[0]];
}

export async function obtenerResumenVentas(fechaInicio, fechaFin, idUbicacion = null) {
  let q = supabase
    .from('ventas')
    .select('pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (idUbicacion) q = q.eq('id_ubicacion', idUbicacion);
  const { data, error } = await q;
  if (error) throw error;
  let total = 0;
  const rows = data || [];
  rows.forEach(v => {
    total += (Number(v.pago_efectivo)||0)+(Number(v.pago_yape)||0)+(Number(v.pago_plin)||0)+(Number(v.pago_tarjeta)||0)-(Number(v.descuento_aplicado)||0);
  });
  return { total, cantidad: rows.length, ticket: rows.length > 0 ? total / rows.length : 0 };
}

export async function obtenerVentasPorDia(fechaInicio, fechaFin, idUbicacion = null) {
  let q = supabase
    .from('ventas')
    .select('fecha_hora, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59')
    .order('fecha_hora', { ascending: true });
  if (idUbicacion) q = q.eq('id_ubicacion', idUbicacion);
  const { data, error } = await q;
  if (error) throw error;
  const map = {};
  (data || []).forEach(v => {
    const dia = v.fecha_hora.slice(0, 10);
    if (!map[dia]) map[dia] = { fecha: dia, total: 0, cantidad: 0 };
    const t = (Number(v.pago_efectivo)||0)+(Number(v.pago_yape)||0)+(Number(v.pago_plin)||0)+(Number(v.pago_tarjeta)||0)-(Number(v.descuento_aplicado)||0);
    map[dia].total    += t;
    map[dia].cantidad += 1;
  });
  return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function obtenerVentasPorHora(fechaInicio, fechaFin, idUbicacion = null) {
  let q = supabase
    .from('ventas')
    .select('fecha_hora, pago_efectivo, pago_yape, pago_plin, pago_tarjeta, descuento_aplicado')
    .gte('fecha_hora', fechaInicio)
    .lte('fecha_hora', fechaFin + 'T23:59:59');
  if (idUbicacion) q = q.eq('id_ubicacion', idUbicacion);
  const { data, error } = await q;
  if (error) throw error;
  const acum = Array.from({ length: 24 }, (_, i) => ({
    hora: i,
    label: `${String(i).padStart(2, '0')}:00`,
    total: 0,
    cantidad: 0,
  }));
  (data || []).forEach(v => {
    const h = new Date(v.fecha_hora).getHours();
    const t = (Number(v.pago_efectivo)||0)+(Number(v.pago_yape)||0)+(Number(v.pago_plin)||0)+(Number(v.pago_tarjeta)||0)-(Number(v.descuento_aplicado)||0);
    acum[h].total    += t;
    acum[h].cantidad += 1;
  });
  return acum.filter(h => h.hora >= 7 && h.hora <= 21);
}

export async function obtenerGastosDetallePorSeccion(fechaInicio, fechaFin, seccionPL) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      id_movimiento, concepto, monto, fecha_movimiento, categoria,
      id_ubicacion, ubicaciones(nombre),
      costo:costos_fijos!id_costo_fijo(id_costo, nombre, categoria),
      cuenta_contable:plan_cuentas!id_cuenta_contable(codigo, nombre, seccion_pl),
      persona:personas_tienda!id_persona(nombre)
    `)
    .eq('tipo', 'egreso')
    .gte('fecha_movimiento', fechaInicio + 'T00:00:00')
    .lte('fecha_movimiento', fechaFin + 'T23:59:59')
    .order('fecha_movimiento', { ascending: false });
  if (error) throw error;
  return (data || []).filter(m =>
    m.cuenta_contable?.seccion_pl === seccionPL
  );
}

export async function obtenerGastosPorCategoria(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      monto, id_ubicacion, ubicaciones(nombre),
      costo:costos_fijos!id_costo_fijo(nombre, categoria),
      cuenta_contable:plan_cuentas!id_cuenta_contable(codigo, nombre, seccion_pl)
    `)
    .eq('tipo', 'egreso')
    .gte('fecha_movimiento', fechaInicio + 'T00:00:00')
    .lte('fecha_movimiento', fechaFin + 'T23:59:59');
  if (error) throw error;
  const map = {};
  (data || []).forEach(m => {
    const seccion = m.cuenta_contable?.seccion_pl || 'sin_impacto';
    const cat     = m.costo?.categoria || m.categoria || 'otro';
    const key     = `${seccion}__${cat}`;
    if (!map[key]) map[key] = { seccion_pl: seccion, categoria: cat, total: 0, cantidad: 0 };
    map[key].total    += Number(m.monto) || 0;
    map[key].cantidad += 1;
  });
  return Object.values(map);
}

export async function obtenerGastosPorUbicacion(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select('monto, id_ubicacion, ubicaciones(nombre)')
    .eq('tipo', 'egreso')
    .gte('fecha_movimiento', fechaInicio + 'T00:00:00')
    .lte('fecha_movimiento', fechaFin + 'T23:59:59');
  if (error) throw error;
  const map = {};
  (data || []).forEach(m => {
    const id     = m.id_ubicacion || 0;
    const nombre = m.ubicaciones?.nombre || 'General';
    if (!map[id]) map[id] = { id_ubicacion: id, nombre, total: 0, cantidad: 0 };
    map[id].total    += Number(m.monto) || 0;
    map[id].cantidad += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export async function obtenerPagosPorTrabajador(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('movimientos_caja')
    .select(`
      monto, concepto, fecha_movimiento,
      costo:costos_fijos!id_costo_fijo(nombre, categoria, id_responsable,
        responsable:personas_tienda!id_responsable(nombre, area)
      ),
      cuenta_contable:plan_cuentas!id_cuenta_contable(seccion_pl)
    `)
    .eq('tipo', 'egreso')
    .gte('fecha_movimiento', fechaInicio + 'T00:00:00')
    .lte('fecha_movimiento', fechaFin + 'T23:59:59')
    .order('fecha_movimiento', { ascending: false });
  if (error) throw error;
  const pagos = (data || []).filter(m =>
    m.cuenta_contable?.seccion_pl === 'gastos_personal' ||
    m.costo?.categoria === 'salario'
  );
  const map = {};
  pagos.forEach(m => {
    const nombre = m.costo?.responsable?.nombre || m.costo?.nombre || 'Sin asignar';
    if (!map[nombre]) map[nombre] = { nombre, total: 0, pagos: 0 };
    map[nombre].total += Number(m.monto) || 0;
    map[nombre].pagos += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export async function obtenerCostoProduccionPeriodo(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('lotes')
    .select(`
      id_lote, cantidad_total, costo_total_lote, fecha_produccion,
      productos(nombre_modelo, id_producto, id_categoria, categorias(nombre_categoria))
    `)
    .gte('fecha_produccion', fechaInicio + 'T00:00:00')
    .lte('fecha_produccion', fechaFin + 'T23:59:59')
    .order('fecha_produccion', { ascending: false });
  if (error) throw error;
  return data || [];
}
