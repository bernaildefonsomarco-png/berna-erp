# ADR-003 — Separación explícita de Rol, Cargo y Área

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

La tabla `personas_tienda` mezclaba:
- `cargo` (text libre) — interpretado ambiguamente como "puesto laboral" o "perfil de sistema"
- `area` (CHECK hardcoded `taller|tienda|administracion`) — función
- Permisos vía `permisos_persona` pero sin un concepto claro de "rol"

Durante el brainstorming quedó claro que un operario de taller (Cortador) puede no tener acceso al ERP, mientras que una Vendedora sí necesita rol "Cajero". Conflar estos conceptos genera confusiones graves.

## Decisión

Definir **3 dimensiones ortogonales** con tablas separadas:

| Dimensión | Pregunta | Tabla | Requerido |
|---|---|---|---|
| **Rol** | ¿Qué puede hacer en el sistema? | `roles_persona` + `permisos_persona` | No (opcional) |
| **Cargo** | ¿Cuál es su puesto laboral? | `cargos` | Sí |
| **Área** | ¿Dónde trabaja? | `areas` | Sí |

`personas_tienda` tiene 3 FKs: `id_rol`, `id_cargo`, `id_area` (el rol es nullable).

## Ejemplos para desambiguar

| Persona | Rol (sistema) | Cargo (puesto) | Área |
|---|---|---|---|
| Ana Pérez | Cajero | Vendedora | Tienda |
| Luis Gómez | — (sin acceso ERP) | Cortador | Taller |
| Marta Ríos | Admin | Gerente | Administración |
| Juan Torres | — | Armador | Taller |

"Cocina" y "Administrador" — que inicialmente se habían ejemplificado como Cargos — pertenecen a Rol, no a Cargo. Ejemplos de Cargos verdaderos: Vendedora, Cajero, Supervisor, Cortador, Armador, Pegador, Diseñador, Gerente.

## Alternativas consideradas

**Opción A — Mantener `cargo` text libre** (rechazada): imposible hacer reportes agregados, propenso a typos.

**Opción B — Una sola dimensión "tipo de persona"** (rechazada): pierde el caso real del operario sin acceso a sistema pero con cargo en nómina.

**Opción C — 3 dimensiones separadas con FKs** (elegida): claridad conceptual + soporta todos los casos reales del negocio.

## Consecuencias

Positivas:
- Reportes limpios (ej: "total sueldos del área Taller" sin depender de strings)
- Permisos granulares (Rol → permisos en recursos)
- Onboarding de trabajador claro: "elige el Cargo, el Área, y si necesita entrar al sistema asignale un Rol"
- Autosugerencia: cargos pueden tener `id_area_default` y `salario_sugerido`

Negativas:
- Migración de datos viejos requiere mapeo de `cargo` text → `cargos.id` (hecho en Plan 01, migración 02)
- Form de persona pasa de 1 selector cargo a 3 selectores (mitigado con helpText y tooltips)

## Referencias

- Plan 01 migración 02: `2026-04-20-fase2-01-migraciones-db.md`
- Plan 07: `2026-04-20-fase2-07-trabajadores-rol-cargo.md`
- Glosario: `glossary.md` secciones Rol, Cargo, Área
