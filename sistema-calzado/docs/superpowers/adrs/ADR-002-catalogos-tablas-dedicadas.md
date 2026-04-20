# ADR-002 — Todo catálogo es una tabla dedicada

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

El proyecto tenía 5 patrones distintos para manejar listas de valores:

1. Tablas dedicadas (tipos_movimiento_caja, roles_persona, materiales_catalogo, series_tallas, costos_fijos)
2. Tabla mínima (categorias: id, nombre)
3. CHECK constraint hardcoded (area IN ('taller','tienda','administracion'))
4. Columna text libre (personas_tienda.cargo)
5. Array JS hardcoded (metodos_pago en VentasPOS.jsx:30-35)
6. Tabla genérica con items jsonb (catalogos_auxiliares)

Esto generó inconsistencia conceptual y el usuario pidió eliminar la carga mental de decidir "qué patrón usar".

## Decisión

**Regla senior**: todo catálogo del sistema es una **tabla dedicada** con estructura mínima `(id, codigo, nombre, activo, orden)` más columnas específicas si la feature las necesita.

- No existen catálogos genéricos tipo `catalogos_auxiliares` con `items jsonb` — se elimina.
- La decisión de qué entidades son "catálogos simples" vs "entidades ricas" la toma el dev en diseño — nunca el usuario en runtime.
- Todos los catálogos simples tienen UI de admin unificada en `/gestion/catalogos` con master-detail.

## Criterios para clasificar (dev-facing)

**Catálogo simple** (tabla dedicada, UI genérica):
- No tiene pantalla propia de gestión
- CRUD simple: agregar, editar nombre, desactivar, reordenar
- Pocas columnas extras (opcional: FKs a otras tablas)

**Entidad rica** (tabla dedicada, UI propia):
- Ciclo de vida propio (se abre/cierra, se amortiza)
- Reportes dedicados sobre ella (P&L por cuenta, nómina por persona)
- Relaciones complejas (una persona tiene muchos movimientos, permisos, etc.)

## Alternativas consideradas

**Opción A — Mantener híbrido con `catalogos_auxiliares`** (rechazada): genera confusión sobre cuándo promover un catálogo a tabla propia. Carga mental innecesaria para el usuario. Además pierde integridad referencial.

**Opción B — Todo como JSON config** (rechazada): sacrifica FKs, índices, validación en DB. Imposible hacer reportes agregados.

**Opción C — Todo como tabla dedicada** (elegida): un archivo SQL de migration por catálogo es barato para 2 devs. Ganamos FKs reales, índices propios, mental model claro.

## Consecuencias

Positivas:
- Integridad referencial real (FK): una `persona` no puede tener un `id_cargo` inexistente
- Índices y performance predecibles
- Mental model claro: "cargos es una tabla, no un codigo='cargos' dentro de un JSON"
- UI genérica garantiza consistencia visual

Negativas:
- Cada catálogo nuevo requiere una migration SQL (mitigado: son ~1 archivo pequeño)
- Más tablas en el schema (mitigado: cada una es chica y bien focalizada)

## Catálogos resultantes en Fase 2

- `metodos_pago` (desde array hardcoded)
- `areas` (desde CHECK constraint)
- `cargos` (desde columna text libre)
- `motivos_merma`, `motivos_ajuste`, `motivos_devolucion`, `condiciones_pago` (nuevos)

Entidades ricas que NO son catálogos: ubicaciones, personas_tienda, cuentas_financieras, plan_cuentas, deudas, productos, tipos_movimiento_caja, roles_persona, materiales_catalogo, series_tallas, costos_fijos.

## Referencias

- Plan 01: `2026-04-20-fase2-01-migraciones-db.md` (migración 01, 02, 06)
- Plan 05: `2026-04-20-fase2-05-catalogos-unificados.md`
