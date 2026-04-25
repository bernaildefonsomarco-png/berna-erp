-- ============================================================================
-- Fase 2.06 — Drop catalogos_auxiliares (ADR-002)
-- Ejecutar SOLO después de confirmar migración de datos útiles.
-- ============================================================================

DO $$
DECLARE
    v_count integer;
BEGIN
    IF to_regclass('public.catalogos_auxiliares') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.catalogos_auxiliares WHERE activo = true' INTO v_count;
        IF v_count > 0 THEN
            RAISE NOTICE 'catalogos_auxiliares aún tiene % fila(s) activa(s). Verifique migración antes del DROP.', v_count;
        END IF;
    END IF;
END $$;

DROP TABLE IF EXISTS public.catalogos_auxiliares CASCADE;
