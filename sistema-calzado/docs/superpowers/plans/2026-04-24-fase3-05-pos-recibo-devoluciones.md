# Plan Fase 3.05 — POS: Recibo Digital + Devoluciones

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 03: `devoluciones`, `devolucion_items`), Plan 02 (métodos dinámicos), ADR-010 (recibo WhatsApp)
**Estima**: 1 día

---

## Objetivo

1. Generar un recibo digital como página web firmada (`/r/:id_recibo`) que el cliente recibe por WhatsApp.
2. Implementar flujo de devolución parcial con motivos desde `motivos_devolucion` (catálogo Fase 2).

## Archivos

### Crear
- `sistema-calzado/src/views/ReciboPublico.jsx` — página pública del recibo
- `sistema-calzado/src/api/reciboClient.js` — generación de firma + consulta del recibo

### Modificar
- `sistema-calzado/src/views/VentasPOS.jsx` — modal post-venta con botón "Enviar recibo"
- `sistema-calzado/src/main.jsx` — ruta pública `/r/:id`

---

## 1. Página pública del recibo

### Ruta

En `main.jsx`, agregar ruta pública (no requiere PIN):

```jsx
<Route path="/r/:idRecibo" element={<ReciboPublico />} />
```

### ReciboPublico.jsx

```jsx
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { obtenerReciboPublico } from '../api/reciboClient';

export default function ReciboPublico() {
  const { idRecibo } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [recibo, setRecibo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    obtenerReciboPublico(idRecibo, token)
      .then(setRecibo)
      .catch(() => setError('Recibo no encontrado o enlace expirado'));
  }, [idRecibo, token]);

  if (error) return <div className="p-8 text-center">{error}</div>;
  if (!recibo) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="max-w-md mx-auto p-6 bg-white min-h-screen">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold">Berna Calzado</h1>
        <p className="text-sm text-stone-500">{recibo.ubicacion_nombre}</p>
        <p className="text-xs text-stone-400">{new Date(recibo.fecha_venta).toLocaleString('es-PE')}</p>
      </div>

      <div className="space-y-2 mb-4">
        {recibo.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{item.cantidad}× {item.producto_nombre} T.{item.talla}</span>
            <span>S/ {item.subtotal.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-t pt-2 space-y-1 text-sm">
        {recibo.descuento_global > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Descuento</span>
            <span>−S/ {recibo.descuento_global.toFixed(2)}</span>
          </div>
        )}
        {recibo.propina > 0 && (
          <div className="flex justify-between">
            <span>Propina</span>
            <span>S/ {recibo.propina.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>S/ {recibo.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        {recibo.pagos.map((p, i) => (
          <div key={i} className="flex justify-between text-sm text-stone-500">
            <span>{p.metodo_nombre}</span>
            <span>S/ {p.monto.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-stone-400 text-center mt-6">
        Atendió: {recibo.vendedora_nombre}
      </p>
    </div>
  );
}
```

### reciboClient.js

