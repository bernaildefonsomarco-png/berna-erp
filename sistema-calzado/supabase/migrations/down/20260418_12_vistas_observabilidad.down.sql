-- down/20260418_12_vistas_observabilidad.down.sql
DROP VIEW IF EXISTS public.v_sistema_salud;
DROP INDEX IF EXISTS idx_tipos_movimiento_nombre_trgm;
-- No quitamos pg_trgm por seguridad (puede usarse en otros lugares)
