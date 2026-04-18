-- 20260419_05_storage_bucket_cierres.sql
-- Fase 1.5 — Bucket privado para PDFs de cierres + RLS policies.

-- Crear bucket privado (idempotente via INSERT ... ON CONFLICT DO NOTHING)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cierres-mensuales',
  'cierres-mensuales',
  false,
  20971520,
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Policy SELECT: cualquier usuario autenticado puede ver (descarga vía presigned URL en JS)
DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
CREATE POLICY "cierres_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Policy INSERT: usuario autenticado puede subir (validación de admin ocurre en fn_cerrar_periodo)
DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
CREATE POLICY "cierres_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

-- Policy DELETE: para cleanup si fn_cerrar_periodo falla después de subir el PDF
DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
CREATE POLICY "cierres_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);
