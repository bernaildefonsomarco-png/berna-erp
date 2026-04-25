import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  obtenerUbicacion, obtenerResumenUbicacion,
  listarCostosPorUbicacion, listarTrabajadoresPorUbicacion,
  listarMovimientosPorUbicacion, obtenerResumenVentasTienda,
} from '../api/finanzasClient';
import { obtenerPLResumen, obtenerVentasPorMetodo, obtenerVentasPorDia } from '../api/dashboardClient';
import { formatMoney, formatDate, formatDateShort } from '../lib/calculos';
import {
  Icon, ICONS, Spinner, Badge, LoadingState, EmptyState,
  MetricCard, InlineTabs,
} from '../components/UI';
import { cn } from '@/lib/utils';
import QuickEntry from '../../../components/QuickEntry/QuickEntry';

/* ══════════════════════════════════════════════════════════════════════════
   ESTILOS CSS SCOPED
   ══════════════════════════════════════════════════════════════════════════ */

const HUB_STYLES = `
.hub-root { font-family: 'Inter', 'Geist', ui-sans-serif, system-ui, sans-serif; }
.hub-root * { -webkit-font-smoothing: antialiased; }

/* KPI Strip */
.hub-kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
@media (max-width: 1100px) { .hub-kpi-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 700px)  { .hub-kpi-grid { grid-template-columns: repeat(2, 1fr); } }

.hub-kpi {
  background: #fff; border: 1px solid #e7e5e4; border-radius: 14px;
  padding: 16px 18px; display: flex; flex-direction: column; gap: 4px;
  transition: box-shadow 0.15s;
}
.hub-kpi:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.hub-kpi-label { font-size: 11px; font-weight: 500; color: #a8a29e; text-transform: uppercase; letter-spacing: .04em; }
.hub-kpi-value { font-size: 22px; font-weight: 700; color: #1c1917; font-variant-numeric: tabular-nums; line-height: 1.1; }
.hub-kpi-value.pos { color: #15803d; }
.hub-kpi-value.neg { color: #b91c1c; }
.hub-kpi-sub { font-size: 11px; color: #a8a29e; margin-top: 2px; }

/* Tabs */
.hub-tab-panel { padding-top: 20px; }

/* Tabla compacta */
.hub-table { width: 100%; border-collapse: collapse; }
.hub-table th { font-size: 11px; font-weight: 600; color: #78716c; text-align: left; padding: 6px 10px; border-bottom: 1px solid #e7e5e4; }
.hub-table td { font-size: 13px; color: #1c1917; padding: 10px; border-bottom: 1px solid #f5f5f4; }
.hub-table tr:last-child td { border-bottom: none; }
.hub-table tr:hover td { background: #fafaf9; }

/* Cards de sección */
.hub-card {
  background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden;
}
.hub-card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #f5f5f4;
}
.hub-card-title { font-size: 13px; font-weight: 600; color: #1c1917; }
.hub-card-body { padding: 0; }

/* Costo pill */
.hub-cat-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 500;
}

/* Tooltip recharts */
.hub-tooltip {
  background: #fff; border: 1px solid #e7e5e4; border-radius: 10px;
  padding: 10px 14px; box-shadow: 0 4px 16px rgba(0,0,0,.08);
  font-size: 12px; color: #1c1917;
}

/* Metric mini row */
.hub-metric-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f5f5f4; }
.hub-metric-row:last-child { border-bottom: none; }
`;

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════════ */

const hoy = () => new Date().toISOString().slice(0, 10);
const primerDelMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const PERIODO_PRESETS = [
  { k: 'mes',     label: 'Este mes',     desde: primerDelMes,  hasta: hoy },
  { k: 'semana',  label: 'Esta semana',  desde: () => {
    const d = new Date();
    const lunes = new Date(d);
    lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return lunes.toISOString().slice(0, 10);
  }, hasta: hoy },
  { k: '7d',      label: 'Últ. 7 días',  desde: () => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, hasta: hoy },
  { k: '30d',     label: 'Últ. 30 días', desde: () => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  }, hasta: hoy },
];

