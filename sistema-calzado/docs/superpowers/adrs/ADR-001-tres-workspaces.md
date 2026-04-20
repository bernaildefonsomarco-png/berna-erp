# ADR-001 — Arquitectura de 3 workspaces separados

**Fecha**: 2026-04-20
**Estado**: Aceptado
**Contexto**: Rediseño Fase 2

## Contexto

El ERP actual tiene todo empaquetado bajo `/` (POS) y `/finanzas/*` (módulo financiero). Crecer sin estructura clara produce:

- Navegación ambigua: ¿dónde busco "activos fijos"? ¿en finanzas o en operaciones?
- Imposibilidad de dar acceso diferenciado por rol sin exponer rutas no relevantes
- UX que mezcla tareas diarias (registrar venta) con tareas de gestión (cerrar período)

## Decisión

Definir **3 workspaces separados** con rutas base propias y propósito claro:

1. **Gestión Empresarial** (`/gestion/*`) — administración financiera y de personas
2. **Ubicaciones** (`/ubicaciones/*`) — operación diaria por tienda/taller (hub con KPIs + tabs)
3. **Comando** (`/comando/*`) — dashboard ejecutivo multi-ubicación + alertas globales

Los 3 comparten:
- `HeaderGlobal` con WorkspaceSwitcher (dropdown para saltar entre los 3)
- Botón `+ Registrar` ubicuo con QuickEntry universal
- Atajo Cmd/Ctrl+K

## Alternativas consideradas

**Opción A — Workspace único con secciones** (rechazada): es lo que tenemos. No escala; la navegación se vuelve un laberinto a los 15+ módulos.

**Opción B — Apps separadas** (rechazada por ahora): una app por workspace. Demasiado overhead para 2 devs. Posible en Fase 7 con multi-org.

**Opción C — 3 workspaces en single-page** (elegida): mismo bundle, rutas distintas, layouts distintos. React Router maneja el split.

## Consecuencias

Positivas:
- UX clara por propósito
- Permisos por workspace son naturales
- Escalable a más workspaces futuros (Producción, Marketing, CRM…)

Negativas:
- Usuarios con acceso a múltiples workspaces deben aprender a cambiar entre ellos (mitigado con WorkspaceSwitcher)
- Duplicación menor de componentes layout (mitigado por shared `HeaderGlobal`)

## Referencias

- Plan 02: `2026-04-20-fase2-02-workspace-rename-sidebar.md`
- Spec maestro: `specs/2026-04-20-rediseno-gestion-empresarial-design.md`
