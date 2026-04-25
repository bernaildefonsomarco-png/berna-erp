# Plan Fase 3.10 — Planificador: Permisos por Ubicación + Ligadura Pedido

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 02: `movimientos_caja.id_pedido`), Fase 2 (RBAC)
**Estima**: 0.5 día

---

## Objetivo

1. Reemplazar cualquier control de acceso hardcoded en `PlanificadorPedido.jsx` con verificación RBAC por ubicación.
2. Permitir ligar un movimiento de compra a un pedido semanal (FK `id_pedido` en `movimientos_caja`).
3. Mostrar vista de cumplimiento planificado vs real (`v_cumplimiento_pedido_semanal`).

## Archivos

### Modificar
- `sistema-calzado/src/views/PlanificadorPedido.jsx` — permisos + vista cumplimiento
- `sistema-calzado/src/components/QuickEntry/QuickEntry.jsx` — campo opcional `id_pedido` al registrar compra

---

## 1. Permisos en PlanificadorPedido

```jsx
import { puedeVer, puedeRegistrar, RECURSOS } from './finanzas/lib/permisos';

export default function PlanificadorPedido({ usuario }) {
  if (!puedeVer(usuario, RECURSOS.FINANZAS)) {
    return <p className="p-8 text-center text-stone-500">Sin acceso al planificador.</p>;
  }

  const puedeCrar = puedeRegistrar(usuario, RECURSOS.FINANZAS);
  // ...
}
```

Si el usuario tiene `id_ubicacion_preferida`, filtrar pedidos por esa ubicación. Si es admin, mostrar todos.

## 2. Campo id_pedido en QuickEntry

Al registrar una compra de material, agregar selector opcional:

```jsx
{tipoSeleccionado?.categoria_macro === 'compra_material' && pedidosActivos.length > 0 && (
  <div>
    <label className="text-sm font-medium">¿Para qué pedido? (opcional)</label>
    <select value={idPedido || ''} onChange={e => setIdPedido(e.target.value || null)}
      className="w-full border rounded px-2 py-1 text-sm">
      <option value="">Sin pedido asociado</option>
      {pedidosActivos.map(p => (
        <option key={p.id_pedido} value={p.id_pedido}>
          Semana {p.semana_inicio} — {p.semana_fin}
        </option>
      ))}
    </select>
  </div>
)}
```

Al guardar el movimiento, incluir `id_pedido`:

```javascript
const movData = {
  // ...campos existentes...
  id_pedido: idPedido ? Number(idPedido) : null,
};
```

## 3. Vista de cumplimiento

Agregar tab o sección en `PlanificadorPedido.jsx`:

```jsx
function TabCumplimiento({ idPedido }) {
  const [datos, setDatos] = useState([]);

  useEffect(() => {
    supabase
      .from('v_cumplimiento_pedido_semanal')
      .select('*')
      .eq('id_pedido', idPedido)
      .then(({ data }) => setDatos(data || []));
  }, [idPedido]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-stone-500">
          <th>Modelo</th>
          <th className="text-right">Pedido</th>
          <th className="text-right">Producido</th>
          <th className="text-right">%</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((d, i) => (
          <tr key={i} className="border-t">
            <td>{d.producto_nombre}</td>
            <td className="text-right font-mono">{d.cantidad_pedida}</td>
            <td className="text-right font-mono">{d.cantidad_producida}</td>
            <td className={`text-right font-mono ${
              d.pct_cumplimiento >= 100 ? 'text-green-600' :
              d.pct_cumplimiento >= 80 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {d.pct_cumplimiento}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Criterios de aceptación

- [ ] Operador de taller sin permiso → no accede al planificador.
- [ ] Admin accede a pedidos de todas las ubicaciones.
- [ ] Registrar compra de material → opción de ligar a pedido semanal.
- [ ] Movimiento guardado con `id_pedido` correcto.
- [ ] Vista cumplimiento muestra planificado vs producido con % y colores.
- [ ] Pedido 100% cumplido → verde. <80% → rojo.
