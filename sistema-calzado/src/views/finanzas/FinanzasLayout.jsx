import React, { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Icon, ICONS, Spinner } from './components/UI';
import { puedeVer, esAdmin, RECURSOS } from './lib/permisos';

const Dashboard = lazy(() => import('./views/Dashboard'));
const Cuentas = lazy(() => import('./views/Cuentas'));
const Deudas = lazy(() => import('./views/Deudas'));
const CostosFijos = lazy(() => import('./views/CostosFijos'));
const Movimientos = lazy(() => import('./views/Movimientos'));
const Transferencias = lazy(() => import('./views/Transferencias'));
const Configuracion = lazy(() => import('./views/Configuracion'));
const PersonasEquipo = lazy(() => import('./views/PersonasEquipo'));
const AjustesFinanzas = lazy(() => import('./views/AjustesFinanzas'));
const PlanCuentas = lazy(() => import('./views/PlanCuentas'));

/* ──────────────────────────────────────────────────────────────────────────
   FinanzasLayout
   ──────────────────────────────────────────────────────────────────────────
   Layout principal del módulo Finanzas. Sidebar fijo con navegación,
   contenido principal con routing anidado. Rutas absolutas para evitar
   acumulación de segmentos en la URL.
   ────────────────────────────────────────────────────────────────────────── */

const FIN_STYLES = `
.berna-fin,
.berna-fin *,
.berna-fin input,
.berna-fin select,
.berna-fin textarea,
.berna-fin button {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'ss01' !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.berna-fin { font-weight: 400; }
.berna-fin h1 { font-weight: 600; letter-spacing: -0.02em; }
.berna-fin h2 { font-weight: 600; letter-spacing: -0.01em; }
.berna-fin h3 { font-weight: 600; }
.berna-fin .fin-num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
`;

