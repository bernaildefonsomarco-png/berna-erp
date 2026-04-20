# Plan 07 — Refactor Trabajadores: separar Rol, Cargo y Área

**Fecha**: 2026-04-20
**Fase**: 2 (rediseño enterprise)
**Depende de**: Plan 01 (migraciones 01 y 02 — catálogos `cargos`, `areas`, FKs en `personas_tienda`)
**Estima**: 0.5 día

## Objetivo

Alinear la UI de Trabajadores con la nueva dimensionalidad: **Rol** (permisos, vía `roles_persona`), **Cargo** (puesto laboral, vía `cargos`) y **Área** (zona funcional, vía `areas`). Actualmente la UI confunde "cargo" (texto libre) con "rol", y "área" viene de un CHECK constraint hardcoded.

## Contexto (por qué duelen las 3 dimensiones)

| Dimensión | Pregunta que responde | Ejemplos | Tabla |
|---|---|---|---|
| **Rol** | ¿Qué puede hacer en el sistema? | Admin, Cajero, Asistente, Rapido-only | `roles_persona` + `permisos_persona` |
| **Cargo** | ¿Cuál es su puesto laboral? | Vendedora, Cortador, Armador, Supervisor | `cargos` (nueva, creada en Plan 01) |
| **Área** | ¿Dónde/en qué función trabaja? | Taller, Tienda, Administración | `areas` (nueva, creada en Plan 01) |

Un trabajador puede: tener rol "Cajero" + cargo "Vendedora" + área "Tienda". Otro: rol "Admin" + cargo "Gerente" + área "Administración". Otro: sin rol de sistema + cargo "Armador" + área "Taller" (operario que nunca usa el ERP pero sí cobra sueldo).

## Archivos a tocar

### Modificar

1. `sistema-calzado/src/views/finanzas/views/Trabajadores.jsx` — (se moverá a `src/views/gestion/views/Trabajadores.jsx` si ya pasó Plan 02, si no existe aún la versión `gestion/`, tocar la de `finanzas/` — misma ruta conceptual)
2. `sistema-calzado/src/views/finanzas/components/TrabajadorForm.jsx` (o donde viva el form — inspeccionar con `grep`)
3. `sistema-calzado/src/views/finanzas/api/finanzasClient.js` — ajustar select para traer `cargos(*)` y `areas(*)` joined

### Consideraciones de migración

Plan 01 ya pobló `cargos` y `areas` desde los valores existentes y agregó FKs `id_cargo`, `id_area`. Este plan **solo refactoriza la UI**.

## Cambios en el form de trabajador

### Antes (confuso)

```jsx
<Input label="Cargo" value={form.cargo} onChange={...} />   // text libre
<Select label="Área" options={['taller','tienda','administracion']} />
{/* Rol no aparece acá, se configura en pantalla Equipo */}
```

### Después (claro)

```jsx
<Fieldset legend="Puesto laboral">
  <SelectFK
    label="Cargo"
    helpText="Qué puesto ocupa en el negocio (Vendedora, Cortador, etc.)"
    value={form.id_cargo}
    onChange={v => setForm({ ...form, id_cargo: v })}
    fetchOptions={() => fetchCargos()}
    allowCreate  // abre mini-modal para crear cargo al vuelo (invoca catálogo Cargos)
  />
  <SelectFK
    label="Área"
    helpText="Dónde trabaja principalmente (Taller, Tienda, Administración)"
    value={form.id_area}
    onChange={v => setForm({ ...form, id_area: v })}
    fetchOptions={() => fetchAreas()}
  />
</Fieldset>

<Fieldset legend="Acceso al sistema (opcional)">
  <HelpBanner>
    El rol define qué puede hacer esta persona en el ERP.
    Si es un operario que nunca usará el sistema, déjalo vacío.
  </HelpBanner>
  <SelectFK
    label="Rol"
    value={form.id_rol}
    onChange={v => setForm({ ...form, id_rol: v })}
    fetchOptions={() => fetchRoles()}
    permitirNull
  />
  <Input label="PIN" type="password" value={form.pin} onChange={...} disabled={!form.id_rol} />
</Fieldset>
```

### Componente SelectFK

Reutilizable (si no existe, crearlo en `sistema-calzado/src/views/gestion/components/SelectFK.jsx`):

