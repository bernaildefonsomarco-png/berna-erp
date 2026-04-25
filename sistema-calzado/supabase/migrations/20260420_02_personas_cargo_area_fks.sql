-- ============================================================================
-- Fase 2.02 — personas_tienda: FKs id_cargo + id_area
-- Reemplaza progresivamente columnas text libres 'cargo' y 'area' por FKs.
-- Las columnas viejas se mantienen marcadas DEPRECATED (no se dropean).
-- ============================================================================

ALTER TABLE public.personas_tienda
    ADD COLUMN IF NOT EXISTS id_cargo integer REFERENCES public.cargos(id_cargo),
    ADD COLUMN IF NOT EXISTS id_area  integer REFERENCES public.areas(id_area);

-- Poblar id_area desde columna text area (match por codigo)
UPDATE public.personas_tienda p
SET id_area = a.id_area
FROM public.areas a
WHERE p.id_area IS NULL
  AND lower(coalesce(p.area,'')) = a.codigo;

-- Poblar id_cargo por match codigo OR nombre (case-insensitive)
UPDATE public.personas_tienda p
SET id_cargo = c.id_cargo
FROM public.cargos c
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND trim(p.cargo) <> ''
  AND (
    regexp_replace(lower(p.cargo), '[^a-z0-9]+', '_', 'g') = c.codigo
    OR lower(p.cargo) = lower(c.nombre)
  );

-- Insertar cargos nuevos para strings libres sin match (preserva datos)
INSERT INTO public.cargos (codigo, nombre, activo, orden)
SELECT
    regexp_replace(lower(trim(p.cargo)), '[^a-z0-9]+', '_', 'g') AS codigo,
    trim(p.cargo) AS nombre,
    true,
    200
FROM public.personas_tienda p
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND trim(p.cargo) <> ''
GROUP BY trim(p.cargo)
ON CONFLICT (codigo) DO NOTHING;

-- Re-poblar id_cargo con los recién insertados
UPDATE public.personas_tienda p
SET id_cargo = c.id_cargo
FROM public.cargos c
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND regexp_replace(lower(trim(p.cargo)), '[^a-z0-9]+', '_', 'g') = c.codigo;

CREATE INDEX IF NOT EXISTS idx_personas_id_cargo ON public.personas_tienda(id_cargo);
CREATE INDEX IF NOT EXISTS idx_personas_id_area  ON public.personas_tienda(id_area);

COMMENT ON COLUMN public.personas_tienda.cargo IS
  'DEPRECATED (Fase 2): usar id_cargo FK → cargos. Mantenido para retrocompatibilidad.';
COMMENT ON COLUMN public.personas_tienda.area IS
  'DEPRECATED (Fase 2): usar id_area FK → areas. Mantenido para retrocompatibilidad.';
