export function emojiParaCategoria(cat) {
  return {
    ingreso: '💰',
    gasto_operativo: '💸',
    pago_personas: '👥',
    inversion: '🏗️',
    traslado: '🔁',
    pago_deuda: '💳',
    compra_material: '📦',
  }[cat] || '';
}

export function labelCategoria(cat) {
  return {
    ingreso: 'Entra dinero',
    gasto_operativo: 'Gasto operativo',
    pago_personas: 'Pago a personas',
    inversion: 'Inversión',
    traslado: 'Traslado / entre cuentas',
    pago_deuda: 'Pago deuda / financiero',
    compra_material: 'Compra de material',
  }[cat] || cat;
}

export function labelAmbito(ambito) {
  return {
    cualquier: 'Cualquier ubicación',
    tiendas: 'Solo tiendas',
    talleres: 'Solo fábrica / taller',
    especificas: 'Ubicaciones concretas',
  }[ambito] || ambito;
}

export function generarCodigo(nombre) {
  if (!nombre || !String(nombre).trim()) return '';
  return String(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Mapa a rol para RPC `fn_sugerir_cuenta_para_tipo` (reglas: *, Tienda, Fabrica, Administracion) */
export function rolParaSugerencia(ambito) {
  if (ambito === 'tiendas') return 'Tienda';
  if (ambito === 'talleres') return 'Fabrica';
  return '*';
}
