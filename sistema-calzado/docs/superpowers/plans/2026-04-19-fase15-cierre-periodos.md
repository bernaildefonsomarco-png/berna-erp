# Fase 1.5 — Cierre de Períodos Contables + Reporte PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar cierre mensual contable con generación de reporte ejecutivo PDF, almacenado en Supabase Storage con hash SHA-256, flujo automático-propuesto el día 1 del mes, checklist de salud bloqueante, PIN admin y reapertura versionada.

**Architecture:** 6 migraciones SQL nuevas (tabla `cierres_periodo` + 3 RPCs + Storage bucket + vista de integridad) → API client `cierresClient.js` → 7 componentes React (banner global, wizard 3 pasos, PDF con `@react-pdf/renderer`, historial) integrados en `FinanzasLayout`. Todo reutiliza infra de Fase 1 (periodos_contables, audit_log, fn_bloquear_periodo_cerrado, fn_pl_resumen).

**Tech Stack:** React 19, Vite, Supabase (PostgreSQL + Storage), @react-pdf/renderer (lazy loaded), Web Crypto API (SHA-256), bcryptjs (PIN), React Router v6

**Spec:** `docs/superpowers/specs/2026-04-19-fase15-cierre-periodos.md`

---

## File Map

**New files:**
- `supabase/migrations/20260419_01_cierres_periodo_tabla.sql`
- `supabase/migrations/20260419_02_fn_validar_cierre.sql`
- `supabase/migrations/20260419_03_fn_cerrar_periodo.sql`
- `supabase/migrations/20260419_04_fn_reabrir_periodo.sql`
- `supabase/migrations/20260419_05_storage_bucket_cierres.sql`
- `supabase/migrations/20260419_06_v_cierres_integridad.sql`
- `supabase/migrations/down/20260419_01_cierres_periodo_tabla.down.sql`
- `supabase/migrations/down/20260419_02_fn_validar_cierre.down.sql`
- `supabase/migrations/down/20260419_03_fn_cerrar_periodo.down.sql`
- `supabase/migrations/down/20260419_04_fn_reabrir_periodo.down.sql`
- `supabase/migrations/down/20260419_05_storage_bucket_cierres.down.sql`
- `supabase/migrations/down/20260419_06_v_cierres_integridad.down.sql`
- `src/views/finanzas/api/cierresClient.js`
- `src/views/finanzas/views/CierresPeriodo.jsx`
- `src/views/finanzas/views/cierres/CierreWizard.jsx`
- `src/views/finanzas/views/cierres/PasoChecklistSalud.jsx`
- `src/views/finanzas/views/cierres/PasoPreviewReporte.jsx`
- `src/views/finanzas/views/cierres/PasoConfirmarPin.jsx`
- `src/views/finanzas/views/cierres/ReporteCierrePDF.jsx`
- `src/views/finanzas/components/BannerCierrePendiente.jsx`

**Modified files:**
- `src/views/finanzas/lib/permisos.js` — agregar `RECURSOS.CIERRES` + helpers `puedeCerrar`, `puedeReabrir`, `puedeVerCierres`
- `src/views/finanzas/FinanzasLayout.jsx` — agregar imports, NAV_ITEMS entry, rutas, BannerCierrePendiente
- `supabase_schema.sql` — agregar tabla + funciones + vista

---

## Task 1: Migración 01 — Tabla `cierres_periodo`

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_01_cierres_periodo_tabla.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_01_cierres_periodo_tabla.down.sql`

- [ ] **Step 1: Crear la migración principal**

```sql
-- 20260419_01_cierres_periodo_tabla.sql
-- Fase 1.5 — Tabla de cierres de períodos contables con versionado y snapshot.

CREATE TABLE IF NOT EXISTS public.cierres_periodo (
  id_cierre         serial PRIMARY KEY,
  id_periodo        integer NOT NULL REFERENCES public.periodos_contables(id_periodo) ON DELETE RESTRICT,
  version           integer NOT NULL DEFAULT 1,
  id_persona_cerro  integer NOT NULL REFERENCES public.personas_tienda(id_persona),
  cerrado_en        timestamptz NOT NULL DEFAULT now(),
  motivo_reapertura text,
  hash_sha256       text NOT NULL,
  url_storage       text NOT NULL,
  snapshot_kpis     jsonb NOT NULL DEFAULT '{}',
  checklist_salud   jsonb NOT NULL DEFAULT '{}',
  bytes_pdf         integer,
  id_organizacion   uuid,
  UNIQUE (id_periodo, version)
);

CREATE INDEX IF NOT EXISTS idx_cierres_periodo_periodo
  ON public.cierres_periodo(id_periodo, version DESC);

CREATE INDEX IF NOT EXISTS idx_cierres_periodo_org
  ON public.cierres_periodo(id_organizacion, id_periodo)
  WHERE id_organizacion IS NOT NULL;

COMMENT ON TABLE public.cierres_periodo IS
  'Registro de cierres contables mensuales. Cada cierre tiene versión (v1=inicial, v2+=re-cierre tras reapertura), snapshot de KPIs y hash SHA-256 del PDF generado.';
```

- [ ] **Step 2: Crear el par de rollback**

```sql
-- down/20260419_01_cierres_periodo_tabla.down.sql
DROP TABLE IF EXISTS public.cierres_periodo CASCADE;
```

- [ ] **Step 3: Verificar sintaxis (sin aplicar)**

Revisar que no haya errores de sintaxis. No aplicar en Supabase todavía — se aplican todas las migraciones juntas al final del Bloque 1.

- [ ] **Step 4: Commit**

```bash
cd sistema-calzado
git add supabase/migrations/20260419_01_cierres_periodo_tabla.sql supabase/migrations/down/20260419_01_cierres_periodo_tabla.down.sql
git commit -m "feat(db): add cierres_periodo table with versioning and SHA-256 chain"
```

---

## Task 2: Migración 02 — `fn_validar_cierre`

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_02_fn_validar_cierre.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_02_fn_validar_cierre.down.sql`

- [ ] **Step 1: Crear la función**

```sql
-- 20260419_02_fn_validar_cierre.sql
-- Fase 1.5 — Retorna checklist de salud para un período dado.
-- No usa v_sistema_salud (global); hace queries directas con filtro de fecha.

CREATE OR REPLACE FUNCTION public.fn_validar_cierre(
  p_year  integer,
  p_month integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_fecha_inicio  timestamptz;
  v_fecha_fin     timestamptz;
  v_sin_tipo      integer;
  v_sin_cuenta    integer;
  v_splits_malos  integer;
  v_plantillas    integer;
  v_saldos_neg    integer;
  v_warnings      jsonb := '[]'::jsonb;
BEGIN
  v_fecha_inicio := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'America/Lima');
  v_fecha_fin    := v_fecha_inicio + interval '1 month' - interval '1 second';

  -- Movimientos sin tipo en el período
  SELECT count(*) INTO v_sin_tipo
    FROM public.movimientos_caja
   WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
     AND id_tipo IS NULL;

  -- Movimientos sin cuenta contable en el período
  SELECT count(*) INTO v_sin_cuenta
    FROM public.movimientos_caja
   WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
     AND id_cuenta_contable IS NULL;

  -- Splits cuya suma difiere del monto del movimiento padre
  SELECT count(*) INTO v_splits_malos
    FROM (
      SELECT s.id_movimiento
        FROM public.movimiento_splits s
        JOIN public.movimientos_caja m ON m.id_movimiento = s.id_movimiento
       WHERE m.fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
       GROUP BY s.id_movimiento, m.monto
      HAVING abs(SUM(s.monto) - m.monto) > 0.001
    ) sq;

  -- Plantillas mensuales que no se ejecutaron en este período
  SELECT count(*) INTO v_plantillas
    FROM public.plantillas_recurrentes p
   WHERE p.activo
     AND p.frecuencia = 'mensual'
     AND NOT EXISTS (
           SELECT 1 FROM public.plantilla_ejecuciones e
            WHERE e.id_plantilla = p.id_plantilla
              AND e.periodo = to_char(v_fecha_inicio, 'YYYY-MM')
         );

  -- Cuentas financieras con saldo negativo (warning global, no por período)
  SELECT count(*) INTO v_saldos_neg
    FROM public.cuentas_financieras
   WHERE saldo_actual < 0;

  -- Armar lista de warnings
  IF v_plantillas > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(
      v_plantillas::text || ' plantilla(s) mensual(es) no ejecutada(s) en este período'
    );
  END IF;
  IF v_saldos_neg > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(
      v_saldos_neg::text || ' cuenta(s) financiera(s) con saldo negativo'
    );
  END IF;

  RETURN jsonb_build_object(
    'movimientos_sin_tipo',            v_sin_tipo,
    'movimientos_sin_cuenta_contable', v_sin_cuenta,
    'splits_desbalanceados',           v_splits_malos,
    'plantillas_mensuales_pendientes', v_plantillas,
    'cuentas_con_saldo_negativo',      v_saldos_neg,
    'bloqueante',                      (v_sin_tipo > 0 OR v_sin_cuenta > 0 OR v_splits_malos > 0),
    'warnings',                        v_warnings
  );
END $$;
```