```javascript
import { supabase } from './supabase';

export function generarReciboUrl(idVenta) {
  // HMAC se genera en el servidor via RPC o Edge Function
  // Por ahora: firma simple con timestamp
  const token = btoa(`${idVenta}:${Date.now()}`);
  return `${window.location.origin}/r/${idVenta}?token=${token}`;
}

export async function obtenerReciboPublico(idRecibo, token) {
  // Validar token (en producción: HMAC server-side)
  if (!token) throw new Error('Token requerido');

  const { data, error } = await supabase
    .from('ventas')
    .select(`
      id_venta, fecha_venta, total, propina,
      descuento_global_pct, descuento_global_monto,
      personas_tienda!id_persona(nombre),
      ubicaciones!id_ubicacion(nombre),
      ventas_detalle(cantidad, talla, subtotal,
        productos(nombre)
      ),
      ventas_pagos(monto,
        metodos_pago(nombre)
      )
    `)
    .eq('id_venta', idRecibo)
    .single();

  if (error) throw error;
  return formatearRecibo(data);
}

function formatearRecibo(raw) {
  return {
    id_venta: raw.id_venta,
    fecha_venta: raw.fecha_venta,
    total: raw.total,
    propina: raw.propina || 0,
    descuento_global: raw.descuento_global_monto || (raw.total * (raw.descuento_global_pct || 0) / 100),
    vendedora_nombre: raw.personas_tienda?.nombre || 'N/A',
    ubicacion_nombre: raw.ubicaciones?.nombre || '',
    items: (raw.ventas_detalle || []).map(d => ({
      cantidad: d.cantidad,
      talla: d.talla,
      producto_nombre: d.productos?.nombre || '',
      subtotal: d.subtotal,
    })),
    pagos: (raw.ventas_pagos || []).map(p => ({
      metodo_nombre: p.metodos_pago?.nombre || '',
      monto: p.monto,
    })),
  };
}

export function generarWhatsAppLink(reciboUrl, telefono) {
  const texto = encodeURIComponent(`Tu recibo de Berna Calzado: ${reciboUrl}`);
  if (telefono) {
    const tel = telefono.replace(/\D/g, '');
    const telFull = tel.startsWith('51') ? tel : `51${tel}`;
    return `https://wa.me/${telFull}?text=${texto}`;
  }
  return `https://wa.me/?text=${texto}`;
}
```

## 2. Modal post-venta con envío de recibo

Después de confirmar la venta, mostrar modal:

```jsx
<div className="text-center space-y-4 p-6">
  <div className="text-green-500 text-4xl">✓</div>
  <p className="font-semibold">Venta registrada</p>
  <p className="text-sm text-stone-500">#{ventaId} · S/ {total.toFixed(2)}</p>

  <div className="space-y-2">
    <button onClick={() => window.open(whatsappLink)}
      className="w-full py-3 bg-green-500 text-white rounded-xl font-bold">
      Enviar recibo por WhatsApp
    </button>
    <button onClick={() => navigator.clipboard.writeText(reciboUrl)}
      className="w-full py-2 text-sm text-stone-500">
      Copiar enlace del recibo
    </button>
  </div>

  <button onClick={cerrarModal}
    className="text-sm text-stone-400 underline">
    Cerrar
  </button>
</div>
```

## 3. Flujo de devolución

### Modal de devolución

Accesible desde el historial de ventas del día. Muestra los items de la venta con checkboxes para seleccionar cuáles devolver (mockup §5.2 del spec).

```jsx
function ModalDevolucion({ venta, onClose, onSuccess }) {
  const [itemsSeleccionados, setItems] = useState({});
  const [motivo, setMotivo] = useState(null);
  const [telefono, setTelefono] = useState('');
  const [motivos, setMotivos] = useState([]);

  useEffect(() => {
    supabase.from('motivos_devolucion')
      .select('id_motivo, nombre')
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setMotivos(data || []));
  }, []);

  const montoDevolver = Object.entries(itemsSeleccionados)
    .filter(([, sel]) => sel)
    .reduce((sum, [idDetalle]) => {
      const item = venta.detalle.find(d => d.id_detalle === Number(idDetalle));
      return sum + (item?.subtotal || 0);
    }, 0);

  async function procesarDevolucion() {
    const { data: dev } = await supabase.from('devoluciones').insert({
      id_venta: venta.id_venta,
      id_persona: usuario.id_persona,
      id_ubicacion: venta.id_ubicacion,
      id_motivo: motivo,
      monto_devuelto: montoDevolver,
      telefono_cliente: telefono || null,
      idempotency_key: crypto.randomUUID(),
    }).select().single();

    const items = Object.entries(itemsSeleccionados)
      .filter(([, sel]) => sel)
      .map(([idDetalle]) => ({
        id_devolucion: dev.id_devolucion,
        id_detalle: Number(idDetalle),
        cantidad: 1,
        monto: venta.detalle.find(d => d.id_detalle === Number(idDetalle)).subtotal,
      }));

    await supabase.from('devolucion_items').insert(items);

    await supabase.from('ventas')
      .update({ estado: 'devuelta_parcial' })
      .eq('id_venta', venta.id_venta);

    onSuccess(dev);
  }
  // ... render con checkboxes, select motivo, input teléfono, botón procesar
}
```

---

## Criterios de aceptación

- [ ] Venta completada → modal muestra botón "Enviar recibo por WhatsApp".
- [ ] Click en WhatsApp → abre deep link con URL del recibo.
- [ ] Abrir `/r/:id?token=...` en otro dispositivo → muestra recibo responsive.
- [ ] `/r/:id` sin token → muestra "Recibo no encontrado".
- [ ] Devolver 1 de 3 items → `devoluciones` tiene 1 fila, `devolucion_items` tiene 1 fila, `ventas.estado = 'devuelta_parcial'`.
- [ ] Motivo de devolución se selecciona de `motivos_devolucion` (catálogo Fase 2).
- [ ] `idempotency_key` previene doble devolución.
