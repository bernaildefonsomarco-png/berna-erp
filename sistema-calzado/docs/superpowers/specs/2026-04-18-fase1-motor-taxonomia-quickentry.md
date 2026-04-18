# Fase 1 — Motor de Taxonomía Universal + QuickEntry

**Fecha:** 2026-04-18
**Autor:** Marco + Claude
**Estado:** Aprobado — listo para planificación de implementación
**Contexto padre:** Visión arquitectónica empresarial del ERP Berna (5 fases)

---

## 1. Motivación

El sistema actual tiene tres problemas estructurales que bloquean escalabilidad empresarial:

1. **Rigidez taxonómica.** Categorías de costos, tipos de movimiento, roles de persona y secciones de P&L están enumeradas como `CHECK IN (...)` en SQL o como constantes hardcoded en JSX. Agregar un nuevo tipo requiere migración + cambio de código.
2. **Registro disperso y redundante.** `Costos Fijos`, `Movimientos`, `Transferencias` son módulos de **registro manual** con formularios largos que piden ubicación, cuenta contable, cuenta financiera. El usuario debe conocer el plan contable. Alta fricción, alto error.
3. **Contextualización nula.** Registrar un gasto desde una tienda específica no pre-llena la ubicación. Registrar desde POS no vincula a la venta. No existe un componente único de entrada rápida.

### Objetivos de Fase 1

- Convertir catálogos rígidos en **datos administrables por UI** (sin migraciones para operación diaria).
- Introducir un **componente `QuickEntry` universal** que se reutiliza desde 5 superficies (Comando, Caja POS, Producción, Hub Ubicación, Tienda).
- Convertir `Costos Fijos`, `Movimientos`, `Transferencias` en **módulos de solo lectura/análisis** (registro ocurre desde contextos).
- Renombrar `Costos Fijos` → `Estructura Financiera` (bidireccional: egresos e ingresos recurrentes).
- Renombrar `Rápido` → `Comando` (ejecutivo, preparado para notificaciones futuras).
- Introducir **audit trail y períodos cerrados** para gobernanza financiera.
- Introducir **wizard "Abrir Nueva Ubicación"** para onboarding sin fricción de tiendas/talleres futuros.

### Fuera de alcance de Fase 1

- Venta Online (POS virtual) — postergado hasta lanzamiento de canal TikTok/Instagram.
- Módulo tributario (IGV, facturación electrónica).
- Multi-tenant (campo `id_organizacion`) — solo documentado, no implementado.
- Hub Ubicación empresarial full (activos, contratos) — Fase 2.
- Workers v2 (rotativos multi-área) — Fase 3.

---

## 2. Modelo de datos

### 2.1 ALTERs sobre tablas existentes

#### `tipos_movimiento_caja` — convertir en motor de comportamiento

```sql
ALTER TABLE tipos_movimiento_caja
  ADD COLUMN direccion text CHECK (direccion IN ('entrada','salida','transferencia')),
  ADD COLUMN id_cuenta_contable_default integer REFERENCES plan_cuentas(id_cuenta),
  ADD COLUMN id_cuenta_financiera_default integer REFERENCES cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN id_cuenta_origen_default integer REFERENCES cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN id_cuenta_destino_default integer REFERENCES cuentas_financieras(id_cuenta_financiera),
  ADD COLUMN scope text[] NOT NULL DEFAULT '{manual}',      -- {comando, pos, produccion, tienda, manual, automatico}
  ADD COLUMN comportamientos text[] NOT NULL DEFAULT '{}',  -- {requiere_ubicacion, requiere_persona, genera_splits, ...}
  ADD COLUMN campos_requeridos jsonb NOT NULL DEFAULT '[]', -- [{ key, label, tipo, requerido }]
  ADD COLUMN afecta_patrimonio boolean NOT NULL DEFAULT true,
  ADD COLUMN color_hex text,
  ADD COLUMN solo_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN naturaleza text,                               -- 'operativo'|'extraordinario'|'interno'
  ADD COLUMN moneda char(3) NOT NULL DEFAULT 'PEN';
```

