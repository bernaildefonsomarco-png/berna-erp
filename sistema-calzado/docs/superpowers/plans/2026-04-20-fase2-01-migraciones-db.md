# Plan Fase 2.01 — Migraciones de Base de Datos

**Fecha**: 2026-04-20
**Depende de**: Fase 1.5 aplicada (cierres de período, `mapeo_categoria_cuenta` existente)
**Bloquea**: todos los demás planes de Fase 2

---

## Context

Este plan crea toda la base SQL que soporta el rediseño. Al final de su ejecución, la DB está lista para que los planes 02-09 modifiquen UI sin tocar más schema (excepto ajustes menores).

**DECIDIDO** (no re-deliberar):
- Catálogos son tablas dedicadas (§5 del spec). Se elimina `catalogos_auxiliares`.
- Cargo y Rol son conceptos separados (§6 del spec).
- Obligaciones recurrentes usan modelo `recurrente → instancia` (§8 del spec).

---

## Objetivos

1. Crear 7 tablas nuevas de catálogos (metodos_pago, areas, cargos, motivos_merma, motivos_ajuste, motivos_devolucion, condiciones_pago)
2. Crear tabla `obligaciones_recurrentes` + `obligaciones_instancias` + RPC generador
3. Crear tabla `reglas_mapeo_sugerido` para autosugerencia en wizard tipos
4. Crear tablas `activos_fijos`, `contratos`, `depreciacion_mensual` (usadas por plan 09)
5. Migrar datos existentes (texto libre `personas_tienda.cargo` y CHECK de `area` a FKs)
6. Eliminar `catalogos_auxiliares` y su migration
7. Actualizar `supabase_schema.sql` (source of truth)

---

## Archivos a crear

Todos en `sistema-calzado/supabase/migrations/`:

1. `20260420_01_catalogos_dedicados.sql` — las 7 tablas de catálogo + seed
2. `20260420_02_personas_cargo_area_fks.sql` — FKs en personas_tienda + migración de datos
3. `20260420_03_reglas_mapeo_sugerido.sql` — tabla y seed de reglas
4. `20260420_04_obligaciones_recurrentes.sql` — tablas + RPCs + cron
5. `20260420_05_activos_contratos.sql` — tablas de activos/contratos/depreciación
6. `20260420_06_drop_catalogos_auxiliares.sql` — drop idempotente de la tabla genérica

Y actualización final de:
- `sistema-calzado/supabase_schema.sql` (source of truth — append todas las tablas nuevas, remover la sección `catalogos_auxiliares`)

---

## Migración 1 — Catálogos dedicados

**Archivo**: `sistema-calzado/supabase/migrations/20260420_01_catalogos_dedicados.sql`

