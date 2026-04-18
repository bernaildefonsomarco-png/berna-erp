-- down/20260418_06_periodos_contables.down.sql
DROP TRIGGER IF EXISTS trg_bloquear_periodo_cerrado ON public.movimientos_caja;
DROP FUNCTION IF EXISTS public.fn_bloquear_periodo_cerrado();
DROP TABLE IF EXISTS public.periodos_contables;
