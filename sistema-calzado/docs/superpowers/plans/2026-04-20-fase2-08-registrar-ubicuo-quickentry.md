# Plan 08 — Botón "+ Registrar" ubicuo y QuickEntry universal

**Fecha**: 2026-04-20
**Fase**: 2 (rediseño enterprise)
**Depende de**: Plan 02 (HeaderGlobal), Plan 03 (wizard de tipos), Fase 1 (QuickEntry base ya existe)
**Estima**: 1 día

## Objetivo

Un **único botón flotante** `+ Registrar` presente en el header global de los 3 workspaces. Al clickearlo abre el `QuickEntry` universal, que detecta automáticamente el contexto (ubicación, rol del usuario, tipos aplicables) y muestra solo los tipos relevantes. Patrón inspirado en Linear/Notion (`cmd+k` global).

Elimina la idea de "crear botón en la ubicación" — el contexto se infiere.

## Contexto

- Fase 1 ya construyó un `QuickEntry.jsx` funcional que recibe `{ idUbicacion, tiposAplicables }` y registra un movimiento con splits.
- Fase 1 también tiene la lógica de mapeo automático `fn_sugerir_cuenta_para_tipo`.
- Lo que falta: hacer el botón **global** y que `QuickEntry` calcule sus props por sí mismo según el contexto.

## Archivos a crear / tocar

### Crear

1. `sistema-calzado/src/views/gestion/components/HeaderRegistrarButton.jsx` — botón + modal opener
2. `sistema-calzado/src/views/gestion/components/QuickEntryUniversal.jsx` — wrapper que detecta contexto
3. `sistema-calzado/src/views/gestion/hooks/useContextoRegistro.js` — hook que infiere ubicación/rol/tipos

### Modificar

- `sistema-calzado/src/views/gestion/components/HeaderGlobal.jsx` — reemplazar placeholder `<button>+Registrar</button>` por `<HeaderRegistrarButton />`
- El layout del workspace `Ubicaciones` y `Comando` (cuando existan) también debe importar `HeaderGlobal` → automáticamente tendrán el botón

## Detección de contexto

El hook `useContextoRegistro` lee:

1. **URL actual** — si la ruta es `/gestion/ubicaciones/:id` o `/ubicaciones/:id`, extrae `idUbicacion`. Si no, `idUbicacion = null` (registro global → el usuario elige ubicación en el form).
2. **Usuario logueado** — de `sessionStorage`/`localStorage` (`berna_gestion_session`). Extrae `id_persona` + rol.
3. **Rol de la ubicación** — si hay `idUbicacion`, consulta `ubicaciones.rol` (Tienda/Taller/Administración).
4. **Tipos aplicables** — consulta vista `v_tipos_aplicables_a_contexto(id_ubicacion, rol_ubicacion)`:
   - Tipos con `ambito = 'todos'`
   - Tipos con `ambito = 'por_rol'` y `rol_ubicacion` coincide
   - Tipos con `ambito = 'por_ubicacion'` y `id_ubicacion` está en `ubicaciones_permitidas[]`

### Hook

```jsx
// sistema-calzado/src/views/gestion/hooks/useContextoRegistro.js
import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { supabase } from '../../../api/supabase';

export function useContextoRegistro() {
  const { id: idUbicacionFromUrl } = useParams();
  const location = useLocation();
  const esRutaUbicacion = location.pathname.includes('/ubicaciones/');
  const idUbicacion = esRutaUbicacion ? idUbicacionFromUrl : null;

  const [ctx, setCtx] = useState({ cargando: true, ubicacion: null, usuario: null, tiposAplicables: [] });

  useEffect(() => {
    let activo = true;
    (async () => {
      const usuarioRaw = localStorage.getItem('berna_gestion_session');
      const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;

      let ubicacion = null;
      if (idUbicacion) {
        const { data } = await supabase
          .from('ubicaciones')
          .select('id, nombre, rol')
          .eq('id', idUbicacion)
          .single();
        ubicacion = data;
      }

      const { data: tipos } = await supabase.rpc('fn_tipos_aplicables_contexto', {
        p_id_ubicacion: idUbicacion,
        p_rol_ubicacion: ubicacion?.rol ?? null,
      });

      if (activo) {
        setCtx({
          cargando: false,
          ubicacion,
          usuario,
          tiposAplicables: tipos || [],
        });
      }
    })();
    return () => { activo = false; };
  }, [idUbicacion]);

  return ctx;
}
```

### RPC necesaria (añadir a Plan 01 si no existe)

```sql
CREATE OR REPLACE FUNCTION fn_tipos_aplicables_contexto(
  p_id_ubicacion uuid,
  p_rol_ubicacion text
) RETURNS TABLE (
  id uuid,
  codigo text,
  nombre text,
  emoji text,
  categoria_macro text,
  ambito text
) AS $$
  SELECT t.id, t.codigo, t.nombre, t.emoji, t.categoria_macro, t.ambito
  FROM tipos_movimiento_caja t
  WHERE t.activo = true
    AND (
      t.ambito = 'todos'
      OR (t.ambito = 'por_rol' AND p_rol_ubicacion IS NOT NULL AND p_rol_ubicacion = ANY(t.roles_aplicables))
      OR (t.ambito = 'por_ubicacion' AND p_id_ubicacion IS NOT NULL AND p_id_ubicacion = ANY(t.ubicaciones_permitidas))
    )
  ORDER BY t.orden NULLS LAST, t.nombre;
$$ LANGUAGE sql STABLE;
```