```sql
-- ============================================================================
-- Fase 2.01 — Catálogos como tablas dedicadas (reemplaza catalogos_auxiliares)
-- Cada catálogo: (id, codigo, nombre, activo, orden) + cols específicas
-- ============================================================================

-- 1. Métodos de pago
CREATE TABLE IF NOT EXISTS metodos_pago (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              text NOT NULL UNIQUE,
    nombre              text NOT NULL,
    tipo                text NOT NULL CHECK (tipo IN ('efectivo','digital','tarjeta','transferencia','cheque','otro')),
    requiere_referencia boolean NOT NULL DEFAULT false,
    activo              boolean NOT NULL DEFAULT true,
    orden               int NOT NULL DEFAULT 100,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_metodos_pago_activo ON metodos_pago(activo) WHERE activo;

INSERT INTO metodos_pago (codigo, nombre, tipo, orden) VALUES
    ('efectivo','Efectivo','efectivo',10),
    ('yape','Yape','digital',20),
    ('plin','Plin','digital',30),
    ('tarjeta','Tarjeta','tarjeta',40)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Áreas
CREATE TABLE IF NOT EXISTS areas (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      text NOT NULL UNIQUE,
    nombre      text NOT NULL,
    activo      boolean NOT NULL DEFAULT true,
    orden       int NOT NULL DEFAULT 100,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO areas (codigo, nombre, orden) VALUES
    ('tienda','Tienda',10),
    ('taller','Taller',20),
    ('administracion','Administración',30)
ON CONFLICT (codigo) DO NOTHING;

-- 3. Cargos (puestos laborales)
CREATE TABLE IF NOT EXISTS cargos (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    id_area_default           uuid REFERENCES areas(id),
    salario_sugerido          numeric(12,2),
    id_cuenta_contable_sueldo uuid REFERENCES plan_cuentas(id_cuenta),
    activo                    boolean NOT NULL DEFAULT true,
    orden                     int NOT NULL DEFAULT 100,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cargos_activo ON cargos(activo) WHERE activo;

-- Seed cargos comunes
INSERT INTO cargos (codigo, nombre, id_area_default, salario_sugerido, orden)
SELECT c.codigo, c.nombre, a.id, c.salario, c.orden
FROM (VALUES
    ('vendedora','Vendedora','tienda',1200,10),
    ('cajero','Cajero','tienda',1200,20),
    ('supervisor_tienda','Supervisor de tienda','tienda',1800,30),
    ('encargado_caja','Encargado de caja','tienda',1400,40),
    ('cortador','Cortador','taller',1500,50),
    ('armador','Armador','taller',1500,60),
    ('pegador','Pegador','taller',1400,70),
    ('disenador','Diseñador','taller',1800,80),
    ('administrador_general','Administrador general','administracion',2500,90),
    ('contador','Contador','administracion',2200,100)
) AS c(codigo, nombre, area_codigo, salario, orden)
LEFT JOIN areas a ON a.codigo = c.area_codigo
ON CONFLICT (codigo) DO NOTHING;

-- 4. Motivos de merma
CREATE TABLE IF NOT EXISTS motivos_merma (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo     text NOT NULL UNIQUE,
    nombre     text NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    orden      int NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO motivos_merma (codigo, nombre, orden) VALUES
    ('defecto_fabrica','Defecto de fábrica',10),
    ('dano_transporte','Daño en transporte',20),
    ('robo','Robo / extravío',30),
    ('vencimiento','Vencimiento',40),
    ('otro','Otro',99)
ON CONFLICT DO NOTHING;

-- 5. Motivos de ajuste
CREATE TABLE IF NOT EXISTS motivos_ajuste (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo     text NOT NULL UNIQUE,
    nombre     text NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    orden      int NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO motivos_ajuste (codigo, nombre, orden) VALUES
    ('error_registro','Error de registro',10),
    ('conciliacion_bancaria','Conciliación bancaria',20),
    ('ajuste_inventario','Ajuste de inventario',30),
    ('otro','Otro',99)
ON CONFLICT DO NOTHING;

-- 6. Motivos de devolución
CREATE TABLE IF NOT EXISTS motivos_devolucion (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo     text NOT NULL UNIQUE,
    nombre     text NOT NULL,
    activo     boolean NOT NULL DEFAULT true,
    orden      int NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO motivos_devolucion (codigo, nombre, orden) VALUES
    ('no_le_quedo','No le quedó al cliente',10),
    ('defecto','Defecto del producto',20),
    ('cambio_de_opinion','Cambio de opinión',30),
    ('talla_equivocada','Talla equivocada',40)
ON CONFLICT DO NOTHING;

-- 7. Condiciones de pago
CREATE TABLE IF NOT EXISTS condiciones_pago (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo        text NOT NULL UNIQUE,
    nombre        text NOT NULL,
    dias_credito  int NOT NULL DEFAULT 0,
    activo        boolean NOT NULL DEFAULT true,
    orden         int NOT NULL DEFAULT 100,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO condiciones_pago (codigo, nombre, dias_credito, orden) VALUES
    ('contado','Contado',0,10),
    ('credito_15','Crédito 15 días',15,20),
    ('credito_30','Crédito 30 días',30,30),
    ('credito_60','Crédito 60 días',60,40)
ON CONFLICT DO NOTHING;

-- Trigger updated_at para todos
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['metodos_pago','areas','cargos','motivos_merma','motivos_ajuste','motivos_devolucion','condiciones_pago']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s;', t, t);
        EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();', t, t);
    END LOOP;
END $$;
```

**Criterio de aceptación**:
- 7 tablas existen
- Cada una tiene al menos 3 filas seed (excepto las que no aplica)
- `SELECT * FROM cargos WHERE codigo='vendedora';` devuelve 1 fila

---

## Migración 2 — FKs en personas_tienda

**Archivo**: `sistema-calzado/supabase/migrations/20260420_02_personas_cargo_area_fks.sql`

