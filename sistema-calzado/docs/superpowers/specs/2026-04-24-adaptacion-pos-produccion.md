# Spec Maestro — Fase 3: Adaptación POS + Producción al núcleo Fase 2

**Fecha**: 2026-04-24
**Autor**: Marco Berna + asistente
**Estado**: Aprobado, listo para implementación
**Depende de**: Fase 2 aplicada
**Reemplaza**: nada (primer spec post-Fase 2)

---

## 1. Contexto y Motivación

Fase 2 dejó un núcleo empresarial sólido (plan de cuentas, obligaciones recurrentes, catálogos dedicados, QuickEntry ubicuo, `idempotency_key`, RBAC por ubicación, wizard de tipos con categoría `compra_material → costo_produccion`). Pero los módulos operativos del día a día — **VentasPOS, Caja, ProduccionLotes, CatalogoCostos, PlanificadorPedido** — siguen en el estado inicial y ya no dialogan con ese núcleo:

- Las ventas **no** se reflejan en `movimientos_caja` → desfase P&L vs. arqueo.
- La caja tiene acceso hardcoded (`AUTORIZADAS_CAJA`) → rompe RBAC.
- En producción no hay rastro de **quién hizo qué** → imposible pagar destajo con evidencia.
- El catálogo de costos vive aislado del plan de cuentas.
- El planificador genera PDF pero no conversa con el flujo financiero.

Además, dos dolores reales de operación:
1. **WiFi/datos inestables** en tiendas → vendedoras pierden ventas.
2. **Doble registro** por reintentos sin `idempotency_key`.

**Outcome esperado**: los 5 módulos operativos conectados al núcleo Fase 2, sin reescritura, con tolerancia a señal caída y trazabilidad empresarial.

---

## 2. Principios rectores (herencia Fase 2)

1. **Un solo `+ Registrar`** (ADR-006): ventas por POS, todo lo demás por QuickEntry. Nada nuevo suelto.
2. **Catálogos dedicados** (ADR-002): `metodos_pago`, `motivos_devolucion`, `cargos`, `areas`.
3. **Rol ≠ Cargo** (ADR-003): asignación de lote usa `cargo` + `area`, no rol de sesión.
4. **No automatizar dinero sin confirmación** (ADR-004): ningún job mueve dinero solo. *Excepción documentada en ADR-008*: la venta POS genera su reflejo en caja porque la venta **ya es** la confirmación humana.
5. **Idempotency end-to-end**: toda venta / movimiento / asignación lleva `idempotency_key` UUID del cliente.
6. **Sin FSM de producción, sin mermas reales, sin Kanban**. El taller no tocará el sistema por docena.

---

## 3. Alcance resumido

| Módulo | Cambio clave | Plan |
|---|---|---|
| POS | Métodos dinámicos, propinas, descuentos, trigger caja, recibo digital, offline | 02–06 |
| Caja | Quitar `AUTORIZADAS_CAJA`, permiso por `id_ubicacion` | 04 |
| Producción | `lote_asignaciones` multi-persona, vista trabajo mensual, RPC refresco costo | 07–09 |
| CatalogoCostos | Costo real prom. 3m vs estándar, `movimiento_modelos_ligados` | 09 |
| Planificador | Permiso por ubicación, ligadura opcional pedido↔compra | 10 |

**Fuera de alcance**: FSM producción, registro de mermas, Kanban, tarifas destajo automatizadas, presupuesto proyectado, multi-moneda, conciliación Yape/Plin, impresión térmica, BI personalizado, CRM B2B.

---

## 4. Decisiones tomadas (D1–D6)

| ID | Decisión | Elegida |
|---|---|---|
| D1 | Destajo: tabla tarifas vs. monto libre | **Libre** (tabla cuando patrón sea estable ≥3 meses de data observada) |
| D2 | `id_pedido`: en movimientos_caja vs. por-modelo | **En `movimientos_caja`** (granularidad por modelo es sobreingeniería) |
| D3 | Widget presupuesto semanal | **Fuera de alcance** (histórico basta; se evalúa en Fase 4) |
| D4 | Recibo WhatsApp — TTL | **Página `/r/:id_recibo`** firma URL al vuelo (estable, privada) |
| D5 | Cola offline al logout | **Banner bloqueante** con ventas no sincronizadas |
| D6 | Excepción a ADR-004 (trigger venta→caja) | **ADR-008** la documenta explícitamente |

---

## 5. Mockups ASCII

### 5.1 Carrito POS con propinas y descuentos

```
┌──── CARRITO — Tienda Centro · Naty ──────────────────────────┐
│ 1× Zapato Modelo A  T.36  S/ 120.00  [−10% dsc]   S/ 108.00 │
│ 2× Sandalia B       T.38  S/  80.00                S/ 160.00 │
│                                                              │
│ Subtotal                                            S/ 268.00 │
│ Descuento global   [   %   |  S/  ]   [  0  ]       S/   0.00│
│ Propina            [       S/  ]      [  5  ]       S/   5.00│
│ TOTAL                                               S/ 273.00 │
│                                                              │
│ Pago:  [Efectivo S/150] [Yape S/123] [+ Método]              │
│                                                              │
│  [  COBRAR  ]   (idempotency_key auto)                       │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Modal devolución con recibo digital

```
┌──── DEVOLUCIÓN — Venta #4821 ────────────────────────────────┐
│ Cliente (opcional): [+51 999 888 777    ]                    │
│                                                              │
│ Motivo: [ Talla equivocada          ▼ ]  ← motivos_devolucion│
│                                                              │
│ Ítems a devolver:                                            │
│  ☑ 1× Zapato Modelo A  T.36   S/ 108.00                      │
│  ☐ 2× Sandalia B       T.38   S/ 160.00                      │
│                                                              │
│ Monto a devolver: S/ 108.00                                  │
│ Cuenta origen: [ Efectivo Tienda Centro  ▼ ]                 │
│                                                              │
│  [ Cancelar ]  [ Procesar y enviar recibo ]                  │
│                                                              │
│ ↪ Al procesar: PDF + link /r/:id → WhatsApp deep link        │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Modal "Asignar trabajadores al lote"

