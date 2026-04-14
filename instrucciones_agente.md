# PLAN_INSTRUCCIONES_AGENTE.md

> Plan de implementación para **Bloque 4 (Dashboards Financieros)** y **Bloque 5 (Modo Administrador Rápido / Padres)** del ERP BERNA Calzado.
> Stack confirmado: React 19 + Vite 7 + Tailwind v4 + react-router-dom v7 + Supabase. Sin TypeScript. Permisos ya gestionados vía `permisos_persona`.
> Este documento es ejecutable paso a paso por Claude Code.

---

## 0. Decisiones arquitectónicas (lee antes de codear)

### 0.1 Librería de gráficos: **Recharts**
- **Elegida:** `recharts@^2.15.0`.
- **Por qué Recharts y no Tremor:**
  - Tremor v3 está atado a Tailwind v3 y a una config de plugins propia. El proyecto usa **Tailwind v4 con `@tailwindcss/postcss`**, donde Tremor rompe el build sin parches manuales.
  - Recharts es 100% React, sin dependencias de Tailwind, funciona con React 19, y pesa menos al usarlo selectivamente (los chunks ya tienen `chunkSizeWarningLimit: 2500` en `vite.config.js`, así que hay margen).
  - El estilo visual del módulo Finanzas ya es minimalista (paleta `#1c1917` / `#fafaf9` / `#57534e`); Recharts permite controlar 100% de los colores vía props, alineado con el design system actual.
- **No instalar:** Tremor, Chart.js, Nivo, Victory.

### 0.2 Modo Padres: **misma SPA, ruta hermana, NO subdominio**
- Ruta: `/rapido/*` montada en `src/main.jsx` al mismo nivel que `/finanzas/*`.
- Razón: reutiliza el mismo `supabaseClient`, el mismo `permisos_persona`, el mismo `localStorage` PWA y el mismo build de Vercel. Cero duplicación de auth.
- Bundle separado vía `lazy()` → los padres descargan ~50 KB de JS, no el módulo Finanzas completo.
- Detección de "es padre/admin rápido": **nuevo recurso de permisos** `'rapido'` con nivel `'registrar'` o superior. Esto permite **agregar/quitar admins desde `PersonasEquipo.jsx`** sin tocar código (requisito del usuario).

### 0.3 Identidad visual del Modo Rápido
- **No** reutilizar los componentes complejos de `views/finanzas/components/UI.jsx`.
- Crear componentes propios en `src/views/rapido/components/` con:
  - Botones gigantes (mínimo 64px de alto, `text-xl`).
  - Tipografía grande (`text-base` mínimo en cuerpo, `text-2xl` en montos).
  - Sin tablas. Todo es lista vertical o tarjetas grandes.
  - Solo 1 acción primaria por pantalla.
  - Paleta de alto contraste: fondo `#ffffff`, texto `#0a0a0a`, primario `#1c1917`, éxito `#15803d`, error `#b91c1c`.

---

## 1. BLOQUE 4 — Dashboards Financieros

### 1.1 Objetivo
Tres vistas: **P&L mensual**, **Flujo de caja diario/mensual**, **Patrimonio** (snapshot de cuentas + deudas + capital de trabajo).
Todas alimentadas por **Views SQL** en Supabase (no functions, salvo cuando se necesite parámetro de fecha).

### 1.2 Migraciones SQL nuevas

Crear archivo: `supabase/migrations/20260413_dashboards_financieros.sql`

