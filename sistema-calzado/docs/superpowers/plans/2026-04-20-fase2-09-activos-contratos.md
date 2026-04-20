# Plan 09 — Módulo Activos Fijos & Contratos

**Fecha**: 2026-04-20
**Fase**: 2 (rediseño enterprise)
**Depende de**: Plan 01 (migración 05: `activos_fijos`, `contratos`, `depreciacion_mensual`), Plan 02 (sidebar con sección Activos & Contratos)
**Estima**: 1.5 días

## Objetivo

Crear el módulo UI para administrar **activos fijos** (máquinas, mobiliario, vehículos, herramientas >S/1,500) y **contratos** (alquileres, servicios recurrentes a terceros, comodatos). Ambos generan asientos contables automáticos (depreciación mensual para activos, cargo mensual para contratos).

## Contexto / por qué existen estos 2 juntos

Son las 2 categorías de **compromisos financieros de largo plazo** que no son deudas bancarias:
- **Activo fijo** = lo que el negocio **posee**, pierde valor en el tiempo (depreciación).
- **Contrato** = lo que el negocio **paga por usar** de otro (alquiler, hosting, seguros), compromiso recurrente.

Ambos comparten UI de "lista + detalle + historial mensual de asientos generados".

## Archivos a crear

### Estructura

```
sistema-calzado/src/views/gestion/views/activos/
  ActivosContratosLayout.jsx         ← tabs (Activos / Contratos / Depreciación)
  TabActivos.jsx
  TabContratos.jsx
  TabDepreciacion.jsx
  FormActivo.jsx
  FormContrato.jsx
  DetalleActivo.jsx
  DetalleContrato.jsx
sistema-calzado/src/views/gestion/api/activosClient.js
```

### Layout con 3 tabs

```jsx
// ActivosContratosLayout.jsx
import { NavLink, Outlet } from 'react-router-dom';

export default function ActivosContratosLayout() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Activos & Contratos</h1>
        <p className="text-sm text-stone-500">Lo que el negocio posee y lo que paga por usar de terceros.</p>
      </header>

      <nav className="border-b mb-6 flex gap-6">
        <TabLink to="" end>Activos fijos</TabLink>
        <TabLink to="contratos">Contratos</TabLink>
        <TabLink to="depreciacion">Asientos mensuales</TabLink>
      </nav>

      <Outlet />
    </div>
  );
}

function TabLink({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `pb-2 text-sm font-medium ${isActive ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-stone-500 hover:text-stone-800'}`
      }
    >
      {children}
    </NavLink>
  );
}
```

### Rutas (añadir a GestionLayout.jsx)

```jsx
import ActivosContratosLayout from './views/activos/ActivosContratosLayout';
import TabActivos from './views/activos/TabActivos';
import TabContratos from './views/activos/TabContratos';
import TabDepreciacion from './views/activos/TabDepreciacion';

<Route path="activos" element={<ActivosContratosLayout />}>
  <Route index element={<TabActivos />} />
  <Route path="contratos" element={<TabContratos />} />
  <Route path="depreciacion" element={<TabDepreciacion />} />