const ROL_META = {
  Tienda:  { icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', color: '#3b82f6', bg: '#eff6ff', label: 'Tienda' },
  Fabrica: { icon: 'M2 20h20M5 20V8l5 4V8l5 4V8l4 12',               color: '#f59e0b', bg: '#fffbeb', label: 'Taller' },
};

const CAT_META = {
  servicio:    { label: 'Servicio',     color: '#3b82f6', bg: '#eff6ff' },
  alquiler:    { label: 'Alquiler',     color: '#8b5cf6', bg: '#f5f3ff' },
  salario:     { label: 'Personal',     color: '#059669', bg: '#ecfdf5' },
  suscripcion: { label: 'Suscripción',  color: '#0891b2', bg: '#ecfeff' },
  impuesto:    { label: 'Impuesto',     color: '#dc2626', bg: '#fef2f2' },
  seguro:      { label: 'Seguro',       color: '#9333ea', bg: '#faf5ff' },
  otro:        { label: 'Otro',         color: '#6b7280', bg: '#f9fafb' },
};

const PIE_COLORS = ['#1c1917', '#7c3aed', '#0ea5e9', '#059669', '#f59e0b', '#dc2626'];

const AREA_META = {
  taller:        'Taller',
  tienda:        'Tienda',
  administracion: 'Admin',
};

const FREC_META = {
  diaria:    { label: 'Diaria',    factor: 30 },
  semanal:   { label: 'Semanal',   factor: 4.33 },
  quincenal: { label: 'Quincenal', factor: 2 },
  mensual:   { label: 'Mensual',   factor: 1 },
  anual:     { label: 'Anual',     factor: 1 / 12 },
};

function mensualizado(costo) {
  const f = FREC_META[costo.frecuencia]?.factor ?? 1;
  return (Number(costo.monto_estimado) || 0) * f;
}

/* ══════════════════════════════════════════════════════════════════════════
   CUSTOM TOOLTIP
   ══════════════════════════════════════════════════════════════════════════ */

function HubTooltip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="hub-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {money ? formatMoney(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB RESUMEN
   ══════════════════════════════════════════════════════════════════════════ */

function TabResumen({ pl, movimientos, ubicacion }) {
  const ingresos = pl.filter(r => r.seccion_pl === 'ingresos');
  const egresos  = pl.filter(r => r.seccion_pl !== 'ingresos' && r.seccion_pl !== 'resultado');
  const resultado = pl.find(r => r.seccion_pl === 'resultado');

  const totalIngresos = ingresos.reduce((s, r) => s + (Number(r.monto_total) || 0), 0);
  const totalEgresos  = egresos.reduce((s, r) => s + (Number(r.monto_total) || 0), 0);

  // Pie data con los egresos por sección
  const pieData = egresos
    .filter(r => (Number(r.monto_total) || 0) > 0)
    .map(r => ({ name: r.concepto || r.seccion_pl, value: Number(r.monto_total) || 0 }));

  return (
    <div className="space-y-5">
      {/* P&L mini */}
      <div className="hub-card">
        <div className="hub-card-header">
          <span className="hub-card-title">Estado de Resultados — {ubicacion.nombre}</span>
          <Link
            to={`/gestion/estado-resultados?ubicacion=${ubicacion.id_ubicacion}`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Ver completo <Icon d={ICONS.arrowRight} size={12} />
          </Link>
        </div>
        <div className="hub-card-body">
          {pl.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sin datos P&L para el período seleccionado
            </div>
          ) : (
            <>
              {/* Ingresos */}
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Ingresos</p>
              </div>
              {ingresos.map(r => (
                <div key={r.seccion_pl} className="hub-metric-row">
                  <span className="text-sm text-foreground">{r.concepto || r.seccion_pl}</span>
                  <span className="text-sm font-semibold text-green-700">{formatMoney(r.monto_total)}</span>
                </div>
              ))}
              {/* Total ingresos */}
              <div className="hub-metric-row" style={{ background: '#f0fdf4' }}>
                <span className="text-sm font-bold text-green-800">Total Ingresos</span>
                <span className="text-sm font-bold text-green-800">{formatMoney(totalIngresos)}</span>
              </div>
              {/* Egresos */}
              {egresos.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Egresos</p>
                  </div>
                  {egresos.map(r => (
                    <div key={r.seccion_pl} className="hub-metric-row">
                      <span className="text-sm text-foreground">{r.concepto || r.seccion_pl}</span>
                      <span className="text-sm font-semibold text-red-700">{formatMoney(r.monto_total)}</span>
                    </div>
                  ))}
                  <div className="hub-metric-row" style={{ background: '#fef2f2' }}>
                    <span className="text-sm font-bold text-red-800">Total Egresos</span>
                    <span className="text-sm font-bold text-red-800">{formatMoney(totalEgresos)}</span>
                  </div>
                </>
              )}
              {/* Resultado */}
              {resultado && (
                <div className="hub-metric-row" style={{ background: Number(resultado.monto_total) >= 0 ? '#f0fdf4' : '#fef2f2', borderTop: '2px solid #e7e5e4' }}>
                  <span className="text-base font-bold" style={{ color: Number(resultado.monto_total) >= 0 ? '#15803d' : '#b91c1c' }}>
                    Resultado neto
                  </span>
                  <span className="text-base font-bold" style={{ color: Number(resultado.monto_total) >= 0 ? '#15803d' : '#b91c1c' }}>
                    {formatMoney(resultado.monto_total)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Gráfico distribución egresos */}
      {pieData.length > 0 && (
        <div className="hub-card">
          <div className="hub-card-header">
            <span className="hub-card-title">Distribución de egresos</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<HubTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Últimos movimientos */}
      <div className="hub-card">
        <div className="hub-card-header">
          <span className="hub-card-title">Últimos movimientos</span>
          <Link
            to={`/gestion/movimientos?ubicacion=${ubicacion.id_ubicacion}`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Ver todos <Icon d={ICONS.arrowRight} size={12} />
          </Link>
        </div>
        <div className="hub-card-body">
          {movimientos.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin movimientos registrados</div>
          ) : (
            <table className="hub-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Cuenta</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.slice(0, 8).map(m => (
                  <tr key={m.id_movimiento}>
                    <td className="text-muted-foreground">{formatDateShort(m.fecha_movimiento)}</td>
                    <td>{m.concepto || '—'}</td>
                    <td className="text-muted-foreground">{m.cuenta?.nombre || '—'}</td>
                    <td className={cn('text-right font-semibold', m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700')}>
                      {m.tipo === 'ingreso' ? '+' : '-'}{formatMoney(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB COSTOS
   ══════════════════════════════════════════════════════════════════════════ */

function TabCostos({ costos, idUbicacion }) {
  const totalMens = useMemo(() => costos.reduce((s, c) => s + mensualizado(c), 0), [costos]);

  // Agrupar por categoría
  const porCat = useMemo(() => {
    const map = {};
    costos.forEach(c => {
      const cat = c.categoria || 'otro';
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    });
    return map;
  }, [costos]);

  if (costos.length === 0) return (
    <div className="space-y-4">
      <EmptyState
        title="Sin costos asignados"
        description="Esta ubicación no tiene costos fijos asignados todavía."
        action={
          <Link to={`/gestion/costos?ubicacion=${idUbicacion}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition">
            <Icon d={ICONS.plus} size={14} /> Agregar costo
          </Link>
        }
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="hub-kpi">
          <span className="hub-kpi-label">Total costos</span>
          <span className="hub-kpi-value">{costos.length}</span>
          <span className="hub-kpi-sub">activos</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Costo mensual</span>
          <span className="hub-kpi-value neg" style={{ fontSize: 16 }}>{formatMoney(totalMens)}</span>
          <span className="hub-kpi-sub">mensualizado</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Categorías</span>
          <span className="hub-kpi-value">{Object.keys(porCat).length}</span>
          <span className="hub-kpi-sub">tipos de costo</span>
        </div>
      </div>

      {/* Lista por categoría */}
      {Object.entries(porCat).map(([cat, items]) => {
        const meta = CAT_META[cat] || CAT_META.otro;
        const subtotal = items.reduce((s, c) => s + mensualizado(c), 0);
        return (
          <div key={cat} className="hub-card">
            <div className="hub-card-header">
              <div className="flex items-center gap-2">
                <span
                  className="hub-cat-pill"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.label}
                </span>
                <span className="text-xs text-muted-foreground">{items.length} costo{items.length !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-sm font-semibold text-red-700">{formatMoney(subtotal)}/mes</span>
            </div>
            <div className="hub-card-body">
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Frecuencia</th>
                    <th>Responsable</th>
                    <th className="text-right">Mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(c => (
                    <tr key={c.id_costo}>
                      <td className="font-medium">{c.nombre}</td>
                      <td className="text-muted-foreground">{FREC_META[c.frecuencia]?.label || c.frecuencia}</td>
                      <td className="text-muted-foreground">{c.responsable?.nombre || '—'}</td>
                      <td className="text-right font-semibold text-red-700">{formatMoney(mensualizado(c))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Link al módulo */}
      <div className="flex justify-center pt-2">
        <Link
          to={`/gestion/costos`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon d={ICONS.arrowRight} size={14} />
          Ir a Gastos Fijos para gestión completa
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB EQUIPO
   ══════════════════════════════════════════════════════════════════════════ */

function TabEquipo({ trabajadores, idUbicacion }) {
  if (trabajadores.length === 0) return (
    <EmptyState
      title="Sin trabajadores asignados"
      description="Ningún trabajador asignado o del área correspondiente."
      action={
        <Link to="/gestion/trabajadores" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition">
          <Icon d={ICONS.users} size={14} /> Ir a Trabajadores
        </Link>
      }
    />
  );

  return (
    <div className="space-y-4">
      <div className="hub-card">
        <div className="hub-card-header">
          <span className="hub-card-title">{trabajadores.length} trabajador{trabajadores.length !== 1 ? 'es' : ''} asignados</span>
          <Link
            to="/gestion/trabajadores"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Gestionar <Icon d={ICONS.arrowRight} size={12} />
          </Link>
        </div>
        <div className="hub-card-body">
          {trabajadores.map(t => {
            return (
              <div key={t.id_persona} className="hub-metric-row items-start flex-col gap-1.5" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold text-sm"
                    style={{ background: '#f5f5f4', color: '#57534e' }}
                  >
                    {t.nombre?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{t.nombre}</p>
                      {t.es_rotativo && t.area === 'tienda' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          ROTATIVA
                        </span>
                      )}
                      {(t.areas_adicionales || []).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          +{t.areas_adicionales.length} área{t.areas_adicionales.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.cargo || AREA_META[t.area] || t.area} · {t.tipo_contrato}
                      {t.fecha_ingreso ? ` · desde ${formatDate(t.fecha_ingreso)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {t.salario_base ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{formatMoney(t.salario_base)}</p>
                      <p className="text-xs text-muted-foreground">{t.frecuencia_pago}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sin salario base</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Link
          to="/gestion/trabajadores"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon d={ICONS.arrowRight} size={14} />
          Ir a Trabajadores para gestión completa
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB VENTAS (solo Tiendas)
   ══════════════════════════════════════════════════════════════════════════ */

function TabVentas({ ventas, ventasPorDia, ventasPorMetodo }) {
  const [subView, setSubView] = useState('dia');

  const SUB_TABS = [
    { k: 'dia',    label: 'Por día' },
    { k: 'metodo', label: 'Por método' },
  ];

  if (!ventas || ventas.cantidadVentas === 0) return (
    <EmptyState
      title="Sin ventas en este período"
      description="No hay ventas registradas para esta tienda en el período seleccionado."
    />
  );

  return (
    <div className="space-y-5">
      {/* KPIs ventas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="hub-kpi">
          <span className="hub-kpi-label">Total ventas</span>
          <span className="hub-kpi-value pos" style={{ fontSize: 18 }}>{formatMoney(ventas.totalVentas)}</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Transacciones</span>
          <span className="hub-kpi-value">{ventas.cantidadVentas}</span>
          <span className="hub-kpi-sub">ventas</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Ticket promedio</span>
          <span className="hub-kpi-value" style={{ fontSize: 16 }}>
            {formatMoney(ventas.cantidadVentas > 0 ? ventas.totalVentas / ventas.cantidadVentas : 0)}
          </span>
        </div>
      </div>

      {/* Sub-tabs */}
      <InlineTabs tabs={SUB_TABS} active={subView} onChange={setSubView} />

      {/* Gráfico por día */}
      {subView === 'dia' && (
        <div className="hub-card">
          <div className="hub-card-header">
            <span className="hub-card-title">Ventas por día</span>
          </div>
          <div className="p-4">
            {ventasPorDia.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ventasPorDia} barSize={28}>
                  <XAxis dataKey="fecha" tickFormatter={v => formatDateShort(v)} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `S/.${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<HubTooltip />} />
                  <Bar dataKey="total" name="Ventas" fill="#1c1917" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Métodos de pago */}
      {subView === 'metodo' && (
        <div className="hub-card">
          <div className="hub-card-header">
            <span className="hub-card-title">Por método de pago</span>
          </div>
          <div className="p-4">
            {ventasPorMetodo.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Sin datos</p>
            ) : (
              <div className="flex gap-6">
                <ResponsiveContainer width="45%" height={180}>
                  <PieChart>
                    <Pie data={ventasPorMetodo} dataKey="total" nameKey="metodo" cx="50%" cy="50%" outerRadius={70}>
                      {ventasPorMetodo.map((m, i) => <Cell key={i} fill={m.fill || PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip content={<HubTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 flex flex-col justify-center gap-2">
                  {ventasPorMetodo.map((m, i) => {
                    const pct = ventas.totalVentas > 0 ? (m.total / ventas.totalVentas * 100).toFixed(1) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: m.fill || PIE_COLORS[i] }} />
                        <span className="text-sm flex-1 text-foreground">{m.metodo}</span>
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(m.total)}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB MOVIMIENTOS
   ══════════════════════════════════════════════════════════════════════════ */

function TabMovimientos({ movimientos, idUbicacion }) {
  if (movimientos.length === 0) return (
    <EmptyState
      title="Sin movimientos"
      description="No hay movimientos registrados para esta ubicación en el período."
    />
  );

  const totalIngresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos  = movimientos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="hub-kpi">
          <span className="hub-kpi-label">Ingresos registrados</span>
          <span className="hub-kpi-value pos" style={{ fontSize: 16 }}>{formatMoney(totalIngresos)}</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Egresos registrados</span>
          <span className="hub-kpi-value neg" style={{ fontSize: 16 }}>{formatMoney(totalEgresos)}</span>
        </div>
      </div>

      <div className="hub-card">
        <div className="hub-card-header">
          <span className="hub-card-title">{movimientos.length} movimientos</span>
          <Link
            to={`/gestion/movimientos`}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Ver módulo <Icon d={ICONS.arrowRight} size={12} />
          </Link>
        </div>
        <div className="hub-card-body">
          <table className="hub-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id_movimiento}>
                  <td className="text-muted-foreground">{formatDateShort(m.fecha_movimiento)}</td>
                  <td className="font-medium">{m.concepto || '—'}</td>
                  <td className="text-muted-foreground">{m.cuenta?.nombre || '—'}</td>
                  <td>
                    <span
                      className="hub-cat-pill"
                      style={{
                        background: m.tipo === 'ingreso' ? '#ecfdf5' : '#fef2f2',
                        color:      m.tipo === 'ingreso' ? '#059669' : '#dc2626',
                      }}
                    >
                      {m.tipo}
                    </span>
                  </td>
                  <td className={cn('text-right font-semibold', m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700')}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{formatMoney(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN — HubUbicacion
   ══════════════════════════════════════════════════════════════════════════ */

export default function HubUbicacion({ usuario }) {
  const { idUbicacion } = useParams();
  const navigate = useNavigate();
  const id = Number(idUbicacion);

  const [ubicacion, setUbicacion]         = useState(null);
  const [resumen, setResumen]             = useState(null);
  const [pl, setPL]                       = useState([]);
  const [costos, setCostos]               = useState([]);
  const [trabajadores, setTrabajadores]   = useState([]);
  const [movimientos, setMovimientos]     = useState([]);
  const [ventas, setVentas]               = useState(null);
  const [ventasPorDia, setVentasPorDia]   = useState([]);
  const [ventasPorMetodo, setVentasPorMetodo] = useState([]);

  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState('resumen');
  const [periodoK, setPeriodoK]   = useState('mes');
  const [qeAbierto, setQeAbierto] = useState(false);

  // Período activo
  const periodo = useMemo(() => {
    const p = PERIODO_PRESETS.find(x => x.k === periodoK) || PERIODO_PRESETS[0];
    return { desde: p.desde(), hasta: p.hasta() };
  }, [periodoK]);

  /* ── carga ── */
  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true); setError(null);
    try {
      const [ub, res] = await Promise.all([
        obtenerUbicacion(id),
        obtenerResumenUbicacion(id),
      ]);
      setUbicacion(ub);
      setResumen(res);

      // Cargar datos del período en paralelo
      const promises = [
        obtenerPLResumen(periodo.desde, periodo.hasta, id),
        listarCostosPorUbicacion(id),
        listarTrabajadoresPorUbicacion(id, { ubicacionRol: ub.rol }),
        listarMovimientosPorUbicacion(id, { desde: periodo.desde, hasta: periodo.hasta }),
      ];
      if (ub.rol === 'Tienda') {
        promises.push(obtenerResumenVentasTienda(id, periodo.desde, periodo.hasta));
        promises.push(obtenerVentasPorDia(periodo.desde, periodo.hasta, id));
        promises.push(obtenerVentasPorMetodo(periodo.desde, periodo.hasta, id));
      }
      const [plData, costosData, trabData, movsData, ...ventasData] = await Promise.all(promises);

      setPL(plData || []);
      setCostos(costosData || []);
      setTrabajadores(trabData || []);
      setMovimientos(movsData || []);
      if (ub.rol === 'Tienda') {
        setVentas(ventasData[0] || null);
        setVentasPorDia(ventasData[1] || []);
        setVentasPorMetodo(ventasData[2] || []);
      }
    } catch (e) {
      setError(e.message ?? 'Error al cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [id, periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  /* ── tabs según rol ── */
  const TABS = useMemo(() => {
    const base = [
      { k: 'resumen',    label: 'Resumen' },
      { k: 'costos',     label: `Costos (${costos.length})` },
      { k: 'equipo',     label: `Equipo (${trabajadores.length})` },
      { k: 'movimientos',label: 'Movimientos' },
    ];
    if (ubicacion?.rol === 'Tienda') {
      base.splice(1, 0, { k: 'ventas', label: 'Ventas' });
    }
    return base;
  }, [ubicacion, costos.length, trabajadores.length]);

  /* ── KPIs del header ── */
  const plResultado = pl.find(r => r.seccion_pl === 'resultado');
  const plIngresos  = pl.filter(r => r.seccion_pl === 'ingresos').reduce((s, r) => s + (Number(r.monto_total) || 0), 0);
  const plEgresos   = pl.filter(r => r.seccion_pl !== 'ingresos' && r.seccion_pl !== 'resultado').reduce((s, r) => s + (Number(r.monto_total) || 0), 0);
  const resultado   = Number(plResultado?.monto_total) || 0;

  const rolMeta = ROL_META[ubicacion?.rol] || ROL_META.Tienda;

  if (cargando) return (
    <div className="hub-root">
      <style>{HUB_STYLES}</style>
      <LoadingState message="Cargando hub..." />
    </div>
  );

  if (error || !ubicacion) return (
    <div className="hub-root p-8 text-center">
      <style>{HUB_STYLES}</style>
      <p className="text-red-600 text-sm mb-3">{error || 'Ubicación no encontrada'}</p>
      <button onClick={() => navigate('/gestion/ubicaciones')} className="text-sm text-blue-600 hover:underline">
        ← Volver a Ubicaciones
      </button>
    </div>
  );

  return (
    <div className="hub-root space-y-6 pb-10">
      <style>{HUB_STYLES}</style>

      {/* ── Breadcrumb + Header ── */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Link to="/gestion/ubicaciones" className="hover:text-foreground transition-colors">
            Tiendas y Talleres
          </Link>
          <Icon d={ICONS.chevronRight} size={12} />
          <span className="text-foreground font-medium">{ubicacion.nombre}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Ícono tipo */}
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl shrink-0"
              style={{ background: rolMeta.bg, color: rolMeta.color }}
            >
              <Icon d={rolMeta.icon} size={26} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{ubicacion.nombre}</h1>
                <span
                  className="hub-cat-pill text-xs"
                  style={{ background: rolMeta.bg, color: rolMeta.color }}
                >
                  {rolMeta.label}
                </span>
                {!ubicacion.activa && (
                  <span className="hub-cat-pill text-xs" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                    Inactiva
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {resumen?.trabajadores || 0} trabajadores · {resumen?.costos || 0} costos activos
              </p>
            </div>
          </div>

          {/* Selector de período */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            {PERIODO_PRESETS.map(p => (
              <button
                key={p.k}
                onClick={() => setPeriodoK(p.k)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  periodoK === p.k
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="hub-kpi-grid">
        <div className="hub-kpi">
          <span className="hub-kpi-label">Resultado neto</span>
          <span className={cn('hub-kpi-value', resultado >= 0 ? 'pos' : 'neg')} style={{ fontSize: 18 }}>
            {formatMoney(resultado)}
          </span>
          <span className="hub-kpi-sub">del período</span>
        </div>
        {ubicacion.rol === 'Tienda' && (
          <div className="hub-kpi">
            <span className="hub-kpi-label">Ventas</span>
            <span className="hub-kpi-value pos" style={{ fontSize: 18 }}>{formatMoney(ventas?.totalVentas || 0)}</span>
            <span className="hub-kpi-sub">{ventas?.cantidadVentas || 0} transacciones</span>
          </div>
        )}
        <div className="hub-kpi">
          <span className="hub-kpi-label">Ingresos</span>
          <span className="hub-kpi-value pos" style={{ fontSize: 18 }}>{formatMoney(plIngresos)}</span>
          <span className="hub-kpi-sub">registrados</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Egresos</span>
          <span className="hub-kpi-value neg" style={{ fontSize: 18 }}>{formatMoney(plEgresos)}</span>
          <span className="hub-kpi-sub">registrados</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Costos fijos/mes</span>
          <span className="hub-kpi-value" style={{ fontSize: 18 }}>{formatMoney(resumen?.totalCostosMens || 0)}</span>
          <span className="hub-kpi-sub">{resumen?.costos || 0} activos</span>
        </div>
        <div className="hub-kpi">
          <span className="hub-kpi-label">Equipo</span>
          <span className="hub-kpi-value">{resumen?.trabajadores || 0}</span>
          <span className="hub-kpi-sub">persona{resumen?.trabajadores !== 1 ? 's' : ''} asignada{resumen?.trabajadores !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Acciones rápidas ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setQeAbierto(true)}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white"
        >
          + Registrar movimiento
        </button>
        <Link
          to={`/gestion/estado-resultados?ubicacion=${id}`}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors"
        >
          <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={14} />
          Ver P&L completo
        </Link>
        <Link
          to="/gestion/costos"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors"
        >
          <Icon d={ICONS.document} size={14} />
          Gastos Fijos
        </Link>
        <Link
          to="/gestion/trabajadores"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors"
        >
          <Icon d={ICONS.users} size={14} />
          Trabajadores
        </Link>
        <Link
          to="/gestion/movimientos"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors"
        >
          <Icon d={ICONS.exchange} size={14} />
          Movimientos
        </Link>
      </div>

      {/* ── Tabs ── */}
      <InlineTabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Contenido del tab ── */}
      <div className="hub-tab-panel">
        {tab === 'resumen' && (
          <TabResumen pl={pl} movimientos={movimientos} ubicacion={ubicacion} />
        )}
        {tab === 'ventas' && ubicacion.rol === 'Tienda' && (
          <TabVentas ventas={ventas} ventasPorDia={ventasPorDia} ventasPorMetodo={ventasPorMetodo} />
        )}
        {tab === 'costos' && (
          <TabCostos costos={costos} idUbicacion={id} />
        )}
        {tab === 'equipo' && (
          <TabEquipo trabajadores={trabajadores} idUbicacion={id} />
        )}
        {tab === 'movimientos' && (
          <TabMovimientos movimientos={movimientos} idUbicacion={id} />
        )}
      </div>

      {qeAbierto && (
        <QuickEntry
          scope="finanzas"
          contexto={{ idUbicacion: ubicacion?.id_ubicacion ?? null }}
          onSubmit={() => { setQeAbierto(false); cargar(); }}
          onClose={() => setQeAbierto(false)}
        />
      )}
    </div>
  );
}
