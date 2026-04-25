# Plan Fase 3.01 — Migraciones de Base de Datos

**Fecha**: 2026-04-24
**Depende de**: Fase 2 aplicada (catálogos dedicados, obligaciones, idempotency_key, RBAC)
**Bloquea**: todos los demás planes de Fase 3

---

## Objetivo

Crear toda la base SQL que soporta la adaptación de POS + Producción al núcleo Fase 2. Al final, la DB está lista para que planes 02-11 modifiquen UI sin tocar más schema.

## Archivos a crear

Todos en `sistema-calzado/supabase/migrations/`:

1. `20260424_01_ventas_propinas_descuentos.sql`
2. `20260424_02_ventas_trigger_movimientos_caja.sql`
3. `20260424_03_ventas_recibo_devolucion.sql`
4. `20260424_04_lote_asignaciones.sql`
5. `20260424_05_movimiento_modelos_ligados.sql`
6. `20260424_06_vistas_produccion_costos.sql`

Y actualización final de `sistema-calzado/supabase_schema.sql`.

---

## Migración 1 — Ventas: propinas, descuentos, idempotency

**Archivo**: `20260424_01_ventas_propinas_descuentos.sql`

```sql
-- ============================================================================
-- Fase 3.01 — Extender ventas con propinas, descuentos y estado
-- ============================================================================

ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS propina numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS descuento_global_pct numeric(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS descuento_global_monto numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recibo_url text,
    ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'completada'
        CHECK (estado IN ('completada','anulada','devuelta_parcial'));

COMMENT ON COLUMN public.ventas.propina IS 'Monto de propina voluntaria del cliente';
COMMENT ON COLUMN public.ventas.descuento_global_pct IS 'Porcentaje de descuento global (0-100)';
COMMENT ON COLUMN public.ventas.descuento_global_monto IS 'Monto fijo de descuento global';
COMMENT ON COLUMN public.ventas.estado IS 'completada | anulada | devuelta_parcial';

-- Descuento por línea en detalle
ALTER TABLE public.ventas_detalle
    ADD COLUMN IF NOT EXISTS descuento_linea numeric(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS descuento_linea_tipo text NOT NULL DEFAULT 'monto'
        CHECK (descuento_linea_tipo IN ('pct','monto'));

COMMENT ON COLUMN public.ventas_detalle.descuento_linea IS 'Descuento aplicado a esta línea';
COMMENT ON COLUMN public.ventas_detalle.descuento_linea_tipo IS 'pct = porcentaje, monto = valor fijo';

-- Índice para consultar ventas por estado (devoluciones, anulaciones)
CREATE INDEX IF NOT EXISTS idx_ventas_estado
    ON public.ventas(estado)
    WHERE estado != 'completada';
```

**Criterio de aceptación**:
- `\d+ ventas` muestra columnas `propina`, `descuento_global_pct`, `descuento_global_monto`, `recibo_url`, `estado`.
- `\d+ ventas_detalle` muestra `descuento_linea` y `descuento_linea_tipo`.

---

## Migración 2 — Trigger venta → movimientos_caja

**Archivo**: `20260424_02_ventas_trigger_movimientos_caja.sql`

