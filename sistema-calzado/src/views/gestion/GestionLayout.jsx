import React, { useState, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Icon, ICONS, Spinner } from './components/UI';
import { Button, Separator, Sheet, SheetContent, SheetHeader, SheetTitle } from './components/shadcn';
import { puedeVerCierres } from './lib/permisos';
import BannerCierrePendiente from './components/BannerCierrePendiente';
import HeaderGlobal from './components/HeaderGlobal';
import SidebarGestion from './components/SidebarGestion';
import PlaceholderModuloFase2 from './components/PlaceholderModuloFase2';
import './gestionShell.css';

const Dashboard = lazy(() => import('./views/Dashboard'));
const EstadoResultados = lazy(() => import('./views/EstadoResultados'));
const Cuentas = lazy(() => import('./views/Cuentas'));
const Deudas = lazy(() => import('./views/Deudas'));
const Trabajadores = lazy(() => import('./views/Trabajadores'));
const Movimientos = lazy(() => import('./views/Movimientos'));
const Transferencias = lazy(() => import('./views/Transferencias'));
const Equipo = lazy(() => import('./views/Equipo'));
const PlanCuentas = lazy(() => import('./views/PlanCuentas'));
const Ubicaciones = lazy(() => import('./views/Ubicaciones'));
const HubUbicacion = lazy(() => import('./views/HubUbicacion'));
const CierresPeriodo = lazy(() => import('./views/CierresPeriodo'));
const CierreWizard = lazy(() => import('./views/cierres/CierreWizard'));
const CatalogoAdmin = lazy(() => import('./views/admin/CatalogoAdmin'));
const EstructuraFinanciera = lazy(() => import('./views/EstructuraFinanciera'));

/* ──────────────────────────────────────────────────────────────────────────
   GestionLayout — workspace “Gestión Empresarial” (antes Finanzas)
   ────────────────────────────────────────────────────────────────────────── */

