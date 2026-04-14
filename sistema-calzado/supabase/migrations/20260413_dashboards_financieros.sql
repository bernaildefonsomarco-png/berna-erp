-- ============================================================================
-- BLOQUE 4 · Dashboards Financieros
-- Vistas y funciones para P&L, Flujo de Caja y Patrimonio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VISTA · v_movimientos_clasificados
-- Une movimientos_caja con plan_cuentas para clasificar cada movimiento en
-- una sección del P&L. Resuelve splits cuando existen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_movimientos_clasificados AS
SELECT
    m.id_movimiento,
    m.fecha_movimiento,
    DATE(m.fecha_movimiento AT TIME ZONE 'America/Lima') AS fecha,
    TO_CHAR(m.fecha_movimiento AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
    m.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    m.tipo,
    m.monto,
    m.concepto,
    m.metodo,
    m.id_cuenta_financiera,
    m.id_cuenta_contable,
    pc.codigo  AS cuenta_codigo,
    pc.nombre  AS cuenta_nombre,
    pc.seccion_pl,
    pc.signo_pl,
    -- Monto firmado para sumas directas en P&L
    (m.monto * pc.signo_pl)::numeric AS monto_pl,
    m.id_persona,
    p.nombre AS persona_nombre,
    m.id_deuda,
    m.id_costo_fijo
FROM public.movimientos_caja m
LEFT JOIN public.plan_cuentas pc ON pc.id_cuenta_contable = m.id_cuenta_contable
LEFT JOIN public.ubicaciones   u ON u.id_ubicacion = m.id_ubicacion
LEFT JOIN public.personas_tienda p ON p.id_persona = m.id_persona
WHERE m.tiene_splits = false OR m.tiene_splits IS NULL;

-- ----------------------------------------------------------------------------
-- 2. VISTA · v_pl_mensual
-- P&L agregado por mes y sección. Incluye ventas (de tabla ventas) +
-- movimientos clasificados. Las ventas no viven en movimientos_caja, así que
-- las inyectamos como sección 'ingresos'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pl_mensual AS
WITH ventas_mes AS (
    SELECT
        TO_CHAR(v.fecha_hora AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
        v.id_ubicacion,
        'ingresos'::text AS seccion_pl,
        SUM(v.monto_total) AS monto
    FROM public.ventas v
    WHERE v.fecha_hora IS NOT NULL
    GROUP BY 1, 2
),
movs_mes AS (
    SELECT
        periodo_mes,
        id_ubicacion,
        seccion_pl,
        SUM(monto_pl) AS monto
    FROM public.v_movimientos_clasificados
    WHERE seccion_pl IS NOT NULL
      AND seccion_pl <> 'sin_impacto'
    GROUP BY 1, 2, 3
),
union_all AS (
    SELECT * FROM ventas_mes
    UNION ALL
    SELECT * FROM movs_mes
)
SELECT
    periodo_mes,
    id_ubicacion,
    seccion_pl,
    SUM(monto) AS monto_total
FROM union_all
GROUP BY 1, 2, 3
ORDER BY periodo_mes DESC, seccion_pl;

-- ----------------------------------------------------------------------------
-- 3. FUNCIÓN · fn_pl_resumen(fecha_inicio, fecha_fin)
-- Devuelve el P&L colapsado en un único registro por sección, con totales y
-- utilidad calculada. Lista para alimentar tarjetas + gráfico.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pl_resumen(
    p_fecha_inicio date,
    p_fecha_fin    date,
    p_id_ubicacion integer DEFAULT NULL
)
RETURNS TABLE (
    seccion_pl   text,
    monto_total  numeric
)
LANGUAGE sql STABLE AS $$
    WITH ventas_periodo AS (
        SELECT 'ingresos'::text AS seccion_pl, SUM(v.monto_total) AS monto
        FROM public.ventas v
        WHERE v.fecha_hora >= p_fecha_inicio
          AND v.fecha_hora <  (p_fecha_fin + 1)
          AND (p_id_ubicacion IS NULL OR v.id_ubicacion = p_id_ubicacion)
    ),
    movs_periodo AS (
        SELECT mc.seccion_pl, SUM(mc.monto_pl) AS monto
        FROM public.v_movimientos_clasificados mc
        WHERE mc.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
          AND mc.seccion_pl IS NOT NULL
          AND mc.seccion_pl <> 'sin_impacto'
          AND (p_id_ubicacion IS NULL OR mc.id_ubicacion = p_id_ubicacion)
        GROUP BY mc.seccion_pl
    )
    SELECT seccion_pl, COALESCE(SUM(monto), 0)::numeric AS monto_total
    FROM (
        SELECT * FROM ventas_periodo
        UNION ALL
        SELECT * FROM movs_periodo
    ) u
    WHERE seccion_pl IS NOT NULL
    GROUP BY seccion_pl
    ORDER BY seccion_pl;
$$;

-- ----------------------------------------------------------------------------
-- 4. VISTA · v_flujo_caja_diario
-- Ingresos / egresos / neto por día y por cuenta. Es la fuente del gráfico
-- de barras y de la tabla de movimientos del dashboard.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_flujo_caja_diario AS
SELECT
    DATE(m.fecha_movimiento AT TIME ZONE 'America/Lima') AS fecha,
    m.id_cuenta_financiera,
    cf.nombre AS cuenta_nombre,
    cf.tipo_cuenta,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE 0 END) AS ingresos,
    SUM(CASE WHEN m.tipo = 'egreso'  THEN m.monto ELSE 0 END) AS egresos,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS neto
FROM public.movimientos_caja m
LEFT JOIN public.cuentas_financieras cf ON cf.id_cuenta = m.id_cuenta_financiera
GROUP BY 1, 2, 3, 4
ORDER BY fecha DESC;

-- ----------------------------------------------------------------------------
-- 5. VISTA · v_flujo_caja_mensual
-- Igual que la diaria pero agrupada por mes. Para el gráfico anual.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_flujo_caja_mensual AS
SELECT
    TO_CHAR(m.fecha_movimiento AT TIME ZONE 'America/Lima', 'YYYY-MM') AS periodo_mes,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE 0 END) AS ingresos,
    SUM(CASE WHEN m.tipo = 'egreso'  THEN m.monto ELSE 0 END) AS egresos,
    SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS neto
