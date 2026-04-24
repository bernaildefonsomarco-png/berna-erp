# Plan Fase 2.01 — Migraciones de Base de Datos

**Fecha**: 2026-04-20
**Depende de**: Fase 1.5 aplicada (cierres de período, `mapeo_categoria_cuenta` existente)
**Bloquea**: todos los demás planes de Fase 2

---

## Context

Este plan crea toda la base SQL que soporta el rediseño. Al final de su ejecución, la DB está lista para que los planes 02-09 modifiquen UI sin tocar más schema (excepto ajustes menores).

**DECIDIDO** (no re-deliberar):
- Catálogos son tablas dedicadas (ADR-002). Se elimina `catalogos_auxiliares`.
- Cargo y Rol son conceptos separados (ADR-003).
- Obligaciones recurrentes usan modelo `recurrente → instancia` (ADR-004).

**Convenciones del schema real** (confirmadas en `sistema-calzado/supabase_schema.sql`):
- IDs son **`integer` con `serial`/sequences** — NO uuid.
- `plan_cuentas.id_cuenta_contable` (NO `id_cuenta`).
- `cuentas_financieras.id_cuenta`.
- `tipos_movimiento_caja.id_tipo`.
- `movimientos_caja.id_movimiento` con columnas `tipo ('ingreso'|'egreso')`, `monto`, `concepto`, `fecha_movimiento timestamptz`, `id_persona`, `id_tipo`, `id_cuenta_financiera`, `id_ubicacion`.
- `personas_tienda.id_persona` con `rol text CHECK ('vendedora','admin','operador')` y `activa boolean`.
- `ubicaciones.id_ubicacion` con `rol text CHECK ('Tienda','Fabrica')` — nota: no existe literal 'Taller' ni 'Administracion' en la CHECK actual; el rediseño respeta esos valores y agrega 'Administracion' solo como valor lógico dentro de `reglas_mapeo_sugerido` (columna libre, sin FK a `ubicaciones.rol`).
- `permisos_persona.nivel_acceso` (NO `nivel`).

---

## Objetivos

1. Crear 7 tablas nuevas de catálogos (metodos_pago, areas, cargos, motivos_merma, motivos_ajuste, motivos_devolucion, condiciones_pago)
2. Agregar FKs `id_cargo`, `id_area` a `personas_tienda` y migrar los datos de las columnas text existentes
3. Crear tabla `reglas_mapeo_sugerido` + RPC `fn_sugerir_cuenta_para_tipo` para el wizard
4. Crear tabla `obligaciones_recurrentes` + `obligaciones_instancias` + RPCs + vista bandeja
5. Crear tablas `activos_fijos`, `contratos`, `depreciacion_mensual` + RPC depreciación
6. Dropear `catalogos_auxiliares`
7. Actualizar `supabase_schema.sql` (source of truth)

---

## Archivos a crear

Todos en `sistema-calzado/supabase/migrations/`:

1. `20260420_01_catalogos_dedicados.sql`
2. `20260420_02_personas_cargo_area_fks.sql`
3. `20260420_03_reglas_mapeo_sugerido.sql`
4. `20260420_04_obligaciones_recurrentes.sql`
5. `20260420_05_activos_contratos.sql`
6. `20260420_06_drop_catalogos_auxiliares.sql`
7. `20260420_07_hardening_auditoria.sql` — idempotencia + índices + FK integridad + limpieza huérfanas (ver "Migración 7")

Y actualización final de `sistema-calzado/supabase_schema.sql`.

---

## Migración 1 — Catálogos dedicados

**Archivo**: `sistema-calzado/supabase/migrations/20260420_01_catalogos_dedicados.sql`

