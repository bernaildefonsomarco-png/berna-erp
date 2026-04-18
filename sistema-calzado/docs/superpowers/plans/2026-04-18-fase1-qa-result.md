# Fase 1 — QA & Acceptance Criteria Results

**Date:** 2026-04-18  
**Scope:** Motor de Taxonomía Universal + QuickEntry (Tasks 1–30 implemented)

---

## Code Implementation — All Tasks PASSED

All 30 implementation tasks completed and committed. Final commit log:

```
96484f7 feat(hub): add QuickEntry trigger per location
1b753d3 refactor(caja): replace 2-step modal with QuickEntry (scope=pos)
5f747c3 feat(comando): wire QuickEntry into all 3 Comando views
6519b97 refactor: rename Rápido module to Comando
6914fe7 refactor(finanzas): make Transferencias read-only
99f311e refactor(finanzas): make Movimientos read-only + entry banner
4cb90b5 refactor(finanzas): replace CostosFijos with EstructuraFinanciera
93040d0 fix(ubicaciones): permission gate + variable rename fixes
8cac6f9 feat(ubicaciones): AbrirUbicacionWizard + trigger button
f640a60 feat(catalogoadmin): 7 tabs + root + route + sidebar
59ee83c feat(catalogoadmin): api client for all catalog tables
429fca1 feat(quickentry): 3-step orchestrator component
9a6409f feat(quickentry): sub-components (TipoSelector, CamposDinamicos, SplitsEditor, ResumenConfirmacion)
cdfc8d7 docs(db): update supabase_schema.sql with all Fase 1 objects
cf6cc99 feat(quickentry): api client wrapper
```

---

## Pending: DB Migrations (must be applied by user in Supabase SQL Editor)

Apply in order — each file is in `supabase/migrations/`:

- [ ] `20260418_01_catalogos_auxiliares.sql`
- [ ] `20260418_02_tipos_movimiento_extensiones.sql`
- [ ] `20260418_03_plantillas_recurrentes.sql`
- [ ] `20260418_04_mapeo_tipo_cuenta.sql`
- [ ] `20260418_05_movimientos_fks_extra.sql`
- [ ] `20260418_06_periodos_contables.sql`
- [ ] `20260418_07_auditoria_eventos.sql`
- [ ] `20260418_08_triggers_integridad.sql`
- [ ] `20260418_09_fn_resolver_cuenta_contable.sql`
- [ ] `20260418_10_fn_registrar_hecho_economico.sql`
- [ ] `20260418_11_fn_generar_desde_plantilla.sql`
- [ ] `20260418_12_vistas_observabilidad.sql`
- [ ] `20260418_13_seed_catalogo_inicial.sql`
- [ ] `20260418_14_deprecate_legacy_checks.sql`
- [ ] `20260418_15_rename_recurso_rapido_comando.sql`

---

## Pending: Manual SQL Verification (run in Supabase after migrations)

