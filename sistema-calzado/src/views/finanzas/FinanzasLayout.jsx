import React, { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Icon, ICONS, Spinner } from './components/UI';
import { Button, Separator, Sheet, SheetContent, SheetHeader, SheetTitle } from './components/shadcn';
import { puedeVer, esAdmin, RECURSOS, puedeVerCierres } from './lib/permisos';
import BannerCierrePendiente from './components/BannerCierrePendiente';

const Dashboard = lazy(() => import('./views/Dashboard'));
const EstadoResultados = lazy(() => import('./views/EstadoResultados'));
const Cuentas = lazy(() => import('./views/Cuentas'));
const Deudas = lazy(() => import('./views/Deudas'));
const Trabajadores = lazy(() => import('./views/Trabajadores'));
const Movimientos = lazy(() => import('./views/Movimientos'));
const Transferencias = lazy(() => import('./views/Transferencias'));
const Equipo = lazy(() => import('./views/Equipo'));
const PlanCuentas = lazy(() => import('./views/PlanCuentas'));
const Ubicaciones   = lazy(() => import('./views/Ubicaciones'));
const HubUbicacion  = lazy(() => import('./views/HubUbicacion'));
const CierresPeriodo = lazy(() => import('./views/CierresPeriodo'));
const CierreWizard   = lazy(() => import('./views/cierres/CierreWizard'));

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
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif !important;
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
  { path: '/finanzas/estado-resultados', label: 'Estado de Result.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/dashboard',         label: 'Dashboard',         icon: ICONS.dashboard, recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/cierres',           label: 'Cierres',           icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', recurso: RECURSOS.CIERRES },
  { path: '/finanzas/cuentas',           label: 'Cuentas',           icon: ICONS.bank,      recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/deudas',            label: 'Deudas',            icon: ICONS.coins,     recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/trabajadores',      label: 'Trabajadores',      icon: ICONS.users,     recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/movimientos',       label: 'Movimientos',       icon: ICONS.exchange,  recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/transferencias',    label: 'Transferencias',    icon: ICONS.refresh,   recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/plan-cuentas',      label: 'Plan de cuentas',   icon: ICONS.trending,  recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/ubicaciones',        label: 'Tiendas y Talleres',icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', recurso: RECURSOS.FINANZAS },
  { path: '/finanzas/equipo',            label: 'Equipo',            icon: ICONS.settings,  recurso: RECURSOS.FINANZAS, adminOnly: true },
];