```sql
-- ============================================================================
-- Fase 2.01 — Catálogos como tablas dedicadas
-- ADR-002: todos los catálogos son tablas dedicadas, no JSON genérico.
-- Reemplaza catalogos_auxiliares (drop en 20260420_06).
-- ============================================================================

-- Función utilitaria updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.trg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- 1. metodos_pago
CREATE TABLE IF NOT EXISTS public.metodos_pago (
    id_metodo            serial PRIMARY KEY,
    codigo               text NOT NULL UNIQUE,
    nombre               text NOT NULL,
    tipo                 text NOT NULL CHECK (tipo IN ('efectivo','digital','tarjeta','transferencia','cheque','otro')),
    requiere_referencia  boolean NOT NULL DEFAULT false,
    activo               boolean NOT NULL DEFAULT true,
    orden                integer NOT NULL DEFAULT 100,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metodos_pago_activo ON public.metodos_pago(activo) WHERE activo;

INSERT INTO public.metodos_pago (codigo, nombre, tipo, orden) VALUES
    ('efectivo','Efectivo','efectivo',10),
    ('yape','Yape','digital',20),
    ('plin','Plin','digital',30),
    ('tarjeta','Tarjeta','tarjeta',40)
ON CONFLICT (codigo) DO NOTHING;

-- 2. areas
CREATE TABLE IF NOT EXISTS public.areas (
    id_area      serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.areas (codigo, nombre, orden) VALUES
    ('tienda','Tienda',10),
    ('taller','Taller',20),
    ('administracion','Administración',30)
ON CONFLICT (codigo) DO NOTHING;

-- 3. cargos (puestos laborales)
CREATE TABLE IF NOT EXISTS public.cargos (
    id_cargo                  serial PRIMARY KEY,
    codigo                    text NOT NULL UNIQUE,
    nombre                    text NOT NULL,
    id_area_default           integer REFERENCES public.areas(id_area),
    salario_sugerido          numeric(12,2),
    id_cuenta_contable_sueldo integer REFERENCES public.plan_cuentas(id_cuenta_contable),
    activo                    boolean NOT NULL DEFAULT true,
    orden                     integer NOT NULL DEFAULT 100,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargos_activo ON public.cargos(activo) WHERE activo;

INSERT INTO public.cargos (codigo, nombre, id_area_default, salario_sugerido, orden)
SELECT c.codigo, c.nombre, a.id_area, c.salario, c.orden
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
LEFT JOIN public.areas a ON a.codigo = c.area_codigo
ON CONFLICT (codigo) DO NOTHING;

-- 4-6. motivos_merma, motivos_ajuste, motivos_devolucion (estructura idéntica)
CREATE TABLE IF NOT EXISTS public.motivos_merma (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_merma (codigo, nombre, orden) VALUES
    ('defecto_fabrica','Defecto de fábrica',10),
    ('dano_transporte','Daño en transporte',20),
    ('robo','Robo / extravío',30),
    ('vencimiento','Vencimiento',40),
    ('otro','Otro',99)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.motivos_ajuste (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_ajuste (codigo, nombre, orden) VALUES
    ('error_registro','Error de registro',10),
    ('conciliacion_bancaria','Conciliación bancaria',20),
    ('ajuste_inventario','Ajuste de inventario',30),
    ('otro','Otro',99)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.motivos_devolucion (
    id_motivo    serial PRIMARY KEY,
    codigo       text NOT NULL UNIQUE,
    nombre       text NOT NULL,
    activo       boolean NOT NULL DEFAULT true,
    orden        integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.motivos_devolucion (codigo, nombre, orden) VALUES
    ('no_le_quedo','No le quedó al cliente',10),
    ('defecto','Defecto del producto',20),
    ('cambio_de_opinion','Cambio de opinión',30),
    ('talla_equivocada','Talla equivocada',40)
ON CONFLICT (codigo) DO NOTHING;

-- 7. condiciones_pago
CREATE TABLE IF NOT EXISTS public.condiciones_pago (
    id_condicion  serial PRIMARY KEY,
    codigo        text NOT NULL UNIQUE,
    nombre        text NOT NULL,
    dias_credito  integer NOT NULL DEFAULT 0,
    activo        boolean NOT NULL DEFAULT true,
    orden         integer NOT NULL DEFAULT 100,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.condiciones_pago (codigo, nombre, dias_credito, orden) VALUES
    ('contado','Contado',0,10),
    ('credito_15','Crédito 15 días',15,20),
    ('credito_30','Crédito 30 días',30,30),
    ('credito_60','Crédito 60 días',60,40)
ON CONFLICT (codigo) DO NOTHING;

-- Triggers updated_at en los 7 catálogos
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['metodos_pago','areas','cargos','motivos_merma','motivos_ajuste','motivos_devolucion','condiciones_pago']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%s;', t, t);
        EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();', t, t);
    END LOOP;
END $$;

-- Grants PostgREST
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.metodos_pago, public.areas, public.cargos,
  public.motivos_merma, public.motivos_ajuste, public.motivos_devolucion, public.condiciones_pago
  TO anon, authenticated;
GRANT USAGE, SELECT ON
  SEQUENCE public.metodos_pago_id_metodo_seq,
           public.areas_id_area_seq,
           public.cargos_id_cargo_seq,
           public.motivos_merma_id_motivo_seq,
           public.motivos_ajuste_id_motivo_seq,
           public.motivos_devolucion_id_motivo_seq,
           public.condiciones_pago_id_condicion_seq
  TO anon, authenticated;
```

