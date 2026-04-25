-- ============================================================================
-- Fase 2.05 — Activos fijos, contratos y depreciación mensual
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activos_fijos (
    id_activo               serial PRIMARY KEY,
    codigo                  text NOT NULL UNIQUE,
    nombre                  text NOT NULL,
    descripcion             text,
    categoria               text NOT NULL CHECK (categoria IN (
        'maquinaria','mobiliario','equipos_computo','vehiculo','mejora_local','otro'
    )),
    id_ubicacion            integer REFERENCES public.ubicaciones(id_ubicacion),
    fecha_adquisicion       date NOT NULL,
    valor_adquisicion       numeric(12,2) NOT NULL CHECK (valor_adquisicion >= 0),
    vida_util_meses         integer NOT NULL DEFAULT 60 CHECK (vida_util_meses > 0),
    valor_residual          numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_residual >= 0),
    metodo_depreciacion     text NOT NULL DEFAULT 'lineal' CHECK (metodo_depreciacion IN ('lineal','acelerada')),
    id_cuenta_activo        integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    id_cuenta_depreciacion  integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    estado                  text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','vendido','dado_de_baja')),
    fecha_baja              date,
    valor_venta             numeric(12,2),
    archivo_factura_url     text,
    serie_interna           text,
    proveedor               text,
    notas                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activos_estado ON public.activos_fijos(estado);
CREATE INDEX IF NOT EXISTS idx_activos_ubicacion ON public.activos_fijos(id_ubicacion);

DROP TRIGGER IF EXISTS trg_activos_updated ON public.activos_fijos;
CREATE TRIGGER trg_activos_updated BEFORE UPDATE ON public.activos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.contratos (
    id_contrato               serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    tipo                      text NOT NULL CHECK (tipo IN (
        'alquiler','servicio','licencia','seguro','comodato','otro'
    )),
    id_ubicacion              integer REFERENCES public.ubicaciones(id_ubicacion),
    contraparte_nombre        text NOT NULL,
    contraparte_ruc           text,
    fecha_inicio              date NOT NULL,
    fecha_fin                 date,
    monto_periodico           numeric(12,2),
    moneda                    text NOT NULL DEFAULT 'PEN',
    frecuencia_pago           text CHECK (frecuencia_pago IN ('mensual','trimestral','semestral','anual','unico')),
    dia_del_periodo           integer,
    id_cuenta_gasto           integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    id_obligacion_recurrente  integer REFERENCES public.obligaciones_recurrentes(id_obligacion),
    archivo_contrato_url      text,
    estado                    text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','por_vencer','vencido','rescindido')),
    notas                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON public.contratos(estado);
CREATE INDEX IF NOT EXISTS idx_contratos_fin ON public.contratos(fecha_fin) WHERE estado = 'vigente';

DROP TRIGGER IF EXISTS trg_contratos_updated ON public.contratos;
CREATE TRIGGER trg_contratos_updated BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.depreciacion_mensual (
    id_depreciacion    serial PRIMARY KEY,
    id_activo          integer NOT NULL REFERENCES public.activos_fijos(id_activo) ON DELETE CASCADE,
    anio               integer NOT NULL,
    mes                integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto_depreciacion numeric(12,2) NOT NULL,
    valor_neto_cierre  numeric(12,2) NOT NULL,
    id_movimiento      integer REFERENCES public.movimientos_caja(id_movimiento),
    generado_en        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_activo, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_depreciacion_periodo ON public.depreciacion_mensual(anio, mes);

CREATE OR REPLACE VIEW public.v_activos_con_valor_neto AS
SELECT
    a.*,
    GREATEST(
        a.valor_adquisicion - COALESCE(
            (SELECT SUM(monto_depreciacion) FROM public.depreciacion_mensual d WHERE d.id_activo = a.id_activo),
            0
        ),
        a.valor_residual
    ) AS valor_neto_actual,
    u.nombre AS ubicacion_nombre
FROM public.activos_fijos a
LEFT JOIN public.ubicaciones u ON u.id_ubicacion = a.id_ubicacion;

CREATE OR REPLACE VIEW public.v_depreciacion_mensual_resumen AS
SELECT
    anio,
    mes,
    COUNT(*)                 AS activos_procesados,
    SUM(monto_depreciacion)  AS total_depreciado
FROM public.depreciacion_mensual
GROUP BY anio, mes;

CREATE OR REPLACE FUNCTION public.fn_generar_depreciacion_mensual(
    p_anio integer,
    p_mes  integer
) RETURNS integer AS $$
DECLARE
    v_count       integer := 0;
    v_activo      record;
    v_monto       numeric;
    v_acumulado   numeric;
    v_valor_neto  numeric;
    v_ultimo_dia  date;
BEGIN
    v_ultimo_dia := (make_date(p_anio, p_mes, 1) + interval '1 month - 1 day')::date;

    FOR v_activo IN
        SELECT * FROM public.activos_fijos
        WHERE estado = 'activo'
          AND fecha_adquisicion <= v_ultimo_dia
    LOOP
        v_monto := GREATEST(
            (v_activo.valor_adquisicion - v_activo.valor_residual) / NULLIF(v_activo.vida_util_meses, 0),
            0
        );

        SELECT COALESCE(SUM(monto_depreciacion), 0) INTO v_acumulado
        FROM public.depreciacion_mensual
        WHERE id_activo = v_activo.id_activo
          AND (anio < p_anio OR (anio = p_anio AND mes < p_mes));

        IF v_activo.valor_adquisicion - v_acumulado - v_monto < v_activo.valor_residual THEN
            v_monto := GREATEST(v_activo.valor_adquisicion - v_acumulado - v_activo.valor_residual, 0);
        END IF;

        IF v_monto > 0 THEN
            v_valor_neto := v_activo.valor_adquisicion - v_acumulado - v_monto;

            INSERT INTO public.depreciacion_mensual (id_activo, anio, mes, monto_depreciacion, valor_neto_cierre)
            VALUES (v_activo.id_activo, p_anio, p_mes, v_monto, v_valor_neto)
            ON CONFLICT (id_activo, anio, mes) DO NOTHING;

            IF FOUND THEN v_count := v_count + 1; END IF;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Permisos
INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'activos', 'admin', true
FROM public.personas_tienda
WHERE rol = 'admin' AND activa = true
ON CONFLICT DO NOTHING;

INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'contratos', 'admin', true
FROM public.personas_tienda
WHERE rol = 'admin' AND activa = true
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.activos_fijos, public.contratos, public.depreciacion_mensual
  TO anon, authenticated;
GRANT USAGE, SELECT ON
  SEQUENCE public.activos_fijos_id_activo_seq,
           public.contratos_id_contrato_seq,
           public.depreciacion_mensual_id_depreciacion_seq
  TO anon, authenticated;
GRANT SELECT ON
  public.v_activos_con_valor_neto, public.v_depreciacion_mensual_resumen
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generar_depreciacion_mensual(integer, integer)
  TO anon, authenticated;
