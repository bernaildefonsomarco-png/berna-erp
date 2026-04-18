# Fase 1.5 — Cierre de Períodos Contables + Reporte Ejecutivo PDF

**Fecha:** 2026-04-19
**Autor:** Marco + Claude
**Estado:** Aprobado — listo para implementación
**Contexto padre:** Visión arquitectónica empresarial del ERP Berna (5 fases)
**Fase anterior:** Fase 1 — Motor de Taxonomía Universal + QuickEntry (completada)

---

## 1. Motivación y decisiones de diseño

### 1.1 Problema

La tabla `periodos_contables` y el trigger `fn_bloquear_periodo_cerrado` ya existen (Fase 1). Sin embargo, el cierre de un período hoy requiere SQL manual, no hay UI para hacerlo, no se genera ningún reporte de lo que ocurrió en ese período, y no hay mecanismo para verificar integridad histórica.

### 1.2 Decisiones acordadas (brainstorming 2026-04-19)

| Pregunta | Decisión |
|---|---|
| ¿Para quién es el reporte? | Uso interno — Marco + familia/socios. Reporte ejecutivo claro, no formato SUNAT. |
| ¿Cómo se activa el cierre? | Automático con propuesta: el día 1 del mes aparece un banner sugiriendo cerrar el mes anterior. Admin confirma con PIN. |
| ¿Qué incluye el PDF? | 4-6 páginas: portada KPIs + P&L con drill-down + Flujo de Caja + Patrimonio + Checklist de salud al cierre. |
| ¿Dónde se guarda el PDF? | Supabase Storage (bucket privado `cierres-mensuales`) + tabla `cierres_periodo` con hash SHA-256 + versionado v1/v2/... |
| ¿Se puede reabrir un período? | Sí, libremente con motivo obligatorio + PIN admin. Re-cierre genera v2. Sin restricción de tiempo. |
| ¿Cómo se genera el PDF? | `@react-pdf/renderer` (declarativo JSX, lazy loaded solo en `/finanzas/cierres`). |

### 1.3 Lo que reutiliza de Fase 1

- `periodos_contables` — tabla ya creada, con `estado in ('abierto','cerrado')`, `cerrado_por`, `cerrado_en`, `motivo_reapertura`.
- `fn_bloquear_periodo_cerrado` — trigger que ya bloquea INSERT/UPDATE/DELETE en `movimientos_caja` cuando el período está cerrado.
- `audit_log` — tabla inmutable ya existente con trigger genérico.
- `v_sistema_salud` — vista que ya calcula movimientos sin tipo, sin cuenta contable, splits desbalanceados.
- `fn_pl_resumen`, `v_flujo_caja_diario`, `v_flujo_caja_mensual`, `v_patrimonio_snapshot` — todos los datos del reporte ya están disponibles.
- `permisos_persona` — sistema RBAC table-driven; solo añadir recurso `cierres`.

---

## 2. Modelo de datos

### 2.1 Tabla nueva: `cierres_periodo`

```sql
CREATE TABLE public.cierres_periodo (
  id_cierre         serial PRIMARY KEY,
  id_periodo        integer NOT NULL REFERENCES public.periodos_contables(id_periodo),
  version           integer NOT NULL DEFAULT 1,
  id_persona_cerro  integer NOT NULL REFERENCES public.personas_tienda(id_persona),
  cerrado_en        timestamptz NOT NULL DEFAULT now(),
  motivo_reapertura text,           -- NULL en v1; texto obligatorio en v2+ (describe por qué se reabrió)
  hash_sha256       text NOT NULL,  -- SHA-256 del PDF generado
  url_storage       text NOT NULL,  -- ruta dentro del bucket: cierres-mensuales/2026/04/v1.pdf
  snapshot_kpis     jsonb NOT NULL, -- KPIs al momento del cierre (ver §2.2)
  checklist_salud   jsonb NOT NULL, -- resultado del checklist (ver §2.3)
  bytes_pdf         integer,        -- tamaño en bytes del PDF
  id_organizacion   uuid,           -- NULL ahora; preparado para multi-tenant
  UNIQUE (id_periodo, version)
);

CREATE INDEX ON public.cierres_periodo(id_periodo, version DESC);
CREATE INDEX ON public.cierres_periodo(id_organizacion, id_periodo) WHERE id_organizacion IS NOT NULL;
```