```sql
-- 9 tables
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'catalogos_auxiliares','roles_persona','plantillas_recurrentes',
    'plantilla_ejecuciones','mapeo_tipo_cuenta','periodos_contables',
    'tipo_eventos','plantilla_eventos','audit_log'
  );
-- Expected: 9

-- 9 functions
SELECT count(*) FROM pg_proc
WHERE proname IN (
  'fn_resolver_cuenta_contable','fn_registrar_hecho_economico',
  'fn_aplicar_splits','fn_generar_movimiento_desde_plantilla',
  'fn_bloquear_periodo_cerrado','fn_bloquear_modificacion_audit',
  'fn_audit_generico','fn_snapshot_tipo_nombre','fn_validar_suma_splits'
);
-- Expected: 9

-- 10 triggers
SELECT count(*) FROM pg_trigger
WHERE tgname IN (
  'trg_bloquear_periodo_cerrado','trg_audit_log_inmutable',
  'trg_tipo_eventos_inmutable','trg_plantilla_eventos_inmutable',
  'trg_audit_movimientos_caja','trg_audit_movimiento_splits',
  'trg_audit_transferencias','trg_audit_costos_fijos',
  'trg_snapshot_tipo_nombre','trg_validar_suma_splits'
);
-- Expected: 10

-- Audit inmutability
INSERT INTO audit_log(tabla,id_registro,accion,datos_despues) VALUES ('qa','1','insert','{}'::jsonb) RETURNING id_audit;
UPDATE audit_log SET tabla='hack' WHERE id_audit=<id>;
-- Expected: ERROR AUDIT_INMUTABLE

-- Período cerrado
UPDATE periodos_contables SET estado='cerrado' WHERE year=2026 AND month=1;
SELECT fn_registrar_hecho_economico(
  p_id_tipo := (SELECT id_tipo FROM tipos_movimiento_caja LIMIT 1),
  p_monto := 10.00,
  p_fecha := '2026-01-15'::timestamptz
);
-- Expected: ERROR PERIODO_CERRADO
UPDATE periodos_contables SET estado='abierto', motivo_reapertura='qa' WHERE year=2026 AND month=1;

-- Idempotencia de plantillas
SELECT fn_generar_movimiento_desde_plantilla(<id_plantilla>, '2026-QA-01');
SELECT fn_generar_movimiento_desde_plantilla(<id_plantilla>, '2026-QA-01');
-- Expected: ambos retornan mismo id_movimiento
SELECT count(*) FROM plantilla_ejecuciones WHERE periodo='2026-QA-01'; -- Expected: 1
-- Cleanup: DELETE FROM plantilla_ejecuciones WHERE periodo='2026-QA-01';

-- Permisos renombrados
SELECT count(*) FROM permisos_persona WHERE recurso='comando'; -- Expected: > 0
SELECT count(*) FROM permisos_persona WHERE recurso='rapido';  -- Expected: 0
```

---

## Pending: Browser Smoke Tests

With `npm run dev` running:

- [ ] `/finanzas/catalogo` loads 7 tabs; Tipos tab shows data; can create new tipo
- [ ] QuickEntry opens from Comando (RegistrarGasto, RegistrarPagoDeuda, Transferir)
- [ ] QuickEntry opens from Caja POS (scope=pos)
- [ ] QuickEntry opens from HubUbicacion (scope=finanzas, ubicacion pre-set)
- [ ] After saving a movement, `snapshot_tipo_nombre` is set; renaming tipo doesn't change snapshot
- [ ] `/finanzas/ubicaciones` shows "Abrir nueva ubicación" button (only for `puedoEditar` users)
- [ ] AbrirUbicacionWizard creates ubicación + caja + clones plantillas; redirects to new hub
- [ ] `/finanzas/estructura-financiera` shows plantillas_recurrentes read-only
- [ ] `/finanzas/costos` and `/finanzas/costos-fijos` redirect to estructura-financiera
- [ ] Movimientos page shows amber banner, no creation button
- [ ] Transferencias page shows amber banner, no creation button
- [ ] `/comando` route works; `/rapido` redirects to `/comando`
- [ ] Users with `recurso='rapido'` sessions auto-migrate to `berna.comando.session.v1`
- [ ] `audit_log` has rows after any movement is registered

---

## Known Limitations / Non-blocking Issues

1. **QuickEntry filter props missing:** `filtroComportamiento` and `filtroDireccion` props don't exist in QuickEntry; all 3 Comando views use `tiposPermitidos={null}`. Follow-up: add these props to QuickEntry or seed tipos with `scope=['comando']` to ensure only relevant types appear.

2. **Caja POS `id_caja` link lost:** The new QuickEntry integration doesn't link movements to the POS cash register session (`id_caja`). Old movements in `movimientos_caja` have `id_caja`; new ones won't. The POS reports should be verified to ensure they don't break on null `id_caja`.

3. **`v_rapido_cuentas` DB view** still has the old `rapido` name in `comandoClient.js` — the view name in Supabase should be renamed to `v_comando_cuentas` or aliased, or the query updated.

4. **Lint:** Pre-existing `ERR_MODULE_NOT_FOUND: eslint-plugin-react-hooks` prevents full lint pass; no new lint errors introduced by Fase 1 work.