#### `movimientos_caja` — agregar FKs de trazabilidad + snapshot + moneda

```sql
ALTER TABLE movimientos_caja
  ADD COLUMN id_plantilla_origen integer REFERENCES plantillas_recurrentes(id_plantilla),
  ADD COLUMN id_venta integer REFERENCES ventas(id_venta),
  ADD COLUMN id_lote_produccion integer REFERENCES lotes_produccion(id_lote),
  ADD COLUMN snapshot_tipo_nombre text,                     -- nombre del tipo al momento del registro (historicidad)
  ADD COLUMN moneda char(3) NOT NULL DEFAULT 'PEN';

CREATE INDEX ON movimientos_caja(id_plantilla_origen) WHERE id_plantilla_origen IS NOT NULL;
CREATE INDEX ON movimientos_caja(id_venta) WHERE id_venta IS NOT NULL;
CREATE INDEX ON movimientos_caja(id_lote_produccion) WHERE id_lote_produccion IS NOT NULL;
CREATE INDEX ON movimientos_caja(id_ubicacion, fecha_movimiento DESC);
```

#### `cuentas_financieras` — preparar moneda

```sql
ALTER TABLE cuentas_financieras
  ADD COLUMN moneda char(3) NOT NULL DEFAULT 'PEN';
```

#### `personas_tienda.rol` — quitar CHECK rígido

```sql
ALTER TABLE personas_tienda DROP CONSTRAINT IF EXISTS personas_tienda_rol_check;
-- Valores válidos ahora viven en roles_persona (ver §2.2)
```

#### `costos_fijos` — quitar CHECK de categoría

```sql
ALTER TABLE costos_fijos DROP CONSTRAINT IF EXISTS costos_fijos_categoria_check;
-- Tabla pasa a ser alimentada desde plantillas_recurrentes (read-only desde UI)
```

### 2.2 Tablas nuevas

#### `plantillas_recurrentes` — eventos económicos periódicos

```sql
CREATE TABLE plantillas_recurrentes (
  id_plantilla serial PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  id_tipo integer NOT NULL REFERENCES tipos_movimiento_caja(id_tipo),
  id_ubicacion integer REFERENCES ubicaciones(id_ubicacion),
  id_cuenta_contable integer REFERENCES plan_cuentas(id_cuenta),
  id_cuenta_financiera_default integer REFERENCES cuentas_financieras(id_cuenta_financiera),
  direccion text,                              -- redundante con tipo, pero permite override
  monto_estimado numeric(14,2),
  frecuencia text NOT NULL,                    -- 'mensual'|'quincenal'|'semanal'|'unico'
  dia_referencia integer,                      -- día del mes o semana según frecuencia
  comportamientos text[] NOT NULL DEFAULT '{}',
  id_plantilla_objetivo integer REFERENCES plantillas_recurrentes(id_plantilla), -- self-FK para provisionables
  tarifa_por_unidad numeric(14,2),             -- usado cuando comportamientos contiene 'calcular_por_unidad'
  estado text NOT NULL DEFAULT 'activa',       -- 'activa'|'pausada'|'archivada'
  activo boolean NOT NULL DEFAULT true,
  datos_extra jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON plantillas_recurrentes(id_ubicacion) WHERE id_ubicacion IS NOT NULL;
CREATE INDEX ON plantillas_recurrentes(id_tipo);
CREATE INDEX ON plantillas_recurrentes(estado) WHERE activo = true;
CREATE UNIQUE INDEX ON plantillas_recurrentes(lower(codigo));
```

#### `plantilla_ejecuciones` — idempotencia de generación

