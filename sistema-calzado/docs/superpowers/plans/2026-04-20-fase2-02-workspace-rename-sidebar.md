# Plan Fase 2.02 — Workspace Rename + Sidebar Nuevo

**Fecha**: 2026-04-20
**Depende de**: Plan 01 (migraciones DB)
**Bloquea**: planes 06, 08 (que usan sidebar y header global)

---

## Context

Renombrar `/finanzas/*` → `/gestion/*` y reemplazar el sidebar actual por el nuevo definido en §4 del spec maestro. Agregar header global con switcher de workspace + botón "+ Registrar" (placeholder — plan 08 implementa su lógica).

**DECIDIDO**:
- 3 workspaces: Gestión Empresarial, Ubicaciones, Comando
- Sidebar de Gestión Empresarial exactamente como §4 del spec
- Compatibilidad: `/finanzas/*` redirige a `/gestion/*` durante 1 release

---

## Archivos a crear

```
sistema-calzado/src/views/gestion/                        (rename de finanzas/)
├── GestionLayout.jsx                                      (rename de FinanzasLayout.jsx, actualizar)
├── GestionGate.jsx                                        (rename de FinanzasGate.jsx)
├── components/
│   ├── WorkspaceSwitcher.jsx                              (nuevo)
│   ├── HeaderGlobal.jsx                                   (nuevo, incluye "+ Registrar" placeholder)
│   └── SidebarGestion.jsx                                 (nuevo, reemplaza sidebar inline de FinanzasLayout)
└── [resto de subcarpetas: api/, lib/, views/]             (mantener nombres internos)
```

## Archivos a modificar

- `sistema-calzado/src/App.jsx` — nueva ruta `/gestion/*`, redirect `/finanzas/*` → `/gestion/*`
- `sistema-calzado/src/views/finanzas/` — **renombrar a** `src/views/gestion/`
- `sistema-calzado/src/lib/pinAuth.js` — nueva key `berna_gestion_session` (mantener legacy como fallback 1 release)
- `CLAUDE.md` — actualizar rutas documentadas

---

## Implementación paso a paso

### 1. Rename directorio

```bash
cd sistema-calzado/src/views
git mv finanzas gestion
```

### 2. Rename archivos clave

```bash
cd sistema-calzado/src/views/gestion
git mv FinanzasLayout.jsx GestionLayout.jsx
git mv FinanzasGate.jsx GestionGate.jsx
```

### 3. Actualizar imports en App.jsx

Antes:
```jsx
import FinanzasGate from './views/finanzas/FinanzasGate'
import FinanzasLayout from './views/finanzas/FinanzasLayout'
```

Después:
```jsx
import GestionGate from './views/gestion/GestionGate'
import GestionLayout from './views/gestion/GestionLayout'

// Ruta nueva
<Route path="/gestion/*" element={<GestionGate><GestionLayout /></GestionGate>} />

// Redirect de compatibilidad
<Route path="/finanzas/*" element={<Navigate to="/gestion" replace />} />
```

### 4. Crear `SidebarGestion.jsx`

**Archivo**: `sistema-calzado/src/views/gestion/components/SidebarGestion.jsx`

