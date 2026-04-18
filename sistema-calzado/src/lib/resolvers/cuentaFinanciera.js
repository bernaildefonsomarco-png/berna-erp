// src/lib/resolvers/cuentaFinanciera.js
// Suggests the working financial account based on context.

export function resolverCuentaFinanciera({
  tipo,             // row from tipos_movimiento_caja
  plantilla,        // row from plantillas_recurrentes or null
  cajaOrigenSugerida, // id of the active location's caja, or null
  cuentasFinancieras,
}) {
  if (plantilla?.id_cuenta_financiera_default) {
    return plantilla.id_cuenta_financiera_default;
  }
  if (tipo?.id_cuenta_financiera_default) {
    return tipo.id_cuenta_financiera_default;
  }
  if (cajaOrigenSugerida) return cajaOrigenSugerida;
  return cuentasFinancieras?.find((c) => c.activa)?.id_cuenta ?? null;
}