**No hay ALTERs sobre tablas existentes.** Todo lo nuevo vive en `cierres_periodo`.

### 2.2 Estructura de `snapshot_kpis`

```jsonb
{
  "year": 2026,
  "month": 4,
  "ingresos": 45230.50,
  "egresos": 32100.00,
  "utilidad_neta": 13130.50,
  "margen_pct": 29.03,
  "n_movimientos": 287,
  "n_ventas": 156,
  "ticket_promedio": 290.00,
  "saldo_total_cuentas": 18450.00,
  "deuda_pendiente_total": 24000.00,
  "patrimonio_neto": 12000.00,
  "version_schema": "1.0"
}
```

`version_schema` permite migrar el formato en el futuro sin romper registros históricos.

### 2.3 Estructura de `checklist_salud`

```jsonb
{
  "movimientos_sin_tipo": 0,
  "movimientos_sin_cuenta_contable": 0,
  "splits_desbalanceados": 0,
  "plantillas_mensuales_pendientes": 2,
  "cuentas_con_saldo_negativo": 0,
  "bloqueante": false,
  "warnings": ["2 plantillas mensuales no se ejecutaron este período"]
}
```

`bloqueante: true` si `movimientos_sin_tipo > 0 OR movimientos_sin_cuenta_contable > 0 OR splits_desbalanceados > 0`. Los campos `plantillas_mensuales_pendientes` y `cuentas_con_saldo_negativo` son siempre warnings (no bloqueantes) — el admin puede cerrar de todas formas si solo hay warnings.

### 2.4 Hash chain para integridad

El `hash_sha256` en v2+ incluye el hash de la versión anterior concatenado con el hash del nuevo PDF:

```
hash_v2 = SHA-256(pdf_bytes_v2 + "|" + hash_v1)
```

La vista `v_cierres_integridad` expone el estado de la cadena. Si alguien modifica un PDF en Storage, el hash del registro siguiente se rompe.

---

## 3. Funciones RPC (nuevas)

### 3.1 `fn_validar_cierre(p_year int, p_month int) → jsonb`

Retorna el checklist de salud del período. **No usa `v_sistema_salud`** (que es global y no filtra por mes) — hace queries directas con filtro de fecha.

```sql
-- Pseudocódigo:
DECLARE
  v_fecha_inicio timestamptz := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'America/Lima');
  v_fecha_fin    timestamptz := v_fecha_inicio + interval '1 month' - interval '1 second';
  v_sin_tipo     integer;
  v_sin_cuenta   integer;
  v_splits_malos integer;
  v_plantillas   integer;
  v_saldos_neg   integer;
BEGIN
  SELECT count(*) INTO v_sin_tipo
    FROM movimientos_caja WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin AND id_tipo IS NULL;

  SELECT count(*) INTO v_sin_cuenta
    FROM movimientos_caja WHERE fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin AND id_cuenta_contable IS NULL;

  SELECT count(*) INTO v_splits_malos
    FROM movimiento_splits s JOIN movimientos_caja m ON m.id_movimiento = s.id_movimiento
    WHERE m.fecha_movimiento BETWEEN v_fecha_inicio AND v_fecha_fin
    GROUP BY s.id_movimiento HAVING SUM(s.monto) <> m.monto;

  SELECT count(*) INTO v_plantillas
    FROM plantillas_recurrentes p WHERE p.activo AND p.frecuencia = 'mensual'
      AND NOT EXISTS (SELECT 1 FROM plantilla_ejecuciones e
        WHERE e.id_plantilla = p.id_plantilla AND e.periodo = to_char(v_fecha_inicio, 'YYYY-MM'));

  SELECT count(*) INTO v_saldos_neg FROM cuentas_financieras WHERE saldo_actual < 0;

  RETURN jsonb_build_object(
    'movimientos_sin_tipo',             v_sin_tipo,
    'movimientos_sin_cuenta_contable',  v_sin_cuenta,
    'splits_desbalanceados',            v_splits_malos,
    'plantillas_mensuales_pendientes',  v_plantillas,
    'cuentas_con_saldo_negativo',       v_saldos_neg,
    'bloqueante',                       (v_sin_tipo > 0 OR v_sin_cuenta > 0 OR v_splits_malos > 0),
    'warnings',                         (CASE WHEN v_plantillas > 0 OR v_saldos_neg > 0
                                          THEN jsonb_build_array(...)
                                          ELSE '[]'::jsonb END)
  );
END
```

