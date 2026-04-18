-- Rename permiso resource: rapido → comando
UPDATE public.permisos_persona SET recurso = 'comando' WHERE recurso = 'rapido';
-- Verification:
-- SELECT count(*) FROM public.permisos_persona WHERE recurso='comando'; -- should be > 0
-- SELECT count(*) FROM public.permisos_persona WHERE recurso='rapido';  -- should be 0
