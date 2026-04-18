-- down/20260418_08_triggers_integridad.down.sql
DROP TRIGGER IF EXISTS trg_validar_suma_splits ON public.movimiento_splits;
DROP TRIGGER IF EXISTS trg_snapshot_tipo_nombre ON public.movimientos_caja;
DROP TRIGGER IF EXISTS trg_audit_movimientos_caja ON public.movimientos_caja;
DROP TRIGGER IF EXISTS trg_audit_movimiento_splits ON public.movimiento_splits;
DROP TRIGGER IF EXISTS trg_audit_transferencias ON public.transferencias_internas;
DROP TRIGGER IF EXISTS trg_audit_costos_fijos ON public.costos_fijos;
DROP FUNCTION IF EXISTS public.fn_validar_suma_splits();
DROP FUNCTION IF EXISTS public.fn_snapshot_tipo_nombre();
DROP FUNCTION IF EXISTS public.fn_audit_generico();