```jsx
import { useEffect, useState } from 'react';

export default function SelectFK({ label, helpText, value, onChange, fetchOptions, allowCreate, permitirNull }) {
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const data = await fetchOptions();
      setOpciones(data || []);
      setCargando(false);
    })();
  }, []);

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-stone-700">{label}</label>
      {helpText && <p className="text-xs text-stone-500">{helpText}</p>}
      <select
        className="w-full border rounded px-3 py-2"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={cargando}
      >
        {permitirNull && <option value="">— Sin {label.toLowerCase()} —</option>}
        {!permitirNull && <option value="" disabled>Elegir…</option>}
        {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
      {allowCreate && (
        <button
          type="button"
          className="text-xs text-indigo-600 hover:underline"
          onClick={() => window.location.href = '/gestion/catalogos?cat=cargos'}
        >
          + Agregar nuevo cargo
        </button>
      )}
    </div>
  );
}
```

## API helpers — nuevo archivo `cargosAreasRolesClient.js`

```js
// sistema-calzado/src/views/gestion/api/cargosAreasRolesClient.js
import { supabase } from '../../../api/supabase';

export async function fetchCargos() {
  const { data, error } = await supabase
    .from('cargos')
    .select('id, nombre, id_area_default, salario_sugerido')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data;
}

export async function fetchAreas() {
  const { data, error } = await supabase
    .from('areas')
    .select('id, nombre')
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return data;
}

export async function fetchRoles() {
  const { data, error } = await supabase
    .from('roles_persona')
    .select('id, nombre, descripcion')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data;
}
```

## Ajuste en finanzasClient.js / gestionClient.js

Trabajadores list ahora hace join a los 3 catálogos:

```js
export async function fetchTrabajadores() {
  const { data, error } = await supabase
    .from('personas_tienda')
    .select(`
      id, nombre, pin_hash, salario_base, tipo_contrato, fecha_ingreso, activo,
      cargo:cargos!personas_tienda_id_cargo_fkey(id, nombre),
      area:areas!personas_tienda_id_area_fkey(id, nombre),
      rol:roles_persona!personas_tienda_id_rol_fkey(id, nombre)
    `)
    .order('nombre');
  if (error) throw error;
  return data;
}
```

## Tabla de listado

Agregar columnas **Rol** y **Área** (antes solo tenía Cargo como texto):

```
Nombre          Cargo         Área            Rol         Salario     Ubic. preferida
Ana Pérez       Vendedora     Tienda          Cajero      S/ 1,500    Tienda Centro
Luis Gómez      Cortador      Taller          —           S/ 1,800    Taller Principal
Marta Ríos      Gerente       Administración  Admin       S/ 3,000    —
```

## Tooltips / ayuda contextual

Al hover sobre los labels "Cargo", "Área", "Rol" mostrar tooltip:

- **Cargo**: "El puesto laboral del trabajador (Vendedora, Cortador, Armador…). Define qué hace en el negocio."
- **Área**: "La zona funcional donde trabaja (Taller, Tienda, Administración). Sirve para reportes."
- **Rol**: "El nivel de acceso al ERP (Admin, Cajero, Asistente…). Si no tiene PIN, déjalo vacío."

Usar `<abbr title="…">` o un componente `Tooltip` existente.

## Acceptance criteria

- [ ] Form de Trabajador muestra 3 selectores separados (Cargo, Área, Rol) con labels y helpText claros
- [ ] Cargo y Área son FK a sus tablas (drop-downs poblados desde DB)
- [ ] Rol es opcional — un operario sin acceso al ERP queda sin rol ni PIN
- [ ] Al seleccionar un cargo, si tiene `id_area_default`, autosugiere el área (usuario puede cambiar)
- [ ] Al seleccionar un cargo, si tiene `salario_sugerido`, autosugiere el salario base
- [ ] Listado muestra 3 columnas: Cargo, Área, Rol
- [ ] Cuando se edita un trabajador viejo (que tenía `cargo` text), se mapea automáticamente al id de `cargos` via la migration de Plan 01
- [ ] No hay código que pida `form.cargo` como string
- [ ] Tooltips funcionan en hover
- [ ] Sin errores de consola

## Cómo probar

1. `npm run dev`
2. Ir a `/gestion/trabajadores`
3. Click en "Nuevo trabajador" → debe mostrar 3 selectores separados
4. Elegir cargo "Vendedora" → área "Tienda" debe autosugerirse
5. Dejar Rol vacío → no debe pedir PIN → guardar OK
6. Editar trabajador existente → valores poblados correctamente
7. Listado muestra 3 columnas nuevas
