# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `sistema-calzado/`:

```bash
npm run dev       # Start dev server (Vite HMR, all hosts)
npm run build     # Production build → dist/
npm run preview   # Preview production build
npm run lint      # ESLint v9 flat config check
```

Requires a `.env` file in `sistema-calzado/` with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Node version: `^20.19.0 || >=22.12.0`

## Architecture

Single-page React 19 + Vite app targeting Vercel. All routes rewrite to `index.html` (see `vercel.json`). No TypeScript — plain JavaScript throughout.

### Three Distinct Application Areas

**1. Root App (`/`)** — PIN-authenticated POS and operations
- Modules: VentasPOS, ProduccionLotes, Inventario, Caja, CatalogoCostos, PlanificadorPedido

**2. Gestión Empresarial (`/gestion/*`)** — Full financial and admin suite (replaces the former Finanzas workspace)
- Entry gate: `GestionGate.jsx` (PIN auth; session in `localStorage` key `berna_gestion_session`, with one-release fallback for `berna_finanzas_session`)
- Legacy URLs `/finanzas/*` redirect to `/gestion/*` (same path suffix)
- Default landing: `/gestion/resumen` (placeholder executive summary; Estado de Resultados remains the main P&L under `/gestion/estado-resultados`)
- Sub-modules (in sidebar order):
  - `EstadoResultados` — Interactive P&L with BI drill-downs (ventas, costos, personal, materiales). Default period: current week. Supports `?ubicacion=X` URL param to filter by location.
  - `Dashboard` — Flujo de Caja + Patrimonio only (P&L was moved to EstadoResultados)
  - `Cuentas` — Financial accounts CRUD
  - `Deudas` — Debt management with amortization schedule, TCEA, extra-payment simulation
  - `CostosFijos` — Recurring fixed costs. Personal/salary costs must be created via Trabajadores, not here. Cuenta contable auto-assigned via `mapeo_categoria_cuenta` table with local fallback.
  - `Trabajadores` — Staff management (salary, contract type, area, preferred location). Creates linked `costos_fijos` for salary.
  - `Movimientos` — Cash movements with splits and accounting classification
  - `Transferencias` — Inter-account transfers
  - `PlanCuentas` — Chart of accounts (~50 accounts, source of truth for P&L classification)
  - `Ubicaciones` — **Hub Empresarial**: list of Tiendas & Talleres with live mini-KPIs (ventas, costos, personal del mes). Each card links to `/gestion/ubicaciones/:id`
  - `HubUbicacion` — Hub detail per location: KPI strip + 5 tabs (Resumen/P&L, Ventas, Costos, Equipo, Movimientos). Ventas tab only shown for `rol='Tienda'`.
  - `Equipo` — Admin users management (adminOnly)
  - `CierresPeriodo` — Historial de cierres contables + wizard 3 pasos (checklist → PDF preview → PIN) + modal de reapertura con motivo obligatorio. Route: `/gestion/cierres` y `/gestion/cierres/:year/:month`
- API clients: `src/views/gestion/api/dashboardClient.js`, `finanzasClient.js`, `cierresClient.js`
- Design tokens: `src/views/gestion/lib/designSystem.js` (palette: `#1c1917`, `#fafaf9`, `#57534e`, `#a8a29e`)
- EstadoResultados uses its own CSS-variable theme (ER_STYLES inline) — slate/indigo/emerald/rose, NOT the standard design tokens

**3. Modo Rápido (`/rapido/*`)** — Simplified high-contrast interface for parents/admins
- Entry gate: `RapidoGate.jsx` (session in `localStorage` key `berna.rapido.session.v1`)
- Global state: `RapidoContext.jsx`
- UI rules: white bg (`#ffffff`), black text (`#0a0a0a`), all buttons ≥ 64px, no tables — list-based only
- Sub-modules: Home, RegistrarGasto, RegistrarPagoDeuda, Transferir, VerCuentas, Obligaciones
- API client: `src/views/rapido/api/rapidoClient.js`

### Permission System

Table-driven RBAC via `permisos_persona`. Permission helpers in `src/views/gestion/lib/permisos.js`:
- `tienePermiso(usuario, recurso, nivelMinimo)`
- Niveles (hierarchical): `ninguno(0) < ver(1) < registrar(2) < editar(3) < admin(4)`
- Recursos: `finanzas`, `cuentas`, `deudas`, `costos_fijos`, `movimientos`, `transferencias`, `configuracion`, `caja`, `rapido`, `cierres`
- Recurso `cierres`: nivel `ver` = ver historial y descargar PDFs; nivel `admin` = cerrar y reabrir períodos
- Modo Rápido access requires `recurso='rapido'` with nivel `registrar`, `editar`, or `admin`