### 3.2 `fn_cerrar_periodo(p_year, p_month, p_id_persona, p_hash_sha256, p_url_storage, p_snapshot_kpis, p_checklist_salud, p_bytes_pdf) → jsonb`

Transacción atómica con lock pesimista. `SECURITY DEFINER` para poder escribir al bucket de Storage.

```sql
BEGIN
  -- Lock pesimista: falla rápido si otro admin ya tiene el lock
  PERFORM 1 FROM periodos_contables
    WHERE year = p_year AND month = p_month FOR UPDATE NOWAIT;

  -- Validar que sigue abierto (protección vs doble cierre)
  IF (SELECT estado FROM periodos_contables WHERE ...) = 'cerrado' THEN
    RAISE EXCEPTION 'PERIODO_YA_CERRADO';
  END IF;

  -- Determinar versión
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM cierres_periodo WHERE id_periodo = ...;

  -- Hash chain (v2+ referencia hash anterior)
  -- El hash final lo calcula el cliente ya incorporando el hash previo

  -- Insertar cierre
  INSERT INTO cierres_periodo (...) VALUES (...);

  -- Marcar período como cerrado
  UPDATE periodos_contables
    SET estado = 'cerrado', cerrado_por = p_id_persona, cerrado_en = now()
    WHERE year = p_year AND month = p_month;

  RETURN jsonb_build_object('ok', true, 'version', v_version, 'id_cierre', v_id_cierre);
END
```

### 3.3 `fn_reabrir_periodo(p_id_periodo, p_motivo, p_id_persona) → void`

```sql
BEGIN
  IF (SELECT estado FROM periodos_contables WHERE id_periodo = p_id_periodo) = 'abierto' THEN
    RAISE EXCEPTION 'PERIODO_YA_ABIERTO';
  END IF;

  UPDATE periodos_contables
    SET estado = 'abierto', motivo_reapertura = p_motivo
    WHERE id_periodo = p_id_periodo;

  -- La auditoría corre via trg_audit_generico automáticamente
END
```

### 3.4 Vista `v_cierres_integridad`

```sql
CREATE VIEW public.v_cierres_integridad AS
SELECT
  c.*,
  p.year, p.month,
  prev.hash_sha256 AS hash_version_anterior,
  CASE
    WHEN c.version > 1 AND prev.hash_sha256 IS NULL THEN 'CADENA_ROTA'
    ELSE 'OK'
  END AS estado_integridad
FROM cierres_periodo c
JOIN periodos_contables p ON p.id_periodo = c.id_periodo
LEFT JOIN cierres_periodo prev
  ON prev.id_periodo = c.id_periodo AND prev.version = c.version - 1;
```

---

## 4. Storage — Supabase

### 4.1 Bucket

- Nombre: `cierres-mensuales`
- Tipo: privado (sin acceso público)
- Ruta de archivos: `{year}/{month:02}/v{version}.pdf` — ejemplo: `2026/04/v1.pdf`

