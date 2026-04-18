-- ============================================================================
-- Migración: cargos específicos para puestos adicionales
-- Guarda el detalle del puesto por cada área secundaria del trabajador.
-- Ejemplo: [{ "area": "taller", "cargo": "Ayudante" }]
-- ============================================================================

ALTER TABLE public.personas_tienda
  ADD COLUMN IF NOT EXISTS puestos_adicionales jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.personas_tienda.puestos_adicionales IS
  'Lista JSON de puestos secundarios. Ej: [{"area":"taller","cargo":"Ayudante"}]';
