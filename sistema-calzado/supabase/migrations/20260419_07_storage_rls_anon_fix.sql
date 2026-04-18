-- 20260419_07_storage_rls_anon_fix.sql
-- Fase 1.5 — Fix de RLS para bucket 'cierres-mensuales'.
--
-- Contexto: El sistema NO usa Supabase Auth. Toda la autenticación es vía
-- PIN contra personas_tienda + permisos_persona, y el cliente Supabase opera
-- con la anon key (auth.uid() es siempre NULL). Las policies originales
-- (20260419_05) exigían auth.uid() IS NOT NULL, lo que bloqueaba todos los
-- INSERT desde el frontend con el error:
--   "new row violates row-level security policy"
--
-- La validación real de admin (PIN del cierre) y RBAC ocurre server-side
-- dentro de fn_cerrar_periodo (verifica permisos_persona y bloquea si no
-- es admin). Si el PDF se sube pero el RPC falla, el cliente hace cleanup
-- con DELETE. Por tanto, las policies de Storage solo necesitan validar
-- el bucket destino.

DROP POLICY IF EXISTS "cierres_select" ON storage.objects;
CREATE POLICY "cierres_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'cierres-mensuales');

DROP POLICY IF EXISTS "cierres_insert" ON storage.objects;
CREATE POLICY "cierres_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cierres-mensuales');

DROP POLICY IF EXISTS "cierres_delete" ON storage.objects;
CREATE POLICY "cierres_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'cierres-mensuales');