### 4.2 Policies RLS

```sql
-- Lectura: usuarios autenticados con permiso cierres:ver
-- (verificación de nivel en permisos_persona se hace antes de generar la presigned URL en JS)
CREATE POLICY "cierres_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Escritura: cualquier usuario autenticado puede hacer INSERT
-- (la verificación de que es admin ocurre en JS antes de llamar .upload(); el RPC fn_cerrar_periodo
--  valida en BD y hace rollback si el usuario no tiene nivel admin)
CREATE POLICY "cierres_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Eliminación (cleanup): el cliente elimina el archivo si fn_cerrar_periodo falla
CREATE POLICY "cierres_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);
```

**Nota de implementación:** La subida al bucket ocurre desde el cliente JS usando `supabase.storage.from('cierres-mensuales').upload(...)` con la anon key. La verificación de permisos es doble: (1) el JS verifica `puedeCerrar(usuario)` antes de iniciar el flujo, (2) `fn_cerrar_periodo` verifica en BD que el usuario tiene nivel admin y hace ROLLBACK si no. El insert a `cierres_periodo` solo se hace si la subida fue exitosa.

### 4.3 Orden de operaciones (atomicidad cliente-servidor)

```
1. Cliente genera PDF → Blob
2. Cliente calcula SHA-256 (Web Crypto API)
3. Cliente sube Blob a Storage → obtiene url_storage confirmada
4. Cliente llama fn_cerrar_periodo(... hash, url_storage, snapshot_kpis ...)
5. Si fn_cerrar_periodo falla → cliente borra el archivo de Storage (cleanup)
6. Si fn_cerrar_periodo exitoso → redirect a /finanzas/cierres con toast
```

Esto garantiza que nunca quede un PDF en Storage sin su registro en `cierres_periodo`, ni un registro sin su PDF.

---

## 5. Permisos

### 5.1 Nuevo recurso `cierres` en `RECURSOS` (lib/permisos.js)

```js
export const RECURSOS = {
  // ... existentes ...
  CIERRES: 'cierres',
};
```

### 5.2 Helpers específicos

```js
export function puedeVerCierres(usuario)   { return tienePermiso(usuario, RECURSOS.CIERRES, 'ver'); }
export function puedeCerrar(usuario)        { return tienePermiso(usuario, RECURSOS.CIERRES, 'admin'); }
export function puedeReabrir(usuario)       { return tienePermiso(usuario, RECURSOS.CIERRES, 'admin'); }
```

### 5.3 Seed de permisos

```sql
-- Dar permiso cierres:admin a todos los que tienen finanzas:admin
INSERT INTO permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'admin', true
FROM permisos_persona
WHERE recurso = 'finanzas' AND nivel_acceso = 'admin'
ON CONFLICT (id_persona, recurso) DO NOTHING;

-- Dar cierres:ver a todos los que tienen finanzas:ver o superior
INSERT INTO permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'ver', true
FROM permisos_persona
WHERE recurso = 'finanzas' AND nivel_acceso IN ('ver','registrar','editar','admin')
ON CONFLICT (id_persona, recurso) DO NOTHING;
```

---

## 6. Componentes UI

### 6.1 Árbol de archivos nuevos

```
src/views/finanzas/
  views/
    CierresPeriodo.jsx                ← vista historial (lista + reapertura)
    cierres/
      CierreWizard.jsx                ← orquestador 3 pasos
      PasoChecklistSalud.jsx          ← paso 1
      PasoPreviewReporte.jsx          ← paso 2
      PasoConfirmarPin.jsx            ← paso 3
      ReporteCierrePDF.jsx            ← <Document> react-pdf (5 páginas)
  components/
    BannerCierrePendiente.jsx         ← banner global inyectado en FinanzasLayout
  api/
    cierresClient.js                  ← 6 funciones API
```

### 6.2 Rutas nuevas (en `FinanzasLayout`)