```sql
CREATE TABLE plantilla_ejecuciones (
  id_ejecucion serial PRIMARY KEY,
  id_plantilla integer NOT NULL REFERENCES plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  periodo text NOT NULL,                       -- 'YYYY-MM' para mensual, 'YYYY-WW' para semanal
  fecha_generada timestamptz NOT NULL DEFAULT now(),
  id_movimiento integer REFERENCES movimientos_caja(id_movimiento),
  id_persona_actor integer REFERENCES personas_tienda(id_persona),
  notas text,
  UNIQUE (id_plantilla, periodo)
);

CREATE INDEX ON plantilla_ejecuciones(id_plantilla, periodo);
```

#### `mapeo_tipo_cuenta` — resolución contable por rol de ubicación

```sql
CREATE TABLE mapeo_tipo_cuenta (
  id_mapeo serial PRIMARY KEY,
  id_tipo integer NOT NULL REFERENCES tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  ubicacion_rol text NOT NULL,                 -- 'Tienda'|'Taller'|'*' (wildcard)
  id_cuenta_contable integer NOT NULL REFERENCES plan_cuentas(id_cuenta),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (id_tipo, ubicacion_rol)
);

CREATE INDEX ON mapeo_tipo_cuenta(id_tipo);
```

#### `catalogos_auxiliares` — listas extensibles sin migración

```sql
CREATE TABLE catalogos_auxiliares (
  id_catalogo serial PRIMARY KEY,
  codigo text UNIQUE NOT NULL,                 -- 'roles_persona', 'frecuencias_pago', etc.
  nombre text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',           -- [{ codigo, label, metadata }]
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON catalogos_auxiliares(lower(codigo));
```

#### `roles_persona` — catálogo auxiliar explícito (reemplaza CHECK)

```sql
CREATE TABLE roles_persona (
  id_rol serial PRIMARY KEY,
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  ambito text,                                 -- 'Tienda'|'Taller'|'Ambos'
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX ON roles_persona(lower(codigo));
```

#### `periodos_contables` — cierre de períodos

```sql
CREATE TABLE periodos_contables (
  id_periodo serial PRIMARY KEY,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  cerrado_por integer REFERENCES personas_tienda(id_persona),
  cerrado_en timestamptz,
  motivo_reapertura text,
  UNIQUE (year, month)
);
```

#### `tipo_eventos` y `plantilla_eventos` — audit trail de catálogos

```sql
CREATE TABLE tipo_eventos (
  id_evento serial PRIMARY KEY,
  id_tipo integer NOT NULL REFERENCES tipos_movimiento_caja(id_tipo) ON DELETE CASCADE,
  tipo_evento text NOT NULL,                   -- 'creado'|'editado'|'desactivado'|'reactivado'
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON tipo_eventos(id_tipo, created_at DESC);

CREATE TABLE plantilla_eventos (
  id_evento serial PRIMARY KEY,
  id_plantilla integer NOT NULL REFERENCES plantillas_recurrentes(id_plantilla) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES personas_tienda(id_persona),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON plantilla_eventos(id_plantilla, created_at DESC);
```

#### `audit_log` — audit trail genérico para transacciones financieras

```sql
CREATE TABLE audit_log (
  id_audit bigserial PRIMARY KEY,
  tabla text NOT NULL,
  id_registro text NOT NULL,                   -- texto para aceptar PKs compuestas
  accion text NOT NULL CHECK (accion IN ('insert','update','delete')),
  datos_antes jsonb,
  datos_despues jsonb,
  id_persona_actor integer REFERENCES personas_tienda(id_persona),
  ip_origen text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_log(tabla, id_registro, created_at DESC);
CREATE INDEX ON audit_log(id_persona_actor, created_at DESC);
```

### 2.3 Triggers críticos

