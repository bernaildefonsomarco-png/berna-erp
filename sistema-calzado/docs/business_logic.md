# BERNA CALZADO

---

# PROTOCOLO DE NEGOCIO ERP CALZADO
### Manual Técnico de Procesos y Flujos Operativos

| Campo | Valor |
|---|---|
| **Versión** | 1.0 — Abril 2026 |
| **Industria** | Manufactura y Retail de Calzado |
| **Ubicación** | Lima, Perú |
| **Stack** | React + Vite + Supabase + Vercel |

> ⚠ **Documento interno — Uso exclusivo del equipo de desarrollo**

---

## 0. Arquitectura General del Negocio

Berna Calzado es una empresa familiar de manufactura y retail de calzado en Lima, Perú. Opera con un taller de producción central (fábrica) y tres puntos de venta retail. Todo el flujo operativo está digitalizado en un ERP web custom (React + Supabase), accesible desde móvil o desktop.

### Entidades físicas del negocio

- 🏭 **Taller (Fábrica):** Producción de calzado. Personal: aparadores y armador.
- 🏪 **Tienda 1, Tienda 2, Tienda 3:** Puntos de venta retail al público.
- 👨‍👩‍👧‍👧 **Familia:** Papá (capital de producción), Mamá (deudas/administración), 3 hermanas vendedoras.
- 💻 **ERP:** Sistema web interno en `vufqthpwmllkealeewqk.supabase.co` (Supabase/PostgREST + React/Vercel)

### Volumen de producción de referencia

| MÉTRICA | VALOR | NOTAS |
|---|---|---|
| Producción semanal | ~21 docenas | 252 pares/semana |
| Series disponibles | 3 series | Pequeña, Mediana, Grande |
| Serie Pequeña | Tallas 27–32 | 12 pares/docena × 6 tallas (2 cada una) |
| Serie Mediana | Tallas 34–39 | 12 pares/docena (distribución estándar) |
| Serie Grande | Tallas 38–43 | 12 pares/docena (distribución estándar) |
| Pago trabajadores | Por docena | Aparadores y armador: pago pieza-rate |

---

## 1. Ciclo de Vida del Producto

El ciclo completo abarca desde la compra de materia prima hasta que el zapato es vendido en tienda. Cada etapa genera registros en la base de datos Supabase.

### 1.1. Etapa A — Compra de Materiales *(No digitalizada aún)*

La adquisición de materias primas (cuero, suela, planta, hilos, adhesivos) es gestionada manualmente por Papá, quien aporta el capital. Esta etapa está **pendiente de integrar** al ERP como movimientos de caja con categoría `transferencia` o `gasto_operativo` desde el módulo Finanzas.

**Materiales principales (del catálogo de costos)**

- **Cuero / badana:** Principal insumo de costo. Medido por pie cuadrado.
- **Planta / suela:** Costo variable según serie (chica, mediana, grande).
- **Hilos, adhesivos, plantillas, accesorios:** Costos menores pero registrados.
- **Registro en BD:** tabla `matcatalogo` / `costos_materiales` vinculados a `colores_modelos`.

---

### 1.2. Etapa B — Producción en Taller

Es el núcleo del ciclo de vida. La digitalización ocurre en el módulo **Producción / Lotes**.

#### Sub-proceso: Creación de un Lote

El operador de fábrica (accede con PIN de producción) sigue un wizard de 4 pasos:

1. **Selección de Modelo:** busca por marca/modelo en el catálogo de productos.
2. **Selección de Color:** elige entre los colores activos del modelo (tabla `colores_modelos`).
3. **Selección de Serie:** elige Pequeña, Mediana, Grande o Personalizada. El sistema muestra precio y margen estimado automáticamente.
4. **Definición de Docenas y Tallas:** el operador define cuántas docenas. El sistema precarga la distribución de tallas estándar por serie, editable manualmente.

Al confirmar, el sistema ejecuta en secuencia:

- `INSERT` en tabla `lotes` (1 registro por lote con cantidad total, precio, costo total, `id_producto`, `id_ubicacion`, `id_serie_tallas`)
- `INSERT` masivo en tabla `inventario` (1 registro por par individual, con SKU único generado automáticamente)
- Generación de PDF de etiquetas con códigos de barras (bwip-js + jsPDF)

#### Estructura del SKU