FROM public.movimientos_caja m
GROUP BY 1
ORDER BY periodo_mes DESC;

-- ----------------------------------------------------------------------------
-- 6. VISTA · v_patrimonio_snapshot
-- Foto actual: activos (saldos cuentas), pasivos (saldos deudas), patrimonio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_patrimonio_snapshot AS
WITH activos AS (
    SELECT
        'activo'::text AS tipo,
        cf.id_cuenta AS id_ref,
        cf.nombre,
        cf.tipo_cuenta AS subtipo,
        cf.saldo_actual AS monto
    FROM public.cuentas_financieras cf
    WHERE cf.activa = true
),
pasivos AS (
    SELECT
        'pasivo'::text AS tipo,
        d.id_deuda AS id_ref,
        d.nombre,
        d.tipo_acreedor AS subtipo,
        d.saldo_actual AS monto
    FROM public.deudas d
    WHERE d.estado IN ('activa', 'en_mora', 'refinanciada')
)
SELECT * FROM activos
UNION ALL
SELECT * FROM pasivos;

-- ----------------------------------------------------------------------------
-- 7. FUNCIÓN · fn_patrimonio_totales()
-- Devuelve totales consolidados: activos, pasivos, patrimonio neto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_patrimonio_totales()
RETURNS TABLE (
    total_activos    numeric,
    total_pasivos    numeric,
    patrimonio_neto  numeric,
    cuentas_count    integer,
    deudas_count     integer
)
LANGUAGE sql STABLE AS $$
    SELECT
        COALESCE(SUM(CASE WHEN tipo = 'activo' THEN monto END), 0) AS total_activos,
        COALESCE(SUM(CASE WHEN tipo = 'pasivo' THEN monto END), 0) AS total_pasivos,
        COALESCE(SUM(CASE WHEN tipo = 'activo' THEN monto END), 0)
            - COALESCE(SUM(CASE WHEN tipo = 'pasivo' THEN monto END), 0) AS patrimonio_neto,
        COUNT(*) FILTER (WHERE tipo = 'activo')::int AS cuentas_count,
        COUNT(*) FILTER (WHERE tipo = 'pasivo')::int AS deudas_count
    FROM public.v_patrimonio_snapshot;
$$;

-- ----------------------------------------------------------------------------
-- 8. VISTA · v_obligaciones_proximas
-- Cuotas de deuda y costos fijos que vencen en los próximos 30 días.
-- Alimenta la "alerta de qué pagar esta semana".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_obligaciones_proximas AS
SELECT
    'deuda'::text AS tipo,
    d.id_deuda AS id_ref,
    d.nombre,
    d.acreedor AS detalle,
    d.cuota_monto AS monto,
    CASE
        WHEN d.dia_pago_mes IS NULL THEN NULL
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= d.dia_pago_mes
            THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                           EXTRACT(MONTH FROM CURRENT_DATE)::int,
                           d.dia_pago_mes)
        ELSE (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM CURRENT_DATE)::int,
                        d.dia_pago_mes) + INTERVAL '1 month')::date
    END AS fecha_proxima
FROM public.deudas d
WHERE d.estado = 'activa' AND d.cuota_monto IS NOT NULL

UNION ALL

SELECT
    'costo_fijo'::text AS tipo,
    cf.id_costo AS id_ref,
    cf.nombre,
    cf.proveedor AS detalle,
    cf.monto_estimado AS monto,
    CASE
        WHEN cf.dia_vencimiento_mes IS NULL THEN NULL
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= cf.dia_vencimiento_mes
            THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                           EXTRACT(MONTH FROM CURRENT_DATE)::int,
                           cf.dia_vencimiento_mes)
        ELSE (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                        EXTRACT(MONTH FROM CURRENT_DATE)::int,
                        cf.dia_vencimiento_mes) + INTERVAL '1 month')::date
    END AS fecha_proxima
FROM public.costos_fijos cf
WHERE cf.activo = true AND cf.frecuencia = 'mensual';

-- ----------------------------------------------------------------------------
-- 9. GRANTS · permitir lectura desde el cliente (anon/authenticated)
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.v_movimientos_clasificados TO anon, authenticated;
GRANT SELECT ON public.v_pl_mensual                TO anon, authenticated;
GRANT SELECT ON public.v_flujo_caja_diario         TO anon, authenticated;
GRANT SELECT ON public.v_flujo_caja_mensual        TO anon, authenticated;
GRANT SELECT ON public.v_patrimonio_snapshot       TO anon, authenticated;
GRANT SELECT ON public.v_obligaciones_proximas     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pl_resumen(date, date, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_patrimonio_totales() TO anon, authenticated;
