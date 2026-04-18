-- 20260418_08_triggers_integridad.sql
-- Fase 1 — Triggers: suma de splits, snapshot de nombre, audit genérico.

-- ── Audit genérico (requiere GUC app.id_persona_actor opcional) ─────────────
CREATE OR REPLACE FUNCTION public.fn_audit_generico() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor integer;
  v_id text;
BEGIN
  BEGIN
    v_actor := current_setting('app.id_persona_actor', true)::integer;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  -- determinar PK textual
  IF TG_TABLE_NAME = 'movimientos_caja' THEN
    v_id := COALESCE((NEW).id_movimiento::text, (OLD).id_movimiento::text);
  ELSIF TG_TABLE_NAME = 'movimiento_splits' THEN
    v_id := COALESCE((NEW).id_split::text, (OLD).id_split::text);
  ELSIF TG_TABLE_NAME = 'transferencias_internas' THEN
    v_id := COALESCE((NEW).id_transferencia::text, (OLD).id_transferencia::text);
  ELSIF TG_TABLE_NAME = 'costos_fijos' THEN
    v_id := COALESCE((NEW).id_costo::text, (OLD).id_costo::text);
  ELSE
    v_id := '?';
  END IF;

  INSERT INTO public.audit_log(tabla, id_registro, accion, datos_antes, datos_despues, id_persona_actor)
  VALUES (
    TG_TABLE_NAME, v_id, lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    v_actor
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_movimientos_caja ON public.movimientos_caja;
CREATE TRIGGER trg_audit_movimientos_caja
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_movimiento_splits ON public.movimiento_splits;
CREATE TRIGGER trg_audit_movimiento_splits
  AFTER INSERT OR UPDATE OR DELETE ON public.movimiento_splits
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_transferencias ON public.transferencias_internas;
CREATE TRIGGER trg_audit_transferencias
  AFTER INSERT OR UPDATE OR DELETE ON public.transferencias_internas
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

DROP TRIGGER IF EXISTS trg_audit_costos_fijos ON public.costos_fijos;
CREATE TRIGGER trg_audit_costos_fijos
  AFTER INSERT OR UPDATE OR DELETE ON public.costos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_generico();

-- ── Snapshot del nombre del tipo al insertar ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_snapshot_tipo_nombre() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id_tipo IS NOT NULL AND NEW.snapshot_tipo_nombre IS NULL THEN
    SELECT nombre INTO NEW.snapshot_tipo_nombre
    FROM public.tipos_movimiento_caja WHERE id_tipo = NEW.id_tipo;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_snapshot_tipo_nombre ON public.movimientos_caja;
CREATE TRIGGER trg_snapshot_tipo_nombre
  BEFORE INSERT ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.fn_snapshot_tipo_nombre();

-- ── Integridad de splits (suma == total) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validar_suma_splits() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_id integer := COALESCE(NEW.id_movimiento, OLD.id_movimiento);
  v_total numeric(14,2);
  v_suma numeric(14,2);
BEGIN
  SELECT monto INTO v_total FROM public.movimientos_caja WHERE id_movimiento = v_id;
  SELECT COALESCE(SUM(monto),0) INTO v_suma FROM public.movimiento_splits WHERE id_movimiento = v_id;
  -- si no hay splits, no validamos (movimiento simple)
  IF (SELECT count(*) FROM public.movimiento_splits WHERE id_movimiento = v_id) = 0 THEN
    RETURN NULL;
  END IF;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'SPLIT_DESBALANCEADO: suma=% total=% (mov=%)', v_suma, v_total, v_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_validar_suma_splits ON public.movimiento_splits;
CREATE CONSTRAINT TRIGGER trg_validar_suma_splits
  AFTER INSERT OR UPDATE OR DELETE ON public.movimiento_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_suma_splits();