```sql
-- ============================================================================
-- Fase 3.02 — Trigger: venta genera movimiento_caja automáticamente (ADR-008)
-- Un movimiento por cada método de pago usado en la venta.
-- ============================================================================

-- FK opcional para ligar movimiento a pedido semanal
ALTER TABLE public.movimientos_caja
    ADD COLUMN IF NOT EXISTS id_pedido integer REFERENCES public.pedidos_semana(id_pedido)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_id_pedido
    ON public.movimientos_caja(id_pedido)
    WHERE id_pedido IS NOT NULL;

-- Función trigger: genera un movimiento_caja por cada método de pago > 0
CREATE OR REPLACE FUNCTION public.fn_venta_genera_movimientos()
RETURNS trigger AS $$
DECLARE
    v_metodo record;
    v_tipo_venta integer;
    v_monto numeric;
BEGIN
    -- Buscar tipo de movimiento "Venta POS" (debe existir en tipos_movimiento_caja)
    SELECT id_tipo INTO v_tipo_venta
    FROM public.tipos_movimiento_caja
    WHERE codigo = 'venta_pos'
    LIMIT 1;

    IF v_tipo_venta IS NULL THEN
        RAISE EXCEPTION 'Tipo de movimiento "venta_pos" no encontrado en tipos_movimiento_caja';
    END IF;

    -- Iterar sobre pagos de la venta (columnas dinámicas según metodos_pago)
    -- Los pagos se almacenan en la tabla ventas_pagos (creada si no existe)
    FOR v_metodo IN
        SELECT vp.id_metodo, vp.monto, mp.nombre AS metodo_nombre
        FROM public.ventas_pagos vp
        JOIN public.metodos_pago mp ON mp.id_metodo = vp.id_metodo
        WHERE vp.id_venta = NEW.id_venta
          AND vp.monto > 0
    LOOP
        INSERT INTO public.movimientos_caja (
            tipo, monto, concepto, fecha_movimiento,
            id_persona, id_tipo, id_cuenta_financiera,
            id_ubicacion, idempotency_key
        ) VALUES (
            'ingreso',
            v_metodo.monto,
            'Venta POS #' || NEW.id_venta || ' - ' || v_metodo.metodo_nombre,
            NEW.fecha_venta,
            NEW.id_persona,
            v_tipo_venta,
            NULL, -- cuenta se resuelve por fn_resolver_cuenta_contable
            NEW.id_ubicacion,
            NEW.idempotency_key || '-' || v_metodo.id_metodo
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabla de pagos por venta (normaliza los métodos)
CREATE TABLE IF NOT EXISTS public.ventas_pagos (
    id_venta    integer NOT NULL REFERENCES public.ventas(id_venta) ON DELETE CASCADE,
    id_metodo   integer NOT NULL REFERENCES public.metodos_pago(id_metodo),
    monto       numeric(12,2) NOT NULL CHECK (monto >= 0),
    referencia  text,
    PRIMARY KEY (id_venta, id_metodo)
);

CREATE INDEX IF NOT EXISTS idx_ventas_pagos_venta
    ON public.ventas_pagos(id_venta);

-- Trigger: se dispara DESPUÉS de insertar una venta
CREATE OR REPLACE TRIGGER trg_venta_genera_movimientos
    AFTER INSERT ON public.ventas
    FOR EACH ROW
    WHEN (NEW.estado = 'completada')
    EXECUTE FUNCTION public.fn_venta_genera_movimientos();

-- Trigger para anulación: marca movimientos como anulados
CREATE OR REPLACE FUNCTION public.fn_venta_anula_movimientos()
RETURNS trigger AS $$
BEGIN
    IF NEW.estado IN ('anulada','devuelta_parcial') AND OLD.estado = 'completada' THEN
        UPDATE public.movimientos_caja
        SET concepto = '[ANULADO] ' || concepto
        WHERE idempotency_key LIKE OLD.idempotency_key || '-%';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_venta_anula_movimientos
    AFTER UPDATE OF estado ON public.ventas
    FOR EACH ROW
    WHEN (NEW.estado != OLD.estado)
    EXECUTE FUNCTION public.fn_venta_anula_movimientos();
```

**Criterio de aceptación**:
- Insertar una venta con 2 métodos de pago genera 2 filas en `movimientos_caja`.
- Anular la venta marca los movimientos con `[ANULADO]`.
- `idempotency_key` del movimiento = `{venta_key}-{id_metodo}` (único).

---

## Migración 3 — Recibo y devoluciones

**Archivo**: `20260424_03_ventas_recibo_devolucion.sql`

```sql
-- ============================================================================
-- Fase 3.03 — Devoluciones parciales + recibo digital
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.devoluciones (
    id_devolucion    serial PRIMARY KEY,
    id_venta         integer NOT NULL REFERENCES public.ventas(id_venta) ON DELETE RESTRICT,
    id_persona       integer NOT NULL REFERENCES public.personas_tienda(id_persona),
    id_ubicacion     integer NOT NULL REFERENCES public.ubicaciones(id_ubicacion),
    id_motivo        integer REFERENCES public.motivos_devolucion(id_motivo),
    monto_devuelto   numeric(12,2) NOT NULL CHECK (monto_devuelto > 0),
    nota             text,
    telefono_cliente text,
    recibo_devolucion_url text,
    idempotency_key  text UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_venta
    ON public.devoluciones(id_venta);

CREATE TABLE IF NOT EXISTS public.devolucion_items (
    id_devolucion   integer NOT NULL REFERENCES public.devoluciones(id_devolucion) ON DELETE CASCADE,
    id_detalle      integer NOT NULL REFERENCES public.ventas_detalle(id_detalle),
    cantidad        integer NOT NULL DEFAULT 1,
    monto           numeric(12,2) NOT NULL,
    PRIMARY KEY (id_devolucion, id_detalle)
);

COMMENT ON TABLE public.devoluciones IS 'Devoluciones parciales o totales de ventas POS (ADR-008 aplica: genera movimiento egreso)';
```