```sql
-- ============================================================================
-- Fase 2.02 — personas_tienda: FKs id_cargo + id_area
-- Migra columnas text libres a FKs hacia cargos/areas
-- ============================================================================

-- Agregar columnas FK (nullable inicialmente)
ALTER TABLE personas_tienda
    ADD COLUMN IF NOT EXISTS id_cargo uuid REFERENCES cargos(id),
    ADD COLUMN IF NOT EXISTS id_area  uuid REFERENCES areas(id);

-- Poblar id_area desde columna text area
UPDATE personas_tienda p
SET id_area = a.id
FROM areas a
WHERE p.id_area IS NULL
  AND lower(coalesce(p.area,'')) = a.codigo;

-- Poblar id_cargo intentando match exacto por nombre/código
UPDATE personas_tienda p
SET id_cargo = c.id
FROM cargos c
WHERE p.id_cargo IS NULL
  AND (
    lower(coalesce(p.cargo,'')) = c.codigo
    OR lower(coalesce(p.cargo,'')) = lower(c.nombre)
  );

-- Insertar cargos nuevos para los que no hicieron match (preserva datos)
INSERT INTO cargos (codigo, nombre, activo, orden)
SELECT
    regexp_replace(lower(p.cargo), '[^a-z0-9]+', '_', 'g') AS codigo,
    p.cargo AS nombre,
    true,
    200
FROM personas_tienda p
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND trim(p.cargo) <> ''
GROUP BY p.cargo
ON CONFLICT (codigo) DO NOTHING;

-- Re-poblar id_cargo con los recién insertados
UPDATE personas_tienda p
SET id_cargo = c.id
FROM cargos c
WHERE p.id_cargo IS NULL
  AND regexp_replace(lower(coalesce(p.cargo,'')), '[^a-z0-9]+', '_', 'g') = c.codigo;

-- Índices
CREATE INDEX IF NOT EXISTS idx_personas_id_cargo ON personas_tienda(id_cargo);
CREATE INDEX IF NOT EXISTS idx_personas_id_area  ON personas_tienda(id_area);

-- NO dropear columnas viejas todavía (text cargo, text area). Queda deuda para
-- limpiar en plan futuro, cuando confirmemos que la UI nueva no las usa más.
COMMENT ON COLUMN personas_tienda.cargo IS 'DEPRECATED: usar id_cargo FK. Mantenido para retrocompatibilidad durante Fase 2.';
COMMENT ON COLUMN personas_tienda.area  IS 'DEPRECATED: usar id_area FK. Mantenido para retrocompatibilidad durante Fase 2.';
```

**Criterio de aceptación**:
- `SELECT count(*) FROM personas_tienda WHERE id_cargo IS NULL AND cargo IS NOT NULL;` devuelve 0
- `SELECT count(*) FROM personas_tienda WHERE id_area IS NULL AND area IS NOT NULL;` devuelve 0

---

## Migración 3 — Reglas de mapeo sugerido

**Archivo**: `sistema-calzado/supabase/migrations/20260420_03_reglas_mapeo_sugerido.sql`

