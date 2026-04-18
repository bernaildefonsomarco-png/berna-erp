-- down/20260418_05_movimientos_fks_extra.down.sql
DROP INDEX IF EXISTS idx_movimientos_plantilla_origen;
DROP INDEX IF EXISTS idx_movimientos_venta;
DROP INDEX IF EXISTS idx_movimientos_lote;
DROP INDEX IF EXISTS idx_movimientos_ubicacion_fecha;

ALTER TABLE public.movimientos_caja
  DROP COLUMN IF EXISTS id_plantilla_origen,
  DROP COLUMN IF EXISTS id_venta,
  DROP COLUMN IF EXISTS id_lote_produccion,
  DROP COLUMN IF EXISTS snapshot_tipo_nombre,
  DROP COLUMN IF EXISTS moneda;

ALTER TABLE public.cuentas_financieras DROP COLUMN IF EXISTS moneda;
