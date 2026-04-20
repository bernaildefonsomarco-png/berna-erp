# ADR-004 — Las obligaciones recurrentes NO se auto-ejecutan

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

El negocio tiene compromisos recurrentes: alquileres, servicios (luz, agua, internet), sueldos, seguros. Una tentación obvia es automatizar: "cada primero de mes, registra automáticamente el pago de alquiler por S/ 1,800 desde Caja Administración".

Pero esto esconde riesgos:
- El monto real puede variar (luz varía mes a mes)
- La cuenta origen puede estar sin fondos
- Puede haber un atraso o renegociación
- Puede cambiar el proveedor

Un movimiento contable auto-generado que no refleja la realidad es más dañino que no tenerlo.

## Decisión

Las obligaciones recurrentes **nunca ejecutan pagos automáticamente**. El sistema solo:

1. **Recuerda**: genera `obligaciones_instancias` en estado `PROYECTADO` X días antes (default 45) del vencimiento.
2. **Muestra**: `/gestion/obligaciones` con bandeja agrupada por vencidas/estaSemana/proximas.
3. **Asiste**: al pagar, pre-llena el form con tipo, cuenta contable, ubicación, monto estimado.
4. **Registra**: cuando el usuario confirma y paga, se crea un `movimiento_caja` real ligado a la instancia.

El usuario siempre aprieta el botón. El sistema nunca mueve dinero solo.

## Ciclo de vida explícito

```
PROYECTADO  (generada, monto estimado, sin recibo)
    ↓ (usuario sube recibo)
CONFIRMADO  (monto exacto, recibo en Storage)
    ↓ (usuario paga — modo completo/parcial/acumular)
PAGADO      (movimiento_caja registrado)

Si pasa fecha sin pagar:
PROYECTADO/CONFIRMADO → VENCIDO  (alerta roja en bandeja)

Si ya no aplica:
cualquiera → CANCELADO  (con motivo)
```

## Alternativas consideradas

**Opción A — Auto-ejecutar con montos fijos** (rechazada): falso positivo si monto real difiere. Movimientos que no reflejan la realidad.

**Opción B — Auto-ejecutar con confirmación posterior** (rechazada): double-work si el usuario debe validar igual, y si no valida, data sucia.

**Opción C — Solo recordar, usuario confirma** (elegida): refleja cómo el dueño realmente opera. Menos data sucia. Más control.

## Consecuencias

Positivas:
- Data financiera refleja la realidad (ningún pago registrado sin acción humana)
- El dueño mantiene control total — puede decidir pagar parcial, acumular, o posponer
- Recibos adjuntados son obligatorios antes de pagar (prueba documental)

Negativas:
- Requiere acción manual recurrente (mitigado: bandeja clara + badges de alerta)
- Si el usuario ignora la bandeja, aparecen vencidas (mitigado: banner global rojo en header)

## Referencias

- Plan 01 migración 04: `2026-04-20-fase2-01-migraciones-db.md`
- Plan 04: `2026-04-20-fase2-04-obligaciones-recurrentes.md`
- Glosario: sección "Obligación recurrente"
