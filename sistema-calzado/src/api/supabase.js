import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
const supabaseAnonKey = typeof rawKey === 'string' ? rawKey.trim() : '';

/** False en producción si Vercel no tiene VITE_SUPABASE_* (evita crash en blanco al importar). */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Sin URL/clave válidas, createClient lanza al importar → pantalla blanca antes de React.
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://example.invalid/',
  isSupabaseConfigured ? supabaseAnonKey : 'missing-env-placeholder'
);