**Criterios de aceptación**:
- Las 7 tablas existen con `serial PRIMARY KEY`.
- `SELECT count(*) FROM metodos_pago;` ≥ 4.
- `SELECT count(*) FROM cargos;` ≥ 10.
- `SELECT count(*) FROM areas;` = 3.
- Cada tabla tiene trigger `trg_<tabla>_updated` funcional.

---

## Migración 2 — FKs en personas_tienda

**Archivo**: `sistema-calzado/supabase/migrations/20260420_02_personas_cargo_area_fks.sql`

```sql
-- ============================================================================
-- Fase 2.02 — personas_tienda: FKs id_cargo + id_area
-- Reemplaza progresivamente columnas text libres 'cargo' y 'area' por FKs.
-- Las columnas viejas se mantienen marcadas DEPRECATED (no se dropean).
-- ============================================================================

ALTER TABLE public.personas_tienda
    ADD COLUMN IF NOT EXISTS id_cargo integer REFERENCES public.cargos(id_cargo),
    ADD COLUMN IF NOT EXISTS id_area  integer REFERENCES public.areas(id_area);

-- Poblar id_area desde columna text area (match por codigo)
UPDATE public.personas_tienda p
SET id_area = a.id_area
FROM public.areas a
WHERE p.id_area IS NULL
  AND lower(coalesce(p.area,'')) = a.codigo;

-- Poblar id_cargo por match codigo OR nombre (case-insensitive)
UPDATE public.personas_tienda p
SET id_cargo = c.id_cargo
FROM public.cargos c
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND trim(p.cargo) <> ''
  AND (
    regexp_replace(lower(p.cargo), '[^a-z0-9]+', '_', 'g') = c.codigo
    OR lower(p.cargo) = lower(c.nombre)
  );

-- Insertar cargos nuevos para strings libres sin match (preserva datos)
INSERT INTO public.cargos (codigo, nombre, activo, orden)
SELECT
    regexp_replace(lower(trim(p.cargo)), '[^a-z0-9]+', '_', 'g') AS codigo,
    trim(p.cargo) AS nombre,
    true,
    200
FROM public.personas_tienda p
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND trim(p.cargo) <> ''
GROUP BY trim(p.cargo)
ON CONFLICT (codigo) DO NOTHING;

-- Re-poblar id_cargo con los recién insertados
UPDATE public.personas_tienda p
SET id_cargo = c.id_cargo
FROM public.cargos c
WHERE p.id_cargo IS NULL
  AND p.cargo IS NOT NULL
  AND regexp_replace(lower(trim(p.cargo)), '[^a-z0-9]+', '_', 'g') = c.codigo;

CREATE INDEX IF NOT EXISTS idx_personas_id_cargo ON public.personas_tienda(id_cargo);
CREATE INDEX IF NOT EXISTS idx_personas_id_area  ON public.personas_tienda(id_area);

COMMENT ON COLUMN public.personas_tienda.cargo IS
  'DEPRECATED (Fase 2): usar id_cargo FK → cargos. Mantenido para retrocompatibilidad.';
COMMENT ON COLUMN public.personas_tienda.area IS
  'DEPRECATED (Fase 2): usar id_area FK → areas. Mantenido para retrocompatibilidad.';
```