```sql
-- Inmutabilidad de audit trail
CREATE FUNCTION fn_bloquear_modificacion_audit() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'AUDIT_INMUTABLE: registros de auditoría no pueden modificarse'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_inmutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion_audit();
CREATE TRIGGER trg_tipo_eventos_inmutable BEFORE UPDATE OR DELETE ON tipo_eventos
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion_audit();
CREATE TRIGGER trg_plantilla_eventos_inmutable BEFORE UPDATE OR DELETE ON plantilla_eventos
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion_audit();

-- Audit automático de movimientos_caja (y transferencias, splits, costos_fijos)
CREATE FUNCTION fn_audit_generico() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log(tabla, id_registro, accion, datos_antes, datos_despues, id_persona_actor)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id_movimiento::text, OLD.id_movimiento::text),
    lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
    current_setting('app.id_persona_actor', true)::integer
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_movimientos_caja AFTER INSERT OR UPDATE OR DELETE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_audit_generico();
-- Análogos para transferencias_internas, movimiento_splits, costos_fijos

-- Bloqueo de períodos cerrados
CREATE FUNCTION fn_bloquear_periodo_cerrado() RETURNS trigger AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM periodos_contables
  WHERE year = EXTRACT(year FROM COALESCE(NEW.fecha_movimiento, OLD.fecha_movimiento))
    AND month = EXTRACT(month FROM COALESCE(NEW.fecha_movimiento, OLD.fecha_movimiento));
  IF v_estado = 'cerrado' THEN
    RAISE EXCEPTION 'PERIODO_CERRADO: no se puede modificar movimientos de un período cerrado';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bloquear_periodo_cerrado BEFORE INSERT OR UPDATE OR DELETE ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_periodo_cerrado();

-- Integridad de splits (suma == total del padre)
CREATE FUNCTION fn_validar_suma_splits() RETURNS trigger AS $$
DECLARE v_total numeric; v_suma numeric; v_id integer;
BEGIN
  v_id := COALESCE(NEW.id_movimiento, OLD.id_movimiento);
  SELECT monto INTO v_total FROM movimientos_caja WHERE id_movimiento = v_id;
  SELECT COALESCE(SUM(monto),0) INTO v_suma FROM movimiento_splits WHERE id_movimiento = v_id;
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'SPLIT_DESBALANCEADO: suma=% total=%', v_suma, v_total;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_validar_suma_splits
  AFTER INSERT OR UPDATE OR DELETE ON movimiento_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_validar_suma_splits();

-- Snapshot automático de tipo_nombre en movimientos
CREATE FUNCTION fn_snapshot_tipo_nombre() RETURNS trigger AS $$
BEGIN
  IF NEW.id_tipo IS NOT NULL AND NEW.snapshot_tipo_nombre IS NULL THEN
    SELECT nombre INTO NEW.snapshot_tipo_nombre FROM tipos_movimiento_caja WHERE id_tipo = NEW.id_tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_tipo_nombre BEFORE INSERT ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_snapshot_tipo_nombre();
```

### 2.4 Funciones RPC

#### `fn_resolver_cuenta_contable(id_tipo, id_ubicacion, id_plantilla_origen) → id_cuenta`

Cascada:
1. Si `id_plantilla_origen` existe y tiene `id_cuenta_contable` → usar ese.
2. Sino, buscar en `mapeo_tipo_cuenta` con `(id_tipo, rol_de_ubicacion)`.
3. Sino, buscar en `mapeo_tipo_cuenta` con `(id_tipo, '*')`.
4. Sino, `tipos_movimiento_caja.id_cuenta_contable_default`.
5. Sino, NULL (QuickEntry pide al usuario).

#### `fn_registrar_hecho_economico(...)` — punto único de entrada

