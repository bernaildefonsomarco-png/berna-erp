/**
 * EstadoResultados.jsx — Módulo de Estado de Resultados con BI interactivo
 * Layout: P&L a la izquierda, panel de visualización a la derecha.
 * Al hacer clic en una sección del P&L, el panel derecho muestra el drill-down.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  obtenerPLResumen,
  obtenerResumenVentas,
  obtenerVentasPorTienda,
  obtenerVentasPorMetodo,
  obtenerTopModelos,
  obtenerVentasPorDiaSemana,
  obtenerVentasPorDia,
  obtenerVentasPorHora,
  obtenerGastosDetallePorSeccion,
  obtenerGastosPorUbicacion,
  obtenerPagosPorTrabajador,
  obtenerCostoProduccionPeriodo,
} from '../api/dashboardClient';
import { obtenerUbicacion } from '../api/finanzasClient';
import { formatMoney } from '../lib/calculos';
import { Icon, ICONS, Spinner } from '../components/UI';
import { cn } from '@/lib/utils';

/* ─── Helpers de período ─────────────────────────────────────────────────── */

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDateHuman(str) {
  if (!str) return '';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

function getWeekRange() {
  const hoy = new Date();
  const dow  = hoy.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  const lun  = new Date(hoy);
  lun.setDate(hoy.getDate() - diff);
  return { desde: fmtDate(lun), hasta: fmtDate(hoy) };
}

function getPresetRanges() {
  const hoy  = new Date();
  const y    = hoy.getFullYear();
  const m    = hoy.getMonth();
  const dow  = hoy.getDay();
  const dml  = dow === 0 ? 6 : dow - 1;
  const lun  = new Date(hoy); lun.setDate(hoy.getDate() - dml);
  const lp   = new Date(lun); lp.setDate(lp.getDate() - 7);
  const dp   = new Date(lp);  dp.setDate(dp.getDate() + 6);
  return [
    { id: 'semana',    label: 'Esta semana',    desde: fmtDate(lun),          hasta: fmtDate(hoy) },
    { id: 'sem_ant',   label: 'Sem. pasada',    desde: fmtDate(lp),           hasta: fmtDate(dp)  },
    { id: 'mes',       label: 'Este mes',       desde: fmtDate(new Date(y,m,1)), hasta: fmtDate(hoy) },
    { id: 'mes_ant',   label: 'Mes anterior',   desde: fmtDate(new Date(y,m-1,1)), hasta: fmtDate(new Date(y,m,0)) },
    { id: 'custom',    label: 'Personalizado',  desde: null,                  hasta: null },
  ];
}

/* ─── Constantes de diseño ───────────────────────────────────────────────── */

const PALETTE = {
  ingreso:  '#10b981',
  egreso:   '#f43f5e',
  neutro:   '#64748b',
  primary:  '#6366f1',
  amber:    '#f59e0b',
  borde:    '#e2e8f0',
};

const PIE_COLORS = ['#6366f1','#10b981','#f59e0b','#f43f5e','#0ea5e9','#8b5cf6','#ec4899','#14b8a6'];

const fmtPEN = v =>
  'S/ ' + Number(v||0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtPctN = (v, total) =>
  total > 0 ? ((Math.abs(v) / total) * 100).toFixed(1) + '%' : '—';

/* ─── Secciones del P&L ──────────────────────────────────────────────────── */

const PL_SECTIONS = [
  {
    id:        'ventas',
    label:     'Ventas',
    seccionPL: 'ingresos',
    grupo:     'ingresos',
    color:     '#10b981',
    bg:        '#f0fdf4',
    icon:      'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
    desc:      'Ingresos por ventas del período',
  },
  {
    id:        'costo_materiales',
    label:     'Materiales',
    seccionPL: 'costo_produccion',
    grupo:     'costo_ventas',
    color:     '#f59e0b',
    bg:        '#fffbeb',
    icon:      'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    desc:      'Costo de materiales por lotes producidos',
  },
  {
    id:        'mano_obra',
    label:     'Mano de obra',
    seccionPL: 'costo_produccion',
    grupo:     'costo_ventas',
    color:     '#f97316',
    bg:        '#fff7ed',
    icon:      'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
    desc:      'Pagos de mano de obra taller del período',
  },
  {
    id:        'gastos_op',
    label:     'Gastos operativos',
    seccionPL: 'gastos_operativos',
    grupo:     'gastos',
    color:     '#6366f1',
    bg:        '#eef2ff',
    icon:      'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    desc:      'Alquileres, servicios, suscripciones, etc.',
  },
  {
    id:        'gastos_personal',
    label:     'Personal',
    seccionPL: 'gastos_personal',
    grupo:     'gastos',
    color:     '#8b5cf6',
    bg:        '#f5f3ff',
    icon:      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    desc:      'Sueldos y pagos al personal (tienda y administración)',
  },
  {
    id:        'gastos_financieros',
    label:     'Financieros',
    seccionPL: 'gastos_financieros',
    grupo:     'gastos',
    color:     '#f43f5e',
    bg:        '#fff1f2',
    icon:      'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
    desc:      'Intereses, comisiones y gastos bancarios',
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */

export default function EstadoResultados() {
  const [searchParams, setSearchParams] = useSearchParams();
  const idUbicacionParam = searchParams.get('ubicacion') ? Number(searchParams.get('ubicacion')) : null;

  const presets = getPresetRanges();
  const [preset,    setPreset]    = useState('semana');
  const [customDes, setCustomDes] = useState('');
  const [customHas, setCustomHas] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [ubicacionFiltro, setUbicacionFiltro] = useState(null); // { id_ubicacion, nombre, rol }

  const periodo = useMemo(() => {
    if (preset !== 'custom') {
      return presets.find(p => p.id === preset) || presets[0];
    }
    const hoy = fmtDate(new Date());
    return { id: 'custom', label: 'Personalizado', desde: customDes || hoy, hasta: customHas || hoy };
  }, [preset, customDes, customHas]);

  const [plData,       setPlData]       = useState({ rows: [], loading: true, error: null });
  const [seccionActiva, setSeccionActiva] = useState(null);
  const [drillData,    setDrillData]    = useState({ loading: false, error: null, data: null });

  const panelRef = useRef(null);

  // Cargar nombre de la ubicación filtrada cuando hay parámetro URL
  useEffect(() => {
    if (!idUbicacionParam) { setUbicacionFiltro(null); return; }
    obtenerUbicacion(idUbicacionParam)
      .then(ub => setUbicacionFiltro(ub))
      .catch(() => setUbicacionFiltro({ id_ubicacion: idUbicacionParam, nombre: `Ubicación ${idUbicacionParam}`, rol: null }));
  }, [idUbicacionParam]);

  const limpiarFiltroUbicacion = () => {
    setSearchParams(prev => { prev.delete('ubicacion'); return prev; });
    setUbicacionFiltro(null);
  };

  const cargarPL = useCallback(async () => {
    if (!periodo.desde || !periodo.hasta) return;
    setPlData(p => ({ ...p, loading: true, error: null }));
    try {
      const rows = await obtenerPLResumen(periodo.desde, periodo.hasta, idUbicacionParam);
      setPlData({ rows, loading: false, error: null });
    } catch (e) {
      setPlData({ rows: [], loading: false, error: e.message });
    }
  }, [periodo.desde, periodo.hasta, idUbicacionParam]);

  useEffect(() => { cargarPL(); }, [cargarPL]);

  const cargarDrill = useCallback(async (seccion) => {
    if (!seccion || !periodo.desde || !periodo.hasta) return;
    setDrillData({ loading: true, error: null, data: null });
    try {
      const { desde, hasta } = periodo;
      let data = null;

      if (seccion.id === 'ventas') {
        const [resumen, tiendas, metodos, modelos, porDia, porHora] = await Promise.all([
          obtenerResumenVentas(desde, hasta),
          obtenerVentasPorTienda(desde, hasta),
          obtenerVentasPorMetodo(desde, hasta),
          obtenerTopModelos(desde, hasta, 8),
          obtenerVentasPorDia(desde, hasta),
          obtenerVentasPorHora(desde, hasta),
        ]);
        data = { resumen, tiendas, metodos, modelos, porDia, porHora };

      } else if (seccion.id === 'costo_materiales') {
        const lotes = await obtenerCostoProduccionPeriodo(desde, hasta);
        data = { lotes };

      } else if (seccion.id === 'mano_obra') {
        const [movs, porTrabajador] = await Promise.all([
          obtenerGastosDetallePorSeccion(desde, hasta, 'costo_produccion'),
          obtenerPagosPorTrabajador(desde, hasta),
        ]);
        const filtrado = movs.filter(m => m.costo?.categoria === 'salario');
        data = { movimientos: filtrado, porTrabajador };

      } else if (seccion.id === 'gastos_op') {
        const [movs, porUbic] = await Promise.all([
          obtenerGastosDetallePorSeccion(desde, hasta, 'gastos_operativos'),
          obtenerGastosPorUbicacion(desde, hasta),
        ]);
        data = { movimientos: movs, porUbicacion: porUbic };

      } else if (seccion.id === 'gastos_personal') {
        const [movs, porTrabajador] = await Promise.all([
          obtenerGastosDetallePorSeccion(desde, hasta, 'gastos_personal'),
          obtenerPagosPorTrabajador(desde, hasta),
        ]);
        data = { movimientos: movs, porTrabajador };

      } else if (seccion.id === 'gastos_financieros') {
        const movs = await obtenerGastosDetallePorSeccion(desde, hasta, 'gastos_financieros');
        data = { movimientos: movs };
      }

      setDrillData({ loading: false, error: null, data });
    } catch (e) {
      setDrillData({ loading: false, error: e.message, data: null });
    }
  }, [periodo.desde, periodo.hasta]);

  const handleSeccion = (sec) => {
    const misma = seccionActiva?.id === sec.id;
    setSeccionActiva(misma ? null : sec);
    if (!misma) {
      cargarDrill(sec);
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  };

  /* ── Métricas del P&L ── */
  const metrics = useMemo(() => {
    const m = {};
    (plData.rows || []).forEach(r => { m[r.seccion_pl] = Number(r.monto_total) || 0; });
    const ingresos     = m.ingresos          || 0;
    const costoVentas  = (m.costo_ventas     || 0) + (m.costo_produccion || 0);
    const gastosOp     = m.gastos_operativos || 0;
    const gastosPerso  = m.gastos_personal   || 0;
    const gastosFinan  = m.gastos_financieros|| 0;
    const otrosEgr     = m.otros_egresos     || 0;
    const utilBruta    = ingresos - costoVentas;
    const totalGastos  = gastosOp + gastosPerso + gastosFinan + otrosEgr;
    const utilNeta     = utilBruta - totalGastos;
    const margenBruto  = ingresos > 0 ? (utilBruta / ingresos) * 100 : 0;
    const margenNeto   = ingresos > 0 ? (utilNeta  / ingresos) * 100 : 0;
    return { ingresos, costoVentas, gastosOp, gastosPerso, gastosFinan, otrosEgr,
             utilBruta, totalGastos, utilNeta, margenBruto, margenNeto, raw: m };
  }, [plData.rows]);

  const labelPeriodo = periodo.desde && periodo.hasta
    ? `${fmtDateHuman(periodo.desde)} — ${fmtDateHuman(periodo.hasta)}`
    : 'Selecciona período';

  return (
    <div className="er-root min-h-screen" style={{ fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif" }}>
      <style>{ER_STYLES}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="er-header">
        <div className="er-header-left">
          <div className="er-header-badge">
            <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={18} />
          </div>
          <div>
            <h1 className="er-title">Estado de Resultados</h1>
            <p className="er-subtitle">Análisis financiero del período · {labelPeriodo}</p>
          </div>
        </div>

        {/* Selector de período */}
        <div className="er-period-bar">
          {presets.filter(p => p.id !== 'custom').map(p => (
            <button
              key={p.id}
              onClick={() => { setPreset(p.id); setShowPicker(false); }}
              className={cn('er-period-btn', preset === p.id && 'er-period-btn--active')}
            >
              {p.label}
            </button>
          ))}
          <div className="er-period-custom-wrap">
            <button
              onClick={() => { setPreset('custom'); setShowPicker(v => !v); }}
              className={cn('er-period-btn er-period-btn--custom', preset === 'custom' && 'er-period-btn--active')}
            >
              <Icon d={ICONS.calendar} size={12} />
              {preset === 'custom' && periodo.desde ? labelPeriodo : 'Personalizado'}
            </button>
            {showPicker && preset === 'custom' && (
              <div className="er-date-picker">
                <label className="er-date-label">Desde</label>
                <input type="date" className="er-date-input" value={customDes}
                  onChange={e => setCustomDes(e.target.value)} max={customHas || undefined} />
                <label className="er-date-label">Hasta</label>
                <input type="date" className="er-date-input" value={customHas}
                  onChange={e => setCustomHas(e.target.value)} min={customDes || undefined} />
                <button className="er-date-apply" onClick={() => setShowPicker(false)}>Aplicar</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ BANNER FILTRO UBICACIÓN ════════════════════════════════════════ */}
      {ubicacionFiltro && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 0 0',
          padding: '10px 20px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
          fontSize: 13, color: '#1e40af',
        }}>
          <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" size={15} style={{ color: '#3b82f6' }} />
          <span>
            Filtrando por: <strong>{ubicacionFiltro.nombre}</strong>
            {ubicacionFiltro.rol && <span style={{ fontWeight: 400, color: '#3b82f6', marginLeft: 4 }}>({ubicacionFiltro.rol})</span>}
          </span>
          <Link
            to={`/gestion/ubicaciones/${ubicacionFiltro.id_ubicacion}`}
            style={{ marginLeft: 4, color: '#3b82f6', textDecoration: 'underline', fontSize: 12 }}
          >
            Ver hub
          </Link>
          <button
            onClick={limpiarFiltroUbicacion}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <Icon d={ICONS.x} size={13} /> Quitar filtro
          </button>
        </div>
      )}

      {/* ══ KPI STRIP ═══════════════════════════════════════════════════════ */}
      {!plData.loading && (
        <div className="er-kpi-strip">
          <KpiStrip metrics={metrics} />
        </div>
      )}

      {/* ══ MAIN GRID ═══════════════════════════════════════════════════════ */}
      <div className="er-main">

        {/* ── COLUMNA IZQUIERDA: P&L ── */}
        <aside className="er-pl-col">
          <div className="er-pl-card">
            <p className="er-pl-header-label">Estado de Resultados</p>

            {plData.loading ? (
              <PLSkeleton />
            ) : plData.error ? (
              <div className="er-error">{plData.error}</div>
            ) : (
              <PLTree
                metrics={metrics}
                seccionActiva={seccionActiva}
                onSeccion={handleSeccion}
                periodo={periodo}
              />
            )}
          </div>
        </aside>

        {/* ── COLUMNA DERECHA: PANEL DE VISUALIZACIÓN ── */}
        <main ref={panelRef} className="er-viz-col">
          {!seccionActiva ? (
            <PanelResumen metrics={metrics} loading={plData.loading} periodo={periodo} />
          ) : (
            <PanelDrill
              seccion={seccionActiva}
              drillData={drillData}
              periodo={periodo}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KPI STRIP
   ══════════════════════════════════════════════════════════════════════════ */

function KpiStrip({ metrics }) {
  const items = [
    { label: 'Ingresos',      value: metrics.ingresos,   color: '#10b981', sign: '+' },
    { label: 'Costo de vtas', value: metrics.costoVentas, color: '#f59e0b', sign: '-' },
    { label: 'Utilidad bruta',value: metrics.utilBruta,   color: metrics.utilBruta >= 0 ? '#10b981' : '#f43f5e', sign: '' },
    { label: 'Gastos totales',value: metrics.totalGastos, color: '#6366f1', sign: '-' },
    { label: 'Utilidad neta', value: metrics.utilNeta,    color: metrics.utilNeta >= 0 ? '#10b981' : '#f43f5e', sign: '' },
    { label: 'Margen neto',   value: null,                color: metrics.margenNeto >= 0 ? '#10b981' : '#f43f5e', sign: '', pct: metrics.margenNeto.toFixed(1) + '%' },
  ];
  return (
    <div className="er-kpi-row">
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          <div className="er-kpi-item">
            <span className="er-kpi-label">{item.label}</span>
            <span className="er-kpi-value" style={{ color: item.color }}>
              {item.pct ?? fmtPEN(item.value)}
            </span>
          </div>
          {i < items.length - 1 && <div className="er-kpi-sep" />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   P&L TREE
   ══════════════════════════════════════════════════════════════════════════ */

function PLTree({ metrics, seccionActiva, onSeccion, periodo }) {
  const { ingresos, costoVentas, utilBruta, totalGastos, utilNeta,
          margenBruto, margenNeto, gastosOp, gastosPerso, gastosFinan } = metrics;

  return (
    <div className="er-pl-tree">

      {/* INGRESOS */}
      <PLGroup label="INGRESOS" positive>
        <PLRow
          seccion={PL_SECTIONS[0]}
          value={ingresos}
          total={ingresos}
          active={seccionActiva?.id === 'ventas'}
          onClick={() => onSeccion(PL_SECTIONS[0])}
          sign="+"
        />
      </PLGroup>

      {/* COSTO DE VENTAS */}
      <PLGroup label="COSTO DE VENTAS">
        <PLRow
          seccion={PL_SECTIONS[1]}
          value={metrics.raw?.costo_produccion || 0}
          total={ingresos}
          active={seccionActiva?.id === 'costo_materiales'}
          onClick={() => onSeccion(PL_SECTIONS[1])}
          sign="-"
        />
        <PLRow
          seccion={PL_SECTIONS[2]}
          value={metrics.raw?.costo_produccion || 0}
          total={ingresos}
          active={seccionActiva?.id === 'mano_obra'}
          onClick={() => onSeccion(PL_SECTIONS[2])}
          sign="-"
          hint="Pagos taller"
        />
      </PLGroup>

      {/* UTILIDAD BRUTA */}
      <PLSubtotal
        label="Utilidad Bruta"
        value={utilBruta}
        pct={margenBruto}
        level="bruta"
      />

      {/* GASTOS */}
      <PLGroup label="GASTOS OPERATIVOS">
        <PLRow
          seccion={PL_SECTIONS[3]}
          value={gastosOp}
          total={ingresos}
          active={seccionActiva?.id === 'gastos_op'}
          onClick={() => onSeccion(PL_SECTIONS[3])}
          sign="-"
        />
        <PLRow
          seccion={PL_SECTIONS[4]}
          value={gastosPerso}
          total={ingresos}
          active={seccionActiva?.id === 'gastos_personal'}
          onClick={() => onSeccion(PL_SECTIONS[4])}
          sign="-"
        />
        <PLRow
          seccion={PL_SECTIONS[5]}
          value={gastosFinan}
          total={ingresos}
          active={seccionActiva?.id === 'gastos_financieros'}
          onClick={() => onSeccion(PL_SECTIONS[5])}
          sign="-"
        />
      </PLGroup>

      {/* UTILIDAD NETA */}
      <PLSubtotal
        label="Utilidad Neta"
        value={utilNeta}
        pct={margenNeto}
        level="neta"
      />

      <p className="er-pl-hint">Toca una línea para explorar el detalle →</p>
    </div>
  );
}

function PLGroup({ label, positive, children }) {
  return (
    <div className="er-pl-group">
      <p className={cn('er-pl-group-label', positive && 'er-pl-group-label--pos')}>{label}</p>
      <div className="er-pl-group-items">{children}</div>
    </div>
  );
}

function PLRow({ seccion, value, total, active, onClick, sign, hint }) {
  const pct = total > 0 ? (Math.abs(value) / total) * 100 : 0;
  return (
    <button
      onClick={onClick}
      className={cn('er-pl-row', active && 'er-pl-row--active')}
      style={active ? { '--row-color': seccion.color, background: seccion.bg } : { '--row-color': seccion.color }}
    >
      <div className="er-pl-row-icon" style={{ background: seccion.bg }}>
        <Icon d={seccion.icon} size={11} style={{ color: seccion.color }} />
      </div>
      <div className="er-pl-row-info">
        <span className="er-pl-row-label">{seccion.label}</span>
        {hint && <span className="er-pl-row-hint">{hint}</span>}
      </div>
      <div className="er-pl-row-right">
        <span className="er-pl-row-value" style={{ color: sign === '+' ? '#10b981' : sign === '-' ? '#64748b' : '#1e293b' }}>
          {sign}{fmtPEN(value)}
        </span>
        {total > 0 && <span className="er-pl-row-pct">{pct.toFixed(0)}%</span>}
      </div>
      <Icon d="M9 18l6-6-6-6" size={10} className={cn('er-pl-row-arrow', active && 'er-pl-row-arrow--active')} />
    </button>
  );
}

function PLSubtotal({ label, value, pct, level }) {
  const positive = value >= 0;
  return (
    <div className={cn('er-pl-subtotal', `er-pl-subtotal--${level}`)}>
      <div className="er-pl-subtotal-inner">
        <span className="er-pl-subtotal-label">{label}</span>
        <div className="er-pl-subtotal-nums">
          <span className={cn('er-pl-subtotal-value', positive ? 'er-pos' : 'er-neg')}>
            {fmtPEN(value)}
          </span>
          <span className={cn('er-pl-subtotal-pct', positive ? 'er-pos' : 'er-neg')}>
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className={cn('er-pl-subtotal-bar', positive ? 'er-bar-pos' : 'er-bar-neg')}
        style={{ width: `${Math.min(Math.abs(pct), 100)}%` }} />
    </div>
  );
}

function PLSkeleton() {
  return (
    <div className="space-y-3 p-2">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="h-9 rounded-xl bg-slate-100 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PANEL RESUMEN (por defecto)
   ══════════════════════════════════════════════════════════════════════════ */

function PanelResumen({ metrics, loading, periodo }) {
  const { ingresos, costoVentas, utilBruta, totalGastos, utilNeta, margenBruto, margenNeto } = metrics;

  const waterfallData = [
    { name: 'Ingresos',       valor: ingresos,    tipo: 'pos' },
    { name: 'Costo vtas',     valor: -costoVentas, tipo: 'neg' },
    { name: 'Util. bruta',    valor: utilBruta,   tipo: utilBruta >= 0 ? 'pos' : 'neg' },
    { name: 'Gastos',         valor: -totalGastos, tipo: 'neg' },
    { name: 'Util. neta',     valor: utilNeta,    tipo: utilNeta >= 0 ? 'pos' : 'neg' },
  ];

  const pieData = [
    { name: 'Costo ventas', value: costoVentas,  fill: '#f59e0b' },
    { name: 'Gastos op.',   value: metrics.gastosOp,   fill: '#6366f1' },
    { name: 'Personal',     value: metrics.gastosPerso, fill: '#8b5cf6' },
    { name: 'Financieros',  value: metrics.gastosFinan, fill: '#f43f5e' },
    { name: 'Utilidad',     value: Math.max(utilNeta, 0), fill: '#10b981' },
  ].filter(d => d.value > 0);

  if (loading) {
    return (
      <div className="er-viz-card er-viz-empty">
        <div className="er-viz-spinner"><Spinner size={28} /></div>
        <p>Calculando resultados…</p>
      </div>
    );
  }

  return (
    <div className="er-viz-card">
      <div className="er-viz-card-header">
        <div>
          <h2 className="er-viz-title">Resumen del período</h2>
          <p className="er-viz-sub">Toca una línea del P&L para explorar cada sección</p>
        </div>
      </div>

      {ingresos === 0 && costoVentas === 0 && totalGastos === 0 ? (
        <EmptyViz message="Sin datos registrados en este período" />
      ) : (
        <>
          {/* Waterfall / resultado */}
          <div className="er-section">
            <p className="er-section-label">Cascada de resultados</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={waterfallData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.borde} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `S/${Math.abs(v/1000).toFixed(0)}k`} width={44} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }}
                  formatter={v => [fmtPEN(Math.abs(v))]}
                />
                <Bar dataKey="valor" radius={[5, 5, 0, 0]} maxBarSize={52}>
                  {waterfallData.map((d, i) => (
                    <Cell key={i} fill={d.tipo === 'pos' ? PALETTE.ingreso : d.tipo === 'neg' ? PALETTE.egreso : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Distribución de egresos */}
          <div className="er-section">
            <p className="er-section-label">Distribución de uso de ingresos</p>
            <div className="er-pie-row">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }}
                    formatter={v => [fmtPEN(v)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="er-pie-legend">
                {pieData.map((d, i) => (
                  <div key={i} className="er-legend-row">
                    <span className="er-legend-dot" style={{ background: d.fill }} />
                    <span className="er-legend-name">{d.name}</span>
                    <span className="er-legend-val">{fmtPEN(d.value)}</span>
                    {ingresos > 0 && (
                      <span className="er-legend-pct">({((d.value / ingresos) * 100).toFixed(0)}%)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Métricas de márgenes */}
          <div className="er-margins-row">
            <MarginBadge label="Margen bruto" value={margenBruto} />
            <MarginBadge label="Margen neto"  value={margenNeto} />
            <MarginBadge label="ROI aprox."   value={utilNeta > 0 && totalGastos > 0 ? (utilNeta / (costoVentas + totalGastos)) * 100 : 0} />
          </div>
        </>
      )}
    </div>
  );
}

function MarginBadge({ label, value }) {
  const positive = value >= 0;
  return (
    <div className="er-margin-badge">
      <p className="er-margin-label">{label}</p>
      <p className={cn('er-margin-value', positive ? 'er-pos' : 'er-neg')}>
        {value.toFixed(1)}%
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PANEL DRILL-DOWN (por sección)
   ══════════════════════════════════════════════════════════════════════════ */

function PanelDrill({ seccion, drillData, periodo }) {
  const [subView, setSubView] = useState(null);

  useEffect(() => { setSubView(null); }, [seccion.id]);

  if (drillData.loading) {
    return (
      <div className="er-viz-card er-viz-empty">
        <div className="er-viz-spinner"><Spinner size={28} /></div>
        <p>Cargando {seccion.label}…</p>
      </div>
    );
  }
  if (drillData.error) {
    return <div className="er-viz-card er-viz-empty er-error">{drillData.error}</div>;
  }

  const d = drillData.data;
  if (!d) return null;

  return (
    <div className="er-viz-card">
      {/* Cabecera de sección */}
      <div className="er-drill-header" style={{ borderLeftColor: seccion.color }}>
        <div className="er-drill-icon" style={{ background: seccion.bg }}>
          <Icon d={seccion.icon} size={16} style={{ color: seccion.color }} />
        </div>
        <div>
          <h2 className="er-viz-title">{seccion.label}</h2>
          <p className="er-viz-sub">{seccion.desc} · {fmtDateHuman(periodo.desde)} – {fmtDateHuman(periodo.hasta)}</p>
        </div>
      </div>

      {seccion.id === 'ventas'              && <DrillVentas     data={d} subView={subView} setSubView={setSubView} />}
      {seccion.id === 'costo_materiales'    && <DrillMateriales data={d} />}
      {seccion.id === 'mano_obra'           && <DrillPersonal   data={d} titulo="Mano de obra — Taller" />}
      {seccion.id === 'gastos_op'           && <DrillGastosOp   data={d} />}
      {seccion.id === 'gastos_personal'     && <DrillPersonal   data={d} titulo="Gastos de personal" />}
      {seccion.id === 'gastos_financieros'  && <DrillMovimientos data={d.movimientos} titulo="Gastos financieros" />}
    </div>
  );
}

/* ── Drill: Ventas ─────────────────────────────────────────────────────── */

const VENTA_VIEWS = [
  { id: 'tienda', label: 'Por tienda' },
  { id: 'dia',    label: 'Por día' },
  { id: 'hora',   label: 'Por hora' },
  { id: 'modelo', label: 'Top modelos' },
  { id: 'metodo', label: 'Método de pago' },
];

function DrillVentas({ data, subView, setSubView }) {
  const { resumen, tiendas, metodos, modelos, porDia, porHora } = data;
  const view = subView || 'tienda';

  return (
    <div>
      {/* KPIs de ventas */}
      <div className="er-kpi-mini-row">
        <KpiMini label="Total ventas"  value={fmtPEN(resumen?.total)}  color="#10b981" />
        <KpiMini label="N° de ventas"  value={resumen?.cantidad ?? 0}  color="#6366f1" />
        <KpiMini label="Ticket prom."  value={fmtPEN(resumen?.ticket)} color="#f59e0b" />
      </div>

      {/* Sub-views */}
      <div className="er-sub-tabs">
        {VENTA_VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setSubView(v.id)}
            className={cn('er-sub-tab', view === v.id && 'er-sub-tab--active')}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'tienda' && (
        tiendas.length === 0 ? <EmptyViz message="Sin ventas por tienda en el período" /> : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tiendas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.borde} vertical={false} />
                <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `S/${(v/1000).toFixed(0)}k`} width={44} />
                <Tooltip contentStyle={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12 }}
                  formatter={v => [fmtPEN(v),'Total']} />
                <Bar dataKey="total" fill={PALETTE.primary} radius={[6,6,0,0]} maxBarSize={52}>
                  {tiendas.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <DrillTable
              cols={['Tienda', 'Ventas', 'Monto', 'Ticket']}
              rows={tiendas.map(t => [t.nombre, t.cantidad, fmtPEN(t.total), t.cantidad > 0 ? fmtPEN(t.total / t.cantidad) : '—'])}
            />
          </>
        )
      )}

      {view === 'dia' && (
        porDia.length === 0 ? <EmptyViz message="Sin ventas en el período" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={porDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ventasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.borde} vertical={false} />
              <XAxis dataKey="fecha" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={s => fmtDateHuman(s)} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `S/${(v/1000).toFixed(0)}k`} width={44} />
              <Tooltip contentStyle={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12 }}
                formatter={v => [fmtPEN(v),'Ventas']} labelFormatter={s => fmtDateHuman(s)} />
              <Area dataKey="total" stroke="#10b981" strokeWidth={2.5} fill="url(#ventasGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )
      )}

      {view === 'hora' && (
        <HeatmapHoras data={porHora} />
      )}

      {view === 'modelo' && (
        modelos.length === 0 ? <EmptyViz message="Sin datos de modelos" /> : (
          <DrillTable
            cols={['#', 'Modelo', 'Marca', 'Pares', 'Monto']}
            rows={modelos.map((m, i) => [i + 1, m.nombre, m.marca || '—', m.pares, fmtPEN(m.monto)])}
            highlightLast
          />
        )
      )}

      {view === 'metodo' && (
        metodos.length === 0 ? <EmptyViz message="Sin datos de métodos" /> : (
          <div className="er-pie-row">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={metodos} dataKey="total" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {metodos.map((m, i) => <Cell key={i} fill={m.fill || PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12 }}
                  formatter={v => [fmtPEN(v)]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="er-pie-legend">
              {metodos.map((m, i) => {
                const tot = metodos.reduce((s, x) => s + x.total, 0);
                return (
                  <div key={i} className="er-legend-row">
                    <span className="er-legend-dot" style={{ background: m.fill || PIE_COLORS[i] }} />
                    <span className="er-legend-name">{m.metodo}</span>
                    <span className="er-legend-val">{fmtPEN(m.total)}</span>
                    {tot > 0 && <span className="er-legend-pct">({((m.total/tot)*100).toFixed(0)}%)</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function HeatmapHoras({ data }) {
  if (!data || data.length === 0) return <EmptyViz message="Sin datos por hora" />;
  const maxVal = Math.max(...data.map(h => h.total), 1);
  return (
    <div>
      <p className="er-section-label mb-3">Ventas por hora del día</p>
      <div className="er-heatmap">
        {data.map(h => {
          const intensity = h.total / maxVal;
          return (
            <div key={h.hora} className="er-heatmap-cell" title={`${h.label}: ${fmtPEN(h.total)}`}>
              <div
                className="er-heatmap-bar"
                style={{
                  height: `${Math.max(intensity * 100, 4)}%`,
                  background: `rgba(99,102,241,${0.1 + intensity * 0.9})`,
                }}
              />
              <span className="er-heatmap-label">{h.label.slice(0, 2)}</span>
              {h.total > 0 && (
                <span className="er-heatmap-val">{fmtPEN(h.total)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Drill: Materiales / Producción ────────────────────────────────────── */

function DrillMateriales({ data }) {
  const { lotes } = data;
  const total = lotes.reduce((s, l) => s + (Number(l.costo_total_lote) || 0), 0);
  const pares  = lotes.reduce((s, l) => s + (Number(l.cantidad_total)  || 0), 0);

  return (
    <div>
      <div className="er-kpi-mini-row">
        <KpiMini label="Costo total producción" value={fmtPEN(total)} color="#f59e0b" />
        <KpiMini label="Lotes producidos"        value={lotes.length}                    color="#6366f1" />
        <KpiMini label="Pares producidos"        value={pares}                           color="#10b981" />
      </div>

      {lotes.length === 0 ? (
        <EmptyViz message="Sin lotes de producción en el período" />
      ) : (
        <>
          <p className="er-section-label mt-4">Lotes producidos en el período</p>
          <div className="er-table-wrap">
            <table className="er-table">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th className="er-th-r">Pares</th>
                  <th className="er-th-r">Costo total</th>
                  <th className="er-th-r">Costo/par</th>
                  <th className="er-th-r">Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lotes.map(l => {
                  const costoPar = l.cantidad_total > 0
                    ? (Number(l.costo_total_lote) || 0) / Number(l.cantidad_total)
                    : 0;
                  return (
                    <tr key={l.id_lote}>
                      <td>{l.productos?.nombre_modelo || '—'}</td>
                      <td className="er-td-r">{l.cantidad_total}</td>
                      <td className="er-td-r er-bold">{fmtPEN(l.costo_total_lote)}</td>
                      <td className="er-td-r">{fmtPEN(costoPar)}</td>
                      <td className="er-td-r er-muted">{l.fecha_produccion?.slice(0, 10) || '—'}</td>
                      <td>
                        <a
                          href={`/?vista=catalogo${l.productos?.id_producto ? `&modelo=${l.productos.id_producto}` : ''}`}
                          target="_blank"
                          rel="noreferrer"
                          className="er-link-btn"
                          title="Ver catálogo de materiales"
                        >
                          <Icon d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" size={11} />
                          Catálogo
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="er-tfoot">
                  <td>Total</td>
                  <td className="er-td-r">{pares}</td>
                  <td className="er-td-r er-bold" style={{ color: '#f59e0b' }}>{fmtPEN(total)}</td>
                  <td className="er-td-r">{pares > 0 ? fmtPEN(total / pares) : '—'}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Drill: Personal / Mano de obra ────────────────────────────────────── */

function DrillPersonal({ data, titulo }) {
  const { movimientos, porTrabajador } = data;
  const total = (movimientos || []).reduce((s, m) => s + Number(m.monto), 0);

  return (
    <div>
      <div className="er-kpi-mini-row">
        <KpiMini label="Total pagado" value={fmtPEN(total)}               color="#8b5cf6" />
        <KpiMini label="Pagos"        value={movimientos?.length ?? 0}    color="#6366f1" />
        <KpiMini label="Personas"     value={porTrabajador?.length ?? 0}  color="#10b981" />
      </div>

      {(porTrabajador || []).length === 0 ? (
        <EmptyViz message={`Sin ${titulo.toLowerCase()} registrados en el período`} />
      ) : (
        <>
          <p className="er-section-label mt-4">Por persona</p>
          <div className="er-workers-list">
            {(porTrabajador || []).map((t, i) => (
              <div key={i} className="er-worker-row">
                <div className="er-worker-avatar">
                  {t.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="er-worker-info">
                  <span className="er-worker-name">{t.nombre}</span>
                  <span className="er-worker-meta">{t.pagos} pago{t.pagos !== 1 ? 's' : ''}</span>
                </div>
                <div className="er-worker-right">
                  <span className="er-worker-monto">{fmtPEN(t.total)}</span>
                  {total > 0 && (
                    <span className="er-worker-pct">{((t.total / total) * 100).toFixed(0)}%</span>
                  )}
                </div>
                <div className="er-worker-bar-wrap">
                  <div className="er-worker-bar" style={{ width: `${total > 0 ? (t.total/total)*100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <p className="er-section-label mt-4">Movimientos</p>
          <DrillMovimientos data={movimientos} titulo={titulo} compact />
        </>
      )}
    </div>
  );
}

/* ── Drill: Gastos Operativos ───────────────────────────────────────────── */

function DrillGastosOp({ data }) {
  const { movimientos, porUbicacion } = data;
  const total = (movimientos || []).reduce((s, m) => s + Number(m.monto), 0);

  const porCategoria = {};
  (movimientos || []).forEach(m => {
    const cat = m.costo?.categoria || m.categoria || 'otro';
    if (!porCategoria[cat]) porCategoria[cat] = 0;
    porCategoria[cat] += Number(m.monto) || 0;
  });
  const catData = Object.entries(porCategoria)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="er-kpi-mini-row">
        <KpiMini label="Total gastos op." value={fmtPEN(total)}            color="#6366f1" />
        <KpiMini label="Movimientos"      value={movimientos?.length ?? 0} color="#8b5cf6" />
        <KpiMini label="Ubicaciones"      value={porUbicacion?.length ?? 0} color="#f59e0b" />
      </div>

      {(movimientos || []).length === 0 ? (
        <EmptyViz message="Sin gastos operativos en el período" />
      ) : (
        <>
          {catData.length > 0 && (
            <>
              <p className="er-section-label mt-4">Por categoría</p>
              <div className="er-pie-row">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" cx="50%" cy="50%" outerRadius={72} innerRadius={32}>
                      {catData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12 }}
                      formatter={v => [fmtPEN(v)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="er-pie-legend">
                  {catData.map((d, i) => (
                    <div key={i} className="er-legend-row">
                      <span className="er-legend-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="er-legend-name er-capitalize">{d.name}</span>
                      <span className="er-legend-val">{fmtPEN(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {(porUbicacion || []).length > 1 && (
            <>
              <p className="er-section-label mt-4">Por ubicación</p>
              <DrillTable
                cols={['Ubicación', 'Movimientos', 'Total']}
                rows={(porUbicacion || []).map(u => [u.nombre, u.cantidad, fmtPEN(u.total)])}
                highlightLast
              />
            </>
          )}

          <p className="er-section-label mt-4">Detalle de movimientos</p>
          <DrillMovimientos data={movimientos} titulo="Gastos operativos" compact />
        </>
      )}
    </div>
  );
}

/* ── Drill: Movimientos genérico ────────────────────────────────────────── */

function DrillMovimientos({ data, titulo, compact }) {
  const movs = data || [];
  if (movs.length === 0) return <EmptyViz message={`Sin ${titulo?.toLowerCase() || 'movimientos'} en el período`} />;
  return (
    <div className="er-table-wrap">
      <table className="er-table">
        <thead>
          <tr>
            <th>Concepto</th>
            {!compact && <th>Cuenta P&L</th>}
            <th className="er-th-r">Monto</th>
            <th className="er-th-r">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {movs.map(m => (
            <tr key={m.id_movimiento}>
              <td>
                <div className="er-concep">{m.concepto || m.costo?.nombre || '—'}</div>
                {m.ubicaciones?.nombre && <div className="er-concep-sub">{m.ubicaciones.nombre}</div>}
              </td>
              {!compact && <td className="er-muted">{m.cuenta_contable?.nombre || '—'}</td>}
              <td className="er-td-r er-bold er-neg">{fmtPEN(m.monto)}</td>
              <td className="er-td-r er-muted">{m.fecha_movimiento?.slice(0, 10) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Helpers UI ─────────────────────────────────────────────────────────── */

function KpiMini({ label, value, color }) {
  return (
    <div className="er-kpi-mini">
      <p className="er-kpi-mini-label">{label}</p>
      <p className="er-kpi-mini-value" style={{ color }}>{value}</p>
    </div>
  );
}

function DrillTable({ cols, rows, highlightLast }) {
  return (
    <div className="er-table-wrap">
      <table className="er-table">
        <thead>
          <tr>{cols.map(c => <th key={c} className={c !== cols[0] ? 'er-th-r' : ''}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={cn(j > 0 ? 'er-td-r' : '', highlightLast && j === row.length - 1 ? 'er-bold er-pos' : '')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyViz({ message }) {
  return (
    <div className="er-empty">
      <div className="er-empty-icon">
        <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" size={28} />
      </div>
      <p>{message}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ESTILOS INLINE (scoped al módulo)
   ══════════════════════════════════════════════════════════════════════════ */

const ER_STYLES = `
/* ── root ── */
.er-root {
  --er-radius: 14px;
  --er-font: 'Inter', 'DM Sans', system-ui, sans-serif;
  --er-bg: #f8fafc;
  --er-card: #ffffff;
  --er-border: #e2e8f0;
  --er-muted: #94a3b8;
  --er-text: #0f172a;
  --er-text2: #475569;
  --er-pos: #10b981;
  --er-neg: #f43f5e;
  background: var(--er-bg);
  font-family: var(--er-font);
  color: var(--er-text);
  -webkit-font-smoothing: antialiased;
}

/* ── header ── */
.er-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 0 0 20px 0;
  border-bottom: 1px solid var(--er-border);
  margin-bottom: 16px;
}
.er-header-left { display: flex; align-items: center; gap: 14px; }
.er-header-badge {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  color: white; flex-shrink: 0;
}
.er-title {
  font-size: 20px; font-weight: 700; letter-spacing: -0.4px;
  color: var(--er-text); margin: 0;
  font-family: var(--er-font);
}
.er-subtitle {
  font-size: 12px; color: var(--er-muted); margin: 2px 0 0; font-weight: 400;
}

/* ── period bar ── */
.er-period-bar {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
}
.er-period-btn {
  padding: 5px 12px; font-size: 12px; font-weight: 500;
  border-radius: 8px; border: 1px solid var(--er-border);
  background: var(--er-card); color: var(--er-text2);
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
  display: flex; align-items: center; gap: 5px;
  font-family: var(--er-font);
}
.er-period-btn:hover { border-color: #6366f1; color: #6366f1; }
.er-period-btn--active {
  background: #6366f1; color: white; border-color: #6366f1;
}
.er-period-btn--custom { gap: 5px; }
.er-period-custom-wrap { position: relative; }
.er-date-picker {
  position: absolute; top: calc(100% + 8px); right: 0;
  background: var(--er-card); border: 1px solid var(--er-border);
  border-radius: var(--er-radius); padding: 16px; z-index: 50;
  display: flex; flex-direction: column; gap: 8px; min-width: 200px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.12);
}
.er-date-label { font-size: 11px; font-weight: 600; color: var(--er-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.er-date-input {
  padding: 7px 10px; font-size: 13px; border: 1px solid var(--er-border);
  border-radius: 8px; outline: none; width: 100%;
  font-family: var(--er-font); color: var(--er-text);
}
.er-date-input:focus { border-color: #6366f1; }
.er-date-apply {
  padding: 8px; background: #6366f1; color: white; border: none;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  margin-top: 4px; font-family: var(--er-font);
}

/* ── kpi strip ── */
.er-kpi-strip {
  margin-bottom: 16px;
  background: var(--er-card);
  border: 1px solid var(--er-border);
  border-radius: var(--er-radius);
  padding: 12px 20px;
}
.er-kpi-row { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
.er-kpi-item { display: flex; flex-direction: column; gap: 2px; padding: 4px 16px; }
.er-kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--er-muted); }
.er-kpi-value { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
.er-kpi-sep { width: 1px; height: 32px; background: var(--er-border); margin: 0 4px; }

/* ── main layout ── */
.er-main {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .er-main { grid-template-columns: 1fr; }
  .er-kpi-row { gap: 8px; }
  .er-kpi-sep { display: none; }
  .er-kpi-item { padding: 4px 8px; }
}

/* ── P&L card ── */
.er-pl-col { position: sticky; top: 24px; }
.er-pl-card {
  background: var(--er-card);
  border: 1px solid var(--er-border);
  border-radius: var(--er-radius);
  overflow: hidden;
}
.er-pl-header-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--er-muted);
  padding: 14px 18px 10px; border-bottom: 1px solid var(--er-border);
}

/* ── P&L tree ── */
.er-pl-tree { padding: 8px 0; }
.er-pl-group { margin-bottom: 2px; }
.er-pl-group-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #c4cdd8;
  padding: 10px 18px 4px;
}
.er-pl-group-label--pos { color: #86efac; }
.er-pl-group-items { display: flex; flex-direction: column; }

.er-pl-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; cursor: pointer;
  border: none; background: transparent; width: 100%; text-align: left;
  transition: all 0.15s; position: relative;
  border-left: 3px solid transparent;
  font-family: var(--er-font);
}
.er-pl-row:hover { background: #f8fafc; }
.er-pl-row--active {
  border-left-color: var(--row-color, #6366f1) !important;
}
.er-pl-row-icon {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.er-pl-row-info { flex: 1; min-width: 0; }
.er-pl-row-label { font-size: 13px; font-weight: 500; color: var(--er-text); display: block; }
.er-pl-row-hint { font-size: 10px; color: var(--er-muted); display: block; }
.er-pl-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
.er-pl-row-value { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.er-pl-row-pct { font-size: 10px; color: var(--er-muted); font-variant-numeric: tabular-nums; }
.er-pl-row-arrow { color: var(--er-muted); transition: transform 0.2s; }
.er-pl-row-arrow--active { transform: rotate(90deg); color: #6366f1; }

/* ── P&L subtotals ── */
.er-pl-subtotal {
  margin: 6px 10px; border-radius: 10px;
  overflow: hidden; border: 1px solid var(--er-border);
}
.er-pl-subtotal--neta { border-color: #ddd6fe; background: #faf5ff; }
.er-pl-subtotal-inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
}
.er-pl-subtotal-label { font-size: 12px; font-weight: 700; color: var(--er-text); }
.er-pl-subtotal-nums { display: flex; align-items: center; gap: 8px; }
.er-pl-subtotal-value { font-size: 16px; font-weight: 800; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; }
.er-pl-subtotal-pct { font-size: 11px; font-weight: 600; }
.er-pl-subtotal-bar { height: 3px; transition: width 0.6s ease; }
.er-bar-pos { background: linear-gradient(90deg, #10b981, #34d399); }
.er-bar-neg { background: linear-gradient(90deg, #f43f5e, #fb7185); }

.er-pl-hint {
  font-size: 10px; color: var(--er-muted); text-align: center;
  padding: 12px 16px 8px; font-style: italic;
}

/* ── viz card ── */
.er-viz-col { min-height: 400px; }
.er-viz-card {
  background: var(--er-card);
  border: 1px solid var(--er-border);
  border-radius: var(--er-radius);
  padding: 20px;
}
.er-viz-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; min-height: 320px;
  color: var(--er-muted); font-size: 14px;
}
.er-viz-spinner { color: #6366f1; }
.er-viz-card-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 20px;
}
.er-viz-title { font-size: 16px; font-weight: 700; color: var(--er-text); margin: 0; letter-spacing: -0.2px; }
.er-viz-sub { font-size: 12px; color: var(--er-muted); margin: 3px 0 0; }

/* ── drill header ── */
.er-drill-header {
  display: flex; align-items: center; gap: 14px;
  border-left: 4px solid #6366f1; padding-left: 14px;
  margin-bottom: 20px;
}
.er-drill-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* ── sub-tabs ── */
.er-sub-tabs {
  display: flex; gap: 4px; flex-wrap: wrap;
  margin-bottom: 16px; padding-bottom: 12px;
  border-bottom: 1px solid var(--er-border);
}
.er-sub-tab {
  padding: 5px 12px; font-size: 12px; font-weight: 500;
  border-radius: 20px; border: 1px solid var(--er-border);
  background: transparent; color: var(--er-text2);
  cursor: pointer; transition: all 0.15s;
  font-family: var(--er-font);
}
.er-sub-tab:hover { border-color: #6366f1; color: #6366f1; }
.er-sub-tab--active { background: #6366f1; color: white; border-color: #6366f1; }

/* ── kpi mini ── */
.er-kpi-mini-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 16px; }
.er-kpi-mini {
  background: #f8fafc; border: 1px solid var(--er-border);
  border-radius: 10px; padding: 12px 14px;
}
.er-kpi-mini-label { font-size: 10px; font-weight: 600; color: var(--er-muted); text-transform: uppercase; letter-spacing: 0.07em; margin: 0 0 4px; }
.er-kpi-mini-value { font-size: 18px; font-weight: 800; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; margin: 0; }

/* ── section label ── */
.er-section-label { font-size: 11px; font-weight: 700; color: var(--er-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; display: block; }
.er-section { margin-bottom: 20px; }

/* ── pie row ── */
.er-pie-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.er-pie-legend { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 140px; }
.er-legend-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.er-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.er-legend-name { flex: 1; color: var(--er-text2); }
.er-legend-val { font-weight: 700; color: var(--er-text); font-variant-numeric: tabular-nums; }
.er-legend-pct { color: var(--er-muted); font-size: 11px; }

/* ── margins ── */
.er-margins-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 16px; }
.er-margin-badge { text-align: center; padding: 12px; background: #f8fafc; border: 1px solid var(--er-border); border-radius: 10px; }
.er-margin-label { font-size: 10px; font-weight: 600; color: var(--er-muted); text-transform: uppercase; letter-spacing: 0.07em; }
.er-margin-value { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 4px 0 0; }

/* ── table ── */
.er-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--er-border); margin-top: 8px; }
.er-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.er-table th { padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--er-muted); background: #f8fafc; border-bottom: 1px solid var(--er-border); }
.er-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: var(--er-text); }
.er-table tr:last-child td { border-bottom: none; }
.er-table tr:hover td { background: #f8fafc; }
.er-th-r { text-align: right !important; }
.er-td-r { text-align: right !important; }
.er-tfoot td { font-weight: 700; background: #f8fafc; border-top: 2px solid var(--er-border); }
.er-bold { font-weight: 700; }
.er-muted { color: var(--er-muted) !important; }
.er-pos { color: var(--er-pos) !important; }
.er-neg { color: var(--er-neg) !important; }
.er-capitalize { text-transform: capitalize; }
.er-concep { font-weight: 500; }
.er-concep-sub { font-size: 11px; color: var(--er-muted); }

/* ── workers ── */
.er-workers-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.er-worker-row {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center;
  gap: 10px; padding: 10px 14px;
  background: #f8fafc; border: 1px solid var(--er-border); border-radius: 10px;
  position: relative; overflow: hidden;
}
.er-worker-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white; font-size: 14px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.er-worker-info { min-width: 0; }
.er-worker-name { font-size: 13px; font-weight: 600; display: block; }
.er-worker-meta { font-size: 11px; color: var(--er-muted); display: block; }
.er-worker-right { text-align: right; flex-shrink: 0; }
.er-worker-monto { font-size: 14px; font-weight: 800; color: var(--er-neg); display: block; font-variant-numeric: tabular-nums; }
.er-worker-pct { font-size: 10px; color: var(--er-muted); }
.er-worker-bar-wrap { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--er-border); }
.er-worker-bar { height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); transition: width 0.6s ease; }

/* ── heatmap ── */
.er-heatmap { display: flex; align-items: flex-end; gap: 4px; height: 160px; padding-top: 20px; }
.er-heatmap-cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; position: relative; }
.er-heatmap-bar { width: 100%; border-radius: 4px 4px 0 0; transition: height 0.4s ease; min-height: 4px; }
.er-heatmap-label { font-size: 9px; color: var(--er-muted); font-weight: 600; white-space: nowrap; }
.er-heatmap-val { position: absolute; top: -18px; font-size: 8px; color: #6366f1; font-weight: 700; white-space: nowrap; display: none; }
.er-heatmap-cell:hover .er-heatmap-val { display: block; }

/* ── link btn ── */
.er-link-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; font-size: 11px; font-weight: 600;
  border-radius: 6px; border: 1px solid var(--er-border);
  color: #6366f1; text-decoration: none; background: #eef2ff;
  transition: all 0.15s; white-space: nowrap;
}
.er-link-btn:hover { background: #6366f1; color: white; border-color: #6366f1; }

/* ── empty ── */
.er-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 20px; color: var(--er-muted); text-align: center; font-size: 13px; }
.er-empty-icon { color: #cbd5e1; }
.er-error { color: #f43f5e; font-size: 13px; padding: 12px; background: #fff1f2; border-radius: 8px; }
`;
