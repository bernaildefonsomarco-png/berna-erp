# ADR-005 — Wizard de 3 pasos para crear tipos de movimiento

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

La UI actual (`TabTiposMovimiento.jsx:43-70` + `TabMapeo.jsx:52`) divide la creación de un tipo en 2 pasos desconectados:

1. Crear el tipo (sin cuenta contable)
2. Mapearlo a cuenta contable después, vía dropdown plano de ~50 cuentas

Esto fuerza al admin a conocer el plan de cuentas, saber qué cuenta usar para "Pago Luz Tienda" (¿6201? ¿6105? ¿6301?), y enfrentar un dropdown con 50 opciones. El admin NO es contador — es dueño de negocio.

## Decisión

Reemplazar los 2 tabs por un **wizard de 3 pasos** con lenguaje de negocio, autosugerencia de cuenta, y árbol navegable para ajuste:

**Paso 1 — Categoría macro** (lenguaje de negocio, no contable):
- 💰 Entra dinero
- 💸 Gasto operativo
- 👥 Pago a personas
- 🏗️ Inversión
- 🔁 Movimiento entre cuentas propias
- 💳 Pago de deuda
- 📦 Compra de material

**Paso 2 — Dónde aplica**:
- Cualquier ubicación
- Solo Tiendas / Solo Talleres (por rol)
- Solo en ubicaciones específicas (multiselect)

**Paso 3 — Mapeo contable**:
- Sistema sugiere cuenta vía `fn_sugerir_cuenta_para_tipo(categoria_macro, rol_ubicacion)` leyendo tabla `reglas_mapeo_sugerido`
- UI: card grande con la sugerencia + 2 botones: **Aceptar** | **Ajustar**
- "Ajustar" abre plan de cuentas como **árbol navegable** (Ingresos → Operativos → 4101…), no dropdown plano

## Principio subyacente

El admin piensa como dueño de negocio, no como contador. La cuenta contable se **auto-sugiere y se confirma con un click**. El plan de cuentas solo se navega como árbol si el admin quiere ajustar manualmente.

## Alternativas consideradas

**Opción A — Mantener 2 tabs con dropdown plano** (rechazada): alta fricción, requiere conocimiento contable, falla el principio de diseño.

**Opción B — Wizard 2 pasos (sin selección de ámbito explícita)** (rechazada): los tipos quedarían siempre globales, perdiendo contextualización en QuickEntry.

**Opción C — Wizard 3 pasos con autosugerencia** (elegida): admin tardará ~30 segundos en crear un tipo nuevo, vs ~3 minutos actuales. Cuenta contable siempre consistente (la sugerida es la correcta 90% del tiempo).

## Consecuencias

Positivas:
- Admin no necesita conocimiento contable para configurar tipos
- Consistencia en mapeos (mismas reglas para mismos casos)
- Tipos creados quedan **automáticamente disponibles** en QuickEntry de las ubicaciones que cumplen el filtro de ámbito — no hay que "sembrar" botones manualmente
- Reduce errores de mapeo incorrecto

Negativas:
- Requiere mantener tabla `reglas_mapeo_sugerido` actualizada con el contador (hecho al inicio, revisado periódicamente)
- Tipos muy inusuales pueden requerir ajuste manual — soportado via "Ajustar" + árbol

## Separación crítica: CREAR vs REGISTRAR

| Verbo | Actor | Frecuencia | Dónde |
|---|---|---|---|
| **CREAR tipo** | Solo admin | Raro (semanas/meses) | `/gestion/configuracion/tipos` (centralizado) |
| **REGISTRAR movimiento** | Cualquier rol con permiso | Diario | `+ Registrar` ubicuo en header global |

El tipo recién creado aparece automáticamente como opción en QuickEntry de las ubicaciones que cumplen el filtro — no se "siembra" individualmente.

## Referencias

- Plan 03: `2026-04-20-fase2-03-wizard-tipos-movimiento.md`
- Plan 01 migración 03: reglas_mapeo_sugerido + fn_sugerir_cuenta_para_tipo
- Archivos a reemplazar: `src/views/finanzas/views/admin/TabTiposMovimiento.jsx`, `TabMapeo.jsx`