function CierreWizardRoute({ usuario }) {
  const { year, month } = useParams();
  return <CierreWizard usuario={usuario} year={year} month={month} />;
}

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
    if (item.recurso === RECURSOS.CIERRES) return puedeVerCierres(usuario);
    if (!puedeVer(usuario, item.recurso)) return false;
    if (item.adminOnly && !esAdmin(usuario, RECURSOS.FINANZAS)) return false;
    return true;
  });

  return (
    <div className="berna-fin min-h-screen bg-background text-foreground font-sans antialiased">
      <style>{FIN_STYLES}</style>

      {isDesktop && (
        <aside
          className="fixed top-0 left-0 h-screen z-40 flex flex-col transition-all duration-300 bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
          style={{ width: sidebarWidth }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-7 z-50 size-6 rounded-full border-sidebar-border bg-sidebar shadow-sm"
          >
            <Icon d={collapsed ? ICONS.chevronRight : 'M15 18l-6-6 6-6'} size={12} className="text-muted-foreground" />
          </Button>

          <div className={`${collapsed ? 'px-3 pt-6 pb-8 text-center' : 'px-5 pt-6 pb-8'}`}>
            {collapsed ? (
              <div className="mx-auto flex size-8 items-center justify-center rounded-lg bg-sidebar-primary">
                <Icon d={ICONS.coins} size={16} className="text-sidebar-primary-foreground" />
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Icon d={ICONS.coins} size={16} className="text-sidebar-primary-foreground" />
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-muted-foreground">Berna</p>
                  <p className="text-sm font-semibold leading-none text-sidebar-foreground">Finanzas</p>
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
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'}`
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
              <div className="mx-2 mb-2 pt-3">
                <Separator className="mb-3 bg-sidebar-border" />
                <div className="px-2 py-1">
                  <p className="text-[11px] text-muted-foreground">Sesión activa</p>
                  <p className="text-xs text-foreground" style={{ fontWeight: 500 }}>{usuario?.nombre || 'Usuario'}</p>
                </div>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={handleLogout}
              className={`w-full h-auto rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10
                ${collapsed ? 'justify-center px-2 py-2.5' : 'justify-start px-3 py-2'}`}
            >
              <Icon d={ICONS.logout} size={16} />
              {!collapsed && <span className="text-[13px]">Salir</span>}
            </Button>
          </div>
        </aside>
      )}

      {!isDesktop && (
        <>
          <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
                <Icon d={ICONS.coins} size={14} className="text-primary-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">Finanzas</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              <Icon d={mobileMenuOpen ? ICONS.x : 'M3 12h18M3 6h18M3 18h18'} size={18} />
            </Button>
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="w-[min(100%,20rem)] gap-0 p-0 pt-14">
              <SheetHeader className="sr-only">
                <SheetTitle>Navegación Finanzas</SheetTitle>
              </SheetHeader>
              <nav className="p-2">
                {visibleItems.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors
                      ${isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
                    }
                  >
                    <Icon d={item.icon} size={18} />
                    <span className="text-sm" style={{ fontWeight: 500 }}>{item.label}</span>
                  </NavLink>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleLogout}
                  className="mt-2 h-auto w-full justify-start gap-3 px-3 py-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Icon d={ICONS.logout} size={18} />
                  <span className="text-sm" style={{ fontWeight: 500 }}>Salir</span>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </>
      )}

      <main
        className="transition-all duration-300"
        style={{
          marginLeft: isDesktop ? sidebarWidth : 0,
          paddingTop: isDesktop ? 0 : 56,
        }}
      >
        <BannerCierrePendiente usuario={usuario} />
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          }>
            <Routes>
              <Route index element={<Navigate to="/finanzas/estado-resultados" replace />} />
              <Route path="estado-resultados" element={<EstadoResultados usuario={usuario} />} />
              <Route path="dashboard"         element={<Dashboard      usuario={usuario} />} />
              <Route path="cuentas"           element={<Cuentas        usuario={usuario} />} />
              <Route path="deudas"            element={<Deudas         usuario={usuario} />} />
              <Route path="costos"            element={<Navigate to="/finanzas/trabajadores" replace />} />
              <Route path="trabajadores"      element={<Trabajadores   usuario={usuario} />} />
              <Route path="movimientos"       element={<Movimientos    usuario={usuario} />} />
              <Route path="transferencias"    element={<Transferencias usuario={usuario} />} />
              <Route path="plan-cuentas"      element={<PlanCuentas    usuario={usuario} />} />
              <Route path="ubicaciones"           element={<Ubicaciones    usuario={usuario} />} />
              <Route path="ubicaciones/:idUbicacion" element={<HubUbicacion usuario={usuario} />} />
              <Route path="equipo"            element={<Equipo         usuario={usuario} />} />
              <Route path="cierres"                element={<CierresPeriodo usuario={usuario} />} />
              <Route path="cierres/:year/:month"   element={<CierreWizardRoute usuario={usuario} />} />
              {/* Legacy redirects */}
              <Route path="personas"          element={<Navigate to="/finanzas/equipo" replace />} />
              <Route path="ajustes"           element={<Navigate to="/finanzas/equipo" replace />} />
              <Route path="configuracion"     element={<Navigate to="/finanzas/equipo" replace />} />
              <Route path="*" element={<Navigate to="/finanzas/estado-resultados" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}