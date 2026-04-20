# Glosario — Rediseño Gestión Empresarial

**Fecha**: 2026-04-20
**Contexto**: Vocabulario canónico del rediseño enterprise. Si un término aparece en especs, plans, ADRs o UI, debe significar lo que dice aquí — no otra cosa.

---

## Movimiento

La **unidad atómica** del sistema financiero. Un hecho económico real: una venta, un pago, un retiro, una transferencia. Vive en la tabla `movimientos_caja` y se descompone en `movimiento_splits` para su imputación contable.

Un movimiento **siempre** tiene:
- Fecha
- Monto total
- Tipo (ver abajo)
- Ubicación (de dónde o hacia dónde)
- Cuenta financiera origen/destino
- Persona que lo registró
- Opcionalmente: notas, adjuntos, referencia externa

Ejemplos: "Venta S/ 120 en Tienda Centro", "Pago de luz S/ 180 desde Caja Administración", "Transferencia S/ 5,000 de BCP a Interbank".

---

## Tipo de movimiento

Una **plantilla reutilizable** que describe una clase de movimiento frecuente. Vive en `tipos_movimiento_caja`. Responde a "¿qué tipo de hecho económico es este?".

Un tipo tiene:
- Categoría macro (ingreso, gasto_operativo, pago_personas, inversion, traslado, pago_deuda, compra_material)
- Ámbito (todos / por rol / por ubicación)
- Cuenta contable default (mapeo)
- Nombre legible (ej: "Pago Luz Tienda")

Crear un tipo es una **tarea de admin rara** (pasa pocas veces al mes). Registrar un movimiento usando un tipo es una **tarea diaria de cualquier usuario con permiso**.

---

## Mapeo (contable)

La **regla que liga un tipo de movimiento con una cuenta contable**. Vive en `tipos_movimiento_caja.id_cuenta_contable_default` (para el caso simple) y en `mapeo_tipo_cuenta` (para el caso con variación por rol de ubicación).

El usuario **nunca** teclea manualmente "cuál cuenta contable usar" — lo hace el sistema vía `fn_sugerir_cuenta_para_tipo(categoria_macro, rol_ubicacion)` que lee `reglas_mapeo_sugerido`. El admin solo puede **ajustar** la sugerencia navegando el plan de cuentas como árbol.

---

## Plan de cuentas

El **catálogo maestro de ~50 cuentas contables** del negocio (1101 Caja, 4101 Ingresos por ventas, 6101 Servicios públicos, etc.). Vive en `plan_cuentas`. Es la **fuente de verdad** para clasificación en P&L, balance y flujo de caja.

No se toca frecuentemente — es material de contador. Los usuarios normales no lo ven directamente; lo ven reflejado en reportes (Estado de Resultados, Patrimonio).

---

## Obligación recurrente

Un **compromiso de pago futuro que se repite** (alquiler mensual, luz, internet, sueldo). Vive en `obligaciones_recurrentes`. Del compromiso salen **instancias** (`obligaciones_instancias`) — una por período esperado.

Ciclo de vida de cada instancia:
1. **PROYECTADO** — generada automáticamente X días antes del vencimiento, monto estimado
2. **CONFIRMADO** — usuario sube recibo y confirma monto exacto
3. **PAGADO** — se generó el movimiento de pago
4. **VENCIDO** — pasó la fecha y no se pagó
5. **CANCELADO** — ya no aplica

Las obligaciones **no se ejecutan solas**. El usuario confirma y paga manualmente. El sistema solo recuerda y muestra.

---

## Catálogo

Una **lista corta de valores reutilizable** usada como referencia (métodos de pago, áreas, cargos, motivos de merma). En este rediseño:

- **Regla senior**: todo catálogo vive en su propia tabla dedicada, con estructura mínima `(id, codigo, nombre, activo, orden)` + columnas específicas cuando la feature las requiera.
- **No existen** catálogos genéricos tipo `catalogos_auxiliares` con `items jsonb` — esa aproximación fue rechazada en el diseño.
- Todos los catálogos tienen UI de administración unificada en `/gestion/catalogos` — mismo patrón master-detail, form dinámico.

Los 7 catálogos actuales: `metodos_pago`, `areas`, `cargos`, `motivos_merma`, `motivos_ajuste`, `motivos_devolucion`, `condiciones_pago`.

---

## Período

Una **ventana temporal cerrada contablemente** (mes cerrado). Vive en `cierres_periodo`. Una vez cerrado, los movimientos de ese período **no se pueden editar** excepto reabriendo con motivo documentado y admin-only.

Ya implementado en Fase 1.5. No se toca en Fase 2.

---

## Rol

La **dimensión de permisos** — qué puede hacer una persona en el sistema. Vive en `roles_persona` ligado a `permisos_persona`.

Ejemplos de Rol: Admin, Cajero, Asistente de Caja, Rapido-only.

Un rol **opcional** para personas: un operario de taller que nunca usa el ERP no tiene rol ni PIN — solo cobra sueldo y aparece en nómina.

No confundir con Cargo.

---

## Cargo

La **dimensión de puesto laboral** — qué puesto ocupa la persona en el negocio. Vive en `cargos`.

