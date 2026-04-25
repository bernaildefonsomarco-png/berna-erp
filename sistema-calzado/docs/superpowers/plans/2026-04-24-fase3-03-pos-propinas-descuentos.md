# Plan Fase 3.03 — POS: Propinas y Descuentos

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 01: columnas propina/descuento en ventas), Plan 02 (métodos dinámicos)
**Estima**: 0.5 día

---

## Objetivo

Agregar soporte de propinas voluntarias y descuentos (por línea y global) al carrito POS. El mockup de referencia es §5.1 del spec maestro.

## Archivos

### Modificar
- `sistema-calzado/src/views/VentasPOS.jsx` — agregar UI de propina, descuento global y descuento por línea + cálculo de totales

---

## Cambios en VentasPOS.jsx

### 1. Estado adicional

```javascript
const [propina, setPropina] = useState(0);
const [descuentoGlobalPct, setDescuentoGlobalPct] = useState(0);
const [descuentoGlobalMonto, setDescuentoGlobalMonto] = useState(0);
const [descuentoModo, setDescuentoModo] = useState('pct'); // 'pct' | 'monto'
// Descuento por línea: { [idDetalle]: { valor: number, tipo: 'pct'|'monto' } }
const [descuentosLinea, setDescuentosLinea] = useState({});
```

### 2. Cálculo del total

```javascript
function calcularTotal() {
  let subtotal = 0;
  items.forEach(item => {
    let lineaTotal = item.precio * item.cantidad;
    const dsc = descuentosLinea[item.id];
    if (dsc) {
      lineaTotal -= dsc.tipo === 'pct'
        ? lineaTotal * (dsc.valor / 100)
        : dsc.valor;
    }
    subtotal += Math.max(0, lineaTotal);
  });

  const descuentoGlobal = descuentoModo === 'pct'
    ? subtotal * (descuentoGlobalPct / 100)
    : descuentoGlobalMonto;

  return Math.max(0, subtotal - descuentoGlobal + propina);
}
```

### 3. UI de descuento por línea

En cada fila del carrito, agregar un toggle de descuento:

```jsx
<button onClick={() => toggleDescuentoLinea(item.id)}
  className="text-xs text-blue-500">
  {descuentosLinea[item.id] ? `−${descuentosLinea[item.id].valor}${descuentosLinea[item.id].tipo === 'pct' ? '%' : ''}` : 'Dsc.'}
</button>
```

Al click, mostrar input inline con toggle `%` / `S/`.

### 4. UI de propina y descuento global

Debajo del subtotal, antes de SeccionPago:

```jsx
<div className="flex items-center justify-between text-sm">
  <span>Descuento global</span>
  <div className="flex gap-1">
    <button onClick={() => setDescuentoModo('pct')}
      className={descuentoModo === 'pct' ? 'font-bold' : ''}>%</button>
    <button onClick={() => setDescuentoModo('monto')}
      className={descuentoModo === 'monto' ? 'font-bold' : ''}>S/</button>
    <input type="number" inputMode="decimal"
      value={descuentoModo === 'pct' ? descuentoGlobalPct : descuentoGlobalMonto}
      onChange={e => descuentoModo === 'pct'
        ? setDescuentoGlobalPct(Number(e.target.value))
        : setDescuentoGlobalMonto(Number(e.target.value))}
      className="w-16 text-right border rounded px-1" />
  </div>
</div>
<div className="flex items-center justify-between text-sm">
  <span>Propina</span>
  <input type="number" inputMode="decimal"
    value={propina || ''}
    onChange={e => setPropina(Number(e.target.value))}
    placeholder="0"
    className="w-16 text-right border rounded px-1" />
</div>
```

### 5. Guardar en la venta

Al insertar en `ventas`:

```javascript
const ventaData = {
  // ...campos existentes...
  propina,
  descuento_global_pct: descuentoModo === 'pct' ? descuentoGlobalPct : 0,
  descuento_global_monto: descuentoModo === 'monto' ? descuentoGlobalMonto : 0,
};
```

Al insertar en `ventas_detalle`, agregar:

```javascript
detalle.map(item => ({
  // ...campos existentes...
  descuento_linea: descuentosLinea[item.id]?.valor || 0,
  descuento_linea_tipo: descuentosLinea[item.id]?.tipo || 'monto',
}));
```

---

## Criterios de aceptación

- [ ] Vender 2 items, aplicar 10% descuento a la línea 1 → subtotal refleja el descuento.
- [ ] Aplicar descuento global de S/20 → total reduce S/20.
- [ ] Agregar propina de S/5 → total aumenta S/5.
- [ ] El total final incluye la propina en el movimiento_caja generado por el trigger.
- [ ] `ventas.propina`, `ventas.descuento_global_pct`, `ventas.descuento_global_monto` se guardan correctamente.
- [ ] `ventas_detalle.descuento_linea` y `descuento_linea_tipo` se guardan por línea.
