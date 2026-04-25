# Plan Fase 3.02 — POS: Métodos de Pago Dinámicos

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 01 + 02: `ventas_pagos`, `metodos_pago` ya existe de Fase 2)
**Estima**: 0.5 día

---

## Objetivo

Reemplazar el array hardcoded `METODOS` en `VentasPOS.jsx` por una consulta a la tabla `metodos_pago` (creada en Fase 2). El admin puede agregar/desactivar métodos desde Catálogos del sistema sin tocar código.

## Archivos

### Modificar
- `sistema-calzado/src/views/VentasPOS.jsx` — reemplazar `METODOS` hardcoded + refactor `SeccionPago` + crear tabla `ventas_pagos` al guardar

### Crear
- `sistema-calzado/src/api/metodoPagoClient.js` — cliente Supabase para `metodos_pago`

---

## Cambios en VentasPOS.jsx

### 1. Nuevo cliente de métodos de pago

```javascript
// src/api/metodoPagoClient.js
import { supabase } from './supabase';

export async function listarMetodosPagoActivos() {
  const { data, error } = await supabase
    .from('metodos_pago')
    .select('id_metodo, codigo, nombre, tipo, requiere_referencia, orden')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data;
}
```

### 2. Cargar métodos al montar VentasPOS

Reemplazar:
```javascript
const METODOS = [
  { key:'efectivo', label:'Efectivo', short:'E' },
  { key:'yape',     label:'Yape',     short:'Y' },
  { key:'plin',     label:'Plin',     short:'P' },
  { key:'tarjeta',  label:'Tarjeta',  short:'T' },
];
```

Por:
```javascript
const [metodos, setMetodos] = useState([]);

useEffect(() => {
  listarMetodosPagoActivos().then(data => {
    setMetodos(data.map(m => ({
      key: m.codigo,
      label: m.nombre,
      short: m.nombre.charAt(0).toUpperCase(),
      id_metodo: m.id_metodo,
      requiere_referencia: m.requiere_referencia,
    })));
  });
}, []);
```

### 3. Refactor SeccionPago

- `SeccionPago` recibe `metodos` como prop en vez de usar constante interna.
- El estado `pagos` pasa de `{ efectivo:'', yape:'', ... }` a un objeto dinámico `{ [codigo]: '' }`.
- Si `requiere_referencia` es `true`, mostrar input de referencia debajo del monto.

### 4. Guardar pagos en `ventas_pagos`

Al confirmar la venta, además de insertar en `ventas`, insertar en `ventas_pagos`:

```javascript
const pagosActivos = metodos
  .filter(m => Number(pagos[m.key]) > 0)
  .map(m => ({
    id_venta: ventaId,
    id_metodo: m.id_metodo,
    monto: Number(pagos[m.key]),
    referencia: referencias[m.key] || null,
  }));

await supabase.from('ventas_pagos').insert(pagosActivos);
```

---

## Criterios de aceptación

- [ ] Agregar un nuevo método de pago en `metodos_pago` (ej. "Transferencia bancaria") → aparece automáticamente en POS sin redeploy.
- [ ] Desactivar "Plin" en la tabla → desaparece del POS.
- [ ] Venta con 2 métodos genera 2 filas en `ventas_pagos` con `id_metodo` correcto.
- [ ] `METODOS` hardcoded no existe más en el código (`grep` limpio).
- [ ] Método con `requiere_referencia=true` muestra input de referencia.

## Test manual

1. `SELECT * FROM metodos_pago WHERE activo ORDER BY orden` → 4 métodos (efectivo, yape, plin, tarjeta).
2. `INSERT INTO metodos_pago (codigo, nombre, tipo, orden) VALUES ('transferencia','Transferencia','transferencia',50)`.
3. Recargar POS → aparece botón "Transferencia".
4. Vender con Efectivo S/100 + Transferencia S/50 → `ventas_pagos` tiene 2 filas.