```sql
-- ============================================================================
-- BLOQUE 4 · Dashboards Financieros
-- Vistas y funciones para P&L, Flujo de Caja y Patrimonio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VISTA · v_movimientos_clasificados
-- Une movimientos_caja con plan_cuentas para clasificar cada movimiento en
-- una sección del P&L. Resuelve splits cuando existen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_movimientos_clasificados AS
SELECT
    m.id_movimiento,
    m.fecha_movimiento,
    DATE(m.fecha_movimiento AT TIME ZONE 'America/Lima') AS fecha,
    TO_CHAR(m.fecha_movimiento AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
    m.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    m.tipo,
    m.monto,
    m.concepto,
    m.metodo,
    m.id_cuenta_financiera,
    m.id_cuenta_contable,
    pc.codigo  AS cuenta_codigo,
    pc.nombre  AS cuenta_nombre,
    pc.seccion_pl,
    pc.signo_pl,
    -- Monto firmado para sumas directas en P&L
    (m.monto * pc.signo_pl)::numeric AS monto_pl,
    m.id_persona,
    p.nombre AS persona_nombre,
    m.id_deuda,
    m.id_costo_fijo
FROM public.movimientos_caja m
LEFT JOIN public.plan_cuentas pc ON pc.id_cuenta_contable = m.id_cuenta_contable
LEFT JOIN public.ubicaciones   u ON u.id_ubicacion = m.id_ubicacion
LEFT JOIN public.personas_tienda p ON p.id_persona = m.id_persona
WHERE m.tiene_splits = false OR m.tiene_splits IS NULL;

-- ----------------------------------------------------------------------------
-- 2. VISTA · v_pl_mensual
-- P&L agregado por mes y sección. Incluye ventas (de tabla ventas) +
-- movimientos clasificados. Las ventas no viven en movimientos_caja, así que
-- las inyectamos como sección 'ingresos'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pl_mensual AS
WITH ventas_mes AS (
    SELECT
        TO_CHAR(v.fecha_hora AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
        v.id_ubicacion,
        'ingresos'::text AS seccion_pl,
        SUM(v.monto_total) AS monto
    FROM public.ventas v
    WHERE v.fecha_hora IS NOT NULL
    GROUP BY 1, 2
),
movs_mes AS (
    SELECT
        periodo_mes,
        id_ubicacion,
        seccion_pl,
        SUM(monto_pl) AS monto
    FROM public.v_movimientos_clasificados
    WHERE seccion_pl IS NOT NULL
      AND seccion_pl <> 'sin_impacto'
    GROUP BY 1, 2, 3
),
union_all AS (
    SELECT * FROM ventas_mes
    UNION ALL
    SELECT * FROM movs_mes
)
SELECT
    periodo_mes,
    id_ubicacion,
    seccion_pl,
    SUM(monto) AS monto_total
FROM union_all
GROUP BY 1, 2, 3
ORDER BY periodo_mes DESC, seccion_pl;

-- ----------------------------------------------------------------------------
-- 3. FUNCIÓN · fn_pl_resumen(fecha_inicio, fecha_fin)
-- Devuelve el P&L colapsado en un único registro por sección, con totales y
-- utilidad calculada. Lista para alimentar tarjetas + gráfico.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pl_resumen(
    p_fecha_inicio date,
    p_fecha_fin    date,
    p_id_ubicacion integer DEFAULT NULL
)
RETURNS TABLE (
    seccion_pl   text,
    monto_total  numeric
)
LANGUAGE sql STABLE AS $$
    WITH ventas_periodo AS (
        SELECT 'ingresos'::text AS seccion_pl, SUM(v.monto_total) AS monto
        FROM public.ventas v
        WHERE v.fecha_hora >= p_fecha_inicio
          AND v.fecha_hora <  (p_fecha_fin + 1)
          AND (p_id_ubicacion IS NULL OR v.id_ubicacion = p_id_ubicacion)
    ),
    movs_periodo AS (
        SELECT mc.seccion_pl, SUM(mc.monto_pl) AS monto
        FROM public.v_movimientos_clasificados mc
        WHERE mc.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
          AND mc.seccion_pl IS NOT NULL
          AND mc.seccion_pl <> 'sin_impacto'
          AND (p_id_ubicacion IS NULL OR mc.id_ubicacion = p_id_ubicacion)
        GROUP BY mc.seccion_pl
    )
    SELECT seccion_pl, COALESCE(SUM(monto), 0)::numeric AS monto_total
    FROM (
        SELECT * FROM ventas_periodo
        UNION ALL
        SELECT * FROM movs_periodo
    ) u
    WHERE seccion_pl IS NOT NULL
    GROUP BY seccion_pl
    ORDER BY seccion_pl;
$$;

-- ----------------------------------------------------------------------------
-- 4. VISTA · v_flujo_caja_diario
-- Ingresos / egresos / neto por día y por cuenta. Es la fuente del gráfico
-- de barras y de la tabla de movimientos del dashboard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_flujo_caja_diario AS
SELECT
    DATE(m.fecha_movimiento AT TIME ZONE 'America/Lima') AS fecha,
    m.id_cuenta_financiera,
    cf.nombre AS cuenta_nombre,
    cf.tipo_cuenta,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE 0 END) AS ingresos,
    SUM(CASE WHEN m.tipo = 'egreso'  THEN m.monto ELSE 0 END) AS egresos,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS neto
FROM public.movimientos_caja m
LEFT JOIN public.cuentas_financieras cf ON cf.id_cuenta = m.id_cuenta_financiera
GROUP BY 1, 2, 3, 4
ORDER BY fecha DESC;

-- ----------------------------------------------------------------------------
-- 5. VISTA · v_flujo_caja_mensual
-- Igual que la diaria pero agrupada por mes. Para el gráfico anual.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_flujo_caja_mensual AS
SELECT
    TO_CHAR(m.fecha_movimiento AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE 0 END) AS ingresos,
    SUM(CASE WHEN m.tipo = 'egreso'  THEN m.monto ELSE 0 END) AS egresos,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS neto
FROM public.movimientos_caja m
GROUP BY 1
ORDER BY periodo_mes DESC;

-- ----------------------------------------------------------------------------
-- 6. VISTA · v_patrimonio_snapshot
-- Foto actual: activos (saldos cuentas), pasivos (saldos deudas), patrimonio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_patrimonio_snapshot AS
WITH activos AS (
    SELECT
        'activo'::text AS tipo,
        cf.id_cuenta AS id_ref,
        cf.nombre,
        cf.tipo_cuenta AS subtipo,
        cf.saldo_actual AS monto
    FROM public.cuentas_financieras cf
    WHERE cf.activa = true
),
pasivos AS (
    SELECT
        'pasivo'::text AS tipo,
        d.id_deuda AS id_ref,
        d.nombre,
        d.tipo_acreedor AS subtipo,
        d.saldo_actual AS monto
    FROM public.deudas d
    WHERE d.estado IN ('activa', 'en_mora', 'refinanciada')
)
SELECT * FROM activos
UNION ALL
SELECT * FROM pasivos;

-- ----------------------------------------------------------------------------
-- 7. FUNCIÓN · fn_patrimonio_totales()
-- Devuelve totales consolidados: activos, pasivos, patrimonio neto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_patrimonio_totales()
RETURNS TABLE (
    total_activos    numeric,
    total_pasivos    numeric,
    patrimonio_neto  numeric,
    cuentas_count    integer,
    deudas_count     integer
)
LANGUAGE sql STABLE AS $$
    SELECT
        COALESCE(SUM(CASE WHEN tipo = 'activo' THEN monto END), 0) AS total_activos,
        COALESCE(SUM(CASE WHEN tipo = 'pasivo' THEN monto END), 0) AS total_pasivos,
        COALESCE(SUM(CASE WHEN tipo = 'activo' THEN monto END), 0)
            - COALESCE(SUM(CASE WHEN tipo = 'pasivo' THEN monto END), 0) AS patrimonio_neto,
        COUNT(*) FILTER (WHERE tipo = 'activo')::int AS cuentas_count,
        COUNT(*) FILTER (WHERE tipo = 'pasivo')::int AS deudas_count
    FROM public.v_patrimonio_snapshot;
$$;

-- ----------------------------------------------------------------------------
-- 8. VISTA · v_obligaciones_proximas
-- Cuotas de deuda y costos fijos que vencen en los próximos 30 días.
-- Alimenta la "alerta de qué pagar esta semana".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_obligaciones_proximas AS
SELECT
    'deuda'::text AS tipo,
    d.id_deuda AS id_ref,
    d.nombre,
    d.acreedor AS detalle,
    d.cuota_monto AS monto,
    -- siguiente fecha de pago aproximada (día_pago_mes en mes actual o próximo)
    CASE
        WHEN d.dia_pago_mes IS NULL THEN NULL
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= d.dia_pago_mes
            THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                           EXTRACT(MONTH FROM CURRENT_DATE)::int,
                           d.dia_pago_mes)
        ELSE (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM CURRENT_DATE)::int,
                        d.dia_pago_mes) + INTERVAL '1 month')::date
    END AS fecha_proxima
FROM public.deudas d
WHERE d.estado = 'activa' AND d.cuota_monto IS NOT NULL

UNION ALL

SELECT
    'costo_fijo'::text AS tipo,
    cf.id_costo AS id_ref,
    cf.nombre,
    cf.proveedor AS detalle,
    cf.monto_estimado AS monto,
    CASE
        WHEN cf.dia_vencimiento_mes IS NULL THEN NULL
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= cf.dia_vencimiento_mes
            THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                           EXTRACT(MONTH FROM CURRENT_DATE)::int,
                           cf.dia_vencimiento_mes)
        ELSE (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM CURRENT_DATE)::int,
                        cf.dia_vencimiento_mes) + INTERVAL '1 month')::date
    END AS fecha_proxima
FROM public.costos_fijos cf
WHERE cf.activo = true AND cf.frecuencia = 'mensual';

-- ----------------------------------------------------------------------------
-- 9. GRANTS · permitir lectura desde el cliente (anon/authenticated)
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.v_movimientos_clasificados TO anon, authenticated;
GRANT SELECT ON public.v_pl_mensual                TO anon, authenticated;
GRANT SELECT ON public.v_flujo_caja_diario         TO anon, authenticated;
GRANT SELECT ON public.v_flujo_caja_mensual        TO anon, authenticated;
GRANT SELECT ON public.v_patrimonio_snapshot       TO anon, authenticated;
GRANT SELECT ON public.v_obligaciones_proximas     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pl_resumen(date, date, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_patrimonio_totales() TO anon, authenticated;
```

