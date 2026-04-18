-- down/20260418_13_seed_catalogo_inicial.down.sql
-- Revierte el seed idempotente de catálogos (migración 13).
-- Nota: los UPDATEs a tipos_movimiento_caja no se revierten aquí
-- porque no hay forma de distinguir valores pre-existentes de los
-- escritos por este seed. Aplica el down de la migración 02 si
-- necesitas limpiar completamente las extensiones de ese tabla.

-- ── 5. mapeo_tipo_cuenta ─────────────────────────────────────────────────────
DELETE FROM public.mapeo_tipo_cuenta
WHERE id_tipo IN (
  SELECT id_tipo FROM public.tipos_movimiento_caja
  WHERE nombre ILIKE '%personal%'
     OR nombre ILIKE '%gasto%'
);

-- ── 3. Períodos contables ────────────────────────────────────────────────────
DELETE FROM public.periodos_contables WHERE year = 2026;

-- ── 2. Catálogos auxiliares ──────────────────────────────────────────────────
DELETE FROM public.catalogos_auxiliares
WHERE codigo IN ('frecuencias_pago', 'tipos_contrato', 'canales_venta');

-- ── 1. Roles de persona ──────────────────────────────────────────────────────
DELETE FROM public.roles_persona
WHERE codigo IN (
  'dueno', 'administrador', 'vendedor', 'cajero',
  'armador', 'perfilador', 'cortador', 'alistador', 'seguridad'
);
