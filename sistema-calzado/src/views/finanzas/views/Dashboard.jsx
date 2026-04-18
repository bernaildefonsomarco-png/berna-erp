import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  obtenerFlujoCajaDiario,
  obtenerFlujoCajaMensual,
  obtenerPatrimonioTotales,
  obtenerPatrimonioDetalle,
  obtenerObligacionesProximas,
} from '../api/dashboardClient';
import { formatMoney } from '../lib/calculos';
import { puedeVer, esAdmin } from '../lib/permisos';
import { EmptyState, LoadingState, PageHeader, Icon, ICONS } from '../components/UI';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/shadcn';
import { Button } from '../components/shadcn';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import ChartContainer from '../components/charts/ChartContainer';
import KpiCard from '../components/charts/KpiCard';
import BarChartFlujo from '../components/charts/BarChartFlujo';
import { CHART_COLORS } from '../components/charts/colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodoDates(periodo) {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  if (periodo === 'mes_actual')   return [fmtDate(new Date(y, m, 1)),          fmtDate(new Date(y, m + 1, 0))];
  if (periodo === 'mes_anterior') return [fmtDate(new Date(y, m - 1, 1)),      fmtDate(new Date(y, m, 0))];
  if (periodo === 'ultimos_30') {
    const ini = new Date(); ini.setDate(ini.getDate() - 29);
    return [fmtDate(ini), fmtDate(new Date())];
  }
  const trimStart = Math.floor(m / 3) * 3;
  return [fmtDate(new Date(y, trimStart, 1)), fmtDate(new Date(y, trimStart + 3, 0))];
}
function fmtDate(d) { return d.toISOString().slice(0, 10); }

const fmtPEN = (v) =>
  'S/ ' + Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PERIODOS = [
  { value: 'mes_actual',       label: 'Este mes' },
  { value: 'mes_anterior',     label: 'Mes anterior' },
  { value: 'ultimos_30',       label: 'Últimos 30 días' },
  { value: 'trimestre_actual', label: 'Este trimestre' },
];

const TABS = [
  { value: 'flujo',      label: 'Flujo de caja' },
  { value: 'patrimonio', label: 'Patrimonio' },
];

const PL_LABELS = {
  ingresos:           'Ingresos',
  costo_ventas:       'Costo de ventas',
  gastos_operativos:  'Gastos operativos',
  gastos_financieros: 'Gastos financieros',
  otros_egresos:      'Otros egresos',
};

const TIENDA_COLORS = ['#1c1917', '#d97706', '#0369a1', '#15803d', '#9333ea'];

const LS_TAB     = 'finanzas.dashboard.tab';
const LS_PERIODO = 'finanzas.dashboard.periodo';

// ─── Estilos compartidos de tabla ─────────────────────────────────────────────