```
┌──── Lote #L-0421 · Modelo "Cristal" · 48 pares ──────────────┐
│ Trabajadores asignados:                                       │
│  • Rosa     · Taller · Cortadora     · 48 pares  [Editar]    │
│  • Juan     · Taller · Armador       · 48 pares  [Editar]    │
│  • Juan     · Taller · Pegador       · 24 pares  [Editar]    │
│  • Miguel   · Taller · Pegador       · 24 pares  [Editar]    │
│                                                              │
│ [+ Agregar trabajador]                                       │
│                                                              │
│ Al agregar:                                                  │
│   Persona:  [ Seleccionar     ▼ ]                            │
│   Área:     [ Taller          ▼ ]                            │
│   Cargo:    [ Armador         ▼ ]                            │
│   Pares:    [       ] (vacío = participó en el lote completo)│
│   Notas:    [                      ]                         │
│                                                              │
│                                [ Cancelar ] [ Guardar ]      │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Pestaña "Trabajo del mes" en Trabajadores

```
┌── Rosa García · Abril 2026 ──────────────────────────────────┐
│ Área: Taller · Cargo: Cortadora                              │
│                                                              │
│ Lotes en los que participó:                                  │
│   Modelo Cristal       · 48 pares · lote #L-0421             │
│   Modelo Aurora        · 36 pares · lote #L-0425             │
│   Modelo Sol           · 24 pares · lote #L-0432             │
│                                                              │
│ Total pares cortados del mes: 108                            │
│                                                              │
│  [ 📋 Adjuntar detalle al pago ]  ← pre-llena notas del mov  │
└──────────────────────────────────────────────────────────────┘
```

### 5.5 Banner "Pendientes de sincronización"

```
╔══════════════════════════════════════════════════════════════╗
║  ⚠  3 ventas sin sincronizar — se reintenta al conectar     ║
║     [ Ver detalle ]                              [ Ocultar ] ║
╚══════════════════════════════════════════════════════════════╝
```

Y al intentar cerrar sesión con cola pendiente:

```
┌──── ⚠ Ventas pendientes de sincronización ──────────────────┐
│ Hay 3 ventas guardadas localmente que aún no llegaron al    │
│ servidor. Si cierras sesión ahora en este dispositivo, se   │
│ pierden.                                                    │
│                                                             │
│ [ Seguir conectada y reintentar ]   [ Cerrar igual ]        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Modelo de datos — tablas nuevas / alteradas

```
ventas
  + propina numeric DEFAULT 0
  + descuento_global_pct numeric DEFAULT 0
  + descuento_global_monto numeric DEFAULT 0
  + recibo_url text
  + estado text DEFAULT 'completada'     -- completada | anulada | devuelta_parcial
  + idempotency_key uuid UNIQUE          -- ya existe por Fase 2

ventas_detalle
  + descuento_linea numeric DEFAULT 0
  + descuento_linea_tipo text CHECK (IN ('pct','monto'))

movimientos_caja
  + id_pedido integer → pedidos_semana  (NULL; ON DELETE SET NULL)

lote_asignaciones                 [NEW]
  id_lote, id_persona, id_area, id_cargo, pares_asignados NULL,
  notas, activa, UNIQUE(id_lote,id_persona,id_area,id_cargo)

movimiento_modelos_ligados        [NEW]
  id_movimiento, id_producto, monto_proporcional
  PRIMARY KEY(id_movimiento, id_producto)
```

Vistas nuevas:
- `v_produccion_mensual_persona` — (mes, persona, area, producto) → pares_suma, num_lotes
- `v_costos_reales_modelo_mes` — promedio últimos 3 meses de compras ligadas
- `v_cumplimiento_pedido_semanal` — planificado vs. real por pedido

RPCs nuevos:
- `fn_refrescar_costo_lote(id_lote)` — manual, solo lotes abiertos.

---

## 7. Criterios globales de aceptación

1. **Cero ventas fuera de `movimientos_caja`**: vender por 3 métodos, cerrar día, cuadre exacto con arqueo.
2. **`AUTORIZADAS_CAJA` no existe** (`grep` limpio).
3. **Offline**: cortar WiFi durante 3 ventas; al reconectar, las 3 sincronizan sin duplicados.
4. **Multi-worker lote**: asignar cortador + armador + pegador al mismo lote; un mes después `v_produccion_mensual_persona` muestra pares por persona × área.
5. **Pago con detalle adjunto**: pagar salario de Rosa → botón "Adjuntar detalle" pre-llena `notas` del movimiento.
6. **Compra ligada**: comprar material ligando 2 modelos + 1 pedido; `v_costos_reales_modelo_mes` y `v_cumplimiento_pedido_semanal` lo reflejan.
7. **`npm run build` y `npm run lint` verdes**. Zero regresiones Fase 1/1.5/2.

---

## 8. Referencias

- Plan maestro Fase 3: `plans/2026-04-24-fase3-*.md`
- ADRs: 007 (offline), 008 (trigger caja), 009 (asignación sin FSM), 010 (recibo WhatsApp), 011 (compra ≠ obligación)
- Fase 2: `specs/2026-04-20-rediseno-gestion-empresarial-design.md`
- Glosario: términos nuevos agregados al final de `glossary.md`
