# Plan 06 — Resumen Ejecutivo (landing de Gestión Empresarial)

**Fecha**: 2026-04-20
**Fase**: 2 (rediseño enterprise)
**Depende de**: Plan 01 (migraciones), Plan 02 (workspace rename+sidebar), Plan 04 (obligaciones)
**Estima**: 1 día

## Objetivo

Crear la nueva pantalla landing del workspace **Gestión Empresarial** en la ruta `/gestion/` (index). Sustituye el viejo `EstadoResultados` como default. Es un dashboard ejecutivo de una sola vista con 6 widgets clave para que el dueño sepa en 5 segundos "¿cómo va el negocio hoy?".

No reemplaza Estado de Resultados (que sigue en `/gestion/estado-resultados`) — lo complementa como entrada rápida.

## Contexto

El viejo `FinanzasLayout.jsx` redirigía `/finanzas` → `/finanzas/estado-resultados`. En Plan 02 ya se cambió a `/gestion` con un componente placeholder `ResumenEjecutivo`. Este plan llena ese placeholder.

## Archivos a crear / tocar

### Crear

1. `sistema-calzado/src/views/gestion/views/ResumenEjecutivo.jsx` — container principal
2. `sistema-calzado/src/views/gestion/components/widgets/KpiStrip.jsx` — 4 KPIs arriba
3. `sistema-calzado/src/views/gestion/components/widgets/AlertasCard.jsx` — badges de alerta
4. `sistema-calzado/src/views/gestion/components/widgets/FlujoCajaSparkline.jsx` — mini chart 30 días
5. `sistema-calzado/src/views/gestion/components/widgets/TopUbicacionesCard.jsx` — ranking 5 ubicaciones
6. `sistema-calzado/src/views/gestion/components/widgets/TopGastosCard.jsx` — top 5 categorías gasto
7. `sistema-calzado/src/views/gestion/components/widgets/ProximasObligacionesCard.jsx` — próximas 5 obligaciones
8. `sistema-calzado/src/views/gestion/api/resumenClient.js` — aggregator que llama a RPCs/views

### Modificar

- `sistema-calzado/src/views/gestion/GestionLayout.jsx` — reemplazar `<ResumenEjecutivo />` placeholder por `import` real

## Estructura de la pantalla

```
┌──────────────────────────────────────────────────────────────────┐
│  Resumen Ejecutivo · Abril 2026                      [Hoy ▾]    │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Ventas   │  │ Gastos   │  │ Utilidad │  │ Caja     │        │
│  │ S/ 18.4k │  │ S/ 12.1k │  │ S/ 6.3k  │  │ S/ 24.8k │        │
│  │ +12% mtd │  │ -4% mtd  │  │ +21% mtd │  │ 3 cuentas│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
│  ┌─── Alertas ────────────────────────┐ ┌─── Flujo 30d ──────┐  │
│  │ 🔴 2 cierres pendientes (Feb, Mar) │ │  ▁▂▄█▆▅▃▄▅▇█▆▄▂▃▁  │  │
│  │ 🟠 3 obligaciones vencidas          │ │  neto S/ +6,300    │  │
│  │ 🟡 Saldo bajo en Caja Principal    │ └────────────────────┘  │
│  └─────────────────────────────────────┘                         │
│                                                                  │
│  ┌─── Top 5 Ubicaciones ──────────────┐ ┌─── Top 5 Gastos ───┐  │
│  │ 1. Tienda Centro    S/ 8.2k  ████  │ │ Sueldos  S/ 5.1k   │  │
│  │ 2. Tienda Norte     S/ 5.1k  ██▌   │ │ Alquiler S/ 2.4k   │  │
│  │ 3. Taller Principal S/ 3.8k  █▊    │ │ Luz      S/ 0.8k   │  │
│  │ 4. Tienda Sur       S/ 1.3k  ▋     │ │ Agua     S/ 0.3k   │  │
│  │ 5. Kiosco Mercado   S/ 0.0k        │ │ Internet S/ 0.2k   │  │
│  └─────────────────────────────────────┘ └────────────────────┘  │
│                                                                  │
│  ┌─── Próximas Obligaciones (7 días) ─────────────────────────┐  │
│  │ Mañana    Luz Tienda Centro      ~S/ 150  [Confirmar]     │  │
│  │ Vie 24    Alquiler Taller        S/ 1,800 [Pagar]         │  │
│  │ Lun 27    Internet Oficina       S/ 120   [Confirmar]     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Componente container — ResumenEjecutivo.jsx

```jsx
import { useEffect, useState } from 'react';
import { fetchResumen } from '../api/resumenClient';
import KpiStrip from '../components/widgets/KpiStrip';
import AlertasCard from '../components/widgets/AlertasCard';
import FlujoCajaSparkline from '../components/widgets/FlujoCajaSparkline';
import TopUbicacionesCard from '../components/widgets/TopUbicacionesCard';
import TopGastosCard from '../components/widgets/TopGastosCard';
import ProximasObligacionesCard from '../components/widgets/ProximasObligacionesCard';

