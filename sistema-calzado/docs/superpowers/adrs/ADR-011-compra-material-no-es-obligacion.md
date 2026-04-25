# ADR-011 — Compra de material para producción NO es obligación recurrente

**Fecha**: 2026-04-24
**Estado**: Aceptado
**Contexto**: Rediseño Fase 3

## Contexto

En Fase 2 se creó el modelo de **obligaciones recurrentes** (ADR-004): recetas que generan instancias periódicas para gastos fijos (alquiler, luz, internet, sueldos). El modelo funciona para pagos con fecha y monto predecibles.

La compra de material para producción (cuero, suelas, pegamento, hilos) **no encaja** en ese modelo:
- No es periódica con frecuencia fija — se compra cuando se necesita, según los pedidos.
- El monto varía por orden (depende de modelos, cantidades, proveedor del momento).
- No tiene "fecha de vencimiento" — se compra hoy porque el taller lo necesita mañana.
- Un mismo material puede comprarse a 3 proveedores distintos en el mismo mes.

Forzar las compras de material al modelo de obligaciones recurrentes produciría obligaciones "fantasma" que nunca se confirman a tiempo, instancias canceladas masivamente, y confusión operativa.

## Decisión

La compra de material se registra como un **movimiento_caja normal** con categoría `compra_material → costo_produccion` (wizard de tipos, Fase 2). Lo que la distingue de un gasto genérico es la **ligadura a modelos de producto** via tabla `movimiento_modelos_ligados`:

```sql
movimiento_modelos_ligados (
  id_movimiento  → movimientos_caja(id_movimiento),
  id_producto    → productos(id_producto),
  monto_proporcional numeric(12,2),
  PRIMARY KEY (id_movimiento, id_producto)
)
```

Al registrar una compra de material:
1. El usuario usa `+ Registrar` (QuickEntry) → selecciona tipo "Compra de material".
2. QuickEntry muestra campo extra: **"¿Para qué modelos?"** (multiselect de productos).
3. El monto se distribuye proporcionalmente (o manual) entre los modelos seleccionados.
4. Los splits se guardan en `movimiento_modelos_ligados`.

Esto alimenta `v_costos_reales_modelo_mes` (promedio de compras ligadas de últimos 3 meses) y permite comparar costo real vs. costo estándar del catálogo.

## Principio subyacente

**No forzar un modelo de datos a un caso de uso que no le corresponde**. Las obligaciones recurrentes son para gastos predecibles con calendario fijo. Las compras de material son eventos discretos ligados a la demanda de producción. Mezclarlos corrompe ambos modelos.

## Alternativas consideradas

**Opción A — Crear obligación recurrente "Compra de cuero mensual"** (rechazada): el monto, proveedor y timing varían tanto que la obligación nunca refleja la realidad. Genera instancias que se cancelan o ignoran.

**Opción B — Módulo de órdenes de compra completo** (rechazada para Fase 3): es el alcance de Fase 4 (Compras, Proveedores, Inventario Avanzado). Hoy no justifica la complejidad.

**Opción C — Movimiento normal con ligadura a modelos via `movimiento_modelos_ligados`** (elegida): simple, trazable, alimenta reportes de costo real por modelo sin sobreingeniería.

## Consecuencias

Positivas:
- El dueño puede ver "cuánto gastamos en material para el modelo Cristal este mes" sin sistema de compras formal.
- Costo real vs. estándar visible en CatalogoCostos — decisiones de precio basadas en datos.
- Compatible con Fase 4: cuando se agregue `ordenes_compra`, la ligadura a modelos se puede migrar sin romper historial.

Negativas:
- Sin integración formal de proveedores — la compra no queda ligada a quién vendió el material (eso es Fase 4).
- La distribución proporcional del monto entre modelos es manual o prorrateada — puede ser imprecisa si un material se usa para 10 modelos.

## Referencias

- Plan 09: `2026-04-24-fase3-09-catalogo-costos-modelos-ligados.md`
- ADR-004: obligaciones recurrentes (contraste)
- Roadmap Fase 4: `roadmap-fases-futuras.md`
- Spec maestro Fase 3: sección 3 (alcance), sección 6 (modelo de datos)
