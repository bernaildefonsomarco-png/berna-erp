# ADR-010 — Recibo digital vía página firmada + WhatsApp deep link

**Fecha**: 2026-04-24
**Estado**: Aceptado
**Contexto**: Rediseño Fase 3

## Contexto

Al cerrar una venta en POS, la vendedora necesita poder compartir un comprobante con el cliente. Hoy no existe ningún mecanismo: el cliente se va sin recibo.

En tiendas de calzado B2C en Perú, el canal natural de entrega es **WhatsApp** (95%+ de penetración). Pero integrar WhatsApp Business API implica costos recurrentes, certificación de templates y dependencia de un tercero para una operación core.

La alternativa elegante: generar una **página web pública con URL firmada** que muestre el recibo, y compartirla por WhatsApp con un deep link `https://wa.me/?text=...`.

## Decisión

El recibo es una **página `/r/:id_recibo`** con URL firmada (token HMAC en query string, expira en 30 días). No es PDF descargable como primera opción — es una página responsive que el cliente abre en el navegador de WhatsApp.

Flujo:
1. Venta completada → backend genera `recibo_url` con firma HMAC.
2. POS muestra botón **"Enviar recibo"** con deep link WhatsApp: `https://wa.me/?text=Tu%20recibo%20de%20Berna:%20{recibo_url}`.
3. Si la vendedora capturó número de teléfono: `https://wa.me/51{telefono}?text=...`.
4. El cliente abre la URL → ve detalle de la venta, items, montos, métodos de pago.
5. La página tiene botón **"Descargar PDF"** para quien lo necesite (generación lazy con `@react-pdf/renderer`).

**Firma HMAC**: `?token=HMAC_SHA256(id_recibo, VITE_RECIBO_SECRET)`. El servidor valida el token antes de renderizar. Sin token válido → 404. Esto permite que la URL sea pública sin exponer datos sensibles.

## Principio subyacente

**Compartir ≠ integrar**. No necesitamos la API de WhatsApp para que el cliente reciba su recibo por WhatsApp. Basta un link que se comparta por cualquier canal. WhatsApp deep link es solo el default — el link funciona igual copiado, enviado por SMS o por email.

## Alternativas consideradas

**Opción A — WhatsApp Business API con templates** (rechazada): costo mensual, certificación de plantillas, dependencia de proveedor, complejidad de onboarding.

**Opción B — PDF generado y descargado en el dispositivo** (rechazada): no llega al cliente directamente; requiere que la vendedora lo comparta manualmente; PDF pesa más que una URL.

**Opción C — Página `/r/:id_recibo` con firma HMAC + deep link WhatsApp** (elegida): cero costo recurrente, funciona con cualquier canal de mensajería, URL liviana, el cliente guarda el link en su chat.

## Consecuencias

Positivas:
- Cero costos de integración con WhatsApp.
- Funciona sin internet en el momento de la venta (el link se genera localmente, se envía cuando hay red).
- El cliente tiene el recibo accesible desde su historial de chat.
- Si en el futuro se integra WhatsApp Business API, la URL sigue siendo válida.

Negativas:
- El recibo solo es accesible mientras el servidor esté arriba y la URL no haya expirado (30 días).
- Requiere que la vendedora tenga WhatsApp en el dispositivo POS (mitigado: 100% de las vendedoras lo tienen).
- La firma HMAC requiere un secret compartido entre cliente y servidor (variable de entorno).

## Referencias

- Plan 05: `2026-04-24-fase3-05-pos-recibo-devoluciones.md`
- Decisión D4 del spec maestro Fase 3
- Mockup 5.2 del spec maestro
