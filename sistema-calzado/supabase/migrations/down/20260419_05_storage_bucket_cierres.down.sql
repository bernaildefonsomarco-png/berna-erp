-- down/20260419_05_storage_bucket_cierres.down.sql
DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
-- Nota: no eliminamos el bucket para no perder PDFs existentes.
