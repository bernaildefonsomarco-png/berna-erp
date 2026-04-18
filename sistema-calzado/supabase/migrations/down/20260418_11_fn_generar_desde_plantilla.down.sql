-- down/20260418_11_fn_generar_desde_plantilla.down.sql
DROP FUNCTION IF EXISTS public.fn_generar_movimiento_desde_plantilla(
  integer, text, numeric, integer, integer, text
);
