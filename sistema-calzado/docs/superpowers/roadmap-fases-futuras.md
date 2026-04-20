# Roadmap de Fases Futuras — Post Fase 2

**Fecha**: 2026-04-20
**Contexto**: Fase 2 (Rediseño Gestión Empresarial) cubre Finanzas + Comando + DB. Este documento planifica lo que viene después.

---

## Fase 3 — Rediseño POS + Producción

**Motivación**: el POS actual (`VentasPOS.jsx`) y Producción (`ProduccionLotes.jsx`) usan UX del estado inicial del proyecto. No están preparados para múltiples tiendas con características divergentes.

**Alcance**:
- **POS**:
  - Leer métodos de pago desde `metodos_pago` (ya migrado en Fase 2)
  - Soportar propinas, descuentos por cliente, devoluciones con recibo digital
  - Modo offline con sincronización diferida
  - Multi-moneda (USD principalmente, para tienda turística futura)
  - Impresión de ticket en impresora térmica
- **Producción**:
  - Flujo de lote: diseño → corte → armado → terminado → QC → almacén
  - Costeo real vs estándar por lote
  - Bitácora por trabajador (tiempos, mermas)
  - Integración con nómina (producción por destajo para armadores)

**Duración estimada**: 6-8 semanas

---

## Fase 4 — Compras, Proveedores, Inventario Avanzado

**Motivación**: hoy las compras se registran como movimientos sueltos. Falta trazabilidad proveedor → orden → recepción → pago → stock.

**Alcance**:
- Tabla `proveedores` (entidad rica, no catálogo) con `razon_social`, `ruc`, `condicion_pago_default`, `cuenta_contable_default`
- Tabla `ordenes_compra` con items, estado (borrador/enviada/recibida/facturada/pagada)
- Integración con inventario: recepción aumenta stock, con costo real
- `cuentas_por_pagar` — saldo por proveedor
- Módulo de stock consolidado multi-ubicación con transferencias inter-sucursal

**Duración estimada**: 4-6 semanas

---

## Fase 5 — CRM + Ventas Mayoristas

**Motivación**: actualmente las ventas POS son anónimas (B2C). Para crecer hacia distribuidores (B2B), se necesita cliente con cuenta corriente.

**Alcance**:
- Tabla `clientes` con `razon_social`, `ruc`, `credito_maximo`, `dias_credito`
- Tabla `pedidos_mayoristas` con flujo (cotización → confirmado → despachado → facturado → cobrado)
- `cuentas_por_cobrar` con antigüedad de saldos
- Integración con producción (pedido B2B puede disparar orden de producción)
- Descuentos por volumen, listas de precios diferenciadas

**Duración estimada**: 4-6 semanas

---

## Fase 6 — Reportes BI, Impuestos, Auditoría

**Motivación**: al escalar, el dueño necesita vistas macro customizables y cumplimiento tributario.

**Alcance**:
- **Reportes BI**: constructor visual de reportes con drag-drop de dimensiones. Guardar, exportar (Excel/PDF), compartir por link con expiración.
- **Impuestos SUNAT (Perú)**:
  - PLE (Programa de Libros Electrónicos) — generación mensual de archivos TXT
  - Comprobantes electrónicos (boleta, factura) con SUNAT API
  - Declaración mensual IGV
  - Registro de ventas y compras formato SUNAT
- **Auditoría**:
  - Log completo de acciones (quién, cuándo, qué)
  - Trazabilidad de cambios en registros sensibles (cierres, cuentas, permisos)
  - Vista de actividad por usuario/módulo/periodo

**Duración estimada**: 8-10 semanas (SUNAT es complejo)

---

## Fase 7 — Multi-Organización (SaaS)

**Motivación**: el esquema actual tiene `id_organizacion` desde `cierres_periodo` (Fase 1.5). Expandir a TODA la DB para que una sola instancia sirva múltiples empresas.

**Alcance**:
- Agregar `id_organizacion` a todas las tablas transaccionales con RLS (Row-Level Security) de Postgres
- Landing pública con registro self-service
- Billing (Stripe)
- White-label por organización
- Onboarding wizard (importar datos iniciales, configurar plan de cuentas base)
- Backup/restore por organización

**Duración estimada**: 10-12 semanas

---

## Principios transversales a todas las fases

- **Mental model first**: antes de escribir código, validar que el concepto nuevo encaja en los 7 conceptos del sistema (Movimiento, Tipo, Mapeo, Plan, Obligación, Catálogo, Período).
- **Catálogos = tablas dedicadas** siempre (regla Fase 2 se mantiene).
- **No automatizar lo que mueve dinero sin confirmación** (regla obligaciones, extender a todo).
- **Rol ≠ Cargo** — mantener separación en todas las nuevas funcionalidades.
- **Wizards para flujos con decisión contable** — nunca exponer cuentas contables al usuario operativo.
- **Mobile-first en Modo Rápido + Ubicaciones**, desktop-first en Gestión Empresarial.

---

## Sobre el orden

Este orden es **recomendación**, no obligación. Fases 3-5 pueden reordenarse según prioridad del negocio. Fase 6 depende conceptualmente de 3-5. Fase 7 solo tiene sentido si hay un segundo cliente concreto.

Si aparece una fase nueva no contemplada (ej: "Ecommerce" o "App móvil nativa"), se documenta aquí antes de iniciarla.