```jsx
import { NavLink } from 'react-router-dom'
import { tienePermiso } from '../lib/permisos'

const NAV_GROUPS = [
  {
    title: null,
    items: [
      { to: '/gestion/resumen', label: '📊 Resumen Ejecutivo', recurso: 'finanzas', nivel: 'ver' },
    ],
  },
  {
    title: '💰 Finanzas',
    items: [
      { to: '/gestion/estado-resultados', label: 'Estado de Resultados', recurso: 'finanzas', nivel: 'ver' },
      { to: '/gestion/flujo-caja', label: 'Flujo de Caja', recurso: 'finanzas', nivel: 'ver' },
      { to: '/gestion/patrimonio', label: 'Patrimonio', recurso: 'finanzas', nivel: 'ver' },
      { to: '/gestion/cuentas', label: 'Cuentas', recurso: 'cuentas', nivel: 'ver' },
      { to: '/gestion/deudas', label: 'Deudas', recurso: 'deudas', nivel: 'ver' },
      { to: '/gestion/movimientos', label: 'Movimientos', recurso: 'movimientos', nivel: 'ver' },
      { to: '/gestion/transferencias', label: 'Transferencias', recurso: 'transferencias', nivel: 'ver' },
      { to: '/gestion/obligaciones', label: 'Obligaciones recurrentes', recurso: 'obligaciones', nivel: 'ver' },
    ],
  },
  {
    title: '👥 Personal',
    items: [
      { to: '/gestion/trabajadores', label: 'Trabajadores', recurso: 'finanzas', nivel: 'ver' },
      { to: '/gestion/nomina', label: 'Nómina', recurso: 'finanzas', nivel: 'ver' },
      { to: '/gestion/organigrama', label: 'Organigrama', recurso: 'finanzas', nivel: 'ver' },
    ],
  },
  {
    title: '🏗️ Activos & Contratos',
    items: [
      { to: '/gestion/activos', label: 'Activos fijos', recurso: 'activos', nivel: 'ver' },
      { to: '/gestion/contratos', label: 'Contratos', recurso: 'activos', nivel: 'ver' },
      { to: '/gestion/depreciacion', label: 'Depreciación', recurso: 'activos', nivel: 'ver' },
    ],
  },
  {
    title: '📍 Ubicaciones',
    items: [
      { to: '/ubicaciones', label: '→ Ir al workspace', external: true },
    ],
  },
  {
    title: null,
    items: [
      { to: '/gestion/cierres', label: '📆 Cierres contables', recurso: 'cierres', nivel: 'ver' },
    ],
  },
  {
    title: '⚙️ Configuración',
    items: [
      { to: '/gestion/config/empresa', label: 'Empresa', recurso: 'configuracion', nivel: 'admin' },
      { to: '/gestion/config/plan-cuentas', label: 'Plan de Cuentas', recurso: 'configuracion', nivel: 'admin' },
      { to: '/gestion/config/tipos-movimiento', label: 'Tipos de Movimiento', recurso: 'configuracion', nivel: 'admin' },
      { to: '/gestion/config/mapeos', label: 'Mapeos contables', recurso: 'configuracion', nivel: 'admin' },
      { to: '/gestion/config/catalogos', label: 'Catálogos del sistema', recurso: 'configuracion', nivel: 'admin' },
      { to: '/gestion/config/permisos', label: 'Permisos y Roles', recurso: 'configuracion', nivel: 'admin' },
    ],
  },
]

export default function SidebarGestion({ usuario }) {
  return (
    <nav className="sidebar-gestion">
      {NAV_GROUPS.map((group, idx) => {
        const visibleItems = group.items.filter(it =>
          !it.recurso || tienePermiso(usuario, it.recurso, it.nivel || 'ver')
        )
        if (visibleItems.length === 0) return null
        return (
          <div key={idx} className="nav-group">
            {group.title && <div className="nav-group-title">{group.title}</div>}
            {visibleItems.map(it => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                {it.label}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}
```

### 5. Crear `HeaderGlobal.jsx`

**Archivo**: `sistema-calzado/src/views/gestion/components/HeaderGlobal.jsx`

```jsx
import WorkspaceSwitcher from './WorkspaceSwitcher'

export default function HeaderGlobal({ usuario, onOpenRegistrar }) {
  return (
    <header className="header-global">
      <div className="header-left">
        <WorkspaceSwitcher usuario={usuario} currentWorkspace="gestion" />
        <h1 className="workspace-title">🏢 Gestión Empresarial</h1>
      </div>
      <div className="header-right">
        <button className="btn-registrar-ubicuo" onClick={onOpenRegistrar}>
          + Registrar
        </button>
        <div className="usuario-chip">
          👤 {usuario?.nombre || 'Usuario'}
        </div>
      </div>
    </header>
  )
}
```

### 6. Crear `WorkspaceSwitcher.jsx`

**Archivo**: `sistema-calzado/src/views/gestion/components/WorkspaceSwitcher.jsx`

```jsx
import { useNavigate } from 'react-router-dom'
import { tienePermiso } from '../lib/permisos'

const WORKSPACES = [
  { code: 'gestion', label: '🏢 Gestión Empresarial', path: '/gestion', recurso: 'finanzas' },
  { code: 'ubicaciones', label: '📍 Ubicaciones', path: '/ubicaciones', recurso: 'finanzas' },
  { code: 'comando', label: '⚡ Comando', path: '/rapido', recurso: 'rapido' },
]

export default function WorkspaceSwitcher({ usuario, currentWorkspace }) {
  const navigate = useNavigate()
  const opciones = WORKSPACES.filter(w => tienePermiso(usuario, w.recurso, 'ver'))

  return (
    <select
      className="workspace-switcher"
      value={currentWorkspace}
      onChange={(e) => {
        const target = WORKSPACES.find(w => w.code === e.target.value)
        if (target) navigate(target.path)
      }}
    >
      {opciones.map(w => (
        <option key={w.code} value={w.code}>{w.label}</option>
      ))}
    </select>
  )
}
```

### 7. Modificar `GestionLayout.jsx`

**Archivo**: `sistema-calzado/src/views/gestion/GestionLayout.jsx`

