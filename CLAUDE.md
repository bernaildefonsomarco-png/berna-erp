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

**2. Finanzas (`/finanzas/*`)** — Full financial management suite
- Entry gate: `FinanzasGate.jsx` (PIN auth, session in `localStorage` key `berna_finanzas_session`)
- Dashboards: P&L, Flujo de Caja, Patrimonio (balance sheet)
- Sub-modules: Cuentas, Deudas, CostosFijos, Movimientos, Transferencias, PlanCuentas, PersonasEquipo, Configuracion, MapaDeudas, AjustesFinanzas
- API clients: `src/views/finanzas/api/dashboardClient.js` and `finanzasClient.js`
- Design tokens: `src/views/finanzas/lib/designSystem.js` (palette: `#1c1917`, `#fafaf9`, `#57534e`, `#a8a29e`)

**3. Modo Rápido (`/rapido/*`)** — Simplified high-contrast interface for parents/admins
- Entry gate: `RapidoGate.jsx` (session in `localStorage` key `berna.rapido.session.v1`)
- Global state: `RapidoContext.jsx`
- UI rules: white bg (`#ffffff`), black text (`#0a0a0a`), all buttons ≥ 64px, no tables — list-based only
- Sub-modules: Home, RegistrarGasto, RegistrarPagoDeuda, Transferir, VerCuentas, Obligaciones
- API client: `src/views/rapido/api/rapidoClient.js`

### Permission System

Table-driven RBAC via `permisos_persona`. Permission helpers in `src/views/finanzas/lib/permisos.js`:
- `tienePermiso(usuario, recurso, nivelMinimo)`
- Niveles (hierarchical): `ninguno(0) < ver(1) < registrar(2) < editar(3) < admin(4)`
- Recursos: `finanzas`, `cuentas`, `deudas`, `costos_fijos`, `movimientos`, `transferencias`, `configuracion`, `caja`, `rapido`
- Modo Rápido access requires `recurso='rapido'` with nivel `registrar`, `editar`, or `admin`

### Database (Supabase)

- `supabase_schema.sql` is the **source of truth** for all schema — update it before applying migrations
- Client: `src/api/supabase.js`
- Auth: PIN-based via `src/lib/pinAuth.js` (bcryptjs hashing against `personas_tienda`)
- Key tables: `personas_tienda`, `permisos_persona`, `cuentas_financieras`, `deudas`, `movimientos_caja`, `movimiento_splits`, `costos_fijos`, `plan_cuentas`, `ventas`, `ubicaciones`, `tipos_movimiento_caja`, `configuracion_sistema`
- Key views: `v_pl_mensual`, `v_flujo_caja_diario/mensual`, `v_patrimonio_snapshot`, `v_obligaciones_proximas`, `v_rapido_cuentas`, `v_movimientos_clasificados`
- Key RPC functions: `fn_pl_resumen(fechaInicio, fechaFin, idUbicacion)`, `fn_patrimonio_totales()`

### Naming Conventions

- DB tables and columns: `snake_case`
- React variables and props: `camelCase`

### Charting

Uses **Recharts** (not Tremor — incompatible with Tailwind v4). Charts live in `src/views/finanzas/components/charts/`.

### Documentation

`instrucciones_agente.md` (root, 37KB) contains the full implementation plan for Bloques 4 & 5 (financial dashboards and Modo Rápido), including SQL migrations, component structure guidelines, and architectural decisions. Read it before working on those features.

`sistema-calzado/docs/` contains supplementary design documents for multi-store contributions, catalog logic, and Supabase RLS setup.
