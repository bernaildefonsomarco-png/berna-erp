-- down/20260418_10_fn_registrar_hecho_economico.down.sql
DROP FUNCTION IF EXISTS public.fn_registrar_hecho_economico(
  integer, numeric, integer, integer, jsonb, integer, integer, integer, text, jsonb, timestamptz
);
DROP FUNCTION IF EXISTS public.fn_aplicar_splits(integer, jsonb);
