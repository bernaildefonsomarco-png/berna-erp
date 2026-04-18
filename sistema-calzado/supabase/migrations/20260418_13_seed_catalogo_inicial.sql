-- 20260418_13_seed_catalogo_inicial.sql
-- Fase 1 — Seed idempotente de catálogos.
-- Requiere migraciones 01–12 ya aplicadas.

-- ── 1. Roles de persona ──────────────────────────────────────────────────────
INSERT INTO public.roles_persona(codigo, nombre, ambito, orden) VALUES
  ('dueno',          'Dueño',         'Ambos',  1),
  ('administrador',  'Administrador', 'Ambos',  2),
  ('vendedor',       'Vendedor',      'Tienda', 10),
  ('cajero',         'Cajero',        'Tienda', 11),
  ('armador',        'Armador',       'Taller', 20),
  ('perfilador',     'Perfilador',    'Taller', 21),
  ('cortador',       'Cortador',      'Taller', 22),
  ('alistador',      'Alistador',     'Taller', 23),
  ('seguridad',      'Seguridad',     'Ambos',  30)
ON CONFLICT ((lower(codigo))) DO NOTHING;

-- ── 2. Catálogos auxiliares ──────────────────────────────────────────────────
INSERT INTO public.catalogos_auxiliares(codigo, nombre, items) VALUES
  ('frecuencias_pago', 'Frecuencias de pago',
   '[{"codigo":"mensual","label":"Mensual"},
     {"codigo":"quincenal","label":"Quincenal"},
     {"codigo":"semanal","label":"Semanal"},
     {"codigo":"unico","label":"Único"}]'::jsonb),
  ('tipos_contrato', 'Tipos de contrato',
   '[{"codigo":"fijo","label":"Fijo"},
     {"codigo":"destajo","label":"Destajo"},
     {"codigo":"mixto","label":"Mixto"}]'::jsonb),
  ('canales_venta', 'Canales de venta',
   '[{"codigo":"tienda","label":"Venta en Tienda"},
     {"codigo":"mayorista","label":"Venta Mayorista"}]'::jsonb)
ON CONFLICT ((lower(codigo))) DO NOTHING;

-- ── 3. Períodos contables (abiertos desde enero 2026 hasta mes actual) ──────
-- ON CONFLICT (year, month) DO NOTHING garantiza idempotencia.
INSERT INTO public.periodos_contables(year, month, estado)
SELECT
  EXTRACT(year  FROM d)::int,
  EXTRACT(month FROM d)::int,
  'abierto'
FROM generate_series(
  '2026-01-01'::date,
  date_trunc('month', now())::date,
  '1 month'
) d
ON CONFLICT (year, month) DO NOTHING;

-- ── 4. Enriquecer tipos_movimiento_caja existentes ──────────────────────────
-- tipos_movimiento_caja tiene la columna `codigo` (esquema original) y
-- la columna `direccion` fue añadida por la migración 02.
-- El guard "WHERE direccion IS NULL" hace el UPDATE idempotente.
--
-- Gastos operativos → dirección salida
UPDATE public.tipos_movimiento_caja SET
  direccion          = 'salida',
  scope              = '{comando,pos,manual}'::text[],
  comportamientos    = '{requiere_ubicacion}'::text[],
  campos_requeridos  = '[{"key":"monto","label":"Monto","tipo":"numero","requerido":true}]'::jsonb,
  naturaleza         = 'operativo'
WHERE nombre ILIKE '%gasto%'
  AND direccion IS NULL;

-- Ventas / ingresos → dirección entrada
UPDATE public.tipos_movimiento_caja SET
  direccion          = 'entrada',
  scope              = '{pos,manual}'::text[],
  comportamientos    = '{}'::text[],
  campos_requeridos  = '[{"key":"monto","label":"Monto","tipo":"numero","requerido":true}]'::jsonb,
  naturaleza         = 'operativo'
WHERE (nombre ILIKE '%venta%' OR nombre ILIKE '%ingreso%')
  AND direccion IS NULL;

-- Transferencias → dirección transferencia
UPDATE public.tipos_movimiento_caja SET
  direccion          = 'transferencia',
  scope              = '{manual}'::text[],
  comportamientos    = '{requiere_cuenta_origen,requiere_cuenta_destino}'::text[],
  campos_requeridos  = '[{"key":"monto","label":"Monto","tipo":"numero","requerido":true}]'::jsonb,
  naturaleza         = 'interno'
WHERE nombre ILIKE '%transfer%'
  AND direccion IS NULL;

-- ── 5. mapeo_tipo_cuenta ─────────────────────────────────────────────────────
-- Inserta sólo si existen los tipos y cuentas referenciados.
-- ON CONFLICT (id_tipo, ubicacion_rol) DO NOTHING para idempotencia.

-- Gastos de personal → cuentas 621x
INSERT INTO public.mapeo_tipo_cuenta(id_tipo, ubicacion_rol, id_cuenta_contable)
SELECT t.id_tipo, '*', c.id_cuenta_contable
FROM   public.tipos_movimiento_caja t
CROSS JOIN public.plan_cuentas c
WHERE  t.nombre ILIKE '%personal%'
  AND  c.codigo LIKE '621%'
ON CONFLICT (id_tipo, ubicacion_rol) DO NOTHING;

-- Gastos generales / operativos → primera cuenta 6x disponible
INSERT INTO public.mapeo_tipo_cuenta(id_tipo, ubicacion_rol, id_cuenta_contable)
SELECT t.id_tipo, '*', c.id_cuenta_contable
FROM   public.tipos_movimiento_caja t
CROSS JOIN (
  SELECT id_cuenta_contable FROM public.plan_cuentas
  WHERE codigo LIKE '6%'
  ORDER BY codigo
  LIMIT 1
) c
WHERE  t.nombre ILIKE '%gasto%'
  AND  NOT EXISTS (
    SELECT 1 FROM public.mapeo_tipo_cuenta m
    WHERE m.id_tipo = t.id_tipo AND m.ubicacion_rol = '*'
  )
ON CONFLICT (id_tipo, ubicacion_rol) DO NOTHING;
