import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  obtenerPLResumen,
  obtenerFlujoCajaDiario,
  obtenerFlujoCajaMensual,
  obtenerPatrimonioTotales,
  obtenerPatrimonioDetalle,
  obtenerObligacionesProximas,
} from '../api/dashboardClient';
import { formatMoney } from '../lib/calculos';
import { puedeVer, esAdmin } from '../lib/permisos';
import { EmptyState, LoadingState, PageHeader } from '../components/UI';
import ChartContainer from '../components/charts/ChartContainer';
import KpiCard from '../components/charts/KpiCard';
import BarChartFlujo from '../components/charts/BarChartFlujo';
import PieChartPL from '../components/charts/PieChartPL';

// ─── Helpers de período ──────────────────────────────────────────────────────

function getPeriodoDates(periodo) {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth(); // 0-based

  if (periodo === 'mes_actual') {
    return [fmtDate(new Date(y, m, 1)), fmtDate(new Date(y, m + 1, 0))];
  }
  if (periodo === 'mes_anterior') {
    return [fmtDate(new Date(y, m - 1, 1)), fmtDate(new Date(y, m, 0))];
  }
  if (periodo === 'ultimos_30') {
    const ini = new Date(); ini.setDate(ini.getDate() - 29);
    return [fmtDate(ini), fmtDate(new Date())];
  }
  // trimestre_actual
  const trimStart = Math.floor(m / 3) * 3;
  return [fmtDate(new Date(y, trimStart, 1)), fmtDate(new Date(y, trimStart + 3, 0))];
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

const PERIODOS = [
  { value: 'mes_actual',       label: 'Este mes' },
  { value: 'mes_anterior',     label: 'Mes anterior' },
  { value: 'ultimos_30',       label: 'Últimos 30 días' },
  { value: 'trimestre_actual', label: 'Este trimestre' },
];

const TABS = [
  { value: 'pl',         label: 'P&L' },
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

const LS_TAB    = 'finanzas.dashboard.tab';
const LS_PERIODO = 'finanzas.dashboard.periodo';

// ─── Componente principal ────────────────────────────────────────────────────

export default function Dashboard({ usuario }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(
    () => searchParams.get('tab') || localStorage.getItem(LS_TAB) || 'pl'
  );
  const [periodo, setPeriodo] = useState(
    () => localStorage.getItem(LS_PERIODO) || 'mes_actual'
  );

  // Estado por tab
  const [plData,    setPlData]    = useState({ rows: [], loading: false, error: null });
  const [flujoData, setFlujoData] = useState({ mensual: [], diario: [], loading: false, error: null });
  const [patriData, setPatriData] = useState({ totales: null, detalle: [], obligaciones: [], loading: false, error: null });

  // Persistir selecciones
  useEffect(() => {
    localStorage.setItem(LS_TAB, tab);
    setSearchParams({ tab }, { replace: true });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(LS_PERIODO, periodo);
  }, [periodo]);

  // ── Carga P&L ──
  const cargarPL = useCallback(async () => {
    const [ini, fin] = getPeriodoDates(periodo);
    setPlData(p => ({ ...p, loading: true, error: null }));
    try {
      const rows = await obtenerPLResumen(ini, fin);
      setPlData({ rows, loading: false, error: null });
    } catch (e) {
      setPlData(p => ({ ...p, loading: false, error: e.message }));
    }
  }, [periodo]);

  // ── Carga Flujo ──
  const cargarFlujo = useCallback(async () => {
    const [ini, fin] = getPeriodoDates(periodo);
    setFlujoData(p => ({ ...p, loading: true, error: null }));
    try {
      const [diario, mensual] = await Promise.all([
        obtenerFlujoCajaDiario(ini, fin),
        obtenerFlujoCajaMensual(12),
      ]);
      setFlujoData({ diario, mensual, loading: false, error: null });
    } catch (e) {
      setFlujoData(p => ({ ...p, loading: false, error: e.message }));
    }
  }, [periodo]);

  // ── Carga Patrimonio ──
  const cargarPatrimonio = useCallback(async () => {
    setPatriData(p => ({ ...p, loading: true, error: null }));
    try {
      const [totales, detalle, obligaciones] = await Promise.all([
        obtenerPatrimonioTotales(),
        obtenerPatrimonioDetalle(),
        obtenerObligacionesProximas(),
      ]);
      setPatriData({ totales, detalle, obligaciones, loading: false, error: null });
    } catch (e) {
      setPatriData(p => ({ ...p, loading: false, error: e.message }));
    }
  }, []);

  // Disparar carga al cambiar tab o período
  useEffect(() => { if (tab === 'pl')        cargarPL();        }, [tab, cargarPL]);
  useEffect(() => { if (tab === 'flujo')      cargarFlujo();     }, [tab, cargarFlujo]);
  useEffect(() => { if (tab === 'patrimonio') cargarPatrimonio();}, [tab, cargarPatrimonio]);

  if (!puedeVer(usuario, 'finanzas')) {
    return (
      <EmptyState
        title="Sin acceso"
        description="No tienes permiso para ver el módulo de Finanzas."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard Financiero" />

      {/* Selector de período — oculto en tab Patrimonio (snapshot siempre actual) */}
      {tab !== 'patrimonio' && (
        <div className="flex gap-2 flex-wrap">
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                periodo === p.value
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-200">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.value
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pl'         && <TabPL data={plData} />}
      {tab === 'flujo'      && <TabFlujo data={flujoData} />}
      {tab === 'patrimonio' && (
        esAdmin(usuario, 'finanzas')
          ? <TabPatrimonio data={patriData} />
          : <EmptyState title="Sin acceso" description="Solo administradores pueden ver el patrimonio." />
      )}
    </div>
  );
}

// ─── Tab P&L ─────────────────────────────────────────────────────────────────

function TabPL({ data }) {
  const { rows, loading, error } = data;

  const bySeccion      = Object.fromEntries(rows.map(r => [r.seccion_pl, Number(r.monto_total)]));
  const ingresos       = bySeccion['ingresos']           || 0;
  const costoVentas    = bySeccion['costo_ventas']       || 0;
  const gastosOp       = bySeccion['gastos_operativos']  || 0;
  const gastosFinan    = bySeccion['gastos_financieros'] || 0;
  const totalEgresos   = costoVentas + gastosOp + gastosFinan + (bySeccion['otros_egresos'] || 0);
  const utilidad       = ingresos - totalEgresos;
  const empty          = !loading && !error && rows.length === 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Ingresos"          value={ingresos}    color="green"                             loading={loading} />
        <KpiCard label="Costo de ventas"   value={costoVentas} color="red"                               loading={loading} />
        <KpiCard label="Gastos operativos" value={gastosOp}    color="neutral"                           loading={loading} />
        <KpiCard label="Utilidad neta"     value={utilidad}    color={utilidad >= 0 ? 'green' : 'red'}   loading={loading} />
      </div>

      {/* Pie chart */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">Distribución de egresos</h3>
        <ChartContainer loading={loading} empty={empty} error={error} label="P&L">
          <PieChartPL data={rows} height={260} />
        </ChartContainer>
      </div>

      {/* Tabla de secciones */}
      {!loading && !empty && !error && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Sección</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.seccion_pl} className="border-b border-stone-50 last:border-0">
                  <td className="px-4 py-3 text-stone-700">{PL_LABELS[row.seccion_pl] || row.seccion_pl}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                    row.seccion_pl === 'ingresos' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {formatMoney(row.monto_total)}
                  </td>
                </tr>
              ))}
              <tr className="bg-stone-50">
                <td className="px-4 py-3 font-semibold text-stone-900">Utilidad neta</td>
                <td className={`px-4 py-3 text-right tabular-nums font-bold ${utilidad >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatMoney(utilidad)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab Flujo de Caja ────────────────────────────────────────────────────────

function TabFlujo({ data }) {
  const { diario, mensual, loading, error } = data;

  // Agregar por fecha (consolidar todas las cuentas del mismo día)
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

  const ingresosTotal = diarioPorFecha.reduce((s, r) => s + r.ingresos, 0);
  const egresosTotal  = diarioPorFecha.reduce((s, r) => s + r.egresos,  0);
  const netoTotal     = diarioPorFecha.reduce((s, r) => s + r.neto,     0);

  // Top 10 filas (mayor movimiento absoluto del período)
  const top10 = [...(diario || [])]
    .sort((a, b) => (Number(b.ingresos) + Number(b.egresos)) - (Number(a.ingresos) + Number(a.egresos)))
    .slice(0, 10);

  const emptyDiario  = !loading && !error && diarioPorFecha.length === 0;
  const emptyMensual = !loading && !error && (mensual || []).length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Ingresos del período" value={ingresosTotal} color="green"                           loading={loading} />
        <KpiCard label="Egresos del período"  value={egresosTotal}  color="red"                             loading={loading} />
        <KpiCard label="Neto del período"     value={netoTotal}     color={netoTotal >= 0 ? 'green' : 'red'} loading={loading} />
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">Ingresos vs Egresos — período seleccionado</h3>
        <ChartContainer loading={loading} empty={emptyDiario} error={error} label="flujo diario">
          <BarChartFlujo data={diarioPorFecha} xKey="fecha" height={260} />
        </ChartContainer>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">Tendencia mensual — últimos 12 meses</h3>
        <ChartContainer loading={loading} empty={emptyMensual} error={error} label="flujo mensual">
          <BarChartFlujo data={mensual} xKey="periodo_mes" height={240} />
        </ChartContainer>
      </div>

      {!loading && !emptyDiario && !error && top10.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-700">Top movimientos del período</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Cuenta</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">Ingresos</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">Egresos</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((row, i) => (
                <tr key={i} className="border-b border-stone-50 last:border-0">
                  <td className="px-4 py-2.5 text-stone-500 tabular-nums">{row.fecha}</td>
                  <td className="px-4 py-2.5 text-stone-700">{row.cuenta_nombre || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">
                    {Number(row.ingresos) > 0 ? formatMoney(row.ingresos) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-700">
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
      {/* KPIs grandes */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total activos"  value={totales?.total_activos}  color="green"                                         loading={loading} />
        <KpiCard label="Total pasivos"  value={totales?.total_pasivos}  color="red"                                           loading={loading} />
        <KpiCard label="Patrimonio neto" value={totales?.patrimonio_neto} color={(totales?.patrimonio_neto || 0) >= 0 ? 'green' : 'red'} loading={loading} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cuentas */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-700">Cuentas ({activos.length})</h3>
            <span className="text-sm font-bold text-green-700">{formatMoney(totales?.total_activos)}</span>
          </div>
          {activos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-400 text-center">Sin cuentas activas</p>
          ) : (
            <ul className="divide-y divide-stone-50">
              {activos.map(a => (
                <li key={a.id_ref} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-stone-800">{a.nombre}</p>
                    <p className="text-xs text-stone-400">{a.subtipo}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-green-700">
                    {formatMoney(a.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Deudas */}
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-700">Deudas ({pasivos.length})</h3>
            <span className="text-sm font-bold text-red-700">{formatMoney(totales?.total_pasivos)}</span>
          </div>
          {pasivos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-400 text-center">Sin deudas activas</p>
          ) : (
            <ul className="divide-y divide-stone-50">
              {pasivos.map(d => (
                <li key={d.id_ref} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-stone-800">{d.nombre}</p>
                    <p className="text-xs text-stone-400">{d.subtipo}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-red-700">
                    {formatMoney(d.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Obligaciones próximas */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">Próximas obligaciones (30 días)</h3>
          {obligaciones.length > 0 && (
            <span className="text-sm font-bold text-amber-700">{formatMoney(totalObligaciones)}</span>
          )}
        </div>
        {obligaciones.length === 0 ? (
          <p className="px-4 py-6 text-sm text-stone-400 text-center">No hay obligaciones próximas registradas</p>
        ) : (
          <ul className="divide-y divide-stone-50">
            {obligaciones.map((o, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-stone-800">{o.nombre}</p>
                  <p className="text-xs text-stone-400">
                    {o.tipo === 'deuda' ? 'Deuda' : 'Costo fijo'}{o.detalle ? ` · ${o.detalle}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-amber-700">{formatMoney(o.monto)}</p>
                  {o.fecha_proxima && <p className="text-xs text-stone-400">{o.fecha_proxima}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
