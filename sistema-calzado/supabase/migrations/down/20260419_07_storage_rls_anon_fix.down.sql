-- Rollback: restaura las policies originales con auth.uid() check
DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
CREATE POLICY "cierres_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
CREATE POLICY "cierres_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
CREATE POLICY "cierres_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cierres-mensuales' AND auth.uid() IS NOT NULL);