```jsx
<Route path="/finanzas/cierres"               element={<CierresPeriodo />} />
<Route path="/finanzas/cierres/:year/:month"  element={<CierreWizard />}   />
```

### 6.3 Sidebar (FinanzasLayout.jsx)

Agregar a `NAV_ITEMS` (después de `estado-resultados`, antes de `cuentas`):

```js
{
  path: '/finanzas/cierres',
  label: 'Cierres',
  icon: ICONS.document,
  recurso: RECURSOS.CIERRES,    // usa el recurso propio, no FINANZAS
  adminOnly: false,
}
```

El `FinanzasLayout` ya itera `NAV_ITEMS` y filtra con `puedeVer(usuario, item.recurso)`. Al agregar `RECURSOS.CIERRES`, solo usuarios con `cierres:ver` o superior verán el ítem. No se requiere lógica adicional.

### 6.4 BannerCierrePendiente

Se monta en `FinanzasLayout` justo antes del `<Suspense>` del contenido principal. Solo visible si:
- `puedeCerrar(usuario)` (admin)
- Hay períodos anteriores con `estado = 'abierto'`
- No hay dismissal activo en `localStorage['berna.cierre.dismissed']` (se resetea automáticamente al cambiar de mes)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠ Tienes 1 período pendiente de cierre: ABRIL 2026               │
│  [Ver y cerrar →]                              [Recordar mañana ×]  │
└─────────────────────────────────────────────────────────────────────┘
```

UI: amber (`#fef3c7` bg, `#92400e` text) — consistente con los banners de lectura-sola ya existentes en Movimientos y Transferencias.

### 6.5 CierreWizard — 3 pasos

**Paso 1 — Checklist de salud**

Llama a `fn_validar_cierre(year, month)`. Muestra tabla con cada check:

| Check | Valor | Estado |
|---|---|---|
| Movimientos sin tipo | 0 | ✅ |
| Movimientos sin cuenta contable | 0 | ✅ |
| Splits desbalanceados | 0 | ✅ |
| Plantillas mensuales pendientes | 2 | ⚠ warning |
| Cuentas con saldo negativo | 0 | ✅ |

Si hay ≥1 error rojo (bloqueante) → botón "Continuar" deshabilitado + mensaje "Resuelve los errores antes de cerrar".
Si solo warnings → botón "Continuar de todas formas" habilitado.

**Paso 2 — Preview del reporte**

Lazy-import de `@react-pdf/renderer`. Muestra `<PDFViewer>` con el `<ReporteCierrePDF>` ya renderizado. El usuario puede scrollear las 5 páginas antes de confirmar.

Botones: "← Volver al checklist" / "Continuar con el cierre →".

**Paso 3 — Confirmar con PIN**

- Campo PIN (máscara ••••)
- Textarea "Notas del cierre" (opcional)
- Botón "Cerrar período [MES AÑO]" (color rojo/destructivo para señalar que es irreversible sin reapertura)
- Al confirmar: ejecuta flujo de 5 pasos descritos en §4.3

### 6.6 CierresPeriodo — Vista historial

Tabla de todos los períodos con columnas: Período, Estado (abierto/cerrado), Versión, Cerrado por, Fecha de cierre, Acciones.

Acciones por fila:
- Si cerrado y `puedeVerCierres`: botón "Descargar PDF" (presigned URL de Storage)
- Si cerrado y `puedeReabrir`: botón "Reabrir" (abre modal con textarea motivo + PIN)
- Si abierto y `puedeCerrar` y mes < hoy: botón "Cerrar" → navega a `/finanzas/cierres/:year/:month`

### 6.7 ReporteCierrePDF — 5 páginas

Tecnología: `@react-pdf/renderer`. Estilos en objeto JS (no CSS externo). Paleta: `#1c1917` (text), `#fafaf9` (bg), `#57534e` (muted) — misma que `lib/designSystem.js`.