```sql
CREATE FUNCTION fn_registrar_hecho_economico(
  p_id_tipo integer,
  p_monto numeric,
  p_id_ubicacion integer DEFAULT NULL,
  p_id_cuenta_financiera integer DEFAULT NULL,
  p_splits jsonb DEFAULT NULL,                 -- [{id_cuenta_financiera, monto, es_prestamo}]
  p_id_plantilla_origen integer DEFAULT NULL,
  p_id_venta integer DEFAULT NULL,
  p_id_lote_produccion integer DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_datos_extra jsonb DEFAULT '{}',
  p_fecha timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_id_cuenta_contable integer;
  v_id_movimiento integer;
  v_rol text;
  v_direccion text;
BEGIN
  -- Lock de cuenta financiera (concurrencia)
  IF p_id_cuenta_financiera IS NOT NULL THEN
    PERFORM 1 FROM cuentas_financieras WHERE id_cuenta_financiera = p_id_cuenta_financiera FOR UPDATE;
  END IF;

  -- Resolver cuenta contable
  v_id_cuenta_contable := fn_resolver_cuenta_contable(p_id_tipo, p_id_ubicacion, p_id_plantilla_origen);

  -- Insertar movimiento (trigger fn_snapshot_tipo_nombre poblará snapshot)
  INSERT INTO movimientos_caja(
    id_tipo, id_ubicacion, id_cuenta_financiera, id_cuenta_contable,
    monto, nota, datos_extra, fecha_movimiento,
    id_plantilla_origen, id_venta, id_lote_produccion
  ) VALUES (
    p_id_tipo, p_id_ubicacion, p_id_cuenta_financiera, v_id_cuenta_contable,
    p_monto, p_nota, p_datos_extra, p_fecha,
    p_id_plantilla_origen, p_id_venta, p_id_lote_produccion
  ) RETURNING id_movimiento INTO v_id_movimiento;

  -- Insertar splits si existen (y auto-generar transferencia interna si es_prestamo=true)
  IF p_splits IS NOT NULL THEN
    PERFORM fn_aplicar_splits(v_id_movimiento, p_splits);
  END IF;

  RETURN v_id_movimiento;
END $$;
```

#### `fn_generar_movimiento_desde_plantilla(id_plantilla, periodo)` → idempotente

Inserta `plantilla_ejecuciones` con `ON CONFLICT (id_plantilla, periodo) DO NOTHING`; solo si la fila se insertó, llama a `fn_registrar_hecho_economico` y actualiza `id_movimiento`.

### 2.5 Vistas

```sql
-- Búsqueda fuzzy en QuickEntry
CREATE INDEX ON tipos_movimiento_caja USING gin (nombre gin_trgm_ops);

-- Salud del sistema (observabilidad)
CREATE VIEW v_sistema_salud AS
SELECT
  (SELECT count(*) FROM movimientos_caja WHERE id_tipo IS NULL)       AS movimientos_sin_tipo,
  (SELECT count(*) FROM movimientos_caja WHERE id_cuenta_contable IS NULL) AS movimientos_sin_cuenta_contable,
  (SELECT count(*) FROM plantillas_recurrentes p
   WHERE activo AND estado='activa' AND frecuencia='mensual'
     AND NOT EXISTS (SELECT 1 FROM plantilla_ejecuciones e
                     WHERE e.id_plantilla = p.id_plantilla
                       AND e.periodo = to_char(now(),'YYYY-MM'))) AS plantillas_mensuales_pendientes,
  (SELECT count(*) FROM movimiento_splits s
   GROUP BY id_movimiento
   HAVING SUM(monto) <> (SELECT monto FROM movimientos_caja m WHERE m.id_movimiento = s.id_movimiento)
  ) AS splits_desbalanceados;
```

---

## 3. Frontend

### 3.1 Componente universal `QuickEntry`

**Ruta:** `src/components/QuickEntry/QuickEntry.jsx`

