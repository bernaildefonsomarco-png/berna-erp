# ADR-007 — POS offline-first con Service Worker, IndexedDB y cola

**Fecha**: 2026-04-24
**Estado**: Aceptado
**Contexto**: Rediseño Fase 3

## Contexto

Las tiendas operan con WiFi doméstico y datos móviles inestables. Una venta perdida por caída de señal tiene dos costos: **dinero que no se registra** (desaparece del arqueo) y **fricción al cliente** ("cobrando de nuevo"). Hoy la vendedora compensa con papel — que luego nadie transcribe.

La UX actual asume conectividad permanente y reintenta sincronización con F5 manual. No es aceptable para uso empresarial con múltiples tiendas.

## Decisión

POS **offline-first**:

1. **Service Worker** (`public/sw.js`) cachea el bundle (App Shell) — la app abre aunque no haya red.
2. **IndexedDB** local guarda la venta completa (cabecera + items + pagos) antes de enviar.
3. **Cola de sincronización** reintenta con backoff exponencial (1s, 4s, 16s, 1m, 5m, 15m) hasta que el servidor confirme.
4. Cada venta lleva **`idempotency_key` UUID v4** generado en el cliente. El servidor rechaza duplicados por índice único.
5. Banner global **"N ventas sin sincronizar"** cuando la cola no está vacía.
6. **Banner bloqueante al logout** si hay cola pendiente (D5): previene que la vendedora pierda ventas al cambiar de dispositivo.

## Principio subyacente

El POS **no puede depender de la red** para funcionar. La venta se cierra en el cliente y se sincroniza cuando pueda. El servidor es autoridad **contable**, no autoridad de **operación**.

## Alternativas consideradas

**Opción A — Solo online, retry manual con F5** (actual, rechazada): produce ventas perdidas, requiere papel compensatorio.

**Opción B — Offline con LocalStorage** (rechazada): LocalStorage sincrónico y limitado (~5MB); no soporta bien múltiples transacciones concurrentes.

**Opción C — SW + IndexedDB + cola con idempotency** (elegida): estándar web probado, escala, resistente a refrescos.

## Consecuencias

Positivas:
- La vendedora nunca pierde una venta por señal.
- No hay duplicados (idempotency_key + índice único en DB).
- Dashboards pueden tener **lag de minutos** pero jamás data perdida.

Negativas:
- **Cola por dispositivo**: si cambia de tablet antes de sincronizar, la cola queda huérfana. *Mitigado* con banner bloqueante al logout (D5).
- Complejidad: SW + IDB requiere disciplina de versionado del schema IDB.
- Dashboards pueden mostrar "lag" si una tienda está días sin red. *Aceptable*: el reporte dice "sincronizado hasta HH:MM" explícitamente.

## Referencias

- Plan 06: `2026-04-24-fase3-06-pos-offline-sync.md`
- Fase 2: `idempotency_key` y `fn_registrar_hecho_economico`
- MDN: Service Worker, IndexedDB API
