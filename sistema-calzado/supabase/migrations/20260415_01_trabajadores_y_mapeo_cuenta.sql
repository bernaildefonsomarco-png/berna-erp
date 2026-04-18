-- ============================================================================
-- Migración: Trabajadores + Mapeo Categoría→Cuenta Contable
-- Expande personas_tienda para gestión ERP de nómina.
-- Agrega tabla de mapeo para auto-asignación de cuenta contable en costos.
-- ============================================================================

-- ── 1. Expandir personas_tienda ──────────────────────────────────────────────

ALTER TABLE public.personas_tienda
  ADD COLUMN IF NOT EXISTS tipo_contrato text DEFAULT 'fijo'
    CHECK (tipo_contrato IN ('fijo', 'destajo', 'mixto')),
  ADD COLUMN IF NOT EXISTS area text DEFAULT 'tienda'
    CHECK (area IN ('taller', 'tienda', 'administracion')),
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS salario_base numeric,
  ADD COLUMN IF NOT EXISTS frecuencia_pago text DEFAULT 'mensual'
    CHECK (frecuencia_pago IN ('semanal', 'quincenal', 'mensual')),
  ADD COLUMN IF NOT EXISTS fecha_ingreso date,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS notas_trabajador text;

-- Ajustar rol de personas existentes según area
UPDATE public.personas_tienda
  SET area = 'administracion', tipo_contrato = 'fijo'
  WHERE rol = 'admin' AND area = 'tienda';

-- ── 2. Tabla de mapeo categoría → cuenta contable ────────────────────────────

CREATE TABLE IF NOT EXISTS public.mapeo_categoria_cuenta (
  id serial PRIMARY KEY,
  categoria_costo text NOT NULL,
  ubicacion_rol text,        -- 'Tienda', 'Fabrica', NULL = aplica a todos
  id_cuenta_contable integer REFERENCES public.plan_cuentas(id_cuenta_contable),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice para búsqueda rápida por categoría
CREATE INDEX IF NOT EXISTS idx_mapeo_categoria ON public.mapeo_categoria_cuenta(categoria_costo, activo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapeo_categoria_cuenta TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mapeo_categoria_cuenta_id_seq TO anon, authenticated;

-- ── 3. Vista v_nomina_resumen ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_nomina_resumen AS
SELECT
  p.id_persona,
  p.nombre,
  p.cargo,
  p.area,
  p.tipo_contrato,
  p.salario_base,
  p.frecuencia_pago,
  p.activa,
  p.fecha_ingreso,
  p.telefono,
  p.notas_trabajador,
  p.rol,
  p.id_ubicacion_preferida,
  cf.id_costo,
  cf.monto_estimado,
  cf.es_por_unidad,
  cf.tarifa_por_unidad,
  cf.unidad,
  COALESCE(SUM(m.monto), 0) AS total_pagado_mes,
  COUNT(m.id_movimiento)::integer AS pagos_mes
FROM public.personas_tienda p
LEFT JOIN public.costos_fijos cf
  ON cf.id_responsable = p.id_persona
  AND cf.categoria = 'salario'
  AND cf.activo = true
LEFT JOIN public.movimientos_caja m
  ON m.id_costo_fijo = cf.id_costo
  AND m.fecha_movimiento >= date_trunc('month', CURRENT_DATE)
GROUP BY
  p.id_persona, p.nombre, p.cargo, p.area, p.tipo_contrato,
  p.salario_base, p.frecuencia_pago, p.activa, p.fecha_ingreso,
  p.telefono, p.notas_trabajador, p.rol, p.id_ubicacion_preferida,
  cf.id_costo, cf.monto_estimado, cf.es_por_unidad,
  cf.tarifa_por_unidad, cf.unidad;

GRANT SELECT ON public.v_nomina_resumen TO anon, authenticated;
