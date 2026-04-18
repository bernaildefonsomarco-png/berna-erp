-- down/20260418_14_deprecate_legacy_checks.down.sql
-- Revierte la migración 14: restaura los nombres originales de los CHECKs.

DO $$
BEGIN
  -- Restaurar personas_tienda.rol check
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_deprecated_personas_tienda_rol_check'
      AND conrelid = 'public.personas_tienda'::regclass
  ) THEN
    ALTER TABLE public.personas_tienda
      RENAME CONSTRAINT _deprecated_personas_tienda_rol_check
                      TO personas_tienda_rol_check;
    RAISE NOTICE 'Restored _deprecated_personas_tienda_rol_check → personas_tienda_rol_check';
  ELSE
    RAISE NOTICE '_deprecated_personas_tienda_rol_check not found — skipped';
  END IF;

  -- Restaurar costos_fijos.categoria check
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = '_deprecated_costos_fijos_categoria_check'
      AND conrelid = 'public.costos_fijos'::regclass
  ) THEN
    ALTER TABLE public.costos_fijos
      RENAME CONSTRAINT _deprecated_costos_fijos_categoria_check
                      TO costos_fijos_categoria_check;
    RAISE NOTICE 'Restored _deprecated_costos_fijos_categoria_check → costos_fijos_categoria_check';
  ELSE
    RAISE NOTICE '_deprecated_costos_fijos_categoria_check not found — skipped';
  END IF;
END $$;