**Props:**
```jsx
<QuickEntry
  scope="comando|pos|produccion|tienda|manual"
  contexto={{
    idUbicacion,       // auto-lock si viene del contexto de una tienda/taller
    idVenta,           // auto-vincula si viene de POS
    idLoteProduccion,  // auto-vincula si viene de producción
    idPersona,         // auto-sugiere si es pago a trabajador
    cajaOrigenSugerida // caja de la ubicación activa
  }}
  tiposPermitidos={array | null}   // filtro adicional opcional
  onSubmit={fn}
  onClose={fn}
/>
```

**Flujo UX (3 pasos máximo):**

1. **Buscar tipo** — input con búsqueda fuzzy (trigram). Muestra top 8 tipos del `scope` filtrados. Cada tipo muestra emoji, nombre, categoría.
2. **Completar campos requeridos** — renderiza dinámicamente según `tipo.campos_requeridos` (monto siempre, más los del JSON). Pre-llena desde `contexto`.
3. **Confirmar** — muestra resumen: tipo, ubicación, monto, cuenta contable resuelta, cuenta financiera, nota. Botón `Registrar` llama `fn_registrar_hecho_economico`.

**Splits con préstamo:** Si `comportamientos` incluye `permite_splits`, muestra botón `+ Dividir entre cuentas`. Cada fila de split tiene toggle `Aporte ○ Préstamo`. Si es préstamo, se auto-genera `transferencia_interna` al confirmar.

### 3.2 `CatalogoAdmin`

**Ruta:** `src/views/finanzas/views/admin/CatalogoAdmin.jsx`

Tabs:
- **Tipos de Movimiento** — CRUD sobre `tipos_movimiento_caja` incluyendo campos nuevos
- **Plantillas Recurrentes** — CRUD sobre `plantillas_recurrentes`
- **Mapeo Tipo↔Cuenta** — CRUD sobre `mapeo_tipo_cuenta`
- **Roles de Persona** — CRUD sobre `roles_persona`
- **Catálogos Auxiliares** — CRUD sobre `catalogos_auxiliares`
- **Períodos Contables** — Lista meses, permite cerrar/reabrir (solo admin)
- **Salud del Sistema** — Vista de `v_sistema_salud`

Cada operación dispara evento en `tipo_eventos` / `plantilla_eventos`.

### 3.3 `AbrirUbicacionWizard`

**Ruta:** `src/views/finanzas/views/Ubicaciones/AbrirUbicacionWizard.jsx`

**Invocación:** Botón `+ Abrir nueva ubicación` en `Ubicaciones.jsx`.

**Pasos:**
1. Datos básicos (nombre, rol, dirección, PIN auto-generado).
2. Caja asociada (auto-crea `cuentas_financieras` tipo efectivo).
3. Clonar plantillas (dropdown de ubicaciones del mismo rol → clona plantillas activas ajustando `id_ubicacion`).

**Al finalizar:** redirige a `/finanzas/ubicaciones/:id_nueva` con banner "Ubicación lista. Asigna trabajadores y empieza a operar."

### 3.4 Resolvers (cliente)

- `src/lib/resolvers/cuentaContable.js` — espejo de `fn_resolver_cuenta_contable` para preview en QuickEntry antes de enviar
- `src/lib/resolvers/cuentaFinanciera.js` — sugiere caja según ubicación
- `src/lib/resolvers/camposRequeridos.js` — lee `tipo.campos_requeridos` y genera schema de form

### 3.5 Módulos convertidos a read-only

- `EstructuraFinanciera` (rename de `CostosFijos`) — lista `plantillas_recurrentes` con filtros por tipo, ubicación, estado. Botón único `Gestionar en Catálogo` lleva a `CatalogoAdmin`.
- `Movimientos` — solo lectura, analítica, drill-downs. Sin formulario de creación.
- `Transferencias` — solo lectura. Sin formulario.

### 3.6 Rename `rapido` → `comando`

