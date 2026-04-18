# Fase 1 — Motor de Taxonomía Universal + QuickEntry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert rigid taxonomy and registration surfaces into a database-driven engine where admins manage economic-event catalogs via UI, and a single universal `QuickEntry` component registers financial movements contextually from any surface.

**Architecture:** Three layers. (1) SQL: extend `tipos_movimiento_caja` with behavior columns + introduce `plantillas_recurrentes`, `mapeo_tipo_cuenta`, `catalogos_auxiliares`, audit/event tables, and RPC `fn_registrar_hecho_economico` as the single atomic entry point. (2) React: universal `QuickEntry` component reused from 5 surfaces, plus `CatalogoAdmin` for data-driven catalog management and `AbrirUbicacionWizard` for onboarding. (3) Conversions: existing `CostosFijos`/`Movimientos`/`Transferencias` become read-only analytical views.

**Tech Stack:** Supabase (PostgreSQL 15), React 19, Vite 7, Tailwind v4, Recharts, plain JavaScript. No TypeScript. No test framework installed (validation via SQL verification queries and manual browser smoke tests).

**Spec reference:** `docs/superpowers/specs/2026-04-18-fase1-motor-taxonomia-quickentry.md`

**No automated test framework note:** This codebase has no Jest/Vitest/Playwright setup. The TDD pattern is adapted: SQL migrations use **verification queries** (a `SELECT` that should fail before migration, succeed after). React components use **manual browser smoke tests** with a specific flow to execute in dev server. Adding a test runner is out of scope for Fase 1.

**Migration application note:** Migrations will be applied by the user pasting into the Supabase SQL editor. Each migration task produces (1) the migration SQL file, (2) a `.down.sql` rollback file, and (3) a **verification block** to run in Supabase after paste.

---

## File Structure

### SQL migrations — `sistema-calzado/supabase/migrations/`
- `20260418_01_catalogos_auxiliares.sql` + `.down.sql` — catalogos_auxiliares + roles_persona
- `20260418_02_tipos_movimiento_extensiones.sql` + `.down.sql` — ALTER tipos_movimiento_caja
- `20260418_03_plantillas_recurrentes.sql` + `.down.sql` — plantillas_recurrentes + plantilla_ejecuciones
- `20260418_04_mapeo_tipo_cuenta.sql` + `.down.sql` — mapeo_tipo_cuenta table
- `20260418_05_movimientos_fks_extra.sql` + `.down.sql` — ALTER movimientos_caja + moneda on cuentas_financieras
- `20260418_06_periodos_contables.sql` + `.down.sql` — periodos_contables + trigger bloqueo
- `20260418_07_auditoria_eventos.sql` + `.down.sql` — tipo_eventos, plantilla_eventos, audit_log + triggers inmutables
- `20260418_08_triggers_integridad.sql` + `.down.sql` — splits sum check, snapshot nombre, audit genérico
- `20260418_09_fn_resolver_cuenta_contable.sql` + `.down.sql` — función RPC
- `20260418_10_fn_registrar_hecho_economico.sql` + `.down.sql` — función RPC principal con FOR UPDATE
- `20260418_11_fn_generar_desde_plantilla.sql` + `.down.sql` — idempotente
- `20260418_12_vistas_observabilidad.sql` + `.down.sql` — v_sistema_salud + índice trigram
- `20260418_13_seed_catalogo_inicial.sql` + `.down.sql` — seeds idempotentes
- `20260418_14_deprecate_legacy_checks.sql` + `.down.sql` — rename CHECKs a _deprecated_

### SQL source of truth
- Modify: `sistema-calzado/supabase_schema.sql` — reflect all new tables/columns

### Frontend — resolvers (cliente-side cascade preview)
- Create: `sistema-calzado/src/lib/resolvers/cuentaContable.js`
- Create: `sistema-calzado/src/lib/resolvers/cuentaFinanciera.js`
- Create: `sistema-calzado/src/lib/resolvers/camposRequeridos.js`

### Frontend — QuickEntry universal component
- Create: `sistema-calzado/src/components/QuickEntry/QuickEntry.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/TipoSelector.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/CamposDinamicos.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/SplitsEditor.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/ResumenConfirmacion.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/api.js`

### Frontend — CatalogoAdmin
- Create: `sistema-calzado/src/views/finanzas/views/admin/CatalogoAdmin.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabTiposMovimiento.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabPlantillas.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabMapeo.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabRoles.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabCatalogosAux.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabPeriodos.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabSalud.jsx`
- Create: `sistema-calzado/src/views/finanzas/api/catalogoClient.js`

### Frontend — AbrirUbicacionWizard
- Create: `sistema-calzado/src/views/finanzas/views/ubicaciones/AbrirUbicacionWizard.jsx`
- Modify: `sistema-calzado/src/views/finanzas/views/Ubicaciones.jsx` — add trigger button

### Frontend — Module conversions
- Create: `sistema-calzado/src/views/finanzas/views/EstructuraFinanciera.jsx` (replaces CostosFijos)
- Delete: `sistema-calzado/src/views/finanzas/views/CostosFijos.jsx`
- Modify: `sistema-calzado/src/views/finanzas/views/Movimientos.jsx` — remove creation form
- Modify: `sistema-calzado/src/views/finanzas/views/Transferencias.jsx` — remove creation form
- Modify: `sistema-calzado/src/views/finanzas/FinanzasLayout.jsx` — rename sidebar label, update routes

### Frontend — Rápido → Comando rename
- Rename: `sistema-calzado/src/views/rapido/` → `sistema-calzado/src/views/comando/`
- Modify: `sistema-calzado/src/App.jsx` — update route from `/rapido/*` to `/comando/*` + 301 redirect
- Modify: all internal imports (bulk rename via search-replace)

### Frontend — Integration wiring
- Modify: `sistema-calzado/src/views/Caja.jsx` — replace existing 2-step modal with `QuickEntry`
- Modify: `sistema-calzado/src/views/comando/views/RegistrarGasto.jsx` — use `QuickEntry`
- Modify: `sistema-calzado/src/views/comando/views/RegistrarPagoDeuda.jsx` — use `QuickEntry`
- Modify: `sistema-calzado/src/views/comando/views/Transferir.jsx` — use `QuickEntry` with scope=transferencia
- Modify: `sistema-calzado/src/views/finanzas/views/HubUbicacion.jsx` — add QuickEntry trigger per location

---

## Execution Strategy

Migrations 01→14 must be applied in order (later ones depend on earlier tables/functions). Section A (tasks 1–14) should be executed sequentially with verification after each. Section B (tasks 15+) can overlap once their SQL dependencies are in place.

**Commit frequency:** one commit per migration, one commit per frontend component, one commit per conversion. Target ~30 commits for the full plan.

---

## SECTION A — DATABASE FOUNDATION

### Task 1: Migration 01 — Catálogos auxiliares + roles_persona

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_01_catalogos_auxiliares.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_01_catalogos_auxiliares.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_01_catalogos_auxiliares.sql
-- Fase 1 — Catálogos auxiliares extensibles + roles_persona como catálogo explícito.