```sql
-- ============================================================================
-- Fase 2.03 — Reglas de mapeo sugerido (motor del wizard de tipos)
-- Dado (categoria_macro, rol_ubicacion) → sugiere id_cuenta_contable
-- ============================================================================

CREATE TABLE IF NOT EXISTS reglas_mapeo_sugerido (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_macro             text NOT NULL CHECK (categoria_macro IN (
        'ingreso','gasto_operativo','pago_personas','inversion',
        'traslado','pago_deuda','compra_material'
    )),
    ubicacion_rol               text NOT NULL CHECK (ubicacion_rol IN ('*','Tienda','Taller','Administracion')),
    id_cuenta_contable_sugerida uuid NOT NULL REFERENCES plan_cuentas(id_cuenta),
    prioridad                   int NOT NULL DEFAULT 100,
    activa                      boolean NOT NULL DEFAULT true,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (categoria_macro, ubicacion_rol)
);

-- Seed: estas reglas se basan en el plan_cuentas real. El dev debe ajustar
-- los códigos de cuenta después del insert si difieren.
-- Placeholder — los códigos reales se deben verificar con:
--   SELECT id_cuenta, codigo, nombre FROM plan_cuentas ORDER BY codigo;
--
-- Estructura esperada (ejemplo, ajustar):
INSERT INTO reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'gasto_operativo', 'Tienda', pc.id_cuenta, 10
FROM plan_cuentas pc WHERE pc.codigo = '6201' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'gasto_operativo', 'Taller', pc.id_cuenta, 10
FROM plan_cuentas pc WHERE pc.codigo = '6105' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'pago_personas', 'Tienda', pc.id_cuenta, 10
FROM plan_cuentas pc WHERE pc.codigo = '6101' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO reglas_mapeo_sugerido (categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida, prioridad)
SELECT 'pago_personas', 'Taller', pc.id_cuenta, 10
FROM plan_cuentas pc WHERE pc.codigo = '6102' LIMIT 1
ON CONFLICT DO NOTHING;

-- NOTA para el dev: completar con las 7 categorias × 4 ubicacion_rol = 28 reglas idealmente.
-- Ver §7 del spec para la lista completa de categorias.

CREATE INDEX idx_reglas_mapeo_lookup ON reglas_mapeo_sugerido(categoria_macro, ubicacion_rol)
  WHERE activa;

-- RPC de autosugerencia usada por el wizard
CREATE OR REPLACE FUNCTION fn_sugerir_cuenta_para_tipo(
    p_categoria_macro text,
    p_ubicacion_rol   text DEFAULT '*'
) RETURNS uuid AS $$
DECLARE
    v_id uuid;
BEGIN
    -- Primero busca match exacto de rol
    SELECT id_cuenta_contable_sugerida INTO v_id
    FROM reglas_mapeo_sugerido
    WHERE activa
      AND categoria_macro = p_categoria_macro
      AND ubicacion_rol = p_ubicacion_rol
    ORDER BY prioridad ASC
    LIMIT 1;

    -- Si no, fallback al wildcard
    IF v_id IS NULL THEN
        SELECT id_cuenta_contable_sugerida INTO v_id
        FROM reglas_mapeo_sugerido
        WHERE activa
          AND categoria_macro = p_categoria_macro
          AND ubicacion_rol = '*'
        ORDER BY prioridad ASC
        LIMIT 1;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Criterio de aceptación**:
- `SELECT fn_sugerir_cuenta_para_tipo('gasto_operativo', 'Tienda');` devuelve un uuid no-nulo (si el plan de cuentas tiene la cuenta 6201).
- Si no hay match, devuelve NULL — el wizard debe manejar ese caso con "Seleccionar manualmente".

---

## Migración 4 — Obligaciones recurrentes

**Archivo**: `sistema-calzado/supabase/migrations/20260420_04_obligaciones_recurrentes.sql`

```sql
-- ============================================================================
-- Fase 2.04 — Obligaciones recurrentes
-- Sistema de recordatorios. NUNCA ejecuta movimientos automáticos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS obligaciones_recurrentes (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                   text NOT NULL UNIQUE,
    nombre                   text NOT NULL,
    emoji                    text,
    id_tipo_movimiento       uuid REFERENCES tipos_movimiento_caja(id_tipo),
    id_ubicacion             uuid REFERENCES ubicaciones(id_ubicacion),
    id_cuenta_origen         uuid REFERENCES cuentas_financieras(id_cuenta),
    monto_estimado           numeric(12,2),
    monto_es_fijo            boolean NOT NULL DEFAULT false,
    frecuencia               text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','diaria','anual','custom')),
    dia_del_periodo          int,
    dias_anticipacion_aviso  int NOT NULL DEFAULT 5,
    activa                   boolean NOT NULL DEFAULT true,
    notas                    text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oblig_rec_activa ON obligaciones_recurrentes(activa) WHERE activa;

CREATE TABLE IF NOT EXISTS obligaciones_instancias (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_obligacion            uuid NOT NULL REFERENCES obligaciones_recurrentes(id) ON DELETE CASCADE,
    fecha_vencimiento        date NOT NULL,
    monto_proyectado         numeric(12,2),
    monto_confirmado         numeric(12,2),
    estado                   text NOT NULL CHECK (estado IN (
        'proyectado','confirmado','vencido','pagado_completo','pagado_parcial','acumulado','cancelado'
    )) DEFAULT 'proyectado',
    id_movimiento_resultante uuid REFERENCES movimientos_caja(id_movimiento),
    monto_pagado             numeric(12,2),
    saldo_pendiente          numeric(12,2),
    nota                     text,
    archivo_recibo_url       text,
    confirmada_por           uuid REFERENCES personas_tienda(id_persona),
    confirmada_en            timestamptz,
    pagada_por               uuid REFERENCES personas_tienda(id_persona),
    pagada_en                timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_obligacion, fecha_vencimiento)
);
CREATE INDEX idx_oblig_inst_estado ON obligaciones_instancias(estado);
CREATE INDEX idx_oblig_inst_vencimiento ON obligaciones_instancias(fecha_vencimiento);

