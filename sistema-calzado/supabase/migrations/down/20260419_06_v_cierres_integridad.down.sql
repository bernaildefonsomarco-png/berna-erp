-- down/20260419_06_v_cierres_integridad.down.sql
DROP VIEW IF EXISTS public.v_cierres_integridad;
DELETE FROM public.permisos_persona WHERE recurso = 'cierres';
