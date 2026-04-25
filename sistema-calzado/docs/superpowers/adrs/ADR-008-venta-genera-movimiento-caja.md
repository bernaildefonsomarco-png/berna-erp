# ADR-008 — La venta POS genera su movimiento_caja automáticamente (excepción a ADR-004)

**Fecha**: 2026-04-24
**Estado**: Aceptado
**Contexto**: Rediseño Fase 3

## Contexto

El ADR-004 establece que **nada que mueva dinero se ejecuta automáticamente** — el usuario siempre aprieta el botón. Esta regla protege la integridad de los datos financieros frente a automatismos que falsean la realidad.

En Fase 3 aparece un caso que **parece** violar este principio: al cerrar una venta en POS, queremos insertar automáticamente una fila en `movimientos_caja` (una por cada método de pago usado) vía trigger DB, sin que el usuario haga un segundo "click para registrar en caja".

La alternativa — pedir doble confirmación — produce dos problemas graves:
1. **Data olvidada**: si la vendedora cierra el POS sin confirmar, la venta existe en `ventas` pero no en `movimientos_caja`. P&L y arqueo divergen.
2. **Desfase de arqueo**: el arqueo del cierre de caja cuadra contra `movimientos_caja`. Si la venta no está ahí al segundo de cerrarse, el cuadre se rompe.

## Decisión

Se crea un trigger `AFTER INSERT ON ventas` que invoca `fn_registrar_hecho_economico` una vez por cada método de pago usado, generando `movimientos_caja` + `movimiento_splits` contables correspondientes. El `idempotency_key` de la venta se propaga al movimiento.

**Esto NO viola ADR-004**. El ADR-004 protege contra automatismos que crean dinero que **no ha sido confirmado humanamente** (ej. auto-pagar un alquiler porque es día primero). En POS la situación es distinta:

- La **venta misma** es la confirmación humana. La vendedora cobró — el dinero ya se movió en la realidad física.
- El trigger solo **refleja contablemente** un hecho ya ocurrido. No crea dinero nuevo; registra uno que ya existe.
- Sin el trigger, la venta queda con representación incompleta (existe en `ventas` pero no en `movimientos_caja`), lo que rompe la integridad del arqueo.

## Principio subyacente

**Distinguimos "automatizar la decisión" de "automatizar el reflejo contable"**. ADR-004 prohíbe lo primero. Lo segundo es obligatorio para que las tablas sean consistentes.

Regla general aplicable a futuros casos:
- Si el automatismo **decide** pagar / cobrar / mover → **prohibido** (ADR-004).
- Si el automatismo **refleja** un hecho humano ya consumado en otra tabla del mismo sistema → **permitido y documentado en un ADR**.

## Alternativas consideradas

**Opción A — Doble confirmación (venta + "registrar en caja")** (rechazada): fricción absurda, data olvidada garantizada, desfase de arqueo inevitable.

**Opción B — Batch job nocturno que sincroniza ventas → movimientos** (rechazada): arqueo del día imposible; dashboards con lag de 24h.

**Opción C — Trigger DB inmediato con idempotency_key compartido** (elegida): consistencia instantánea, sin fricción, sin duplicados.

## Consecuencias

Positivas:
- Arqueo de caja siempre cuadra con `ventas + movimientos_caja`.
- P&L refleja ventas del día sin lag.
- `idempotency_key` compartido permite rastrear venta ↔ movimiento 1:1.

Negativas:
- Requiere disciplina: **ninguna otra tabla operativa** puede copiar este patrón sin documentar su propio ADR.
- Si hay que anular una venta, también hay que anular los movimientos generados — resuelto con trigger `AFTER UPDATE` que marca anulado en cascada.

## Referencias

- ADR-004: `ADR-004-obligaciones-no-auto-ejecutan.md`
- Plan 04: `2026-04-24-fase3-04-pos-venta-trigger-caja.md`
- Migración: `20260424_02_ventas_trigger_movimientos_caja.sql`
- Fase 2 RPC: `fn_registrar_hecho_economico`