### 1.3 Instalación de dependencias

```bash
npm install recharts@^2.15.0
```

### 1.4 Archivos React nuevos
src/views/finanzas/
├── api/
│   └── dashboardClient.js              ← NUEVO
├── components/
│   └── charts/                         ← NUEVO carpeta
│       ├── ChartContainer.jsx          ← wrapper con loading/empty
│       ├── BarChartFlujo.jsx
│       ├── PieChartPL.jsx
│       └── KpiCard.jsx
└── views/
└── Dashboard.jsx                   ← REEMPLAZAR contenido (ya existe)
### 1.5 Contenido de `dashboardClient.js`

```javascript
// src/views/finanzas/api/dashboardClient.js
import { supabase } from '../../../lib/supabaseClient';

export async function obtenerPLResumen(fechaInicio, fechaFin, idUbicacion = null) {
  const { data, error } = await supabase.rpc('fn_pl_resumen', {
    p_fecha_inicio: fechaInicio,
    p_fecha_fin: fechaFin,
    p_id_ubicacion: idUbicacion,
  });
  if (error) throw error;
  return data || [];
}

export async function obtenerFlujoCajaDiario(fechaInicio, fechaFin) {
  const { data, error } = await supabase
    .from('v_flujo_caja_diario')
    .select('*')
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .order('fecha', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function obtenerFlujoCajaMensual(meses = 12) {
  const { data, error } = await supabase
    .from('v_flujo_caja_mensual')
    .select('*')
    .limit(meses);
  if (error) throw error;
  return (data || []).reverse(); // cronológico para el gráfico
}

export async function obtenerPatrimonioTotales() {
  const { data, error } = await supabase.rpc('fn_patrimonio_totales');
  if (error) throw error;
  return data?.[0] || { total_activos: 0, total_pasivos: 0, patrimonio_neto: 0 };
}

export async function obtenerPatrimonioDetalle() {
  const { data, error } = await supabase
    .from('v_patrimonio_snapshot')
    .select('*')
    .order('monto', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function obtenerObligacionesProximas() {
  const { data, error } = await supabase
    .from('v_obligaciones_proximas')
    .select('*')
    .order('fecha_proxima', { ascending: true });
  if (error) throw error;
  return data || [];
}
```

