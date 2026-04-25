import { NavLink } from 'react-router-dom';
import { tienePermiso, RECURSOS, esAdmin } from '../lib/permisos';

const NAV_GROUPS = [
  {
    title: null,
    items: [
      { to: '/gestion/resumen', label: 'Resumen Ejecutivo', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/gestion/estado-resultados', label: 'Estado de Resultados', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/dashboard', label: 'Flujo de caja', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/patrimonio', label: 'Patrimonio', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/cuentas', label: 'Cuentas', recurso: RECURSOS.CUENTAS, nivel: 'ver' },
      { to: '/gestion/deudas', label: 'Deudas', recurso: RECURSOS.DEUDAS, nivel: 'ver' },
      { to: '/gestion/movimientos', label: 'Movimientos', recurso: RECURSOS.MOVIMIENTOS, nivel: 'ver' },
      { to: '/gestion/transferencias', label: 'Transferencias', recurso: RECURSOS.TRANSFERENCIAS, nivel: 'ver' },
      { to: '/gestion/estructura-financiera', label: 'Estructura financiera', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/obligaciones', label: 'Obligaciones recurrentes', recurso: RECURSOS.OBLIGACIONES, nivel: 'ver' },
    ],
  },
  {
    title: 'Personal',
    items: [
      { to: '/gestion/trabajadores', label: 'Trabajadores', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/nomina', label: 'Nómina', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/organigrama', label: 'Organigrama', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
    ],
  },
  {
    title: 'Activos y contratos',
    items: [
      { to: '/gestion/activos', label: 'Activos fijos', recurso: RECURSOS.ACTIVOS, nivel: 'ver' },
      { to: '/gestion/contratos', label: 'Contratos', recurso: RECURSOS.ACTIVOS, nivel: 'ver' },
      { to: '/gestion/depreciacion', label: 'Depreciación', recurso: RECURSOS.ACTIVOS, nivel: 'ver' },
    ],
  },
  {
    title: 'Ubicaciones',
    items: [
      { to: '/gestion/ubicaciones', label: 'Tiendas y Talleres', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/', label: '→ Operaciones (tienda)', external: true, recurso: RECURSOS.FINANZAS, nivel: 'ver' },
    ],
  },
  {
    title: null,
    items: [
      { to: '/gestion/cierres', label: 'Cierres contables', recurso: RECURSOS.CIERRES, nivel: 'ver' },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { to: '/gestion/config/empresa', label: 'Empresa', recurso: RECURSOS.CONFIGURACION, nivel: 'admin' },
      { to: '/gestion/plan-cuentas', label: 'Plan de cuentas', recurso: RECURSOS.FINANZAS, nivel: 'ver' },
      { to: '/gestion/config/tipos-movimiento', label: 'Tipos de movimiento', recurso: RECURSOS.CONFIGURACION, nivel: 'admin' },
      { to: '/gestion/config/mapeos', label: 'Mapeos contables', recurso: RECURSOS.CONFIGURACION, nivel: 'admin' },
      { to: '/gestion/config/catalogos', label: 'Catálogos del sistema', recurso: RECURSOS.CONFIGURACION, nivel: 'admin' },
      { to: '/gestion/config/permisos', label: 'Permisos y roles', recurso: RECURSOS.CONFIGURACION, nivel: 'admin' },
      { to: '/gestion/equipo', label: 'Equipo (usuarios admin)', recurso: RECURSOS.FINANZAS, nivel: 'admin' },
      { to: '/gestion/catalogo', label: 'Catálogo (admin)', recurso: RECURSOS.FINANZAS, nivel: 'admin' },
    ],
  },
];

function itemVisible(usuario, it) {
  if (it.adminOnly) return esAdmin(usuario, RECURSOS.FINANZAS);
  if (!it.recurso) return true;
  return tienePermiso(usuario, it.recurso, it.nivel || 'ver');
}

function NavItem({ it }) {
  const cls = ({ isActive }) => `gestion-nav-item ${isActive ? 'active' : ''}`;

  if (it.external) {
    return (
      <a href={it.to} className="gestion-nav-item">
        {it.label}
      </a>
    );
  }

  return (
    <NavLink to={it.to} className={cls}>
      {it.label}
    </NavLink>
  );
}

export default function SidebarGestion({ usuario }) {
  return (
    <nav className="gestion-sidebar-nav" aria-label="Navegación principal">
      {NAV_GROUPS.map((group, idx) => {
        const visibleItems = group.items.filter((it) => itemVisible(usuario, it));
        if (visibleItems.length === 0) return null;
        return (
          <div key={idx} className="gestion-nav-group">
            {group.title && <div className="gestion-nav-group-title">{group.title}</div>}
            {visibleItems.map((it) => (
              <NavItem key={it.to + it.label} it={it} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
