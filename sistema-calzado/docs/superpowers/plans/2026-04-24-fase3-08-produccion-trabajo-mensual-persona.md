# Plan Fase 3.08 — Producción: Trabajo Mensual por Persona

**Fecha**: 2026-04-24
**Depende de**: Plan 01 (migración 06: `v_produccion_mensual_persona`), Plan 07 (asignaciones)
**Estima**: 0.5 día

---

## Objetivo

Agregar una pestaña "Trabajo del mes" en el detalle de cada trabajador (`Trabajadores.jsx`) que muestra los lotes en los que participó, agrupados por mes/área/modelo, con total de pares. Botón para adjuntar este detalle al pago del trabajador. Mockup §5.4 del spec.

## Archivos

### Crear
- `sistema-calzado/src/components/TabTrabajoMensual.jsx` — pestaña de trabajo del mes

### Modificar
- `sistema-calzado/src/views/finanzas/views/Trabajadores.jsx` — agregar tab en el SideSheet de detalle

---

## 1. TabTrabajoMensual

```jsx
// src/components/TabTrabajoMensual.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

export default function TabTrabajoMensual({ idPersona, nombrePersona }) {
  const [datos, setDatos] = useState([]);
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });

  useEffect(() => {
    supabase
      .from('v_produccion_mensual_persona')
      .select('*')
      .eq('id_persona', idPersona)
      .eq('mes', mes)
      .order('area_nombre')
      .order('producto_nombre')
      .then(({ data }) => setDatos(data || []));
  }, [idPersona, mes]);

  const totalPares = datos.reduce((sum, d) => sum + (d.pares_total || 0), 0);
  const totalLotes = datos.reduce((sum, d) => sum + (d.num_lotes || 0), 0);

  function generarDetallePago() {
    const lineas = datos.map(d =>
      `${d.producto_nombre} (${d.area_nombre}/${d.cargo_nombre}): ${d.pares_total} pares, ${d.num_lotes} lotes`
    );
    return `Trabajo del mes ${mes} — ${nombrePersona}\n${lineas.join('\n')}\nTotal: ${totalPares} pares en ${totalLotes} lotes`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Trabajo del mes</h3>
        <input type="month" value={mes.slice(0, 7)}
          onChange={e => setMes(e.target.value + '-01')}
          className="border rounded px-2 py-1 text-sm" />
      </div>

      {datos.length === 0 ? (
        <p className="text-sm text-stone-400">Sin registros para este mes.</p>
      ) : (
        <>
          <div className="space-y-2">
            {datos.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b pb-1">
                <div>
                  <span className="font-medium">{d.producto_nombre}</span>
                  <span className="text-stone-400 ml-2">{d.area_nombre} · {d.cargo_nombre}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono">{d.pares_total} pares</span>
                  <span className="text-stone-400 ml-2">{d.num_lotes} lotes</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between font-semibold text-sm pt-2 border-t">
            <span>Total del mes</span>
            <span>{totalPares} pares en {totalLotes} lotes</span>
          </div>

          <button
            onClick={() => navigator.clipboard.writeText(generarDetallePago())}
            className="w-full py-2 text-sm bg-stone-100 rounded-lg hover:bg-stone-200">
            📋 Copiar detalle para adjuntar al pago
          </button>
        </>
      )}
    </div>
  );
}
```

## 2. Integrar en Trabajadores.jsx

En el `SideSheet` de detalle del trabajador, agregar tab:

```jsx
import TabTrabajoMensual from '../../../components/TabTrabajoMensual';

// En el InlineTabs del SideSheet:
const TABS_DETALLE = [
  { key: 'info', label: 'Información' },
  { key: 'permisos', label: 'Permisos' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'trabajo', label: 'Trabajo del mes' }, // NUEVO
];

// En el render del tab:
{tabDetalle === 'trabajo' && (
  <TabTrabajoMensual
    idPersona={trabajadorSeleccionado.id_persona}
    nombrePersona={trabajadorSeleccionado.nombre}
  />
)}
```

---

## Criterios de aceptación

- [ ] Abrir detalle de Rosa → tab "Trabajo del mes" muestra lotes del mes actual.
- [ ] Cambiar mes → datos se actualizan.
- [ ] "Copiar detalle para adjuntar al pago" → clipboard tiene texto formateado.
- [ ] Si Rosa no participó en ningún lote → "Sin registros para este mes".
- [ ] Los datos vienen de `v_produccion_mensual_persona` (no queries directos a `lote_asignaciones`).