- Directorio: `src/views/rapido/` → `src/views/comando/`
- Ruta: `/rapido/*` → `/comando/*` (mantener redirect 301 temporal)
- LocalStorage key: `berna.rapido.session.v1` → `berna.comando.session.v1` (migración en boot)
- Recurso de permiso: `rapido` → `comando` (UPDATE en `permisos_persona`)
- Gate: `RapidoGate.jsx` → `ComandoGate.jsx`
- Context: `RapidoContext.jsx` → `ComandoContext.jsx`
- API client: `src/views/comando/api/comandoClient.js`

---

## 4. Migraciones

Ubicación: `sistema-calzado/supabase/migrations/`

```
20260418_01_catalogos_auxiliares.sql           # catalogos_auxiliares + roles_persona
20260418_02_tipos_movimiento_extensiones.sql   # ALTER tipos_movimiento_caja
20260418_03_plantillas_recurrentes.sql         # plantillas_recurrentes + plantilla_ejecuciones
20260418_04_mapeo_tipo_cuenta.sql              # mapeo_tipo_cuenta
20260418_05_movimientos_fks_extra.sql          # ALTER movimientos_caja + moneda
20260418_06_periodos_contables.sql             # periodos_contables + trigger bloqueo
20260418_07_auditoria_eventos.sql              # tipo_eventos, plantilla_eventos, audit_log, triggers inmutables
20260418_08_triggers_integridad.sql            # splits suma, snapshot nombre, audit genérico
20260418_09_fn_resolver_cuenta_contable.sql    # función RPC
20260418_10_fn_registrar_hecho_economico.sql   # función RPC principal
20260418_11_fn_generar_desde_plantilla.sql     # idempotente
20260418_12_vistas_observabilidad.sql          # v_sistema_salud + índice trigram
20260418_13_seed_catalogo_inicial.sql          # seeds
20260418_14_deprecate_legacy_checks.sql        # rename CHECKs a _deprecated_*
```

**Estrategia de rollback:** cada migración `NN` tiene par `NN.down.sql` en `migrations/down/`. No se usan `DROP` destructivos en Fase 1; solo renames a prefijo `_deprecated_` para permitir reversión rápida.

### 4.1 Seed inicial (`20260418_13_seed_catalogo_inicial.sql`)

Incluye:
- `roles_persona` — Dueño, Administrador, Vendedor, Armador, Perfilador, Cortador, Alistador, Seguridad (ejemplo)
- `tipos_movimiento_caja` — enriquece los existentes con `direccion`, `scope`, `comportamientos`, `campos_requeridos`, `naturaleza`, `id_cuenta_contable_default`
- `mapeo_tipo_cuenta` — por cada tipo operativo, mapeos (Tienda, *) y (Taller, *) según plan contable
- `plantillas_recurrentes` — alquiler tienda × N, luz × N, internet × N, sueldos × trabajadores (de `v_nomina_resumen`)
- `catalogos_auxiliares` — `frecuencias_pago`, `tipos_contrato`, `canales_venta` (solo tienda + mayorista por ahora)
- `periodos_contables` — abiertos desde enero 2026 hasta mes actual

---

## 5. Permisos

Matriz sobre `permisos_persona.recurso`:

| Recurso | ver | registrar | editar | admin |
|---|---|---|---|---|
| `finanzas` | Ve reportes | — | — | — |
| `movimientos` | Ver/filtrar | Registrar desde QuickEntry | Editar propios < 48h | Editar todos, reabrir períodos |
| `catalogos` | — | — | — | CRUD completo + cierre períodos |
| `costos_fijos` | Lista read-only | — | — | Gestión vía catálogos |
| `comando` | — | Registrar gastos/pagos | Editar propios | — |
| `ubicaciones` | Ver Hub | — | Editar ubicación | Abrir nuevas, cerrar |

**Doble filtro:** tipos con `solo_admin=true` solo aparecen en QuickEntry para usuarios con `tienePermiso(user, 'catalogos', 'admin')`.

---

## 6. Criterios de aceptación