## HeaderRegistrarButton.jsx

```jsx
import { useState } from 'react';
import QuickEntryUniversal from './QuickEntryUniversal';

export default function HeaderRegistrarButton() {
  const [abierto, setAbierto] = useState(false);

  // Atajo de teclado: Cmd/Ctrl + K
  useKeyboard('mod+k', () => setAbierto(true));

  return (
    <>
      <button
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        onClick={() => setAbierto(true)}
      >
        <span>+</span>
        <span>Registrar</span>
        <kbd className="hidden lg:inline text-xs bg-indigo-700 px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>

      {abierto && <QuickEntryUniversal onClose={() => setAbierto(false)} />}
    </>
  );
}

function useKeyboard(combo, callback) {
  // Implementación simple
  useEffect(() => {
    const handler = (e) => {
      const mod = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        callback();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callback]);
}
```

## QuickEntryUniversal.jsx

```jsx
import { useContextoRegistro } from '../hooks/useContextoRegistro';
import QuickEntry from '../../finanzas/components/QuickEntry'; // el existente de Fase 1

export default function QuickEntryUniversal({ onClose }) {
  const ctx = useContextoRegistro();

  if (ctx.cargando) {
    return <ModalShell onClose={onClose}><div className="p-6">Cargando contexto…</div></ModalShell>;
  }

  return (
    <ModalShell onClose={onClose} title="Registrar movimiento">
      <ContextoBreadcrumb ubicacion={ctx.ubicacion} usuario={ctx.usuario} />
      <QuickEntry
        idUbicacion={ctx.ubicacion?.id ?? null}
        tiposAplicables={ctx.tiposAplicables}
        modoUniversal
        onExito={onClose}
      />
    </ModalShell>
  );
}

function ContextoBreadcrumb({ ubicacion, usuario }) {
  return (
    <div className="text-xs text-stone-500 px-4 py-2 bg-stone-50 border-b">
      {ubicacion ? (
        <>Registrando en <strong className="text-stone-800">{ubicacion.nombre}</strong> ({ubicacion.rol})</>
      ) : (
        <>Registro global · elegir ubicación en el formulario</>
      )}
      {usuario && <> · como <strong>{usuario.nombre}</strong></>}
    </div>
  );
}

function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-20 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        {title && <div className="px-4 py-3 border-b flex justify-between items-center"><h2 className="font-semibold">{title}</h2><button onClick={onClose}>✕</button></div>}
        {children}
      </div>
    </div>
  );
}
```

## Ajustes al QuickEntry existente

El `QuickEntry.jsx` de Fase 1 debe aceptar un nuevo prop `modoUniversal` que cambia el comportamiento si `idUbicacion` es null:

```jsx
{modoUniversal && !idUbicacion && (
  <SelectUbicacion
    label="¿En qué ubicación?"
    value={ubicacionElegida}
    onChange={setUbicacionElegida}
  />
)}
```

Y antes de llamar a `fn_sugerir_cuenta_para_tipo`, usa `ubicacionElegida` (fallback al prop `idUbicacion`).

## Visual

```
┌─────────────────────────────────────────────────────┐
│  ⊕ Registrar movimiento                        [✕]  │
├─────────────────────────────────────────────────────┤
│  Registrando en Tienda Centro (Tienda)              │
│  como Ana Pérez                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ¿Qué tipo de movimiento?                          │
│                                                     │
│   [💰 Venta contado]  [💳 Pago Luz]  [👕 Uniforme] │
│   [🧾 Venta crédito]  [🚚 Combustible]              │
│                                                     │
│   [+ Crear tipo nuevo]  ← solo visible para admin  │
│                                                     │
│   ─── Luego de elegir tipo, se expande el form ──  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Acceptance criteria

- [ ] Botón `+ Registrar` aparece en header de los 3 workspaces (Gestión, Ubicaciones, Comando)
- [ ] Cmd/Ctrl + K abre el QuickEntry universal
- [ ] Si el usuario está en `/gestion/ubicaciones/:id`, el form pre-selecciona esa ubicación
- [ ] Si está en `/gestion/` (root), el form pide elegir ubicación
- [ ] La lista de tipos filtrada respeta `ambito`, `roles_aplicables`, `ubicaciones_permitidas`
- [ ] Admin ve botón "+ Crear tipo nuevo" (abre wizard de Plan 03 en modo sidebar)
- [ ] No-admin solo ve los tipos aplicables, sin opción de crear
- [ ] Tras registrar exitosamente, el modal se cierra y se refresca la pantalla actual
- [ ] Validación: si faltan permisos, el botón muestra tooltip "Necesitas permiso 'registrar' en movimientos"

## Cómo probar

1. `npm run dev`
2. Login con PIN admin
3. Desde `/gestion/` → click `+ Registrar` → debe pedir ubicación
4. Cmd+K → mismo resultado
5. Navegar a `/gestion/ubicaciones/<uuid-tienda>` → click `+ Registrar` → debe mostrar "Tienda X" pre-seleccionada y filtrar tipos con `ambito=por_rol && roles_aplicables=['Tienda']`
6. Crear un tipo nuevo con `ambito=por_ubicacion` y `ubicaciones_permitidas=[Taller]` → desde Tienda NO debe aparecer
7. Registrar movimiento → verificar que split contable usa la cuenta sugerida
8. Logout y login con PIN no-admin sin permiso "registrar" → botón debe mostrar tooltip disabled
