-- 20260418_07_auditoria_eventos.sql
-- Fase 1 — Audit trail: eventos de catálogo + log genérico transaccional.

CREATE TABLE IF NOT EXISTS public.tipo_eventos (
  id_evento serial PRIMARY KEY,
  id_tipo integer NOT NULL
    REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tipo_eventos_tipo_fecha
  ON public.tipo_eventos(id_tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plantilla_eventos (
  id_evento serial PRIMARY KEY,
  id_plantilla integer NOT NULL
    REFERENCES public.plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plantilla_eventos_plantilla_fecha
  ON public.plantilla_eventos(id_plantilla, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id_audit bigserial PRIMARY KEY,
  tabla text NOT NULL,
  id_registro text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('insert','update','delete')),
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES public.personas_tienda(id_persona),
  ip_origen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabla_reg
  ON public.audit_log(tabla, id_registro, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log(id_persona_actor, created_at DESC);

-- Inmutabilidad
CREATE OR REPLACE FUNCTION public.fn_bloquear_modificacion_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_INMUTABLE: registros de auditoría no pueden modificarse';
END $$;

DROP TRIGGER IF EXISTS trg_audit_log_inmutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_inmutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();

DROP TRIGGER IF EXISTS trg_tipo_eventos_inmutable ON public.tipo_eventos;
CREATE TRIGGER trg_tipo_eventos_inmutable
  BEFORE UPDATE OR DELETE ON public.tipo_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();

DROP TRIGGER IF EXISTS trg_plantilla_eventos_inmutable ON public.plantilla_eventos;
CREATE TRIGGER trg_plantilla_eventos_inmutable
  BEFORE UPDATE OR DELETE ON public.plantilla_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_modificacion_audit();
