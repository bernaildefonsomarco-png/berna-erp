# Plan Fase 3.06 — POS: Offline Sync con Service Worker + IndexedDB

**Fecha**: 2026-04-24
**Depende de**: Plan 02 (métodos dinámicos), Plan 04 (idempotency_key), ADR-007 (offline-first)
**Estima**: 2 días

---

## Objetivo

Hacer que el POS funcione sin conexión: las ventas se guardan localmente en IndexedDB y se sincronizan cuando vuelve la red. Banner visible cuando hay ventas pendientes. Bloqueo de logout si la cola no está vacía.

## Archivos

### Crear
- `sistema-calzado/public/sw.js` — Service Worker para App Shell cache
- `sistema-calzado/src/lib/offlineStore.js` — wrapper IndexedDB (idb-keyval o Dexie)
- `sistema-calzado/src/lib/syncQueue.js` — cola de sincronización con backoff exponencial
- `sistema-calzado/src/components/BannerSyncPendiente.jsx` — banner "N ventas sin sincronizar"

### Modificar
- `sistema-calzado/src/views/VentasPOS.jsx` — guardar en IDB primero, POST después
- `sistema-calzado/src/main.jsx` — registrar Service Worker
- `sistema-calzado/index.html` o `vite.config.js` — configurar SW manifest

---

## 1. Service Worker — App Shell

```javascript
// public/sw.js
const CACHE_NAME = 'berna-pos-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

### Registrar en main.jsx

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

## 2. IndexedDB Store

```javascript
// src/lib/offlineStore.js
import { openDB } from 'idb';

const DB_NAME = 'berna-pos';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('ventasPendientes')) {
        db.createObjectStore('ventasPendientes', { keyPath: 'idempotency_key' });
      }
    },
  });
}

export async function guardarVentaLocal(venta) {
  const db = await getDB();
  await db.put('ventasPendientes', {
    ...venta,
    savedAt: Date.now(),
    syncStatus: 'pending',
  });
}

export async function obtenerVentasPendientes() {
  const db = await getDB();
  return db.getAll('ventasPendientes');
}

export async function eliminarVentaLocal(idempotencyKey) {
  const db = await getDB();
  await db.delete('ventasPendientes', idempotencyKey);
}

export async function contarPendientes() {
  const db = await getDB();
  return db.count('ventasPendientes');
}
```

**Dependencia**: `npm install idb` (librería ligera ~1.5KB).

## 3. Cola de sincronización

```javascript
// src/lib/syncQueue.js
import { obtenerVentasPendientes, eliminarVentaLocal } from './offlineStore';
import { supabase } from '../api/supabase';

const BACKOFF = [1000, 4000, 16000, 60000, 300000, 900000]; // 1s → 15min
let intentoActual = 0;
let timerId = null;

export function iniciarSync() {
  if (timerId) return;
  procesarCola();
}

async function procesarCola() {
  const pendientes = await obtenerVentasPendientes();
  if (pendientes.length === 0) {
    intentoActual = 0;
    return;
  }

  for (const venta of pendientes) {
    try {
      const { error } = await supabase.from('ventas').insert(venta.ventaData);
      if (error) {
        if (error.code === '23505') {
          await eliminarVentaLocal(venta.idempotency_key);
          continue;
        }
        throw error;
      }

      if (venta.pagosData?.length) {
        await supabase.from('ventas_pagos').insert(venta.pagosData);
      }

      await eliminarVentaLocal(venta.idempotency_key);
      intentoActual = 0;
    } catch {
      const delay = BACKOFF[Math.min(intentoActual, BACKOFF.length - 1)];
      intentoActual++;
      timerId = setTimeout(() => { timerId = null; procesarCola(); }, delay);
      return;
    }
  }

  window.dispatchEvent(new Event('sync-complete'));
}

export function forzarSync() {
  intentoActual = 0;
  if (timerId) { clearTimeout(timerId); timerId = null; }
  procesarCola();
}

// Escuchar reconexión
window.addEventListener('online', () => {
  forzarSync();
});
```

## 4. Flujo en VentasPOS

```javascript
async function confirmarVenta(ventaData, pagosData) {
  const idempotencyKey = crypto.randomUUID();
  ventaData.idempotency_key = idempotencyKey;

  // Siempre guardar en IDB primero
  await guardarVentaLocal({
    idempotency_key: idempotencyKey,
    ventaData,
    pagosData,
  });

  // Intentar POST inmediato
  if (navigator.onLine) {
    try {
      const { error } = await supabase.from('ventas').insert(ventaData);
      if (!error || error.code === '23505') {
        if (!error && pagosData.length) {
          await supabase.from('ventas_pagos').insert(pagosData);
        }
        await eliminarVentaLocal(idempotencyKey);
        return { ok: true, offline: false };
      }
    } catch { /* fall through to offline */ }
  }

  iniciarSync();
  return { ok: true, offline: true };
}
```

## 5. Banner sync pendiente

```jsx
// src/components/BannerSyncPendiente.jsx
import { useState, useEffect } from 'react';
import { contarPendientes } from '../lib/offlineStore';
import { forzarSync } from '../lib/syncQueue';

export default function BannerSyncPendiente() {
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const check = () => contarPendientes().then(setPendientes);
    check();
    const interval = setInterval(check, 5000);
    window.addEventListener('sync-complete', check);
    return () => {
      clearInterval(interval);
      window.removeEventListener('sync-complete', check);
    };
  }, []);

  if (pendientes === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 flex items-center justify-between text-sm">
      <span>⚠ {pendientes} venta{pendientes > 1 ? 's' : ''} sin sincronizar</span>
      <button onClick={forzarSync}
        className="text-amber-600 underline text-xs font-medium">
        Reintentar ahora
      </button>
    </div>
  );
}
```

## 6. Bloqueo de logout

En el componente de logout, interceptar:

```javascript
async function handleLogout() {
  const n = await contarPendientes();
  if (n > 0) {
    const confirmar = window.confirm(
      `Hay ${n} venta(s) sin sincronizar. Si cierras sesión en este dispositivo, se pierden.\n\n¿Cerrar igual?`
    );
    if (!confirmar) return;
  }
  logout();
}
```

---

## Criterios de aceptación

- [ ] Cortar WiFi → vender 3 veces → las 3 ventas se guardan en IndexedDB.
- [ ] Reconectar WiFi → las 3 ventas se sincronizan automáticamente sin duplicados.
- [ ] Banner "3 ventas sin sincronizar" visible mientras hay cola.
- [ ] Banner desaparece cuando la cola se vacía.
- [ ] Intentar logout con cola pendiente → alerta de confirmación.
- [ ] App abre incluso sin internet (App Shell cacheado por SW).
- [ ] Si el POST falla con 23505 (duplicado), la venta se elimina de IDB (ya estaba en el servidor).
