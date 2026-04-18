-- 20260418_10_fn_registrar_hecho_economico.sql
-- Fase 1 — Punto único de entrada para registrar movimientos económicos.

CREATE OR REPLACE FUNCTION public.fn_aplicar_splits(
  p_id_movimiento integer,
  p_splits jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  v_id_origen integer;
  v_monto numeric(14,2);
  v_es_prestamo boolean;
  v_id_caja_destino integer;
  v_concepto text;
BEGIN
  -- Obtener cuenta financiera destino y concepto del movimiento padre (para préstamos)
  SELECT id_cuenta_financiera, concepto
    INTO v_id_caja_destino, v_concepto
    FROM public.movimientos_caja
   WHERE id_movimiento = p_id_movimiento;

  FOR r IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_id_origen   := (r->>'id_cuenta')::integer;
    v_monto       := (r->>'monto')::numeric;
    v_es_prestamo := COALESCE((r->>'es_prestamo')::boolean, false);

    -- Lock cuenta origen para serializar escrituras concurrentes
    PERFORM 1 FROM public.cuentas_financieras
     WHERE id_cuenta = v_id_origen FOR UPDATE;

    -- Insertar split (id_cuenta referencia cuentas_financieras(id_cuenta))
    INSERT INTO public.movimiento_splits(id_movimiento, id_cuenta, monto)
    VALUES (p_id_movimiento, v_id_origen, v_monto);

    -- Si el split es un préstamo interno y la cuenta origen difiere de la destino,
    -- generar transferencia compensatoria de tipo prestamo_interno
    IF v_es_prestamo
       AND v_id_caja_destino IS NOT NULL
       AND v_id_origen <> v_id_caja_destino
    THEN
      INSERT INTO public.transferencias_internas(
        id_cuenta_origen,
        id_cuenta_destino,
        monto,
        concepto,
        motivo,
        fecha
      ) VALUES (
        v_id_origen,
        v_id_caja_destino,
        v_monto,
        'Préstamo auto-generado desde movimiento #' || p_id_movimiento
          || COALESCE(' (' || v_concepto || ')', ''),
        'prestamo_interno',
        now()
      );
    END IF;
  END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.fn_registrar_hecho_economico(
  p_id_tipo                integer,
  p_monto                  numeric,
  p_id_ubicacion           integer       DEFAULT NULL,
  p_id_cuenta_financiera   integer       DEFAULT NULL,
  p_splits                 jsonb         DEFAULT NULL,
  p_id_plantilla_origen    integer       DEFAULT NULL,
  p_id_venta               integer       DEFAULT NULL,
  p_id_lote_produccion     integer       DEFAULT NULL,
  p_concepto               text          DEFAULT NULL,
  p_datos_extra            jsonb         DEFAULT '{}'::jsonb,
  p_fecha                  timestamptz   DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_id_cuenta_contable integer;
  v_id_movimiento      integer;
BEGIN
  -- Lock de cuenta financiera principal para serializar escrituras concurrentes
  IF p_id_cuenta_financiera IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_financieras
     WHERE id_cuenta = p_id_cuenta_financiera FOR UPDATE;
  END IF;

  -- Resolver cuenta contable mediante cascada (plantilla → mapeo rol → mapeo wildcard → default tipo)
  v_id_cuenta_contable := public.fn_resolver_cuenta_contable(
    p_id_tipo,
    p_id_ubicacion,
    p_id_plantilla_origen
  );

  -- Insertar movimiento principal
  -- El trigger de snapshot (migration 08) llenará snapshot_tipo_nombre automáticamente
  INSERT INTO public.movimientos_caja(
    id_tipo,
    id_ubicacion,
    id_cuenta_financiera,
    id_cuenta_contable,
    monto,
    concepto,
    datos_extra,
    fecha_movimiento,
    id_plantilla_origen,
    id_venta,
    id_lote_produccion,
    tiene_splits
  ) VALUES (
    p_id_tipo,
    p_id_ubicacion,
    p_id_cuenta_financiera,
    v_id_cuenta_contable,
    p_monto,
    COALESCE(p_concepto, ''),
    COALESCE(p_datos_extra, '{}'::jsonb),
    p_fecha,
    p_id_plantilla_origen,
    p_id_venta,
    p_id_lote_produccion,
    (p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0)
  ) RETURNING id_movimiento INTO v_id_movimiento;

  -- Aplicar splits (incluye lógica de préstamo interno)
  IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    PERFORM public.fn_aplicar_splits(v_id_movimiento, p_splits);
  END IF;

  RETURN v_id_movimiento;
END $$;