| Campo | Detalle |
|---|---|
| **Formato** | `{id_lote}-{talla}-{timestamp}-{random5}` |
| **Ejemplo** | `142-37-1714012345678-A3F9K` |
| **Estado inicial** | "Disponible" en la ubicación "Fábrica" |

Cada par tiene un SKU único irrepetible. El QR futuro apuntará a este SKU.

---

### 1.3. Etapa C — Despacho a Tienda

Desde la pantalla de lotes de fábrica, el operador selecciona un lote y despacha X pares a una tienda destino. El sistema actualiza el campo `id_ubicacion` e `nombre_tienda` de los registros de inventario de ese lote, cambiando su estado implícito a "En tienda".

| CAMPO | DESCRIPCIÓN |
|---|---|
| `id_lote` | Lote de producción de origen |
| `id_ubicacion` (fábrica → tienda) | Movimiento del inventario al punto de venta |
| `cantidad_despachada` | Pares enviados en ese despacho específico |
| `nombre_tienda` | Nombre de la tienda destino (desnormalizado para PDF) |

---

### 1.4. Etapa D — Venta en Tienda (POS)

El módulo VentasPOS opera como punto de venta táctil. La vendedora construye el carrito y procesa el pago.

#### Flujo de venta paso a paso

1. **Agregar ítem al carrito:** busca por Marca → Modelo → Color → Talla. El sistema resuelve el precio según la serie de la talla (`precio_chica`, `precio_mediana`, `precio_grande`). Si existe `precio_especial` para ese color/serie, tiene prioridad.
2. **Aplicar descuento (opcional):** campo de descuento global a nivel de transacción.
3. **Registrar pago:** métodos disponibles: Efectivo, Yape, Plin, Tarjeta. Puede ser pago mixto. El sistema calcula vuelto automáticamente.
4. **Confirmar venta:** `INSERT` en tabla `ventas` con todos los métodos de pago. `INSERT` en `ventas_detalle` por cada ítem. `UPDATE` de inventario (estado → "Vendido").
5. **Ticket:** generación de recibo en pantalla (sin impresión por ahora).

#### Modo mayorista

El POS tiene un modo mayorista que permite asociar un cliente (tabla `clientes_mayoristas`) y aplicar precios diferenciados para ventas de volumen.

#### Resolución de precio por serie

**Lógica de resolución (función `getPrecio` en `VentasPOS.jsx`)**

1. Si el color tiene `precio_especial_{serie}` > 0 → usar ese precio.
2. Si el modelo tiene `precio_{serie}` > 0 → usar ese precio.
3. Fallback: `precio_venta_sugerido` del producto.
4. La serie se infiere de la talla: 27–32 = Pequeña, 34–39 = Mediana, 38–43 = Grande.

> ⚠ Tallas 38–39 están en zona de solapamiento → se permite selección manual de serie.

---

### 1.5. Resumen del Ciclo Completo

| ETAPA | ACTOR | MÓDULO ERP | TABLA(S) BD |
|---|---|---|---|
| **A** | Compra materia prima | (Finanzas — pendiente) | `movimientos_caja` |
| **B** | Producción / Lote | Producción Lotes | `lotes`, `inventario` |
| **C** | Despacho | Producción Lotes | `inventario` (update) |
| **D** | Venta retail | VentasPOS | `ventas`, `ventas_detalle` |
| **E** | Cierre de caja | Caja | `cajas`, `movimientos_caja` |

---

## 2. Flujo Financiero

El dinero fluye en tres circuitos interdependientes: el taller (producción), las tiendas (ventas retail) y la caja central familiar. El ERP los conecta digitalmente.

### 2.1. Circuito de Producción

**Origen del capital:** Papá aporta dinero en efectivo para comprar materiales. Este egreso se registra como `transferencia` desde la caja central o como movimiento de Papá en su caja informal.

#### Costos de producción registrados en el sistema

| TIPO DE COSTO | DETALLE |
|---|---|
| **Materiales directos** | Cuero, suela, planta, hilos — registrados en `CatalogoCostos.jsx` por par |
| **Mano de obra (aparadores)** | Pago por docena producida — pieza-rate, registrado al momento del pago |
| **Mano de obra (armador)** | Pago por docena — pieza-rate, el usuario ingresa unidades reales |
| **Costos fijos del taller** | Luz, alquiler taller, herramientas — módulo `CostosFijos.jsx` |
| **Costo total del lote** | Calculado: `costo_por_par × total_pares` → almacenado en `lotes.costo_total_lote` |