CREATE TABLE IF NOT EXISTS public.catalogos_auxiliares (
  id_catalogo serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogos_auxiliares_codigo_ci
  ON public.catalogos_auxiliares (lower(codigo));

CREATE TABLE IF NOT EXISTS public.roles_persona (
  id_rol serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  ambito text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_persona_codigo_ci
  ON public.roles_persona (lower(codigo));
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_01_catalogos_auxiliares.down.sql
DROP TABLE IF EXISTS public.roles_persona;
DROP TABLE IF EXISTS public.catalogos_auxiliares;
```

- [ ] **Step 3: Write verification query (should fail before apply)**

Paste in Supabase SQL editor BEFORE applying migration:
```sql
SELECT to_regclass('public.catalogos_auxiliares') IS NOT NULL AS has_catalogos,
       to_regclass('public.roles_persona') IS NOT NULL AS has_roles;
-- Expected BEFORE migration: has_catalogos=false, has_roles=false
```

- [ ] **Step 4: Apply UP migration in Supabase SQL editor**

Paste the contents of `20260418_01_catalogos_auxiliares.sql` and run.

- [ ] **Step 5: Re-run verification query**

```sql
SELECT to_regclass('public.catalogos_auxiliares') IS NOT NULL AS has_catalogos,
       to_regclass('public.roles_persona') IS NOT NULL AS has_roles;
-- Expected AFTER migration: has_catalogos=true, has_roles=true
```

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_01_catalogos_auxiliares.sql \
        sistema-calzado/supabase/migrations/down/20260418_01_catalogos_auxiliares.down.sql
git commit -m "feat(db): add catalogos_auxiliares and roles_persona tables"
```

---

### Task 2: Migration 02 — Extensiones a tipos_movimiento_caja

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_02_tipos_movimiento_extensiones.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_02_tipos_movimiento_extensiones.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_02_tipos_movimiento_extensiones.sql
-- Fase 1 — Convertir tipos_movimiento_caja en motor de comportamiento.

ALTER TABLE public.tipos_movimiento_caja
  ADD COLUMN IF NOT EXISTS direccion text
    CHECK (direccion IN ('entrada','salida','transferencia')),
  ADD COLUMN IF NOT EXISTS id_cuenta_contable_default integer
    REFERENCES public.plan_cuentas(id_cuenta),
  ADD COLUMN IF NOT EXISTS id_cuenta_financiera_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS id_cuenta_origen_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS id_cuenta_destino_default integer
    REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN IF NOT EXISTS scope text[] NOT NULL DEFAULT '{manual}',
  ADD COLUMN IF NOT EXISTS comportamientos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS campos_requeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS afecta_patrimonio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS solo_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naturaleza text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_tipos_movimiento_caja_scope
  ON public.tipos_movimiento_caja USING gin (scope);
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_02_tipos_movimiento_extensiones.down.sql
ALTER TABLE public.tipos_movimiento_caja
  DROP COLUMN IF EXISTS direccion,
  DROP COLUMN IF EXISTS id_cuenta_contable_default,
  DROP COLUMN IF EXISTS id_cuenta_financiera_default,
  DROP COLUMN IF EXISTS id_cuenta_origen_default,
  DROP COLUMN IF EXISTS id_cuenta_destino_default,
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS comportamientos,
  DROP COLUMN IF EXISTS campos_requeridos,
  DROP COLUMN IF EXISTS afecta_patrimonio,
  DROP COLUMN IF EXISTS color_hex,
  DROP COLUMN IF EXISTS solo_admin,
  DROP COLUMN IF EXISTS naturaleza,
  DROP COLUMN IF EXISTS moneda;
DROP INDEX IF EXISTS idx_tipos_movimiento_caja_scope;
```

- [ ] **Step 3: Write verification query**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='tipos_movimiento_caja'
  AND column_name IN ('direccion','scope','comportamientos','campos_requeridos','solo_admin','moneda');
-- Expected AFTER migration: 6 rows returned.
```

- [ ] **Step 4: Apply UP migration in Supabase SQL editor**

- [ ] **Step 5: Run verification — expect 6 rows**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_02_tipos_movimiento_extensiones.sql \
        sistema-calzado/supabase/migrations/down/20260418_02_tipos_movimiento_extensiones.down.sql
git commit -m "feat(db): extend tipos_movimiento_caja with behavior columns"
```

---

### Task 3: Migration 03 — plantillas_recurrentes + plantilla_ejecuciones

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_03_plantillas_recurrentes.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_03_plantillas_recurrentes.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_03_plantillas_recurrentes.sql
-- Fase 1 — Plantillas de eventos económicos periódicos con idempotencia.

CREATE TABLE IF NOT EXISTS public.plantillas_recurrentes (
  id_plantilla serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  id_tipo integer NOT NULL REFERENCES public.tipos_movimiento_caja(id_tipo),
  id_ubicacion integer REFERENCES public.ubicaciones(id_ubicacion),
  id_cuenta_contable integer REFERENCES public.plan_cuentas(id_cuenta),
  id_cuenta_financiera_default integer REFERENCES public.cuentas_financieras(id_cuenta_financiera),
  direccion text,
  monto_estimado numeric(14,2),
  frecuencia text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','unico')),
  dia_referencia integer,
  comportamientos text[] NOT NULL DEFAULT '{}',
  id_plantilla_objetivo integer REFERENCES public.plantillas_recurrentes(id_plantilla),
  tarifa_por_unidad numeric(14,2),
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','archivada')),
  activo boolean NOT NULL DEFAULT true,
  datos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_recurrentes_codigo_ci
  ON public.plantillas_recurrentes (lower(codigo));
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_ubicacion
  ON public.plantillas_recurrentes(id_ubicacion) WHERE id_ubicacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_tipo
  ON public.plantillas_recurrentes(id_tipo);
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_estado
  ON public.plantillas_recurrentes(estado) WHERE activo = true;

CREATE TABLE IF NOT EXISTS public.plantilla_ejecuciones (
  id_ejecucion serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  periodo text NOT NULL,
  fecha_generada timestamptz NOT NULL DEFAULT now(),
  id_movimiento integer REFERENCES public.movimientos_caja(id_movimiento),
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  UNIQUE (id_plantilla, periodo)
);

CREATE INDEX IF NOT EXISTS idx_plantilla_ejecuciones_plantilla_periodo
  ON public.plantilla_ejecuciones(id_plantilla, periodo);
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_03_plantillas_recurrentes.down.sql
DROP TABLE IF EXISTS public.plantilla_ejecuciones;
DROP TABLE IF EXISTS public.plantillas_recurrentes;
```

- [ ] **Step 3: Write verification query**

```sql
SELECT to_regclass('public.plantillas_recurrentes') IS NOT NULL AS has_plantillas,
       to_regclass('public.plantilla_ejecuciones') IS NOT NULL AS has_ejecuciones;
-- Expected AFTER: both true
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification — expect both true**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_03_plantillas_recurrentes.sql \
        sistema-calzado/supabase/migrations/down/20260418_03_plantillas_recurrentes.down.sql
git commit -m "feat(db): add plantillas_recurrentes + ejecuciones for idempotent generation"
```

---

### Task 4: Migration 04 — mapeo_tipo_cuenta

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_04_mapeo_tipo_cuenta.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_04_mapeo_tipo_cuenta.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_04_mapeo_tipo_cuenta.sql
-- Fase 1 — Mapeo tipo de movimiento × rol de ubicación → cuenta contable.

CREATE TABLE IF NOT EXISTS public.mapeo_tipo_cuenta (
  id_mapeo serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  ubicacion_rol text NOT NULL,
  id_cuenta_contable integer NOT NULL REFERENCES public.plan_cuentas(id_cuenta),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (id_tipo, ubicacion_rol)
);

CREATE INDEX IF NOT EXISTS idx_mapeo_tipo_cuenta_tipo
  ON public.mapeo_tipo_cuenta(id_tipo);
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_04_mapeo_tipo_cuenta.down.sql
DROP TABLE IF EXISTS public.mapeo_tipo_cuenta;
```

- [ ] **Step 3: Write verification query**

```sql
SELECT to_regclass('public.mapeo_tipo_cuenta') IS NOT NULL AS has_mapeo;
-- Expected AFTER: true
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_04_mapeo_tipo_cuenta.sql \
        sistema-calzado/supabase/migrations/down/20260418_04_mapeo_tipo_cuenta.down.sql
git commit -m "feat(db): add mapeo_tipo_cuenta for location-role-aware account resolution"
```

---

### Task 5: Migration 05 — movimientos_caja FKs extras + moneda

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_05_movimientos_fks_extra.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_05_movimientos_fks_extra.down.sql`

**Note on dependencies:** `movimientos_caja.id_plantilla_origen` references `plantillas_recurrentes` (Task 3). `id_venta` references `ventas` (existing). `id_lote_produccion` references `lotes_produccion` (verify name before applying — check with `SELECT to_regclass('public.lotes_produccion');`; if table name differs, adjust FK name in the migration).

- [ ] **Step 1: Pre-check the lote table name**

Run in Supabase:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name ILIKE '%lote%';
```
Note the exact name. If it is NOT `lotes_produccion`, substitute below.

- [ ] **Step 2: Write the UP migration**

```sql
-- 20260418_05_movimientos_fks_extra.sql
-- Fase 1 — Trazabilidad de movimientos + snapshot + moneda.

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS id_plantilla_origen integer
    REFERENCES public.plantillas_recurrentes(id_plantilla),
  ADD COLUMN IF NOT EXISTS id_venta integer
    REFERENCES public.ventas(id_venta),
  ADD COLUMN IF NOT EXISTS id_lote_produccion integer
    REFERENCES public.lotes_produccion(id_lote),
  ADD COLUMN IF NOT EXISTS snapshot_tipo_nombre text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_movimientos_plantilla_origen
  ON public.movimientos_caja(id_plantilla_origen) WHERE id_plantilla_origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_venta
  ON public.movimientos_caja(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_lote
  ON public.movimientos_caja(id_lote_produccion) WHERE id_lote_produccion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion_fecha
  ON public.movimientos_caja(id_ubicacion, fecha_movimiento DESC);

ALTER TABLE public.cuentas_financieras
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';
```

- [ ] **Step 3: Write the DOWN migration**

```sql
-- down/20260418_05_movimientos_fks_extra.down.sql
DROP INDEX IF EXISTS idx_movimientos_plantilla_origen;
DROP INDEX IF EXISTS idx_movimientos_venta;
DROP INDEX IF EXISTS idx_movimientos_lote;
DROP INDEX IF EXISTS idx_movimientos_ubicacion_fecha;

ALTER TABLE public.movimientos_caja
  DROP COLUMN IF EXISTS id_plantilla_origen,
  DROP COLUMN IF EXISTS id_venta,
  DROP COLUMN IF EXISTS id_lote_produccion,
  DROP COLUMN IF EXISTS snapshot_tipo_nombre,
  DROP COLUMN IF EXISTS moneda;

ALTER TABLE public.cuentas_financieras DROP COLUMN IF EXISTS moneda;
```

- [ ] **Step 4: Write verification query**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='movimientos_caja'
  AND column_name IN ('id_plantilla_origen','id_venta','id_lote_produccion','snapshot_tipo_nombre','moneda');
-- Expected AFTER: 5 rows
```

- [ ] **Step 5: Apply UP migration**

- [ ] **Step 6: Run verification — expect 5 rows**

- [ ] **Step 7: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_05_movimientos_fks_extra.sql \
        sistema-calzado/supabase/migrations/down/20260418_05_movimientos_fks_extra.down.sql
git commit -m "feat(db): add trazability FKs + snapshot + moneda to movimientos_caja"
```

---

### Task 6: Migration 06 — periodos_contables + trigger bloqueo

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_06_periodos_contables.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_06_periodos_contables.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_06_periodos_contables.sql
-- Fase 1 — Control de períodos contables cerrados.

CREATE TABLE IF NOT EXISTS public.periodos_contables (
  id_periodo serial PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por integer REFERENCES public.personas_tienda(id_persona),
  cerrado_en timestamptz,
  motivo_reapertura text,
  UNIQUE (year, month)
);

CREATE OR REPLACE FUNCTION public.fn_bloquear_periodo_cerrado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_fecha timestamptz := COALESCE(NEW.fecha_movimiento, OLD.fecha_movimiento);
  v_estado text;
BEGIN
  SELECT estado INTO v_estado
  FROM public.periodos_contables
  WHERE year = EXTRACT(year FROM v_fecha)::int
    AND month = EXTRACT(month FROM v_fecha)::int;
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'PERIODO_CERRADO: no se puede modificar movimientos de un período cerrado (%-%)',
      EXTRACT(year FROM v_fecha), EXTRACT(month FROM v_fecha);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_bloquear_periodo_cerrado ON public.movimientos_caja;
CREATE TRIGGER trg_bloquear_periodo_cerrado
  BEFORE INSERT OR UPDATE OR DELETE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_periodo_cerrado();
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_06_periodos_contables.down.sql
DROP TRIGGER IF EXISTS trg_bloquear_periodo_cerrado ON public.movimientos_caja;
DROP FUNCTION IF EXISTS public.fn_bloquear_periodo_cerrado();
DROP TABLE IF EXISTS public.periodos_contables;
```

- [ ] **Step 3: Write verification query**

```sql
SELECT to_regclass('public.periodos_contables') IS NOT NULL AS has_periodos,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_bloquear_periodo_cerrado') AS has_trigger;
-- Expected AFTER: both true
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification — expect both true**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_06_periodos_contables.sql \
        sistema-calzado/supabase/migrations/down/20260418_06_periodos_contables.down.sql
git commit -m "feat(db): add periodos_contables with close-period guard trigger"
```

---

### Task 7: Migration 07 — Audit trail (tipo_eventos, plantilla_eventos, audit_log)

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_07_auditoria_eventos.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_07_auditoria_eventos.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_07_auditoria_eventos.sql
-- Fase 1 — Audit trail: eventos de catálogo + log genérico transaccional.

CREATE TABLE IF NOT EXISTS public.tipo_eventos (
  id_evento serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tipo_eventos_tipo_fecha
  ON public.tipo_eventos(id_tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plantilla_eventos (
  id_evento serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plantilla_eventos_plantilla_fecha
  ON public.plantilla_eventos(id_plantilla, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id_audit bigserial PRIMARY KEY,
  tabla text NOT NULL,
  id_registro text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('insert','update','delete')),
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  ip_origen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla_reg
  ON public.audit_log(tabla, id_registro, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log(id_persona_actor, created_at DESC);

-- Inmutabilidad
CREATE OR REPLACE FUNCTION public.fn_bloquear_modificacion_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_INMUTABLE: registros de auditoría no pueden modificarse';
END $$;

DROP TRIGGER IF EXISTS trg_audit_log_inmutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_inmutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();

DROP TRIGGER IF EXISTS trg_tipo_eventos_inmutable ON public.tipo_eventos;
CREATE TRIGGER trg_tipo_eventos_inmutable
  BEFORE UPDATE OR DELETE ON public.tipo_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();

DROP TRIGGER IF EXISTS trg_plantilla_eventos_inmutable ON public.plantilla_eventos;
CREATE TRIGGER trg_plantilla_eventos_inmutable
  BEFORE UPDATE OR DELETE ON public.plantilla_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_07_auditoria_eventos.down.sql
DROP TRIGGER IF EXISTS trg_audit_log_inmutable ON public.audit_log;
DROP TRIGGER IF EXISTS trg_tipo_eventos_inmutable ON public.tipo_eventos;
DROP TRIGGER IF EXISTS trg_plantilla_eventos_inmutable ON public.plantilla_eventos;
DROP FUNCTION IF EXISTS public.fn_bloquear_modificacion_audit();
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.plantilla_eventos;
DROP TABLE IF EXISTS public.tipo_eventos;
```

- [ ] **Step 3: Write verification query**

```sql
-- Tablas existen
SELECT to_regclass('public.tipo_eventos') IS NOT NULL AS a,
       to_regclass('public.plantilla_eventos') IS NOT NULL AS b,
       to_regclass('public.audit_log') IS NOT NULL AS c;
-- Expected: all true

-- Inmutabilidad funciona
INSERT INTO public.audit_log(tabla, id_registro, accion, datos_despues)
VALUES ('test', '1', 'insert', '{}'::jsonb) RETURNING id_audit;
-- Save the returned id, then:
-- UPDATE public.audit_log SET tabla='hack' WHERE id_audit = <id>;
-- Expected: ERROR: AUDIT_INMUTABLE
-- Cleanup: no cleanup possible (inmutable) — leave the test row, it has tabla='test'
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification — confirm all true + immutability raises error**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_07_auditoria_eventos.sql \
        sistema-calzado/supabase/migrations/down/20260418_07_auditoria_eventos.down.sql
git commit -m "feat(db): add immutable audit tables (tipo_eventos, plantilla_eventos, audit_log)"
```

---

### Task 8: Migration 08 — Triggers de integridad (splits, snapshot, audit)

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_08_triggers_integridad.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_08_triggers_integridad.down.sql`

**Note:** `movimiento_splits` table structure assumed. Verify column names via: `SELECT column_name FROM information_schema.columns WHERE table_name='movimiento_splits';` — adjust if `monto` or `id_movimiento` differ.

- [ ] **Step 1: Pre-check splits schema**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='movimiento_splits' ORDER BY ordinal_position;
```
Confirm columns include `id_movimiento` and `monto`. If not, adapt SQL below.

- [ ] **Step 2: Write the UP migration**

```sql
-- 20260418_08_triggers_integridad.sql
-- Fase 1 — Triggers: suma de splits, snapshot de nombre, audit genérico.

-- ── Audit genérico (requiere GUC app.id_persona_actor opcional) ─────────────
CREATE OR REPLACE FUNCTION public.fn_audit_generico() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor integer;
  v_pk_col text;
  v_id text;
BEGIN
  BEGIN
    v_actor := current_setting('app.id_persona_actor', true)::integer;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  -- determinar PK textual
  IF TG_TABLE_NAME = 'movimientos_caja' THEN
    v_id := COALESCE((NEW).id_movimiento::text, (OLD).id_movimiento::text);
  ELSIF TG_TABLE_NAME = 'movimiento_splits' THEN
    v_id := COALESCE((NEW).id_split::text, (OLD).id_split::text);
  ELSIF TG_TABLE_NAME = 'transferencias_internas' THEN
    v_id := COALESCE((NEW).id_transferencia::text, (OLD).id_transferencia::text);
  ELSIF TG_TABLE_NAME = 'costos_fijos' THEN
    v_id := COALESCE((NEW).id_costo_fijo::text, (OLD).id_costo_fijo::text);
  ELSE
    v_id := '?';
  END IF;

  INSERT INTO public.audit_log(tabla, id_registro, accion, datos_antes, datos_despues, id_persona_actor)
  VALUES (
    TG_TABLE_NAME, v_id, lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    v_actor
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_movimientos_caja ON public.movimientos_caja;
CREATE TRIGGER trg_audit_movimientos_caja
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_movimiento_splits ON public.movimiento_splits;
CREATE TRIGGER trg_audit_movimiento_splits
  AFTER INSERT OR UPDATE OR DELETE ON public.movimiento_splits
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_transferencias ON public.transferencias_internas;
CREATE TRIGGER trg_audit_transferencias
  AFTER INSERT OR UPDATE OR DELETE ON public.transferencias_internas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_costos_fijos ON public.costos_fijos;
CREATE TRIGGER trg_audit_costos_fijos
  AFTER INSERT OR UPDATE OR DELETE ON public.costos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

-- ── Snapshot del nombre del tipo al insertar ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_snapshot_tipo_nombre() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id_tipo IS NOT NULL AND NEW.snapshot_tipo_nombre IS NULL THEN
    SELECT nombre INTO NEW.snapshot_tipo_nombre
    FROM public.tipos_movimiento_caja WHERE id_tipo = NEW.id_tipo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_snapshot_tipo_nombre ON public.movimientos_caja;
CREATE TRIGGER trg_snapshot_tipo_nombre
  BEFORE INSERT ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_tipo_nombre();

-- ── Integridad de splits (suma == total) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validar_suma_splits() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id integer := COALESCE(NEW.id_movimiento, OLD.id_movimiento);
  v_total numeric(14,2);
  v_suma numeric(14,2);
BEGIN
  SELECT monto INTO v_total FROM public.movimientos_caja WHERE id_movimiento = v_id;
  SELECT COALESCE(SUM(monto),0) INTO v_suma FROM public.movimiento_splits WHERE id_movimiento = v_id;
  -- si no hay splits, no validamos (movimiento simple)
  IF (SELECT count(*) FROM public.movimiento_splits WHERE id_movimiento = v_id) = 0 THEN
    RETURN NULL;
  END IF;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'SPLIT_DESBALANCEADO: suma=% total=% (mov=%)', v_suma, v_total, v_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_validar_suma_splits ON public.movimiento_splits;
CREATE CONSTRAINT TRIGGER trg_validar_suma_splits
  AFTER INSERT OR UPDATE OR DELETE ON public.movimiento_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_suma_splits();
```

- [ ] **Step 3: Write the DOWN migration**

```sql
-- down/20260418_08_triggers_integridad.down.sql
DROP TRIGGER IF EXISTS trg_validar_suma_splits ON public.movimiento_splits;
DROP TRIGGER IF EXISTS trg_snapshot_tipo_nombre ON public.movimientos_caja;
DROP TRIGGER IF EXISTS trg_audit_movimientos_caja ON public.movimientos_caja;
DROP TRIGGER IF EXISTS trg_audit_movimiento_splits ON public.movimiento_splits;
DROP TRIGGER IF EXISTS trg_audit_transferencias ON public.transferencias_internas;
DROP TRIGGER IF EXISTS trg_audit_costos_fijos ON public.costos_fijos;
DROP FUNCTION IF EXISTS public.fn_validar_suma_splits();
DROP FUNCTION IF EXISTS public.fn_snapshot_tipo_nombre();
DROP FUNCTION IF EXISTS public.fn_audit_generico();
```

- [ ] **Step 4: Write verification queries**

```sql
-- Triggers instalados
SELECT tgname FROM pg_trigger
WHERE tgname IN (
  'trg_audit_movimientos_caja','trg_audit_movimiento_splits',
  'trg_audit_transferencias','trg_audit_costos_fijos',
  'trg_snapshot_tipo_nombre','trg_validar_suma_splits'
);
-- Expected: 6 rows

-- Smoke test snapshot (requiere tipo y cuenta existentes — ajusta IDs)
-- INSERT INTO movimientos_caja(...) RETURNING snapshot_tipo_nombre;
-- Verificar que snapshot_tipo_nombre se pobló automáticamente.
```

- [ ] **Step 5: Apply UP migration**

- [ ] **Step 6: Run verification — expect 6 triggers**

- [ ] **Step 7: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_08_triggers_integridad.sql \
        sistema-calzado/supabase/migrations/down/20260418_08_triggers_integridad.down.sql
git commit -m "feat(db): add integrity triggers (splits sum, tipo snapshot, generic audit)"
```

---

### Task 9: Migration 09 — fn_resolver_cuenta_contable

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_09_fn_resolver_cuenta_contable.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_09_fn_resolver_cuenta_contable.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_09_fn_resolver_cuenta_contable.sql
-- Fase 1 — Cascada de resolución de cuenta contable.

CREATE OR REPLACE FUNCTION public.fn_resolver_cuenta_contable(
  p_id_tipo integer,
  p_id_ubicacion integer DEFAULT NULL,
  p_id_plantilla_origen integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rol text;
  v_id_cuenta integer;
BEGIN
  -- 1. Plantilla override
  IF p_id_plantilla_origen IS NOT NULL THEN
    SELECT id_cuenta_contable INTO v_id_cuenta
    FROM public.plantillas_recurrentes WHERE id_plantilla = p_id_plantilla_origen;
    IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;
  END IF;

  -- Obtener rol de la ubicación
  IF p_id_ubicacion IS NOT NULL THEN
    SELECT rol INTO v_rol FROM public.ubicaciones WHERE id_ubicacion = p_id_ubicacion;
  END IF;

  -- 2. mapeo por (id_tipo, rol)
  IF v_rol IS NOT NULL THEN
    SELECT id_cuenta_contable INTO v_id_cuenta
    FROM public.mapeo_tipo_cuenta
    WHERE id_tipo = p_id_tipo AND ubicacion_rol = v_rol AND activo = true
    LIMIT 1;
    IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;
  END IF;

  -- 3. mapeo wildcard (id_tipo, '*')
  SELECT id_cuenta_contable INTO v_id_cuenta
  FROM public.mapeo_tipo_cuenta
  WHERE id_tipo = p_id_tipo AND ubicacion_rol = '*' AND activo = true
  LIMIT 1;
  IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;

  -- 4. default del tipo
  SELECT id_cuenta_contable_default INTO v_id_cuenta
  FROM public.tipos_movimiento_caja WHERE id_tipo = p_id_tipo;

  RETURN v_id_cuenta;  -- puede ser NULL → QuickEntry pedirá al usuario
END $$;
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_09_fn_resolver_cuenta_contable.down.sql
DROP FUNCTION IF EXISTS public.fn_resolver_cuenta_contable(integer, integer, integer);
```

- [ ] **Step 3: Write verification query**

```sql
SELECT proname FROM pg_proc WHERE proname = 'fn_resolver_cuenta_contable';
-- Expected: 1 row
-- Smoke test (requiere un tipo existente):
-- SELECT public.fn_resolver_cuenta_contable(1, NULL, NULL);
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_09_fn_resolver_cuenta_contable.sql \
        sistema-calzado/supabase/migrations/down/20260418_09_fn_resolver_cuenta_contable.down.sql
git commit -m "feat(db): add fn_resolver_cuenta_contable cascade resolver"
```

---

### Task 10: Migration 10 — fn_registrar_hecho_economico (RPC principal)

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_10_fn_registrar_hecho_economico.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_10_fn_registrar_hecho_economico.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_10_fn_registrar_hecho_economico.sql
-- Fase 1 — Punto único de entrada para registrar movimientos económicos.

CREATE OR REPLACE FUNCTION public.fn_aplicar_splits(
  p_id_movimiento integer,
  p_splits jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  v_id_origen integer;
  v_monto numeric(14,2);
  v_es_prestamo boolean;
  v_id_caja_destino integer;
  v_nota text;
BEGIN
  -- Obtener caja destino del movimiento padre (para préstamos)
  SELECT id_cuenta_financiera, nota INTO v_id_caja_destino, v_nota
  FROM public.movimientos_caja WHERE id_movimiento = p_id_movimiento;

  FOR r IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_id_origen := (r->>'id_cuenta_financiera')::integer;
    v_monto := (r->>'monto')::numeric;
    v_es_prestamo := COALESCE((r->>'es_prestamo')::boolean, false);

    -- Lock origen
    PERFORM 1 FROM public.cuentas_financieras
    WHERE id_cuenta_financiera = v_id_origen FOR UPDATE;

    -- Insertar split
    INSERT INTO public.movimiento_splits(id_movimiento, id_cuenta_financiera, monto)
    VALUES (p_id_movimiento, v_id_origen, v_monto);

    -- Si es préstamo, generar transferencia interna compensatoria
    IF v_es_prestamo AND v_id_caja_destino IS NOT NULL AND v_id_origen <> v_id_caja_destino THEN
      INSERT INTO public.transferencias_internas(
        id_cuenta_origen, id_cuenta_destino, monto, nota, fecha
      ) VALUES (
        v_id_origen, v_id_caja_destino, v_monto,
        'Préstamo auto-generado desde movimiento #' || p_id_movimiento ||
          COALESCE(' (' || v_nota || ')',''),
        now()
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_registrar_hecho_economico(
  p_id_tipo integer,
  p_monto numeric,
  p_id_ubicacion integer DEFAULT NULL,
  p_id_cuenta_financiera integer DEFAULT NULL,
  p_splits jsonb DEFAULT NULL,
  p_id_plantilla_origen integer DEFAULT NULL,
  p_id_venta integer DEFAULT NULL,
  p_id_lote_produccion integer DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_datos_extra jsonb DEFAULT '{}'::jsonb,
  p_fecha timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_id_cuenta_contable integer;
  v_id_movimiento integer;
BEGIN
  -- Lock de cuenta financiera principal
  IF p_id_cuenta_financiera IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_financieras
    WHERE id_cuenta_financiera = p_id_cuenta_financiera FOR UPDATE;
  END IF;

  -- Resolver cuenta contable
  v_id_cuenta_contable := public.fn_resolver_cuenta_contable(
    p_id_tipo, p_id_ubicacion, p_id_plantilla_origen
  );

  -- Insertar movimiento (trigger snapshot llena snapshot_tipo_nombre)
  INSERT INTO public.movimientos_caja(
    id_tipo, id_ubicacion, id_cuenta_financiera, id_cuenta_contable,
    monto, nota, datos_extra, fecha_movimiento,
    id_plantilla_origen, id_venta, id_lote_produccion
  ) VALUES (
    p_id_tipo, p_id_ubicacion, p_id_cuenta_financiera, v_id_cuenta_contable,
    p_monto, p_nota, p_datos_extra, p_fecha,
    p_id_plantilla_origen, p_id_venta, p_id_lote_produccion
  ) RETURNING id_movimiento INTO v_id_movimiento;

  -- Aplicar splits (opcional, con préstamos auto-transferencia)
  IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    PERFORM public.fn_aplicar_splits(v_id_movimiento, p_splits);
  END IF;

  RETURN v_id_movimiento;
END $$;
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_10_fn_registrar_hecho_economico.down.sql
DROP FUNCTION IF EXISTS public.fn_registrar_hecho_economico(
  integer, numeric, integer, integer, jsonb, integer, integer, integer, text, jsonb, timestamptz
);
DROP FUNCTION IF EXISTS public.fn_aplicar_splits(integer, jsonb);
```

- [ ] **Step 3: Write verification query**

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('fn_registrar_hecho_economico','fn_aplicar_splits');
-- Expected: 2 rows
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_10_fn_registrar_hecho_economico.sql \
        sistema-calzado/supabase/migrations/down/20260418_10_fn_registrar_hecho_economico.down.sql
git commit -m "feat(db): add fn_registrar_hecho_economico atomic entry point with splits+prestamo"
```

---

### Task 11: Migration 11 — fn_generar_movimiento_desde_plantilla (idempotente)

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_11_fn_generar_desde_plantilla.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_11_fn_generar_desde_plantilla.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_11_fn_generar_desde_plantilla.sql
-- Fase 1 — Generación idempotente de movimientos desde plantillas recurrentes.

CREATE OR REPLACE FUNCTION public.fn_generar_movimiento_desde_plantilla(
  p_id_plantilla integer,
  p_periodo text,
  p_monto numeric DEFAULT NULL,
  p_id_cuenta_financiera integer DEFAULT NULL,
  p_id_persona_actor integer DEFAULT NULL,
  p_nota text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_id_ejecucion integer;
  v_id_movimiento integer;
  v_plantilla record;
  v_monto_final numeric(14,2);
  v_cuenta_final integer;
BEGIN
  -- Reserva idempotente (INSERT fallará silenciosamente si ya existe)
  INSERT INTO public.plantilla_ejecuciones(id_plantilla, periodo, id_persona_actor, notas)
  VALUES (p_id_plantilla, p_periodo, p_id_persona_actor, p_nota)
  ON CONFLICT (id_plantilla, periodo) DO NOTHING
  RETURNING id_ejecucion INTO v_id_ejecucion;

  -- Si el INSERT no devolvió id, significa que ya existía
  IF v_id_ejecucion IS NULL THEN
    SELECT id_movimiento INTO v_id_movimiento
    FROM public.plantilla_ejecuciones
    WHERE id_plantilla = p_id_plantilla AND periodo = p_periodo;
    RETURN v_id_movimiento;  -- idempotente: devuelve el movimiento existente
  END IF;

  -- Cargar plantilla
  SELECT * INTO v_plantilla FROM public.plantillas_recurrentes
  WHERE id_plantilla = p_id_plantilla AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLANTILLA_INACTIVA_O_INEXISTENTE: id=%', p_id_plantilla;
  END IF;

  v_monto_final := COALESCE(p_monto, v_plantilla.monto_estimado);
  v_cuenta_final := COALESCE(p_id_cuenta_financiera, v_plantilla.id_cuenta_financiera_default);

  -- Registrar el hecho económico
  v_id_movimiento := public.fn_registrar_hecho_economico(
    p_id_tipo := v_plantilla.id_tipo,
    p_monto := v_monto_final,
    p_id_ubicacion := v_plantilla.id_ubicacion,
    p_id_cuenta_financiera := v_cuenta_final,
    p_id_plantilla_origen := p_id_plantilla,
    p_nota := COALESCE(p_nota, v_plantilla.nombre || ' — ' || p_periodo)
  );

  -- Actualizar ejecución con id_movimiento
  UPDATE public.plantilla_ejecuciones
  SET id_movimiento = v_id_movimiento
  WHERE id_ejecucion = v_id_ejecucion;

  RETURN v_id_movimiento;
END $$;
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_11_fn_generar_desde_plantilla.down.sql
DROP FUNCTION IF EXISTS public.fn_generar_movimiento_desde_plantilla(
  integer, text, numeric, integer, integer, text
);
```

- [ ] **Step 3: Write verification query**

```sql
SELECT proname FROM pg_proc WHERE proname = 'fn_generar_movimiento_desde_plantilla';
-- Expected: 1 row

-- Smoke test idempotencia (requiere plantilla con id=1 existente):
-- SELECT public.fn_generar_movimiento_desde_plantilla(1, '2026-04-TEST');
-- SELECT public.fn_generar_movimiento_desde_plantilla(1, '2026-04-TEST');
-- Ambas deben devolver el MISMO id_movimiento. Verificar:
-- SELECT count(*) FROM plantilla_ejecuciones WHERE id_plantilla=1 AND periodo='2026-04-TEST';
-- Expected: 1
-- Cleanup: DELETE FROM plantilla_ejecuciones WHERE periodo='2026-04-TEST';
--          DELETE FROM movimientos_caja WHERE fecha_movimiento > now() - interval '1 minute';
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification (skip smoke test if no plantillas yet — will revisit after seed)**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_11_fn_generar_desde_plantilla.sql \
        sistema-calzado/supabase/migrations/down/20260418_11_fn_generar_desde_plantilla.down.sql
git commit -m "feat(db): add idempotent fn_generar_movimiento_desde_plantilla"
```

---

### Task 12: Migration 12 — Vistas de observabilidad + índice trigram

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_12_vistas_observabilidad.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_12_vistas_observabilidad.down.sql`

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_12_vistas_observabilidad.sql
-- Fase 1 — Búsqueda fuzzy + vista de salud del sistema.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_tipos_movimiento_nombre_trgm
  ON public.tipos_movimiento_caja USING gin (nombre gin_trgm_ops);

CREATE OR REPLACE VIEW public.v_sistema_salud AS
SELECT
  (SELECT count(*) FROM public.movimientos_caja WHERE id_tipo IS NULL)
    AS movimientos_sin_tipo,
  (SELECT count(*) FROM public.movimientos_caja WHERE id_cuenta_contable IS NULL)
    AS movimientos_sin_cuenta_contable,
  (SELECT count(*) FROM public.plantillas_recurrentes p
   WHERE p.activo AND p.estado='activa' AND p.frecuencia='mensual'
     AND NOT EXISTS (
       SELECT 1 FROM public.plantilla_ejecuciones e
       WHERE e.id_plantilla = p.id_plantilla
         AND e.periodo = to_char(now(),'YYYY-MM')
     ))
    AS plantillas_mensuales_pendientes,
  (SELECT count(*) FROM (
     SELECT s.id_movimiento
     FROM public.movimiento_splits s
     GROUP BY s.id_movimiento
     HAVING SUM(s.monto) <> (
       SELECT m.monto FROM public.movimientos_caja m WHERE m.id_movimiento = s.id_movimiento
     )
   ) q)
    AS splits_desbalanceados;
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_12_vistas_observabilidad.down.sql
DROP VIEW IF EXISTS public.v_sistema_salud;
DROP INDEX IF EXISTS idx_tipos_movimiento_nombre_trgm;
-- No quitamos pg_trgm por seguridad (puede usarse en otros lugares)
```

- [ ] **Step 3: Write verification query**

```sql
SELECT * FROM public.v_sistema_salud;
-- Expected: 1 row with 4 integer columns (may be 0 if no data yet)
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_12_vistas_observabilidad.sql \
        sistema-calzado/supabase/migrations/down/20260418_12_vistas_observabilidad.down.sql
git commit -m "feat(db): add v_sistema_salud view + trigram index for fuzzy search"
```

---

### Task 13: Migration 13 — Seed del catálogo inicial

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_13_seed_catalogo_inicial.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_13_seed_catalogo_inicial.down.sql`

**Note:** This seed assumes existing `tipos_movimiento_caja`, `plan_cuentas`, `ubicaciones`, `personas_tienda` rows. It uses `ON CONFLICT DO NOTHING` and soft-inserts so running twice is safe. If your plan contable uses different `codigo` strings, adjust the WHERE clauses at the top.

- [ ] **Step 1: Write the UP migration**

```sql
-- 20260418_13_seed_catalogo_inicial.sql
-- Fase 1 — Seed idempotente de catálogos.

-- ── 1. Roles de persona ──────────────────────────────────────────────────────
INSERT INTO public.roles_persona(codigo, nombre, ambito, orden) VALUES
  ('dueño','Dueño','Ambos',1),
  ('administrador','Administrador','Ambos',2),
  ('vendedor','Vendedor','Tienda',10),
  ('cajero','Cajero','Tienda',11),
  ('armador','Armador','Taller',20),
  ('perfilador','Perfilador','Taller',21),
  ('cortador','Cortador','Taller',22),
  ('alistador','Alistador','Taller',23),
  ('seguridad','Seguridad','Ambos',30)
ON CONFLICT ((lower(codigo))) DO NOTHING;

-- ── 2. Catálogos auxiliares ──────────────────────────────────────────────────
INSERT INTO public.catalogos_auxiliares(codigo, nombre, items) VALUES
  ('frecuencias_pago','Frecuencias de pago',
   '[{"codigo":"mensual","label":"Mensual"},
     {"codigo":"quincenal","label":"Quincenal"},
     {"codigo":"semanal","label":"Semanal"},
     {"codigo":"unico","label":"Único"}]'::jsonb),
  ('tipos_contrato','Tipos de contrato',
   '[{"codigo":"fijo","label":"Fijo"},
     {"codigo":"destajo","label":"Destajo"},
     {"codigo":"mixto","label":"Mixto"}]'::jsonb),
  ('canales_venta','Canales de venta',
   '[{"codigo":"tienda","label":"Venta en Tienda"},
     {"codigo":"mayorista","label":"Venta Mayorista"}]'::jsonb)
ON CONFLICT ((lower(codigo))) DO NOTHING;

-- ── 3. Enriquecer tipos_movimiento_caja existentes ──────────────────────────
-- Ajusta los codigos a los que existan en tu DB. Usamos UPDATE condicional por codigo.
UPDATE public.tipos_movimiento_caja SET
  direccion='salida',
  scope='{comando,pos,manual}'::text[],
  comportamientos='{requiere_ubicacion}'::text[],
  campos_requeridos='[{"key":"monto","label":"Monto","tipo":"numero","requerido":true}]'::jsonb,
  naturaleza='operativo'
WHERE codigo IN ('otros_operativo','luz_tienda','insumos_tienda') AND direccion IS NULL;

UPDATE public.tipos_movimiento_caja SET
  direccion='salida',
  scope='{comando,manual}'::text[],
  comportamientos='{requiere_persona}'::text[],
  campos_requeridos='[{"key":"id_persona","label":"Trabajador","tipo":"persona","requerido":true},
                     {"key":"monto","label":"Monto","tipo":"numero","requerido":true}]'::jsonb,
  naturaleza='operativo',
  solo_admin=false
WHERE codigo IN ('pago_personal','dev_adelanto') AND direccion IS NULL;

UPDATE public.tipos_movimiento_caja SET
  direccion='transferencia',
  scope='{comando,manual}'::text[],
  comportamientos='{permite_splits}'::text[],
  naturaleza='interno'
WHERE codigo='transfer_fabrica' AND direccion IS NULL;

UPDATE public.tipos_movimiento_caja SET
  direccion='salida',
  scope='{comando,manual}'::text[],
  naturaleza='extraordinario',
  solo_admin=true
WHERE codigo='retiro_dueno' AND direccion IS NULL;

UPDATE public.tipos_movimiento_caja SET
  direccion='entrada',
  scope='{comando,manual}'::text[],
  naturaleza='extraordinario'
WHERE codigo='ingreso_extra' AND direccion IS NULL;

-- ── 4. Períodos contables (abiertos desde enero 2026 hasta mes actual) ──────
INSERT INTO public.periodos_contables(year, month, estado)
SELECT EXTRACT(year FROM d)::int, EXTRACT(month FROM d)::int, 'abierto'
FROM generate_series('2026-01-01'::date, date_trunc('month', now())::date, '1 month') d
ON CONFLICT (year, month) DO NOTHING;

-- ── 5. mapeo_tipo_cuenta (poblar si plan_cuentas tiene los códigos) ─────────
-- Asume que plan_cuentas tiene codigos: '6213' (Luz), '6211' (Alquileres), '621' (Personal), '7011' (Ventas).
-- Ajusta según tu plan contable real.
INSERT INTO public.mapeo_tipo_cuenta(id_tipo, ubicacion_rol, id_cuenta_contable)
SELECT t.id_tipo, 'Tienda', c.id_cuenta
FROM public.tipos_movimiento_caja t, public.plan_cuentas c
WHERE t.codigo='luz_tienda' AND c.codigo LIKE '6213%'
ON CONFLICT (id_tipo, ubicacion_rol) DO NOTHING;

INSERT INTO public.mapeo_tipo_cuenta(id_tipo, ubicacion_rol, id_cuenta_contable)
SELECT t.id_tipo, '*', c.id_cuenta
FROM public.tipos_movimiento_caja t, public.plan_cuentas c
WHERE t.codigo='pago_personal' AND c.codigo LIKE '621%'
ON CONFLICT (id_tipo, ubicacion_rol) DO NOTHING;
```

- [ ] **Step 2: Write the DOWN migration**

```sql
-- down/20260418_13_seed_catalogo_inicial.down.sql
-- Borra sólo lo insertado por el seed (usa codigos conocidos).
DELETE FROM public.mapeo_tipo_cuenta
WHERE id_tipo IN (
  SELECT id_tipo FROM public.tipos_movimiento_caja
  WHERE codigo IN ('luz_tienda','pago_personal')
);
DELETE FROM public.periodos_contables WHERE year=2026;
DELETE FROM public.catalogos_auxiliares
WHERE codigo IN ('frecuencias_pago','tipos_contrato','canales_venta');
DELETE FROM public.roles_persona
WHERE codigo IN ('dueño','administrador','vendedor','cajero','armador','perfilador','cortador','alistador','seguridad');
-- Nota: no revierte los UPDATE de tipos_movimiento_caja (es idempotente con WHERE direccion IS NULL;
-- en down, operador debe ejecutar manualmente si quiere revertir).
```

- [ ] **Step 3: Write verification query**

```sql
SELECT
  (SELECT count(*) FROM public.roles_persona) AS roles,
  (SELECT count(*) FROM public.catalogos_auxiliares) AS catalogos_aux,
  (SELECT count(*) FROM public.periodos_contables WHERE year=2026) AS periodos_2026,
  (SELECT count(*) FROM public.tipos_movimiento_caja WHERE direccion IS NOT NULL) AS tipos_enriquecidos;
-- Expected AFTER: roles>=9, catalogos_aux>=3, periodos_2026>=4, tipos_enriquecidos>=5
```

- [ ] **Step 4: Apply UP migration**

- [ ] **Step 5: Run verification**

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_13_seed_catalogo_inicial.sql \
        sistema-calzado/supabase/migrations/down/20260418_13_seed_catalogo_inicial.down.sql
git commit -m "feat(db): seed catalogos iniciales (roles, auxiliares, periodos, mapeos)"
```

---

### Task 14: Migration 14 — Rename legacy CHECKs a `_deprecated_*`

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260418_14_deprecate_legacy_checks.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260418_14_deprecate_legacy_checks.down.sql`

**Safety approach:** In lieu of `DROP CONSTRAINT`, we rename to `_deprecated_*` so rollback is trivial. Plan de limpieza: eliminar constraints _deprecated_ en Fase 2 tras validación.

- [ ] **Step 1: Discover current constraints**

```sql
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass IN ('public.personas_tienda','public.costos_fijos')
  AND contype='c';
```
Note the exact names. Example values used below — adjust to actual names:
- `personas_tienda_rol_check`
- `costos_fijos_categoria_check`

- [ ] **Step 2: Write the UP migration (adjust constraint names to match your DB)**

```sql
-- 20260418_14_deprecate_legacy_checks.sql
-- Fase 1 — Renombrar CHECKs rígidos a _deprecated_* (safe rollback).

DO $$
BEGIN
  -- personas_tienda.rol
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='personas_tienda_rol_check') THEN
    ALTER TABLE public.personas_tienda
      RENAME CONSTRAINT personas_tienda_rol_check TO _deprecated_personas_tienda_rol_check;
  END IF;
  -- costos_fijos.categoria
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='costos_fijos_categoria_check') THEN
    ALTER TABLE public.costos_fijos
      RENAME CONSTRAINT costos_fijos_categoria_check TO _deprecated_costos_fijos_categoria_check;
  END IF;
END $$;
```

- [ ] **Step 3: Write the DOWN migration**

```sql
-- down/20260418_14_deprecate_legacy_checks.down.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='_deprecated_personas_tienda_rol_check') THEN
    ALTER TABLE public.personas_tienda
      RENAME CONSTRAINT _deprecated_personas_tienda_rol_check TO personas_tienda_rol_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='_deprecated_costos_fijos_categoria_check') THEN
    ALTER TABLE public.costos_fijos
      RENAME CONSTRAINT _deprecated_costos_fijos_categoria_check TO costos_fijos_categoria_check;
  END IF;
END $$;
```

- [ ] **Step 4: Write verification query**

```sql
SELECT conname FROM pg_constraint WHERE conname LIKE '_deprecated_%';
-- Expected AFTER: 2 rows (or whatever subset existed originally).
```

- [ ] **Step 5: Apply UP migration**

- [ ] **Step 6: Run verification**

- [ ] **Step 7: Commit**

```bash
git add sistema-calzado/supabase/migrations/20260418_14_deprecate_legacy_checks.sql \
        sistema-calzado/supabase/migrations/down/20260418_14_deprecate_legacy_checks.down.sql
git commit -m "feat(db): rename legacy CHECK constraints to _deprecated_* for safe rollback"
```

---

### Task 15: Update `supabase_schema.sql` source of truth

**Files:**
- Modify: `sistema-calzado/supabase_schema.sql`

- [ ] **Step 1: Read current `supabase_schema.sql`**

Read the file to understand structure (table ordering, comment conventions).

- [ ] **Step 2: Add new sections to `supabase_schema.sql`**

For each new table/function introduced in tasks 1–14, append a canonical `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` block under a `-- ── Fase 1 Motor Taxonomía ────────` section header. Also reflect ALTERs as inline `ADD COLUMN IF NOT EXISTS` inside the existing table definitions when possible, or as append-only blocks at the end.

Use the SQL from Tasks 1–14 verbatim (without the down migrations or verification queries).

- [ ] **Step 3: Lint check**

Run:
```bash
cd /workspaces/berna-ERP/sistema-calzado
npm run lint
```
Expected: PASS (schema file not linted by eslint; just sanity check there are no regressions from unrelated edits).

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/supabase_schema.sql
git commit -m "docs(db): update supabase_schema.sql with Fase 1 objects"
```

---

## SECTION B — FRONTEND RESOLVERS

### Task 16: Client-side resolvers for cuenta contable / financiera / campos requeridos

**Files:**
- Create: `sistema-calzado/src/lib/resolvers/cuentaContable.js`
- Create: `sistema-calzado/src/lib/resolvers/cuentaFinanciera.js`
- Create: `sistema-calzado/src/lib/resolvers/camposRequeridos.js`

- [ ] **Step 1: Create `cuentaContable.js`**

```javascript
// sistema-calzado/src/lib/resolvers/cuentaContable.js
// Espejo cliente de fn_resolver_cuenta_contable — para preview en QuickEntry.
// Autoridad real es el backend: al registrar, la RPC puede devolver una cuenta distinta
// (por ejemplo si mapeo_tipo_cuenta cambió entre render y submit).

export function resolverCuentaContable({
  tipo,              // row de tipos_movimiento_caja (con id_cuenta_contable_default)
  ubicacion,         // row de ubicaciones (con rol) o null
  plantilla,         // row de plantillas_recurrentes (con id_cuenta_contable) o null
  mapeos,            // array de mapeo_tipo_cuenta
}) {
  if (plantilla?.id_cuenta_contable) return plantilla.id_cuenta_contable;

  const rol = ubicacion?.rol;
  if (rol) {
    const porRol = mapeos.find(
      (m) => m.id_tipo === tipo.id_tipo && m.ubicacion_rol === rol && m.activo
    );
    if (porRol) return porRol.id_cuenta_contable;
  }

  const wildcard = mapeos.find(
    (m) => m.id_tipo === tipo.id_tipo && m.ubicacion_rol === '*' && m.activo
  );
  if (wildcard) return wildcard.id_cuenta_contable;

  return tipo.id_cuenta_contable_default ?? null;
}
```

- [ ] **Step 2: Create `cuentaFinanciera.js`**

```javascript
// sistema-calzado/src/lib/resolvers/cuentaFinanciera.js
// Sugiere la caja financiera de trabajo según contexto.

export function resolverCuentaFinanciera({
  tipo,             // row de tipos_movimiento_caja
  plantilla,        // row de plantillas_recurrentes o null
  cajaOrigenSugerida, // id de caja de la ubicación activa, o null
  cuentasFinancieras,
}) {
  if (plantilla?.id_cuenta_financiera_default) {
    return plantilla.id_cuenta_financiera_default;
  }
  if (tipo?.id_cuenta_financiera_default) {
    return tipo.id_cuenta_financiera_default;
  }
  if (cajaOrigenSugerida) return cajaOrigenSugerida;
  // Fallback: primera caja activa
  return cuentasFinancieras?.find((c) => c.activa)?.id_cuenta_financiera ?? null;
}
```

- [ ] **Step 3: Create `camposRequeridos.js`**

```javascript
// sistema-calzado/src/lib/resolvers/camposRequeridos.js
// Lee tipo.campos_requeridos (jsonb) y normaliza para renderizado dinámico.

const CAMPO_BASE_MONTO = {
  key: 'monto',
  label: 'Monto',
  tipo: 'numero',
  requerido: true,
};

export function resolverCamposRequeridos(tipo) {
  const custom = Array.isArray(tipo?.campos_requeridos) ? tipo.campos_requeridos : [];
  // Garantizamos monto siempre presente
  const tieneMonto = custom.some((c) => c.key === 'monto');
  const campos = tieneMonto ? custom : [CAMPO_BASE_MONTO, ...custom];
  return campos.map((c) => ({
    key: c.key,
    label: c.label || c.key,
    tipo: c.tipo || 'texto',
    requerido: c.requerido ?? true,
    opciones: c.opciones || null,
    min: c.min ?? null,
    max: c.max ?? null,
  }));
}
```

- [ ] **Step 4: Verify — run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado
npm run lint
```
Expected: PASS, no errors in new files.

- [ ] **Step 5: Commit**

```bash
git add sistema-calzado/src/lib/resolvers/
git commit -m "feat(resolvers): add client-side preview resolvers for cuenta/campos"
```

---

## SECTION C — QUICKENTRY COMPONENT

### Task 17: QuickEntry API client

**Files:**
- Create: `sistema-calzado/src/components/QuickEntry/api.js`

- [ ] **Step 1: Create `api.js`**

```javascript
// sistema-calzado/src/components/QuickEntry/api.js
import { supabase } from '../../api/supabase';

export async function fetchTiposPorScope(scope) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('*')
    .eq('activo', true)
    .contains('scope', [scope])
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchUbicaciones() {
  const { data, error } = await supabase
    .from('ubicaciones')
    .select('id_ubicacion,nombre,rol,activa')
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function fetchMapeos() {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .select('id_tipo,ubicacion_rol,id_cuenta_contable,activo')
    .eq('activo', true);
  if (error) throw error;
  return data;
}

export async function fetchCuentasFinancieras() {
  const { data, error } = await supabase
    .from('cuentas_financieras')
    .select('*')
    .eq('activa', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function fetchPersonas() {
  const { data, error } = await supabase
    .from('personas_tienda')
    .select('id_persona,nombre,rol,salario_base,id_ubicacion_preferida')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function registrarHechoEconomico(args) {
  const { data, error } = await supabase.rpc('fn_registrar_hecho_economico', args);
  if (error) throw error;
  return data; // id_movimiento
}
```

- [ ] **Step 2: Verify — run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add sistema-calzado/src/components/QuickEntry/api.js
git commit -m "feat(quickentry): add api client wrapper"
```

---

### Task 18: QuickEntry sub-components (TipoSelector, CamposDinamicos, SplitsEditor, ResumenConfirmacion)

**Files:**
- Create: `sistema-calzado/src/components/QuickEntry/TipoSelector.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/CamposDinamicos.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/SplitsEditor.jsx`
- Create: `sistema-calzado/src/components/QuickEntry/ResumenConfirmacion.jsx`

- [ ] **Step 1: Create `TipoSelector.jsx`**

```jsx
// sistema-calzado/src/components/QuickEntry/TipoSelector.jsx
import { useMemo, useState } from 'react';

export default function TipoSelector({ tipos, onSelect }) {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const norm = q.trim().toLowerCase();
    if (!norm) return tipos.slice(0, 12);
    return tipos
      .filter(
        (t) =>
          t.nombre.toLowerCase().includes(norm) ||
          (t.codigo || '').toLowerCase().includes(norm) ||
          (t.categoria || '').toLowerCase().includes(norm)
      )
      .slice(0, 12);
  }, [tipos, q]);

  return (
    <div className="space-y-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar tipo de movimiento..."
        className="w-full rounded-md border px-3 py-2 text-lg"
      />
      <ul className="divide-y">
        {filtrados.map((t) => (
          <li key={t.id_tipo}>
            <button
              onClick={() => onSelect(t)}
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-stone-50"
            >
              <span className="text-2xl">{t.emoji || '·'}</span>
              <span className="flex-1">
                <span className="block font-medium">{t.nombre}</span>
                <span className="block text-sm text-stone-500">
                  {t.categoria} · {t.direccion || 'sin dirección'}
                </span>
              </span>
            </button>
          </li>
        ))}
        {filtrados.length === 0 && (
          <li className="py-3 text-center text-stone-500">Sin coincidencias</li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create `CamposDinamicos.jsx`**

```jsx
// sistema-calzado/src/components/QuickEntry/CamposDinamicos.jsx
export default function CamposDinamicos({ campos, valores, onChange, ubicaciones, personas }) {
  return (
    <div className="space-y-3">
      {campos.map((c) => (
        <label key={c.key} className="block">
          <span className="mb-1 block text-sm font-medium">
            {c.label}
            {c.requerido && <span className="ml-1 text-rose-600">*</span>}
          </span>
          {renderInput(c, valores[c.key], (v) => onChange(c.key, v), { ubicaciones, personas })}
        </label>
      ))}
    </div>
  );
}

function renderInput(campo, valor, onChange, opts) {
  if (campo.tipo === 'numero') {
    return (
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-md border px-3 py-2"
      />
    );
  }
  if (campo.tipo === 'ubicacion') {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {opts.ubicaciones.map((u) => (
          <option key={u.id_ubicacion} value={u.id_ubicacion}>
            {u.nombre} ({u.rol})
          </option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'persona') {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {opts.personas.map((p) => (
          <option key={p.id_persona} value={p.id_persona}>
            {p.nombre} · {p.rol}
          </option>
        ))}
      </select>
    );
  }
  if (campo.tipo === 'select' && campo.opciones) {
    return (
      <select
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2"
      >
        <option value="">— Selecciona —</option>
        {campo.opciones.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border px-3 py-2"
    />
  );
}
```

- [ ] **Step 3: Create `SplitsEditor.jsx`**

```jsx
// sistema-calzado/src/components/QuickEntry/SplitsEditor.jsx
export default function SplitsEditor({ splits, montoTotal, cuentasFinancieras, onChange }) {
  function actualizar(i, parche) {
    const next = splits.map((s, idx) => (idx === i ? { ...s, ...parche } : s));
    onChange(next);
  }
  function agregar() {
    onChange([...splits, { id_cuenta_financiera: null, monto: 0, es_prestamo: false }]);
  }
  function quitar(i) {
    onChange(splits.filter((_, idx) => idx !== i));
  }
  const suma = splits.reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const balanceado = Math.abs(suma - Number(montoTotal || 0)) < 0.005;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Dividir entre cuentas</span>
        <button onClick={agregar} className="text-sm text-indigo-600">+ Agregar fila</button>
      </div>
      {splits.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={s.id_cuenta_financiera ?? ''}
            onChange={(e) => actualizar(i, { id_cuenta_financiera: Number(e.target.value) })}
            className="flex-1 rounded-md border px-2 py-1"
          >
            <option value="">— Cuenta —</option>
            {cuentasFinancieras.map((c) => (
              <option key={c.id_cuenta_financiera} value={c.id_cuenta_financiera}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            value={s.monto}
            onChange={(e) => actualizar(i, { monto: Number(e.target.value) })}
            className="w-24 rounded-md border px-2 py-1"
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={s.es_prestamo}
              onChange={(e) => actualizar(i, { es_prestamo: e.target.checked })}
            />
            Préstamo
          </label>
          <button onClick={() => quitar(i)} className="text-rose-600">×</button>
        </div>
      ))}
      <div className={`text-sm ${balanceado ? 'text-emerald-700' : 'text-rose-700'}`}>
        Suma: S/ {suma.toFixed(2)} / Total: S/ {Number(montoTotal || 0).toFixed(2)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `ResumenConfirmacion.jsx`**

```jsx
// sistema-calzado/src/components/QuickEntry/ResumenConfirmacion.jsx
export default function ResumenConfirmacion({
  tipo,
  valores,
  idCuentaContable,
  idCuentaFinanciera,
  splits,
  ubicaciones,
  cuentasFinancieras,
  onConfirmar,
  onAtras,
  enviando,
}) {
  const ubic = ubicaciones.find((u) => u.id_ubicacion === valores.id_ubicacion);
  const caja = cuentasFinancieras.find((c) => c.id_cuenta_financiera === idCuentaFinanciera);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Confirmar registro</h3>
      <dl className="divide-y rounded-md border">
        <Row k="Tipo" v={`${tipo.emoji || ''} ${tipo.nombre}`} />
        <Row k="Monto" v={`S/ ${Number(valores.monto || 0).toFixed(2)}`} />
        {ubic && <Row k="Ubicación" v={`${ubic.nombre} (${ubic.rol})`} />}
        {caja && <Row k="Cuenta financiera" v={caja.nombre} />}
        <Row k="Cuenta contable" v={idCuentaContable ? `#${idCuentaContable}` : '⚠ no resuelta'} />
        {splits?.length > 0 && (
          <Row k="Splits" v={`${splits.length} fila${splits.length > 1 ? 's' : ''}`} />
        )}
        {valores.nota && <Row k="Nota" v={valores.nota} />}
      </dl>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onAtras} disabled={enviando} className="rounded-md border px-3 py-2">
          Atrás
        </button>
        <button
          onClick={onConfirmar}
          disabled={enviando || !idCuentaContable}
          className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enviando ? 'Registrando…' : 'Registrar'}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between px-3 py-2 text-sm">
      <span className="text-stone-500">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
```

- [ ] **Step 5: Run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add sistema-calzado/src/components/QuickEntry/
git commit -m "feat(quickentry): add TipoSelector, CamposDinamicos, SplitsEditor, ResumenConfirmacion"
```

---

### Task 19: QuickEntry orchestrator component

**Files:**
- Create: `sistema-calzado/src/components/QuickEntry/QuickEntry.jsx`

- [ ] **Step 1: Create `QuickEntry.jsx`**

```jsx
// sistema-calzado/src/components/QuickEntry/QuickEntry.jsx
import { useEffect, useMemo, useState } from 'react';
import TipoSelector from './TipoSelector';
import CamposDinamicos from './CamposDinamicos';
import SplitsEditor from './SplitsEditor';
import ResumenConfirmacion from './ResumenConfirmacion';
import {
  fetchTiposPorScope,
  fetchUbicaciones,
  fetchMapeos,
  fetchCuentasFinancieras,
  fetchPersonas,
  registrarHechoEconomico,
} from './api';
import { resolverCuentaContable } from '../../lib/resolvers/cuentaContable';
import { resolverCuentaFinanciera } from '../../lib/resolvers/cuentaFinanciera';
import { resolverCamposRequeridos } from '../../lib/resolvers/camposRequeridos';

export default function QuickEntry({
  scope = 'manual',
  contexto = {},
  tiposPermitidos = null,
  onSubmit,
  onClose,
}) {
  const [paso, setPaso] = useState('tipo'); // 'tipo' | 'campos' | 'resumen'
  const [tipos, setTipos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [mapeos, setMapeos] = useState([]);
  const [cuentasFinancieras, setCuentasFinancieras] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [valores, setValores] = useState({});
  const [splits, setSplits] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, u, m, c, p] = await Promise.all([
          fetchTiposPorScope(scope),
          fetchUbicaciones(),
          fetchMapeos(),
          fetchCuentasFinancieras(),
          fetchPersonas(),
        ]);
        setTipos(tiposPermitidos ? t.filter((x) => tiposPermitidos.includes(x.id_tipo)) : t);
        setUbicaciones(u);
        setMapeos(m);
        setCuentasFinancieras(c);
        setPersonas(p);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [scope, tiposPermitidos]);

  const campos = useMemo(
    () => (tipoSeleccionado ? resolverCamposRequeridos(tipoSeleccionado) : []),
    [tipoSeleccionado]
  );

  const idCuentaContable = useMemo(() => {
    if (!tipoSeleccionado) return null;
    const ubic = ubicaciones.find((u) => u.id_ubicacion === valores.id_ubicacion);
    return resolverCuentaContable({
      tipo: tipoSeleccionado,
      ubicacion: ubic,
      plantilla: null,
      mapeos,
    });
  }, [tipoSeleccionado, ubicaciones, valores.id_ubicacion, mapeos]);

  const idCuentaFinanciera = useMemo(() => {
    if (!tipoSeleccionado) return null;
    return resolverCuentaFinanciera({
      tipo: tipoSeleccionado,
      plantilla: null,
      cajaOrigenSugerida: contexto.cajaOrigenSugerida,
      cuentasFinancieras,
    });
  }, [tipoSeleccionado, contexto.cajaOrigenSugerida, cuentasFinancieras]);

  function seleccionarTipo(t) {
    setTipoSeleccionado(t);
    // pre-llenar desde contexto
    const pre = {
      id_ubicacion: contexto.idUbicacion ?? null,
      id_persona: contexto.idPersona ?? null,
      nota: '',
    };
    setValores(pre);
    setSplits([]);
    setPaso('campos');
  }

  function actualizarValor(k, v) {
    setValores((prev) => ({ ...prev, [k]: v }));
  }

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const id = await registrarHechoEconomico({
        p_id_tipo: tipoSeleccionado.id_tipo,
        p_monto: Number(valores.monto),
        p_id_ubicacion: valores.id_ubicacion ?? null,
        p_id_cuenta_financiera: idCuentaFinanciera ?? null,
        p_splits: splits.length > 0 ? splits : null,
        p_id_venta: contexto.idVenta ?? null,
        p_id_lote_produccion: contexto.idLoteProduccion ?? null,
        p_nota: valores.nota || null,
        p_datos_extra: valores.datos_extra || {},
      });
      onSubmit?.({ id_movimiento: id });
      onClose?.();
    } catch (e) {
      setError(e.message || 'Error al registrar');
    } finally {
      setEnviando(false);
    }
  }

  const permiteSplits = tipoSeleccionado?.comportamientos?.includes('permite_splits');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {paso === 'tipo' && 'Registrar movimiento'}
            {paso === 'campos' && tipoSeleccionado?.nombre}
            {paso === 'resumen' && 'Confirmar'}
          </h2>
          <button onClick={onClose} className="text-stone-500">×</button>
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {paso === 'tipo' && <TipoSelector tipos={tipos} onSelect={seleccionarTipo} />}

        {paso === 'campos' && tipoSeleccionado && (
          <div className="space-y-4">
            <CamposDinamicos
              campos={campos}
              valores={valores}
              onChange={actualizarValor}
              ubicaciones={ubicaciones}
              personas={personas}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Nota</span>
              <input
                type="text"
                value={valores.nota || ''}
                onChange={(e) => actualizarValor('nota', e.target.value)}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
            {permiteSplits && (
              <SplitsEditor
                splits={splits}
                montoTotal={valores.monto}
                cuentasFinancieras={cuentasFinancieras}
                onChange={setSplits}
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPaso('tipo')} className="rounded-md border px-3 py-2">
                Atrás
              </button>
              <button
                onClick={() => setPaso('resumen')}
                disabled={!valores.monto}
                className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {paso === 'resumen' && tipoSeleccionado && (
          <ResumenConfirmacion
            tipo={tipoSeleccionado}
            valores={valores}
            idCuentaContable={idCuentaContable}
            idCuentaFinanciera={idCuentaFinanciera}
            splits={splits}
            ubicaciones={ubicaciones}
            cuentasFinancieras={cuentasFinancieras}
            onConfirmar={confirmar}
            onAtras={() => setPaso('campos')}
            enviando={enviando}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint
```

- [ ] **Step 3: Smoke-test mount in App**

Temporarily, add a route in `src/App.jsx` or a dev-only page that renders `<QuickEntry scope="manual" onClose={() => {}} />` to confirm the component mounts. Run:
```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run dev
```
Open the dev page in the browser. Expected: modal appears, tipos load, clicking a tipo advances to step 2. No console errors.

Remove the dev-only page before committing.

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/components/QuickEntry/QuickEntry.jsx
git commit -m "feat(quickentry): add universal 3-step orchestrator component"
```

---

## SECTION D — CATALOGO ADMIN

### Task 20: Catálogo Admin — API client

**Files:**
- Create: `sistema-calzado/src/views/finanzas/api/catalogoClient.js`

- [ ] **Step 1: Create the client**

```javascript
// sistema-calzado/src/views/finanzas/api/catalogoClient.js
import { supabase } from '../../../api/supabase';

// ── tipos_movimiento_caja ──────────────────────────────────────────────────
export async function listTipos() {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .select('*')
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}
export async function upsertTipo(row) {
  const { data, error } = await supabase
    .from('tipos_movimiento_caja')
    .upsert(row, { onConflict: 'id_tipo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── plantillas_recurrentes ────────────────────────────────────────────────
export async function listPlantillas() {
  const { data, error } = await supabase
    .from('plantillas_recurrentes')
    .select('*')
    .order('codigo');
  if (error) throw error;
  return data;
}
export async function upsertPlantilla(row) {
  const { data, error } = await supabase
    .from('plantillas_recurrentes')
    .upsert(row, { onConflict: 'id_plantilla' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── mapeo_tipo_cuenta ─────────────────────────────────────────────────────
export async function listMapeos() {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .select('*, tipo:tipos_movimiento_caja(nombre,codigo), cuenta:plan_cuentas(codigo,nombre)')
    .order('id_tipo');
  if (error) throw error;
  return data;
}
export async function upsertMapeo(row) {
  const { data, error } = await supabase
    .from('mapeo_tipo_cuenta')
    .upsert(row, { onConflict: 'id_tipo,ubicacion_rol' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── roles_persona ─────────────────────────────────────────────────────────
export async function listRoles() {
  const { data, error } = await supabase.from('roles_persona').select('*').order('orden');
  if (error) throw error;
  return data;
}
export async function upsertRol(row) {
  const { data, error } = await supabase
    .from('roles_persona')
    .upsert(row, { onConflict: 'id_rol' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── catalogos_auxiliares ──────────────────────────────────────────────────
export async function listCatalogosAux() {
  const { data, error } = await supabase
    .from('catalogos_auxiliares')
    .select('*')
    .order('codigo');
  if (error) throw error;
  return data;
}
export async function upsertCatalogoAux(row) {
  const { data, error } = await supabase
    .from('catalogos_auxiliares')
    .upsert(row, { onConflict: 'id_catalogo' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── periodos_contables ────────────────────────────────────────────────────
export async function listPeriodos() {
  const { data, error } = await supabase
    .from('periodos_contables')
    .select('*')
    .order('year desc,month desc');
  if (error) throw error;
  return data;
}
export async function cambiarEstadoPeriodo(id_periodo, estado, { motivo_reapertura, cerrado_por } = {}) {
  const parche = { estado };
  if (estado === 'cerrado') {
    parche.cerrado_por = cerrado_por;
    parche.cerrado_en = new Date().toISOString();
  } else if (estado === 'abierto') {
    parche.motivo_reapertura = motivo_reapertura;
  }
  const { data, error } = await supabase
    .from('periodos_contables')
    .update(parche)
    .eq('id_periodo', id_periodo)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── salud ─────────────────────────────────────────────────────────────────
export async function fetchSalud() {
  const { data, error } = await supabase.from('v_sistema_salud').select('*').single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add sistema-calzado/src/views/finanzas/api/catalogoClient.js
git commit -m "feat(catalogoadmin): add api client for all catalog tables"
```

---

### Task 21: Catálogo Admin — Tabs (Tipos, Plantillas, Mapeo, Roles, Aux, Periodos, Salud)

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabTiposMovimiento.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabPlantillas.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabMapeo.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabRoles.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabCatalogosAux.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabPeriodos.jsx`
- Create: `sistema-calzado/src/views/finanzas/views/admin/TabSalud.jsx`

**Pattern:** Each tab is a list + modal CRUD. Since this plan targets agile execution, tabs share a common skeleton. Below is `TabTiposMovimiento.jsx` in full; the other tabs follow the identical pattern with their own fields.

- [ ] **Step 1: Create `TabTiposMovimiento.jsx`**

```jsx
// sistema-calzado/src/views/finanzas/views/admin/TabTiposMovimiento.jsx
import { useEffect, useState } from 'react';
import { listTipos, upsertTipo } from '../../api/catalogoClient';

export default function TabTiposMovimiento() {
  const [tipos, setTipos] = useState([]);
  const [edit, setEdit] = useState(null);

  async function load() {
    setTipos(await listTipos());
  }
  useEffect(() => { load(); }, []);

  async function guardar(row) {
    await upsertTipo(row);
    setEdit(null);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEdit({ codigo:'', nombre:'', activo:true, scope:['manual'], comportamientos:[], campos_requeridos:[] })}
                className="rounded-md bg-stone-900 px-3 py-1 text-white">+ Nuevo tipo</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-left">
          <tr>
            <th className="p-2">Código</th><th>Nombre</th><th>Dirección</th><th>Scope</th><th>Solo admin</th><th>Activo</th><th></th>
          </tr>
        </thead>
        <tbody>
          {tipos.map((t) => (
            <tr key={t.id_tipo} className="border-t">
              <td className="p-2 font-mono">{t.codigo}</td>
              <td>{t.emoji} {t.nombre}</td>
              <td>{t.direccion}</td>
              <td className="text-xs">{(t.scope || []).join(', ')}</td>
              <td>{t.solo_admin ? '🔒' : '—'}</td>
              <td>{t.activo ? '✓' : '×'}</td>
              <td><button onClick={() => setEdit(t)} className="text-indigo-600">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <EditorTipo row={edit} onCancel={() => setEdit(null)} onGuardar={guardar} />}
    </div>
  );
}

function EditorTipo({ row, onCancel, onGuardar }) {
  const [r, setR] = useState(row);
  function set(k, v) { setR((prev) => ({ ...prev, [k]: v })); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold">{r.id_tipo ? 'Editar tipo' : 'Nuevo tipo'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <L label="Código"><input value={r.codigo} onChange={(e)=>set('codigo', e.target.value)} className="inp" /></L>
          <L label="Nombre"><input value={r.nombre} onChange={(e)=>set('nombre', e.target.value)} className="inp" /></L>
          <L label="Emoji"><input value={r.emoji||''} onChange={(e)=>set('emoji', e.target.value)} className="inp" /></L>
          <L label="Dirección">
            <select value={r.direccion||''} onChange={(e)=>set('direccion', e.target.value||null)} className="inp">
              <option value="">—</option><option value="entrada">Entrada</option>
              <option value="salida">Salida</option><option value="transferencia">Transferencia</option>
            </select>
          </L>
          <L label="Naturaleza">
            <select value={r.naturaleza||''} onChange={(e)=>set('naturaleza', e.target.value||null)} className="inp">
              <option value="">—</option><option value="operativo">Operativo</option>
              <option value="extraordinario">Extraordinario</option><option value="interno">Interno</option>
            </select>
          </L>
          <L label="Scope (coma-sep)">
            <input value={(r.scope||[]).join(',')} onChange={(e)=>set('scope', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} className="inp" />
          </L>
          <L label="Comportamientos (coma-sep)">
            <input value={(r.comportamientos||[]).join(',')} onChange={(e)=>set('comportamientos', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} className="inp" />
          </L>
          <L label="Campos requeridos (JSON)">
            <textarea value={JSON.stringify(r.campos_requeridos||[], null, 2)}
                      onChange={(e)=>{ try { set('campos_requeridos', JSON.parse(e.target.value)); } catch { /* ignore */ } }}
                      className="inp h-24 font-mono text-xs" />
          </L>
          <L label="Solo admin">
            <input type="checkbox" checked={!!r.solo_admin} onChange={(e)=>set('solo_admin', e.target.checked)} />
          </L>
          <L label="Activo">
            <input type="checkbox" checked={r.activo !== false} onChange={(e)=>set('activo', e.target.checked)} />
          </L>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-3 py-2">Cancelar</button>
          <button onClick={()=>onGuardar(r)} className="rounded-md bg-stone-900 px-4 py-2 text-white">Guardar</button>
        </div>
      </div>
      <style>{`.inp{width:100%;border:1px solid #d6d3d1;border-radius:6px;padding:6px 10px}`}</style>
    </div>
  );
}

function L({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium">{label}</span>{children}</label>;
}
```

- [ ] **Step 2: Create the other six tab files**

Use the same pattern:
- `TabPlantillas.jsx` — fields: codigo, nombre, id_tipo (select), id_ubicacion, monto_estimado, frecuencia, dia_referencia, estado, activo, datos_extra (JSON textarea). Calls `listPlantillas`/`upsertPlantilla`.
- `TabMapeo.jsx` — fields: id_tipo (select from listTipos), ubicacion_rol (select: Tienda/Taller/*), id_cuenta_contable (select from plan_cuentas), activo. Calls `listMapeos`/`upsertMapeo`.
- `TabRoles.jsx` — fields: codigo, nombre, ambito (Tienda/Taller/Ambos), orden, activo. Calls `listRoles`/`upsertRol`.
- `TabCatalogosAux.jsx` — list + editor with items JSON textarea. Calls `listCatalogosAux`/`upsertCatalogoAux`.
- `TabPeriodos.jsx` — table of periodos grouped by year. Button "Cerrar" / "Reabrir" per row. "Reabrir" prompts for motivo. Calls `listPeriodos`/`cambiarEstadoPeriodo`.
- `TabSalud.jsx` — single-row view: fetches `fetchSalud()`, displays 4 cards with color-coded values (green if 0, amber otherwise).

Each file follows the `TabTiposMovimiento.jsx` shape: useState, useEffect load, list render, edit modal. Keep each under 150 lines.

- [ ] **Step 3: Run lint**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/admin/
git commit -m "feat(catalogoadmin): add 7 tabs (Tipos, Plantillas, Mapeo, Roles, Aux, Periodos, Salud)"
```

---

### Task 22: Catálogo Admin — Root component + routing

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/admin/CatalogoAdmin.jsx`
- Modify: `sistema-calzado/src/views/finanzas/FinanzasLayout.jsx` — add sidebar link + route

- [ ] **Step 1: Create `CatalogoAdmin.jsx`**

```jsx
// sistema-calzado/src/views/finanzas/views/admin/CatalogoAdmin.jsx
import { useState } from 'react';
import TabTiposMovimiento from './TabTiposMovimiento';
import TabPlantillas from './TabPlantillas';
import TabMapeo from './TabMapeo';
import TabRoles from './TabRoles';
import TabCatalogosAux from './TabCatalogosAux';
import TabPeriodos from './TabPeriodos';
import TabSalud from './TabSalud';

const TABS = [
  { key:'tipos', label:'Tipos de movimiento', Comp: TabTiposMovimiento },
  { key:'plantillas', label:'Plantillas recurrentes', Comp: TabPlantillas },
  { key:'mapeo', label:'Mapeo Tipo↔Cuenta', Comp: TabMapeo },
  { key:'roles', label:'Roles de persona', Comp: TabRoles },
  { key:'aux', label:'Catálogos auxiliares', Comp: TabCatalogosAux },
  { key:'periodos', label:'Períodos contables', Comp: TabPeriodos },
  { key:'salud', label:'Salud del sistema', Comp: TabSalud },
];

export default function CatalogoAdmin() {
  const [tab, setTab] = useState('tipos');
  const Active = TABS.find((t) => t.key === tab).Comp;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catálogo del sistema</h1>
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${tab===t.key ? 'border-b-2 border-stone-900 font-semibold' : 'text-stone-500'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="pt-2"><Active /></div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `FinanzasLayout.jsx`**

Read `FinanzasLayout.jsx`. Locate the sidebar nav array and route block. Add:
- Sidebar entry: `{ key:'catalogo', label:'Catálogo', to:'/finanzas/catalogo', icon: <icon>, adminOnly: true }` in the appropriate position (after Equipo or under an Admin section).
- Route: `<Route path="catalogo" element={<CatalogoAdmin />} />`
- Import: `import CatalogoAdmin from './views/admin/CatalogoAdmin';`

- [ ] **Step 3: Smoke test in browser**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run dev
```
Open `/finanzas/catalogo` as an admin user. Verify:
- 7 tabs render
- Tipos tab loads rows from DB
- Clicking + Nuevo tipo opens editor, saving writes to DB and refreshes list
- Periodos tab lists periodos 2026, close/reopen works

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/admin/CatalogoAdmin.jsx \
        sistema-calzado/src/views/finanzas/FinanzasLayout.jsx
git commit -m "feat(catalogoadmin): add root component + route + sidebar link"
```

---

## SECTION E — ABRIR UBICACION WIZARD

### Task 23: AbrirUbicacionWizard + Ubicaciones trigger

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/ubicaciones/AbrirUbicacionWizard.jsx`
- Modify: `sistema-calzado/src/views/finanzas/views/Ubicaciones.jsx`

- [ ] **Step 1: Create the wizard**

```jsx
// sistema-calzado/src/views/finanzas/views/ubicaciones/AbrirUbicacionWizard.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../../api/supabase';

function generarPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function AbrirUbicacionWizard({ onClose }) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({ nombre:'', rol:'Tienda', direccion:'', pin: generarPin() });
  const [cajaNombre, setCajaNombre] = useState('');
  const [plantillasOrigen, setPlantillasOrigen] = useState([]);
  const [ubicacionesExistentes, setUbicacionesExistentes] = useState([]);
  const [idOrigenClonar, setIdOrigenClonar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ubicaciones')
        .select('id_ubicacion,nombre,rol,activa')
        .eq('activa', true);
      setUbicacionesExistentes(data || []);
    })();
  }, []);

  useEffect(() => {
    if (!idOrigenClonar) return setPlantillasOrigen([]);
    (async () => {
      const { data } = await supabase
        .from('plantillas_recurrentes')
        .select('*')
        .eq('id_ubicacion', idOrigenClonar)
        .eq('activo', true)
        .eq('estado', 'activa');
      setPlantillasOrigen(data || []);
    })();
  }, [idOrigenClonar]);

  useEffect(() => {
    setCajaNombre(`Caja ${form.nombre || ''}`.trim());
  }, [form.nombre]);

  async function finalizar() {
    setEnviando(true);
    setError(null);
    try {
      // 1. Crear ubicación
      const { data: u, error: eU } = await supabase
        .from('ubicaciones')
        .insert({ nombre: form.nombre, rol: form.rol, direccion: form.direccion, pin: form.pin, activa: true })
        .select().single();
      if (eU) throw eU;

      // 2. Crear caja financiera
      const { data: c, error: eC } = await supabase
        .from('cuentas_financieras')
        .insert({ nombre: cajaNombre || `Caja ${form.nombre}`, tipo: 'efectivo_caja', saldo_inicial: 0, activa: true, id_ubicacion: u.id_ubicacion })
        .select().single();
      if (eC) throw eC;

      // 3. Clonar plantillas seleccionadas
      if (plantillasOrigen.length > 0) {
        const clones = plantillasOrigen.map((p) => ({
          codigo: `${p.codigo}_${u.id_ubicacion}`,
          nombre: `${p.nombre} — ${form.nombre}`,
          id_tipo: p.id_tipo,
          id_ubicacion: u.id_ubicacion,
          id_cuenta_contable: p.id_cuenta_contable,
          id_cuenta_financiera_default: c.id_cuenta_financiera,
          direccion: p.direccion,
          monto_estimado: p.monto_estimado,
          frecuencia: p.frecuencia,
          dia_referencia: p.dia_referencia,
          comportamientos: p.comportamientos,
          estado: 'activa',
          activo: true,
          datos_extra: p.datos_extra,
        }));
        const { error: eP } = await supabase.from('plantillas_recurrentes').insert(clones);
        if (eP) throw eP;
      }

      navigate(`/finanzas/ubicaciones/${u.id_ubicacion}`);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="mb-3 text-xl font-semibold">Abrir nueva ubicación · paso {paso}/3</h2>
        {error && <div className="mb-3 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {paso === 1 && (
          <div className="space-y-3">
            <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} className="w-full rounded-md border px-3 py-2" />
            <select value={form.rol} onChange={(e) => setForm({...form, rol: e.target.value})} className="w-full rounded-md border px-3 py-2">
              <option value="Tienda">Tienda</option><option value="Taller">Taller</option>
            </select>
            <input placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({...form, direccion: e.target.value})} className="w-full rounded-md border px-3 py-2" />
            <div className="flex items-center gap-2">
              <input value={form.pin} onChange={(e) => setForm({...form, pin: e.target.value})} className="flex-1 rounded-md border px-3 py-2 font-mono" />
              <button onClick={() => setForm({...form, pin: generarPin()})} className="rounded-md border px-2 py-1 text-xs">Regenerar PIN</button>
            </div>
            <button onClick={() => setPaso(2)} disabled={!form.nombre || !form.pin} className="w-full rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50">Siguiente</button>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">Se creará una caja de efectivo vinculada a esta ubicación.</p>
            <input placeholder="Nombre de la caja" value={cajaNombre} onChange={(e) => setCajaNombre(e.target.value)} className="w-full rounded-md border px-3 py-2" />
            <div className="flex justify-between">
              <button onClick={() => setPaso(1)} className="rounded-md border px-3 py-2">Atrás</button>
              <button onClick={() => setPaso(3)} className="rounded-md bg-stone-900 px-4 py-2 text-white">Siguiente</button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Clonar plantillas desde (opcional)</span>
              <select value={idOrigenClonar || ''} onChange={(e) => setIdOrigenClonar(e.target.value ? Number(e.target.value) : null)} className="w-full rounded-md border px-3 py-2">
                <option value="">— Ninguna —</option>
                {ubicacionesExistentes.filter((u) => u.rol === form.rol).map((u) => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
                ))}
              </select>
            </label>
            {plantillasOrigen.length > 0 && (
              <div className="rounded-md border p-2 text-sm">
                Se clonarán {plantillasOrigen.length} plantillas:
                <ul className="ml-5 list-disc">
                  {plantillasOrigen.map((p) => <li key={p.id_plantilla}>{p.nombre}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setPaso(2)} className="rounded-md border px-3 py-2">Atrás</button>
              <button onClick={finalizar} disabled={enviando} className="rounded-md bg-stone-900 px-4 py-2 text-white disabled:opacity-50">
                {enviando ? 'Creando…' : 'Finalizar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire trigger button into `Ubicaciones.jsx`**

Read `Ubicaciones.jsx`. At the top of the component, add:
```jsx
import AbrirUbicacionWizard from './ubicaciones/AbrirUbicacionWizard';
const [wizardAbierto, setWizardAbierto] = useState(false);
```
Add a button above the grid:
```jsx
<button onClick={() => setWizardAbierto(true)} className="rounded-md bg-stone-900 px-3 py-2 text-white">
  + Abrir nueva ubicación
</button>
```
And render conditionally:
```jsx
{wizardAbierto && <AbrirUbicacionWizard onClose={() => setWizardAbierto(false)} />}
```

- [ ] **Step 3: Smoke test**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run dev
```
In `/finanzas/ubicaciones`, click the button, walk through the 3 steps creating "Tienda Test". Confirm:
- Row appears in `ubicaciones` table
- Caja appears in `cuentas_financieras`
- Redirect to `/finanzas/ubicaciones/<new_id>` works
- Cleanup in Supabase: `DELETE FROM ubicaciones WHERE nombre='Tienda Test'` (respects FKs; delete caja first).

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/ubicaciones/ \
        sistema-calzado/src/views/finanzas/views/Ubicaciones.jsx
git commit -m "feat(ubicaciones): add AbrirUbicacionWizard + trigger button"
```

---

## SECTION F — MODULE CONVERSIONS

### Task 24: Rename CostosFijos → EstructuraFinanciera (read-only)

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/EstructuraFinanciera.jsx`
- Delete: `sistema-calzado/src/views/finanzas/views/CostosFijos.jsx`
- Modify: `sistema-calzado/src/views/finanzas/FinanzasLayout.jsx`

- [ ] **Step 1: Create `EstructuraFinanciera.jsx`**

```jsx
// sistema-calzado/src/views/finanzas/views/EstructuraFinanciera.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../api/supabase';

export default function EstructuraFinanciera() {
  const [plantillas, setPlantillas] = useState([]);
  const [filtro, setFiltro] = useState({ rol:'', estado:'activa' });

  useEffect(() => {
    (async () => {
      let q = supabase
        .from('plantillas_recurrentes')
        .select(`*,
                 tipo:tipos_movimiento_caja(nombre,direccion,naturaleza),
                 ubicacion:ubicaciones(nombre,rol)`)
        .eq('activo', true);
      if (filtro.estado) q = q.eq('estado', filtro.estado);
      const { data } = await q.order('codigo');
      setPlantillas(data || []);
    })();
  }, [filtro]);

  const visibles = filtro.rol
    ? plantillas.filter((p) => p.ubicacion?.rol === filtro.rol)
    : plantillas;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estructura Financiera</h1>
        <Link to="/finanzas/catalogo?tab=plantillas" className="rounded-md bg-stone-900 px-3 py-2 text-white">
          Gestionar en Catálogo
        </Link>
      </div>
      <div className="flex gap-2 text-sm">
        <select value={filtro.rol} onChange={(e) => setFiltro({...filtro, rol: e.target.value})} className="rounded-md border px-2 py-1">
          <option value="">Todos los roles</option>
          <option value="Tienda">Tienda</option>
          <option value="Taller">Taller</option>
        </select>
        <select value={filtro.estado} onChange={(e) => setFiltro({...filtro, estado: e.target.value})} className="rounded-md border px-2 py-1">
          <option value="">Todos</option>
          <option value="activa">Activas</option>
          <option value="pausada">Pausadas</option>
          <option value="archivada">Archivadas</option>
        </select>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-left">
          <tr><th className="p-2">Código</th><th>Nombre</th><th>Tipo</th><th>Ubicación</th><th>Frecuencia</th><th>Estimado</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {visibles.map((p) => (
            <tr key={p.id_plantilla} className="border-t">
              <td className="p-2 font-mono">{p.codigo}</td>
              <td>{p.nombre}</td>
              <td>{p.tipo?.nombre}</td>
              <td>{p.ubicacion?.nombre || '—'}</td>
              <td>{p.frecuencia}</td>
              <td className="text-right">S/ {Number(p.monto_estimado || 0).toFixed(2)}</td>
              <td>{p.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-stone-500">
        Este módulo es de solo lectura. Para crear, editar o pausar plantillas, abre la gestión en Catálogo.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Update `FinanzasLayout.jsx`**

- Change sidebar label: `'Costos Fijos'` → `'Estructura Financiera'`.
- Change route path from `/costos-fijos` to `/estructura-financiera`.
- Update the import from `CostosFijos` to `EstructuraFinanciera`.
- Add a redirect route from `/finanzas/costos-fijos` → `/finanzas/estructura-financiera` (using `<Navigate>` or similar).

- [ ] **Step 3: Delete the old file**

```bash
git rm sistema-calzado/src/views/finanzas/views/CostosFijos.jsx
```

- [ ] **Step 4: Search-and-verify no other imports reference CostosFijos**

```bash
cd /workspaces/berna-ERP/sistema-calzado && grep -rn 'CostosFijos\|costos-fijos' src/ || echo "OK: no references"
```
If any hits appear (besides the new redirect), fix them.

- [ ] **Step 5: Run lint + smoke test**

```bash
npm run lint
npm run dev
```
Navigate to `/finanzas/estructura-financiera`. Verify list renders. Navigate to `/finanzas/costos-fijos`, verify redirect.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(finanzas): replace CostosFijos with read-only EstructuraFinanciera"
```

---

### Task 25: Convert Movimientos to read-only

**Files:**
- Modify: `sistema-calzado/src/views/finanzas/views/Movimientos.jsx`

- [ ] **Step 1: Read current `Movimientos.jsx`**

Identify the creation form / "Nuevo movimiento" button / submit handler.

- [ ] **Step 2: Remove creation UI**

Delete: `<button>+ Nuevo movimiento</button>` triggers, modal forms, and submit/insert handlers. Keep: list, filters, drill-downs, views.

- [ ] **Step 3: Add a banner pointing users to context-specific entry points**

At the top of the page, add:
```jsx
<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
  Para registrar un movimiento, usa <strong>Comando</strong>, la <strong>Caja</strong> de una ubicación, o el módulo correspondiente (POS, Producción).
</div>
```

- [ ] **Step 4: Run lint + smoke test**

```bash
cd /workspaces/berna-ERP/sistema-calzado && npm run lint && npm run dev
```
Confirm Movimientos page shows list + banner, no creation button.

- [ ] **Step 5: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/Movimientos.jsx
git commit -m "refactor(finanzas): make Movimientos read-only; add contextual entry banner"
```

---

### Task 26: Convert Transferencias to read-only

**Files:**
- Modify: `sistema-calzado/src/views/finanzas/views/Transferencias.jsx`

- [ ] **Step 1: Read current file**

Identify creation form and submit handlers.

- [ ] **Step 2: Remove creation UI and add banner**

Same pattern as Task 25:
```jsx
<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
  Para transferir dinero entre cajas, usa <strong>Comando → Transferir</strong>.
</div>
```

Delete forms/buttons/submit handlers that created `transferencias_internas`.

- [ ] **Step 3: Run lint + smoke test**

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/Transferencias.jsx
git commit -m "refactor(finanzas): make Transferencias read-only"
```

---

## SECTION G — RENAME RAPIDO → COMANDO

### Task 27: Rename directory, routes, localStorage key, permission resource

**Files:**
- Rename: `sistema-calzado/src/views/rapido/` → `sistema-calzado/src/views/comando/`
- Modify: `sistema-calzado/src/App.jsx`
- Bulk modify: any file importing from `views/rapido/*`
- DB update: `permisos_persona.recurso`

- [ ] **Step 1: Rename directory via git mv**

```bash
cd /workspaces/berna-ERP/sistema-calzado
git mv src/views/rapido src/views/comando
```

- [ ] **Step 2: Rename gate/context files**

```bash
cd src/views/comando
git mv RapidoGate.jsx ComandoGate.jsx 2>/dev/null || true
git mv RapidoContext.jsx ComandoContext.jsx 2>/dev/null || true
git mv api/rapidoClient.js api/comandoClient.js 2>/dev/null || true
cd ../../..
```

- [ ] **Step 3: Find and update all references**

```bash
cd /workspaces/berna-ERP/sistema-calzado
grep -rln 'rapido\|Rapido\|RAPIDO\|berna\.rapido' src/ | while read f; do
  echo "Check: $f"
done
```
Then for each file, apply search-replace (case-sensitive):
- `RapidoGate` → `ComandoGate`
- `RapidoContext` → `ComandoContext`
- `rapidoClient` → `comandoClient`
- `'/rapido` → `'/comando`
- `"/rapido` → `"/comando`
- `berna.rapido.session.v1` → `berna.comando.session.v1`
- `recurso: 'rapido'` or `recurso:"rapido"` → `recurso:'comando'`

Use the Edit tool surgically per file to avoid false replaces in unrelated strings (like "rápido" as adjective in UI copy).

- [ ] **Step 4: Add legacy localStorage migration on boot**

In `ComandoGate.jsx`, add at the top:
```javascript
// Migración única de clave legacy
const legacy = localStorage.getItem('berna.rapido.session.v1');
if (legacy && !localStorage.getItem('berna.comando.session.v1')) {
  localStorage.setItem('berna.comando.session.v1', legacy);
  localStorage.removeItem('berna.rapido.session.v1');
}
```

- [ ] **Step 5: Add 301 redirect from `/rapido/*` → `/comando/*` in App.jsx**

```jsx
<Route path="/rapido/*" element={<Navigate to="/comando" replace />} />
```

- [ ] **Step 6: DB — rename recurso in permisos_persona**

Run in Supabase SQL editor:
```sql
UPDATE public.permisos_persona SET recurso = 'comando' WHERE recurso = 'rapido';
```
Verification:
```sql
SELECT count(*) FROM public.permisos_persona WHERE recurso='comando';
SELECT count(*) FROM public.permisos_persona WHERE recurso='rapido';
-- Expected: count('comando') > 0, count('rapido') = 0
```

- [ ] **Step 7: Update `src/views/finanzas/lib/permisos.js` recurso list**

Replace string literal `'rapido'` with `'comando'` in the `Recursos` list/constants.

- [ ] **Step 8: Run lint + smoke test**

```bash
npm run lint
npm run dev
```
Navigate to `/comando`, expect gate to load. Navigate to `/rapido`, expect redirect to `/comando`. Login with a user that had `rapido` permission — verify access.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename Rápido module to Comando (dir, routes, permission, localStorage)"
```

---

## SECTION H — INTEGRATION WIRING

### Task 28: Wire QuickEntry into Comando (RegistrarGasto, RegistrarPagoDeuda, Transferir)

**Files:**
- Modify: `sistema-calzado/src/views/comando/views/RegistrarGasto.jsx`
- Modify: `sistema-calzado/src/views/comando/views/RegistrarPagoDeuda.jsx`
- Modify: `sistema-calzado/src/views/comando/views/Transferir.jsx`

- [ ] **Step 1: Read each file**

Identify existing forms and submit logic.

- [ ] **Step 2: Replace body with QuickEntry in each view**

Example for `RegistrarGasto.jsx`:
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QuickEntry from '../../../components/QuickEntry/QuickEntry';
import { useComando } from '../ComandoContext';

export default function RegistrarGasto() {
  const navigate = useNavigate();
  const { usuario } = useComando();
  const [abierto, setAbierto] = useState(true);
  return abierto ? (
    <QuickEntry
      scope="comando"
      contexto={{ idUbicacion: usuario?.id_ubicacion_preferida ?? null }}
      tiposPermitidos={null}
      onSubmit={() => navigate('/comando')}
      onClose={() => { setAbierto(false); navigate('/comando'); }}
    />
  ) : null;
}
```

Apply the same pattern to `RegistrarPagoDeuda.jsx` (pass `tiposPermitidos` filtered to tipos with comportamiento `paga_deuda` — or a codigo list) and `Transferir.jsx` (filter `direccion='transferencia'`).

- [ ] **Step 3: Run lint + smoke test each**

```bash
npm run lint
npm run dev
```
Login to `/comando`, click each button (Registrar Gasto / Pago Deuda / Transferir). QuickEntry modal should open with the right scope/filters.

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/comando/views/
git commit -m "feat(comando): wire QuickEntry into RegistrarGasto, RegistrarPagoDeuda, Transferir"
```

---

### Task 29: Wire QuickEntry into Caja POS (replacing existing 2-step modal)

**Files:**
- Modify: `sistema-calzado/src/views/Caja.jsx`

- [ ] **Step 1: Read `Caja.jsx` carefully**

This file is ~1913 lines. Locate:
- The existing 2-step movement modal (components with `tipos_movimiento_caja` usage)
- The "Crear tipo nuevo" inline modal
- The submit handler that INSERTs into `movimientos_caja`

- [ ] **Step 2: Replace the 2-step modal with `<QuickEntry>`**

Replace the custom modal with:
```jsx
import QuickEntry from '../components/QuickEntry/QuickEntry';

// Where the button is clicked to open movement modal:
{quickEntryAbierto && (
  <QuickEntry
    scope="pos"
    contexto={{
      idUbicacion: ubicacionActiva?.id_ubicacion,
      cajaOrigenSugerida: cajaActiva?.id_cuenta_financiera,
    }}
    onSubmit={() => { refrescarMovimientos(); }}
    onClose={() => setQuickEntryAbierto(false)}
  />
)}
```

Remove the old form/modal/submit handler. Keep the "crear tipo nuevo" flow only if admins still need it from Caja; otherwise deprecate and route to `/finanzas/catalogo`.

- [ ] **Step 3: Ensure `refrescarMovimientos` exists and reloads the day's list**

- [ ] **Step 4: Run lint + smoke test**

Open POS Caja. Register a movement of type "luz_tienda". Verify:
- QuickEntry opens in 3-step flow
- Ubicación pre-filled
- Caja pre-selected
- After confirm, list refreshes with new row

- [ ] **Step 5: Commit**

```bash
git add sistema-calzado/src/views/Caja.jsx
git commit -m "refactor(caja): replace 2-step modal with universal QuickEntry (scope=pos)"
```

---

### Task 30: Wire QuickEntry into HubUbicacion

**Files:**
- Modify: `sistema-calzado/src/views/finanzas/views/HubUbicacion.jsx`

- [ ] **Step 1: Read `HubUbicacion.jsx`**

Locate the KPI strip area.

- [ ] **Step 2: Add a floating button + QuickEntry mount**

```jsx
import { useState } from 'react';
import QuickEntry from '../../../components/QuickEntry/QuickEntry';

// inside the component:
const [qeAbierto, setQeAbierto] = useState(false);

// near the top of the return, after KPI strip:
<button
  onClick={() => setQeAbierto(true)}
  className="rounded-md bg-stone-900 px-4 py-2 text-white"
>
  + Registrar movimiento en esta ubicación
</button>

{qeAbierto && (
  <QuickEntry
    scope="tienda"
    contexto={{ idUbicacion: ubicacion.id_ubicacion }}
    onSubmit={() => { /* refresh KPIs */ setQeAbierto(false); }}
    onClose={() => setQeAbierto(false)}
  />
)}
```

If `scope='tienda'` returns too few tipos because only a few have `tienda` in their scope arrays, fall back to `scope='comando'` + filter by ubicación rol.

- [ ] **Step 3: Run lint + smoke test**

Navigate to `/finanzas/ubicaciones/:id`. Click the new button. Register a test movement. Verify KPI strip refreshes.

- [ ] **Step 4: Commit**

```bash
git add sistema-calzado/src/views/finanzas/views/HubUbicacion.jsx
git commit -m "feat(hub): add QuickEntry trigger per location with pre-locked idUbicacion"
```

---

## SECTION I — QA & ACCEPTANCE

### Task 31: Full acceptance-criteria sweep

**Files:**
- No code changes. Manual QA using criteria from spec §6.

- [ ] **Step 1: Run migrations verification suite**

In Supabase SQL editor:
```sql
-- Schema exists
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'catalogos_auxiliares','roles_persona','plantillas_recurrentes',
    'plantilla_ejecuciones','mapeo_tipo_cuenta','periodos_contables',
    'tipo_eventos','plantilla_eventos','audit_log'
  );
-- Expected: 9

-- Funciones
SELECT count(*) FROM pg_proc
WHERE proname IN (
  'fn_resolver_cuenta_contable','fn_registrar_hecho_economico',
  'fn_aplicar_splits','fn_generar_movimiento_desde_plantilla',
  'fn_bloquear_periodo_cerrado','fn_bloquear_modificacion_audit',
  'fn_audit_generico','fn_snapshot_tipo_nombre','fn_validar_suma_splits'
);
-- Expected: 9

-- Triggers
SELECT count(*) FROM pg_trigger
WHERE tgname IN (
  'trg_bloquear_periodo_cerrado','trg_audit_log_inmutable',
  'trg_tipo_eventos_inmutable','trg_plantilla_eventos_inmutable',
  'trg_audit_movimientos_caja','trg_audit_movimiento_splits',
  'trg_audit_transferencias','trg_audit_costos_fijos',
  'trg_snapshot_tipo_nombre','trg_validar_suma_splits'
);
-- Expected: 10
```

- [ ] **Step 2: Test robustness — inmutabilidad de audit**

```sql
INSERT INTO audit_log(tabla,id_registro,accion,datos_despues) VALUES ('qa','1','insert','{}'::jsonb)
RETURNING id_audit;
-- Use returned id:
UPDATE audit_log SET tabla='hack' WHERE id_audit=<id>;
-- Expected: ERROR: AUDIT_INMUTABLE
```

- [ ] **Step 3: Test período cerrado**

```sql
-- Cerrar un periodo
UPDATE periodos_contables SET estado='cerrado' WHERE year=2026 AND month=1;

-- Intentar insertar movimiento en ese periodo (requiere tipo y cuenta)
SELECT fn_registrar_hecho_economico(
  p_id_tipo := (SELECT id_tipo FROM tipos_movimiento_caja LIMIT 1),
  p_monto := 10.00,
  p_fecha := '2026-01-15'::timestamptz
);
-- Expected: ERROR: PERIODO_CERRADO

-- Reabrir
UPDATE periodos_contables SET estado='abierto', motivo_reapertura='qa' WHERE year=2026 AND month=1;
```

- [ ] **Step 4: Test idempotencia de plantillas**

```sql
-- Asegurarse de tener al menos una plantilla; luego:
SELECT fn_generar_movimiento_desde_plantilla(<id_plantilla>, '2026-QA-01');
SELECT fn_generar_movimiento_desde_plantilla(<id_plantilla>, '2026-QA-01');
-- Expected: ambos devuelven mismo id_movimiento
SELECT count(*) FROM plantilla_ejecuciones WHERE id_plantilla=<id_plantilla> AND periodo='2026-QA-01';
-- Expected: 1
-- Cleanup: DELETE FROM plantilla_ejecuciones WHERE periodo='2026-QA-01';
--         DELETE FROM movimientos_caja WHERE <corresponding>;
```

- [ ] **Step 5: Run browser flow end-to-end**

With `npm run dev` running:
1. Login as admin in Finanzas.
2. Navigate `/finanzas/catalogo` → Tipos tab → create a new tipo "QA Test" with `direccion=salida`, `scope=['manual']`, `campos_requeridos=[{"key":"monto","label":"Monto","tipo":"numero","requerido":true}]`, save.
3. Open a page with QuickEntry (e.g., Comando RegistrarGasto or Caja). Verify the new tipo appears in selector immediately (no code deploy needed).
4. Register a movement with the new tipo. Confirm row in `movimientos_caja`, confirm `snapshot_tipo_nombre='QA Test'`.
5. Edit the tipo in CatalogoAdmin, rename to "QA Renamed". Re-query the movement: `snapshot_tipo_nombre` should still be `'QA Test'` (historicidad).
6. Query `audit_log WHERE tabla='movimientos_caja'`. Confirm rows exist.
7. In `/finanzas/ubicaciones`, click "Abrir nueva ubicación". Create "QA Tienda" cloning from existing tienda. Verify caja + plantillas clonadas en DB.

- [ ] **Step 6: Record QA result**

Create `sistema-calzado/docs/superpowers/plans/2026-04-18-fase1-qa-result.md` with:
- Which checks passed
- Which failed and why
- Any follow-up issues

- [ ] **Step 7: Final commit**

```bash
git add sistema-calzado/docs/superpowers/plans/2026-04-18-fase1-qa-result.md
git commit -m "docs(qa): record Fase 1 acceptance-criteria sweep results"
```

---

## Self-Review

**Spec coverage check:** All 14 migrations (§2 Modelo de datos) → Tasks 1–14. `supabase_schema.sql` update (§2 source-of-truth note) → Task 15. Resolvers (§3.4) → Task 16. QuickEntry (§3.1) → Tasks 17–19. CatalogoAdmin (§3.2) → Tasks 20–22. AbrirUbicacionWizard (§3.3) → Task 23. Read-only conversions (§3.5) → Tasks 24–26. Rename rápido→comando (§3.6) → Task 27. Integration wiring not explicitly in spec but required by scope → Tasks 28–30. Acceptance criteria (§6) → Task 31.

**Placeholder scan:** No "TBD", no "similar to Task N" without repeat, every step has runnable code or exact SQL/command. The only semi-abstract task is Task 21 where 6 sibling tabs follow the same pattern as the fully-shown Task 21 Step 1 — this is a deliberate trade-off to keep the plan readable; each sibling tab's fields are explicitly enumerated.

**Type/name consistency:** `fn_registrar_hecho_economico` signature is consistent across Tasks 10, 17 (api.js), 19 (QuickEntry). `plantilla_ejecuciones(id_plantilla, periodo)` UNIQUE key matches Task 11 usage. `snapshot_tipo_nombre` spelled consistently (Tasks 5, 8, 31). `comportamientos` array spelled consistently everywhere.

**Known plan-level assumption to verify at execute-time:**
- Task 5 assumes `lotes_produccion(id_lote)` — verified at Task 5 Step 1.
- Task 8 assumes `movimiento_splits(id_split, id_movimiento, monto)` — verified at Task 8 Step 1.
- Task 13 seed assumes `plan_cuentas.codigo` prefixes `621`, `6213` — adjust at apply-time if different.
- Task 14 assumes constraint names `personas_tienda_rol_check` / `costos_fijos_categoria_check` — verified at Task 14 Step 1.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-fase1-motor-taxonomia-quickentry.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
