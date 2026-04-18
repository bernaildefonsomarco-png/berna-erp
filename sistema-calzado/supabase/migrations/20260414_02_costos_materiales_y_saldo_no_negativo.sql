-- ============================================================================
-- Bloque: costos de materiales por modelo + saldo no negativo en cuentas
-- ============================================================================

CREATE OR REPLACE VIEW public.v_costos_materiales_modelo AS
WITH series AS (
  SELECT unnest(ARRAY['Grande'::text, 'Mediana'::text, 'Pequeña'::text]) AS nombre_serie
)
SELECT
  p.id_producto,
  p.nombre_modelo,
  c.id_color,
  c.color,
  c.estado = 'Activo' AS color_activo,
  s.nombre_serie,
  COALESCE(SUM(((COALESCE(mm.cantidad_por_docena, 0) * COALESCE(mc.precio_unitario, 0)) / 12) * (1 + (COALESCE(mm.merma_pct, 0) / 100))), 0)::numeric AS costo_materiales
FROM public.productos p
JOIN public.colores_modelos c
  ON c.id_producto = p.id_producto
CROSS JOIN series s
LEFT JOIN public.materiales_modelo mm
  ON mm.id_producto = p.id_producto
 AND mm.nombre_serie = s.nombre_serie
 AND (mm.id_color IS NULL OR mm.id_color = c.id_color)
LEFT JOIN public.materiales_catalogo mc
  ON mc.id_material = mm.id_material
GROUP BY
  p.id_producto,
  p.nombre_modelo,
  c.id_color,
  c.color,
  c.estado,
  s.nombre_serie;

GRANT SELECT ON public.v_costos_materiales_modelo TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_validar_saldo_cuenta_no_negativo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo text := COALESCE(NEW.tipo_cuenta, OLD.tipo_cuenta);
  v_old numeric := COALESCE(OLD.saldo_actual, 0);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.saldo_actual, 0) < 0 AND v_tipo <> 'credito' THEN
      RAISE EXCEPTION 'Saldo insuficiente en %. Transfiere fondos primero.', COALESCE(NEW.nombre, 'esta cuenta');
    END IF;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.saldo_actual, 0) < 0
     AND v_tipo <> 'credito'
     AND COALESCE(NEW.saldo_actual, 0) < v_old THEN
    RAISE EXCEPTION 'Saldo insuficiente en %. Transfiere fondos primero.', COALESCE(NEW.nombre, OLD.nombre, 'esta cuenta');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_saldo_cuenta_no_negativo ON public.cuentas_financieras;
CREATE TRIGGER trg_validar_saldo_cuenta_no_negativo
BEFORE INSERT OR UPDATE OF saldo_actual, tipo_cuenta ON public.cuentas_financieras
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_saldo_cuenta_no_negativo();
