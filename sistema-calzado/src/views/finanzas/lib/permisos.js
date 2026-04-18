/* ──────────────────────────────────────────────────────────────────────────
   FINANZAS · LIB · PERMISOS
   ──────────────────────────────────────────────────────────────────────────
   Helpers para verificar permisos del usuario actual sobre recursos.
   Los permisos vienen de la tabla permisos_persona (cargados en el login).
   ────────────────────────────────────────────────────────────────────────── */

const NIVELES_JERARQUIA = {
  ninguno:    0,
  ver:        1,
  registrar:  2,
  editar:     3,
  admin:      4,
};

export function tienePermiso(usuario, recurso, nivelMinimo = 'ver') {
  if (!usuario || !usuario.permisos) return false;
  const permiso = usuario.permisos.find(p => p.recurso === recurso && p.activo);
  if (!permiso) return false;
  const tieneNivel = NIVELES_JERARQUIA[permiso.nivel_acceso] || 0;
  const requeridoNivel = NIVELES_JERARQUIA[nivelMinimo] || 0;
  return tieneNivel >= requeridoNivel;
}

export function puedeVer(usuario, recurso) {
  return tienePermiso(usuario, recurso, 'ver');
}

export function puedeRegistrar(usuario, recurso) {
  return tienePermiso(usuario, recurso, 'registrar');
}

export function puedeEditar(usuario, recurso) {
  return tienePermiso(usuario, recurso, 'editar');
}

export function esAdmin(usuario, recurso) {
  return tienePermiso(usuario, recurso, 'admin');
}

export function nivelMaximo(usuario, recurso) {
  if (!usuario || !usuario.permisos) return 'ninguno';
  const permiso = usuario.permisos.find(p => p.recurso === recurso && p.activo);
  return permiso ? permiso.nivel_acceso : 'ninguno';
}

export const RECURSOS = {
  FINANZAS:       'finanzas',
  CUENTAS:        'cuentas',
  DEUDAS:         'deudas',
  COSTOS_FIJOS:   'costos_fijos',
  MOVIMIENTOS:    'movimientos',
  TRANSFERENCIAS: 'transferencias',
  CONFIGURACION:  'configuracion',
  COMANDO:        'comando',
  CIERRES:        'cierres',
};

export function puedeVerCierres(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'ver');
}

export function puedeCerrar(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'admin');
}

export function puedeReabrir(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'admin');
}