---

### 2.2. Circuito de Ventas (Tiendas)

Cada tienda opera con su propia caja (registro en tabla `cajas`). Las hermanas son las responsables operativas del efectivo.

#### Flujo de una sesión de caja completa

1. **Apertura:** la hermana registra el fondo de apertura. Crea registro en tabla `cajas` con `fecha_apertura` y `monto_apertura`.
2. **Ventas durante el turno:** cada venta se registra en tiempo real en `ventas` y `ventas_detalle`.
3. **Movimientos intermedios:** la hermana puede registrar egresos (gastos operativos, adelantos, transferencias a fábrica) e ingresos extra. Tabla: `movimientos_caja`.
4. **Cierre de caja:** la hermana arquea el efectivo físico. El sistema compara contra el saldo esperado (`apertura + ventas_efectivo - egresos_efectivo`). Se registran diferencias. `UPDATE` en tabla `cajas` con `fecha_cierre` y montos de cierre.
5. **Resumen de entrega:** pantalla final que muestra qué dinero debe entregar a Papá/Mamá, discriminado por método.

#### Métodos de pago y su tracking

| MÉTODO | FLUJO | CAMPO EN BD |
|---|---|---|
| Efectivo | Cuenta física en arqueo | `pago_efectivo` / `monto_cierre_efectivo` |
| Yape | Digital — verificación manual | `pago_yape` / `monto_cierre_yape` |
| Plin | Digital — verificación manual | `pago_plin` / `monto_cierre_plin` |
| Tarjeta | POS bancario externo | `pago_tarjeta` / `monto_cierre_tarjeta` |

---

### 2.3. Categorías de Movimientos de Caja

Cada movimiento tiene una categoría que clasifica su naturaleza financiera. Esta clasificación alimenta el módulo Finanzas (plan de cuentas / Estado de Resultados).

| CATEGORÍA (`codigo`) | SIGNIFICADO OPERATIVO |
|---|---|
| `gasto_operativo` | Luz, limpieza, bolsas, útiles de tienda. Egreso del día a día. |
| `gasto_personal` | Adelanto a la hermana vendedora. Queda pendiente de devolución. |
| `devolucion` | Devolución de un adelanto previo. Ingreso que cierra la deuda. |
| `obligacion` | Pago de cuota financiera (ej: Cuota Aly) o ahorro programado (BCP). |
| `transferencia` | Dinero enviado a fábrica para compra de materiales. |
| `retiro_dueno` | Retiro de Papá o Mamá para gastos del hogar u otros. |
| `ingreso_extra` | Fondos adicionales recibidos, reembolsos, etc. |

---

### 2.4. Sistema de Obligaciones Financieras

El módulo trackea dos obligaciones recurrentes críticas del negocio:

| OBLIGACIÓN (`codigo`) | DESCRIPCIÓN |
|---|---|
| `cuota_aly` | Cuota de préstamo financiero. Se descuenta del efectivo de caja diariamente. Trackeo acumulado en `trackeo_obligaciones`. |
| `ahorro_bcp` | Depósito de ahorro programado al banco. Puede pagarse desde la caja o desde el saldo de ahorro acumulado (`origen_pago: ahorro_bcp`). |

---

### 2.5. Módulo Finanzas — Plan de Cuentas y Deudas

El módulo Finanzas es de acceso restringido (URL secreta `/finanzas` + PIN). Administra la salud financiera global de la empresa.

**Plan de Cuentas (Camino B — tabla separada `plan_cuentas`)**

Se utiliza una tabla dedicada `plan_cuentas` (no reusa `tipos_movimiento_caja`). Contiene ~50 cuentas pre-sembradas para el Estado de Resultados. La arquitectura limpia permite generar P&L sin contaminación de datos operativos de caja.

**Módulo de Deudas (`Deudas.jsx`)**

- Registro de deudas con acreedor, capital, tasa de interés, TCEA, fecha de inicio.
- Generación dinámica de cronograma de pagos (`generarCronogramaDinamico`).
- Vista dual: cronograma estándar + simulación con pagos extra (`simularPagoExtra`).
- Advertencias automáticas de saldo negativo.
- TCEA calculada con `tceaEfectiva()`. Costo financiero diario con `costoFinancieroDiario()`.

