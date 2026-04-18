-- 20260418_11_fn_generar_desde_plantilla.sql
-- Fase 1 — Generación idempotente de movimientos desde plantillas recurrentes.

CREATE OR REPLACE FUNCTION public.fn_generar_movimiento_desde_plantilla(
  p_id_plantilla integer,
  p_periodo text,
  p_monto numeric DEFAULT NULL,
  p_id_cuenta_financiera integer DEFAULT NULL,
  p_id_persona_actor integer DEFAULT NULL,
  p_concepto text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_id_ejecucion integer;
  v_id_movimiento integer;
  v_plantilla record;
  v_monto_final numeric(14,2);
  v_cuenta_final integer;
BEGIN
  -- Reserva idempotente (INSERT fallará silenciosamente si ya existe)
  INSERT INTO public.plantilla_ejecuciones(id_plantilla, periodo, id_persona_actor, notas)
  VALUES (p_id_plantilla, p_periodo, p_id_persona_actor, p_concepto)
  ON CONFLICT (id_plantilla, periodo) DO NOTHING
  RETURNING id_ejecucion INTO v_id_ejecucion;

  -- Si el INSERT no devolvió id, significa que ya existía
  IF v_id_ejecucion IS NULL THEN
    SELECT id_movimiento INTO v_id_movimiento
    FROM public.plantilla_ejecuciones
    WHERE id_plantilla = p_id_plantilla AND periodo = p_periodo;
    RETURN v_id_movimiento;  -- idempotente: devuelve el movimiento existente
  END IF;

  -- Cargar plantilla
  SELECT * INTO v_plantilla FROM public.plantillas_recurrentes
  WHERE id_plantilla = p_id_plantilla AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLANTILLA_INACTIVA_O_INEXISTENTE: id=%', p_id_plantilla;
  END IF;

  v_monto_final := COALESCE(p_monto, v_plantilla.monto_estimado);
  v_cuenta_final := COALESCE(p_id_cuenta_financiera, v_plantilla.id_cuenta_financiera_default);

  -- Registrar el hecho económico
  v_id_movimiento := public.fn_registrar_hecho_economico(
    p_id_tipo := v_plantilla.id_tipo,
    p_monto := v_monto_final,
    p_id_ubicacion := v_plantilla.id_ubicacion,
    p_id_cuenta_financiera := v_cuenta_final,
    p_id_plantilla_origen := p_id_plantilla,
    p_concepto := COALESCE(p_concepto, v_plantilla.nombre || ' — ' || p_periodo)
  );

  -- Actualizar ejecución con id_movimiento
  UPDATE public.plantilla_ejecuciones
  SET id_movimiento = v_id_movimiento
  WHERE id_ejecucion = v_id_ejecucion;

  RETURN v_id_movimiento;
END $$;
