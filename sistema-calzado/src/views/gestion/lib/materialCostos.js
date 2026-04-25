import { supabase } from '../../../api/supabase';

const SERIE_MAP = {
  grande: 'Grande',
  mediana: 'Mediana',
  pequena: 'Pequeña',
  pequeña: 'Pequeña',
  chica: 'Pequeña',
  Grande: 'Grande',
  Mediana: 'Mediana',
  Pequeña: 'Pequeña',
};

export function normalizarSerieMaterial(serie) {
  if (!serie) return null;
  return SERIE_MAP[String(serie).trim()] || null;
}

export function keyCostoMaterial(idProducto, idColor, serie) {
  return [Number(idProducto) || 0, Number(idColor) || 0, normalizarSerieMaterial(serie) || ''].join(':');
}

export function indexarCostosMateriales(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(
      keyCostoMaterial(row.id_producto, row.id_color, row.nombre_serie),
      Number(row.costo_materiales) || 0
    );
  });
  return map;
}

export function obtenerCostoMaterial(index, { idProducto, idColor, serie }) {
  if (!index) return 0;
  return Number(index.get(keyCostoMaterial(idProducto, idColor, serie))) || 0;
}

export async function listarCostosMaterialesModelo({
  idProducto = null,
  idColor = null,
  serie = null,
  soloActivos = false,
} = {}) {
  let query = supabase
    .from('v_costos_materiales_modelo')
    .select('*')
    .order('nombre_modelo', { ascending: true })
    .order('color', { ascending: true })
    .order('nombre_serie', { ascending: true });

  if (idProducto) query = query.eq('id_producto', idProducto);
  if (idColor) query = query.eq('id_color', idColor);
  if (serie) query = query.eq('nombre_serie', normalizarSerieMaterial(serie));
  if (soloActivos) query = query.eq('color_activo', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