**Mapa de Deudas (`MapaDeudas.jsx`)**

- Visualización en 4 capas: stock actual, calendario mensual, KPIs de costo real, recomendaciones algorítmicas.
- Barras de progreso por acreedor, mapa de calor de pagos mensuales.

---

### 2.6. Flujo Financiero Consolidado

```
[PAPÁ — capital] ─────────────────────────────────────────────┐
                                                               │ transfiere a Fábrica
                                                               ▼
[FÁBRICA — taller] ──paga por docena──► [Aparadores]          │
                                         [Armador]            │
                │ produce y despacha                          │
                ▼                                             │
[TIENDA 1]  [TIENDA 2]  [TIENDA 3]                           │
      │  vende al público                                     │
      │  métodos: Efectivo, Yape, Plin, Tarjeta               │
      │                                                        │
      ├── [Cuota Aly] ──► Acreedor financiero                 │
      ├── [Ahorro BCP] ──► Cuenta de ahorro                   │
      ├── [Gastos operativos tienda]                           │
      └── Saldo neto ──► [CAJA CENTRAL FAMILIAR] ◄────────────┘
                              (Papá + Mamá)

[MAMÁ — administra] ──► registra deudas grandes en módulo Finanzas
```

---

## 3. Perfiles de Usuario

El sistema distingue tres tipos de acceso según el rol. La autenticación es por PIN numérico (sin usuario/contraseña). Los PINs se almacenan en la tabla `personas_tienda` (campos `pin` y `pin_hash`).

### 3.1. Hermanas Vendedoras — Perfil Tienda

**Personas:** Naty, Yova, Alina (y un perfil "Rotativo" para personal eventual).

**Acceso:** Seleccionan la tienda en pantalla de inicio → eligen su nombre → entran al POS.

#### Funcionalidades disponibles para las hermanas

| MÓDULO | DESCRIPCIÓN |
|---|---|
| **VentasPOS** | Pantalla principal. Construyen el carrito, procesan ventas al público. |
| **Caja** *(exclusivo Naty/Yova/Alina)* | Abren caja, registran movimientos, realizan arqueo y cierre de turno. |
| **Inventario (lectura)** | Consultan stock disponible en su tienda. No pueden modificar. |
| **Modo mayorista** | Opcional: activan modo mayorista para ventas de volumen con precio diferenciado. |
| **Multi-tienda** | Las hermanas que gestionan más de una tienda pueden operar desde un perfil multi-tienda (long-press en pantalla de selección). |

#### Restricciones del perfil tienda

- ✗ No pueden acceder al módulo Finanzas (`/finanzas` requiere PIN adicional).
- ✗ No pueden crear ni eliminar productos del catálogo.
- ✗ No pueden ver lotes o gestionar producción.
- ✗ El botón Caja solo aparece para nombres que incluyan "naty", "yova" o "alina".
- ⚠ Los adelantos personales quedan marcados como `pendiente_devolucion = true`.

#### Flujo completo de la hermana en su turno

1. **Login:** Selecciona tienda → elige su nombre en pantalla táctil.
2. **POS activo:** procesa ventas durante todo el turno.
3. **Movimientos:** registra gastos de tienda (luz, limpieza, etc.) o adelantos.
4. **Cierre:** Arquea el efectivo físico → el sistema detecta diferencias → genera resumen de entrega → envía reporte por WhatsApp al dueño.
5. **Logout:** La sesión queda registrada en `log_sesiones`.

---

### 3.2. Fábrica — Perfil Producción

**Personas:** El operador del taller (Papá u otro trabajador designado).

**Acceso:** PIN específico de producción (rol = "Fabrica" en tabla `ubicaciones`).

**Funcionalidades del perfil producción:**

- Crear lotes de producción (wizard de 4 pasos).
- Ver historial de lotes con filtros por fecha (hoy, semana, mes, todo).
- Despachar lotes a tiendas destino.
- Descargar PDF de etiquetas con códigos de barras.
- No tiene acceso a ventas, caja ni finanzas.

---

### 3.3. Administración — Perfil Finanzas

**Personas:** Berna (dueña), Mamá (gestión de deudas grandes).

**Acceso:** URL secreta `/finanzas` + PIN numérico de 4 dígitos.

**Funcionalidades del perfil finanzas:**

