-- 20260419_03_fn_cerrar_periodo.sql
-- Fase 1.5 — Cierre atómico de período con lock pesimista y verificación de permiso admin.

CREATE OR REPLACE FUNCTION public.fn_cerrar_periodo(
  p_year            integer,
  p_month           integer,
  p_id_persona      integer,
  p_hash_sha256     text,
  p_url_storage     text,
  p_snapshot_kpis   jsonb,
  p_checklist_salud jsonb,
  p_bytes_pdf       integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id_periodo  integer;
  v_estado      text;
  v_version     integer;
  v_id_cierre   integer;
  v_nivel       text;
BEGIN
  -- Verificar que el usuario tiene nivel admin en recurso 'cierres'
  SELECT nivel_acceso INTO v_nivel
    FROM public.permisos_persona
   WHERE id_persona = p_id_persona
     AND recurso = 'cierres'
     AND activo;

  IF v_nivel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'SIN_PERMISO: se requiere nivel admin en recurso cierres';
  END IF;

  -- Obtener id_periodo con lock pesimista (falla rápido si otro admin ya tiene el lock)
  SELECT id_periodo, estado INTO v_id_periodo, v_estado
    FROM public.periodos_contables
   WHERE year = p_year AND month = p_month
   FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIODO_NO_ENCONTRADO: año=% mes=%', p_year, p_month;
  END IF;

  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'PERIODO_YA_CERRADO: el período %/% ya está cerrado', p_year, p_month;
  END IF;

  -- Determinar versión (1 si es el primer cierre, N+1 si es re-cierre tras reapertura)
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.cierres_periodo
   WHERE id_periodo = v_id_periodo;

  -- Insertar registro de cierre
  INSERT INTO public.cierres_periodo(
    id_periodo, version, id_persona_cerro,
    hash_sha256, url_storage, snapshot_kpis, checklist_salud, bytes_pdf
  ) VALUES (
    v_id_periodo, v_version, p_id_persona,
    p_hash_sha256, p_url_storage, p_snapshot_kpis, p_checklist_salud, p_bytes_pdf
  ) RETURNING id_cierre INTO v_id_cierre;

  -- Marcar período como cerrado
  UPDATE public.periodos_contables
     SET estado      = 'cerrado',
         cerrado_por = p_id_persona,
         cerrado_en  = now()
   WHERE id_periodo = v_id_periodo;

  RETURN jsonb_build_object(
    'ok',        true,
    'id_cierre', v_id_cierre,
    'version',   v_version
  );
END $$;
