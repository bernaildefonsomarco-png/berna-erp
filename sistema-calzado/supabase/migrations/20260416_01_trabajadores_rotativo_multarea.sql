-- ============================================================================
-- Migración: Soporte rotativo y multi-área para trabajadores
-- - es_rotativo: vendedoras que pueden rotar entre tiendas (solo área 'tienda')
-- - areas_adicionales: áreas secundarias de un trabajador (multi-puesto)
-- ============================================================================

ALTER TABLE public.personas_tienda
  ADD COLUMN IF NOT EXISTS es_rotativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS areas_adicionales text[] DEFAULT '{}';

-- Índice para búsqueda de rotativos
CREATE INDEX IF NOT EXISTS idx_personas_rotativo ON public.personas_tienda(area, es_rotativo) WHERE activa = true;

COMMENT ON COLUMN public.personas_tienda.es_rotativo IS
  'Solo aplica para area=tienda. Si true, la vendedora puede trabajar en cualquier tienda (no está asignada a una fija).';
COMMENT ON COLUMN public.personas_tienda.areas_adicionales IS
  'Áreas adicionales donde trabaja además del área principal. Ej: {taller,tienda}';