-- Trigger: al cambiar fecha_vencimiento en el pasado y estado aún proyectado/confirmado → vencido
CREATE OR REPLACE FUNCTION fn_actualizar_estado_vencido() RETURNS trigger AS $$
BEGIN
    IF NEW.estado IN ('proyectado','confirmado') AND NEW.fecha_vencimiento < current_date THEN
        NEW.estado := 'vencido';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_oblig_inst_vencimiento
    BEFORE INSERT OR UPDATE ON obligaciones_instancias
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_estado_vencido();

-- RPC: confirmar monto real de una instancia (cuando llega el recibo)
CREATE OR REPLACE FUNCTION fn_confirmar_monto_obligacion(
    p_id_instancia    uuid,
    p_monto_real      numeric,
    p_id_persona      uuid,
    p_archivo_url     text DEFAULT NULL
) RETURNS uuid AS $$
BEGIN
    UPDATE obligaciones_instancias
    SET monto_confirmado = p_monto_real,
        archivo_recibo_url = COALESCE(p_archivo_url, archivo_recibo_url),
        confirmada_por = p_id_persona,
        confirmada_en = now(),
        estado = CASE WHEN fecha_vencimiento < current_date THEN 'vencido' ELSE 'confirmado' END,
        updated_at = now()
    WHERE id = p_id_instancia;
    RETURN p_id_instancia;
END;
$$ LANGUAGE plpgsql;

-- RPC: pagar una instancia (crea el movimiento real)
CREATE OR REPLACE FUNCTION fn_pagar_obligacion(
    p_id_instancia  uuid,
    p_monto_pagado  numeric,
    p_id_cuenta     uuid,
    p_fecha_pago    date,
    p_id_persona    uuid,
    p_modo          text DEFAULT 'completo' -- 'completo' | 'parcial' | 'acumular'
) RETURNS uuid AS $$
DECLARE
    v_obligacion   record;
    v_instancia    record;
    v_mov_id       uuid;
    v_saldo        numeric;
    v_nuevo_estado text;
BEGIN
    SELECT * INTO v_instancia FROM obligaciones_instancias WHERE id = p_id_instancia;
    IF NOT FOUND THEN RAISE EXCEPTION 'Instancia no encontrada'; END IF;

    SELECT * INTO v_obligacion FROM obligaciones_recurrentes WHERE id = v_instancia.id_obligacion;

    -- Crear movimiento real
    INSERT INTO movimientos_caja (
        id_tipo, id_ubicacion, id_cuenta, monto, fecha, concepto, registrado_por
    ) VALUES (
        v_obligacion.id_tipo_movimiento,
        v_obligacion.id_ubicacion,
        p_id_cuenta,
        p_monto_pagado,
        p_fecha_pago,
        format('Pago obligación: %s', v_obligacion.nombre),
        p_id_persona
    ) RETURNING id_movimiento INTO v_mov_id;

    -- Calcular saldo y estado
    v_saldo := COALESCE(v_instancia.monto_confirmado, v_instancia.monto_proyectado, 0) - p_monto_pagado;

    v_nuevo_estado := CASE
        WHEN p_modo = 'completo' OR v_saldo <= 0 THEN 'pagado_completo'
        WHEN p_modo = 'parcial' THEN 'pagado_parcial'
        WHEN p_modo = 'acumular' THEN 'acumulado'
        ELSE 'pagado_parcial'
    END;

    UPDATE obligaciones_instancias
    SET id_movimiento_resultante = v_mov_id,
        monto_pagado = p_monto_pagado,
        saldo_pendiente = GREATEST(v_saldo, 0),
        pagada_por = p_id_persona,
        pagada_en = now(),
        estado = v_nuevo_estado,
        updated_at = now()
    WHERE id = p_id_instancia;

    RETURN v_mov_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: generar instancias pendientes (cron diario lo invoca)
CREATE OR REPLACE FUNCTION fn_generar_obligaciones_pendientes(
    p_horizonte_dias int DEFAULT 45
) RETURNS int AS $$
DECLARE
    v_count         int := 0;
    v_oblig         record;
    v_proxima_fecha date;