**Criterio de aceptación**:
- `\d+ devoluciones` muestra FK a `ventas`, `motivos_devolucion`, `personas_tienda`.
- `\d+ devolucion_items` muestra PK compuesto `(id_devolucion, id_detalle)`.

---

## Migración 4 — Asignaciones lote ↔ trabajador

**Archivo**: `20260424_04_lote_asignaciones.sql`

```sql
-- ============================================================================
-- Fase 3.04 — Asignación multi-persona por lote (ADR-009)
-- Sin FSM de producción. Solo quién hizo qué.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lote_asignaciones (
    id_asignacion   serial PRIMARY KEY,
    id_lote         integer NOT NULL REFERENCES public.lotes(id_lote) ON DELETE CASCADE,
    id_persona      integer NOT NULL REFERENCES public.personas_tienda(id_persona),
    id_area         integer REFERENCES public.areas(id_area),
    id_cargo        integer REFERENCES public.cargos(id_cargo),
    pares_asignados integer,
    notas           text,
    activa          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_lote, id_persona, id_area, id_cargo)
);

CREATE INDEX IF NOT EXISTS idx_lote_asignaciones_lote
    ON public.lote_asignaciones(id_lote) WHERE activa;
CREATE INDEX IF NOT EXISTS idx_lote_asignaciones_persona
    ON public.lote_asignaciones(id_persona) WHERE activa;

COMMENT ON COLUMN public.lote_asignaciones.pares_asignados IS
  'NULL = participó en el lote completo. Solo se llena cuando hay división explícita entre trabajadores.';
COMMENT ON TABLE public.lote_asignaciones IS
  'Asignación plana multi-persona por lote. Una persona puede aparecer varias veces con cargos distintos (ADR-009).';
```

**Criterio de aceptación**:
- Juan puede ser "armador" de 48 pares y "pegador" de 24 pares del mismo lote (UNIQUE incluye `id_cargo`).
- `pares_asignados` es nullable.

---

## Migración 5 — Movimiento ↔ modelos de producto

**Archivo**: `20260424_05_movimiento_modelos_ligados.sql`

```sql
-- ============================================================================
-- Fase 3.05 — Ligadura compra material → modelos de producto (ADR-011)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.movimiento_modelos_ligados (
    id_movimiento   integer NOT NULL REFERENCES public.movimientos_caja(id_movimiento) ON DELETE CASCADE,
    id_producto     integer NOT NULL REFERENCES public.productos(id_producto),
    monto_proporcional numeric(12,2) NOT NULL CHECK (monto_proporcional >= 0),
    PRIMARY KEY (id_movimiento, id_producto)
);

CREATE INDEX IF NOT EXISTS idx_mov_modelos_producto
    ON public.movimiento_modelos_ligados(id_producto);

COMMENT ON TABLE public.movimiento_modelos_ligados IS
  'Liga una compra de material a los modelos de producto para los que se compró. Alimenta v_costos_reales_modelo_mes.';
```

**Criterio de aceptación**:
- Una compra de S/500 puede ligarse a 3 modelos con montos proporcionales que suman S/500.

---

## Migración 6 — Vistas de producción y costos

**Archivo**: `20260424_06_vistas_produccion_costos.sql`

