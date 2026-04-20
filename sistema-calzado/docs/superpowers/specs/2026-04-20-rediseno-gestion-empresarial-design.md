# Spec Maestro — Rediseño Enterprise Fase 2: Gestión Empresarial

**Fecha**: 2026-04-20
**Autor**: Marco Berna + asistente
**Estado**: Aprobado por usuario, listo para implementación
**Reemplaza**: nada (primer spec del rediseño post-Fase 1.5)

---

## 1. Contexto y Motivación

Tras completar Fase 1 (Motor de Taxonomía + QuickEntry) y Fase 1.5 (Cierres de Período), Marco identificó problemas estructurales en el ERP que hacen que **la fase actual no sea apta para uso empresarial real ni escalable a 10+ ubicaciones**:

- **CatalogoAdmin** tiene 7 pestañas técnicas con inputs JSON, códigos manuales y lenguaje contable — inviable para usuarios no-desarrolladores (su papá, su mamá, vendedoras).
- **Los métodos de pago en POS están hardcoded** (`VentasPOS.jsx:30-35`) — agregar un nuevo método requiere tocar código.
- **Los "tipos de movimiento"** se crean separados de su mapeo contable, forzando al admin a navegar un dropdown plano de ~50 cuentas.
- **No existe el concepto de "obligaciones recurrentes"** — los pagos repetitivos (luz, alquiler, sueldos) no tienen recordatorios; se atrasan en silencio.
- **"Plantillas recurrentes"** estaba mal modelado: como ejecuciones automáticas, lo cual rompería la confianza ("mi papá no quiere que el dinero desaparezca solo").
- **El sidebar y navegación** mezclan dominios (Finanzas + admin del sistema) sin un mental model claro.
- **Inconsistencia "rol vs cargo"**: la columna `personas_tienda.cargo` es texto libre; `area` es CHECK constraint hardcoded. Se confunden permisos del sistema con puestos laborales.

Outcome esperado: un **workspace "Gestión Empresarial" enterprise-grade** que reemplace el actual `/finanzas/*`, con mental model claro, escalabilidad a múltiples ubicaciones, y UX apta para dueño/administrador no-técnico.

---

## 2. Mental Model — Los 7 Conceptos

(Versión final consensuada en brainstorming. Ver detalle visual en `.superpowers/brainstorm/44856-1776560471/content/mental-model-v2.html`.)

```
                          🏢  EMPRESA
                                │
   ┌────────────────────────────┼────────────────────────────┐
   ▼                            ▼                            ▼
┌─────────┐              ┌──────────┐              ┌──────────┐
│ Tienda 1│              │ Taller A │              │ Tienda 2 │   ← UBICACIONES
└────┬────┘              └─────┬────┘              └─────┬────┘
     │  cada hecho económico genera un…                  │
     ▼                         ▼                         ▼
   ┌─────────────────────────────────────────────────────┐
   │                  💧 MOVIMIENTO                       │   ← ÁTOMO
   └──────────────────────────┬──────────────────────────┘
                              ▼
                ┌──────────────────────────────┐
                │  🏷️ TIPO DE MOVIMIENTO        │   ← CATEGORÍA visible al usuario
                └──────────────┬───────────────┘
                               ▼
                ┌──────────────────────────────┐
                │  🔁 MAPEO TIPO → CUENTA       │   ← REGLA AUTOMÁTICA
                └──────────────┬───────────────┘
                               ▼
                 ┌─────────────────────────────┐
                 │  🪣 PLAN DE CUENTAS          │   ← BALDES contables (P&L)
                 └─────────────────────────────┘
```

**Piezas auxiliares**:
- 📅 **Obligaciones recurrentes**: recetas que generan RECORDATORIOS, nunca movimientos automáticos
- 📋 **Catálogos del sistema**: listas planas (métodos de pago, áreas, cargos, motivos) — todas tablas dedicadas
- ⏰ **Períodos contables**: candados de estado (cerrado/abierto), no tablas