### Schema
- [ ] Las 14 migraciones corren limpias en orden sobre una DB snapshot del estado actual.
- [ ] Todas las migraciones tienen par `.down.sql` que revierte correctamente.
- [ ] `supabase_schema.sql` actualizado como source of truth.

### Funcional — Registro contextual
- [ ] Desde Caja POS de Tienda A, QuickEntry pre-llena `id_ubicacion=A` y cuenta financiera caja de A.
- [ ] Desde Producción, un gasto de materiales pre-vincula `id_lote_produccion`.
- [ ] Desde Comando, selección de "Pago trabajador" auto-sugiere el trabajador, monto desde `salario_base`.
- [ ] Split con toggle `Préstamo` genera transferencia interna automáticamente al confirmar.

### Funcional — Catálogos
- [ ] Admin puede crear un nuevo tipo de movimiento vía UI sin migración, definiendo `scope`, `comportamientos`, `campos_requeridos`, mapeo a cuenta contable por rol.
- [ ] Nuevo tipo aparece inmediatamente en QuickEntry de las superficies declaradas en `scope`.
- [ ] Cambio de nombre de tipo NO altera reportes históricos (usan `snapshot_tipo_nombre`).

### Funcional — Módulos read-only
- [ ] `EstructuraFinanciera` no permite crear/editar inline; solo listar y navegar a Catálogo.
- [ ] `Movimientos` y `Transferencias` no tienen formularios de creación.

### Robustez
- [ ] Intento de modificar `audit_log` / `tipo_eventos` / `plantilla_eventos` lanza excepción `AUDIT_INMUTABLE`.
- [ ] Intento de insertar/editar movimiento en período cerrado lanza `PERIODO_CERRADO`.
- [ ] Split que no suma al total del padre lanza `SPLIT_DESBALANCEADO` en commit.
- [ ] Ejecutar `fn_generar_movimiento_desde_plantilla` dos veces con mismo `(plantilla, periodo)` genera un solo movimiento.
- [ ] Transacción concurrente contra misma `cuenta_financiera` se serializa vía `FOR UPDATE`.

### Escalabilidad
- [ ] Búsqueda fuzzy en QuickEntry responde < 100ms con 500 tipos.
- [ ] Vista `v_sistema_salud` responde < 500ms con 50k movimientos.

### Onboarding de ubicaciones
- [ ] `AbrirUbicacionWizard` crea ubicación + caja + plantillas clonadas en < 30s de interacción.
- [ ] Nueva ubicación aparece automáticamente en Hub Empresarial, filtros de Estado de Resultados, QuickEntry, Comando.

### UX
- [ ] `rapido` → `comando` sin romper sesiones existentes (migración de localStorage key).
- [ ] `CostosFijos` → `EstructuraFinanciera` sin URLs rotas (redirect 301).

---

## 7. Dependencias y orden de implementación

```
1. Migraciones SQL (01 → 14)
2. Resolvers cliente (preview en FE)
3. Componente QuickEntry (standalone, testeable)
4. CatalogoAdmin (depende de QuickEntry para preview de campos)
5. AbrirUbicacionWizard
6. Conversión Movimientos/Transferencias/EstructuraFinanciera a read-only
7. Rename rapido → comando
8. Seed + QA manual de criterios
```

---

## 8. Notas para fases posteriores

- **Fase 1.5 (condicional):** Cierre de períodos con reporte PDF/Excel firmado.
- **Fase 2:** Hub Ubicación empresarial (activos, contratos, P&L local).
- **Fase 3:** Workers v2 (rotativos, multi-área, puestos adicionales).
- **Fase 4:** Propagación de QuickEntry a POS y Producción con contextos específicos.
- **Fase 5:** Estado de Resultados dinámico con drill-down por `naturaleza` y `snapshot_tipo_nombre`.
- **Futuro:** Venta Online (cuando lance canal TikTok/Instagram), módulo tributario (IGV), multi-tenant (`id_organizacion`).
