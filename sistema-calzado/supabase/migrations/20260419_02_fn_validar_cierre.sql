-- 20260419_02_fn_validar_cierre.sql
-- Fase 1.5 — Retorna checklist de salud para un período dado.
-- Hace queries directas con filtro de fecha (no usa v_sistema_salud que es global).

CREATE OR REPLACE FUNCTION public.fn_validar_cierre(
  p_year  integer,
  p_month integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_fecha_inicio  timestamptz;
  v_fecha_fin     timestamptz;
  v_sin_tipo      integer;
  v_sin_cuenta    integer;
  v_splits_malos  integer;
  v_plantillas    integer;
  v_saldos_neg    integer;
  v_warnings      jsonb := '[]'::jsonb;
BEGIN
  v_fecha_inicio := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'America/Lima');
  v_fecha_fin    := v_fecha_inicio + interval '1 month' - interval '1 second';

  -- Movimientos sin tipo en el período
  SELECT count(*) INTO v_sin_tipo
    FROM public.movimientos_caja
   WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
     AND id_tipo IS NULL;

  -- Movimientos sin cuenta contable en el período
  SELECT count(*) INTO v_sin_cuenta
    FROM public.movimientos_caja
   WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
     AND id_cuenta_contable IS NULL;

  -- Splits cuya suma difiere del monto del movimiento padre
  SELECT count(*) INTO v_splits_malos
    FROM (
      SELECT s.id_movimiento
        FROM public.movimiento_splits s
        JOIN public.movimientos_caja m ON m.id_movimiento = s.id_movimiento
       WHERE m.fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
       GROUP BY s.id_movimiento, m.monto
      HAVING abs(SUM(s.monto) - m.monto) > 0.001
    ) sq;

  -- Plantillas mensuales que no se ejecutaron en este período
  SELECT count(*) INTO v_plantillas
    FROM public.plantillas_recurrentes p
   WHERE p.activo
     AND p.frecuencia = 'mensual'
     AND NOT EXISTS (
           SELECT 1 FROM public.plantilla_ejecuciones e
            WHERE e.id_plantilla = p.id_plantilla
              AND e.periodo = to_char(v_fecha_inicio, 'YYYY-MM')
         );

  -- Cuentas financieras con saldo negativo (warning global, no por período)
  SELECT count(*) INTO v_saldos_neg
    FROM public.cuentas_financieras
   WHERE saldo_actual < 0;

  -- Armar lista de warnings
  IF v_plantillas > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(
      v_plantillas::text || ' plantilla(s) mensual(es) no ejecutada(s) en este período'
    );
  END IF;
  IF v_saldos_neg > 0 THEN
    v_warnings := v_warnings || jsonb_build_array(
      v_saldos_neg::text || ' cuenta(s) financiera(s) con saldo negativo'
    );
  END IF;

  RETURN jsonb_build_object(
    'movimientos_sin_tipo',            v_sin_tipo,
    'movimientos_sin_cuenta_contable', v_sin_cuenta,
    'splits_desbalanceados',           v_splits_malos,
    'plantillas_mensuales_pendientes', v_plantillas,
    'cuentas_con_saldo_negativo',      v_saldos_neg,
    'bloqueante',                      (v_sin_tipo > 0 OR v_sin_cuenta > 0 OR v_splits_malos > 0),
    'warnings',                        v_warnings
  );
END $$;
