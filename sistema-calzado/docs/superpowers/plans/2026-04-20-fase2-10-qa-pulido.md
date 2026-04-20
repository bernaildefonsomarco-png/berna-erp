# Plan 10 — QA, pulido y release de Fase 2

**Fecha**: 2026-04-20
**Fase**: 2 (rediseño enterprise)
**Depende de**: Plans 01-09 completados y aceptados individualmente
**Estima**: 1 día

## Objetivo

Validación end-to-end de Fase 2 antes de hacer merge a `main` y tag `v2.0.0-fase2`. Se corren smoke tests manuales, revisión de lint/build, revisión mobile, revisión de permisos por rol, y commit final.

## Checklist de QA funcional

### Navegación y workspace

- [ ] `/finanzas/*` redirige a `/gestion/*` sin romper sesiones previas (compatibilidad con `berna_finanzas_session` en localStorage)
- [ ] Sidebar muestra las 7 secciones en el orden correcto: Resumen Ejecutivo, Finanzas, Personal, Activos & Contratos, Ubicaciones (link), Cierres, Configuración
- [ ] WorkspaceSwitcher permite cambiar a "Ubicaciones" y "Comando" (placeholders si aún no están, sin romper)
- [ ] `+ Registrar` aparece en header en las 3 rutas
- [ ] Atajo Cmd/Ctrl+K abre QuickEntry universal desde cualquier ruta

### Catálogos

- [ ] `/gestion/catalogos` muestra lista de 7 catálogos con contadores correctos
- [ ] CRUD funciona en cada uno: crear, editar, desactivar, reordenar
- [ ] Cargos muestra contador "en uso" correcto (= count en personas_tienda con ese id_cargo)
- [ ] Métodos de pago: VentasPOS ahora lee de DB, NO del array hardcoded viejo
- [ ] Áreas: FK reemplaza CHECK constraint; no se puede crear persona con área fuera del catálogo
- [ ] `catalogos_auxiliares` NO existe más (verificar con `\dt` en Supabase)

### Wizard tipos de movimiento

- [ ] Crear tipo nuevo via wizard: paso 1 elige categoría macro, paso 2 define ámbito, paso 3 autosugiere cuenta
- [ ] Cuenta contable sugerida proviene de `reglas_mapeo_sugerido` según (categoría, rol_ubicacion)
- [ ] Árbol navegable de plan_cuentas funciona (no dropdown plano)
- [ ] Tipo recién creado aparece automáticamente en QuickEntry de las ubicaciones que cumplen el filtro de ámbito

### Obligaciones recurrentes

- [ ] `/gestion/obligaciones` muestra 3 tabs (Próximas, Programadas, Histórico)
- [ ] Tab Próximas agrupa por vencidas/estaSemana/proximas con colores
- [ ] Modal "Confirmar monto" permite subir recibo a Storage
- [ ] Modal "Pagar" admite modos: completo, parcial, acumular
- [ ] Al pagar, se genera un movimiento_caja con splits correctos

### Trabajadores (Rol vs Cargo vs Área)

- [ ] Form muestra 3 selectores separados con labels y helpText
- [ ] Cargos y Áreas se traen desde tablas FK
- [ ] Rol opcional — operario sin PIN no requiere rol
- [ ] Selección de Cargo autosugiere Área (si tiene id_area_default) y salario_base
- [ ] Listado muestra 3 columnas (Cargo, Área, Rol)
- [ ] Data migrada de personas viejas (columna `cargo` text) apunta correctamente a `cargos.id`

### Activos y Contratos

- [ ] `/gestion/activos` tabs funcionan
- [ ] Crear activo genera 60 rows (o N=vida_util) en `depreciacion_mensual`
- [ ] Crear contrato con monto>0 genera obligación recurrente ligada
- [ ] Tab Depreciación muestra histórico y permite generar manualmente (admin)
- [ ] Adjuntos (factura, contrato) suben a Supabase Storage

### Resumen ejecutivo

- [ ] `/gestion/` (index) muestra Resumen Ejecutivo, no Estado de Resultados
- [ ] 4 KPIs con deltas correctos vs mes anterior
- [ ] Alertas condicionales funcionan (cierres pendientes, obligaciones vencidas, saldo bajo)
- [ ] Sparkline de flujo de caja renderiza 30 días
- [ ] Top ubicaciones y top gastos muestran máximo 5 items ordenados

## Checklist de permisos (RBAC)

Crear 3 usuarios de prueba con distintos roles y validar:

| Acción | Admin | Cajero | Asistente |
|---|---|---|---|
| Ver `/gestion/` (Resumen) | ✅ | ✅ | ✅ |
| Crear tipo movimiento via wizard | ✅ | ❌ | ❌ |
| Editar catálogos (métodos_pago, cargos…) | ✅ | ❌ | ❌ |
| Registrar movimiento via + Registrar | ✅ | ✅ | ✅ |
| Editar activo fijo | ✅ | ❌ | ❌ |
| Confirmar monto de obligación | ✅ | ✅ | ❌ |
| Pagar obligación | ✅ | ✅ | ❌ |
| Cerrar período | ✅ | ❌ | ❌ |
| Generar depreciación manual | ✅ | ❌ | ❌ |