const NAV_ITEMS = [
  { path: '/finanzas/dashboard',      label: 'Dashboard',      icon: ICONS.dashboard, recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/cuentas',        label: 'Cuentas',        icon: ICONS.bank,      recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/deudas',         label: 'Deudas',         icon: ICONS.coins,     recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/costos',         label: 'Costos fijos',   icon: ICONS.document,  recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/movimientos',    label: 'Movimientos',    icon: ICONS.exchange,  recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/transferencias', label: 'Transferencias', icon: ICONS.refresh,   recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/plan-cuentas',   label: 'Plan de cuentas', icon: ICONS.trending,   recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/personas',       label: 'Equipo',         icon: ICONS.users,     recurso: RECURSOS.FINANZAS, adminOnly: true },
  { path: '/finanzas/ajustes',        label: 'Ajustes',        icon: ICONS.filter,    recurso: RECURSOS.FINANZAS, adminOnly: true },
  { path: '/finanzas/configuracion',  label: 'Configuración',  icon: ICONS.settings,  recurso: RECURSOS.FINANZAS },
];

export default function FinanzasLayout({ usuario, logout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/finanzas');
  };

  const sidebarWidth = collapsed ? 64 : 220;
  const visibleItems = NAV_ITEMS.filter(item => {
    if (!puedeVer(usuario, item.recurso)) return false;
    if (item.adminOnly && !esAdmin(usuario, RECURSOS.FINANZAS)) return false;
    return true;
  });

  return (
    <div className="berna-fin min-h-screen bg-[#fafaf9] text-[#1c1917]">
      <style>{FIN_STYLES}</style>

      {isDesktop && (
        <aside
          className="fixed top-0 left-0 h-screen z-40 flex flex-col transition-all duration-300 bg-white border-r border-[#e7e5e4]"
          style={{ width: sidebarWidth }}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-7 w-6 h-6 bg-white border border-[#e7e5e4] rounded-full flex items-center justify-center hover:bg-[#f5f5f4] z-50"
          >
            <Icon d={collapsed ? ICONS.chevronRight : 'M15 18l-6-6 6-6'} size={12} className="text-[#57534e]" />
          </button>

          <div className={`${collapsed ? 'px-3 pt-6 pb-8 text-center' : 'px-5 pt-6 pb-8'}`}>
            {collapsed ? (
              <div className="w-8 h-8 mx-auto rounded-lg bg-[#1c1917] flex items-center justify-center">
                <Icon d={ICONS.coins} size={16} className="text-white" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#1c1917] flex items-center justify-center flex-shrink-0">
                  <Icon d={ICONS.coins} size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.18em] uppercase text-[#a8a29e] leading-none mb-1" style={{ fontWeight: 500 }}>Berna</p>
                  <p className="text-sm text-[#1c1917] leading-none" style={{ fontWeight: 600 }}>Finanzas</p>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 px-2 space-y-0.5">
            {visibleItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : ''}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 rounded-lg transition-colors
                  ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
                  ${isActive
                    ? 'bg-[#1c1917] text-white'
                    : 'text-[#57534e] hover:text-[#1c1917] hover:bg-[#f5f5f4]'}`
                }
                style={({ isActive }) => ({ fontWeight: isActive ? 500 : 400 })}
              >
                <Icon d={item.icon} size={16} />
                {!collapsed && <span className="text-[13px]">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="px-2 pb-4">
            {!collapsed && (
              <div className="border-t border-[#f5f5f4] mx-2 pt-3 mb-2">
                <div className="px-2 py-1">
                  <p className="text-[11px] text-[#a8a29e]">Sesión activa</p>
                  <p className="text-xs text-[#1c1917]" style={{ fontWeight: 500 }}>{usuario?.nombre || 'Usuario'}</p>
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 rounded-lg text-[#57534e] hover:text-[#991b1b] hover:bg-[#fef2f2] transition-colors
                ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}`}
            >
              <Icon d={ICONS.logout} size={16} />
              {!collapsed && <span className="text-[13px]">Salir</span>}
            </button>
          </div>
        </aside>
      )}

      {!isDesktop && (
        <>
          <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-[#e7e5e4] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#1c1917] flex items-center justify-center">
                <Icon d={ICONS.coins} size={14} className="text-white" />
              </div>
              <p className="text-sm text-[#1c1917]" style={{ fontWeight: 600 }}>Finanzas</p>
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f5f5f4]">
              <Icon d={mobileMenuOpen ? ICONS.x : 'M3 12h18M3 6h18M3 18h18'} size={18} />
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="fixed inset-0 z-30 bg-black/40 pt-14" onClick={() => setMobileMenuOpen(false)}>
              <div className="bg-white border-t border-[#e7e5e4]" onClick={e => e.stopPropagation()}>
                <nav className="p-2">
                  {visibleItems.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `w-full flex items-center gap-3 rounded-lg px-3 py-3 transition-colors
                        ${isActive
                          ? 'bg-[#1c1917] text-white'
                          : 'text-[#57534e] hover:bg-[#f5f5f4]'}`
                      }
                    >
                      <Icon d={item.icon} size={18} />
                      <span className="text-sm" style={{ fontWeight: 500 }}>{item.label}</span>
                    </NavLink>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-[#991b1b] hover:bg-[#fef2f2] mt-2"
                  >
                    <Icon d={ICONS.logout} size={18} />
                    <span className="text-sm" style={{ fontWeight: 500 }}>Salir</span>
                  </button>
                </nav>
              </div>
            </div>
          )}
        </>
      )}

      <main
        className="transition-all duration-300"
        style={{
          marginLeft: isDesktop ? sidebarWidth : 0,
          paddingTop: isDesktop ? 0 : 56,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          }>
            <Routes>
              <Route index element={<Navigate to="/finanzas/dashboard" replace />} />
              <Route path="dashboard"      element={<Dashboard usuario={usuario} />} />
              <Route path="cuentas"        element={<Cuentas usuario={usuario} />} />
              <Route path="deudas"         element={<Deudas usuario={usuario} />} />
              <Route path="costos"         element={<CostosFijos usuario={usuario} />} />
              <Route path="movimientos"    element={<Movimientos usuario={usuario} />} />
              <Route path="transferencias" element={<Transferencias usuario={usuario} />} />
              <Route path="plan-cuentas"   element={<PlanCuentas usuario={usuario} />} />
              <Route path="personas"       element={<PersonasEquipo usuario={usuario} />} />
              <Route path="ajustes"        element={<AjustesFinanzas usuario={usuario} />} />
              <Route path="configuracion"  element={<Configuracion usuario={usuario} />} />
              <Route path="*" element={<Navigate to="/finanzas/dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}