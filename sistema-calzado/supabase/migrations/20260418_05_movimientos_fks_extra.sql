-- 20260418_05_movimientos_fks_extra.sql
-- Fase 1 — Trazabilidad de movimientos + snapshot + moneda.

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS id_plantilla_origen integer
    REFERENCES public.plantillas_recurrentes(id_plantilla),
  ADD COLUMN IF NOT EXISTS id_venta integer
    REFERENCES public.ventas(id_venta),
  ADD COLUMN IF NOT EXISTS id_lote_produccion integer
    REFERENCES public.lotes(id_lote),
  ADD COLUMN IF NOT EXISTS snapshot_tipo_nombre text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_movimientos_plantilla_origen
  ON public.movimientos_caja(id_plantilla_origen) WHERE id_plantilla_origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_venta
  ON public.movimientos_caja(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_lote
  ON public.movimientos_caja(id_lote_produccion) WHERE id_lote_produccion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimientos_ubicacion_fecha
  ON public.movimientos_caja(id_ubicacion, fecha_movimiento DESC);

ALTER TABLE public.cuentas_financieras
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';