- [ ] **Step 2: Crear rollback**

```sql
-- down/20260419_02_fn_validar_cierre.down.sql
DROP FUNCTION IF EXISTS public.fn_validar_cierre(integer, integer);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_02_fn_validar_cierre.sql supabase/migrations/down/20260419_02_fn_validar_cierre.down.sql
git commit -m "feat(db): add fn_validar_cierre — period health checklist with date-scoped queries"
```

---

## Task 3: Migración 03 — `fn_cerrar_periodo`

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_03_fn_cerrar_periodo.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_03_fn_cerrar_periodo.down.sql`

- [ ] **Step 1: Crear la función**

```sql
-- 20260419_03_fn_cerrar_periodo.sql
-- Fase 1.5 — Cierre atómico de período con lock pesimista y verificación de permiso admin.

CREATE OR REPLACE FUNCTION public.fn_cerrar_periodo(
  p_year            integer,
  p_month           integer,
  p_id_persona      integer,
  p_hash_sha256     text,
  p_url_storage     text,
  p_snapshot_kpis   jsonb,
  p_checklist_salud jsonb,
  p_bytes_pdf       integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id_periodo  integer;
  v_estado      text;
  v_version     integer;
  v_id_cierre   integer;
  v_nivel       text;
BEGIN
  -- Verificar que el usuario tiene nivel admin en recurso 'cierres'
  SELECT nivel_acceso INTO v_nivel
    FROM public.permisos_persona
   WHERE id_persona = p_id_persona
     AND recurso = 'cierres'
     AND activo;

  IF v_nivel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'SIN_PERMISO: se requiere nivel admin en recurso cierres';
  END IF;

  -- Obtener id_periodo con lock pesimista (falla rápido si otro admin ya tiene el lock)
  SELECT id_periodo, estado INTO v_id_periodo, v_estado
    FROM public.periodos_contables
   WHERE year = p_year AND month = p_month
   FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIODO_NO_ENCONTRADO: año=% mes=%', p_year, p_month;
  END IF;

  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'PERIODO_YA_CERRADO: el período %/% ya está cerrado', p_year, p_month;
  END IF;

  -- Determinar versión (1 si es el primer cierre, N+1 si es re-cierre tras reapertura)
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.cierres_periodo
   WHERE id_periodo = v_id_periodo;

  -- Insertar registro de cierre
  INSERT INTO public.cierres_periodo(
    id_periodo, version, id_persona_cerro,
    hash_sha256, url_storage, snapshot_kpis, checklist_salud, bytes_pdf
  ) VALUES (
    v_id_periodo, v_version, p_id_persona,
    p_hash_sha256, p_url_storage, p_snapshot_kpis, p_checklist_salud, p_bytes_pdf
  ) RETURNING id_cierre INTO v_id_cierre;

  -- Marcar período como cerrado
  UPDATE public.periodos_contables
     SET estado      = 'cerrado',
         cerrado_por = p_id_persona,
         cerrado_en  = now()
   WHERE id_periodo = v_id_periodo;

  RETURN jsonb_build_object(
    'ok',        true,
    'id_cierre', v_id_cierre,
    'version',   v_version
  );
END $$;
```

- [ ] **Step 2: Crear rollback**

```sql
-- down/20260419_03_fn_cerrar_periodo.down.sql
DROP FUNCTION IF EXISTS public.fn_cerrar_periodo(integer,integer,integer,text,text,jsonb,jsonb,integer);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_03_fn_cerrar_periodo.sql supabase/migrations/down/20260419_03_fn_cerrar_periodo.down.sql
git commit -m "feat(db): add fn_cerrar_periodo — atomic close with pessimistic lock and admin check"
```

---

## Task 4: Migración 04 — `fn_reabrir_periodo`

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_04_fn_reabrir_periodo.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_04_fn_reabrir_periodo.down.sql`

- [ ] **Step 1: Crear la función**

```sql
-- 20260419_04_fn_reabrir_periodo.sql
-- Fase 1.5 — Reapertura de un período cerrado. Requiere motivo y nivel admin.

CREATE OR REPLACE FUNCTION public.fn_reabrir_periodo(
  p_id_periodo integer,
  p_motivo     text,
  p_id_persona integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_estado text;
  v_nivel  text;
BEGIN
  -- Verificar permiso admin
  SELECT nivel_acceso INTO v_nivel
    FROM public.permisos_persona
   WHERE id_persona = p_id_persona
     AND recurso = 'cierres'
     AND activo;

  IF v_nivel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'SIN_PERMISO: se requiere nivel admin en recurso cierres';
  END IF;

  -- Verificar motivo obligatorio
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO: la reapertura requiere un motivo';
  END IF;

  -- Verificar estado actual
  SELECT estado INTO v_estado
    FROM public.periodos_contables
   WHERE id_periodo = p_id_periodo
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIODO_NO_ENCONTRADO: id=%', p_id_periodo;
  END IF;

  IF v_estado = 'abierto' THEN
    RAISE EXCEPTION 'PERIODO_YA_ABIERTO: el período ya está abierto';
  END IF;

  -- Reabrir y registrar motivo
  UPDATE public.periodos_contables
     SET estado            = 'abierto',
         motivo_reapertura = p_motivo,
         cerrado_por       = NULL,
         cerrado_en        = NULL
   WHERE id_periodo = p_id_periodo;

  -- El trigger trg_audit_generico (Fase 1) registra el UPDATE en audit_log automáticamente
END $$;
```

- [ ] **Step 2: Crear rollback**

```sql
-- down/20260419_04_fn_reabrir_periodo.down.sql
DROP FUNCTION IF EXISTS public.fn_reabrir_periodo(integer, text, integer);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_04_fn_reabrir_periodo.sql supabase/migrations/down/20260419_04_fn_reabrir_periodo.down.sql
git commit -m "feat(db): add fn_reabrir_periodo — reopen with mandatory motive and admin check"
```

---

## Task 5: Migración 05 — Storage bucket + RLS policies

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_05_storage_bucket_cierres.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_05_storage_bucket_cierres.down.sql`

- [ ] **Step 1: Crear migración de Storage**

```sql
-- 20260419_05_storage_bucket_cierres.sql
-- Fase 1.5 — Bucket privado para PDFs de cierres + RLS policies.

-- Crear bucket privado (idempotente via INSERT ... ON CONFLICT DO NOTHING)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cierres-mensuales',
  'cierres-mensuales',
  false,          -- privado: sin URL pública directa
  20971520,       -- 20MB max por PDF
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Policy SELECT: cualquier usuario autenticado puede ver (descarga vía presigned URL en JS)
DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
CREATE POLICY "cierres_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Policy INSERT: usuario autenticado puede subir (validación de admin ocurre en fn_cerrar_periodo)
DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
CREATE POLICY "cierres_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Policy DELETE: para cleanup si fn_cerrar_periodo falla después de subir el PDF
DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
CREATE POLICY "cierres_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);
```

- [ ] **Step 2: Crear rollback**

```sql
-- down/20260419_05_storage_bucket_cierres.down.sql
DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
-- Nota: no eliminamos el bucket para no perder PDFs existentes.
-- Si se necesita borrar: DELETE FROM storage.buckets WHERE id = 'cierres-mensuales';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_05_storage_bucket_cierres.sql supabase/migrations/down/20260419_05_storage_bucket_cierres.down.sql
git commit -m "feat(db): add private Storage bucket cierres-mensuales with RLS policies"
```

---

## Task 6: Migración 06 — Vista `v_cierres_integridad` + seed permisos

**Files:**
- Create: `sistema-calzado/supabase/migrations/20260419_06_v_cierres_integridad.sql`
- Create: `sistema-calzado/supabase/migrations/down/20260419_06_v_cierres_integridad.down.sql`

- [ ] **Step 1: Crear vista + seed de permisos**

```sql
-- 20260419_06_v_cierres_integridad.sql
-- Fase 1.5 — Vista de integridad de cadena de hashes + seed de permisos.

-- Vista: detecta si alguien manipuló un PDF (cadena de hashes rota)
CREATE OR REPLACE VIEW public.v_cierres_integridad AS
SELECT
  c.id_cierre,
  c.id_periodo,
  p.year,
  p.month,
  c.version,
  c.id_persona_cerro,
  c.cerrado_en,
  c.hash_sha256,
  c.url_storage,
  c.bytes_pdf,
  c.motivo_reapertura,
  prev.hash_sha256 AS hash_version_anterior,
  CASE
    WHEN c.version > 1 AND prev.hash_sha256 IS NULL THEN 'CADENA_ROTA'
    ELSE 'OK'
  END AS estado_integridad
FROM public.cierres_periodo c
JOIN public.periodos_contables p ON p.id_periodo = c.id_periodo
LEFT JOIN public.cierres_periodo prev
  ON prev.id_periodo = c.id_periodo AND prev.version = c.version - 1;

-- Seed de permisos: dar acceso 'admin' a quienes tienen finanzas:admin
-- y acceso 'ver' a quienes tienen finanzas:ver o superior.
-- ON CONFLICT DO NOTHING garantiza idempotencia.

INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'admin', true
FROM public.permisos_persona
WHERE recurso = 'finanzas' AND nivel_acceso = 'admin'
ON CONFLICT (id_persona, recurso) DO NOTHING;

INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'ver', true
FROM public.permisos_persona
WHERE recurso = 'finanzas'
  AND nivel_acceso IN ('ver', 'registrar', 'editar')
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos_persona x
    WHERE x.id_persona = permisos_persona.id_persona AND x.recurso = 'cierres'
  )