- **Estado de Resultados (P&L)** — módulo principal al entrar a `/finanzas`. P&L interactivo por período (semana, mes, custom) con panel de BI: al hacer clic en una sección del P&L (Ventas, Costos, Personal, etc.) el panel derecho muestra visualizaciones específicas. Soporta filtro por ubicación (`?ubicacion=X`).
- **Dashboard** — Flujo de Caja (diario/mensual) y Patrimonio (activos vs pasivos). El P&L fue movido a Estado de Resultados.
- **Hub Empresarial de Ubicaciones** (`/finanzas/ubicaciones`) — lista de Tiendas y Talleres con mini-KPIs del mes (ventas, costos, personal). Cada tarjeta abre el hub de esa ubicación con 5 tabs: Resumen/P&L, Ventas, Costos, Equipo, Movimientos.
- **Trabajadores** — gestión de nómina: cargo, área, tipo de contrato (fijo/destajo/mixto), salario base, frecuencia de pago. Al crear un trabajador con salario, se crea automáticamente el `costo_fijo` de tipo salario vinculado a esa persona.
- **Costos Fijos** — alquiler, servicios, suscripciones, seguros, impuestos. Los costos de personal NO se crean aquí — solo desde el módulo Trabajadores. La cuenta contable se auto-asigna por categoría (con fallback local si la tabla `mapeo_categoria_cuenta` está vacía).
- **Deudas** — cronograma, TCEA, mapa de deudas, simulación de abonos extraordinarios.
- **Plan de cuentas** — catálogo contable (~50 cuentas) que clasifica movimientos para el P&L.
- **Movimientos** — con clasificación contable obligatoria y splits multi-cuenta.
- Modal de destino de efectivo (`ModalDestinoEfectivo.jsx`): al cierre de tienda, el dinero debe clasificarse obligatoriamente (sin opción de saltear).

---

### 3.4. Tabla resumen de perfiles(pero todo esto se puede gestionar obviamente)

| FUNCIONALIDAD | NATY/YOVA/ALINA | FÁBRICA | FINANZAS | PAPÁ/MAMÁ | PÚBLICO |
|---|---|---|---|---|---|
| VentasPOS | ✓ | ✗ | ✗ | ✗ | ✗ |
| Caja / Arqueo | ✓ | ✗ | ✗ | ✗ | ✗ |
| Inventario (lectura) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Crear Lotes | ✗ | ✓ | ✗ | ✗ | ✗ |
| Despacho a tienda | ✗ | ✓ | ✗ | ✗ | ✗ |
| Catálogo Costos | ✗ | ✗ | ✓ | ✓ | ✗ |
| Módulo Finanzas | ✗ | ✗ | ✓ | ✓ | ✗ |
| Deudas / TCEA | ✗ | ✗ | ✓ | ✓ | ✗ |
| Plan de Cuentas | ✗ | ✗ | ✓ | ✗ | ✗ |

---

## 4. Casos Especiales

### 4.1. Gestión de Deudas

El sistema distingue dos tipos de deudas con tratamiento diferenciado:

#### Deudas operativas diarias (`cuota_aly`, `ahorro_bcp`)

Son obligaciones recurrentes que se pagan desde la caja de tienda. El sistema las trackea en la tabla `trackeo_obligaciones`.

| ESCENARIO | COMPORTAMIENTO DEL SISTEMA |
|---|---|
| **Pago normal (desde caja)** | Movimiento tipo "obligacion" → incrementa acumulado en `trackeo_obligaciones`. |
| **Pago desde ahorro BCP** | `origen_pago = "ahorro_bcp"`. El sistema descuenta del acumulado de ahorro automáticamente. |
| **Consulta del acumulado** | Widget en pantalla de Caja muestra: `Hoy: S/X \| Acumulado: S/Y` en tiempo real. |
| **Adelanto sin devolución al cierre** | El sistema alerta si hay movimientos con `pendiente_devolucion = true` al momento de cerrar caja. |

#### Deudas financieras grandes (Módulo Finanzas)

Las deudas de mayor envergadura (préstamos bancarios, financieras) son gestionadas por Mamá a través del módulo Finanzas.