**Personas y permisos**:
- 👥 **Persona** (trabajador del negocio) tiene UN **cargo** (puesto laboral) y UNO o más **roles** (permisos en el sistema). Ver §6.

---

## 3. Arquitectura de Workspaces

**3 workspaces fijos** (no se agregan más en Fase 2):

| Workspace | Para quién | Para qué | Ruta |
|---|---|---|---|
| **Gestión Empresarial** | Marco (admin), Marisol (admin secundaria) | Vista macro: finanzas, personal, activos, configuración. Toma de decisiones. | `/gestion/*` (rename de `/finanzas/*`) |
| **Ubicaciones** | Encargados de tienda/taller | Operación del día por sede: ventas, costos, equipo, movimientos | `/ubicaciones/*` (existe ya) |
| **Comando** | Marco, papá, mamá | Vista rápida de "salud" del negocio. Decisiones de tesorería. | `/rapido/*` (existe como Modo Rápido) |

**Header global ubicuo en los 3 workspaces**:
- Switcher de workspace (top-left)
- Botón **"+ Registrar"** (top-right) → abre QuickEntry universal con contexto inteligente
- Avatar del usuario + sus permisos visibles

---

## 4. Sidebar de Gestión Empresarial

```
📊 RESUMEN EJECUTIVO            (landing default)

💰 FINANZAS
   Estado de Resultados
   Flujo de Caja
   Patrimonio
   Cuentas
   Deudas
   Movimientos
   Transferencias
   Obligaciones recurrentes      [NUEVO en Fase 2]

👥 PERSONAL
   Trabajadores
   Nómina
   Organigrama

🏗️ ACTIVOS & CONTRATOS           [NUEVO en Fase 2]
   Activos fijos
   Contratos (alquileres, licencias)
   Depreciación

📍 UBICACIONES → workspace Ubicaciones    (link, no subsección)

📆 CIERRES CONTABLES                       (existe en Fase 1.5)

⚙️ CONFIGURACIÓN
   Empresa
   Plan de Cuentas
   Tipos de Movimiento           [REDISEÑADO: wizard 3 pasos]
   Mapeos contables
   Catálogos del sistema         [REDISEÑADO: tablas dedicadas + UI unificada]
   Permisos y Roles
```

**Notas**:
- Activos & Contratos es nuevo módulo (no existía).
- Obligaciones recurrentes reemplaza el concepto fallido de "plantillas".
- Configuración está al fondo porque se toca poco una vez configurado.
- El sidebar muestra nada de Productos/Materiales/Inventario/Ventas/Compras/Reportes — esos se agregan en fases futuras (ver `roadmap-fases-futuras.md`).

---

## 5. Catálogos — Regla Senior (DECIDIDO Round 3)

**Default = tabla dedicada SIEMPRE.** Se elimina `catalogos_auxiliares` del diseño.

**Razón**: con 2 devs (Marco + asistente), una migration cuesta poco. Las FK dan integridad real, índices propios y mental model consistente. El "tier auxiliar JSON" no aporta valor real y fomenta deuda.

**Estructura mínima de cualquier catálogo**:
```sql
CREATE TABLE <nombre> (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo        text NOT NULL UNIQUE,
    nombre        text NOT NULL,
    activo        boolean NOT NULL DEFAULT true,
    orden         int NOT NULL DEFAULT 100,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
```
+ columnas específicas según el caso.

**Catálogos a crear/migrar en Fase 2**:

| Catálogo | Tabla | Cols extras | Origen actual |
|---|---|---|---|
| Métodos de pago | `metodos_pago` | `tipo` (efectivo/digital/tarjeta), `requiere_referencia` bool | Hardcoded JS `VentasPOS.jsx:30-35` |
| Áreas | `areas` | — | CHECK constraint en `personas_tienda` |
| Cargos | `cargos` | `id_area_default` FK, `salario_sugerido` numeric, `id_cuenta_contable_sueldo` FK | Texto libre `personas_tienda.cargo` |
| Motivos de merma | `motivos_merma` | — | No existe |
| Motivos de ajuste | `motivos_ajuste` | — | No existe |
| Motivos de devolución | `motivos_devolucion` | — | No existe |
| Condiciones de pago | `condiciones_pago` | `dias_credito` int | No existe |

