-- 20260418_01_catalogos_auxiliares.sql
-- Fase 1 — Catálogos auxiliares extensibles + roles_persona como catálogo explícito.

CREATE TABLE IF NOT EXISTS public.catalogos_auxiliares (
  id_catalogo serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogos_auxiliares_codigo_ci
  ON public.catalogos_auxiliares (lower(codigo));

CREATE TABLE IF NOT EXISTS public.roles_persona (
  id_rol serial PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL,
  ambito text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_persona_codigo_ci
  ON public.roles_persona (lower(codigo));