- **Registro:** Capital, tasa de interés, TCEA, fecha de inicio, acreedor.
- **Cronograma:** Generado automáticamente por `generarCronogramaDinamico()`. Muestra cuotas, interés, saldo mes a mes.
- **Simulación:** `simularPagoExtra()` calcula el impacto de un abono extraordinario en el cronograma restante.
- **Alertas:** Si el flujo proyectado cae a negativo, el sistema muestra advertencia visual.
- **Comparación:** `tceaEfectiva()` permite comparar el costo real anualizado entre distintas deudas.

---

### 4.2. Devoluciones de Venta

El sistema no tiene un flujo de devolución de venta automatizado aún. El caso se maneja actualmente de forma manual:

1. La hermana anula la venta de forma manual (o registra un ingreso negativo como ajuste).
2. El par devuelto vuelve al inventario físico. La actualización del estado en BD se hace manualmente o via Supabase dashboard.
3. Se registra un movimiento tipo `ingreso_extra` en caja por el monto devuelto al cliente.

> **Pendiente de implementar:**
> - Flujo formal de devolución: botón en VentasPOS que invierte la venta y restaura inventario.
> - Asociación de la devolución a la venta original (`id_venta` de referencia).
> - Registro diferenciado en el Estado de Resultados como "devoluciones de ventas".

---

### 4.3. Faltantes de Caja (Diferencias en Arqueo)

Al momento del cierre, si la hermana cuenta menos dinero del esperado, se genera una diferencia. El sistema maneja dos flujos de cierre:

| FLUJO DE CIERRE | COMPORTAMIENTO |
|---|---|
| **Cierre confirmado (sin contar)** | Usa valores del sistema directamente. `diferencia_efectivo = 0`. Rápido pero sin verificación física. |
| **Cierre con arqueo manual** | La hermana ingresa lo que contó físicamente. El sistema calcula diferencias por método. Las guarda en `cajas.diferencia_{metodo}`. |

**Tipos de diferencias y su registro:**

- **Sobrante:** Hay más dinero del esperado (vuelto incorrecto, cobro extra). Se registra en `diferencia_efectivo` con valor positivo.
- **Faltante:** Falta dinero. Puede indicar robo, error de vuelto o adelanto no registrado. El sistema lo registra y lo incluye en las observaciones del PDF de reporte.
- **Reporte:** El reporte de cierre se puede enviar por WhatsApp al número del dueño con el desglose completo.

---

### 4.4. Adelantos a Vendedoras

Los adelantos personales a las hermanas tienen un tratamiento especial en el sistema:

1. La hermana registra el adelanto como movimiento de categoría `gasto_personal`.
2. El sistema setea `pendiente_devolucion = true` en el registro.
3. Al momento del cierre, si hay adelantos pendientes, aparece un popup de alerta con el detalle.
4. La hermana puede optar por continuar el cierre o resolver el adelanto primero.
5. Cuando se devuelve el adelanto, se registra un movimiento de categoría `devolucion` → el sistema debe actualizar `pendiente_devolucion = false` *(flujo pendiente de automatizar)*.

---

### 4.5. Inventario Agotado / Sin Stock

El módulo de despacho de fábrica verifica el stock disponible antes de permitir un despacho:

- Si un lote tiene 0 pares disponibles → el botón de despacho muestra "Sin pares disponibles en fábrica" y bloquea la acción.
- El POS **no bloquea** ventas por stock (el modelo actual permite vender sin validar inventario físico — esto es intencional para velocidad operativa).
- La conciliación de stock se hace periódicamente por inventario físico vs. registros en BD.

---

### 4.6. Descuentos y Precios Especiales

| CASO | MANEJO |
|---|---|
| **Descuento por transacción** | Campo `descuento` en el POS. Se aplica al total del carrito. Se registra en `ventas.descuento`. |
| **Precio especial por color** | El catálogo permite definir `precio_especial_{serie}` por color. Si existe y > 0, tiene prioridad sobre el precio del modelo. |
| **Precio mayorista** | En modo mayorista, la hermana puede editar el precio unitario por ítem manualmente. |
| **Precio sin catálogo** | Si el modelo no está en BD, se puede crear al vuelo desde el POS (opción "Agregar al catálogo"). |

---

## 5. Arquitectura Técnica del ERP

### 5.1. Stack y Despliegue