Estructura:
```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import HeaderGlobal from './components/HeaderGlobal'
import SidebarGestion from './components/SidebarGestion'
// ... imports de vistas

export default function GestionLayout() {
  const [registrarOpen, setRegistrarOpen] = useState(false)
  const usuario = JSON.parse(localStorage.getItem('berna_gestion_session') || '{}')

  return (
    <div className="gestion-layout">
      <HeaderGlobal usuario={usuario} onOpenRegistrar={() => setRegistrarOpen(true)} />
      <div className="gestion-body">
        <SidebarGestion usuario={usuario} />
        <main className="gestion-main">
          <Routes>
            <Route index element={<Navigate to="resumen" replace />} />
            <Route path="resumen" element={<ResumenEjecutivo />} />
            <Route path="estado-resultados" element={<EstadoResultados />} />
            {/* ... resto de rutas */}
            <Route path="obligaciones" element={<Obligaciones />} />
            <Route path="activos" element={<Activos />} />
            <Route path="contratos" element={<Contratos />} />
            <Route path="config/catalogos" element={<CatalogosDelSistema />} />
            <Route path="config/tipos-movimiento" element={<TiposMovimiento />} />
            {/* redirect legacy */}
            <Route path="*" element={<Navigate to="resumen" replace />} />
          </Routes>
        </main>
      </div>
      {/* Modal global de registrar movimiento — plan 08 lo implementa */}
      {registrarOpen && <RegistrarMovimientoModal onClose={() => setRegistrarOpen(false)} />}
    </div>
  )
}
```

### 8. Estilos CSS

**Archivo**: `sistema-calzado/src/views/gestion/styles.css` (o agregar a `index.css`)

```css
.gestion-layout { display: flex; flex-direction: column; height: 100vh; }
.header-global {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; background: #1c1917; color: #fafaf9;
  border-bottom: 1px solid #44403c;
}
.gestion-body { display: flex; flex: 1; overflow: hidden; }
.sidebar-gestion {
  width: 240px; background: #0c0a09; color: #d6d3d1;
  padding: 16px 8px; overflow-y: auto;
}
.nav-group { margin-bottom: 16px; }
.nav-group-title { font-size: 11px; text-transform: uppercase; color: #78716c; padding: 8px 12px; }
.nav-item {
  display: block; padding: 8px 12px; color: inherit; text-decoration: none;
  border-radius: 4px; font-size: 14px;
}
.nav-item:hover { background: #1c1917; }
.nav-item.active { background: #292524; color: #fafaf9; font-weight: 600; }
.gestion-main { flex: 1; overflow-y: auto; padding: 24px; background: #fafaf9; }
.btn-registrar-ubicuo {
  background: #059669; color: white; border: none;
  padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;
}
.btn-registrar-ubicuo:hover { background: #047857; }
```

### 9. Actualizar PIN session key

**Archivo**: `sistema-calzado/src/lib/pinAuth.js`

```js
const NEW_SESSION_KEY = 'berna_gestion_session'
const LEGACY_SESSION_KEY = 'berna_finanzas_session'

export function getSession() {
  const raw = localStorage.getItem(NEW_SESSION_KEY)
                || localStorage.getItem(LEGACY_SESSION_KEY) // fallback
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setSession(session) {
  localStorage.setItem(NEW_SESSION_KEY, JSON.stringify(session))
  // migrar legacy si existe
  localStorage.removeItem(LEGACY_SESSION_KEY)
}
```

### 10. Actualizar `CLAUDE.md`

Cambiar todas las referencias `/finanzas/*` → `/gestion/*` en la documentación.

---

## Search-and-replace masivo

Hacer estos reemplazos en TODO `sistema-calzado/src/` (incluyendo tests):
- `/finanzas/` → `/gestion/` (solo en strings de rutas, URLs)
- `FinanzasLayout` → `GestionLayout`
- `FinanzasGate` → `GestionGate`

**NO reemplazar**: nombres internos como `useFinanzas`, `FinanzasContext`, `finanzasClient.js` (son implementación, no rutas de usuario).

---

## Criterio de aceptación

- [ ] `npm run dev` arranca sin errores
- [ ] Ir a `http://localhost:5173/finanzas` redirige a `/gestion`
- [ ] `/gestion` carga el sidebar nuevo con 6 secciones (según permisos del usuario)
- [ ] Header global tiene switcher + botón "+ Registrar" (abre modal placeholder — plan 08)
- [ ] `npm run build` pasa
- [ ] `npm run lint` pasa
- [ ] Commit: `feat(fase2-02): rename /finanzas a /gestion + sidebar nuevo + header global`