</Route>
```

## Tab Activos

Lista de activos con columnas:

```
Nombre                   Categoría       Compra      Valor libro   Ubicación        Estado
Máquina cortadora A-250  Maquinaria      15/01/2025  S/ 4,200      Taller Principal Activo
Vitrina exhibidora       Mobiliario      03/10/2024  S/ 800        Tienda Centro    Activo
Camioneta Hilux 2023     Vehículo        12/06/2023  S/ 48,000     —                Activo
Laptop admin             Equipo cómputo  01/02/2026  S/ 3,200      Administración   Activo
```

### TabActivos.jsx

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchActivos } from '../../api/activosClient';
import FormActivo from './FormActivo';

export default function TabActivos() {
  const [items, setItems] = useState([]);
  const [abrirForm, setAbrirForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const nav = useNavigate();

  useEffect(() => { recargar(); }, []);
  async function recargar() {
    const data = await fetchActivos();
    setItems(data);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => { setEditando(null); setAbrirForm(true); }}>
          + Nuevo activo
        </button>
      </div>
      <table className="w-full border rounded">
        <thead className="bg-stone-50 text-sm">
          <tr>
            <th className="p-2 text-left">Nombre</th>
            <th className="p-2 text-left">Categoría</th>
            <th className="p-2 text-left">Compra</th>
            <th className="p-2 text-right">Valor libro</th>
            <th className="p-2 text-left">Ubicación</th>
            <th className="p-2 text-left">Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map(a => (
            <tr key={a.id} className="border-t text-sm hover:bg-stone-50 cursor-pointer" onClick={() => nav(`/gestion/activos/${a.id}`)}>
              <td className="p-2">{a.nombre}</td>
              <td className="p-2">{a.categoria}</td>
              <td className="p-2">{a.fecha_compra}</td>
              <td className="p-2 text-right">S/ {Number(a.valor_libro).toFixed(2)}</td>
              <td className="p-2">{a.ubicacion?.nombre || '—'}</td>
              <td className="p-2">{a.estado}</td>
              <td><button onClick={e => { e.stopPropagation(); setEditando(a); setAbrirForm(true); }}>✎</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {abrirForm && <FormActivo item={editando} onClose={() => { setAbrirForm(false); recargar(); }} />}
    </div>
  );
}
```

### FormActivo.jsx

Campos (ver migration 05 de Plan 01 para schema exacto):

- Nombre
- Categoría (select: maquinaria, mobiliario, vehículo, equipo_computo, herramientas, otro)
- Descripción (opcional)
- Fecha de compra
- Costo adquisición
- Vida útil en meses (ej: 60 para 5 años)
- Valor residual (opcional, default 0)
- Ubicación (FK opcional)
- Cuenta contable del activo (FK `plan_cuentas` — autosugerida por categoría)
- Cuenta contable de depreciación (FK — autosugerida)
- Método de depreciación (select: linea_recta, default)
- Estado (activo / vendido / baja)
- Proveedor (text o FK futuro)
- Serie/código interno
- Adjuntos: URL de factura en Supabase Storage (bucket `activos-docs`)

Al guardar, el trigger de DB genera automáticamente las filas en `depreciacion_mensual` para los próximos `vida_util_meses`.

## Tab Contratos

Lista de contratos vigentes:

```
Tipo          Concepto                    Monto mensual   Inicio      Fin         Estado
Alquiler      Local Tienda Centro         S/ 1,800        01/06/2024  31/05/2027  Vigente
Hosting       Supabase Pro                USD 25          15/03/2026  —           Vigente (indefinido)
Seguro        Flota vehículos Pacifico    S/ 320          01/01/2026  31/12/2026  Vigente
Comodato      Máquina prestada Proveedor  —               01/02/2025  31/01/2028  Vigente
```

### FormContrato.jsx

Campos:

- Tipo (select: alquiler, servicio, seguro, comodato, otro)
- Concepto (texto libre corto)
- Contraparte (texto — nombre del arrendador/proveedor)
- Monto mensual (numérico, 0 si es comodato)
- Moneda
- Fecha inicio
- Fecha fin (opcional, null = indefinido)
- Ubicación (FK opcional — "qué ubicación usa este contrato")
- Cuenta contable del gasto (FK — autosugerida por tipo)
- Frecuencia de pago (select: mensual, trimestral, anual)
- Día del mes de vencimiento (1-28)
- Estado (vigente, vencido, renovado, cancelado)
- Adjuntos: URL del contrato firmado

Al guardar un contrato con `monto_mensual > 0`, se crea automáticamente una **obligación recurrente** (tabla del Plan 01, migración 04) con la frecuencia y monto indicados. Se liga con `id_contrato` FK para trazabilidad.

## Tab Depreciación (solo lectura)

Muestra el histórico de asientos mensuales generados por el job `fn_generar_depreciacion_mensual`:

```
Mes        Activos procesados   Gasto depreciación   Asientos generados
Abr 2026   12                   S/ 1,840             Ver →
Mar 2026   12                   S/ 1,840             Ver →
Feb 2026   11                   S/ 1,720             Ver →
```