| CAPA | TECNOLOGÍA |
|---|---|
| **Frontend** | React 19 + Vite + Tailwind CSS |
| **Backend (API)** | Supabase (PostgREST sobre PostgreSQL) |
| **Base de datos** | PostgreSQL en Supabase (`vufqthpwmllkealeewqk.supabase.co`) |
| **Despliegue** | Vercel (CI/CD automático desde Git) |
| **Autenticación** | PIN numérico simple (tabla `personas_tienda.pin` / `pin_hash`) |
| **PDFs** | jsPDF + bwip-js (códigos de barras) |
| **Análisis externo** | Excel para Windows con Power Query (M-language, 19 bloques de consulta) |

---

### 5.2. Tablas Principales de la Base de Datos

| TABLA | PROPÓSITO | RELACIONES CLAVE |
|---|---|---|
| `ubicaciones` | Tiendas y fábrica. PIN de acceso. | `id_ubicacion` → `cajas`, `ventas`, `inventario` |
| `personas_tienda` | Vendedoras y operarios por tienda. | `id_persona` → `movimientos_caja` (FK declarado) |
| `categorias` | Marcas de calzado. | `id_categoria` → `productos` |
| `productos` | Modelos de calzado con precios por serie. | `id_producto` → `colores_modelos`, `lotes`, `inventario` |
| `colores_modelos` | Colores disponibles por modelo + costos y precios especiales por serie. | `id_producto` FK → `productos` |
| `series_tallas` | Definición de series (id, nombre, tallas incluidas). | `id_serie_tallas` → `lotes` |
| `lotes` | Lotes de producción. 1 lote = N pares. | `id_producto`, `id_ubicacion`, `id_serie_tallas` |
| `inventario` | Un registro por par físico (SKU único). | `id_lote`, `id_producto`, `id_ubicacion` |
| `cajas` | Sesiones de caja (apertura/cierre) por tienda. | `id_ubicacion`, `id_persona` |
| `ventas` | Transacciones de venta. | `id_caja`, `id_ubicacion` |
| `ventas_detalle` | Ítems de cada venta. | `id_venta` |
| `movimientos_caja` | Ingresos/egresos dentro de una sesión de caja. | `id_caja`, `id_persona` (FK), `id_tipo` |
| `tipos_movimiento_caja` | Catálogo de tipos de movimiento (con `codigo` y categoría). | `id_tipo` → `movimientos_caja` |
| `trackeo_obligaciones` | Acumulado de cuotas y ahorros pagados. | `codigo` (`cuota_aly`, `ahorro_bcp`) |
| `plan_cuentas` | Plan contable ~50 cuentas (Bloque 4). | Alimenta Estado de Resultados |
| `log_sesiones` | Auditoría de login/logout por persona y tienda. | `id_ubicacion`, `id_persona` |

---

### 5.3. Reglas Críticas de la Arquitectura

> ⚠ **Reglas críticas que toda IA o desarrollador debe respetar**

1. **FOREIGN KEYS:** PostgREST requiere FK declaradas explícitamente en el esquema para que los embedded joins funcionen. Si un join retorna vacío sin error, verificar primero si la FK está declarada en BD.

2. **ERRORES SILENCIOSOS:** El patrón `.catch(console.error)` oculta errores de PostgREST en desarrollo. Siempre surfacear errores visiblemente durante el desarrollo.

3. **FUENTE ÚNICA DE VERDAD:** No duplicar datos de costos entre el catálogo del ERP y Excel. El catálogo del ERP es la fuente autoritativa. Excel es solo para análisis externo.

4. **PLAN DE CUENTAS SEPARADO:** La tabla `plan_cuentas` es distinta de `tipos_movimiento_caja`. No mezclarlas. `plan_cuentas` alimenta el Estado de Resultados. `tipos_movimiento_caja` es operativo.

5. **FLUJOS MANDATORIOS:** El modal `ModalDestinoEfectivo` al cierre es obligatorio. No tiene opción de saltar. La configuración de flujos mandatorios pertenece al módulo Finanzas.

6. **PIN DE FINANZAS:** El módulo `/finanzas` requiere un PIN adicional sobre el PIN de tienda. La URL es secreta. No exponer en navegación normal de la app.

---

### 5.4. Roadmap — Estado de módulos

