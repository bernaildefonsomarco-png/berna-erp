# Plan Fase 3.04 — POS: Trigger Caja + Permisos por Ubicación

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 02: trigger + `ventas_pagos`), Plan 02 (métodos dinámicos)
**Estima**: 0.5 día

---

## Objetivo

1. Verificar que el trigger `fn_venta_genera_movimientos` funciona end-to-end con la venta POS refactorizada.
2. Eliminar el array `AUTORIZADAS_CAJA` hardcoded del módulo Caja y reemplazarlo con verificación de permisos RBAC por `id_ubicacion`.

## Archivos

### Modificar
- `sistema-calzado/src/views/VentasPOS.jsx` — generar `idempotency_key` antes del POST
- `sistema-calzado/src/views/Caja.jsx` — eliminar `AUTORIZADAS_CAJA`, implementar permiso por ubicación

---

## 1. Idempotency key en VentasPOS

Al abrir el carrito (o al montar el componente de venta), generar UUID:

```javascript
const [idempotencyKey] = useState(() => crypto.randomUUID());
```

Al confirmar la venta, enviar en el payload:

```javascript
const ventaData = {
  // ...otros campos...
  idempotency_key: idempotencyKey,
};
```

Si el POST responde con error `23505` (unique_violation en `idempotency_key`), tratar como éxito:

```javascript
const { error } = await supabase.from('ventas').insert(ventaData);
if (error) {
  if (error.code === '23505' && error.message.includes('idempotency')) {
    // Venta ya registrada por intento anterior — éxito silencioso
    return { ok: true, duplicado: true };
  }
  throw error;
}
```

## 2. Verificación del trigger

Después de insertar la venta + `ventas_pagos`, verificar que `movimientos_caja` tiene las filas esperadas:

```javascript
const { data: movimientos } = await supabase
  .from('movimientos_caja')
  .select('id_movimiento, monto, concepto')
  .like('idempotency_key', `${idempotencyKey}-%`);

if (movimientos.length === 0) {
  console.warn('Trigger no generó movimientos — verificar fn_venta_genera_movimientos');
}
```

Esto es solo un `console.warn` de diagnóstico en dev, no bloquea al usuario.

## 3. Eliminar AUTORIZADAS_CAJA del módulo Caja

### Estado actual

`Caja.jsx` tiene un array hardcoded tipo:

```javascript
const AUTORIZADAS_CAJA = ['marco@berna.pe', 'marisol@berna.pe'];
```

O similar, que restringe quién puede acceder al módulo de caja.

### Reemplazo con RBAC

```javascript
import { puedeVer, RECURSOS } from '../finanzas/lib/permisos';

// Al montar el componente:
if (!puedeVer(usuario, RECURSOS.CAJA)) {
  return <div className="p-8 text-center text-stone-500">
    No tienes permiso para acceder a Caja.
  </div>;
}
```

Para filtrar por ubicación:

```javascript
// Solo mostrar caja de la ubicación asignada al usuario
const ubicacionUsuario = usuario.id_ubicacion_preferida;
// Si es admin, mostrar selector de ubicación
const esAdminCaja = esAdmin(usuario, RECURSOS.CAJA);
```

### Pasos

1. Buscar `AUTORIZADAS_CAJA` en todo el código (`grep -r AUTORIZADAS`).
2. Reemplazar cada referencia con la verificación de permisos.
3. Eliminar la constante.
4. Verificar que `permisos_persona` tiene el recurso `caja` con niveles apropiados para los usuarios que antes estaban en el array.

---

## Criterios de aceptación

- [ ] Vender con 2 métodos de pago → `movimientos_caja` tiene 2 filas con `idempotency_key` = `{uuid}-{id_metodo}`.
- [ ] Reintentar la misma venta (mismo `idempotency_key`) → no duplica, no muestra error al usuario.
- [ ] `grep -r AUTORIZADAS_CAJA` devuelve 0 matches en el código.
- [ ] Usuario con permiso `caja >= ver` accede al módulo Caja.
- [ ] Usuario sin permiso ve mensaje "No tienes permiso".
- [ ] Admin ve todas las ubicaciones; operador solo ve la suya.
- [ ] Anular una venta → movimientos marcados con `[ANULADO]`.
