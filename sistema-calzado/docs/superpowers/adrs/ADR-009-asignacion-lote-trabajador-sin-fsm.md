# ADR-009 — Asignación lote ↔ trabajador sin FSM de producción

**Fecha**: 2026-04-24
**Estado**: Aceptado
**Contexto**: Rediseño Fase 3

## Contexto

Un ERP de calzado "de libro" modelaría la producción como una **máquina de estados**: Diseño → Corte → Armado → Pegado → Terminado. Cada trabajador marcaría su paso al terminar. Esto permitiría Kanban, pares-en-proceso por etapa, cuellos de botella, etc.

**En el negocio real de Berna esto no va a pasar**:
- Los trabajadores del taller **no tocan** el sistema. Son cortadores, armadores y pegadores con las manos ocupadas y smartphones básicos.
- Un lote de 48 pares se divide entre 3–4 personas por varias tareas en paralelo; nadie va a "marcar paso completado por docena".
- Intentar imponer un FSM produciría data basura ("todos siempre marcan todo al final del día") y resentimiento del taller.

Pero hay una necesidad empresarial real: **saber quién hizo qué lote**, para (a) pagar destajo con evidencia, (b) reportar trabajo del mes por persona, (c) detectar caídas de productividad por cargo/área.

## Decisión

Modelar la producción como **asignación plana multi-persona por lote**, sin estados. Tabla:

```sql
lote_asignaciones (
  id_lote, id_persona, id_area, id_cargo,
  pares_asignados int NULL,   -- NULL = "participó en el lote completo"
  notas, activa bool,
  UNIQUE(id_lote, id_persona, id_area, id_cargo)
)
```

Decisiones clave:

1. **Una persona puede aparecer varias veces** en el mismo lote con cargos distintos (Juan es "armador" de 48 y "pegador" de 24 del mismo lote). El UNIQUE incluye `id_cargo`.
2. **`pares_asignados` es nullable**: muchas veces no hay desglose — la persona participó en el lote completo. Solo se llena cuando hay división explícita (p.ej. dos pegadores se dividen 48 pares).
3. **Sin estados**: no hay "pendiente / en progreso / terminado" por asignación. El estado del lote ya vive en `lotes.estado_lote`.
4. **Edición libre**: reasignar es `UPDATE`; quitar persona es `activa=false` (no DELETE), para preservar historia si ya pasaron reportes mensuales.

De ahí sale la vista `v_produccion_mensual_persona` para agrupar por `(mes, persona, área, producto)`.

## Principio subyacente

**Modelar lo que el negocio hace, no lo que el libro de ERP dice**. Si los usuarios no van a alimentar un FSM, el FSM es data ficticia — peor que no tenerlo.

La **trazabilidad para nómina** se consigue sin FSM: basta saber "X personas participaron en este lote con tales cargos". El "cómo" se lo sabe el supervisor de taller sin sistema.

## Alternativas consideradas

**Opción A — FSM completo por paso** (rechazada): el taller no lo usará; data basura garantizada.

**Opción B — Asignación 1:1 lote↔persona** (rechazada): no refleja la realidad (los lotes son trabajo colectivo).

**Opción C — Asignación multi-persona plana con cargo/área** (elegida): modela la realidad, soporta pago por destajo, habilita reportes mensuales sin forzar uso al taller.

## Consecuencias

Positivas:
- Trabajadores del taller no tocan el sistema — lo alimenta el supervisor o el dueño desde el detalle del lote.
- `v_produccion_mensual_persona` permite pagar con evidencia sin inventar tarifas forzadas.
- Soporta casos mixtos (Juan hace armado y pegado) sin modelos complejos.

Negativas:
- **No hay pares-en-proceso por paso de producción** — si algún día se quiere, hay que rediseñar. Aceptable: no está en la hoja de ruta.
- La confiabilidad del dato depende de que alguien llene la asignación. *Mitigado*: el incentivo es claro — sin asignación no hay cómo justificar destajo.

## Referencias

- Plan 07: `2026-04-24-fase3-07-produccion-asignacion-trabajadores.md`
- Plan 08: `2026-04-24-fase3-08-produccion-trabajo-mensual-persona.md`
- Migración: `20260424_04_lote_asignaciones.sql`
- ADR-003 (rol vs cargo) — `id_cargo` + `id_area` son FKs a catálogos dedicados
