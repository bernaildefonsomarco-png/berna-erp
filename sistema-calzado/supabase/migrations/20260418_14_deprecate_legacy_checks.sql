-- 20260418_14_deprecate_legacy_checks.sql
-- Fase 1 — Renombrar CHECKs rígidos a _deprecated_* (safe rollback).
-- Plan de limpieza: eliminar en Fase 2 tras validación completa.
--
-- Constraints objetivo:
--   personas_tienda_rol_check  — inline CHECK (rol IN ('vendedora','admin','operador'))
--   costos_fijos_categoria_check — inline CHECK (categoria = ANY (ARRAY[...]))
--
-- Ambos son inline (sin CONSTRAINT name explícito), por lo que PostgreSQL
-- los nombra automáticamente con el patrón <tabla>_<columna>_check.
-- Los IF EXISTS guards hacen que el script sea idempotente y seguro
-- aunque los nombres reales difieran en la BD de producción.

DO $$
BEGIN
  -- personas_tienda.rol
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personas_tienda_rol_check'
      AND conrelid = 'public.personas_tienda'::regclass
  ) THEN
    ALTER TABLE public.personas_tienda
      RENAME CONSTRAINT personas_tienda_rol_check
                      TO _deprecated_personas_tienda_rol_check;
    RAISE NOTICE 'Renamed personas_tienda_rol_check → _deprecated_personas_tienda_rol_check';
  ELSE
    RAISE NOTICE 'personas_tienda_rol_check not found — skipped (already renamed or never existed)';
  END IF;

  -- costos_fijos.categoria
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'costos_fijos_categoria_check'
      AND conrelid = 'public.costos_fijos'::regclass
  ) THEN
    ALTER TABLE public.costos_fijos
      RENAME CONSTRAINT costos_fijos_categoria_check
                      TO _deprecated_costos_fijos_categoria_check;
    RAISE NOTICE 'Renamed costos_fijos_categoria_check → _deprecated_costos_fijos_categoria_check';
  ELSE
    RAISE NOTICE 'costos_fijos_categoria_check not found — skipped (already renamed or never existed)';
  END IF;
END $$;