**Catálogos que NO se tocan** (ya son entidades ricas con pantallas propias): `tipos_movimiento_caja`, `roles_persona`, `materiales_catalogo`, `series_tallas`, `costos_fijos`, `plan_cuentas`, `ubicaciones`.

**UI unificada**: una sola pantalla `Configuración → Catálogos del sistema` con master-detail; lista de catálogos a la izquierda, detalle a la derecha. Formulario se renderiza según las columnas reales de cada tabla.

---

## 6. Personas — Rol vs Cargo (DECIDIDO)

**Dos ejes ortogonales**:

### Rol (dimensión SISTEMA — permisos)
- ¿Qué puede HACER esta persona dentro del software?
- Tabla `roles_persona` (ya existe)
- ~4-6 valores: `Administrador`, `Operador Tienda`, `Operador Taller`, `Cocina`, `Solo lectura`
- Cambia poco, es código del sistema

### Cargo (dimensión NEGOCIO — organigrama y nómina)
- ¿Qué PUESTO LABORAL tiene en la empresa?
- Tabla `cargos` (NUEVA en Fase 2)
- 10–30+ valores, crece con el negocio
- Determina: `salario_sugerido`, `id_area_default`, `id_cuenta_contable_sueldo`, lugar en organigrama
- Ejemplos: `Vendedora`, `Cajero`, `Supervisor de tienda`, `Cortador`, `Armador`, `Pegador`, `Diseñador`, `Contador`

### Persona tiene ambos
```sql
ALTER TABLE personas_tienda
  ADD COLUMN id_cargo uuid REFERENCES cargos(id),
  ADD COLUMN id_area  uuid REFERENCES areas(id);
-- mantener `rol` (text) como denormalización para retrocompatibilidad mientras se migra
-- a la FK explícita id_rol → roles_persona
```

### En la UI del formulario "Trabajador"
- 2 selectores claramente distintos
- Tooltips: "Puesto = qué hace en el negocio. Afecta nómina." / "Rol = qué puede hacer en el software. Afecta permisos."

---

## 7. Tipos de Movimiento — Wizard 3 Pasos

**Pantalla**: `Configuración → Tipos de Movimiento → [+ Nuevo tipo]` (modal grande sobre la lista existente).

### Paso 1 — Categoría macro de negocio
7 cards (no dropdown):
- 💰 Entra dinero (venta, devolución, préstamo recibido)
- 💸 Sale — gasto operativo (servicios, alquiler, suministros)
- 👥 Sale — pago a personas (sueldo, bono, adelanto, comisión)
- 🏗️ Sale — inversión (máquina, mejora local)
- 🔁 Movimiento entre cuentas propias (traslado)
- 💳 Pago de deuda / financiero
- 📦 Compra de material para producción

### Paso 2 — Datos básicos + dónde aplica
- Nombre (text)
- Emoji (opcional)
- Código (auto-generado, bloqueado para edición — aprendizaje de Fase 1)
- Dónde aplica (radio):
  - Cualquier ubicación
  - Solo Tiendas
  - Solo Talleres
  - Solo en estas ubicaciones específicas (multiselect)
- Quién puede registrarlo (checkboxes de roles)

### Paso 3 — Mapeo contable autosugerido
- Sistema sugiere cuenta según `(categoría_macro, rol_ubicacion) → id_cuenta`
- UI: card con la sugerencia + 2 botones: **Aceptar** / **Ajustar manualmente**
- Si "Ajustar" → árbol navegable del plan de cuentas (sección → subsección → cuenta), NO dropdown plano
- Vista previa del tipo final antes de [Crear ✓]

**Motor de autosugerencia**: tabla nueva `reglas_mapeo_sugerido(categoria_macro, ubicacion_rol, id_cuenta_contable_sugerida)` o JSON en `configuracion_sistema`. Decisión: tabla. Permite editarla en runtime sin redeploy.