| MÓDULO | ESTADO |
|---|---|
| **Estado de Resultados (P&L)** | ✅ COMPLETADO — P&L interactivo por período con drill-down de BI por sección. |
| **Hub Empresarial de Ubicaciones** | ✅ COMPLETADO — Lista de Tiendas/Talleres + hub detail con KPIs y 5 tabs. |
| **Módulo Trabajadores** | ✅ COMPLETADO — Nómina con vínculo automático a costos fijos. |
| **Cuenta contable auto-asignada** | ✅ COMPLETADO — En CostosFijos, la cuenta se asigna automáticamente por categoría. |
| **Modo Rápido** | ✅ COMPLETADO — Interfaz simplificada para padres/admins en `/rapido`. |
| **Pagos de taller (pieza-rate)** | 🔲 PENDIENTE — Tabla estructurada para pago a aparadores/armador por docenas. |
| **Cajas informales Papá/Mamá** | 🔲 PENDIENTE — Registro diario de movimientos informales de los padres. |
| **Tabla de márgenes por marca** | 🔲 PENDIENTE — Conectada al catálogo. Reemplazará tabla hardcodeada en Excel. |
| **Sistema QR (stickers)** | 🔲 PENDIENTE — `qr_planchas`, `qr_etiquetas`. Flag `modo_qr`. |
| **Flujo de devolución formal** | 🔲 PENDIENTE — Inversión de venta + restauración de inventario + P&L. |
| **Conciliación de inventario** | 🔲 PENDIENTE — Cotejo periódico entre inventario físico y registros en BD. |
| **Migración 20260414_01** | ✅ APLICADA — rol en personas_tienda. |
| **Migración 20260414_02** | ✅ APLICADA — v_costos_materiales_modelo + trigger saldo no negativo. |
| **Migración 20260415_01** | ✅ APLICADA — trabajadores extendidos + mapeo_categoria_cuenta + v_nomina_resumen. |
| **Migración 20260416_01** | 🔲 PENDIENTE — vendedoras rotativas + multi-área (`es_rotativo`, `areas_adicionales`). |
| **Migración 20260416_02** | 🔲 PENDIENTE — `puestos_adicionales` para guardar el cargo específico por cada área secundaria. |
| **Fase 1.5 — Cierres** | ✅ COMPLETADO — `cierres_periodo` table + `fn_validar_cierre` / `fn_cerrar_periodo` (lock NOWAIT) / `fn_reabrir_periodo` + Storage bucket privado `cierres-mensuales` + `v_cierres_integridad` hash-chain view. PDF ejecutivo 5 páginas con `@react-pdf/renderer` (lazy). Wizard 3 pasos + banner global + historial. |

---

## 6. Glosario Operativo

| TÉRMINO | DEFINICIÓN |
|---|---|
| **Taller / Fábrica** | El workshop de producción donde se fabrican los zapatos. |
| **Docena** | Unidad de producción = 12 pares. Los trabajadores cobran por docena. |
| **Serie** | Rango de tallas agrupadas: Pequeña (27–32), Mediana (34–39), Grande (38–43). |
| **Lote** | Producción de un modelo+color+serie en un momento dado. Puede ser N docenas. |
| **SKU** | Código único por par físico. Formato: `{lote}-{talla}-{timestamp}-{random}`. |
| **Aparador** | Trabajador del taller especializado en el aparado (costura del cuero). |
| **Armador** | Trabajador que ensambla el zapato completo (une cuero, planta, acabados). |
| **Pieza-rate** | Modalidad de pago por unidad producida, no por hora. Los trabajadores cobran por docena. |
| **Arqueo** | Conteo físico del dinero en caja al momento del cierre para comparar con el sistema. |
| **Cuota Aly** | Nombre de una obligación financiera recurrente de la empresa (préstamo). |
| **TCEA** | Tasa de Costo Efectivo Anual. Mide el costo real de un préstamo incluyendo todos los cargos. |
| **Plan de Cuentas** | Catálogo contable jerárquico (~50 cuentas) que clasifica ingresos y egresos para el P&L. |
| **P&L / Estado de Resultados** | Reporte financiero de ganancias y pérdidas del período. |
| **PostgREST** | La capa de API REST de Supabase que expone la BD PostgreSQL como endpoints HTTP. |
| **Embedded join** | En PostgREST: traer datos de tablas relacionadas en una sola query usando sintaxis de punto. |

---

*BERNA CALZADO — ERP INTERNO — DOCUMENTO CONFIDENCIAL*

*Lima, Perú · Versión 1.0 · Abril 2026*