# Plan Fase 3.11 — QA, Pulido y Release

**Fecha**: 2026-04-24
**Depende de**: Planes 01-10 completados
**Estima**: 1 día

---

## Objetivo

Validación end-to-end de Fase 3 antes de merge a `main` y tag `v3.0.0-fase3`. Smoke tests manuales, revisión de lint/build, revisión mobile, verificación de integración POS→Caja→P&L, y commit final.

---

## Checklist de QA funcional

### POS

- [ ] Métodos de pago se cargan de `metodos_pago` (no hardcoded).
- [ ] Agregar nuevo método en DB → aparece en POS sin redeploy.
- [ ] Desactivar método → desaparece del POS.
- [ ] Vender con 2 métodos → `ventas_pagos` tiene 2 filas.
- [ ] Propina de S/5 → total aumenta S/5, `ventas.propina = 5`.
- [ ] Descuento por línea 10% → subtotal refleja descuento.
- [ ] Descuento global S/20 → total reduce S/20.
- [ ] `idempotency_key` previene duplicados en reintentos.

### Trigger venta → caja

- [ ] Venta con 3 métodos → 3 filas en `movimientos_caja` con `idempotency_key = {uuid}-{id_metodo}`.
- [ ] Anular venta → movimientos marcados `[ANULADO]`.
- [ ] Cerrar día: arqueo de caja cuadra exacto con ventas + movimientos manuales.
- [ ] `AUTORIZADAS_CAJA` no existe (`grep -r AUTORIZADAS_CAJA` = 0 matches).

### Recibo digital + devoluciones

- [ ] Post-venta: botón "Enviar recibo por WhatsApp" funciona.
- [ ] Abrir `/r/:id?token=...` → recibo responsive.
- [ ] Sin token → 404 / "no encontrado".
- [ ] Devolver 1 de 3 items → `devoluciones`, `devolucion_items` correctos, `ventas.estado = 'devuelta_parcial'`.
- [ ] Motivo se selecciona de catálogo `motivos_devolucion`.

### Offline

- [ ] Cortar WiFi → vender 3 veces → guardadas en IndexedDB.
- [ ] Reconectar → sincroniza las 3 sin duplicados.
- [ ] Banner "N ventas sin sincronizar" visible.
- [ ] Intentar logout con cola → alerta bloqueante.
- [ ] App abre sin internet (SW cachea App Shell).

### Producción

- [ ] Asignar 3 trabajadores a un lote con cargos distintos → 3 filas en `lote_asignaciones`.
- [ ] Juan como armador + pegador del mismo lote → 2 filas (UNIQUE con `id_cargo`).
- [ ] `v_produccion_mensual_persona` muestra pares por persona × área × mes.
- [ ] Tab "Trabajo del mes" en Trabajadores muestra resumen.
- [ ] "Copiar detalle" → clipboard con formato legible.

### CatalogoCostos + modelos ligados

- [ ] Compra de material → selector de modelos aparece.
- [ ] Ligadura guardada en `movimiento_modelos_ligados`.
- [ ] `CatalogoCostos` muestra costo real prom. 3m vs estándar.
- [ ] Badge color según diferencia (verde/amarillo/rojo).
- [ ] "Refrescar costo" en lote invoca RPC y actualiza.

### Planificador

- [ ] Permisos RBAC funcionan.
- [ ] Compra se puede ligar a pedido semanal.
- [ ] Vista cumplimiento muestra % con colores.

---

## Checklist técnico

### Build y lint

```bash
cd sistema-calzado
npm run lint
npm run build
npm run preview
```

- [ ] `npm run lint` pasa sin errores.
- [ ] `npm run build` compila sin errores.
- [ ] Bundle size no aumentó >15% vs pre-Fase-3.
- [ ] `npm run preview` arranca y flujo completo funciona.

### DB

- [ ] Todas las migraciones `20260424_01..06` aplicadas en orden.
- [ ] `supabase_schema.sql` actualizado con tablas nuevas.
- [ ] `grep -r AUTORIZADAS_CAJA` devuelve 0 matches.
- [ ] `grep -r "key:'efectivo'" src/views/VentasPOS.jsx` devuelve 0 matches (no hardcoded).

### Mobile responsive

- [ ] POS usable en tablet (carrito, pagos, propina).
- [ ] Modal devolución usable en mobile.
- [ ] Modal asignación de trabajadores usable en mobile.
- [ ] Banner sync pendiente no tapa contenido.

---

## Regresión de features existentes

- [ ] PIN login funciona.
- [ ] Producción lotes funciona (estado_lote no roto).
- [ ] Inventario funciona.
- [ ] Estado de Resultados funciona.
- [ ] Dashboard funciona.
- [ ] Deudas con amortización funciona.
- [ ] Cierres de período funciona (Fase 1.5 intacta).
- [ ] Modo Rápido (`/rapido/*`) intacto.

---

## Criterios globales de aceptación (del spec maestro §7)

1. [ ] **Cero ventas fuera de `movimientos_caja`**: vender por 3 métodos, cerrar día, cuadre exacto.
2. [ ] **`AUTORIZADAS_CAJA` no existe**.
3. [ ] **Offline**: cortar WiFi durante 3 ventas; al reconectar sincronizan sin duplicados.
4. [ ] **Multi-worker lote**: cortador + armador + pegador → `v_produccion_mensual_persona` muestra pares por persona × área.
5. [ ] **Pago con detalle adjunto**: pagar salario de Rosa → "Adjuntar detalle" pre-llena notas del movimiento.
6. [ ] **Compra ligada**: comprar material ligando 2 modelos + 1 pedido → `v_costos_reales_modelo_mes` y `v_cumplimiento_pedido_semanal` lo reflejan.
7. [ ] **`npm run build` y `npm run lint` verdes**. Zero regresiones.

---

## Release

```bash
git add .
git commit -m "feat(fase3): adaptación POS + Producción al núcleo Fase 2

Delivers: métodos pago dinámicos, propinas/descuentos, trigger venta→caja,
recibo digital WhatsApp, devoluciones, POS offline-first (SW+IDB),
asignación multi-worker por lote, trabajo mensual por persona,
costo real vs estándar en catálogo, ligadura compra→modelo,
planificador con RBAC y cumplimiento, eliminación AUTORIZADAS_CAJA."

git tag -a v3.0.0-fase3 -m "Fase 3 — Adaptación POS + Producción"
git push origin main --tags
```

---

## Criterio de cierre de Fase 3

Fase 3 se considera cerrada cuando:

1. Todos los checkboxes de QA funcional tachados.
2. Todos los checkboxes técnicos tachados.
3. Regresión pasada.
4. Tag `v3.0.0-fase3` pusheado.
5. Marco valida en staging y da OK.
6. `CLAUDE.md` actualizado con cambios de Fase 3.

→ Procede Fase 4 (Compras, Proveedores, Inventario Avanzado — ver `roadmap-fases-futuras.md`).
