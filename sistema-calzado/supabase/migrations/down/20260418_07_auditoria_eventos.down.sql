-- down/20260418_07_auditoria_eventos.down.sql
DROP TRIGGER IF EXISTS trg_audit_log_inmutable ON public.audit_log;
DROP TRIGGER IF EXISTS trg_tipo_eventos_inmutable ON public.tipo_eventos;
DROP TRIGGER IF EXISTS trg_plantilla_eventos_inmutable ON public.plantilla_eventos;
DROP FUNCTION IF EXISTS public.fn_bloquear_modificacion_audit();
DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.plantilla_eventos;
DROP TABLE IF EXISTS public.tipo_eventos;