const thCls = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
const thRCls = thCls + ' text-right';
const tdCls  = 'px-4 py-2.5 text-sm text-foreground';
const tdRCls = 'px-4 py-2.5 text-sm text-right tabular-nums';

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Dashboard({ usuario }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(
    () => searchParams.get('tab') || localStorage.getItem(LS_TAB) || 'resumen'
  );
  const [periodo, setPeriodo] = useState(
    () => localStorage.getItem(LS_PERIODO) || 'mes_actual'
  );

  const [flujoData,  setFlujoData]  = useState({ mensual: [], diario: [], loading: false, error: null });
  const [patriData,  setPatriData]  = useState({ totales: null, detalle: [], obligaciones: [], loading: false, error: null });

  useEffect(() => {
    localStorage.setItem(LS_TAB, tab);
    setSearchParams({ tab }, { replace: true });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem(LS_PERIODO, periodo); }, [periodo]);

  const cargarFlujo = useCallback(async () => {
    const [ini, fin] = getPeriodoDates(periodo);
    setFlujoData(p => ({ ...p, loading: true, error: null }));
    try {
      const [diario, mensual] = await Promise.all([
        obtenerFlujoCajaDiario(ini, fin), obtenerFlujoCajaMensual(12),
      ]);
      setFlujoData({ diario, mensual, loading: false, error: null });
    } catch (e) { setFlujoData(p => ({ ...p, loading: false, error: e.message })); }
  }, [periodo]);

  const cargarPatrimonio = useCallback(async () => {
    setPatriData(p => ({ ...p, loading: true, error: null }));
    try {
      const [totales, detalle, obligaciones] = await Promise.all([
        obtenerPatrimonioTotales(), obtenerPatrimonioDetalle(), obtenerObligacionesProximas(),
      ]);
      setPatriData({ totales, detalle, obligaciones, loading: false, error: null });
    } catch (e) { setPatriData(p => ({ ...p, loading: false, error: e.message })); }
  }, []);

  useEffect(() => { if (tab === 'flujo')      cargarFlujo();      }, [tab, cargarFlujo]);
  useEffect(() => { if (tab === 'patrimonio') cargarPatrimonio(); }, [tab, cargarPatrimonio]);

  if (!puedeVer(usuario, 'finanzas')) {
    return <EmptyState title="Sin acceso" description="No tienes permiso para ver el módulo de Finanzas." />;
  }

  const showPeriodo = tab === 'flujo';

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Flujo de caja y posición patrimonial del negocio." />

      {/* Banner Estado de Resultados */}
      <Link
        to="/finanzas/estado-resultados"
        className="flex items-center justify-between p-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={17} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Estado de Resultados — Análisis BI completo</p>
            <p className="text-xs text-indigo-700">P&L interactivo con drill-down por ventas, costos, gastos y personal</p>
          </div>
        </div>
        <Icon d={ICONS.arrowRight} size={16} className="text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
      </Link>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            {TABS.map(t => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          {showPeriodo && (
            <div className="flex flex-wrap gap-1.5">
              {PERIODOS.map(p => (
                <Button
                  key={p.value}
                  variant={periodo === p.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPeriodo(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <TabsContent value="flujo"      className="mt-6"><TabFlujo      data={flujoData} /></TabsContent>
        <TabsContent value="patrimonio" className="mt-6">
          {esAdmin(usuario, 'finanzas')
            ? <TabPatrimonio data={patriData} />
            : <EmptyState title="Sin acceso" description="Solo administradores pueden ver el patrimonio." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tarjeta de sección (reemplaza bg-white border) ───────────────────────────

function SectionCard({ title, action, children, className = '' }) {
  return (
    <div className={cn('overflow-hidden rounded-xl bg-card ring-1 ring-border', className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {action}
        </div>
      )}
      <div className={title ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

// ─── (TabResumen y TabVentas movidos a EstadoResultados) ─────────────────────

function _unused_TabResumen({ data }) {
  const { rows, loading, error } = data;

  const bySeccion    = Object.fromEntries(rows.map(r => [r.seccion_pl, Number(r.monto_total)]));
  const ingresos     = bySeccion['ingresos']           || 0;
  const costoVentas  = bySeccion['costo_ventas']       || 0;
  const gastosOp     = bySeccion['gastos_operativos']  || 0;
  const gastosFinan  = bySeccion['gastos_financieros'] || 0;
  const totalEgresos = costoVentas + gastosOp + gastosFinan + (bySeccion['otros_egresos'] || 0);
  const utilidad     = ingresos - totalEgresos;
  const margen       = ingresos > 0 ? (utilidad / ingresos) * 100 : 0;
  const empty        = !loading && !error && rows.length === 0;
  const pct = (v) => ingresos > 0 ? ((Math.abs(v) / ingresos) * 100).toFixed(1) + '%' : '—';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Ingresos"       value={ingresos}     color="green"                             loading={loading} />
        <KpiCard label="Gastos totales" value={totalEgresos} color="red"                               loading={loading} />
        <KpiCard label="Utilidad neta"  value={utilidad}     color={utilidad >= 0 ? 'green' : 'red'}   loading={loading} />
        <div className="flex flex-col gap-2 rounded-xl bg-card ring-1 ring-border px-5 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Margen neto</span>
          {loading
            ? <Skeleton className="mt-1 h-8 w-20" />
            : <span className={cn('text-2xl font-semibold tabular-nums tracking-tight', margen >= 0 ? 'text-green-700' : 'text-red-700')}>
                {margen.toFixed(1)}%
              </span>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title="Distribución de egresos" className="p-4">
          <ChartContainer loading={loading} empty={empty} error={error} label="P&L">
            <PieChartPL data={rows} height={260} />
          </ChartContainer>
        </SectionCard>

        {!loading && !empty && !error && (
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border self-start">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={thCls}>Sección</th>
                  <th className={thRCls}>Monto</th>
                  <th className={thRCls}>% ing.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.seccion_pl} className="border-b border-border/50 last:border-0">
                    <td className={tdCls}>{PL_LABELS[row.seccion_pl] || row.seccion_pl}</td>
                    <td className={cn(tdRCls, 'font-medium', row.seccion_pl === 'ingresos' ? 'text-green-700' : 'text-red-700')}>
                      {formatMoney(row.monto_total)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {pct(row.monto_total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/40">
                  <td className="px-4 py-2.5 font-semibold text-foreground" colSpan={1}>Utilidad neta</td>
                  <td className={cn(tdRCls, 'font-bold', utilidad >= 0 ? 'text-green-700' : 'text-red-700')}>
                    {formatMoney(utilidad)}
                  </td>
                  <td className={cn('px-4 py-2.5 text-right text-xs tabular-nums font-semibold', margen >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {margen.toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function _unused_TabVentas({ data }) {
  const { resumen, tiendas, metodos, modelos, diasSemana, loading, error } = data;
  const empty = !loading && !error && tiendas.length === 0 && modelos.length === 0;

  if (error) return <EmptyState title="Error al cargar" description={error} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Ventas totales"  value={resumen?.total}  color="green"   loading={loading} />
        <div className="flex flex-col gap-2 rounded-xl bg-card ring-1 ring-border px-5 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">N° de ventas</span>
          {loading
            ? <Skeleton className="mt-1 h-8 w-16" />
            : <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">{resumen?.cantidad ?? 0}</span>
          }
        </div>
        <KpiCard label="Ticket promedio" value={resumen?.ticket} color="neutral" loading={loading} />
      </div>

      {/* Ventas por tienda */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border p-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Ventas por tienda</h3>
        {loading ? <Skeleton className="h-52 w-full rounded-lg" />
          : tiendas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin ventas en el período</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tiendas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.borde} vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} width={48} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [fmtPEN(v), 'Total ventas']}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {tiendas.map((_, i) => <Cell key={i} fill={TIENDA_COLORS[i % TIENDA_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <table className="mt-4 w-full border-t border-border/50 text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>Tienda</th>
                    <th className={thRCls}>Total</th>
                    <th className={thRCls}>Ventas</th>
                    <th className={thRCls}>Ticket prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {tiendas.map((t, i) => (
                    <tr key={t.id_ubicacion} className="border-t border-border/40">
                      <td className={cn(tdCls, 'flex items-center gap-2')}>
                        <span className="inline-block size-2.5 rounded-full shrink-0" style={{ background: TIENDA_COLORS[i % TIENDA_COLORS.length] }} />
                        {t.nombre}
                      </td>
                      <td className={cn(tdRCls, 'font-semibold text-foreground')}>{fmtPEN(t.total)}</td>
                      <td className={cn(tdRCls, 'text-muted-foreground')}>{t.cantidad}</td>
                      <td className={cn(tdRCls, 'text-muted-foreground')}>
                        {t.cantidad > 0 ? fmtPEN(t.total / t.cantidad) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Métodos de pago */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border p-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Métodos de pago</h3>
          {loading ? <Skeleton className="h-48 w-full rounded-lg" />
            : metodos.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>
            : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={metodos} dataKey="total" nameKey="metodo" cx="50%" cy="50%" outerRadius={72} innerRadius={36}>
                      {metodos.map((m, i) => <Cell key={i} fill={m.fill || CHART_COLORS.PIE[i % CHART_COLORS.PIE.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [fmtPEN(v)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-2 space-y-1">
                  {metodos.map((m, i) => {
                    const totalMetodos = metodos.reduce((s, x) => s + x.total, 0);
                    return (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span className="inline-block size-2.5 rounded-full" style={{ background: m.fill || CHART_COLORS.PIE[i] }} />
                          {m.metodo}
                        </span>
                        <span className="tabular-nums font-medium text-foreground">
                          {fmtPEN(m.total)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({totalMetodos > 0 ? ((m.total / totalMetodos) * 100).toFixed(0) : 0}%)
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
        </div>

        {/* Ventas por día de semana */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border p-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Ventas por día de la semana</h3>
          {loading ? <Skeleton className="h-48 w-full rounded-lg" />
            : diasSemana.every(d => d.total === 0) ? <p className="py-8 text-center text-sm text-muted-foreground">Sin datos</p>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={diasSemana} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.borde} vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.neutro, fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} width={44} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [fmtPEN(v), 'Total']}
                  />
                  <Bar dataKey="total" fill={CHART_COLORS.ingreso} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* Top modelos */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Top modelos vendidos</h3>
        </div>
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
          </div>
        ) : modelos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin datos de modelos en el período</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={thCls}>#</th>
                <th className={thCls}>Modelo</th>
                <th className={thCls}>Marca</th>
                <th className={thRCls}>Pares</th>
                <th className={thRCls}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((m, i) => (
                <tr key={m.id_producto} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{m.nombre}</td>
                  <td className={cn(tdCls, 'text-muted-foreground')}>{m.marca || '—'}</td>
                  <td className={cn(tdRCls, 'text-foreground')}>{m.pares}</td>
                  <td className={cn(tdRCls, 'font-semibold text-green-700')}>{fmtPEN(m.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab Flujo de Caja ────────────────────────────────────────────────────────

function TabFlujo({ data }) {
  const { diario, mensual, loading, error } = data;

  const diarioPorFecha = Object.values(
    (diario || []).reduce((acc, row) => {
      const k = row.fecha;
      if (!acc[k]) acc[k] = { fecha: k, ingresos: 0, egresos: 0, neto: 0 };
      acc[k].ingresos += Number(row.ingresos);
      acc[k].egresos  += Number(row.egresos);
      acc[k].neto     += Number(row.neto);
      return acc;
    }, {})
  ).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const ingresosTotal  = diarioPorFecha.reduce((s, r) => s + r.ingresos, 0);
  const egresosTotal   = diarioPorFecha.reduce((s, r) => s + r.egresos,  0);
  const netoTotal      = diarioPorFecha.reduce((s, r) => s + r.neto,     0);
  const burnRateDiario = diarioPorFecha.length > 0 ? egresosTotal / diarioPorFecha.length : 0;
  const top10          = [...(diario || [])].sort((a, b) =>
    (Number(b.ingresos) + Number(b.egresos)) - (Number(a.ingresos) + Number(a.egresos))
  ).slice(0, 10);
  const emptyDiario  = !loading && !error && diarioPorFecha.length === 0;
  const emptyMensual = !loading && !error && (mensual || []).length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Ingresos del período"  value={ingresosTotal}  color="green"                               loading={loading} />
        <KpiCard label="Egresos del período"   value={egresosTotal}   color="red"                                 loading={loading} />
        <KpiCard label="Neto del período"      value={netoTotal}      color={netoTotal >= 0 ? 'green' : 'red'}    loading={loading} />
        <KpiCard label="Gasto diario prom."    value={burnRateDiario} color="neutral"                             loading={loading} />
      </div>

      <SectionCard title="Ingresos vs Egresos — período seleccionado" className="p-4">
        <ChartContainer loading={loading} empty={emptyDiario} error={error} label="flujo diario">
          <BarChartFlujo data={diarioPorFecha} xKey="fecha" height={260} />
        </ChartContainer>
      </SectionCard>

      <SectionCard title="Tendencia mensual — últimos 12 meses" className="p-4">
        <ChartContainer loading={loading} empty={emptyMensual} error={error} label="flujo mensual">
          <BarChartFlujo data={mensual} xKey="periodo_mes" height={240} />
        </ChartContainer>
      </SectionCard>

      {!loading && !emptyDiario && !error && top10.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Top movimientos del período</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={thCls}>Fecha</th>
                <th className={thCls}>Cuenta</th>
                <th className={thRCls}>Ingresos</th>
                <th className={thRCls}>Egresos</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((row, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className={cn(tdCls, 'text-muted-foreground tabular-nums')}>{row.fecha}</td>
                  <td className={tdCls}>{row.cuenta_nombre || '—'}</td>
                  <td className={cn(tdRCls, 'text-green-700')}>
                    {Number(row.ingresos) > 0 ? formatMoney(row.ingresos) : '—'}
                  </td>
                  <td className={cn(tdRCls, 'text-red-700')}>
                    {Number(row.egresos) > 0 ? formatMoney(row.egresos) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab Costos ───────────────────────────────────────────────────────────────

function _unused_TabCostos({ data }) {
  const { costos, obligaciones, loading, error } = data;
  if (error) return <EmptyState title="Error al cargar" description={error} />;

  const porCategoria = costos.reduce((acc, c) => {
    const cat = c.categoria || 'Sin categoría';
    if (!acc[cat]) acc[cat] = { nombre: cat, total: 0, cantidad: 0 };
    acc[cat].total    += Number(c.monto_mensual) || 0;
    acc[cat].cantidad += 1;
    return acc;
  }, {});
  const categorias = Object.values(porCategoria).sort((a, b) => b.total - a.total);
  const totalMensual = categorias.reduce((s, c) => s + c.total, 0);
  const totalObligaciones = obligaciones.reduce((s, o) => s + Number(o.monto || 0), 0);
  const pieData = categorias.filter(c => c.total > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Costos fijos mensuales" value={totalMensual}      color="red"     loading={loading} />
        <KpiCard label="Obligaciones próximas"  value={totalObligaciones} color="neutral" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Pie por categoría */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border p-4">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Costos por categoría</h3>
          {loading ? <Skeleton className="h-52 w-full rounded-lg" />
            : pieData.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sin costos registrados</p>
            : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="total" nameKey="nombre" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS.PIE[i % CHART_COLORS.PIE.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [fmtPEN(v)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-2 space-y-1.5">
                  {categorias.map((c, i) => (
                    <li key={c.nombre} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ background: CHART_COLORS.PIE[i % CHART_COLORS.PIE.length] }} />
                        {c.nombre}
                        <span className="text-xs text-muted-foreground/60">({c.cantidad})</span>
                      </span>
                      <span className="tabular-nums font-medium text-foreground">{fmtPEN(c.total)}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t border-border pt-1.5 text-sm mt-1">
                    <span className="font-semibold text-foreground">Total mensual</span>
                    <span className="tabular-nums font-bold text-red-700">{fmtPEN(totalMensual)}</span>
                  </li>
                </ul>
              </>
            )}
        </div>

        {/* Obligaciones próximas */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Próximas obligaciones (30 días)</h3>
            {obligaciones.length > 0 && (
              <span className="text-sm font-bold text-amber-700">{fmtPEN(totalObligaciones)}</span>
            )}
          </div>
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : obligaciones.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay obligaciones próximas</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {obligaciones.map((o, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-foreground">{o.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.tipo === 'deuda' ? 'Deuda' : 'Costo fijo'}{o.detalle ? ` · ${o.detalle}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-amber-700">{formatMoney(o.monto)}</p>
                    {o.fecha_proxima && <p className="text-xs text-muted-foreground">{o.fecha_proxima}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!loading && costos.length > 0 && (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Costos fijos activos</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={thCls}>Nombre</th>
                <th className={thCls}>Categoría</th>
                <th className={thRCls}>Mensual</th>
              </tr>
            </thead>
            <tbody>
              {costos.map(c => (
                <tr key={c.id_costo} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-foreground">{c.nombre}</td>
                  <td className={cn(tdCls, 'text-muted-foreground')}>{c.categoria || '—'}</td>
                  <td className={cn(tdRCls, 'font-medium text-red-700')}>{fmtPEN(c.monto_mensual)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40">
                <td colSpan={2} className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className={cn(tdRCls, 'font-bold text-red-700')}>{fmtPEN(totalMensual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab Patrimonio ───────────────────────────────────────────────────────────

function TabPatrimonio({ data }) {
  const { totales, detalle, obligaciones, loading, error } = data;
  const activos  = (detalle || []).filter(d => d.tipo === 'activo');
  const pasivos  = (detalle || []).filter(d => d.tipo === 'pasivo');
  const totalObligaciones = (obligaciones || []).reduce((s, o) => s + Number(o.monto || 0), 0);

  if (loading) return <LoadingState message="Cargando patrimonio…" />;
  if (error)   return <EmptyState title="Error al cargar" description={error} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total activos"   value={totales?.total_activos}   color="green"                                                     loading={loading} />
        <KpiCard label="Total pasivos"   value={totales?.total_pasivos}   color="red"                                                       loading={loading} />
        <KpiCard label="Patrimonio neto" value={totales?.patrimonio_neto} color={(totales?.patrimonio_neto || 0) >= 0 ? 'green' : 'red'}    loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          { label: 'Cuentas', items: activos, total: totales?.total_activos, colorTotal: 'text-green-700', colorItem: 'text-green-700', emptyMsg: 'Sin cuentas activas' },
          { label: 'Deudas',  items: pasivos, total: totales?.total_pasivos,  colorTotal: 'text-red-700',   colorItem: 'text-red-700',   emptyMsg: 'Sin deudas activas' },
        ].map(({ label, items, total, colorTotal, colorItem, emptyMsg }) => (
          <div key={label} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">{label} ({items.length})</h3>
              <span className={cn('text-sm font-bold', colorTotal)}>{formatMoney(total)}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyMsg}</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {items.map(a => (
                  <li key={a.id_ref} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm text-foreground">{a.nombre}</p>
                      <p className="text-xs text-muted-foreground">{a.subtipo}</p>
                    </div>
                    <span className={cn('text-sm font-semibold tabular-nums', colorItem)}>{formatMoney(a.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Próximas obligaciones (30 días)</h3>
          {obligaciones.length > 0 && (
            <span className="text-sm font-bold text-amber-700">{formatMoney(totalObligaciones)}</span>
          )}
        </div>
        {obligaciones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay obligaciones próximas registradas</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {obligaciones.map((o, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-foreground">{o.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.tipo === 'deuda' ? 'Deuda' : 'Costo fijo'}{o.detalle ? ` · ${o.detalle}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-amber-700">{formatMoney(o.monto)}</p>
                  {o.fecha_proxima && <p className="text-xs text-muted-foreground">{o.fecha_proxima}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