**Criterios de aceptación**:
- `SELECT count(*) FROM personas_tienda WHERE cargo IS NOT NULL AND id_cargo IS NULL;` = 0
- `SELECT count(*) FROM personas_tienda WHERE area IS NOT NULL AND id_area IS NULL;` = 0

---

## Migración 3 — Reglas de mapeo sugerido

**Archivo**: `sistema-calzado/supabase/migrations/20260420_03_reglas_mapeo_sugerido.sql`

```sql
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
```

**Criterios de aceptación**:
- `SELECT fn_sugerir_cuenta_para_tipo('gasto_operativo', 'Tienda');` devuelve un integer no-nulo si el plan de cuentas tiene al menos una cuenta en `seccion_pl='gastos_operativos'`.
- Si no hay match, devuelve NULL — el wizard debe manejar ese caso con "Seleccionar manualmente".

---

## Migración 4 — Obligaciones recurrentes

**Archivo**: `sistema-calzado/supabase/migrations/20260420_04_obligaciones_recurrentes.sql`

```sql
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
```

**Criterios de aceptación**:
- Insertar una obligación recurrente de prueba + llamar `fn_generar_obligaciones_pendientes(45)` genera ≥ 1 instancia.
- `SELECT * FROM v_obligaciones_bandeja;` muestra la instancia.
- Pago via `fn_pagar_obligacion` inserta en `movimientos_caja` con `tipo='egreso'` y liga el id.

---

## Migración 5 — Activos y contratos

**Archivo**: `sistema-calzado/supabase/migrations/20260420_05_activos_contratos.sql`

```sql
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
```

**Criterios de aceptación**:
- Insertar un activo de prueba + `SELECT fn_generar_depreciacion_mensual(2026, 4);` genera ≥ 1 fila en `depreciacion_mensual`.
- `v_activos_con_valor_neto` refleja el valor neto correcto.

---

## Migración 6 — Drop catalogos_auxiliares

**Archivo**: `sistema-calzado/supabase/migrations/20260420_06_drop_catalogos_auxiliares.sql`

```sql
-- ============================================================================
-- Fase 2.06 — Drop catalogos_auxiliares (ADR-002)
-- Ejecutar SOLO después de confirmar migración de datos útiles.
-- ============================================================================

DO $$
DECLARE
    v_count integer;
BEGIN
    IF to_regclass('public.catalogos_auxiliares') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.catalogos_auxiliares WHERE activo = true' INTO v_count;
        IF v_count > 0 THEN
            RAISE NOTICE 'catalogos_auxiliares aún tiene % fila(s) activa(s). Verifique migración antes del DROP.', v_count;
        END IF;
    END IF;
END $$;

DROP TABLE IF EXISTS public.catalogos_auxiliares CASCADE;
```

**Criterio de aceptación**:
- `SELECT to_regclass('public.catalogos_auxiliares');` devuelve NULL.

---

## Migración 7 — Hardening de auditoría (aceptados del round de revisión)

**Archivo**: `sistema-calzado/supabase/migrations/20260420_07_hardening_auditoria.sql`

**Contexto** — una auditoría externa identificó 4 puntos de bajo costo / alto valor que deben incorporarse a Fase 2. Los otros puntos de esa auditoría (outbox pattern async, offline queue IndexedDB, particionado de `audit_log`, cierre por ubicación, simplificar el wizard) fueron **rechazados** como over-engineering o por contradecir ADRs ya aceptados (ver ADR-005 para wizard).

### 7.1 — Idempotency keys en ventas y movimientos

Previene duplicados en reintentos de red (WiFi inestable en tiendas). El cliente genera un UUID antes del POST; el servidor rechaza el duplicado vía `UNIQUE`.

