-- 20260418_09_fn_resolver_cuenta_contable.sql
-- Fase 1 — Cascada de resolución de cuenta contable.

CREATE OR REPLACE FUNCTION public.fn_resolver_cuenta_contable(
  p_id_tipo integer,
  p_id_ubicacion integer DEFAULT NULL,
  p_id_plantilla_origen integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_rol text;
  v_id_cuenta integer;
BEGIN
  -- 1. Plantilla override
  IF p_id_plantilla_origen IS NOT NULL THEN
    SELECT id_cuenta_contable INTO v_id_cuenta
    FROM public.plantillas_recurrentes WHERE id_plantilla = p_id_plantilla_origen;
    IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;
  END IF;

  -- Obtener rol de la ubicación
  IF p_id_ubicacion IS NOT NULL THEN
    SELECT rol INTO v_rol FROM public.ubicaciones WHERE id_ubicacion = p_id_ubicacion;
  END IF;

  -- 2. mapeo por (id_tipo, rol)
  IF v_rol IS NOT NULL THEN
    SELECT id_cuenta_contable INTO v_id_cuenta
    FROM public.mapeo_tipo_cuenta
    WHERE id_tipo = p_id_tipo AND ubicacion_rol = v_rol AND activo = true
    LIMIT 1;
    IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;
  END IF;

  -- 3. mapeo wildcard (id_tipo, '*')
  SELECT id_cuenta_contable INTO v_id_cuenta
  FROM public.mapeo_tipo_cuenta
  WHERE id_tipo = p_id_tipo AND ubicacion_rol = '*' AND activo = true
  LIMIT 1;
  IF v_id_cuenta IS NOT NULL THEN RETURN v_id_cuenta; END IF;

  -- 4. default del tipo
  SELECT id_cuenta_contable_default INTO v_id_cuenta
  FROM public.tipos_movimiento_caja WHERE id_tipo = p_id_tipo;

  RETURN v_id_cuenta;  -- puede ser NULL → QuickEntry pedirá al usuario
END $$;