Click en "Ver →" abre modal con el detalle línea por línea de ese mes.

### Botón "Generar ahora" (admin)

Para ejecutar manualmente `fn_generar_depreciacion_mensual(year, month)` si el cron no corrió.

## API client

```js
// sistema-calzado/src/views/gestion/api/activosClient.js
import { supabase } from '../../../api/supabase';

export async function fetchActivos() {
  const { data, error } = await supabase
    .from('v_activos_con_valor_neto')
    .select('*')
    .order('fecha_compra', { ascending: false });
  if (error) throw error;
  return data;
}

export async function crearActivo(payload) {
  const { data, error } = await supabase.from('activos_fijos').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarActivo(id, payload) {
  const { error } = await supabase.from('activos_fijos').update(payload).eq('id', id);
  if (error) throw error;
}

export async function fetchContratos() {
  const { data, error } = await supabase
    .from('contratos')
    .select(`*, ubicacion:ubicaciones(id, nombre)`)
    .order('fecha_inicio', { ascending: false });
  if (error) throw error;
  return data;
}

export async function crearContrato(payload) {
  const { data, error } = await supabase.from('contratos').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function fetchDepreciacionPorMes() {
  const { data, error } = await supabase
    .from('v_depreciacion_mensual_resumen')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data;
}

export async function ejecutarDepreciacion(year, month) {
  const { data, error } = await supabase.rpc('fn_generar_depreciacion_mensual', { p_year: year, p_month: month });
  if (error) throw error;
  return data;
}
```

## Views auxiliares (agregar a migración 05 del Plan 01 si no están)

```sql
CREATE OR REPLACE VIEW v_activos_con_valor_neto AS
SELECT
  a.*,
  (a.costo_adquisicion - COALESCE((
    SELECT SUM(d.monto) FROM depreciacion_mensual d WHERE d.id_activo = a.id
  ), 0)) AS valor_libro,
  u.nombre AS ubicacion_nombre
FROM activos_fijos a
LEFT JOIN ubicaciones u ON u.id = a.id_ubicacion;

CREATE OR REPLACE VIEW v_depreciacion_mensual_resumen AS
SELECT
  year,
  month,
  COUNT(*) AS activos_procesados,
  SUM(monto) AS total_depreciado
FROM depreciacion_mensual
GROUP BY year, month;
```

## Acceptance criteria

- [ ] Ruta `/gestion/activos` renderiza layout con 3 tabs funcionales
- [ ] Crear activo → guarda en `activos_fijos`, dispara trigger que crea rows en `depreciacion_mensual` para los `vida_util_meses` futuros
- [ ] Al editar, si el activo ya tuvo depreciaciones aplicadas, no se permite modificar `costo_adquisicion` ni `vida_util_meses` (advertencia UI)
- [ ] Crear contrato → guarda en `contratos`, si monto > 0 crea obligación recurrente ligada
- [ ] Tab Depreciación muestra histórico ordenado desc
- [ ] Admin ve botón "Generar ahora" que ejecuta RPC y refresca
- [ ] Subida de adjuntos (factura, contrato) funciona vía Supabase Storage
- [ ] Cuenta contable se autosugiere por categoría (ej: maquinaria → "1501 Maquinaria y equipo")
- [ ] Valor libro calculado correctamente = costo − depreciación acumulada

## Cómo probar

1. `npm run dev` con migraciones 01 y 05 aplicadas
2. Crear activo "Máquina cortadora" S/ 4,200, vida 60 meses, fecha hoy
3. Verificar en DB: `SELECT count(*) FROM depreciacion_mensual WHERE id_activo = <uuid>` → debe devolver 60
4. Lista muestra valor libro = 4,200 (todavía no se aplicó ninguna depreciación)
5. Ejecutar `fn_generar_depreciacion_mensual(2026, 4)` → valor libro = 4,130 (4,200 − 70/mes)
6. Crear contrato alquiler S/ 1,800 mensual → verificar que aparece en `obligaciones_recurrentes` con frecuencia mensual
7. Subir PDF de factura → recargar y verificar link funcional