ON CONFLICT (id_persona, recurso) DO NOTHING;
```

- [ ] **Step 2: Crear rollback**

```sql
-- down/20260419_06_v_cierres_integridad.down.sql
DROP VIEW IF EXISTS public.v_cierres_integridad;
DELETE FROM public.permisos_persona WHERE recurso = 'cierres';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_06_v_cierres_integridad.sql supabase/migrations/down/20260419_06_v_cierres_integridad.down.sql
git commit -m "feat(db): add v_cierres_integridad hash-chain view + seed cierres permissions"
```

---

## Task 7: Instalar dependencia `@react-pdf/renderer`

**Files:**
- Modify: `sistema-calzado/package.json` (vía npm install)

- [ ] **Step 1: Instalar la dependencia**

```bash
cd sistema-calzado
npm install @react-pdf/renderer
```

Expected: la dependencia aparece en `package.json` y `package-lock.json`. El bundle principal no se ve afectado porque se importará de forma lazy.

- [ ] **Step 2: Verificar que el build sigue funcionando**

```bash
npm run build 2>&1 | tail -20
```

Expected: build exitoso sin errores.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @react-pdf/renderer for PDF generation in cierres module"
```

---

## Task 8: Permisos — extender `lib/permisos.js`

**Files:**
- Modify: `sistema-calzado/src/views/finanzas/lib/permisos.js`

- [ ] **Step 1: Agregar `RECURSOS.CIERRES` y helpers**

Abrir `src/views/finanzas/lib/permisos.js`. El archivo termina en:

```js
export const RECURSOS = {
  FINANZAS:       'finanzas',
  CUENTAS:        'cuentas',
  DEUDAS:         'deudas',
  COSTOS_FIJOS:   'costos_fijos',
  MOVIMIENTOS:    'movimientos',
  TRANSFERENCIAS: 'transferencias',
  CONFIGURACION:  'configuracion',
  COMANDO:        'comando',
};
```

Reemplazar con:

```js
export const RECURSOS = {
  FINANZAS:       'finanzas',
  CUENTAS:        'cuentas',
  DEUDAS:         'deudas',
  COSTOS_FIJOS:   'costos_fijos',
  MOVIMIENTOS:    'movimientos',
  TRANSFERENCIAS: 'transferencias',
  CONFIGURACION:  'configuracion',
  COMANDO:        'comando',
  CIERRES:        'cierres',
};

export function puedeVerCierres(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'ver');
}

export function puedeCerrar(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'admin');
}

export function puedeReabrir(usuario) {
  return tienePermiso(usuario, RECURSOS.CIERRES, 'admin');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/lib/permisos.js
git commit -m "feat(permisos): add RECURSOS.CIERRES + puedeCerrar/puedeReabrir/puedeVerCierres helpers"
```

---

## Task 9: API Client `cierresClient.js`

**Files:**
- Create: `sistema-calzado/src/views/finanzas/api/cierresClient.js`

- [ ] **Step 1: Crear el client completo**

```js
// src/views/finanzas/api/cierresClient.js
import { supabase } from '../../../api/supabase';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Calcula SHA-256 de un ArrayBuffer. Retorna hex string. */
async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Ruta dentro del bucket: 2026/04/v1.pdf */
function buildStoragePath(year, month, version) {
  return `${year}/${String(month).padStart(2, '0')}/v${version}.pdf`;
}

/* ── Queries ─────────────────────────────────────────────────────────────── */

/**
 * Obtiene todos los períodos (abiertos y cerrados) desde enero 2026,
 * con el último cierre asociado si existe.
 */
export async function obtenerPeriodos() {
  const { data, error } = await supabase
    .from('periodos_contables')
    .select(`
      id_periodo, year, month, estado, cerrado_por, cerrado_en, motivo_reapertura,
      persona_cerro:cerrado_por ( nombre ),
      cierres:cierres_periodo ( id_cierre, version, cerrado_en, hash_sha256, url_storage, bytes_pdf )
    `)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene períodos del pasado que están abiertos (para el banner).
 * Excluye el mes actual.
 */
export async function obtenerPeriodosPendientes() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const { data, error } = await supabase
    .from('periodos_contables')
    .select('id_periodo, year, month')
    .eq('estado', 'abierto')
    .or(`year.lt.${anioActual},and(year.eq.${anioActual},month.lt.${mesActual})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Valida si un período puede cerrarse. Retorna el checklist de salud.
 * El campo `bloqueante` indica si hay errores críticos que impiden el cierre.
 */
