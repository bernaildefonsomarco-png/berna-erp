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