export default function ResumenEjecutivo() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        setCargando(true);
        const d = await fetchResumen();
        if (activo) setData(d);
      } catch (e) {
        if (activo) setError(e.message);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  if (cargando) return <div className="p-6">Cargando resumen…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!data) return null;

  const { kpis, alertas, flujoCaja, topUbicaciones, topGastos, proximasObligaciones } = data;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Resumen Ejecutivo</h1>
          <p className="text-sm text-stone-500">{data.periodoLabel}</p>
        </div>
      </header>

      <KpiStrip kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertasCard alertas={alertas} />
        <FlujoCajaSparkline datos={flujoCaja} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopUbicacionesCard items={topUbicaciones} />
        <TopGastosCard items={topGastos} />
      </div>

      <ProximasObligacionesCard items={proximasObligaciones} />
    </div>
  );
}
```

## API aggregator — resumenClient.js

Consolida llamadas a varias vistas/RPCs ya existentes:

```js
import { supabase } from '../../../api/supabase';

export async function fetchResumen() {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
  const inicio30d = new Date(hoy.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [
    { data: pl, error: errPl },
    { data: flujoDiario, error: errFlujo },
    { data: cuentas, error: errCuentas },
    { data: cierres, error: errCierres },
    { data: obligaciones, error: errObli },
    { data: ventasPorUbi, error: errUbi },
    { data: gastosPorCat, error: errGas },
  ] = await Promise.all([
    supabase.rpc('fn_pl_resumen', { fecha_inicio: inicioMes, fecha_fin: finMes, id_ubicacion_filtro: null }),
    supabase.from('v_flujo_caja_diario').select('*').gte('fecha', inicio30d).order('fecha'),
    supabase.from('cuentas_financieras').select('id, nombre, saldo_actual, moneda').eq('activa', true),
    supabase.from('cierres_periodo').select('year, month, estado').order('year', { ascending: false }).order('month', { ascending: false }).limit(6),
    supabase.from('v_obligaciones_bandeja').select('*').limit(5),
    supabase.from('v_ventas_por_ubicacion_mes').select('*').gte('fecha_inicio', inicioMes).order('total', { ascending: false }).limit(5),
    supabase.from('v_gastos_por_categoria_mes').select('*').gte('fecha_inicio', inicioMes).order('total', { ascending: false }).limit(5),
  ]);

  if (errPl) throw errPl;
  if (errFlujo) throw errFlujo;
  if (errCuentas) throw errCuentas;

  const totalCaja = (cuentas || []).reduce((s, c) => s + Number(c.saldo_actual || 0), 0);
  const ventas = pl?.ingresos_totales || 0;
  const gastos = (pl?.gastos_operativos || 0) + (pl?.gastos_personal || 0);
  const utilidad = ventas - gastos;

  const alertas = [];
  const mesesPendientes = detectarCierresPendientes(cierres || [], hoy);
  if (mesesPendientes.length > 0) {
    alertas.push({ tipo: 'critico', icono: '🔴', texto: `${mesesPendientes.length} cierre(s) pendiente(s): ${mesesPendientes.join(', ')}`, link: '/gestion/cierres' });
  }
  const obligacionesVencidas = (obligaciones || []).filter(o => o.grupo === 'vencidas').length;
  if (obligacionesVencidas > 0) {
    alertas.push({ tipo: 'alto', icono: '🟠', texto: `${obligacionesVencidas} obligación(es) vencida(s)`, link: '/gestion/obligaciones' });
  }
  (cuentas || []).filter(c => Number(c.saldo_actual) < 500).forEach(c => {
    alertas.push({ tipo: 'medio', icono: '🟡', texto: `Saldo bajo en ${c.nombre}`, link: '/gestion/cuentas' });
  });

  return {
    periodoLabel: formatearPeriodo(hoy),
    kpis: {
      ventas: { valor: ventas, deltaPct: pl?.ingresos_delta_pct ?? null },
      gastos: { valor: gastos, deltaPct: pl?.gastos_delta_pct ?? null },
      utilidad: { valor: utilidad, deltaPct: pl?.utilidad_delta_pct ?? null },
      caja: { valor: totalCaja, cuentasCount: (cuentas || []).length },
    },
    alertas,
    flujoCaja: flujoDiario || [],
    topUbicaciones: ventasPorUbi || [],
    topGastos: gastosPorCat || [],
    proximasObligaciones: (obligaciones || []).slice(0, 5),
  };
}

function detectarCierresPendientes(cierres, hoy) {
  const pendientes = [];
  for (let i = 1; i <= 3; i++) {
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const existe = cierres.some(c => c.year === ref.getFullYear() && c.month === ref.getMonth() + 1 && c.estado === 'cerrado');
    if (!existe) pendientes.push(formatearMes(ref));
  }
  return pendientes;
}

function formatearMes(d) {
  return d.toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
}
function formatearPeriodo(d) {
  return d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}
```

## Componentes widget (snippets)

### KpiStrip.jsx

```jsx
export default function KpiStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Ventas del mes" valor={kpis.ventas.valor} delta={kpis.ventas.deltaPct} color="emerald" />
      <Kpi label="Gastos del mes" valor={kpis.gastos.valor} delta={kpis.gastos.deltaPct} color="rose" invertirDelta />
      <Kpi label="Utilidad neta" valor={kpis.utilidad.valor} delta={kpis.utilidad.deltaPct} color="indigo" />
      <Kpi label="Caja total" valor={kpis.caja.valor} sub={`${kpis.caja.cuentasCount} cuentas`} color="slate" />
    </div>
  );
}

