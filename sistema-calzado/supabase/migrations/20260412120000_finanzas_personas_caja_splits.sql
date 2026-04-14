-- Personas: PIN hash (opcional), tienda preferida; splits: aporte por ubicación
ALTER TABLE public.personas_tienda
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS id_ubicacion_preferida integer REFERENCES public.ubicaciones (id_ubicacion);

COMMENT ON COLUMN public.personas_tienda.pin_hash IS 'bcrypt hash del PIN; si existe, la app valida contra hash. Columna pin puede coexistir durante migración.';
COMMENT ON COLUMN public.personas_tienda.id_ubicacion_preferida IS 'Tienda principal de la persona (vendedora, etc.)';

ALTER TABLE public.movimiento_splits
  ADD COLUMN IF NOT EXISTS id_ubicacion integer REFERENCES public.ubicaciones (id_ubicacion);

COMMENT ON COLUMN public.movimiento_splits.id_ubicacion IS 'Tienda que aporta este monto en un split (ej. gasto común entre tiendas).';

-- Acceso a Caja del POS: recurso ''caja'' con nivel ''ver'' (u otro nivel >= ver en la app)
INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT p.id_persona, 'caja', 'ver', true
FROM public.personas_tienda p
WHERE p.activa = true
  AND (
    lower(p.nombre) LIKE '%naty%'
    OR lower(p.nombre) LIKE '%yova%'
    OR lower(p.nombre) LIKE '%alina%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.permisos_persona pp
    WHERE pp.id_persona = p.id_persona
      AND pp.recurso = 'caja'
      AND pp.activo = true
  );

INSERT INTO public.configuracion_sistema (clave, valor)
VALUES
  ('finanzas_reglas_ritual', 'Definir en reunión: quién cierra caja, quién registra transferencias y pagos de deudas. Actualizar este texto en Finanzas → Ajustes.'),
  ('finanzas_cuentas_liquidez_lunes', '[]')
ON CONFLICT (clave) DO NOTHING;
