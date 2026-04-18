-- 20260418_03_plantillas_recurrentes.sql
-- Fase 1 — Plantillas de eventos económicos periódicos con idempotencia.

CREATE TABLE IF NOT EXISTS public.plantillas_recurrentes (
  id_plantilla serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  id_tipo integer NOT NULL REFERENCES public.tipos_movimiento_caja(id_tipo),
  id_ubicacion integer REFERENCES public.ubicaciones(id_ubicacion),
  id_cuenta_contable integer REFERENCES public.plan_cuentas(id_cuenta_contable),
  id_cuenta_financiera_default integer REFERENCES public.cuentas_financieras(id_cuenta),
  direccion text,
  monto_estimado numeric(14,2),
  frecuencia text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','unico')),
  dia_referencia integer,
  comportamientos text[] NOT NULL DEFAULT '{}',
  id_plantilla_objetivo integer REFERENCES public.plantillas_recurrentes(id_plantilla),
  tarifa_por_unidad numeric(14,2),
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','pausada','archivada')),
  activo boolean NOT NULL DEFAULT true,
  datos_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_recurrentes_codigo_ci
  ON public.plantillas_recurrentes (lower(codigo));
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_ubicacion
  ON public.plantillas_recurrentes(id_ubicacion) WHERE id_ubicacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_tipo
  ON public.plantillas_recurrentes(id_tipo);
CREATE INDEX IF NOT EXISTS idx_plantillas_recurrentes_estado
  ON public.plantillas_recurrentes(estado) WHERE activo = true;

CREATE TABLE IF NOT EXISTS public.plantilla_ejecuciones (
  id_ejecucion serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  periodo text NOT NULL,
  fecha_generada timestamptz NOT NULL DEFAULT now(),
  id_movimiento integer REFERENCES public.movimientos_caja(id_movimiento),
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  UNIQUE (id_plantilla, periodo)
);

CREATE INDEX IF NOT EXISTS idx_plantilla_ejecuciones_plantilla_periodo
  ON public.plantilla_ejecuciones(id_plantilla, periodo);
