-- 20260419_04_fn_reabrir_periodo.sql
-- Fase 1.5 — Reapertura de un período cerrado. Requiere motivo y nivel admin.

CREATE OR REPLACE FUNCTION public.fn_reabrir_periodo(
  p_id_periodo integer,
  p_motivo     text,
  p_id_persona integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_estado text;
  v_nivel  text;
BEGIN
  -- Verificar permiso admin
  SELECT nivel_acceso INTO v_nivel
    FROM public.permisos_persona
   WHERE id_persona = p_id_persona
     AND recurso = 'cierres'
     AND activo;

  IF v_nivel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'SIN_PERMISO: se requiere nivel admin en recurso cierres';
  END IF;

  -- Verificar motivo obligatorio
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO: la reapertura requiere un motivo';
  END IF;

  -- Verificar estado actual
  SELECT estado INTO v_estado
    FROM public.periodos_contables
   WHERE id_periodo = p_id_periodo
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIODO_NO_ENCONTRADO: id=%', p_id_periodo;
  END IF;

  IF v_estado = 'abierto' THEN
    RAISE EXCEPTION 'PERIODO_YA_ABIERTO: el período ya está abierto';
  END IF;

  -- Reabrir y registrar motivo
  UPDATE public.periodos_contables
     SET estado            = 'abierto',
         motivo_reapertura = p_motivo,
         cerrado_por       = NULL,
         cerrado_en        = NULL
   WHERE id_periodo = p_id_periodo;

  -- El trigger trg_audit_generico (Fase 1) registra el UPDATE en audit_log automáticamente
END $$;
