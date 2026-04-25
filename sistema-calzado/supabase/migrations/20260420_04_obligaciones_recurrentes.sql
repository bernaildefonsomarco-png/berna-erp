-- ============================================================================
-- Fase 2.04 — Obligaciones recurrentes
-- ADR-004: NUNCA ejecutan movimientos automáticos. Solo recuerdan y asisten.
-- Modelo: obligaciones_recurrentes (plantilla) → obligaciones_instancias (mes a mes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.obligaciones_recurrentes (
    id_obligacion             serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    emoji                     text,
    id_tipo                   integer REFERENCES public.tipos_movimiento_caja(id_tipo),
    id_ubicacion              integer REFERENCES public.ubicaciones(id_ubicacion),
    id_cuenta_origen          integer REFERENCES public.cuentas_financieras(id_cuenta),
    monto_estimado            numeric(12,2),
    monto_es_fijo             boolean NOT NULL DEFAULT false,
    frecuencia                text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','diaria','anual','custom')),
    dia_del_periodo           integer,
    dias_anticipacion_aviso   integer NOT NULL DEFAULT 5,
    activa                    boolean NOT NULL DEFAULT true,
    notas                     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oblig_rec_activa ON public.obligaciones_recurrentes(activa) WHERE activa;

DROP TRIGGER IF EXISTS trg_oblig_rec_updated ON public.obligaciones_recurrentes;
CREATE TRIGGER trg_oblig_rec_updated BEFORE UPDATE ON public.obligaciones_recurrentes
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.obligaciones_instancias (
    id_instancia              serial PRIMARY KEY,
    id_obligacion             integer NOT NULL REFERENCES public.obligaciones_recurrentes(id_obligacion) ON DELETE CASCADE,
    fecha_vencimiento         date NOT NULL,
    monto_proyectado          numeric(12,2),
    monto_confirmado          numeric(12,2),
    estado                    text NOT NULL DEFAULT 'proyectado' CHECK (estado IN (
        'proyectado','confirmado','vencido','pagado_completo','pagado_parcial','acumulado','cancelado'
    )),
    id_movimiento_resultante  integer REFERENCES public.movimientos_caja(id_movimiento),
    monto_pagado              numeric(12,2),
    saldo_pendiente           numeric(12,2),
    nota                      text,
    archivo_recibo_url        text,
    confirmada_por            integer REFERENCES public.personas_tienda(id_persona),
    confirmada_en             timestamptz,
    pagada_por                integer REFERENCES public.personas_tienda(id_persona),
    pagada_en                 timestamptz,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_obligacion, fecha_vencimiento)
);
CREATE INDEX IF NOT EXISTS idx_oblig_inst_estado ON public.obligaciones_instancias(estado);
CREATE INDEX IF NOT EXISTS idx_oblig_inst_vencimiento ON public.obligaciones_instancias(fecha_vencimiento);

DROP TRIGGER IF EXISTS trg_oblig_inst_updated ON public.obligaciones_instancias;
CREATE TRIGGER trg_oblig_inst_updated BEFORE UPDATE ON public.obligaciones_instancias
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

-- Trigger: marcar vencido si la fecha ya pasó
CREATE OR REPLACE FUNCTION public.fn_oblig_actualizar_estado_vencido() RETURNS trigger AS $$
BEGIN
    IF NEW.estado IN ('proyectado','confirmado') AND NEW.fecha_vencimiento < current_date THEN
        NEW.estado := 'vencido';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_oblig_inst_vencimiento ON public.obligaciones_instancias;
CREATE TRIGGER trg_oblig_inst_vencimiento
    BEFORE INSERT OR UPDATE OF fecha_vencimiento, estado ON public.obligaciones_instancias
    FOR EACH ROW EXECUTE FUNCTION public.fn_oblig_actualizar_estado_vencido();

-- RPC: confirmar monto al recibir recibo
CREATE OR REPLACE FUNCTION public.fn_confirmar_monto_obligacion(
    p_id_instancia  integer,
    p_monto_real    numeric,
    p_id_persona    integer,
    p_archivo_url   text DEFAULT NULL
) RETURNS integer AS $$
BEGIN
    UPDATE public.obligaciones_instancias
    SET monto_confirmado = p_monto_real,
        archivo_recibo_url = COALESCE(p_archivo_url, archivo_recibo_url),
        confirmada_por = p_id_persona,
        confirmada_en = now(),
        estado = CASE WHEN fecha_vencimiento < current_date THEN 'vencido' ELSE 'confirmado' END,
        updated_at = now()
    WHERE id_instancia = p_id_instancia;
    RETURN p_id_instancia;
END;
$$ LANGUAGE plpgsql;

-- RPC: pagar (crea movimiento real)
-- NOTA: usa columnas reales de movimientos_caja:
--   tipo ('ingreso'|'egreso'), monto, concepto, fecha_movimiento,
--   id_persona, id_tipo, id_cuenta_financiera, id_ubicacion
CREATE OR REPLACE FUNCTION public.fn_pagar_obligacion(
    p_id_instancia  integer,
    p_monto_pagado  numeric,
    p_id_cuenta     integer,
    p_fecha_pago    date,
    p_id_persona    integer,
    p_modo          text DEFAULT 'completo'
) RETURNS integer AS $$
DECLARE
    v_obligacion   record;
    v_instancia    record;
    v_mov_id       integer;
    v_saldo        numeric;
    v_nuevo_estado text;
BEGIN
    SELECT * INTO v_instancia FROM public.obligaciones_instancias WHERE id_instancia = p_id_instancia;
    IF NOT FOUND THEN RAISE EXCEPTION 'Instancia de obligación % no encontrada', p_id_instancia; END IF;

    SELECT * INTO v_obligacion FROM public.obligaciones_recurrentes WHERE id_obligacion = v_instancia.id_obligacion;

    IF v_instancia.estado IN ('pagado_completo','cancelado') THEN
        RAISE EXCEPTION 'La obligación ya fue pagada o cancelada (estado=%)', v_instancia.estado;
    END IF;

    INSERT INTO public.movimientos_caja (
        id_ubicacion, tipo, monto, concepto, fecha_movimiento,
        id_persona, id_tipo, id_cuenta_financiera
    ) VALUES (
        v_obligacion.id_ubicacion,
        'egreso',
        p_monto_pagado,
        format('Pago obligación: %s', v_obligacion.nombre),
        p_fecha_pago::timestamptz,
        p_id_persona,
        v_obligacion.id_tipo,
        p_id_cuenta
    ) RETURNING id_movimiento INTO v_mov_id;

    v_saldo := COALESCE(v_instancia.monto_confirmado, v_instancia.monto_proyectado, 0) - p_monto_pagado;

    v_nuevo_estado := CASE
        WHEN p_modo = 'completo' OR v_saldo <= 0 THEN 'pagado_completo'
        WHEN p_modo = 'parcial' THEN 'pagado_parcial'
        WHEN p_modo = 'acumular' THEN 'acumulado'
        ELSE 'pagado_parcial'
    END;

    UPDATE public.obligaciones_instancias
    SET id_movimiento_resultante = v_mov_id,
        monto_pagado = p_monto_pagado,
        saldo_pendiente = GREATEST(v_saldo, 0),
        pagada_por = p_id_persona,
        pagada_en = now(),
        estado = v_nuevo_estado,
        updated_at = now()
    WHERE id_instancia = p_id_instancia;

    RETURN v_mov_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: generar instancias pendientes (cron diario lo invoca)
CREATE OR REPLACE FUNCTION public.fn_generar_obligaciones_pendientes(
    p_horizonte_dias integer DEFAULT 45
) RETURNS integer AS $$
DECLARE
    v_count         integer := 0;
    v_oblig         record;
    v_proxima_fecha date;
BEGIN
    FOR v_oblig IN
        SELECT * FROM public.obligaciones_recurrentes WHERE activa = true
    LOOP
        IF v_oblig.frecuencia = 'mensual' AND v_oblig.dia_del_periodo IS NOT NULL THEN
            v_proxima_fecha := date_trunc('month', current_date)::date + (v_oblig.dia_del_periodo - 1);
            IF v_proxima_fecha < current_date THEN
                v_proxima_fecha := (date_trunc('month', current_date) + interval '1 month')::date + (v_oblig.dia_del_periodo - 1);
            END IF;
        ELSIF v_oblig.frecuencia = 'quincenal' THEN
            v_proxima_fecha := current_date + (v_oblig.dias_anticipacion_aviso || ' days')::interval;
        ELSIF v_oblig.frecuencia = 'anual' AND v_oblig.dia_del_periodo IS NOT NULL THEN
            v_proxima_fecha := make_date(extract(year FROM current_date)::int, 1, v_oblig.dia_del_periodo);
            IF v_proxima_fecha < current_date THEN
                v_proxima_fecha := make_date(extract(year FROM current_date)::int + 1, 1, v_oblig.dia_del_periodo);
            END IF;
        ELSE
            CONTINUE;
        END IF;

        IF (v_proxima_fecha - current_date) > p_horizonte_dias THEN CONTINUE; END IF;

        INSERT INTO public.obligaciones_instancias (id_obligacion, fecha_vencimiento, monto_proyectado, estado)
        VALUES (v_oblig.id_obligacion, v_proxima_fecha, v_oblig.monto_estimado, 'proyectado')
        ON CONFLICT (id_obligacion, fecha_vencimiento) DO NOTHING;

        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Cron diario 6am (descomentar si pg_cron está disponible):
-- SELECT cron.schedule('generar-obligaciones-diarias', '0 6 * * *',
--     $$ SELECT public.fn_generar_obligaciones_pendientes(45); $$);

-- Vista bandeja
CREATE OR REPLACE VIEW public.v_obligaciones_bandeja AS
SELECT
    i.id_instancia,
    i.fecha_vencimiento,
    i.estado,
    i.monto_proyectado,
    i.monto_confirmado,
    i.monto_pagado,
    i.saldo_pendiente,
    i.archivo_recibo_url,
    o.id_obligacion,
    o.nombre,
    o.emoji,
    o.id_tipo,
    o.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    o.dias_anticipacion_aviso,
    (i.fecha_vencimiento - current_date) AS dias_hasta_vencimiento,
    CASE
        WHEN i.fecha_vencimiento < current_date AND i.estado NOT IN ('pagado_completo','cancelado') THEN 'vencidas'
        WHEN i.fecha_vencimiento <= current_date + 7 THEN 'estaSemana'
        ELSE 'proximas'
    END AS grupo
FROM public.obligaciones_instancias i
JOIN public.obligaciones_recurrentes o ON o.id_obligacion = i.id_obligacion
LEFT JOIN public.ubicaciones u ON u.id_ubicacion = o.id_ubicacion
WHERE i.estado IN ('proyectado','confirmado','vencido','pagado_parcial','acumulado')
  AND i.fecha_vencimiento <= current_date + interval '60 days';

-- Permisos: recurso 'obligaciones' admin para rol='admin'
-- NOTA: personas_tienda.rol CHECK actual: 'vendedora'|'admin'|'operador'
-- permisos_persona usa columna 'nivel_acceso' (NO 'nivel').
INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'obligaciones', 'admin', true
FROM public.personas_tienda
WHERE rol = 'admin' AND activa = true
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.obligaciones_recurrentes, public.obligaciones_instancias TO anon, authenticated;
GRANT USAGE, SELECT ON
  SEQUENCE public.obligaciones_recurrentes_id_obligacion_seq,
           public.obligaciones_instancias_id_instancia_seq
  TO anon, authenticated;
GRANT SELECT ON public.v_obligaciones_bandeja TO anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_confirmar_monto_obligacion(integer, numeric, integer, text),
  public.fn_pagar_obligacion(integer, numeric, integer, date, integer, text),
  public.fn_generar_obligaciones_pendientes(integer)
  TO anon, authenticated;