---

## 8. Obligaciones Recurrentes (DECIDIDO)

**Concepto**: el sistema solo RECUERDA. Nunca ejecuta el movimiento solo. El movimiento real se crea solo al confirmar el pago real.

### Ciclo de vida
```
PROYECTADO  → CONFIRMADO (con monto real del recibo)  → VENCIDO  → PAGO
                                                                    ├── completo
                                                                    ├── parcial (queda saldo)
                                                                    └── acumular (próximo mes paga 2)
```

### Schema
```sql
CREATE TABLE obligaciones_recurrentes (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                text NOT NULL UNIQUE,
    nombre                text NOT NULL,
    emoji                 text,
    id_tipo_movimiento    uuid REFERENCES tipos_movimiento_caja(id),
    id_ubicacion          uuid REFERENCES ubicaciones(id_ubicacion),
    id_cuenta_origen      uuid REFERENCES cuentas_financieras(id_cuenta),
    monto_estimado        numeric(12,2),
    monto_es_fijo         boolean NOT NULL DEFAULT false,
    frecuencia            text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal','diaria','anual','custom')),
    dia_del_periodo       int,
    dias_anticipacion_aviso int NOT NULL DEFAULT 5,
    activa                boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE obligaciones_instancias (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_obligacion            uuid NOT NULL REFERENCES obligaciones_recurrentes(id),
    fecha_vencimiento        date NOT NULL,
    monto_proyectado         numeric(12,2),
    monto_confirmado         numeric(12,2),
    estado                   text NOT NULL CHECK (estado IN ('proyectado','confirmado','vencido','pagado_completo','pagado_parcial','acumulado','cancelado')),
    id_movimiento_resultante uuid REFERENCES movimientos_caja(id_movimiento),
    monto_pagado             numeric(12,2),
    saldo_pendiente          numeric(12,2),
    nota                     text,
    archivo_recibo_url       text,
    confirmada_por           uuid REFERENCES personas_tienda(id_persona),
    confirmada_en            timestamptz,
    pagada_por               uuid REFERENCES personas_tienda(id_persona),
    pagada_en                timestamptz,
    UNIQUE (id_obligacion, fecha_vencimiento)
);
```

### Bandeja UI: 3 pestañas
- **Próximas**: instancias en `proyectado/confirmado/vencido` con vencimiento en próximos 30 días
- **Programadas**: lista de recetas (pausar/editar/desactivar)
- **Histórico**: instancias `pagado_*/cancelado`

### Acciones por instancia
- Confirmar monto (cuando llega recibo) → `confirmado`
- Pagar (completo/parcial) → genera `movimientos_caja` real → `pagado_*`
- Marcar acumulado → próxima instancia incluye saldo pendiente
- Posponer → cambia `fecha_vencimiento`

### Generación automática
Cron diario o RPC `fn_generar_obligaciones_pendientes()`: para cada `obligaciones_recurrentes.activa=true`, genera la instancia del próximo período si no existe, con `estado='proyectado'`.

---

## 9. Botón "+ Registrar" Ubicuo (DECIDIDO)

**Ubicación**: header global de los 3 workspaces (top-right). Visible siempre.

**Comportamiento**:
- Click → abre modal QuickEntry
- Pre-rellenado por contexto:
  - Si estás en `/ubicaciones/:id/*` → ubicación pre-seleccionada
  - Si estás en `/gestion/finanzas/cuentas/:id` → cuenta pre-seleccionada
  - Si estás en `/rapido/*` → modo simplificado (botones grandes)
- Filtra los `tipos_movimiento_caja` aplicables al contexto y al rol del usuario
- Permisos: visible solo si el usuario tiene `recurso='movimientos' nivel>='registrar'`

**NO está en**:
- Plan de Cuentas (no tiene sentido — el plan es estructura, no entrada de datos)
- Configuración (no se registran movimientos desde ahí)