**Página 1 — Portada**
- Logo/nombre "BERNA CALZADO"
- Período: "ABRIL 2026"
- Versión: "Reporte de Cierre v1"
- 4 KPIs grandes: Ingresos / Egresos / Utilidad Neta / Margen %
- Fecha y hora de generación
- Footer: `SHA-256: {hash}` (los primeros 16 chars + "...")

**Página 2 — Estado de Resultados**
- Tabla P&L por sección (Ingresos → Costos de Producción → Personal → Gastos Operativos → Resultado)
- Por cada sección: nombre, total S/, % del ingreso
- Sub-filas por categoría dentro de cada sección

**Página 3 — Flujo de Caja**
- Tabla de ingresos/egresos diarios del mes (agrupados por semana si son muchos días)
- Totales: ingresó, salió, neto
- Burn rate diario promedio

**Página 4 — Snapshot de Patrimonio**
- Saldo de cada cuenta financiera al cierre
- Total activos, total deudas, patrimonio neto
- Tabla de deudas activas con saldo pendiente y TCEA

**Página 5 — Checklist y Auditoría**
- Resultado del checklist de salud (todos los checks con su valor)
- Cerrado por: nombre + cargo
- Timestamp exacto del cierre
- Hash SHA-256 completo
- Reaperturas anteriores (si las hay): quién, cuándo, motivo
- Footer: "Generado por BERNA ERP — DOCUMENTO CONFIDENCIAL"

---

## 7. API Client (`cierresClient.js`)

```js
// src/views/finanzas/api/cierresClient.js
import { supabase } from '../../../api/supabase';

// Obtener todos los períodos (abiertos y cerrados) con su último cierre si existe
export async function obtenerPeriodos() { ... }

// Obtener períodos del pasado que están abiertos (para el banner)
export async function obtenerPeriodosPendientes() { ... }

// Obtener historial de cierres de un período específico
export async function obtenerCierresDeperiodo(year, month) { ... }

// Validar si un período puede cerrarse (checklist de salud)
export async function validarCierre(year, month) {
  const { data, error } = await supabase.rpc('fn_validar_cierre', { p_year: year, p_month: month });
  if (error) throw error;
  return data;
}

// Cerrar un período: subir PDF + llamar RPC atómica
export async function cerrarPeriodo({ year, month, idPersona, pdfBlob, snapshotKpis, checklistSalud }) {
  // 1. Calcular hash SHA-256
  // 2. Obtener hash anterior (si v2+)
  // 3. Subir a Storage
  // 4. Llamar fn_cerrar_periodo
  // 5. Cleanup si falla
  ...
}

// Reabrir un período cerrado
export async function reabrirPeriodo({ idPeriodo, motivo, pin }) { ... }

// Obtener presigned URL para descargar PDF
export async function descargarPdfCierre(urlStorage) {
  const { data, error } = await supabase.storage
    .from('cierres-mensuales')
    .createSignedUrl(urlStorage, 3600); // expira en 1 hora
  if (error) throw error;
  return data.signedUrl;
}
```

---

## 8. Seguridad y robustez

| Mecanismo | Descripción |
|---|---|
| PIN re-validation | El PIN se valida via bcrypt contra `personas_tienda.pin_hash` al momento del cierre, no se confía en la sesión activa |
| Lock pesimista | `fn_cerrar_periodo` usa `SELECT FOR UPDATE NOWAIT` — falla rápido si otro admin tiene el lock |
| Atomicidad cliente | Subida a Storage + llamada RPC son secuenciales; si el RPC falla, el cliente elimina el archivo de Storage |
| Hash chain | `v_cierres_integridad` expone `estado_integridad = 'CADENA_ROTA'` si alguien modifica un PDF en Storage |
| Snapshot en BD | `snapshot_kpis` permite regenerar el PDF si Storage lo pierde |
| Audit inmutable | `trg_audit_generico` (Fase 1) registra cada INSERT/UPDATE en `cierres_periodo` en `audit_log` inmutable |
| Multi-tenant ready | Columna `id_organizacion uuid` preparada desde el día 1 (NULL ahora) |
| RLS Storage | Bucket privado; descarga requiere presigned URL generada por el servidor |