```sql
ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventas_idempotency
    ON public.ventas(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.movimientos_caja
    ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_idempotency
    ON public.movimientos_caja(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.ventas.idempotency_key IS
  'UUID generado en cliente antes del POST. Permite reintentar POST sin duplicar venta.';
COMMENT ON COLUMN public.movimientos_caja.idempotency_key IS
  'UUID generado en cliente antes del POST. Permite reintentar POST sin duplicar movimiento.';
```

**Impacto en el frontend** (no-blocking para esta migración, registrado aquí como nota para planes posteriores):
- `VentasPOS.jsx` y `QuickEntryUniversal` deben generar `crypto.randomUUID()` al abrir el form y enviarlo en el payload.
- Si el POST responde 409/23505 (`unique_violation` en `idempotency_key`), el cliente trata como éxito (la operación ya se registró en un intento anterior).

### 7.2 — Índice compuesto en `obligaciones_instancias`

Acelera la bandeja (vista `v_obligaciones_bandeja`) al crecer en volumen.

```sql
CREATE INDEX IF NOT EXISTS idx_obligaciones_instancias_bandeja
    ON public.obligaciones_instancias(estado, fecha_vencimiento)
    WHERE estado IN ('proyectado','confirmado','vencido','pagado_parcial','acumulado');
```

### 7.3 — Auditoría de FKs históricas (ON DELETE RESTRICT)

Previene pérdida de historial al borrar personas, cuentas, tipos o ubicaciones referenciados por movimientos pasados. Para cada FK que apunte a entidad maestra desde una tabla de hechos, la regla es **RESTRICT**.

```sql
-- Helper: aplicar RESTRICT a una FK existente solo si no lo está ya.
-- Se ejecuta como bloque ad-hoc; cada ALTER drop+add es idempotente porque
-- el nombre de la constraint se fuerza.

-- ventas → personas_tienda
ALTER TABLE public.ventas
    DROP CONSTRAINT IF EXISTS ventas_id_persona_fkey,
    ADD  CONSTRAINT ventas_id_persona_fkey
        FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona) ON DELETE RESTRICT;

-- ventas → ubicaciones
ALTER TABLE public.ventas
    DROP CONSTRAINT IF EXISTS ventas_id_ubicacion_fkey,
    ADD  CONSTRAINT ventas_id_ubicacion_fkey
        FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE RESTRICT;

-- movimientos_caja → personas_tienda
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_persona_fkey,
    ADD  CONSTRAINT movimientos_caja_id_persona_fkey
        FOREIGN KEY (id_persona) REFERENCES public.personas_tienda(id_persona) ON DELETE RESTRICT;

-- movimientos_caja → tipos_movimiento_caja
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_tipo_fkey,
    ADD  CONSTRAINT movimientos_caja_id_tipo_fkey
        FOREIGN KEY (id_tipo) REFERENCES public.tipos_movimiento_caja(id_tipo) ON DELETE RESTRICT;

-- movimientos_caja → cuentas_financieras
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_cuenta_financiera_fkey,
    ADD  CONSTRAINT movimientos_caja_id_cuenta_financiera_fkey
        FOREIGN KEY (id_cuenta_financiera) REFERENCES public.cuentas_financieras(id_cuenta) ON DELETE RESTRICT;

-- movimientos_caja → ubicaciones
ALTER TABLE public.movimientos_caja
    DROP CONSTRAINT IF EXISTS movimientos_caja_id_ubicacion_fkey,
    ADD  CONSTRAINT movimientos_caja_id_ubicacion_fkey
        FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE RESTRICT;

-- movimiento_splits → plan_cuentas
ALTER TABLE public.movimiento_splits
    DROP CONSTRAINT IF EXISTS movimiento_splits_id_cuenta_contable_fkey,
    ADD  CONSTRAINT movimiento_splits_id_cuenta_contable_fkey
        FOREIGN KEY (id_cuenta_contable) REFERENCES public.plan_cuentas(id_cuenta_contable) ON DELETE RESTRICT;

-- NOTA: repetir el patrón DROP/ADD para cualquier otra FK histórica que
-- surja al revisar el schema con:
--   SELECT conname, conrelid::regclass, confrelid::regclass, confdeltype
--   FROM pg_constraint WHERE contype = 'f'
--     AND confrelid::regclass::text IN
--       ('personas_tienda','ubicaciones','cuentas_financieras',
--        'tipos_movimiento_caja','plan_cuentas')
--     AND confdeltype = 'a'; -- 'a' = NO ACTION (equivale a RESTRICT sólo en el caso trivial)
```