BEGIN
    FOR v_oblig IN
        SELECT * FROM obligaciones_recurrentes WHERE activa = true
    LOOP
        -- Cálculo de próxima fecha según frecuencia y día del período
        IF v_oblig.frecuencia = 'mensual' AND v_oblig.dia_del_periodo IS NOT NULL THEN
            v_proxima_fecha := date_trunc('month', current_date)::date + (v_oblig.dia_del_periodo - 1);
            IF v_proxima_fecha < current_date THEN
                v_proxima_fecha := (date_trunc('month', current_date) + interval '1 month')::date + (v_oblig.dia_del_periodo - 1);
            END IF;
        ELSIF v_oblig.frecuencia = 'quincenal' THEN
            -- Genera fechas cada 15 días desde un ancla
            v_proxima_fecha := current_date + (v_oblig.dias_anticipacion_aviso || ' days')::interval;
        ELSE
            -- Otros casos: skip por ahora, requiere lógica específica
            CONTINUE;
        END IF;

        IF v_proxima_fecha - current_date > p_horizonte_dias THEN CONTINUE; END IF;

        INSERT INTO obligaciones_instancias (id_obligacion, fecha_vencimiento, monto_proyectado, estado)
        VALUES (v_oblig.id, v_proxima_fecha, v_oblig.monto_estimado, 'proyectado')
        ON CONFLICT (id_obligacion, fecha_vencimiento) DO NOTHING;

        IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Cron diario 6am: Supabase extensions pg_cron
-- Descomentar cuando esté habilitado:
-- SELECT cron.schedule('generar-obligaciones-diarias', '0 6 * * *',
--     $$ SELECT fn_generar_obligaciones_pendientes(45); $$);

-- Vista de instancias visibles en bandeja (próximos 30 días o vencidas no pagadas)
CREATE OR REPLACE VIEW v_obligaciones_bandeja AS
SELECT
    i.id AS id_instancia,
    i.fecha_vencimiento,
    i.estado,
    i.monto_proyectado,
    i.monto_confirmado,
    i.monto_pagado,
    i.saldo_pendiente,
    o.id AS id_obligacion,
    o.nombre,
    o.emoji,
    o.id_tipo_movimiento,
    o.id_ubicacion,
    u.nombre AS ubicacion_nombre,
    o.dias_anticipacion_aviso,
    (i.fecha_vencimiento - current_date) AS dias_hasta_vencimiento
FROM obligaciones_instancias i
JOIN obligaciones_recurrentes o ON o.id = i.id_obligacion
LEFT JOIN ubicaciones u ON u.id_ubicacion = o.id_ubicacion
WHERE i.estado IN ('proyectado','confirmado','vencido','pagado_parcial','acumulado')
  AND i.fecha_vencimiento <= current_date + interval '30 days';

-- Permisos
INSERT INTO permisos_persona (id_persona, recurso, nivel)
SELECT id_persona, 'obligaciones', 'admin'
FROM personas_tienda
WHERE rol IN ('Administrador','administrador')
ON CONFLICT (id_persona, recurso) DO UPDATE SET nivel = EXCLUDED.nivel;
```

**Criterio de aceptación**:
- Insertar una obligación recurrente de prueba + llamar `fn_generar_obligaciones_pendientes(45)` genera al menos 1 instancia
- `SELECT * FROM v_obligaciones_bandeja;` muestra la instancia

---

## Migración 5 — Activos y contratos (para plan 09)

**Archivo**: `sistema-calzado/supabase/migrations/20260420_05_activos_contratos.sql`

```sql
-- ============================================================================
-- Fase 2.05 — Activos fijos, contratos y depreciación
-- ============================================================================

