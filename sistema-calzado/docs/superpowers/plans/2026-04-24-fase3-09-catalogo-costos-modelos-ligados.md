# Plan Fase 3.09 — CatalogoCostos: Costo Real + Modelos Ligados

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 05 y 06: `movimiento_modelos_ligados`, `v_costos_reales_modelo_mes`, `fn_refrescar_costo_lote`), ADR-011 (compra ≠ obligación)
**Estima**: 1 día

---

## Objetivo

1. Extender QuickEntry para que al registrar una compra de material, permita ligar a modelos de producto con distribución de montos.
2. Mostrar en `CatalogoCostos.jsx` el costo real promedio (últimos 3 meses de compras ligadas) vs. el costo estándar del catálogo.
3. Botón "Refrescar costo" en detalle del lote (invoca `fn_refrescar_costo_lote`).

## Archivos

### Crear
- `sistema-calzado/src/components/QuickEntry/ModelosLigadosSelector.jsx` — selector de modelos con distribución de monto

### Modificar
- `sistema-calzado/src/components/QuickEntry/QuickEntry.jsx` — mostrar selector de modelos si tipo = `compra_material`
- `sistema-calzado/src/views/CatalogoCostos.jsx` — agregar columna "Costo real prom." desde vista
- `sistema-calzado/src/views/ProduccionLotes.jsx` — botón "Refrescar costo" en detalle del lote

---

## 1. Selector de modelos ligados

```jsx
// src/components/QuickEntry/ModelosLigadosSelector.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../api/supabase';

export default function ModelosLigadosSelector({ montoTotal, onChange }) {
  const [productos, setProductos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);

  useEffect(() => {
    supabase.from('productos')
      .select('id_producto, nombre, codigo')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setProductos(data || []));
  }, []);

  function toggleProducto(idProducto) {
    setSeleccionados(prev => {
      const existe = prev.find(s => s.id_producto === idProducto);
      let next;
      if (existe) {
        next = prev.filter(s => s.id_producto !== idProducto);
      } else {
        next = [...prev, { id_producto: idProducto, monto_proporcional: 0 }];
      }
      // Distribuir equitativamente si no hay montos manuales
      const porItem = montoTotal / (next.length || 1);
      next = next.map(s => ({ ...s, monto_proporcional: Number(porItem.toFixed(2)) }));
      onChange(next);
      return next;
    });
  }

  function updateMonto(idProducto, monto) {
    setSeleccionados(prev => {
      const next = prev.map(s =>
        s.id_producto === idProducto ? { ...s, monto_proporcional: Number(monto) } : s
      );
      onChange(next);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">¿Para qué modelos?</label>
      <div className="flex flex-wrap gap-1">
        {productos.map(p => {
          const sel = seleccionados.find(s => s.id_producto === p.id_producto);
          return (
            <button key={p.id_producto}
              onClick={() => toggleProducto(p.id_producto)}
              className={`px-2 py-1 text-xs rounded-full border ${sel ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>
              {p.nombre}
            </button>
          );
        })}
      </div>
      {seleccionados.length > 1 && (
        <div className="space-y-1 mt-2">
          <p className="text-xs text-stone-400">Distribución del monto (S/ {montoTotal}):</p>
          {seleccionados.map(s => {
            const prod = productos.find(p => p.id_producto === s.id_producto);
            return (
              <div key={s.id_producto} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{prod?.nombre}</span>
                <input type="number" value={s.monto_proporcional}
                  onChange={e => updateMonto(s.id_producto, e.target.value)}
                  className="w-20 text-right border rounded px-1" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

## 2. Integrar en QuickEntry

En `QuickEntry.jsx`, después de los campos de splits, condicionar:

```jsx
{tipoSeleccionado?.categoria_macro === 'compra_material' && (
  <ModelosLigadosSelector
    montoTotal={Number(monto)}
    onChange={setModelosLigados}
  />
)}
```

Al guardar el movimiento, insertar en `movimiento_modelos_ligados`:

```javascript
if (modelosLigados.length > 0 && movimientoId) {
  await supabase.from('movimiento_modelos_ligados').insert(
    modelosLigados.map(ml => ({
      id_movimiento: movimientoId,
      id_producto: ml.id_producto,
      monto_proporcional: ml.monto_proporcional,
    }))
  );
}
```

## 3. Costo real en CatalogoCostos

Cargar `v_costos_reales_modelo_mes` y comparar con el costo estándar:

```javascript
const { data: costosReales } = await supabase
  .from('v_costos_reales_modelo_mes')
  .select('id_producto, costo_total_mes, num_compras');

// Calcular promedio mensual
const promedioPorModelo = {};
costosReales?.forEach(cr => {
  if (!promedioPorModelo[cr.id_producto]) {
    promedioPorModelo[cr.id_producto] = { total: 0, meses: 0 };
  }
  promedioPorModelo[cr.id_producto].total += cr.costo_total_mes;
  promedioPorModelo[cr.id_producto].meses += 1;
});
```

En la tabla del catálogo, agregar columna:

```jsx
<th>Costo estándar</th>
<th>Costo real (prom. 3m)</th>
<th>Δ</th>
```

Con badge color según la diferencia:
- Verde: real <= estándar
- Amarillo: real 1-10% > estándar
- Rojo: real >10% > estándar

## 4. Refrescar costo en lote

En `ProduccionLotes.jsx`, detalle del lote:

```jsx
<button onClick={async () => {
  await supabase.rpc('fn_refrescar_costo_lote', { p_id_lote: lote.id_lote });
  recargarLote();
}}
  className="text-sm text-blue-600 underline">
  🔄 Refrescar costo real
</button>
<span className="text-xs text-stone-400">
  Costo real: S/ {lote.costo_real_unitario?.toFixed(2) || '—'}
</span>
```

---

## Criterios de aceptación

- [ ] Registrar compra tipo "compra_material" por S/500 → selector de modelos aparece.
- [ ] Seleccionar 2 modelos → monto se distribuye equitativamente (S/250 + S/250).
- [ ] Ajustar distribución manual → se guarda en `movimiento_modelos_ligados`.
- [ ] `CatalogoCostos` muestra columna "Costo real" con promedio de últimos 3 meses.
- [ ] Badge color refleja diferencia estándar vs real.
- [ ] Botón "Refrescar costo" en lote invoca RPC y actualiza `costo_real_unitario`.
- [ ] Tipo de movimiento que NO es `compra_material` → selector de modelos no aparece.
