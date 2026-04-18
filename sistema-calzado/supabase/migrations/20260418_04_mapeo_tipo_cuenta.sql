-- 20260418_04_mapeo_tipo_cuenta.sql
-- Fase 1 — Mapeo tipo de movimiento × rol de ubicación → cuenta contable.

CREATE TABLE IF NOT EXISTS public.mapeo_tipo_cuenta (
  id_mapeo serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  ubicacion_rol text NOT NULL,
  id_cuenta_contable integer NOT NULL REFERENCES public.plan_cuentas(id_cuenta_contable),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (id_tipo, ubicacion_rol)
);

CREATE INDEX IF NOT EXISTS idx_mapeo_tipo_cuenta_tipo
  ON public.mapeo_tipo_cuenta(id_tipo);