CREATE TABLE IF NOT EXISTS activos_fijos (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                  text NOT NULL UNIQUE,
    nombre                  text NOT NULL,
    descripcion             text,
    categoria               text NOT NULL CHECK (categoria IN (
        'maquinaria','mobiliario','equipos_computo','vehiculo','mejora_local','otro'
    )),
    id_ubicacion            uuid REFERENCES ubicaciones(id_ubicacion),
    fecha_adquisicion       date NOT NULL,
    valor_adquisicion       numeric(12,2) NOT NULL,
    vida_util_meses         int NOT NULL DEFAULT 60,
    valor_residual          numeric(12,2) NOT NULL DEFAULT 0,
    metodo_depreciacion     text NOT NULL DEFAULT 'lineal' CHECK (metodo_depreciacion IN ('lineal','acelerada')),
    id_cuenta_activo        uuid REFERENCES plan_cuentas(id_cuenta),
    id_cuenta_depreciacion  uuid REFERENCES plan_cuentas(id_cuenta),
    estado                  text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','vendido','dado_de_baja')),
    fecha_baja              date,
    valor_venta             numeric(12,2),
    notas                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activos_estado ON activos_fijos(estado);
CREATE INDEX idx_activos_ubicacion ON activos_fijos(id_ubicacion);

CREATE TABLE IF NOT EXISTS contratos (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                text NOT NULL UNIQUE,
    nombre                text NOT NULL,
    tipo                  text NOT NULL CHECK (tipo IN (
        'alquiler','servicio','licencia','seguro','otro'
    )),
    id_ubicacion          uuid REFERENCES ubicaciones(id_ubicacion),
    contraparte_nombre    text NOT NULL,
    contraparte_ruc       text,
    fecha_inicio          date NOT NULL,
    fecha_fin             date,
    monto_periodico       numeric(12,2),
    frecuencia_pago       text CHECK (frecuencia_pago IN ('mensual','trimestral','semestral','anual','unico')),
    id_obligacion_recurrente uuid REFERENCES obligaciones_recurrentes(id),
    archivo_contrato_url  text,
    estado                text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','por_vencer','vencido','rescindido')),
    notas                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contratos_estado ON contratos(estado);
CREATE INDEX idx_contratos_fin ON contratos(fecha_fin) WHERE estado = 'vigente';

CREATE TABLE IF NOT EXISTS depreciacion_mensual (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_activo         uuid NOT NULL REFERENCES activos_fijos(id) ON DELETE CASCADE,
    year              int NOT NULL,
    month             int NOT NULL CHECK (month BETWEEN 1 AND 12),
    monto_depreciacion numeric(12,2) NOT NULL,
    valor_neto_cierre numeric(12,2) NOT NULL,
    id_movimiento     uuid REFERENCES movimientos_caja(id_movimiento),
    generado_en       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id_activo, year, month)
);

-- Vista: activos con valor neto actual
CREATE OR REPLACE VIEW v_activos_con_valor_neto AS
SELECT
    a.*,
    GREATEST(
        a.valor_adquisicion - COALESCE(
            (SELECT SUM(monto_depreciacion) FROM depreciacion_mensual d WHERE d.id_activo = a.id),
            0
        ),
        a.valor_residual
    ) AS valor_neto_actual
FROM activos_fijos a
WHERE a.estado = 'activo';

-- RPC: generar depreciación del mes (idempotente)
CREATE OR REPLACE FUNCTION fn_generar_depreciacion_mensual(
    p_year int,
    p_month int
) RETURNS int AS $$
DECLARE
    v_count int := 0;
    v_activo record;
    v_monto numeric;
    v_acumulado numeric;
    v_valor_neto numeric;
BEGIN
    FOR v_activo IN
        SELECT * FROM activos_fijos
        WHERE estado = 'activo'
          AND fecha_adquisicion <= make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day'
    LOOP
        -- Depreciación lineal: (valor_adquisicion - valor_residual) / vida_util_meses
        v_monto := GREATEST(
            (v_activo.valor_adquisicion - v_activo.valor_residual) / NULLIF(v_activo.vida_util_meses, 0),
            0
        );

        SELECT COALESCE(SUM(monto_depreciacion), 0) INTO v_acumulado
        FROM depreciacion_mensual
        WHERE id_activo = v_activo.id
          AND (year < p_year OR (year = p_year AND month < p_month));

        -- No sobrepasar el valor residual
        IF v_activo.valor_adquisicion - v_acumulado - v_monto < v_activo.valor_residual THEN
            v_monto := GREATEST(v_activo.valor_adquisicion - v_acumulado - v_activo.valor_residual, 0);
        END IF;

        IF v_monto > 0 THEN
            v_valor_neto := v_activo.valor_adquisicion - v_acumulado - v_monto;

            INSERT INTO depreciacion_mensual (id_activo, year, month, monto_depreciacion, valor_neto_cierre)
            VALUES (v_activo.id, p_year, p_month, v_monto, v_valor_neto)
            ON CONFLICT (id_activo, year, month) DO NOTHING;

            IF FOUND THEN v_count := v_count + 1; END IF;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Permiso
INSERT INTO permisos_persona (id_persona, recurso, nivel)
SELECT id_persona, 'activos', 'admin'
FROM personas_tienda
WHERE rol IN ('Administrador','administrador')
ON CONFLICT (id_persona, recurso) DO UPDATE SET nivel = EXCLUDED.nivel;
```

**Criterio de aceptación**:
- Insertar un activo fijo de prueba + `SELECT fn_generar_depreciacion_mensual(2026, 4);` genera 1 fila en `depreciacion_mensual`.

---

## Migración 6 — Drop catalogos_auxiliares

**Archivo**: `sistema-calzado/supabase/migrations/20260420_06_drop_catalogos_auxiliares.sql`

```sql
-- ============================================================================
-- Fase 2.06 — Eliminar catalogos_auxiliares (decisión del spec §5)
-- Razón: reemplazada por tablas dedicadas. Regla: catálogos = tablas dedicadas siempre.
-- ============================================================================

-- Pre-check: si hay datos no migrados, abortar.
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count FROM catalogos_auxiliares WHERE activo = true;
    IF v_count > 0 THEN
        RAISE NOTICE 'catalogos_auxiliares tiene % filas activas. Verifique que fueron migradas antes de dropear.', v_count;
        -- No abortar — solo advertir. El dev decide si ejecutar el drop.
    END IF;
END $$;

-- Drop (idempotente)
DROP TABLE IF EXISTS catalogos_auxiliares CASCADE;

-- Si existe archivo de migration viejo, no se puede eliminar históricamente — quedará
-- como registro. Pero la tabla ya no existe en runtime.
```

**Criterio de aceptación**:
- `SELECT to_regclass('catalogos_auxiliares');` devuelve NULL

---

## Actualización final de `supabase_schema.sql`

**Archivo**: `sistema-calzado/supabase_schema.sql`

Agregar al final (después de la última sección existente):

```sql
-- ============================================================================
-- Fase 2 — Catálogos dedicados, obligaciones, activos (agregado 2026-04-20)
-- Source of truth para las tablas creadas por las migrations 20260420_01..05
-- ============================================================================

-- [Copiar CREATE TABLE de: metodos_pago, areas, cargos, motivos_merma,
--  motivos_ajuste, motivos_devolucion, condiciones_pago, reglas_mapeo_sugerido,
--  obligaciones_recurrentes, obligaciones_instancias, activos_fijos, contratos,
--  depreciacion_mensual tal como están en las migrations arriba]

-- Vistas: v_obligaciones_bandeja, v_activos_con_valor_neto
-- RPCs: fn_sugerir_cuenta_para_tipo, fn_confirmar_monto_obligacion,
--       fn_pagar_obligacion, fn_generar_obligaciones_pendientes,
--       fn_generar_depreciacion_mensual
```

Y en la sección de `personas_tienda`, agregar columnas:
```sql
-- personas_tienda (Fase 2 additions)
id_cargo uuid REFERENCES cargos(id),
id_area  uuid REFERENCES areas(id),
```

Y REMOVER de `supabase_schema.sql`:
- La sección completa de `catalogos_auxiliares` (si existe).

---

## Ejecución

1. Revisar que Supabase está corriendo y accesible
2. Aplicar migrations en orden:
   ```bash
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_01_catalogos_dedicados.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_02_personas_cargo_area_fks.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_03_reglas_mapeo_sugerido.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_04_obligaciones_recurrentes.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_05_activos_contratos.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_06_drop_catalogos_auxiliares.sql
   ```
   O desde Supabase Studio: SQL Editor → pegar cada archivo en orden.

3. Actualizar `supabase_schema.sql` con el contenido consolidado.

4. Commit: `git commit -m "feat(fase2-01): migraciones DB catalogos dedicados + obligaciones + activos"`

---

## Criterio de aceptación global del plan

Todos verdaderos:
- [ ] Las 6 migrations ejecutaron sin error
- [ ] `SELECT count(*) FROM metodos_pago;` ≥ 4
- [ ] `SELECT count(*) FROM cargos;` ≥ 10
- [ ] `SELECT count(*) FROM areas;` = 3
- [ ] `SELECT count(*) FROM personas_tienda WHERE cargo IS NOT NULL AND id_cargo IS NULL;` = 0
- [ ] `SELECT to_regclass('catalogos_auxiliares');` devuelve NULL
- [ ] `SELECT fn_sugerir_cuenta_para_tipo('gasto_operativo','Tienda');` devuelve uuid no-nulo
- [ ] `SELECT fn_generar_obligaciones_pendientes(45);` devuelve int ≥ 0 (sin error)
- [ ] `supabase_schema.sql` incluye las nuevas tablas y NO incluye `catalogos_auxiliares`
- [ ] Commit a git de las 6 migrations + schema.sql
