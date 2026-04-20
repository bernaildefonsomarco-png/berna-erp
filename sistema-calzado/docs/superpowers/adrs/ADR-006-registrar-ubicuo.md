# ADR-006 — Un único botón "+ Registrar" ubicuo

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

Evolucionar un ERP sin disciplina produce el anti-patrón de "botones distribuidos": cada pantalla agrega su propio botón de registrar según su contexto. Resultado:

- VentasPOS tiene "Nueva venta"
- Movimientos tiene "+ Nuevo movimiento"
- Caja tiene "+ Registrar ingreso" / "+ Registrar egreso"
- Deudas tiene "+ Pagar cuota"
- Cada ubicación tendría "+ Registrar gasto"
- Cada tipo nuevo tentaba sembrar un botón contextual

La carga mental acumulativa es enorme: el usuario no sabe desde dónde registrar qué. La UX de Linear, Notion, Superhuman resolvió este problema con **un único punto de entrada global** (+ Create o Cmd+K).

## Decisión

**Un único botón `+ Registrar`** en el `HeaderGlobal` de los 3 workspaces. Accesible también vía atajo **Cmd/Ctrl+K** desde cualquier pantalla.

Al invocarlo abre el **QuickEntry universal**, que detecta contexto automáticamente:

1. **Ubicación**: si la ruta es `/gestion/ubicaciones/:id`, pre-selecciona esa ubicación. Si no, el form pide elegir.
2. **Rol del usuario**: del session storage, filtra permisos.
3. **Tipos aplicables**: consulta `fn_tipos_aplicables_contexto(id_ubicacion, rol_ubicacion)` que respeta `ambito`, `roles_aplicables`, `ubicaciones_permitidas`.

El usuario solo ve los tipos relevantes al contexto — sin ruido, sin decisiones innecesarias.

## Principio subyacente

**El contexto se infiere, no se declara**. El usuario no debería explicar "estoy en Tienda Centro, soy Cajero" cada vez que registra algo. El sistema ya lo sabe.

**Un patrón, un flujo**. Registrar una venta, un gasto, un pago de deuda, una transferencia — todos pasan por la misma puerta (QuickEntry) con los mismos componentes, diferentes ramas según tipo.

## Alternativas consideradas

**Opción A — Mantener botones distribuidos** (rechazada): no escala. Cada feature nueva agrega más ruido.

**Opción B — Sembrar botón en cada ubicación al crear tipo** (rechazada): propone que el admin decida "dónde vive este tipo físicamente en la UI". Duplica el concepto de `ambito`. Produce UIs inconsistentes.

**Opción C — Un botón global + QuickEntry universal** (elegida): 1 entrada, infinitos escenarios. Mejor UX, menor mantenimiento.

## Consecuencias

Positivas:
- Usuario nuevo aprende **1 patrón** y puede registrar cualquier cosa
- Atajo Cmd+K instantáneo desde cualquier lugar
- Cero ruido visual (no botones dispersos)
- Escalable: tipos nuevos aparecen automáticamente sin tocar UI

Negativas:
- Requiere que QuickEntry sea **ricamente contextual** (mitigado: la RPC `fn_tipos_aplicables_contexto` lo resuelve)
- Usuarios acostumbrados a botones contextuales pueden tardar en adaptarse (mitigado: tooltip `⌘K` visible, onboarding con hint)

## Excepciones permitidas

Los únicos botones contextuales que se mantienen son los que **no registran un movimiento nuevo** sino ejecutan una acción específica:

- "Pagar" dentro de una obligación específica (pre-llena el QuickEntry con la obligación ligada)
- "Cerrar período" en `/gestion/cierres` (no es movimiento, es acción administrativa)
- "Generar depreciación" en `/gestion/activos/depreciacion` (acción admin, no movimiento manual)

Estos son atajos contextuales que **invocan QuickEntry prellenado** o ejecutan acciones no-movimiento — no lo reemplazan.

## Referencias

- Plan 08: `2026-04-20-fase2-08-registrar-ubicuo-quickentry.md`
- Plan 03: wizard de tipos (donde se define `ambito`)
- Fase 1: QuickEntry base (`specs/2026-04-18-fase1-motor-taxonomia-quickentry.md`)
- Inspiración UX: Linear `⌘K`, Notion `+`, Superhuman compose
