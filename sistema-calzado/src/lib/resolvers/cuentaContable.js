// src/lib/resolvers/cuentaContable.js
// Client-side mirror of fn_resolver_cuenta_contable — for preview in QuickEntry.
// Authority is the backend: on submit, the RPC may return a different account
// if mapeo_tipo_cuenta changed between render and submit.

export function resolverCuentaContable({
  tipo,              // row from tipos_movimiento_caja (with id_cuenta_contable_default)
  ubicacion,         // row from ubicaciones (with rol) or null
  plantilla,         // row from plantillas_recurrentes (with id_cuenta_contable) or null
  mapeos,            // array of mapeo_tipo_cuenta rows
}) {
  if (plantilla?.id_cuenta_contable) return plantilla.id_cuenta_contable;

  const rol = ubicacion?.rol;
  if (rol) {
    const porRol = mapeos.find(
      (m) => m.id_tipo === tipo.id_tipo && m.ubicacion_rol === rol && m.activo
    );
    if (porRol) return porRol.id_cuenta_contable;
  }

  const wildcard = mapeos.find(
    (m) => m.id_tipo === tipo.id_tipo && m.ubicacion_rol === '*' && m.activo
  );
  if (wildcard) return wildcard.id_cuenta_contable;

  return tipo.id_cuenta_contable_default ?? null;
}