**Diferencia clave** (DECIDIDO):
- **REGISTRAR movimiento** = acto diario, cualquier rol → botón ubicuo
- **CREAR tipo de movimiento** = acto raro de admin → vive solo en `Configuración → Tipos de Movimiento` (wizard 3 pasos, ver §7)

---

## 10. Migración del Estado Actual

**Antes de Fase 2**: rutas `/finanzas/*`, sidebar mezclado, CatalogoAdmin con 7 pestañas técnicas.

**Después de Fase 2**: rutas `/gestion/*` (rename), sidebar limpio según §4, CatalogoAdmin disuelto en:
- Catálogos del sistema → §5 (UI unificada)
- Tipos de Movimiento → §7 (wizard)
- Mapeos → árbol nuevo
- Resto eliminado o migrado a tabla dedicada

**Compatibilidad**: durante 1 release intermedio, las rutas `/finanzas/*` redirigen a `/gestion/*` con `<Navigate replace />`. Después se elimina.

**Datos**: ninguna pérdida. Migrations preservan todo (areas, cargos, métodos pago se migran de hardcoded → tablas con datos existentes).

---

## 11. Plan de Implementación (Resumen)

10 sub-fases, ejecutables casi en serie (algunas paralelizables). Detalle completo por sub-fase en `docs/superpowers/plans/2026-04-20-fase2-*.md`.

| # | Plan | Depende de | Paralelo con |
|---|---|---|---|
| 01 | Migraciones DB (catálogos como tablas dedicadas + reglas mapeo + obligaciones) | — | — |
| 02 | Workspace rename + sidebar nuevo | 01 | 03 |
| 03 | Wizard tipos de movimiento + árbol plan cuentas | 01 | 02 |
| 04 | Obligaciones recurrentes (bandeja + RPCs) | 01, 03 | 05 |
| 05 | Catálogos del sistema (UI unificada) | 01 | 04 |
| 06 | Resumen Ejecutivo (landing) | 02 | 07, 08 |
| 07 | Trabajadores rediseño (rol ≠ cargo) | 01, 05 | 06, 08 |
| 08 | Botón "+ Registrar" ubicuo + QuickEntry universal | 02, 03 | 06, 07 |
| 09 | Activos & Contratos (módulo nuevo) | 01, 02 | 06-08 |
| 10 | QA + pulido + smoke tests | todos | — |

**Tiempo estimado**: 4-6 semanas calendario para Marco trabajando solo, ~2 semanas con un dev adicional.

---

## 12. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| La migración de `cargo` text → FK puede dejar datos huérfanos | Migration de 2 pasos: poblar `cargos` con DISTINCT existentes, luego FK con ON DELETE SET NULL para casos no mapeados |
| Cron de obligaciones falla y no genera instancias | Botón manual "Generar próximas instancias" en la bandeja. Backfill RPC idempotente. |
| Eliminar `catalogos_auxiliares` rompe alguna pantalla viva | Grep exhaustivo previo. Cualquier referencia se migra a su tabla dedicada antes del DROP. |
| El wizard de 3 pasos crece a 5+ pasos | Resistir. Si surge necesidad real, agregar paso opcional, no obligatorio. |
| Confusión rol/cargo persiste post-rediseño | Tooltips explícitos en formulario + ADR-003 documentado |

---

## 13. Documentos Relacionados

- **Roadmap Fase 2** (índice de los 10 planes): `docs/superpowers/plans/2026-04-20-roadmap-fase2.md`
- **Roadmap fases futuras**: `docs/superpowers/roadmap-fases-futuras.md`
- **ADRs**: `docs/superpowers/adrs/ADR-001` a `ADR-006`
- **Glosario**: `docs/superpowers/glossary.md`
- **Brainstorm visual companion** (referencia histórica): `.superpowers/brainstorm/44856-1776560471/content/`

---

## 14. Approval

- Marco Berna (dueño): aprobado en sesión 2026-04-20 (rounds 1-3 de brainstorm)
- Sigue: invocar writing-plans para detallar cada sub-plan (ya hecho — ver §11 y `plans/`)