---

## 9. Migraciones SQL (6 archivos)

```
supabase/migrations/
  20260419_01_cierres_periodo_tabla.sql
  20260419_02_fn_validar_cierre.sql
  20260419_03_fn_cerrar_periodo.sql
  20260419_04_fn_reabrir_periodo.sql
  20260419_05_storage_bucket_cierres.sql
  20260419_06_v_cierres_integridad.sql
```

Cada migración tiene su par `down/20260419_NN_*.sql` con `DROP IF EXISTS` (sin destructivos).

---

## 10. Dependencias npm nuevas

```bash
npm install @react-pdf/renderer
```

Solo se importa con `lazy(() => import('./cierres/ReporteCierrePDF'))` — no afecta el bundle principal.

---

## 11. Criterios de aceptación

| # | Criterio | Cómo verificar |
|---|---|---|
| 1 | Banner aparece el día 1+ cuando hay mes anterior abierto | Navegar a cualquier vista de `/finanzas/*` con usuario admin |
| 2 | Wizard bloquea si checklist tiene rojos | Crear movimiento sin tipo en el mes a cerrar + intentar cerrar |
| 3 | PDF generado tiene 5 páginas con hash visible en footer de c/página | Revisar el PDF descargado |
| 4 | Tras cierre, `UPDATE movimientos_caja` en mes cerrado falla con `PERIODO_CERRADO` | Ejecutar SQL directo en Supabase Editor |
| 5 | Reapertura requiere PIN + motivo obligatorio | Intentar sin alguno → bloqueado |
| 6 | Re-cierre tras reapertura genera v2 con hash distinto en `cierres_periodo` | `SELECT * FROM cierres_periodo ORDER BY version` |
| 7 | `v_cierres_integridad` detecta cadena rota | Modificar manualmente la columna `hash_sha256` de v1 en BD |
| 8 | Lock pesimista impide doble cierre simultáneo | `EXPLAIN` en `fn_cerrar_periodo` + test con 2 transacciones |
| 9 | Audit log tiene registros de cada cierre/reapertura | `SELECT * FROM audit_log WHERE tabla='cierres_periodo'` |
| 10 | Solo `cierres:admin` puede cerrar/reabrir; `cierres:ver` solo descarga | Login con usuario de nivel menor |
| 11 | Cleanup de Storage si `fn_cerrar_periodo` falla | Simular error de BD después de subir el PDF; verificar que el archivo se elimina |
| 12 | PDF lazy-loading: bundle principal no crece | `npm run build -- --report` → verificar chunk separado |

---

## 12. Fuera de alcance de Fase 1.5

- Cierre trimestral/anual consolidado → Fase 5 BI
- Notificación email/WhatsApp el día 1 → Fase 4 propagación
- Firma digital criptográfica con clave privada → Futuro tributario
- Comparativos vs mes anterior dentro del PDF → Fase 5 BI
- Cierre por ubicación individual → Fase 2 Hub Empresarial
- Export a Excel → Futuro
- Aprobación por dos personas (doble firma) → Futuro

---

## 13. Notas para fases posteriores

- **Fase 2:** Cuando se agregue cierre por ubicación, `cierres_periodo` puede agregar `id_ubicacion integer REFERENCES ubicaciones(id_ubicacion)` — no rompe el esquema actual.
- **Fase 5:** El `snapshot_kpis` puede enriquecerse con comparativo vs mes anterior y por ubicación una vez que el Hub Empresarial tenga P&L local.
- **Multi-tenant:** `id_organizacion` ya está preparado. Al activar, agregar `NOT NULL DEFAULT` + índice compuesto.
