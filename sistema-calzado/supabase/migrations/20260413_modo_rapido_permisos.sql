-- ============================================================================
-- BLOQUE 5 · Modo Rápido (Padres) — permisos y vista de cuentas
-- ============================================================================

-- Documentar el recurso 'rapido' en el comentario de la columna
COMMENT ON COLUMN public.permisos_persona.recurso IS
'Recurso al que aplica el permiso. Valores conocidos: finanzas, cuentas, deudas, costos_fijos, movimientos, transferencias, configuracion, caja, rapido (Modo Padres).';

-- ----------------------------------------------------------------------------
-- Vista helper: cuentas visibles para el Modo Rápido
-- (solo cuentas activas, ordenadas para mostrar en lista táctil)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_rapido_cuentas AS
SELECT
    cf.id_cuenta,
    cf.codigo,
    cf.nombre,
    cf.alias,
    cf.tipo_cuenta,
    cf.saldo_actual,
    cf.moneda,
    cf.color_hex,
    cf.icono,
    cf.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    cf.orden_display
FROM public.cuentas_financieras cf
LEFT JOIN public.ubicaciones u ON u.id_ubicacion = cf.id_ubicacion
WHERE cf.activa = true
ORDER BY cf.orden_display, cf.nombre;

GRANT SELECT ON public.v_rapido_cuentas TO anon, authenticated;