### Database (Supabase)

- `supabase_schema.sql` is the **source of truth** for all schema — update it before applying migrations
- Client: `src/api/supabase.js`
- Auth: PIN-based via `src/lib/pinAuth.js` (bcryptjs hashing against `personas_tienda`)
- Key tables: `personas_tienda`, `permisos_persona`, `cuentas_financieras`, `deudas`, `movimientos_caja`, `movimiento_splits`, `costos_fijos`, `plan_cuentas`, `ventas`, `ubicaciones`, `tipos_movimiento_caja`, `configuracion_sistema`, `mapeo_categoria_cuenta`, `cierres_periodo`
- Key views: `v_pl_mensual`, `v_flujo_caja_diario/mensual`, `v_patrimonio_snapshot`, `v_obligaciones_proximas`, `v_rapido_cuentas`, `v_movimientos_clasificados`, `v_nomina_resumen`, `v_cierres_integridad`
- Key RPC functions: `fn_pl_resumen(fechaInicio, fechaFin, idUbicacion)`, `fn_patrimonio_totales()`, `fn_validar_cierre(year, month)`, `fn_cerrar_periodo(...)`, `fn_reabrir_periodo(id_periodo, motivo, id_persona)`

### Important schema notes
- `ubicaciones` table has NO `created_at` column — do not query it
- `ubicaciones.pin` is `NOT NULL UNIQUE` — always provide a pin when inserting (auto-generate if user leaves blank)
- `personas_tienda` has extended columns via migration: `rol`, `tipo_contrato`, `area`, `cargo`, `salario_base`, `frecuencia_pago`, `fecha_ingreso`, `telefono`, `notas_trabajador`, `id_ubicacion_preferida`, `pin_hash`
- New worker flexibility layer lives in pending migrations `20260416_01_trabajadores_rotativo_multarea.sql` and `20260416_02_trabajadores_puestos_adicionales.sql`: `es_rotativo`, `areas_adicionales`, `puestos_adicionales`
- `mapeo_categoria_cuenta` maps `(categoria_costo, ubicacion_rol)` → `id_cuenta_contable` for auto-assignment in CostosFijos form. Has local JS fallback in `CostosFijos.jsx` (`sugerirCuentaLocal`) when table is empty.

### Applied migrations (already in production DB)
- `20260414_01_personas_rol.sql` — adds `rol` column to `personas_tienda`
- `20260414_02_costos_materiales_y_saldo_no_negativo.sql` — `v_costos_materiales_modelo` view + `fn_validar_saldo_cuenta_no_negativo` trigger
- `20260415_01_trabajadores_y_mapeo_cuenta.sql` — extended worker columns on `personas_tienda` + `mapeo_categoria_cuenta` table + `v_nomina_resumen` view

### Pending local migrations
- `20260416_01_trabajadores_rotativo_multarea.sql` — adds `es_rotativo` and `areas_adicionales` to `personas_tienda`
- `20260416_02_trabajadores_puestos_adicionales.sql` — adds `puestos_adicionales jsonb` for specific secondary roles per worker
- `20260419_01` through `20260419_06` — **Fase 1.5** cierres_periodo table, fn_validar_cierre, fn_cerrar_periodo (pessimistic lock), fn_reabrir_periodo, Storage bucket `cierres-mensuales`, v_cierres_integridad hash-chain view + permisos seed

### Cierres de Período (Fase 1.5)
- `cierres_periodo` table: each closure stores version, SHA-256 hash, Storage URL, KPI snapshot, checklist result. Multi-tenant ready (`id_organizacion uuid`).
- Storage bucket `cierres-mensuales` is **private** — download via `supabase.storage.createSignedUrl()` (1h expiry).
- PDF generation uses `@react-pdf/renderer` loaded **lazily** (not in main bundle).
- Hash chain: v2+ PDFs incorporate hash of v1, enabling integrity check via `v_cierres_integridad`.
- BannerCierrePendiente: shown globally in GestionLayout to admins when past months are still open.

### Naming Conventions

- DB tables and columns: `snake_case`
- React variables and props: `camelCase`

### Charting

Uses **Recharts** (not Tremor — incompatible with Tailwind v4). Charts live in `src/views/gestion/components/charts/`.

### Documentation

`instrucciones_agente.md` (root, 37KB) contains the full implementation plan for Bloques 4 & 5 (financial dashboards and Modo Rápido), including SQL migrations, component structure guidelines, and architectural decisions. Read it before working on those features.

`sistema-calzado/docs/` contains supplementary design documents for multi-store contributions, catalog logic, and Supabase RLS setup.
