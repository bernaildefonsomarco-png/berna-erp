-- 20260419_06_v_cierres_integridad.sql
-- Fase 1.5 — Vista de integridad de cadena de hashes + seed de permisos.

-- Vista: detecta si alguien manipuló un PDF (cadena de hashes rota)
CREATE OR REPLACE VIEW public.v_cierres_integridad AS
SELECT
  c.id_cierre,
  c.id_periodo,
  p.year,
  p.month,
  c.version,
  c.id_persona_cerro,
  c.cerrado_en,
  c.hash_sha256,
  c.url_storage,
  c.bytes_pdf,
  c.motivo_reapertura,
  prev.hash_sha256 AS hash_version_anterior,
  CASE
    WHEN c.version > 1 AND prev.hash_sha256 IS NULL THEN 'CADENA_ROTA'
    ELSE 'OK'
  END AS estado_integridad
FROM public.cierres_periodo c
JOIN public.periodos_contables p ON p.id_periodo = c.id_periodo
LEFT JOIN public.cierres_periodo prev
  ON prev.id_periodo = c.id_periodo AND prev.version = c.version - 1;

-- Seed de permisos: dar acceso 'admin' a quienes tienen finanzas:admin
INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'admin', true
FROM public.permisos_persona
WHERE recurso = 'finanzas' AND nivel_acceso = 'admin'
ON CONFLICT (id_persona, recurso) DO NOTHING;

-- Dar cierres:ver a quienes tienen finanzas:ver/registrar/editar (no admin, esos ya tienen admin arriba)
INSERT INTO public.permisos_persona (id_persona, recurso, nivel_acceso, activo)
SELECT id_persona, 'cierres', 'ver', true
FROM public.permisos_persona
WHERE recurso = 'finanzas'
  AND nivel_acceso IN ('ver', 'registrar', 'editar')
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos_persona x
    WHERE x.id_persona = permisos_persona.id_persona AND x.recurso = 'cierres'
  )
ON CONFLICT (id_persona, recurso) DO NOTHING;