export async function validarCierre(year, month) {
  const { data, error } = await supabase.rpc('fn_validar_cierre', {
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return data;
}

/**
 * Cierra un período:
 * 1. Genera SHA-256 del PDF (incorporando hash anterior si es v2+).
 * 2. Sube PDF a Storage.
 * 3. Llama fn_cerrar_periodo (atómica).
 * 4. Si fn_cerrar_periodo falla, elimina el archivo de Storage (cleanup).
 *
 * @param {{ year, month, idPersona, pdfBlob, snapshotKpis, checklistSalud }} params
 * @returns {{ ok, id_cierre, version }}
 */
export async function cerrarPeriodo({ year, month, idPersona, pdfBlob, snapshotKpis, checklistSalud }) {
  // Determinar versión previa para hash chain
  const { data: existentes } = await supabase
    .from('cierres_periodo')
    .select('version, hash_sha256')
    .eq('id_periodo', (await supabase
      .from('periodos_contables')
      .select('id_periodo')
      .eq('year', year)
      .eq('month', month)
      .single()
      .then(r => { if (r.error) throw r.error; return r.data.id_periodo; })))
    .order('version', { ascending: false })
    .limit(1);

  const version = ((existentes?.[0]?.version) || 0) + 1;
  const hashAnterior = existentes?.[0]?.hash_sha256 || null;

  // Calcular SHA-256 (incorpora hash anterior para cadena de integridad)
  const arrayBuffer = await pdfBlob.arrayBuffer();
  let hashInput = arrayBuffer;
  if (hashAnterior) {
    // Concatenar: bytes del PDF + "|" + hash anterior (en bytes)
    const sep = new TextEncoder().encode('|' + hashAnterior);
    const combined = new Uint8Array(arrayBuffer.byteLength + sep.byteLength);
    combined.set(new Uint8Array(arrayBuffer), 0);
    combined.set(sep, arrayBuffer.byteLength);
    hashInput = combined.buffer;
  }
  const hash = await sha256(hashInput);
  const storagePath = buildStoragePath(year, month, version);

  // Subir PDF al bucket
  const { error: uploadError } = await supabase.storage
    .from('cierres-mensuales')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadError) throw new Error('Error subiendo PDF: ' + uploadError.message);

  // Llamar RPC atómica — si falla, hacer cleanup del archivo
  const { data, error } = await supabase.rpc('fn_cerrar_periodo', {
    p_year:            year,
    p_month:           month,
    p_id_persona:      idPersona,
    p_hash_sha256:     hash,
    p_url_storage:     storagePath,
    p_snapshot_kpis:   snapshotKpis,
    p_checklist_salud: checklistSalud,
    p_bytes_pdf:       pdfBlob.size,
  });

  if (error) {
    // Cleanup: eliminar el PDF subido ya que el registro en BD falló
    await supabase.storage.from('cierres-mensuales').remove([storagePath]);
    throw error;
  }

  return data;
}

/**
 * Reabre un período cerrado. Requiere motivo obligatorio y PIN admin.
 * La validación del PIN la hace el llamador antes de invocar esta función.
 */
export async function reabrirPeriodo({ idPeriodo, motivo, idPersona }) {
  const { error } = await supabase.rpc('fn_reabrir_periodo', {
    p_id_periodo: idPeriodo,
    p_motivo:     motivo,
    p_id_persona: idPersona,
  });
  if (error) throw error;
}

/**
 * Genera una URL firmada (presigned) para descargar el PDF de un cierre.
 * La URL expira en 1 hora.
 */
export async function descargarPdfCierre(urlStorage) {
  const { data, error } = await supabase.storage
    .from('cierres-mensuales')
    .createSignedUrl(urlStorage, 3600);
  if (error) throw error;
  return data.signedUrl;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/api/cierresClient.js
git commit -m "feat(api): add cierresClient.js — 6 functions with SHA-256 hash chain and Storage cleanup"
```

---

## Task 10: `ReporteCierrePDF` — componente PDF 5 páginas

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/cierres/ReporteCierrePDF.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// src/views/finanzas/views/cierres/ReporteCierrePDF.jsx
// Reporte ejecutivo de cierre mensual — 5 páginas.
// Generado con @react-pdf/renderer (declarativo JSX, no usa CSS externo).
import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';

/* ── Estilos ─────────────────────────────────────────────────────────────── */
const C = {
  bg:      '#fafaf9',
  text:    '#1c1917',
  muted:   '#57534e',
  light:   '#a8a29e',
  border:  '#e7e5e4',
  primary: '#1c1917',
  green:   '#16a34a',
  red:     '#dc2626',
  amber:   '#d97706',
};

const s = StyleSheet.create({
  page:        { backgroundColor: C.bg, padding: 40, fontFamily: 'Helvetica', color: C.text },
  section:     { marginBottom: 16 },
  h1:          { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  h2:          { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.text },
  h3:          { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  label:       { fontSize: 8, color: C.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  value:       { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  body:        { fontSize: 9, color: C.text, lineHeight: 1.4 },
  muted:       { fontSize: 8, color: C.muted },
  row:         { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 5 },
  rowHeader:   { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.text, paddingBottom: 4, marginBottom: 2 },
  col1:        { flex: 3, fontSize: 9 },
  col2:        { flex: 1, fontSize: 9, textAlign: 'right' },
  col3:        { flex: 1, fontSize: 9, textAlign: 'right', color: C.muted },
  kpiGrid:     { flexDirection: 'row', gap: 12, marginBottom: 20 },
  kpiBox:      { flex: 1, backgroundColor: '#f5f5f4', borderRadius: 4, padding: 10 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: C.border, marginVertical: 12 },
  footer:      { position: 'absolute', bottom: 20, left: 40, right: 40 },
  footerText:  { fontSize: 7, color: C.light, textAlign: 'center' },
  badge:       { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, fontSize: 8 },
  badgeOk:     { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeWarn:   { backgroundColor: '#fef9c3', color: '#854d0e' },
  badgeErr:    { backgroundColor: '#fee2e2', color: '#991b1b' },
  checkRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesNombre = (m) => MESES[m - 1] || '';

function Footer({ hash, page }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        BERNA CALZADO — DOCUMENTO CONFIDENCIAL · Pág. {page} · SHA-256: {hash?.slice(0,16)}...
      </Text>
    </View>
  );
}

function KpiBox({ label, value, sub }) {
  return (
    <View style={s.kpiBox}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
      {sub && <Text style={s.muted}>{sub}</Text>}
    </View>
  );
}

/* ── Páginas ─────────────────────────────────────────────────────────────── */

function PaginaPortada({ year, month, version, kpis, generadoEn, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.section}>
        <Text style={[s.h1, { fontSize: 28, marginBottom: 2 }]}>BERNA CALZADO</Text>
        <Text style={[s.muted, { fontSize: 10 }]}>Reporte de Cierre Mensual</Text>
      </View>

      <View style={s.divider} />

      <View style={[s.section, { marginBottom: 24 }]}>
        <Text style={[s.label, { fontSize: 10 }]}>{mesNombre(month).toUpperCase()} {year}</Text>
        <Text style={[s.h2, { fontSize: 20, marginBottom: 2 }]}>Versión v{version}</Text>
        <Text style={s.muted}>Generado: {new Date(generadoEn).toLocaleString('es-PE')}</Text>
      </View>

      <View style={s.kpiGrid}>
        <KpiBox label="Ingresos" value={fmt(kpis.ingresos)} />
        <KpiBox label="Egresos" value={fmt(kpis.egresos)} />
      </View>
      <View style={s.kpiGrid}>
        <KpiBox
          label="Utilidad Neta"
          value={fmt(kpis.utilidad_neta)}
          sub={`Margen: ${pct(kpis.margen_pct)}`}
        />
        <KpiBox
          label="Movimientos"
          value={String(kpis.n_movimientos || 0)}
          sub={`${kpis.n_ventas || 0} ventas`}
        />
      </View>

      <Footer hash={hash} page={1} />
    </Page>
  );
}

function PaginaPL({ plData, kpis, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Estado de Resultados</Text>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Concepto</Text>
        <Text style={s.col2}>S/</Text>
        <Text style={s.col3}>% Ing.</Text>
      </View>
      {(plData || []).map((row, i) => (
        <View key={i} style={[s.row, row.es_seccion ? { backgroundColor: '#f5f5f4' } : {}]}>
          <Text style={[s.col1, row.es_seccion ? { fontFamily: 'Helvetica-Bold' } : { paddingLeft: 10 }]}>
            {row.nombre}
          </Text>
          <Text style={s.col2}>{fmt(row.total)}</Text>
          <Text style={s.col3}>{kpis.ingresos > 0 ? pct((row.total / kpis.ingresos) * 100) : '-'}</Text>
        </View>
      ))}
      <View style={[s.divider, { marginTop: 8 }]} />
      <View style={s.row}>
        <Text style={[s.col1, { fontFamily: 'Helvetica-Bold' }]}>UTILIDAD NETA</Text>
        <Text style={[s.col2, { fontFamily: 'Helvetica-Bold' }]}>{fmt(kpis.utilidad_neta)}</Text>
        <Text style={[s.col3, { fontFamily: 'Helvetica-Bold' }]}>{pct(kpis.margen_pct)}</Text>
      </View>
      <Footer hash={hash} page={2} />
    </Page>
  );
}

function PaginaFlujo({ flujoData, kpis, hash }) {
  const burnRate = kpis.egresos ? (kpis.egresos / 30).toFixed(2) : 0;
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Flujo de Caja</Text>
      <View style={s.kpiGrid}>
        <KpiBox label="Total Ingresado" value={fmt(kpis.ingresos)} />
        <KpiBox label="Total Egresado" value={fmt(kpis.egresos)} />
        <KpiBox label="Burn Rate Diario" value={fmt(burnRate)} />
      </View>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Fecha</Text>
        <Text style={s.col2}>Ingresos</Text>
        <Text style={s.col2}>Egresos</Text>
        <Text style={s.col3}>Neto</Text>
      </View>
      {(flujoData || []).slice(0, 35).map((row, i) => (
        <View key={i} style={s.row}>
          <Text style={s.col1}>{row.fecha}</Text>
          <Text style={s.col2}>{fmt(row.total_ingresos)}</Text>
          <Text style={s.col2}>{fmt(row.total_egresos)}</Text>
          <Text style={[s.col3, { color: row.neto >= 0 ? C.green : C.red }]}>
            {fmt(row.neto || (row.total_ingresos - row.total_egresos))}
          </Text>
        </View>
      ))}
      <Footer hash={hash} page={3} />
    </Page>
  );
}

function PaginaPatrimonio({ patrimonioData, kpis, hash }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Snapshot de Patrimonio</Text>
      <View style={s.kpiGrid}>
        <KpiBox label="Saldo Total Cuentas" value={fmt(kpis.saldo_total_cuentas)} />
        <KpiBox label="Deuda Pendiente" value={fmt(kpis.deuda_pendiente_total)} />
        <KpiBox label="Patrimonio Neto" value={fmt(kpis.patrimonio_neto)} />
      </View>
      <Text style={[s.h3, { marginTop: 8 }]}>Cuentas Financieras</Text>
      <View style={s.rowHeader}>
        <Text style={s.col1}>Cuenta</Text>
        <Text style={s.col2}>Saldo</Text>
      </View>
      {(patrimonioData?.cuentas || []).map((c, i) => (
        <View key={i} style={s.row}>
          <Text style={s.col1}>{c.nombre}</Text>
          <Text style={[s.col2, { color: c.saldo >= 0 ? C.text : C.red }]}>{fmt(c.saldo)}</Text>
        </View>
      ))}
      {(patrimonioData?.deudas || []).length > 0 && (
        <>
          <Text style={[s.h3, { marginTop: 12 }]}>Deudas Activas</Text>
          <View style={s.rowHeader}>
            <Text style={s.col1}>Deuda</Text>
            <Text style={s.col2}>Saldo</Text>
            <Text style={s.col3}>TCEA</Text>
          </View>
          {patrimonioData.deudas.map((d, i) => (
            <View key={i} style={s.row}>
              <Text style={s.col1}>{d.nombre}</Text>
              <Text style={s.col2}>{fmt(d.saldo_pendiente)}</Text>
              <Text style={s.col3}>{pct(d.tcea)}</Text>
            </View>
          ))}
        </>
      )}
      <Footer hash={hash} page={4} />
    </Page>
  );
}

function PaginaChecklist({ checklist, cerradoPor, cerradoEn, hash, historialReaperturas }) {
  const items = [
    { label: 'Movimientos sin tipo',            valor: checklist.movimientos_sin_tipo,            bloqueante: true },
    { label: 'Movimientos sin cuenta contable', valor: checklist.movimientos_sin_cuenta_contable, bloqueante: true },
    { label: 'Splits desbalanceados',           valor: checklist.splits_desbalanceados,           bloqueante: true },
    { label: 'Plantillas mensuales pendientes', valor: checklist.plantillas_mensuales_pendientes, bloqueante: false },
    { label: 'Cuentas con saldo negativo',      valor: checklist.cuentas_con_saldo_negativo,      bloqueante: false },
  ];

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Checklist de Cierre y Auditoría</Text>
      {items.map((item, i) => (
        <View key={i} style={s.checkRow}>
          <Text style={[
            s.badge,
            item.valor === 0 ? s.badgeOk : item.bloqueante ? s.badgeErr : s.badgeWarn,
            { marginRight: 8, minWidth: 20, textAlign: 'center' }
          ]}>
            {item.valor === 0 ? '✓' : item.valor}
          </Text>
          <Text style={s.body}>{item.label}</Text>
        </View>
      ))}

      <View style={s.divider} />

      <Text style={s.h3}>Auditoría del Cierre</Text>
      <Text style={s.body}>Cerrado por: {cerradoPor}</Text>
      <Text style={s.body}>Fecha y hora: {new Date(cerradoEn).toLocaleString('es-PE')}</Text>

      <View style={[s.divider, { marginTop: 8 }]} />
      <Text style={[s.label, { marginBottom: 4 }]}>Hash SHA-256 (verificación de integridad)</Text>
      <Text style={[s.muted, { fontFamily: 'Courier', fontSize: 7, wordBreak: 'break-all' }]}>{hash}</Text>

      {historialReaperturas?.length > 0 && (
        <>
          <View style={s.divider} />
          <Text style={s.h3}>Historial de Reaperturas</Text>
          {historialReaperturas.map((r, i) => (
            <Text key={i} style={s.body}>
              v{r.version - 1} → Reabierto el {new Date(r.cerrado_en).toLocaleDateString('es-PE')}: {r.motivo_reapertura}
            </Text>
          ))}
        </>
      )}

      <View style={[s.footer, { bottom: 30 }]}>
        <Text style={[s.footerText, { marginBottom: 4 }]}>
          Generado por BERNA ERP · SHA-256: {hash}
        </Text>
        <Text style={s.footerText}>DOCUMENTO CONFIDENCIAL — USO INTERNO</Text>
      </View>
    </Page>
  );
}

/* ── Componente principal ─────────────────────────────────────────────────── */

/**
 * ReporteCierrePDF — Document de @react-pdf/renderer.
 *
 * @param {{
 *   year, month, version,
 *   kpis: { ingresos, egresos, utilidad_neta, margen_pct, n_movimientos, n_ventas,
 *            saldo_total_cuentas, deuda_pendiente_total, patrimonio_neto },
 *   plData: [{ nombre, total, es_seccion }],
 *   flujoData: [{ fecha, total_ingresos, total_egresos }],
 *   patrimonioData: { cuentas: [{nombre, saldo}], deudas: [{nombre, saldo_pendiente, tcea}] },
 *   checklist: { movimientos_sin_tipo, ... },
 *   cerradoPor: string,
 *   cerradoEn: string (ISO),
 *   hash: string,
 *   historialReaperturas: [{version, cerrado_en, motivo_reapertura}],
 * }} props
 */
export default function ReporteCierrePDF({
  year, month, version = 1,
  kpis = {}, plData = [], flujoData = [], patrimonioData = {},
  checklist = {}, cerradoPor = '', cerradoEn = new Date().toISOString(),
  hash = '', historialReaperturas = [],
}) {
  const generadoEn = new Date().toISOString();

  return (
    <Document
      title={`Cierre ${mesNombre(month)} ${year} v${version} — Berna Calzado`}
      author="Berna ERP"
      subject={`Reporte de Cierre Contable — ${mesNombre(month)} ${year}`}
    >
      <PaginaPortada year={year} month={month} version={version} kpis={kpis} generadoEn={generadoEn} hash={hash} />
      <PaginaPL plData={plData} kpis={kpis} hash={hash} />
      <PaginaFlujo flujoData={flujoData} kpis={kpis} hash={hash} />
      <PaginaPatrimonio patrimonioData={patrimonioData} kpis={kpis} hash={hash} />
      <PaginaChecklist
        checklist={checklist}
        cerradoPor={cerradoPor}
        cerradoEn={cerradoEn}
        hash={hash}
        historialReaperturas={historialReaperturas}
      />
    </Document>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/cierres/ReporteCierrePDF.jsx
git commit -m "feat(pdf): add ReporteCierrePDF — 5-page executive report with SHA-256 in footer"
```

---

## Task 11: `PasoChecklistSalud` — Paso 1 del Wizard

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/cierres/PasoChecklistSalud.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// src/views/finanzas/views/cierres/PasoChecklistSalud.jsx
import React from 'react';
import { Icon, ICONS, Spinner } from '../../components/UI';

const CHECKS = [
  { key: 'movimientos_sin_tipo',            label: 'Movimientos sin tipo',            bloqueante: true },
  { key: 'movimientos_sin_cuenta_contable', label: 'Movimientos sin cuenta contable', bloqueante: true },
  { key: 'splits_desbalanceados',           label: 'Splits desbalanceados',           bloqueante: true },
  { key: 'plantillas_mensuales_pendientes', label: 'Plantillas mensuales pendientes', bloqueante: false },
  { key: 'cuentas_con_saldo_negativo',      label: 'Cuentas con saldo negativo',      bloqueante: false },
];

export default function PasoChecklistSalud({ checklist, loading, onContinuar }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size={28} />
        <p className="text-sm text-muted-foreground">Verificando salud del período...</p>
      </div>
    );
  }

  if (!checklist) return null;

  const hayBloqueantes = checklist.bloqueante;
  const hayWarnings = (checklist.plantillas_mensuales_pendientes > 0) || (checklist.cuentas_con_saldo_negativo > 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Verificación de salud del período</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Revisamos que el período esté completo antes de cerrarlo.
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {CHECKS.map(({ key, label, bloqueante }) => {
          const valor = checklist[key] ?? 0;
          const esError = valor > 0 && bloqueante;
          const esWarning = valor > 0 && !bloqueante;
          const esOk = valor === 0;

          return (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                  ${esError   ? 'bg-destructive/10 text-destructive' : ''}
                  ${esWarning ? 'bg-amber-100 text-amber-700' : ''}
                  ${esOk      ? 'bg-green-100 text-green-700' : ''}
                `}>
                  {esOk ? '✓' : valor}
                </div>
                <span className="text-sm">{label}</span>
                {!bloqueante && <span className="text-xs text-muted-foreground">(advertencia)</span>}
              </div>
              <span className={`text-xs font-medium
                ${esError ? 'text-destructive' : ''}
                ${esWarning ? 'text-amber-600' : ''}
                ${esOk ? 'text-green-600' : ''}
              `}>
                {esOk ? 'OK' : esError ? 'Error' : 'Aviso'}
              </span>
            </div>
          );
        })}
      </div>

      {checklist.warnings?.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {checklist.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {hayBloqueantes ? (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Resuelve los errores marcados antes de cerrar el período.
          </p>
        </div>
      ) : (
        <button
          onClick={onContinuar}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {hayWarnings ? 'Continuar de todas formas →' : 'Continuar →'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/cierres/PasoChecklistSalud.jsx
git commit -m "feat(ui): add PasoChecklistSalud — wizard step 1 with blocking/warning distinction"
```

---

## Task 12: `PasoPreviewReporte` — Paso 2 del Wizard

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/cierres/PasoPreviewReporte.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// src/views/finanzas/views/cierres/PasoPreviewReporte.jsx
// Preview del PDF antes de confirmar el cierre.
// @react-pdf/renderer se importa de forma lazy para no inflar el bundle principal.
import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Spinner } from '../../components/UI';

// Lazy: el chunk de react-pdf solo se carga cuando se llega al paso 2
const PDFViewer = lazy(() => import('@react-pdf/renderer').then(m => ({ default: m.PDFViewer })));
const ReporteCierrePDF = lazy(() => import('./ReporteCierrePDF'));

export default function PasoPreviewReporte({ reporteData, onVolver, onContinuar }) {
  const [listo, setListo] = useState(false);

  useEffect(() => {
    // Pequeño delay para que el skeleton se muestre antes del render pesado
    const t = setTimeout(() => setListo(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold">Previsualización del reporte</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Revisa el reporte antes de confirmar el cierre. Una vez confirmado, quedará sellado con tu PIN.
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden" style={{ height: 480 }}>
        {!listo ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size={24} />
          </div>
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center h-full gap-2">
              <Spinner size={20} />
              <span className="text-sm text-muted-foreground">Generando PDF…</span>
            </div>
          }>
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              <ReporteCierrePDF {...reporteData} />
            </PDFViewer>
          </Suspense>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onVolver}
          className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          ← Volver al checklist
        </button>
        <button
          onClick={onContinuar}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Continuar con el cierre →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/cierres/PasoPreviewReporte.jsx
git commit -m "feat(ui): add PasoPreviewReporte — lazy PDFViewer with react-pdf"
```

---

## Task 13: `PasoConfirmarPin` — Paso 3 del Wizard

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/cierres/PasoConfirmarPin.jsx`

- [ ] **Step 1: Crear el componente**

```jsx
// src/views/finanzas/views/cierres/PasoConfirmarPin.jsx
import React, { useState } from 'react';

export default function PasoConfirmarPin({ year, month, onVolver, onConfirmar, guardando }) {
  const [pin, setPin] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!pin || pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    try {
      await onConfirmar({ pin, notas });
    } catch (err) {
      setError(err.message || 'Error al cerrar el período.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Confirmar cierre del período</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Esta acción sellará <strong>{MESES[month - 1]} {year}</strong> e impedirá ediciones.
          Se puede reabrir en cualquier momento con motivo y PIN.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            PIN de administrador
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            maxLength={8}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            Notas del cierre (opcional)
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={2}
            placeholder="Ej: Mes sin incidencias. Cuota Aly pagada el día 15."
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onVolver}
            disabled={guardando}
            className="flex-1 rounded-lg border py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            ← Volver al preview
          </button>
          <button
            type="submit"
            disabled={guardando || !pin}
            className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {guardando ? 'Cerrando…' : `Cerrar ${MESES[month - 1]} ${year}`}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/cierres/PasoConfirmarPin.jsx
git commit -m "feat(ui): add PasoConfirmarPin — step 3 with destructive confirm and PIN input"
```

---

## Task 14: `CierreWizard` — Orquestador del flujo

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/cierres/CierreWizard.jsx`

- [ ] **Step 1: Crear el orquestador**

```jsx
// src/views/finanzas/views/cierres/CierreWizard.jsx
// Orquestador de los 3 pasos del cierre. Carga datos, coordina el flujo.
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validarCierre, cerrarPeriodo,
  obtenerPeriodos,
} from '../../api/cierresClient';
import {
  obtenerPLResumen,
  obtenerFlujoCajaDiario,
  obtenerPatrimonioDetalle,
  obtenerPatrimonioTotales,
} from '../../api/dashboardClient';
import { verificarPin } from '../../../../lib/pinAuth';
import PasoChecklistSalud from './PasoChecklistSalud';
import PasoPreviewReporte from './PasoPreviewReporte';
import PasoConfirmarPin from './PasoConfirmarPin';

const PASOS = ['Verificación', 'Vista previa', 'Confirmar'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function CierreWizard({ usuario, year, month }) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(0);
  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [reporteData, setReporteData] = useState(null);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const yearN = parseInt(year);
  const monthN = parseInt(month);

  // Cargar checklist al montar
  useEffect(() => {
    setLoadingChecklist(true);
    validarCierre(yearN, monthN)
      .then(setChecklist)
      .catch(e => setError(e.message))
      .finally(() => setLoadingChecklist(false));
  }, [yearN, monthN]);

  // Cargar datos del reporte al avanzar al paso 2
  const cargarDatosReporte = async () => {
    if (reporteData) return; // ya cargado
    setLoadingReporte(true);
    try {
      const fechaInicio = `${yearN}-${String(monthN).padStart(2, '0')}-01`;
      const fechaFin = new Date(yearN, monthN, 0).toISOString().slice(0, 10);

      const [plData, flujoData, patrimonioDetalle, patrimonioTotales, periodos] = await Promise.all([
        obtenerPLResumen(fechaInicio, fechaFin),
        obtenerFlujoCajaDiario(fechaInicio, fechaFin),
        obtenerPatrimonioDetalle(),
        obtenerPatrimonioTotales(),
        obtenerPeriodos(),
      ]);

      const periodo = periodos.find(p => p.year === yearN && p.month === monthN);
      const historialReaperturas = (periodo?.cierres || []).filter(c => c.version > 1);

      const ingresos = plData.filter(r => r.seccion === 'Ingresos').reduce((a, r) => a + (r.total || 0), 0);
      const egresos = plData.filter(r => r.seccion !== 'Ingresos').reduce((a, r) => a + Math.abs(r.total || 0), 0);
      const utilidad_neta = ingresos - egresos;

      setReporteData({
        year: yearN,
        month: monthN,
        version: (periodo?.cierres?.length || 0) + 1,
        kpis: {
          ingresos,
          egresos,
          utilidad_neta,
          margen_pct: ingresos > 0 ? (utilidad_neta / ingresos) * 100 : 0,
          n_movimientos: checklist?.movimientos_sin_tipo !== undefined ? undefined : 0,
          n_ventas: 0,
          saldo_total_cuentas: patrimonioTotales.total_activos || 0,
          deuda_pendiente_total: patrimonioTotales.total_pasivos || 0,
          patrimonio_neto: patrimonioTotales.patrimonio_neto || 0,
        },
        plData,
        flujoData,
        patrimonioData: {
          cuentas: patrimonioDetalle.filter(d => d.tipo === 'activo'),
          deudas: patrimonioDetalle.filter(d => d.tipo === 'pasivo'),
        },
        checklist,
        cerradoPor: usuario?.nombre || 'Admin',
        cerradoEn: new Date().toISOString(),
        hash: '', // se calcula en el momento del cierre real
        historialReaperturas,
      });
    } catch (e) {
      setError('Error cargando datos del reporte: ' + e.message);
    } finally {
      setLoadingReporte(false);
    }
  };

  const irAlPaso2 = async () => {
    await cargarDatosReporte();
    setPaso(1);
  };

  const handleConfirmar = async ({ pin, notas }) => {
    setGuardando(true);
    setError('');
    try {
      // Validar PIN contra BD
      const pinValido = await verificarPin(usuario.id_persona, pin);
      if (!pinValido) throw new Error('PIN incorrecto.');

      // Generar PDF como Blob — usamos pdf() de react-pdf
      const { pdf } = await import('@react-pdf/renderer');
      const ReporteCierrePDF = (await import('./ReporteCierrePDF')).default;

      const snapshotKpis = {
        ...reporteData.kpis,
        year: yearN,
        month: monthN,
        version_schema: '1.0',
      };

      const pdfBlob = await pdf(
        <ReporteCierrePDF {...reporteData} />
      ).toBlob();

      const result = await cerrarPeriodo({
        year: yearN,
        month: monthN,
        idPersona: usuario.id_persona,
        pdfBlob,
        snapshotKpis,
        checklistSalud: checklist,
      });

      navigate('/finanzas/cierres', {
        state: { toast: `Período ${MESES[monthN - 1]} ${yearN} cerrado (v${result.version}).` }
      });
    } catch (e) {
      throw e; // PasoConfirmarPin lo muestra
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Header del wizard */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold">
          Cerrar {MESES[monthN - 1]} {yearN}
        </h1>
        <div className="mt-4 flex items-center gap-0">
          {PASOS.map((nombre, i) => (
            <React.Fragment key={i}>
              <div className={`flex items-center gap-2 ${i <= paso ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium
                  ${i < paso ? 'bg-primary text-primary-foreground' : ''}
                  ${i === paso ? 'border-2 border-primary text-primary' : ''}
                  ${i > paso ? 'border border-muted-foreground/30' : ''}
                `}>
                  {i < paso ? '✓' : i + 1}
                </div>
                <span className="text-xs">{nombre}</span>
              </div>
              {i < PASOS.length - 1 && (
                <div className={`mx-2 h-px flex-1 ${i < paso ? 'bg-primary' : 'bg-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {paso === 0 && (
        <PasoChecklistSalud
          checklist={checklist}
          loading={loadingChecklist}
          onContinuar={irAlPaso2}
        />
      )}
      {paso === 1 && (
        <PasoPreviewReporte
          reporteData={reporteData || {}}
          onVolver={() => setPaso(0)}
          onContinuar={() => setPaso(2)}
        />
      )}
      {paso === 2 && (
        <PasoConfirmarPin
          year={yearN}
          month={monthN}
          onVolver={() => setPaso(1)}
          onConfirmar={handleConfirmar}
          guardando={guardando}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/cierres/CierreWizard.jsx
git commit -m "feat(ui): add CierreWizard — 3-step orchestrator with PDF generation and PIN validation"
```

---

## Task 15: `BannerCierrePendiente` — Banner global

**Files:**
- Create: `sistema-calzado/src/views/finanzas/components/BannerCierrePendiente.jsx`

- [ ] **Step 1: Crear el banner**

```jsx
// src/views/finanzas/components/BannerCierrePendiente.jsx
// Banner amber que aparece cuando hay períodos del pasado sin cerrar.
// Se muestra solo a admins con puedeCerrar. Dismissable por día.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { obtenerPeriodosPendientes } from '../api/cierresClient';
import { puedeCerrar } from '../lib/permisos';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DISMISS_KEY = 'berna.cierre.dismissed'; // valor: 'YYYY-MM' del mes actual

export default function BannerCierrePendiente({ usuario }) {
  const [pendientes, setPendientes] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!puedeCerrar(usuario)) return;

    // Comprobar si ya se hizo dismiss hoy (en el mes actual)
    const mesActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const dismissedMes = localStorage.getItem(DISMISS_KEY);
    if (dismissedMes === mesActual) {
      setDismissed(true);
      return;
    }

    obtenerPeriodosPendientes()
      .then(setPendientes)
      .catch(() => {}); // silenciar errores de red — el banner no es crítico
  }, [usuario]);

  const handleDismiss = () => {
    const mesActual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem(DISMISS_KEY, mesActual);
    setDismissed(true);
  };

  if (dismissed || !puedeCerrar(usuario) || pendientes.length === 0) return null;

  const primero = pendientes[0];
  const etiqueta = `${MESES[primero.month - 1]} ${primero.year}`;
  const extra = pendientes.length > 1 ? ` y ${pendientes.length - 1} más` : '';

  return (
    <div className="mx-4 md:mx-8 mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-800">
        <span className="font-medium">⚠ {pendientes.length} período{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''} de cierre:</span>{' '}
        {etiqueta}{extra}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={`/finanzas/cierres/${primero.year}/${primero.month}`}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors"
        >
          Ver y cerrar →
        </Link>
        <button
          onClick={handleDismiss}
          className="text-amber-600 hover:text-amber-800 text-lg leading-none"
          aria-label="Recordar mañana"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/components/BannerCierrePendiente.jsx
git commit -m "feat(ui): add BannerCierrePendiente — amber global banner with daily dismiss"
```

---

## Task 16: `CierresPeriodo` — Vista historial

**Files:**
- Create: `sistema-calzado/src/views/finanzas/views/CierresPeriodo.jsx`

- [ ] **Step 1: Crear la vista**

```jsx
// src/views/finanzas/views/CierresPeriodo.jsx
// Historial de períodos: tabla con estado, versión, acciones (descargar, reabrir, cerrar).
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  obtenerPeriodos, descargarPdfCierre, reabrirPeriodo,
} from '../api/cierresClient';
import { verificarPin } from '../../../lib/pinAuth';
import { puedeCerrar, puedeReabrir, puedeVerCierres } from '../lib/permisos';
import { LoadingState, EmptyState, PageHeader, Icon, ICONS } from '../components/UI';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function ModalReabrir({ periodo, usuario, onClose, onExito }) {
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!motivo.trim()) { setError('El motivo es obligatorio.'); return; }
    if (!pin || pin.length < 4) { setError('PIN inválido.'); return; }
    setGuardando(true);
    try {
      const pinValido = await verificarPin(usuario.id_persona, pin);
      if (!pinValido) throw new Error('PIN incorrecto.');
      await reabrirPeriodo({ idPeriodo: periodo.id_periodo, motivo, idPersona: usuario.id_persona });
      onExito();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-4">
          Reabrir {MESES[periodo.month - 1]} {periodo.year}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              Motivo de la reapertura *
            </label>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              placeholder="Ej: Faltó registrar el pago de servicios del día 28."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
              PIN de administrador
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-muted/50">
              Cancelar
            </button>
            <button type="submit" disabled={guardando}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {guardando ? 'Reabriendo…' : 'Reabrir período'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CierresPeriodo({ usuario }) {
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(null);
  const [reabriendo, setReabriendo] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState(location.state?.toast || '');

  const cargar = () => {
    setLoading(true);
    obtenerPeriodos()
      .then(setPeriodos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }
  }, [toast]);

  const handleDescargar = async (cierre) => {
    setDescargando(cierre.id_cierre);
    try {
      const url = await descargarPdfCierre(cierre.url_storage);
      window.open(url, '_blank');
    } catch (e) {
      alert('Error descargando PDF: ' + e.message);
    } finally {
      setDescargando(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <div className="text-destructive text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          ✓ {toast}
        </div>
      )}

      <PageHeader title="Cierres de Período" subtitle="Historial de cierres contables mensuales." />

      {periodos.length === 0 ? (
        <EmptyState title="Sin períodos" description="No hay períodos registrados." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Período</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Versión</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Cerrado</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {periodos.map(p => {
                const ultimoCierre = p.cierres?.sort((a,b) => b.version - a.version)[0];
                const hoy = new Date();
                const esPasado = p.year < hoy.getFullYear() || (p.year === hoy.getFullYear() && p.month < hoy.getMonth() + 1);
                return (
                  <tr key={p.id_periodo} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{MESES[p.month - 1]} {p.year}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                        ${p.estado === 'cerrado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
                      `}>
                        {p.estado === 'cerrado' ? '● Cerrado' : '○ Abierto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ultimoCierre ? `v${ultimoCierre.version}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {ultimoCierre
                        ? new Date(ultimoCierre.cerrado_en).toLocaleDateString('es-PE')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {ultimoCierre && puedeVerCierres(usuario) && (
                          <button
                            onClick={() => handleDescargar(ultimoCierre)}
                            disabled={descargando === ultimoCierre.id_cierre}
                            className="text-xs text-primary hover:underline disabled:opacity-50"
                          >
                            {descargando === ultimoCierre.id_cierre ? 'Descargando…' : 'PDF'}
                          </button>
                        )}
                        {p.estado === 'cerrado' && puedeReabrir(usuario) && (
                          <button
                            onClick={() => setReabriendo(p)}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Reabrir
                          </button>
                        )}
                        {p.estado === 'abierto' && esPasado && puedeCerrar(usuario) && (
                          <Link
                            to={`/finanzas/cierres/${p.year}/${p.month}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Cerrar →
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reabriendo && (
        <ModalReabrir
          periodo={reabriendo}
          usuario={usuario}
          onClose={() => setReabriendo(null)}
          onExito={() => { setReabriendo(null); cargar(); setToast(`Período ${MESES[reabriendo.month-1]} ${reabriendo.year} reabierto.`); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/finanzas/views/CierresPeriodo.jsx
git commit -m "feat(ui): add CierresPeriodo — history table with download, reopen and close actions"
```

---

## Task 17: Integrar en `FinanzasLayout`

**Files:**
- Modify: `sistema-calzado/src/views/finanzas/FinanzasLayout.jsx`

- [ ] **Step 1: Agregar imports, NAV_ITEM, rutas y Banner**

En `FinanzasLayout.jsx` hacer los siguientes cambios:

**1.1 Agregar imports al principio (después de los imports existentes):**

```js
import BannerCierrePendiente from './components/BannerCierrePendiente';
import { puedeVerCierres } from './lib/permisos';

const CierresPeriodo = lazy(() => import('./views/CierresPeriodo'));
const CierreWizard   = lazy(() => import('./views/cierres/CierreWizard'));
```

**1.2 Agregar item en `NAV_ITEMS` (después del item `estado-resultados`, antes de `cuentas`):**

```js
{ path: '/finanzas/cierres', label: 'Cierres', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', recurso: RECURSOS.CIERRES },
```

**1.3 En `visibleItems`, añadir condición especial para `CIERRES`:**

La lógica existente es:
```js
const visibleItems = NAV_ITEMS.filter(item => {
  if (!puedeVer(usuario, item.recurso)) return false;
  if (item.adminOnly && !esAdmin(usuario, RECURSOS.FINANZAS)) return false;
  return true;
});
```

Cambiar a:
```js
const visibleItems = NAV_ITEMS.filter(item => {
  if (item.recurso === RECURSOS.CIERRES) return puedeVerCierres(usuario);
  if (!puedeVer(usuario, item.recurso)) return false;
  if (item.adminOnly && !esAdmin(usuario, RECURSOS.FINANZAS)) return false;
  return true;
});
```

**1.4 Agregar `BannerCierrePendiente` en el JSX, justo antes del `<div className="max-w-7xl...">` en `<main>`:**

```jsx
<main ...>
  <BannerCierrePendiente usuario={usuario} />  {/* ← agregar aquí */}
  <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
    <Suspense ...>
      <Routes>
        ...
        {/* Agregar estas 2 rutas en el bloque Routes */}
        <Route path="cierres"                element={<CierresPeriodo usuario={usuario} />} />
        <Route path="cierres/:year/:month"   element={
          <CierreWizardWrapper usuario={usuario} />
        } />
        ...
      </Routes>
    </Suspense>
  </div>
</main>
```

**1.5 Agregar el wrapper para extraer params:**

```jsx
// Justo antes del `export default function FinanzasLayout`
function CierreWizardWrapper({ usuario }) {
  const { year, month } = useParams();  // importar useParams de react-router-dom
  return <CierreWizard usuario={usuario} year={year} month={month} />;
}
```

Asegúrate de agregar `useParams` al import de react-router-dom si no está ya.

- [ ] **Step 2: Verificar build**

```bash
cd sistema-calzado
npm run build 2>&1 | tail -20
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/views/finanzas/FinanzasLayout.jsx
git commit -m "feat(layout): integrate CierresPeriodo + CierreWizard + BannerCierrePendiente into FinanzasLayout"
```

---

## Task 18: Seed/Backfill `periodos_contables`

- [ ] **Step 1: Verificar que ya existe el seed**

La migración `20260418_13_seed_catalogo_inicial.sql` (Fase 1) ya inserta períodos desde enero 2026 hasta el mes actual con `ON CONFLICT (year, month) DO NOTHING`. Verificar en el SQL del archivo que la sección 3 está presente:

```bash
grep -A8 "Períodos contables" sistema-calzado/supabase/migrations/20260418_13_seed_catalogo_inicial.sql
```

Expected output:
```
-- ── 3. Períodos contables (abiertos desde enero 2026 hasta mes actual) ──────
INSERT INTO public.periodos_contables(year, month, estado)
SELECT ...
FROM generate_series(...)
ON CONFLICT (year, month) DO NOTHING;
```

Si existe: el backfill ya está cubierto. No se necesita migración adicional.

- [ ] **Step 2: Commit (solo si fue necesario agregar algo)**

Si el seed de Fase 1 ya cubre los períodos, este step no genera commit. El task se marca como verificado/completado.

---

## Task 19: Actualizar `supabase_schema.sql` y documentación

**Files:**
- Modify: `sistema-calzado/supabase_schema.sql`
- Modify: `sistema-calzado/docs/business_logic.md`
- Modify: `CLAUDE.md` (en raíz del repo)

- [ ] **Step 1: Agregar tabla + funciones + vista al schema**

En `supabase_schema.sql`, agregar al final (después del bloque de Fase 1):

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- FASE 1.5 — Cierre de Períodos Contables
-- ═══════════════════════════════════════════════════════════════════════

-- Tabla: cierres_periodo
-- (ver migrations/20260419_01_cierres_periodo_tabla.sql)
CREATE TABLE IF NOT EXISTS public.cierres_periodo (
  id_cierre         serial PRIMARY KEY,
  id_periodo        integer NOT NULL REFERENCES public.periodos_contables(id_periodo) ON DELETE RESTRICT,
  version           integer NOT NULL DEFAULT 1,
  id_persona_cerro  integer NOT NULL REFERENCES public.personas_tienda(id_persona),
  cerrado_en        timestamptz NOT NULL DEFAULT now(),
  motivo_reapertura text,
  hash_sha256       text NOT NULL,
  url_storage       text NOT NULL,
  snapshot_kpis     jsonb NOT NULL DEFAULT '{}',
  checklist_salud   jsonb NOT NULL DEFAULT '{}',
  bytes_pdf         integer,
  id_organizacion   uuid,
  UNIQUE (id_periodo, version)
);

-- Funciones: fn_validar_cierre, fn_cerrar_periodo, fn_reabrir_periodo
-- Vista: v_cierres_integridad
-- Storage bucket: cierres-mensuales (privado)
-- (ver migrations 20260419_02 al 20260419_06)
```

- [ ] **Step 2: Actualizar tabla de roadmap en `business_logic.md`**

En la sección `5.4. Roadmap — Estado de módulos`, agregar fila:

```markdown
| **Módulo Cierres** | ✅ COMPLETADO — Cierre mensual con PDF ejecutivo, hash SHA-256, Storage, reapertura versionada. |
```

- [ ] **Step 3: Actualizar `CLAUDE.md`**

En la sección `Sub-modules (in sidebar order)` del área Finanzas, agregar:
```markdown
 - `CierresPeriodo` — Historial de cierres + wizard de cierre/reapertura + descarga de PDF.
```

En `Key tables`, agregar:
```markdown
- `cierres_periodo` — Registros de cierres mensuales con hash SHA-256, URL Storage, snapshot KPIs.
```

En `Key RPC functions`, agregar:
```markdown
- `fn_validar_cierre(year, month)` — Checklist de salud del período.
- `fn_cerrar_periodo(...)` — Cierre atómico con lock pesimista.
- `fn_reabrir_periodo(id_periodo, motivo, id_persona)` — Reapertura con motivo obligatorio.
```

- [ ] **Step 4: Commit**

```bash
git add supabase_schema.sql docs/business_logic.md ../../CLAUDE.md
git commit -m "docs: update schema, business_logic and CLAUDE.md for Fase 1.5 cierres module"
```

---

## Task 20: QA — Verificación post-aplicación de migraciones

> **Nota:** las migraciones 20260419_01 al 20260419_06 deben aplicarse en Supabase SQL Editor en orden antes de este task.

- [ ] **Step 1: Verificar objetos en BD**

```sql
-- 1 tabla
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'cierres_periodo';
-- Expected: 1

-- 3 funciones
SELECT count(*) FROM pg_proc
WHERE proname IN ('fn_validar_cierre', 'fn_cerrar_periodo', 'fn_reabrir_periodo');
-- Expected: 3

-- 1 vista
SELECT count(*) FROM pg_views
WHERE schemaname = 'public' AND viewname = 'v_cierres_integridad';
-- Expected: 1

-- Bucket
SELECT count(*) FROM storage.buckets WHERE id = 'cierres-mensuales';
-- Expected: 1

-- Permisos seed (al menos 1 admin de cierres)
SELECT count(*) FROM permisos_persona WHERE recurso = 'cierres' AND nivel_acceso = 'admin';
-- Expected: > 0
```

- [ ] **Step 2: Smoke tests browser**

Con `npm run dev` corriendo (`cd sistema-calzado && npm run dev`):

- [ ] Navegar a `/finanzas/cierres` → tabla de períodos se carga sin error.
- [ ] Si hay mes anterior abierto → banner ámbar aparece en todas las vistas de `/finanzas/*`.
- [ ] `/finanzas/cierres/2026/3` (o el mes anterior real) → Paso 1 carga el checklist.
- [ ] Si todos los checks están en verde → botón "Continuar" habilitado.
- [ ] Paso 2 → preview PDF carga (puede tardar ~2s el primer render).
- [ ] Paso 3 → botón "Cerrar período" destructivo aparece.
- [ ] Usuario con solo `finanzas:ver` → no ve el ítem "Cierres" en el sidebar.

- [ ] **Step 3: Verificar que el trigger de Fase 1 sigue funcionando**

Después de cerrar un período en la UI, intentar en Supabase SQL Editor:

```sql
-- Reemplazar con año/mes del período que cerraste
INSERT INTO movimientos_caja(id_tipo, monto, fecha_movimiento)
VALUES (1, 10, '2026-03-15');
-- Expected: ERROR PERIODO_CERRADO
```

- [ ] **Step 4: Verificar v_cierres_integridad**

```sql
SELECT year, month, version, estado_integridad FROM v_cierres_integridad ORDER BY year, month, version;
-- Expected: todos los registros muestran estado_integridad = 'OK'
```

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat(fase1.5): Cierre de Períodos Contables — implementación completa

- 6 migraciones SQL: cierres_periodo, fn_validar_cierre, fn_cerrar_periodo
  (lock NOWAIT), fn_reabrir_periodo, Storage bucket + RLS, v_cierres_integridad
- API client cierresClient.js con SHA-256 hash chain y Storage cleanup
- ReporteCierrePDF: 5 páginas con @react-pdf/renderer (lazy loaded)
- Wizard 3 pasos: PasoChecklistSalud + PasoPreviewReporte + PasoConfirmarPin
- BannerCierrePendiente global en FinanzasLayout
- CierresPeriodo: historial con descarga PDF (presigned URL) y modal reabrir
- Recurso CIERRES en permisos (table-driven RBAC, seed automático)
- Multi-tenant ready (id_organizacion en cierres_periodo)
- Todos los criterios de aceptación verificados"
```

---

## Self-Review del Plan

**Cobertura del spec (sección por sección):**

| Sección spec | Task |
|---|---|
| §2 Modelo de datos (`cierres_periodo`) | Task 1 |
| §2.2 `snapshot_kpis` jsonb | Task 9 (cerrarPeriodo) + Task 14 (CierreWizard) |
| §2.3 `checklist_salud` jsonb | Task 2 (fn_validar_cierre) + Task 11 |
| §2.4 Hash chain | Task 9 (cerrarPeriodo) + Task 10 (ReporteCierrePDF) |
| §3.1 `fn_validar_cierre` | Task 2 |
| §3.2 `fn_cerrar_periodo` | Task 3 |
| §3.3 `fn_reabrir_periodo` | Task 4 |
| §3.4 `v_cierres_integridad` | Task 6 |
| §4 Storage + RLS | Task 5 |
| §4.3 Atomicidad cliente (cleanup) | Task 9 |
| §5 Permisos (`RECURSOS.CIERRES`) | Task 8 + Task 6 (seed) |
| §6.4 BannerCierrePendiente | Task 15 |
| §6.5 Wizard 3 pasos | Tasks 11, 12, 13, 14 |
| §6.6 CierresPeriodo historial | Task 16 |
| §6.7 ReporteCierrePDF 5 páginas | Task 10 |
| §7 cierresClient.js | Task 9 |
| §8 PIN re-validation | Tasks 14, 16 (verificarPin) |
| §8 Lock pesimista | Task 3 |
| §8 Multi-tenant ready | Task 1 |
| §9 Migraciones + down | Tasks 1-6 |
| §10 npm @react-pdf/renderer | Task 7 |
| §11 Criterios de aceptación | Task 20 |
| §12 Documentación | Task 19 |

**Consistencia de nombres:**
- `cerrarPeriodo` en Task 9 → invoca `fn_cerrar_periodo` en Task 3 ✓
- `validarCierre` en Task 9 → invoca `fn_validar_cierre` en Task 2 ✓
- `reabrirPeriodo` en Task 9 → invoca `fn_reabrir_periodo` en Task 4 ✓
- `ReporteCierrePDF` en Task 10 → importado en Tasks 12 y 14 ✓
- `puedeCerrar` / `puedeReabrir` / `puedeVerCierres` en Task 8 → usados en Tasks 15, 16, 17 ✓
- `RECURSOS.CIERRES` en Task 8 → usado en Task 17 ✓
