-- 20260418_16_fixes_post_fase1.sql
-- Post-Fase 1 fixes:
--   1. Agregar p_id_caja a fn_registrar_hecho_economico para linkar movimientos desde POS.
--   2. Crear v_comando_cuentas como alias de v_rapido_cuentas (renombre sin romper legacy).

-- ── 1. fn_registrar_hecho_economico + p_id_caja ──────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_registrar_hecho_economico(
  p_id_tipo                integer,
  p_monto                  numeric,
  p_id_ubicacion           integer       DEFAULT NULL,
  p_id_cuenta_financiera   integer       DEFAULT NULL,
  p_splits                 jsonb         DEFAULT NULL,
  p_id_caja                integer       DEFAULT NULL,
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
  IF p_id_cuenta_financiera IS NOT NULL THEN
    PERFORM 1 FROM public.cuentas_financieras
     WHERE id_cuenta = p_id_cuenta_financiera FOR UPDATE;
  END IF;

  v_id_cuenta_contable := public.fn_resolver_cuenta_contable(
    p_id_tipo,
    p_id_ubicacion,
    p_id_plantilla_origen
  );

  INSERT INTO public.movimientos_caja(
    id_tipo,
    id_ubicacion,
    id_cuenta_financiera,
    id_cuenta_contable,
    id_caja,
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
    p_id_caja,
    p_monto,
    COALESCE(p_concepto, ''),
    COALESCE(p_datos_extra, '{}'::jsonb),
    p_fecha,
    p_id_plantilla_origen,
    p_id_venta,
    p_id_lote_produccion,
    (p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0)
  ) RETURNING id_movimiento INTO v_id_movimiento;

  IF p_splits IS NOT NULL AND jsonb_array_length(p_splits) > 0 THEN
    PERFORM public.fn_aplicar_splits(v_id_movimiento, p_splits);
  END IF;

  RETURN v_id_movimiento;
END $$;

-- ── 2. v_comando_cuentas (alias de v_rapido_cuentas) ─────────────────────────

CREATE OR REPLACE VIEW public.v_comando_cuentas AS
SELECT
  cf.id_cuenta,
  cf.codigo,
  cf.nombre,
  cf.alias,
  cf.tipo_cuenta,
  cf.saldo_actual,
  cf.moneda,
  cf.es_cuenta_personal,
  cf.id_ubicacion,
  u.nombre AS ubicacion_nombre,
  cf.orden_display
FROM public.cuentas_financieras cf
LEFT JOIN public.ubicaciones u ON u.id_ubicacion = cf.id_ubicacion
WHERE cf.activa = true
ORDER BY cf.orden_display, cf.nombre;

GRANT SELECT ON public.v_comando_cuentas TO anon, authenticated;