```sql
-- ============================================================================
-- Fase 3.06 — Vistas para reportes de producción y costos reales
-- ============================================================================

-- Vista: trabajo mensual por persona
CREATE OR REPLACE VIEW public.v_produccion_mensual_persona AS
SELECT
    date_trunc('month', l.fecha_creacion)::date AS mes,
    la.id_persona,
    pt.nombre AS persona_nombre,
    la.id_area,
    a.nombre AS area_nombre,
    la.id_cargo,
    c.nombre AS cargo_nombre,
    p.id_producto,
    p.nombre AS producto_nombre,
    COUNT(DISTINCT la.id_lote) AS num_lotes,
    SUM(COALESCE(la.pares_asignados, l.cantidad_pares)) AS pares_total
FROM public.lote_asignaciones la
JOIN public.lotes l ON l.id_lote = la.id_lote
JOIN public.personas_tienda pt ON pt.id_persona = la.id_persona
LEFT JOIN public.areas a ON a.id_area = la.id_area
LEFT JOIN public.cargos c ON c.id_cargo = la.id_cargo
LEFT JOIN public.productos p ON p.id_producto = l.id_producto
WHERE la.activa = true
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9;

-- Vista: costo real promedio por modelo (últimos 3 meses de compras ligadas)
CREATE OR REPLACE VIEW public.v_costos_reales_modelo_mes AS
SELECT
    mml.id_producto,
    p.nombre AS producto_nombre,
    date_trunc('month', mc.fecha_movimiento)::date AS mes,
    SUM(mml.monto_proporcional) AS costo_total_mes,
    COUNT(DISTINCT mc.id_movimiento) AS num_compras
FROM public.movimiento_modelos_ligados mml
JOIN public.movimientos_caja mc ON mc.id_movimiento = mml.id_movimiento
JOIN public.productos p ON p.id_producto = mml.id_producto
WHERE mc.fecha_movimiento >= (now() - interval '3 months')
GROUP BY 1, 2, 3;

-- Vista: cumplimiento de pedido semanal (planificado vs real)
CREATE OR REPLACE VIEW public.v_cumplimiento_pedido_semanal AS
SELECT
    ps.id_pedido,
    ps.semana_inicio,
    ps.semana_fin,
    pd.id_producto,
    p.nombre AS producto_nombre,
    pd.cantidad_pedida,
    COALESCE(SUM(l.cantidad_pares), 0) AS cantidad_producida,
    ROUND(
        COALESCE(SUM(l.cantidad_pares), 0)::numeric / NULLIF(pd.cantidad_pedida, 0) * 100,
        1
    ) AS pct_cumplimiento
FROM public.pedidos_semana ps
JOIN public.pedido_detalle pd ON pd.id_pedido = ps.id_pedido
JOIN public.productos p ON p.id_producto = pd.id_producto
LEFT JOIN public.lotes l ON l.id_producto = pd.id_producto
    AND l.fecha_creacion BETWEEN ps.semana_inicio AND ps.semana_fin
    AND l.estado_lote IN ('terminado','cerrado')
GROUP BY 1, 2, 3, 4, 5, 6;

-- RPC: refrescar costo de un lote abierto desde compras ligadas
CREATE OR REPLACE FUNCTION public.fn_refrescar_costo_lote(p_id_lote integer)
RETURNS void AS $$
DECLARE
    v_id_producto integer;
    v_costo_real numeric;
BEGIN
    SELECT id_producto INTO v_id_producto
    FROM public.lotes WHERE id_lote = p_id_lote;

    IF v_id_producto IS NULL THEN
        RAISE EXCEPTION 'Lote % no encontrado o sin producto asignado', p_id_lote;
    END IF;

    SELECT COALESCE(AVG(costo_total_mes / NULLIF(num_compras, 0)), 0)
    INTO v_costo_real
    FROM public.v_costos_reales_modelo_mes
    WHERE id_producto = v_id_producto;

    UPDATE public.lotes
    SET costo_real_unitario = v_costo_real
    WHERE id_lote = p_id_lote
      AND estado_lote NOT IN ('cerrado');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_refrescar_costo_lote IS
  'Recalcula costo_real_unitario de un lote desde v_costos_reales_modelo_mes. Solo lotes no cerrados.';
```

**Criterio de aceptación**:
- `SELECT * FROM v_produccion_mensual_persona WHERE mes = '2026-04-01'` retorna filas agrupadas.
- `SELECT * FROM v_costos_reales_modelo_mes` muestra costo promedio por modelo.
- `SELECT fn_refrescar_costo_lote(1)` actualiza `lotes.costo_real_unitario`.

---

## Actualización de `supabase_schema.sql`

Al terminar las 6 migraciones:

1. **Agregar** bloques `CREATE TABLE` de: `ventas_pagos`, `devoluciones`, `devolucion_items`, `lote_asignaciones`, `movimiento_modelos_ligados`.
2. **Agregar** `ALTER TABLE` de `ventas` y `ventas_detalle` (columnas nuevas).
3. **Agregar** comentarios descriptivos de funciones, vistas y triggers (sin código inline para RPCs complejos).
4. Verificar que `idempotency_key` ya está (Fase 2).

---

## Orden de ejecución

```
01 (ventas propinas/descuentos)
02 (trigger venta → caja) — depende de 01
03 (recibo + devoluciones) — depende de 01
04 (lote asignaciones) — independiente
05 (movimiento modelos ligados) — independiente
06 (vistas producción/costos) — depende de 04 y 05
```