### 7.4 — Verificación y limpieza de tablas huérfanas

La auditoría sospecha que `plantillas_recurrentes` y `vistas_guardadas` son tablas huérfanas sin feature asociada. La regla: **verificar antes de dropear**, nunca silenciosamente.

```sql
-- Verificación (informativa). Si alguna tabla no existe, el bloque no falla.
DO $$
DECLARE
    v_plantillas   integer := -1;
    v_vistas       integer := -1;
BEGIN
    IF to_regclass('public.plantillas_recurrentes') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.plantillas_recurrentes' INTO v_plantillas;
        RAISE NOTICE 'plantillas_recurrentes existe con % fila(s). Revisar si se reemplaza por obligaciones_recurrentes (ADR-004).', v_plantillas;
    END IF;

    IF to_regclass('public.vistas_guardadas') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.vistas_guardadas' INTO v_vistas;
        RAISE NOTICE 'vistas_guardadas existe con % fila(s). Si no hay feature activa, dropear manualmente tras revisión.', v_vistas;
    END IF;
END $$;

-- Drop explícito SOLO si la revisión manual confirma que son huérfanas.
-- Comentados por seguridad: descomentar tras confirmar en el entorno real.
-- DROP TABLE IF EXISTS public.plantillas_recurrentes CASCADE;
-- DROP TABLE IF EXISTS public.vistas_guardadas CASCADE;
```

**Acción manual requerida antes de aplicar esta migración**:
1. Confirmar en el repo que ningún `.jsx` lee/escribe `plantillas_recurrentes` ni `vistas_guardadas`.
2. Confirmar en producción la cantidad de filas (los `RAISE NOTICE` lo imprimen).
3. Si ambas están vacías o solo tienen datos de pruebas, descomentar los `DROP TABLE` antes de ejecutar.

### 7.5 — Criterios de aceptación (Migración 7)

- [ ] `\d+ ventas` muestra columna `idempotency_key` e índice único parcial.
- [ ] `\d+ movimientos_caja` muestra columna `idempotency_key` e índice único parcial.
- [ ] `\d+ obligaciones_instancias` muestra índice `idx_obligaciones_instancias_bandeja`.
- [ ] `SELECT confdeltype FROM pg_constraint WHERE conname='ventas_id_persona_fkey';` = `'r'` (RESTRICT).
- [ ] `RAISE NOTICE` de 7.4 imprime estado de `plantillas_recurrentes` y `vistas_guardadas` sin error.

**Rechazados de la auditoría** (documentado aquí para cerrar el tema):

| Punto | Razón de rechazo |
|---|---|
| Outbox pattern async (eventos_pendientes + Edge Function cron) | Over-engineering para 3-5 tiendas / ~5 usuarios concurrentes. Introduce latencia eventual donde el negocio espera inmediatez. Revisitar solo si se mide bottleneck real. |
| `FOR UPDATE` en `cuentas_financieras` como bloqueo crítico | Carga real no justifica el diagnóstico. Trigger `fn_validar_saldo_cuenta_no_negativo` requiere atomicidad. |
| Simplificar wizard de tipos a un formulario plano | Contradice ADR-005 directamente. El wizard existe para usuarios no-contadores; un "dropdown de categoría" requiere conocimiento contable. |
| Offline queue con IndexedDB | Fuera de scope de Fase 2. Idempotency key (7.1) cubre el 80% del dolor real. |
| Particionar `audit_log` por mes | Prematuro a volumen actual. Revisitar al superar 10M filas. |
| Cierre por ubicación (`id_ubicacion NULL` en `cierres_periodo`) | Complejidad alta, beneficio marginal. Reportes filtrables por ubicación cubren el caso. |