Ejemplos de Cargo: Vendedora, Cajero, Supervisor de Taller, Cortador, Armador, Pegador, Diseñador, Gerente, Administrador.

Un cargo **siempre** lo tiene un trabajador (es para qué se le contrató). Puede o no tener Rol.

**Rol y Cargo son ortogonales** — una persona puede tener ambos, solo uno, o combinaciones diversas. Un "Cajero" (rol de sistema) puede ser una "Vendedora" (cargo en el negocio). Una "Cocina" es un rol sin cargo específico, un "Armador" es un cargo sin rol de sistema.

---

## Área

La **dimensión funcional** — dónde trabaja la persona conceptualmente. Vive en `areas`.

Ejemplos: Taller, Tienda, Administración.

Sirve para reportes agregados ("¿cuánto paga el negocio en sueldos del área Taller?"). Es FK desde `personas_tienda.id_area`, reemplazando un CHECK constraint hardcoded.

---

## Ubicación

Un **sitio físico real** donde ocurre actividad del negocio — una tienda, un taller, una oficina. Vive en `ubicaciones` con un `rol` (Tienda / Taller / Administración) y su propio PIN.

Es una **entidad rica**: tiene ciclo de vida propio (se abre, se cierra), reportes dedicados (P&L por ubicación), relaciones complejas (personas, movimientos, ventas, activos).

No es un catálogo simple — no vive en `/gestion/catalogos`, vive en `/gestion/ubicaciones` con UI propia (hub con KPIs + 5 tabs).

---

## Activo fijo

Algo de valor que el negocio **posee** por más de un año y pierde valor con el tiempo. Ejemplos: máquinas de producción, vehículos, mobiliario, equipo de cómputo. Vive en `activos_fijos`.

Se deprecia automáticamente cada mes (línea recta) vía `fn_generar_depreciacion_mensual`. Genera asientos contables en `movimientos_caja` + splits contra la cuenta de depreciación acumulada.

---

## Contrato

Un **compromiso recurrente con un tercero** — alquiler, hosting, seguro, comodato. Vive en `contratos`.

Si tiene monto mensual > 0, genera automáticamente una `obligacion_recurrente` ligada. Si es comodato (sin pago), solo queda registrado para trazabilidad (ej: "esta máquina no es nuestra, es del proveedor X hasta 2028").

---

## Workspace

Una **vista principal del sistema con propósito diferenciado**. El rediseño define 3 workspaces:

1. **Gestión Empresarial** (`/gestion/*`) — módulo financiero y de personas. Donde vive todo este plan.
2. **Ubicaciones** (`/ubicaciones/*`) — hub por tienda/taller. Ya existe parcialmente (`HubUbicacion`). Será workspace de pleno derecho en fase posterior.
3. **Comando** (`/comando/*`) — dashboard ejecutivo multi-ubicación + alertas + acciones de alto nivel. Pendiente.

Los 3 workspaces comparten el `HeaderGlobal` con WorkspaceSwitcher y `+ Registrar` ubicuo.

---

## QuickEntry

El **formulario universal de registro de movimiento**. Fase 1 construyó la base; Fase 2 lo hace universal: aparece desde `+ Registrar` global + atajo Cmd/Ctrl+K, detecta contexto (ubicación activa, rol del usuario) y filtra automáticamente los tipos aplicables.

Un solo componente, un solo flujo de registro — no hay botones distribuidos por toda la UI.

---

## Wizard (de crear tipo)

El **asistente de 3 pasos** para que un admin cree un tipo nuevo sin necesidad de saber contabilidad:

1. ¿Qué categoría macro? (ingreso, gasto operativo, pago a personas…)
2. ¿Dónde aplica? (cualquier ubicación, solo tiendas, solo talleres, ubicaciones específicas)
3. Confirmar sugerencia contable (autosugerida por motor de reglas; editable con árbol navegable si el admin quiere)

Reemplaza la UI actual en `TabTiposMovimiento.jsx` + `TabMapeo.jsx` que es plana y confusa.

---

## Cierre (de período)

Acto contable de **bloquear un mes** para que no se puedan editar sus movimientos. Implementado en Fase 1.5 con PDF inmutable, hash SHA-256, hash-chain para integridad, y capacidad de reapertura con motivo documentado.

Ver `specs/2026-04-19-fase15-cierre-periodos.md` para detalle.

---

## Regla de oro mnemotécnica

Para navegar mentalmente el modelo:

```
Movimiento = hecho económico real
   ↓ (¿de qué clase?)
Tipo      = plantilla de movimientos recurrentes
   ↓ (¿a qué cuenta?)
Mapeo    = regla tipo → cuenta
   ↓ (¿qué cuenta es?)
Plan     = las ~50 cuentas del negocio
```

Y ortogonalmente:

```
Persona tiene:
   - Rol     (acceso al sistema, opcional)
   - Cargo   (puesto laboral, requerido)
   - Área    (zona funcional, requerido)
```

Y para compromisos futuros:

```
Obligación recurrente = lo que pagaré regularmente (alquiler, luz…)
Contrato              = la fuente contractual de una obligación
Activo fijo           = lo que tengo y pierde valor (máquinas, vehículos…)
```