### 1.6 Lógica del componente `Dashboard.jsx`

Estructura:
1. **Tres tabs**: `P&L` · `Flujo de caja` · `Patrimonio`. Tabs en URL via query param `?tab=` para deep linking.
2. **Selector de período** persistente en localStorage (`finanzas.dashboard.periodo`): `mes_actual` / `mes_anterior` / `ultimos_30` / `custom`.
3. **Tab P&L**: 
   - 4 KPI cards arriba (Ingresos, Costo de ventas, Gastos op., Utilidad).
   - PieChart de gastos por sección (sólo secciones de egreso).
   - Tabla colapsable: drill-down por cuenta contable.
4. **Tab Flujo de caja**:
   - BarChart apilado: ingresos vs egresos por día (último mes) o por mes (último año).
   - KPI: neto del período.
   - Lista de los 10 movimientos más grandes del período.
5. **Tab Patrimonio**:
   - Tres KPIs gigantes: Activos / Pasivos / Patrimonio neto.
   - Lista de cuentas con su saldo (verde).
   - Lista de deudas con su saldo (rojo).
   - Sección "Próximas obligaciones (30 días)" con suma total.

### 1.7 Componentes de gráficos — Recharts

`BarChartFlujo.jsx` (esqueleto a implementar):

```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function BarChartFlujo({ data, height = 280 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
        <XAxis dataKey="periodo_mes" tick={{ fill: '#57534e', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#57534e', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 8, fontSize: 12 }}
          formatter={(v) => `S/ ${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="ingresos" fill="#15803d" radius={[4, 4, 0, 0]} />
        <Bar dataKey="egresos"  fill="#b91c1c" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Reglas para todos los charts:
- **Siempre** envolver en `ResponsiveContainer`.
- **Nunca** hardcodear width en px.
- Colores desde una constante exportada en `charts/colors.js` (paleta consistente con el design system).
- Loading/empty/error siempre delegado a `<ChartContainer>`.

### 1.8 Permisos
- Tab P&L y Flujo: requiere `puedeVer(usuario, 'finanzas')`.
- Tab Patrimonio: requiere `esAdmin(usuario, 'finanzas')` (es información sensible).
- Si no tiene permiso, render `<EmptyState>` con mensaje "Sin acceso".

---

## 2. BLOQUE 5 — Modo Administrador Rápido (Padres)

### 2.1 Objetivo
Una "mini-app" PWA simplificada en `/rapido` para que **mamá y papá** (no técnicos) puedan en 2 taps:
- Registrar un gasto (ej: "pagué la luz S/ 120").
- Registrar un pago de deuda.
- Ver cuánto efectivo tiene cada caja en este momento.
- Ver qué obligaciones vencen pronto.
- Hacer una transferencia entre cuentas (ej: "moví S/ 500 del BCP a la caja chica de Tienda 1").

### 2.2 Estrategia: misma SPA, ruta `/rapido/*`

**Por qué no subdominio o app aparte:**
- Reutiliza autenticación PIN existente (`personas_tienda.pin_hash`).
- Reutiliza `permisos_persona` para gestionar quién es admin rápido.
- Cero costo de despliegue adicional.
- Bundle separado vía `lazy()` → solo carga lo necesario (~50–80 KB).
- Misma PWA / mismo manifest.

### 2.3 Cómo se "agrega/quita un admin"

**Sin código.** Desde `PersonasEquipo.jsx` (que ya existe), añadir un nuevo recurso de permiso:

1. Migración SQL para registrar el recurso `'rapido'` (no requiere tabla nueva, solo convención).
2. Editar `src/views/finanzas/lib/permisos.js`:
```javascript
   export const RECURSOS = {
     // ... existentes
     RAPIDO: 'rapido',
   };
```
3. En `PersonasEquipo.jsx`, añadir un toggle/select por persona: **"Acceso Modo Rápido"** con niveles `ninguno` / `registrar` / `admin`.
4. El check `puedeRegistrar(usuario, 'rapido')` decide si la persona puede entrar a `/rapido`.

Resultado: agregar un nuevo padre = entrar a `/finanzas/personas`, crear persona con su PIN, activarle "Modo Rápido = registrar". Listo. **Sin tocar código.**

### 2.4 Routing y estado

#### Routing
Edición de `src/main.jsx`:

```jsx
const RapidoGate   = lazy(() => import('./views/rapido/RapidoGate.jsx'));
const RapidoLayout = lazy(() => import('./views/rapido/RapidoLayout.jsx'));

function RapidoRoot() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center">…</div>}>
      <RapidoGate>
        {({ usuario, logout }) => <RapidoLayout usuario={usuario} logout={logout} />}
      </RapidoGate>
    </Suspense>
  );
}

// Dentro de <Routes>:
<Route path="/rapido/*" element={<RapidoRoot />} />
```

Rutas internas (declaradas en `RapidoLayout.jsx`):
/rapido               → Home (tarjetones de acción)
/rapido/gasto         → Wizard de 3 pasos para registrar gasto
/rapido/pago-deuda    → Wizard de 3 pasos para registrar pago de deuda
/rapido/transferir    → Wizard de 3 pasos para transferencia entre cuentas
/rapido/cuentas       → Ver saldos de todas las cuentas (solo lectura)
/rapido/obligaciones  → Ver qué vence en los próximos 30 días
#### Estado
**Sin librería externa.** Solo `useState` + `useReducer` local + un Context muy delgado:

- `RapidoContext.jsx`: provee `usuario`, `cuentas` (cargadas 1 vez), `logout`, `refrescarCuentas`. Se carga al entrar al gate, se persiste en `localStorage` clave `'berna.rapido.session.v1'`.
- Cada wizard mantiene su estado local en un `useReducer` interno (campos: `monto`, `cuenta`, `concepto`, `paso`).
- **No SWR, no React Query.** Para una mini-app de 5 pantallas es overkill. `await + setState + try/catch` es suficiente.

### 2.5 Estructura de archivos nueva
src/views/rapido/
├── RapidoGate.jsx                ← login PIN, valida permiso 'rapido'
├── RapidoLayout.jsx              ← shell con header simple + outlet
├── RapidoContext.jsx             ← provee usuario y cuentas
├── api/
│   └── rapidoClient.js           ← funciones supabase específicas
├── components/
│   ├── BigButton.jsx             ← botón táctil 64px+
│   ├── BigInput.jsx              ← input numérico gigante
│   ├── MoneyDisplay.jsx          ← S/ 1,234.56 grande
│   ├── NumPad.jsx                ← teclado táctil para PIN y montos
│   ├── StepHeader.jsx            ← "Paso 2 de 3" con botón atrás
│   └── ConfirmCard.jsx           ← tarjeta de confirmación final
└── views/
├── Home.jsx                  ← 5 tarjetones grandes
├── RegistrarGasto.jsx        ← wizard
├── RegistrarPagoDeuda.jsx    ← wizard
├── Transferir.jsx            ← wizard
├── VerCuentas.jsx            ← lista
└── Obligaciones.jsx          ← lista
### 2.6 Patrón de wizard (CRÍTICO para UX no-tech)

Cada acción es un **wizard de 3 pasos máximo**, una decisión por pantalla:

**Ejemplo: Registrar Gasto**
- **Paso 1 — ¿Cuánto?** Pantalla con NumPad gigante, muestra `S/ 0.00` arriba en tipografía 48px. Botón "Siguiente" abajo (verde, deshabilitado si monto=0).
- **Paso 2 — ¿De qué cuenta sale?** Lista vertical de tarjetones con cada cuenta (con su saldo actual a la derecha). Tap = selección + auto-avance.
- **Paso 3 — ¿Para qué?** Lista de tipos de gasto preconfigurados (de `tipos_movimiento_caja` con `tipo_flujo='egreso'`). Tap = selección. Campo opcional "Nota" con teclado nativo. Botón "Registrar" gigante en verde.
- **Confirmación final**: pantalla de éxito 2 segundos con check ✓ y vuelve al Home.

Reglas:
- **Cero formularios largos.** Una pregunta por pantalla.
- **Cero dropdowns.** Listas tappables siempre.
- **Cero modals.** Navegación con rutas (`useNavigate`) → permite usar el botón "atrás" del teléfono.
- **Botón atrás siempre visible** en la esquina superior izquierda.
- **Después de registrar**, vibración corta (`navigator.vibrate?.(50)`) + pantalla de éxito.

### 2.7 Migración SQL del Bloque 5

Archivo: `supabase/migrations/20260413_modo_rapido_permisos.sql`

```sql
-- ============================================================================
-- BLOQUE 5 · Modo Rápido (Padres) — permisos
-- ============================================================================

-- Sembrar el recurso 'rapido' como permiso válido. No requiere tabla nueva,
-- solo asegurarse de que las personas existentes tengan la entrada explícita
-- (opcional: dejar que Configuración la cree on-demand).

-- Comentario documental
COMMENT ON COLUMN public.permisos_persona.recurso IS
'Recurso al que aplica el permiso. Valores conocidos: finanzas, cuentas, deudas, costos_fijos, movimientos, transferencias, configuracion, caja, rapido (Modo Padres).';

-- Vista helper: cuentas visibles para el modo rápido
-- (excluye cuentas inactivas y cuentas personales no marcadas para mostrar)
CREATE OR REPLACE VIEW public.v_rapido_cuentas AS
SELECT
    cf.id_cuenta,
    cf.codigo,
    cf.nombre,
    cf.alias,
    cf.tipo_cuenta,
    cf.saldo_actual,
    cf.moneda,
    cf.color_hex,
    cf.icono,
    cf.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    cf.orden_display
FROM public.cuentas_financieras cf
LEFT JOIN public.ubicaciones u ON u.id_ubicacion = cf.id_ubicacion
WHERE cf.activa = true
ORDER BY cf.orden_display, cf.nombre;

GRANT SELECT ON public.v_rapido_cuentas TO anon, authenticated;
```

### 2.8 `rapidoClient.js` — API mínima

```javascript
// src/views/rapido/api/rapidoClient.js
import { supabase } from '../../../lib/supabaseClient';
import bcrypt from 'bcryptjs';

export async function loginRapido(pin) {
  const { data, error } = await supabase
    .from('personas_tienda')
    .select('id_persona, nombre, pin_hash, activa')
    .eq('activa', true);
  if (error) throw error;
  for (const p of data || []) {
    if (p.pin_hash && bcrypt.compareSync(pin, p.pin_hash)) {
      const { data: permisos } = await supabase
        .from('permisos_persona')
        .select('recurso, nivel_acceso, activo')
        .eq('id_persona', p.id_persona)
        .eq('activo', true);
      const tieneRapido = (permisos || []).some(
        x => x.recurso === 'rapido' && ['registrar','editar','admin'].includes(x.nivel_acceso)
      );
      if (!tieneRapido) {
        const e = new Error('Esta persona no tiene acceso al Modo Rápido');
        e.code = 'NO_PERMISSION';
        throw e;
      }
      return { ...p, permisos };
    }
  }
  const e = new Error('PIN incorrecto');
  e.code = 'INVALID_PIN';
  throw e;
}

export async function listarCuentasRapido() {
  const { data, error } = await supabase.from('v_rapido_cuentas').select('*');
  if (error) throw error;
  return data || [];
}

export async function listarTiposGasto() {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('*')
    .in('tipo_flujo', ['egreso', 'ambos'])
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data || [];
}

export async function listarDeudasActivas() {
  const { data, error } = await supabase
    .from('deudas')
    .select('id_deuda, codigo, nombre, acreedor, saldo_actual, cuota_monto')
    .eq('estado', 'activa')
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function registrarGastoRapido({ idCuenta, monto, concepto, idTipo, idPersona }) {
  // 1. Insertar movimiento (sin caja_dia, va directo a la cuenta financiera)
  const { data: mov, error: e1 } = await supabase
    .from('movimientos_caja')
    .insert({
      tipo: 'egreso',
      monto,
      concepto,
      id_cuenta_financiera: idCuenta,
      id_tipo: idTipo,
      id_persona: idPersona,
      metodo: 'efectivo',
    })
    .select()
    .single();
  if (e1) throw e1;

  // 2. Actualizar saldo de la cuenta (idealmente esto debería ser un trigger DB,
  //    pero por consistencia con el resto del módulo se hace desde el cliente)
  const { data: cuenta, error: e2 } = await supabase
    .from('cuentas_financieras')
    .select('saldo_actual')
    .eq('id_cuenta', idCuenta)
    .single();
  if (e2) throw e2;

  await supabase
    .from('cuentas_financieras')
    .update({ saldo_actual: Number(cuenta.saldo_actual) - Number(monto) })
    .eq('id_cuenta', idCuenta);

  return mov;
}

export async function registrarPagoDeudaRapido({ idDeuda, idCuenta, monto, idPersona }) {
  // similar a registrarGastoRapido pero asocia id_deuda y descuenta saldo de la deuda
  // implementación análoga; ver patrón arriba
}

export async function obtenerObligacionesProximas() {
  const { data, error } = await supabase
    .from('v_obligaciones_proximas')
    .select('*')
    .order('fecha_proxima');
  if (error) throw error;
  return data || [];
}
```

> **Nota técnica importante para el agente:** El proyecto actualiza saldos desde el cliente. Si quieres robustez, el siguiente paso (no parte de este plan) sería mover esto a un trigger PostgreSQL. Por ahora, **mantén el mismo patrón** que el resto de `finanzasClient.js` para no romper la consistencia.

### 2.9 PWA — confirmar instalabilidad
- El proyecto **ya tiene** `manifest.json`, `theme-color`, `apple-touch-icon`. Verificar que `manifest.json` declare `start_url: '/rapido'` o crear una variante. **Decisión:** dejar `start_url: '/'` y que cada padre añada manualmente "Agregar a inicio" desde la URL `/rapido`. Más simple.
- **No** instalar Workbox ni service worker custom en este bloque. La PWA actual es suficiente (no offline-first; los padres siempre tienen datos móviles).

---

## 3. PASO A PASO DE EJECUCIÓN (orden estricto)

### Fase 1 — Backend Bloque 4
1. Crear `supabase/migrations/20260413_dashboards_financieros.sql` con el SQL de §1.2.
2. Aplicar migración: `supabase db push` (o desde el dashboard de Supabase si el agente no tiene CLI conectada).
3. **Verificación manual**: ejecutar en SQL editor de Supabase:
```sql
   SELECT * FROM public.fn_pl_resumen('2026-01-01', '2026-12-31');
   SELECT * FROM public.fn_patrimonio_totales();
   SELECT * FROM public.v_flujo_caja_mensual LIMIT 5;
```
4. Si alguna view falla porque `plan_cuentas` está vacía, **no es un bug**: el dashboard mostrará empty state. Continuar.

### Fase 2 — Frontend Bloque 4
5. `npm install recharts@^2.15.0`.
6. Crear `src/views/finanzas/api/dashboardClient.js` con el contenido de §1.5.
7. Crear carpeta `src/views/finanzas/components/charts/` con:
   - `colors.js` (exporta paleta).
   - `ChartContainer.jsx` (wrapper con loading/empty/error, recibe `loading`, `empty`, `error`, `children`).
   - `KpiCard.jsx` (tarjeta con label, monto grande, delta opcional).
   - `BarChartFlujo.jsx` (§1.7).
   - `PieChartPL.jsx` (PieChart de Recharts con tooltip y leyenda).
8. **Reescribir** `src/views/finanzas/views/Dashboard.jsx`:
   - Estado: `tab` ('pl' | 'flujo' | 'patrimonio'), `periodo`, `loading`, `data`.
   - 3 efectos `useEffect` (uno por tab) que solo ejecutan cuando el tab está activo.
   - Persistir `tab` y `periodo` en localStorage.
   - Renderizar tabs como botones planos (no usar `<select>`).
9. **Verificación**: navegar a `/finanzas` (la ruta `/finanzas` por defecto entra a Dashboard según el layout actual). Confirmar que los 3 tabs renderizan sin errores y los gráficos aparecen aunque sea con datos vacíos.
10. **Test de permisos**: con un usuario sin nivel `admin` en `'finanzas'`, confirmar que el tab Patrimonio muestra "Sin acceso".

### Fase 3 — Backend Bloque 5
11. Crear `supabase/migrations/20260413_modo_rapido_permisos.sql` con el SQL de §2.7.
12. Aplicar migración.
13. **Sembrar permiso de prueba**: en SQL editor:
```sql
    INSERT INTO permisos_persona (id_persona, recurso, nivel_acceso, activo)
    VALUES (<id_persona_de_papa>, 'rapido', 'registrar', true);
```

### Fase 4 — Frontend Bloque 5
14. Editar `src/views/finanzas/lib/permisos.js`: añadir `RAPIDO: 'rapido'` a `RECURSOS`.
15. Editar `src/views/finanzas/views/PersonasEquipo.jsx`: añadir un control (toggle o select) por fila para `'rapido'`, usando los handlers `asignarPermiso(idPersona, 'rapido', nivel)` / `revocarPermiso(idPersona, 'rapido')` ya existentes en `finanzasClient.js`. **No crear nuevas funciones**: las existentes son genéricas por recurso.
16. Crear estructura `src/views/rapido/` completa según §2.5.
17. Implementar `RapidoGate.jsx` reutilizando el patrón de `FinanzasGate.jsx` (login con PIN), pero validando permiso `'rapido'`. Clave de localStorage: `'berna.rapido.session.v1'`.
18. Implementar `RapidoContext.jsx` (provider con `usuario`, `cuentas`, `refrescarCuentas`).
19. Implementar `RapidoLayout.jsx`:
    - Header fijo de 56px: nombre del usuario + botón "Salir".
    - `<Outlet />` en el body.
    - `<Routes>` internas con las 5 rutas.
20. Implementar componentes táctiles en `components/`:
    - `BigButton`, `BigInput`, `MoneyDisplay`, `NumPad`, `StepHeader`, `ConfirmCard`.
    - **Reutilizar** `NumPad` del módulo finanzas si ya existe (lo vi en `FinanzasGate`); si está acoplado, copiarlo y simplificarlo.
21. Implementar las 5 vistas. **Empezar por `Home.jsx` y `VerCuentas.jsx`** (más simples), terminar con `Transferir.jsx` (más compleja).
22. Editar `src/main.jsx` para añadir `<Route path="/rapido/*" element={<RapidoRoot />} />` antes de la ruta catch-all.

### Fase 5 — QA y handoff
23. **Test manual completo** en móvil real (no DevTools):
    - Login con PIN del padre de prueba.
    - Registrar un gasto de S/ 50 → verificar que aparece en `movimientos_caja` y que el saldo de la cuenta bajó.
    - Volver al Home con botón atrás → no debe pedir PIN de nuevo.
    - Cerrar sesión → debe pedir PIN.
24. **Test de permiso**: con un PIN de una persona sin permiso `'rapido'`, debe mostrar mensaje "No tienes acceso al Modo Rápido" sin dejarla entrar.
25. **Test de agregar admin desde UI**: entrar a `/finanzas/personas` con un usuario admin, asignar permiso `'rapido'` a una nueva persona, hacer logout, login en `/rapido` con esa persona → debe funcionar sin tocar código.
26. **Lighthouse PWA score** en `/rapido` ≥ 80.

---

## 4. Lógica de negocio crítica que NO se debe olvidar

1. **Zona horaria**: Lima es UTC-5. Todas las queries SQL que agrupan por día usan `AT TIME ZONE 'America/Lima'`. No remover esto.
2. **Saldos de cuentas**: hoy se actualizan desde el cliente JS (patrón existente). El Modo Rápido **mantiene** ese patrón para consistencia. Idealmente debería ser un trigger DB, pero eso es scope futuro.
3. **`movimientos_caja.tiene_splits`**: cuando un movimiento tiene splits, su monto NO debe sumarse en el P&L (los splits se suman aparte). Por eso `v_movimientos_clasificados` filtra `tiene_splits = false OR IS NULL`. Cuando se implemente la lógica completa de splits, habrá que extender la vista.
4. **Permiso `'rapido'` jerárquico**: respetar la jerarquía existente en `permisos.js`: `ninguno < ver < registrar < editar < admin`. Para entrar al Modo Rápido se requiere mínimo `registrar`.
5. **Modo Rápido NO toca cierres de caja diaria**: los movimientos registrados desde `/rapido` van directo a la cuenta financiera (BCP, caja chica, etc.), no a `cajas` (que es el cierre diario por tienda). Esto es intencional: los padres mueven dinero entre cuentas, no operan POS.
6. **El Dashboard NO muestra cuentas marcadas como `es_cuenta_personal=true` en el patrimonio** salvo que el usuario sea admin. Añadir ese filtro en el frontend si aplica (post-MVP).

---

## 5. Definition of Done

**Bloque 4 — Dashboards:**
- [ ] Migración SQL aplicada y verificada con queries de prueba.
- [ ] `recharts` instalado.
- [ ] `Dashboard.jsx` renderiza los 3 tabs sin errores en consola.
- [ ] Los gráficos muestran datos reales del periodo seleccionado.
- [ ] Permisos respetados (Patrimonio solo admin).
- [ ] Funciona en móvil (responsive) — los `ResponsiveContainer` deben adaptarse.

**Bloque 5 — Modo Rápido:**
- [ ] Migración SQL aplicada.
- [ ] `/rapido` accesible y protegido por PIN.
- [ ] Login valida permiso `'rapido'`.
- [ ] Las 5 vistas funcionan (Home, Gasto, PagoDeuda, Transferir, VerCuentas, Obligaciones).
- [ ] Registrar un gasto crea registro en `movimientos_caja` y actualiza saldo de cuenta.
- [ ] Desde `/finanzas/personas` se puede dar/quitar permiso `'rapido'` sin tocar código.
- [ ] Funciona en móvil real con tipografía mínima 16px y botones mínimo 64px.
- [ ] PWA instalable desde la URL `/rapido`.

---

## 6. Fuera de scope (NO hacer en este sprint)

- Triggers PostgreSQL para actualizar saldos automáticamente.
- Modo offline / Service Worker custom.
- Notificaciones push de obligaciones próximas.
- Exportar P&L a PDF (existe `jspdf` ya en el proyecto, dejarlo para iteración 2).
- Forecast / proyecciones de flujo de caja.
- Tab de "Capital de trabajo del lunes" (lo implementaremos en Bloque 6).




Key documentation: Business Logic: Refer to docs/business_logic.md for full operational context.