function Kpi({ label, valor, delta, sub, color, invertirDelta }) {
  const deltaPositivo = invertirDelta ? delta < 0 : delta > 0;
  const deltaClass = delta == null ? 'text-stone-400' : deltaPositivo ? 'text-emerald-600' : 'text-rose-600';
  return (
    <div className={`rounded-lg border border-stone-200 bg-white p-4`}>
      <div className="text-xs text-stone-500 uppercase">{label}</div>
      <div className="text-2xl font-semibold mt-1">S/ {formatNumber(valor)}</div>
      {delta != null && <div className={`text-xs mt-1 ${deltaClass}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs mes anterior</div>}
      {sub && <div className="text-xs mt-1 text-stone-500">{sub}</div>}
    </div>
  );
}

function formatNumber(n) {
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

### AlertasCard.jsx

```jsx
import { Link } from 'react-router-dom';
export default function AlertasCard({ alertas }) {
  if (alertas.length === 0) {
    return <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-sm text-stone-500">Sin alertas. Todo en orden. ✅</div></div>;
  }
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-stone-700 mb-3">Alertas</h2>
      <ul className="space-y-2">
        {alertas.map((a, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span>{a.icono} {a.texto}</span>
            {a.link && <Link to={a.link} className="text-xs text-indigo-600 hover:underline">Ver →</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### FlujoCajaSparkline.jsx

Recharts `AreaChart` compacto, sin ejes:

```jsx
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
export default function FlujoCajaSparkline({ datos }) {
  const total = datos.reduce((s, d) => s + (Number(d.ingresos) - Number(d.egresos)), 0);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-stone-700">Flujo de caja · 30 días</h2>
        <span className={`text-sm font-medium ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Neto S/ {total.toFixed(0)}</span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={datos}>
          <Area type="monotone" dataKey="neto" stroke="#4f46e5" fill="#e0e7ff" strokeWidth={2} />
          <Tooltip />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### TopUbicacionesCard / TopGastosCard / ProximasObligacionesCard

Mismo patrón: card con título + lista ordenada + barras horizontales proporcionales (en el caso de top ubicaciones/gastos).

```jsx
// TopUbicacionesCard.jsx
export default function TopUbicacionesCard({ items }) {
  const max = Math.max(...items.map(i => Number(i.total)), 1);
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-stone-700 mb-3">Top 5 ubicaciones · ventas del mes</h2>
      <ul className="space-y-2">
        {items.map((u, i) => (
          <li key={u.id_ubicacion} className="flex items-center gap-3 text-sm">
            <span className="w-4 text-stone-400">{i + 1}.</span>
            <span className="flex-1 truncate">{u.nombre_ubicacion}</span>
            <span className="font-medium">S/ {Number(u.total).toFixed(0)}</span>
            <div className="w-24 h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${(Number(u.total) / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Views SQL requeridas

Si no existen, crearlas en **Plan 01** o en una migration auxiliar:

```sql
CREATE OR REPLACE VIEW v_ventas_por_ubicacion_mes AS
SELECT
  u.id AS id_ubicacion,
  u.nombre AS nombre_ubicacion,
  DATE_TRUNC('month', v.fecha)::date AS fecha_inicio,
  SUM(v.total) AS total
FROM ventas v
JOIN ubicaciones u ON u.id = v.id_ubicacion
GROUP BY u.id, u.nombre, DATE_TRUNC('month', v.fecha);

CREATE OR REPLACE VIEW v_gastos_por_categoria_mes AS
SELECT
  pc.nombre AS categoria,
  DATE_TRUNC('month', m.fecha)::date AS fecha_inicio,
  SUM(s.monto) AS total
FROM movimiento_splits s
JOIN movimientos_caja m ON m.id = s.id_movimiento
JOIN plan_cuentas pc ON pc.id = s.id_cuenta_contable
WHERE pc.tipo IN ('gasto_operativo', 'gasto_personal')
  AND m.tipo = 'egreso'
GROUP BY pc.nombre, DATE_TRUNC('month', m.fecha);
```

## Ruteo

`GestionLayout.jsx` cambio:

```jsx
// ANTES (Plan 02 dejó placeholder)
<Route index element={<div>Resumen Ejecutivo (pendiente)</div>} />

// DESPUÉS
import ResumenEjecutivo from './views/ResumenEjecutivo';
<Route index element={<ResumenEjecutivo />} />
```

## Acceptance criteria

- [ ] Entrar a `/gestion/` muestra el Resumen Ejecutivo (NO Estado de Resultados)
- [ ] 4 KPIs se renderizan con valores reales de `fn_pl_resumen` y `cuentas_financieras`
- [ ] Deltas vs mes anterior se muestran con flecha/color correctos
- [ ] Alertas aparecen solo si hay datos que justifiquen (ej: si no hay cierres pendientes, no mostrar esa alerta)
- [ ] Sparkline renderiza 30 días de `v_flujo_caja_diario`
- [ ] Click en "Pagar" en ProximasObligaciones navega a `/gestion/obligaciones`
- [ ] Sin errores de consola
- [ ] Responsive: en mobile los 4 KPIs pasan a 2×2
- [ ] Tiempo de carga inicial < 2s en dev

## Cómo probar

```bash
npm run dev
```

1. Iniciar sesión con PIN admin
2. Ir a `/gestion/` — debe cargar Resumen Ejecutivo
3. Verificar cada widget con datos reales
4. Forzar alertas: cerrar menos meses, crear obligación vencida, bajar saldo de una cuenta
5. Cambiar a mobile viewport (375px) y validar layout