## Checklist técnico

### Build y lint

```bash
cd sistema-calzado
npm run lint
npm run build
npm run preview
```

- [ ] `npm run lint` pasa sin errores (warnings tolerables)
- [ ] `npm run build` compila sin errores
- [ ] Bundle size no aumentó >20% vs pre-fase2 (verificar con `ls -lh dist/assets/*.js`)
- [ ] `npm run preview` arranca y el flujo completo funciona en modo producción

### DB

- [ ] Todas las migraciones del Plan 01 aplicadas en orden en el Supabase de staging
- [ ] `supabase_schema.sql` actualizado con las nuevas tablas
- [ ] No hay referencias a `catalogos_auxiliares` en código (grep -r debe devolver 0 matches)
- [ ] No hay referencias al array hardcoded de métodos de pago en `VentasPOS.jsx`

### Mobile responsive

- [ ] Sidebar colapsa en <768px (hamburguesa)
- [ ] KpiStrip pasa a 2×2 en mobile
- [ ] Tablas hacen scroll horizontal sin romper layout
- [ ] QuickEntry modal ocupa pantalla completa en mobile
- [ ] Wizard 3-pasos es usable en mobile

### Browser check

Validar en al menos:
- [ ] Chrome 120+ desktop
- [ ] Safari 17 desktop
- [ ] Chrome Android
- [ ] Safari iOS

## Regresión de features existentes

Asegurar que lo viejo no se rompió:

- [ ] PIN login funciona
- [ ] VentasPOS registra ventas (ahora con métodos desde DB)
- [ ] Producción lotes sigue funcionando (no tocado)
- [ ] Inventario funciona
- [ ] Caja funciona
- [ ] Estado de Resultados accesible en `/gestion/estado-resultados` y funciona
- [ ] Dashboard (flujo caja + patrimonio) funciona
- [ ] Deudas con amortización funciona
- [ ] Cierres de período funciona (Fase 1.5 intacta)
- [ ] Modo Rápido (`/rapido/*`) intacto

## Performance

- [ ] Resumen Ejecutivo carga en <2s (dev)
- [ ] Catálogos (master-detail) carga en <1s
- [ ] Wizard pasos son instantáneos (<100ms transición)
- [ ] No hay N+1 queries evidentes en Network tab

## Accesibilidad básica

- [ ] Botones tienen text labels (no solo iconos sin aria)
- [ ] Forms tienen `<label for="...">` asociados
- [ ] Contraste WCAG AA en colores principales
- [ ] Tab navigation funciona en formularios

## Documentación

- [ ] `docs/superpowers/specs/2026-04-20-rediseno-gestion-empresarial-design.md` actualizado con cualquier ajuste de scope descubierto durante ejecución
- [ ] `docs/superpowers/plans/2026-04-20-roadmap-fase2.md` marca los 10 plans como completados
- [ ] Actualizar `CLAUDE.md` raíz con:
  - Nueva ruta base `/gestion/*` (mencionar redirect desde `/finanzas/*`)
  - Mención de los 7 catálogos dedicados
  - Mención de wizard de tipos
  - Mención de obligaciones recurrentes y activos/contratos como módulos propios
- [ ] Agregar entry en `MEMORY.md` (auto-memoria): `project_rediseno_fase2_completado.md` con lo que se entregó

## Release

```bash
# desde main branch, todo verde
git add .
git commit -m "feat(fase2): rediseño Gestión Empresarial — workspace, catálogos, wizard, obligaciones, activos

Close the enterprise redesign scoped in docs/superpowers/specs/2026-04-20-rediseno-gestion-empresarial-design.md.
Delivers: workspace rename /finanzas→/gestion, 7 dedicated catalog tables, 3-step
tipo_movimiento wizard, recurring obligations inbox, activos+contratos module,
ubiquitous +Registrar, ResumenEjecutivo landing, separated Rol/Cargo/Área."

git tag -a v2.0.0-fase2 -m "Fase 2 — Rediseño Gestión Empresarial"
git push origin main --tags
```

## Rollback plan

Si algo crítico falla en producción:

1. Revertir tag: `git revert v2.0.0-fase2`
2. Las migraciones SQL **no** se revierten automáticamente — documentar en un archivo `rollback_fase2.sql` los `DROP TABLE` / `ALTER TABLE` inversos antes de subir a prod.
3. Rutas viejas `/finanzas/*` deben seguir funcionando directamente por al menos 30 días post-release (redirect, no break).

## Criterio de cierre de Fase 2

Fase 2 se considera cerrada cuando:

1. ✅ Todos los checkboxes de QA funcional tachados
2. ✅ Todos los checkboxes de QA técnico tachados
3. ✅ Regresión de features viejas pasada
4. ✅ Tag `v2.0.0-fase2` pusheado
5. ✅ Marco valida en staging y da OK explícito
6. ✅ Documentación y memoria actualizadas

→ Procede Fase 3 (POS + Producción redesign, ver `roadmap-fases-futuras.md`).
