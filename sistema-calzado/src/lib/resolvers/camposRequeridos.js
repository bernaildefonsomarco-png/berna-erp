// src/lib/resolvers/camposRequeridos.js
// Reads tipo.campos_requeridos (jsonb) and normalizes for dynamic rendering.

const CAMPO_BASE_MONTO = {
  key: 'monto',
  label: 'Monto',
  tipo: 'numero',
  requerido: true,
};

export function resolverCamposRequeridos(tipo) {
  const custom = Array.isArray(tipo?.campos_requeridos) ? tipo.campos_requeridos : [];
  const tieneMonto = custom.some((c) => c.key === 'monto');
  const campos = tieneMonto ? custom : [CAMPO_BASE_MONTO, ...custom];
  return campos.map((c) => ({
    key: c.key,
    label: c.label || c.key,
    tipo: c.tipo || 'texto',
    requerido: c.requerido ?? true,
    opciones: c.opciones || null,
    min: c.min ?? null,
    max: c.max ?? null,
  }));
}
