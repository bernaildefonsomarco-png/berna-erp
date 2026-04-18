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
   WHERE p.activo AND p.estado = 'activa' AND p.frecuencia = 'mensual'
     AND NOT EXISTS (
       SELECT 1 FROM public.plantilla_ejecuciones e
       WHERE e.id_plantilla = p.id_plantilla
         AND e.periodo = to_char(now(), 'YYYY-MM')
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
