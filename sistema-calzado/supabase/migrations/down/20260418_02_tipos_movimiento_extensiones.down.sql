-- down/20260418_02_tipos_movimiento_extensiones.down.sql
DROP INDEX IF EXISTS idx_tipos_movimiento_caja_scope;

ALTER TABLE public.tipos_movimiento_caja
  DROP COLUMN IF EXISTS direccion,
  DROP COLUMN IF EXISTS id_cuenta_contable_default,
  DROP COLUMN IF EXISTS id_cuenta_financiera_default,
  DROP COLUMN IF EXISTS id_cuenta_origen_default,
  DROP COLUMN IF EXISTS id_cuenta_destino_default,
  DROP COLUMN IF EXISTS scope,
  DROP COLUMN IF EXISTS comportamientos,
  DROP COLUMN IF EXISTS campos_requeridos,
  DROP COLUMN IF EXISTS afecta_patrimonio,
  DROP COLUMN IF EXISTS color_hex,
  DROP COLUMN IF EXISTS solo_admin,
  DROP COLUMN IF EXISTS naturaleza,
  DROP COLUMN IF EXISTS moneda;
