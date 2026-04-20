# Roadmap Fase 2 — Rediseño Gestión Empresarial

**Fecha**: 2026-04-20
**Spec maestro**: `docs/superpowers/specs/2026-04-20-rediseno-gestion-empresarial-design.md`
**Estado**: 10 planes escritos, listos para ejecución

---

## Orden de ejecución (dependencias)

```
 01 (DB migrations)
     │
     ├─────────┬─────────┬─────────┬─────────┐
     ▼         ▼         ▼         ▼         ▼
    02        03        05        07        09
 (workspace) (wizard)  (cat UI)  (trab.)   (activos)
     │         │                    │
     ├─ 04 ────┤                    │
     │  (oblig)│                    │
     │         │                    │
     ├─ 06 ────┼─ 08 ───────────────┤
     │  (resumen) (registrar ubicuo)│
     │                              │
     └──────────── 10 (QA) ─────────┘
```

**Plan 01 es bloqueante** para todo lo demás (schema).
**Plan 10 (QA)** va al final y depende de todos.
**Planes 02-09** se pueden paralelizar en gran medida después de 01.

---

## Índice de planes

| # | Archivo | Descripción | Líneas SQL | Archivos UI tocados |
|---|---|---|---|---|
| 01 | `2026-04-20-fase2-01-migraciones-db.md` | Crear tablas `metodos_pago`, `areas`, `cargos`, `motivos_*`, `condiciones_pago`, `obligaciones_recurrentes`, `obligaciones_instancias`, `reglas_mapeo_sugerido`; migrar datos; eliminar `catalogos_auxiliares` | ~400 | 0 |
| 02 | `2026-04-20-fase2-02-workspace-rename-sidebar.md` | Rename `/finanzas/*` → `/gestion/*`, nuevo sidebar, header global con "+ Registrar", redirects de compatibilidad | 0 | ~15 |
| 03 | `2026-04-20-fase2-03-wizard-tipos-movimiento.md` | Wizard 3 pasos para crear tipo + árbol navegable plan de cuentas + motor autosugerencia | ~80 | ~8 |
| 04 | `2026-04-20-fase2-04-obligaciones-recurrentes.md` | Bandeja 3 pestañas + CRUD recetas + RPCs de confirmación/pago/acumulación + cron generador | ~200 | ~10 |
| 05 | `2026-04-20-fase2-05-catalogos-unificados.md` | Pantalla master-detail "Catálogos del sistema", formulario dinámico por tabla, eliminar `TabCatalogosAux` | 0 | ~12 |
| 06 | `2026-04-20-fase2-06-resumen-ejecutivo.md` | Landing del workspace con 4 KPIs + alertas + flujo caja + top ubicaciones + top gastos + próximas obligaciones | ~100 (views) | ~6 |
| 07 | `2026-04-20-fase2-07-trabajadores-rol-cargo.md` | Rediseño formulario trabajador con FK `id_cargo` y `id_area`, selectores separados con tooltips | ~60 | ~4 |
| 08 | `2026-04-20-fase2-08-registrar-ubicuo-quickentry.md` | Componente `HeaderRegistrarButton` global + QuickEntry universal con detección de contexto | 0 | ~8 |
| 09 | `2026-04-20-fase2-09-activos-contratos.md` | Módulo nuevo: tablas `activos_fijos`, `contratos`, `depreciacion_mensual`, pantallas CRUD | ~250 | ~10 |
| 10 | `2026-04-20-fase2-10-qa-pulido.md` | Smoke tests manuales, accesibilidad, mobile, performance, documentación final, commit a main | 0 | pulido cross-file |

---

## Checkpoints de aprobación

Después de cada sub-fase, Marco debe:
1. Pull de la rama de trabajo
2. Correr `npm run dev` y probar el flujo nuevo
3. Revisar que el schema nuevo está en `supabase_schema.sql` (source of truth)
4. Aprobar para pasar a la siguiente

**Si un plan falla parcialmente**: documentar en el mismo archivo el estado parcial bajo `## Estado de ejecución` (como hace Fase 1.5 en su plan).

---

## Criterio de "Fase 2 completa"

Todas las condiciones verdaderas al mismo tiempo:
- [ ] Los 10 planes completados o con decisión explícita de postergar
- [ ] `supabase_schema.sql` actualizado con todo
- [ ] `CLAUDE.md` actualizado con rutas `/gestion/*`
- [ ] `npm run build` pasa sin errores
- [ ] `npm run lint` pasa
- [ ] Marco valida 5 flujos clave:
  - [ ] Registrar un pago de luz desde una ubicación
  - [ ] Crear un tipo de movimiento nuevo con el wizard
  - [ ] Crear una obligación recurrente, confirmar monto, pagarla parcialmente
  - [ ] Agregar un cargo nuevo y asignarlo a un trabajador
  - [ ] Cerrar un período (regresión — no debe romperse)
- [ ] Commit final a `main` con tag `v2.0.0-rediseno-gestion-empresarial`
