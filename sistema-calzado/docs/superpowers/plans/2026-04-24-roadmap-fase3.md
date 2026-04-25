# Roadmap Fase 3 — Adaptación POS + Producción

**Fecha**: 2026-04-24
**Spec maestro**: `docs/superpowers/specs/2026-04-24-adaptacion-pos-produccion.md`
**Estado**: 11 planes + 5 ADRs escritos, listos para ejecución
**Depende de**: Fase 2 aplicada

---

## Orden de ejecución (dependencias)

```
 01 (DB migrations)
     │
     ├─────────┬─────────┐
     ▼         ▼         ▼
    02        04        07
 (métodos)  (trigger)  (asignación)
     │         │         │
     ▼         │         ▼
    03 ────────┤        08
 (propinas)   │     (trabajo mes)
     │         │
     ├─────────┤
     ▼         ▼
    05        06
 (recibo)  (offline)
                         │
     ┌───────────────────┤
     ▼                   ▼
    09                  10
 (costos)           (planificador)
     │                   │
     └──────── 11 ───────┘
            (QA)
```

**Plan 01 es bloqueante** para todo lo demás (schema).
**Plan 11 (QA)** va al final y depende de todos.
**Planes 02-10** se pueden paralelizar en gran medida después de 01.

---

## Índice de planes

| # | Archivo | Descripción | ADRs relacionados |
|---|---|---|---|
| 01 | `2026-04-24-fase3-01-migraciones-db.md` | 6 migraciones: ventas ext., trigger caja, devoluciones, lote_asignaciones, modelos_ligados, vistas | — |
| 02 | `2026-04-24-fase3-02-pos-metodos-pago-dinamicos.md` | Reemplazar METODOS hardcoded por query a `metodos_pago` | ADR-002 |
| 03 | `2026-04-24-fase3-03-pos-propinas-descuentos.md` | Propina voluntaria + descuento por línea y global | — |
| 04 | `2026-04-24-fase3-04-pos-trigger-caja-permisos.md` | Trigger venta→movimiento_caja + eliminar AUTORIZADAS_CAJA | ADR-008 |
| 05 | `2026-04-24-fase3-05-pos-recibo-devoluciones.md` | Recibo digital `/r/:id` + WhatsApp + devolución parcial | ADR-010 |
| 06 | `2026-04-24-fase3-06-pos-offline-sync.md` | Service Worker + IndexedDB + cola sync + banner | ADR-007 |
| 07 | `2026-04-24-fase3-07-produccion-asignacion-trabajadores.md` | Modal multi-persona por lote con cargo/área | ADR-009 |
| 08 | `2026-04-24-fase3-08-produccion-trabajo-mensual-persona.md` | Tab "Trabajo del mes" en Trabajadores | ADR-009 |
| 09 | `2026-04-24-fase3-09-catalogo-costos-modelos-ligados.md` | QuickEntry compra→modelos + costo real vs estándar | ADR-011 |
| 10 | `2026-04-24-fase3-10-planificador-permisos-pedido.md` | RBAC en planificador + ligadura movimiento↔pedido | — |
| 11 | `2026-04-24-fase3-11-qa-release.md` | Smoke tests, lint, build, regresión, tag v3.0.0 | — |

---

## ADRs de Fase 3

| ADR | Título | Archivo |
|---|---|---|
| ADR-007 | POS offline-first con SW + IDB | `adrs/ADR-007-pos-offline-first.md` |
| ADR-008 | Venta genera movimiento_caja (excepción ADR-004) | `adrs/ADR-008-venta-genera-movimiento-caja.md` |
| ADR-009 | Asignación lote ↔ trabajador sin FSM | `adrs/ADR-009-asignacion-lote-trabajador-sin-fsm.md` |
| ADR-010 | Recibo digital vía página firmada + WhatsApp | `adrs/ADR-010-recibo-digital-whatsapp.md` |
| ADR-011 | Compra de material NO es obligación recurrente | `adrs/ADR-011-compra-material-no-es-obligacion.md` |

---

## Criterio de "Fase 3 completa"

Todas las condiciones verdaderas al mismo tiempo:

- [ ] Los 11 planes completados o con decisión explícita de postergar
- [ ] `supabase_schema.sql` actualizado con tablas nuevas
- [ ] `CLAUDE.md` actualizado con cambios de Fase 3
- [ ] `npm run build` pasa sin errores
- [ ] `npm run lint` pasa
- [ ] Marco valida 7 flujos clave (ver Plan 11)
- [ ] Commit final a `main` con tag `v3.0.0-fase3`
