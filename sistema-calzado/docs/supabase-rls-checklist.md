# Checklist seguridad Supabase (RLS y acceso)

Después de cada cambio en tablas sensibles (`personas_tienda`, `permisos_persona`, `movimientos_caja`, `cuentas_financieras`, `configuracion_sistema`):

1. **Revisar políticas RLS** en el panel Supabase: ¿el rol `anon` / `authenticated` solo puede lo necesario?
2. **No exponer** columnas `pin` ni `pin_hash` en vistas públicas; la app ya evita guardar hash en `localStorage` de Finanzas.
3. **Service role**: reservado solo para Edge Functions o jobs server-side; nunca en el bundle del navegador.
4. **Probar** con un usuario sin permiso `finanzas`: no debe leer ni escribir tablas financieras si RLS está bien configurado.

La app valida PIN en cliente contra datos leídos por la clave anónima actual del proyecto: si habilitas RLS restrictivo, asegúrate de que las políticas permitan a vendedoras **leer su propia fila** en `personas_tienda` y `permisos_persona` para el flujo POS.