---

## Actualización de `supabase_schema.sql`

El archivo es un dump de referencia ("WARNING: not meant to be run" — ver línea 1). Al terminar las 6 migrations aplicadas:

1. **Eliminar** el bloque `CREATE TABLE IF NOT EXISTS public.catalogos_auxiliares (…)` y su índice `idx_catalogos_auxiliares_codigo_ci`.
2. **Agregar** al final, en orden: bloques `CREATE TABLE` de las 13 tablas nuevas (`metodos_pago`, `areas`, `cargos`, `motivos_merma`, `motivos_ajuste`, `motivos_devolucion`, `condiciones_pago`, `reglas_mapeo_sugerido`, `obligaciones_recurrentes`, `obligaciones_instancias`, `activos_fijos`, `contratos`, `depreciacion_mensual`) — copiar del SQL de las migraciones 1–5.
3. **Agregar** las 2 columnas nuevas a `personas_tienda`: `id_cargo integer`, `id_area integer`.
4. **Agregar** las vistas `v_obligaciones_bandeja`, `v_activos_con_valor_neto`, `v_depreciacion_mensual_resumen`.
5. **Agregar** las funciones `fn_sugerir_cuenta_para_tipo`, `fn_confirmar_monto_obligacion`, `fn_pagar_obligacion`, `fn_generar_obligaciones_pendientes`, `fn_generar_depreciacion_mensual`, `fn_oblig_actualizar_estado_vencido`, `trg_set_updated_at`.

---

## Ejecución

1. Verificar Supabase accesible y Fase 1.5 aplicada.
2. Aplicar migraciones en orden estricto (Supabase Studio → SQL Editor, o `psql`):
   ```bash
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_01_catalogos_dedicados.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_02_personas_cargo_area_fks.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_03_reglas_mapeo_sugerido.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_04_obligaciones_recurrentes.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_05_activos_contratos.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_06_drop_catalogos_auxiliares.sql
   psql $SUPABASE_DB_URL -f sistema-calzado/supabase/migrations/20260420_07_hardening_auditoria.sql
   ```
3. Actualizar `supabase_schema.sql` con los bloques nuevos.
4. Commit: `git commit -m "feat(fase2-01): migraciones DB catalogos dedicados + obligaciones + activos"`

---

## Criterios de aceptación globales

- [ ] Las 7 migrations ejecutan sin error
- [ ] `SELECT count(*) FROM metodos_pago;` ≥ 4
- [ ] `SELECT count(*) FROM cargos;` ≥ 10
- [ ] `SELECT count(*) FROM areas;` = 3
- [ ] `SELECT count(*) FROM personas_tienda WHERE cargo IS NOT NULL AND id_cargo IS NULL;` = 0
- [ ] `SELECT to_regclass('public.catalogos_auxiliares');` devuelve NULL
- [ ] `SELECT fn_sugerir_cuenta_para_tipo('gasto_operativo','Tienda');` devuelve integer no-nulo (o NULL si no hay cuentas en esa sección del plan)
- [ ] `SELECT fn_generar_obligaciones_pendientes(45);` devuelve integer ≥ 0 sin error
- [ ] `supabase_schema.sql` refleja las nuevas tablas y NO incluye `catalogos_auxiliares`
- [ ] `ventas.idempotency_key` y `movimientos_caja.idempotency_key` existen con índice único parcial
- [ ] `idx_obligaciones_instancias_bandeja` existe
- [ ] FKs históricas clave (ventas, movimientos_caja, movimiento_splits) tienen `ON DELETE RESTRICT`
- [ ] `plantillas_recurrentes` y `vistas_guardadas` verificadas (dropeadas si estaban huérfanas)
- [ ] Commit de las 7 migraciones + schema actualizado
