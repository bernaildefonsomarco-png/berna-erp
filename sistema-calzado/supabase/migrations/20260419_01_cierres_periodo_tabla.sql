-- 20260419_01_cierres_periodo_tabla.sql
-- Fase 1.5 — Tabla de cierres de períodos contables con versionado y snapshot.

CREATE TABLE IF NOT EXISTS public.cierres_periodo (
  id_cierre         serial PRIMARY KEY,
  id_periodo        integer NOT NULL REFERENCES public.periodos_contables(id_periodo) ON DELETE RESTRICT,
  version           integer NOT NULL DEFAULT 1,
  id_persona_cerro  integer NOT NULL REFERENCES public.personas_tienda(id_persona),
  cerrado_en        timestamptz NOT NULL DEFAULT now(),
  motivo_reapertura text,
  hash_sha256       text NOT NULL,
  url_storage       text NOT NULL,
  snapshot_kpis     jsonb NOT NULL DEFAULT '{}',
  checklist_salud   jsonb NOT NULL DEFAULT '{}',
  bytes_pdf         integer,
  id_organizacion   uuid,
  UNIQUE (id_periodo, version)
);

CREATE INDEX IF NOT EXISTS idx_cierres_periodo_periodo
  ON public.cierres_periodo(id_periodo, version DESC);

CREATE INDEX IF NOT EXISTS idx_cierres_periodo_org
  ON public.cierres_periodo(id_organizacion, id_periodo)
  WHERE id_organizacion IS NOT NULL;

COMMENT ON TABLE public.cierres_periodo IS
  'Registro de cierres contables mensuales. Cada cierre tiene versión (v1=inicial, v2+=re-cierre tras reapertura), snapshot de KPIs y hash SHA-256 del PDF generado.';
