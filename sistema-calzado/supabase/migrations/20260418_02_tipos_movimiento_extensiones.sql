-- 20260418_02_tipos_movimiento_extensiones.sql
-- Fase 1 — Convertir tipos_movimiento_caja en motor de comportamiento.

ALTER TABLE public.tipos_movimiento_caja
  ADD COLUMN IF NOT EXISTS direccion text
    CHECK (direccion IN ('entrada','salida','transferencia')),
  ADD COLUMN IF NOT EXISTS id_cuenta_contable_default integer
    REFERENCES public.plan_cuentas(id_cuenta_contable),
  ADD COLUMN IF NOT EXISTS id_cuenta_financiera_default integer
    REFERENCES public.cuentas_financieras(id_cuenta),
  ADD COLUMN IF NOT EXISTS id_cuenta_origen_default integer
    REFERENCES public.cuentas_financieras(id_cuenta),
  ADD COLUMN IF NOT EXISTS id_cuenta_destino_default integer
    REFERENCES public.cuentas_financieras(id_cuenta),
  ADD COLUMN IF NOT EXISTS scope text[] NOT NULL DEFAULT '{manual}',
  ADD COLUMN IF NOT EXISTS comportamientos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS campos_requeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS afecta_patrimonio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS solo_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS naturaleza text,
  ADD COLUMN IF NOT EXISTS moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX IF NOT EXISTS idx_tipos_movimiento_caja_scope
  ON public.tipos_movimiento_caja USING gin (scope);
