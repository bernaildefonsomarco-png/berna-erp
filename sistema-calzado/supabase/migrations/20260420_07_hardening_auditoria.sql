-- ============================================================================
-- Fase 2.07 — Hardening de auditoría
-- Combina 4 puntos aceptados de la auditoría externa:
--   7.1 Idempotency keys en ventas y movimientos
--   7.2 Índice compuesto en obligaciones_instancias (bandeja)
--   7.3 FK RESTRICT en tablas de hechos → maestras
--   7.4 Verificación y limpieza de tablas huérfanas
-- ============================================================================

-- -------------------------------------------------------
-- 7.1 — Idempotency keys en ventas y movimientos
-- -------------------------------------------------------

ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_idempotency
    ON public.ventas(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.movimientos_caja
    ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_idempotency
    ON public.movimientos_caja(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.ventas.idempotency_key IS
  'UUID generado en cliente antes del POST. Permite reintentar POST sin duplicar venta.';
COMMENT ON COLUMN public.movimientos_caja.idempotency_key IS
  'UUID generado en cliente antes del POST. Permite reintentar POST sin duplicar movimiento.';

-- -------------------------------------------------------
-- 7.2 — Índice compuesto en obligaciones_instancias
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_obligaciones_instancias_bandeja
    ON public.obligaciones_instancias(estado, fecha_vencimiento)
    WHERE estado IN ('proyectado','confirmado','vencido','pagado_parcial','acumulado');

-- -------------------------------------------------------
-- 7.3 — Auditoría de FKs históricas (ON DELETE RESTRICT)
-- -------------------------------------------------------

-- ventas → personas_tienda
ALTER TABLE public.ventas
    DROP CONSTRAINT IF EXISTS ventas_id_persona_fkey,
    ADD  CONSTRAINT ventas_id_persona_fkey
        FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona) ON DELETE RESTRICT;

-- ventas → ubicaciones
ALTER TABLE public.ventas
    DROP CONSTRAINT IF EXISTS ventas_id_ubicacion_fkey,
    ADD  CONSTRAINT ventas_id_ubicacion_fkey
        FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE RESTRICT;

-- movimientos_caja → personas_tienda
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_persona_fkey,
    ADD  CONSTRAINT movimientos_caja_id_persona_fkey
        FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona) ON DELETE RESTRICT;

-- movimientos_caja → tipos_movimiento_caja
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_tipo_fkey,
    ADD  CONSTRAINT movimientos_caja_id_tipo_fkey
        FOREIGN KEY (id_tipo) REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE RESTRICT;

-- movimientos_caja → cuentas_financieras
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_cuenta_financiera_fkey,
    ADD  CONSTRAINT movimientos_caja_id_cuenta_financiera_fkey
        FOREIGN KEY (id_cuenta_financiera) REFERENCES public.cuentas_financieras(id_cuenta) ON DELETE RESTRICT;

-- movimientos_caja → ubicaciones
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_ubicacion_fkey,
    ADD  CONSTRAINT movimientos_caja_id_ubicacion_fkey
        FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE RESTRICT;

-- movimiento_splits → plan_cuentas
ALTER TABLE public.movimiento_splits
    DROP CONSTRAINT IF EXISTS movimiento_splits_id_cuenta_contable_fkey,
    ADD  CONSTRAINT movimiento_splits_id_cuenta_contable_fkey
        FOREIGN KEY (id_cuenta_contable) REFERENCES public.plan_cuentas(id_cuenta_contable) ON DELETE RESTRICT;

-- NOTA: repetir el patrón DROP/ADD para cualquier otra FK histórica que
-- surja al revisar el schema con:
--   SELECT conname, conrelid::regclass, confrelid::regclass, confdeltype
--   FROM pg_constraint WHERE contype = 'f'
--     AND confrelid::regclass::text IN
--       ('personas_tienda','ubicaciones','cuentas_financieras',
--        'tipos_movimiento_caja','plan_cuentas')
--     AND confdeltype = 'a'; -- 'a' = NO ACTION (equivale a RESTRICT sólo en el caso trivial)

-- -------------------------------------------------------
-- 7.4 — Verificación y limpieza de tablas huérfanas
-- -------------------------------------------------------

-- Verificación (informativa). Si alguna tabla no existe, el bloque no falla.
DO $$
DECLARE
    v_plantillas   integer := -1;
    v_vistas       integer := -1;
BEGIN
    IF to_regclass('public.plantillas_recurrentes') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.plantillas_recurrentes' INTO v_plantillas;
        RAISE NOTICE 'plantillas_recurrentes existe con % fila(s). Revisar si se reemplaza por obligaciones_recurrentes (ADR-004).', v_plantillas;
    END IF;

    IF to_regclass('public.vistas_guardadas') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.vistas_guardadas' INTO v_vistas;
        RAISE NOTICE 'vistas_guardadas existe con % fila(s). Si no hay feature activa, dropear manualmente tras revisión.', v_vistas;
    END IF;
END $$;

-- Drop explícito SOLO si la revisión manual confirma que son huérfanas.
-- Comentados por seguridad: descomentar tras confirmar en el entorno real.
-- DROP TABLE IF EXISTS public.plantillas_recurrentes CASCADE;
-- DROP TABLE IF EXISTS public.vistas_guardadas CASCADE;