const SHELL_STYLES = `
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

const SB_W = 260;

function CierreWizardRoute({ usuario }) {
  const { year, month } = useParams();
  return <CierreWizard usuario={usuario} year={year} month={month} />;
}

export default function GestionLayout({ usuario, logout }) {
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
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
    navigate('/gestion');
  };

  const aside = (
    <div className="flex h-full min-h-0 flex-col border-r border-sidebar-border bg-[#0c0a09] text-stone-200">
      <div className="shrink-0 border-b border-stone-800 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-700">
            <Icon d={ICONS.coins} size={16} className="text-stone-100" />
          </div>
          <div>
            <p className="mb-0.5 text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-stone-500">Berna</p>
            <p className="text-sm font-semibold leading-none text-stone-100">Gestión</p>
          </div>
        </div>
      </div>
      <SidebarGestion usuario={usuario} />
      <div className="mt-auto shrink-0 border-t border-stone-800 p-2">
        <div className="px-2 py-1">
          <p className="text-[11px] text-stone-500">Sesión</p>
          <p className="truncate text-xs text-stone-200" style={{ fontWeight: 500 }}>
            {usuario?.nombre || 'Usuario'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={handleLogout}
          className="h-auto w-full justify-start gap-2 rounded-lg px-2 py-2 text-stone-400 hover:bg-stone-800 hover:text-red-300"
        >
          <Icon d={ICONS.logout} size={16} />
          <span className="text-[13px]">Salir</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="berna-fin min-h-screen bg-background text-foreground font-sans antialiased">
      <style>{SHELL_STYLES}</style>
      <div className="flex min-h-screen flex-col">
        <HeaderGlobal
          usuario={usuario}
          onOpenRegistrar={() => setRegistrarOpen(true)}
          onOpenMobileMenu={!isDesktop ? () => setMobileMenuOpen(true) : undefined}
        />

        <div className="flex min-h-0 flex-1">
          {isDesktop && (
            <aside className="z-30 flex w-[260px] shrink-0 flex-col" style={{ width: SB_W }}>
              {aside}
            </aside>
          )}

          {!isDesktop && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetContent side="left" className="w-[min(100%,20rem)] gap-0 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navegación</SheetTitle>
                </SheetHeader>
                <div className="h-full max-h-[100dvh] overflow-y-auto">{aside}</div>
              </SheetContent>
            </Sheet>
          )}

          <main className="min-w-0 flex-1">
            <BannerCierrePendiente usuario={usuario} />
            <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <Spinner size={24} />
                  </div>
                }
              >
                <Routes>
                  <Route index element={<Navigate to="/gestion/resumen" replace />} />
                  <Route
                    path="resumen"
                    element={
                      <PlaceholderModuloFase2
                        titulo="Resumen ejecutivo"
                        descripcion="Vista resumida en preparación (plan Fase 2.06). Mientras tanto, usa Estado de resultados o el panel de flujo de caja."
                        enlaceTo="/gestion/estado-resultados"
                        enlaceLabel="Ir a Estado de resultados"
                      />
                    }
                  />
                  <Route path="estado-resultados" element={<EstadoResultados usuario={usuario} />} />
                  <Route path="dashboard" element={<Dashboard usuario={usuario} />} />
                  <Route path="patrimonio" element={<Navigate to="/gestion/dashboard" replace />} />
                  <Route path="cuentas" element={<Cuentas usuario={usuario} />} />
                  <Route path="deudas" element={<Deudas usuario={usuario} />} />
                  <Route path="estructura-financiera" element={<EstructuraFinanciera usuario={usuario} />} />
                  <Route path="costos" element={<Navigate to="/gestion/estructura-financiera" replace />} />
                  <Route path="costos-fijos" element={<Navigate to="/gestion/estructura-financiera" replace />} />
                  <Route path="trabajadores" element={<Trabajadores usuario={usuario} />} />
                  <Route path="movimientos" element={<Movimientos usuario={usuario} />} />
                  <Route path="transferencias" element={<Transferencias usuario={usuario} />} />
                  <Route path="plan-cuentas" element={<PlanCuentas usuario={usuario} />} />
                  <Route path="ubicaciones" element={<Ubicaciones usuario={usuario} />} />
                  <Route path="ubicaciones/:idUbicacion" element={<HubUbicacion usuario={usuario} />} />
                  <Route path="equipo" element={<Equipo usuario={usuario} />} />
                  <Route
                    path="cierres"
                    element={puedeVerCierres(usuario) ? <CierresPeriodo usuario={usuario} /> : <Navigate to="/gestion/estado-resultados" replace />}
                  />
                  <Route
                    path="cierres/:year/:month"
                    element={puedeVerCierres(usuario) ? <CierreWizardRoute usuario={usuario} /> : <Navigate to="/gestion/estado-resultados" replace />}
                  />
                  <Route path="catalogo" element={<CatalogoAdmin />} />
                  <Route path="obligaciones" element={<PlaceholderModuloFase2 titulo="Obligaciones recurrentes" descripcion="Módulo en preparación (plan Fase 2.04)." enlaceTo="/gestion/estado-resultados" enlaceLabel="Volver" />} />
                  <Route path="nomina" element={<PlaceholderModuloFase2 titulo="Nómina" descripcion="En preparación. Los salarios y contratos se gestionan hoy en Trabajadores." enlaceTo="/gestion/trabajadores" enlaceLabel="Ir a Trabajadores" />} />
                  <Route path="organigrama" element={<PlaceholderModuloFase2 titulo="Organigrama" descripcion="Vista de organigrama en preparación (Fase 2+)." />} />
                  <Route path="activos" element={<PlaceholderModuloFase2 titulo="Activos fijos" descripcion="En preparación (plan Fase 2.09)." />} />
                  <Route path="contratos" element={<PlaceholderModuloFase2 titulo="Contratos" descripcion="En preparación (plan Fase 2.09)." />} />
                  <Route path="depreciacion" element={<PlaceholderModuloFase2 titulo="Depreciación" descripcion="En preparación (plan Fase 2.09)." />} />
                  <Route path="config/empresa" element={<PlaceholderModuloFase2 titulo="Empresa" descripcion="Ajustes de empresa en preparación. Usuarios y permisos en Equipo." enlaceTo="/gestion/equipo" enlaceLabel="Equipo" />} />
                  <Route path="config/tipos-movimiento" element={<Navigate to="/gestion/catalogo?tab=tipos" replace />} />
                  <Route path="config/mapeos" element={<Navigate to="/gestion/catalogo?tab=mapeo" replace />} />
                  <Route path="config/catalogos" element={<Navigate to="/gestion/catalogo" replace />} />
                  <Route path="config/permisos" element={<Navigate to="/gestion/equipo" replace />} />
                  <Route path="personas" element={<Navigate to="/gestion/equipo" replace />} />
                  <Route path="ajustes" element={<Navigate to="/gestion/equipo" replace />} />
                  <Route path="configuracion" element={<Navigate to="/gestion/equipo" replace />} />
                  <Route path="*" element={<Navigate to="/gestion/resumen" replace />} />
                </Routes>
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {registrarOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registrar-titulo"
        >
          <div className="max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h2 id="registrar-titulo" className="text-lg font-semibold text-foreground">
              Registrar
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              El acceso rápido para registrar movimientos se conectará aquí (plan Fase 2.08).
            </p>
            <Button type="button" className="mt-4 w-full" onClick={() => setRegistrarOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
