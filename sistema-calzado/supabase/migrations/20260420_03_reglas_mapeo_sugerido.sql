-- ============================================================================
-- Fase 2.03 — Reglas de mapeo sugerido (motor autosugerencia wizard de tipos)
-- Dado (categoria_macro, ubicacion_rol) → sugiere id_cuenta_contable.
-- ubicacion_rol acepta los valores reales de ubicaciones.rol ('Tienda','Fabrica')
-- + 'Administracion' conceptual (no FK) + '*' wildcard fallback.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reglas_mapeo_sugerido (
    id_regla                    serial PRIMARY KEY,
    categoria_macro             text NOT NULL CHECK (categoria_macro IN (
        'ingreso','gasto_operativo','pago_personas','inversion',
        'traslado','pago_deuda','compra_material'
    )),
    ubicacion_rol               text NOT NULL CHECK (ubicacion_rol IN ('*','Tienda','Fabrica','Administracion')),
    id_cuenta_contable_sugerida integer NOT NULL REFERENCES public.plan_cuentas(id_cuenta_contable),
    prioridad                   integer NOT NULL DEFAULT 100,
    activa                      boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (categoria_macro, ubicacion_rol)
);

CREATE INDEX IF NOT EXISTS idx_reglas_mapeo_lookup
  ON public.reglas_mapeo_sugerido(categoria_macro, ubicacion_rol)
  WHERE activa;

-- Seed de reglas base (wildcard por categoria_macro, leyendo seccion_pl real)
INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'ingreso', '*', pc.id_cuenta_contable, 10
FROM public.plan_cuentas pc
WHERE pc.seccion_pl = 'ingresos' AND pc.permite_movimientos AND pc.activa
ORDER BY pc.orden, pc.codigo LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'gasto_operativo', '*', pc.id_cuenta_contable, 50
FROM public.plan_cuentas pc
WHERE pc.seccion_pl = 'gastos_operativos' AND pc.permite_movimientos AND pc.activa
ORDER BY pc.orden, pc.codigo LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'pago_personas', '*', pc.id_cuenta_contable, 10
FROM public.plan_cuentas pc
WHERE pc.seccion_pl = 'gastos_personal' AND pc.permite_movimientos AND pc.activa
ORDER BY pc.orden, pc.codigo LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'inversion', '*', pc.id_cuenta_contable, 20
FROM public.plan_cuentas pc
WHERE pc.seccion_pl IN ('sin_impacto','gastos_operativos')
  AND pc.permite_movimientos AND pc.activa
ORDER BY
  CASE pc.seccion_pl WHEN 'sin_impacto' THEN 1 ELSE 2 END,
  pc.orden, pc.codigo
LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'traslado', '*', pc.id_cuenta_contable, 10
FROM public.plan_cuentas pc
WHERE pc.seccion_pl = 'sin_impacto' AND pc.permite_movimientos AND pc.activa
ORDER BY pc.orden, pc.codigo LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'pago_deuda', '*', pc.id_cuenta_contable, 10
FROM public.plan_cuentas pc
WHERE pc.seccion_pl = 'gastos_financieros' AND pc.permite_movimientos AND pc.activa
ORDER BY pc.orden, pc.codigo LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

INSERT INTO public.reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'compra_material', '*', pc.id_cuenta_contable, 10
FROM public.plan_cuentas pc
WHERE pc.seccion_pl IN ('costo_produccion','costo_ventas')
  AND pc.permite_movimientos AND pc.activa
ORDER BY
  CASE pc.seccion_pl WHEN 'costo_produccion' THEN 1 ELSE 2 END,
  pc.orden, pc.codigo
LIMIT 1
ON CONFLICT (categoria_macro, ubicacion_rol) DO NOTHING;

-- NOTA: el dev puede agregar reglas específicas por rol (Tienda, Fabrica,
-- Administracion) posterior al seed, con prioridad < 50 para que ganen al wildcard.

-- RPC autosugerencia
CREATE OR REPLACE FUNCTION public.fn_sugerir_cuenta_para_tipo(
    p_categoria_macro text,
    p_ubicacion_rol   text DEFAULT '*'
) RETURNS integer AS $$
DECLARE
    v_id integer;
BEGIN
    SELECT id_cuenta_contable_sugerida INTO v_id
    FROM public.reglas_mapeo_sugerido
    WHERE activa
      AND categoria_macro = p_categoria_macro
      AND ubicacion_rol = coalesce(p_ubicacion_rol, '*')
    ORDER BY prioridad ASC
    LIMIT 1;

    IF v_id IS NULL THEN
        SELECT id_cuenta_contable_sugerida INTO v_id
        FROM public.reglas_mapeo_sugerido
        WHERE activa
          AND categoria_macro = p_categoria_macro
          AND ubicacion_rol = '*'
        ORDER BY prioridad ASC
        LIMIT 1;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas_mapeo_sugerido TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.reglas_mapeo_sugerido_id_regla_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sugerir_cuenta_para_tipo(text, text) TO anon, authenticated;
