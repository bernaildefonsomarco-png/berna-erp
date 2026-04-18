// src/views/finanzas/api/cierresClient.js
import { supabase } from '../../../api/supabase';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Calcula SHA-256 de un ArrayBuffer. Retorna hex string. */
async function sha256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Ruta dentro del bucket: 2026/04/v1.pdf */
function buildStoragePath(year, month, version) {
  return `${year}/${String(month).padStart(2, '0')}/v${version}.pdf`;
}

/* ── Queries ─────────────────────────────────────────────────────────────── */

/**
 * Obtiene todos los períodos (abiertos y cerrados) desde enero 2026,
 * con el último cierre asociado si existe.
 */
export async function obtenerPeriodos() {
  const { data, error } = await supabase
    .from('periodos_contables')
    .select(`
      id_periodo, year, month, estado, cerrado_por, cerrado_en, motivo_reapertura,
      persona_cerro:cerrado_por ( nombre ),
      cierres:cierres_periodo ( id_cierre, version, cerrado_en, hash_sha256, url_storage, bytes_pdf )
    `)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Obtiene períodos del pasado que están abiertos (para el banner).
 * Excluye el mes actual.
 */
export async function obtenerPeriodosPendientes() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const { data, error } = await supabase
    .from('periodos_contables')
    .select('id_periodo, year, month')
    .eq('estado', 'abierto')
    .or(`year.lt.${anioActual},and(year.eq.${anioActual},month.lt.${mesActual})`)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Valida si un período puede cerrarse. Retorna el checklist de salud.
 * El campo `bloqueante` indica si hay errores críticos que impiden el cierre.
 */
export async function validarCierre(year, month) {
  const { data, error } = await supabase.rpc('fn_validar_cierre', {
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return data;
}

/**
 * Cierra un período:
 * 1. Determina versión y calcula SHA-256 del PDF (incorporando hash anterior si es v2+).
 * 2. Sube PDF a Storage.
 * 3. Llama fn_cerrar_periodo (atómica).
 * 4. Si fn_cerrar_periodo falla, elimina el archivo de Storage (cleanup).
 *
 * @param {{ year, month, idPersona, pdfBlob, snapshotKpis, checklistSalud }} params
 * @returns {{ ok, id_cierre, version }}
 */
export async function cerrarPeriodo({ year, month, idPersona, pdfBlob, snapshotKpis, checklistSalud }) {
  // Obtener id_periodo
  const { data: periodoData, error: periodoError } = await supabase
    .from('periodos_contables')
    .select('id_periodo')
    .eq('year', year)
    .eq('month', month)
    .single();
  if (periodoError) throw periodoError;
  const idPeriodo = periodoData.id_periodo;

  // Determinar versión previa para hash chain
  const { data: existentes } = await supabase
    .from('cierres_periodo')
    .select('version, hash_sha256')
    .eq('id_periodo', idPeriodo)
    .order('version', { ascending: false })
    .limit(1);

  const version = ((existentes?.[0]?.version) || 0) + 1;
  const hashAnterior = existentes?.[0]?.hash_sha256 || null;

  // Calcular SHA-256 (incorpora hash anterior para cadena de integridad)
  const arrayBuffer = await pdfBlob.arrayBuffer();
  let hashInput = arrayBuffer;
  if (hashAnterior) {
    const sep = new TextEncoder().encode('|' + hashAnterior);
    const combined = new Uint8Array(arrayBuffer.byteLength + sep.byteLength);
    combined.set(new Uint8Array(arrayBuffer), 0);
    combined.set(sep, arrayBuffer.byteLength);
    hashInput = combined.buffer;
  }
  const hash = await sha256(hashInput);
  const storagePath = buildStoragePath(year, month, version);

  // Subir PDF al bucket
  const { error: uploadError } = await supabase.storage
    .from('cierres-mensuales')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadError) throw new Error('Error subiendo PDF: ' + uploadError.message);

  // Llamar RPC atómica — si falla, hacer cleanup del archivo
  const { data, error } = await supabase.rpc('fn_cerrar_periodo', {
    p_year:            year,
    p_month:           month,
    p_id_persona:      idPersona,
    p_hash_sha256:     hash,
    p_url_storage:     storagePath,
    p_snapshot_kpis:   snapshotKpis,
    p_checklist_salud: checklistSalud,
    p_bytes_pdf:       pdfBlob.size,
  });

  if (error) {
    await supabase.storage.from('cierres-mensuales').remove([storagePath]);
    throw error;
  }

  return data;
}

/**
 * Reabre un período cerrado. Requiere motivo obligatorio.
 * La validación del PIN la hace el llamador antes de invocar esta función.
 */
export async function reabrirPeriodo({ idPeriodo, motivo, idPersona }) {
  const { error } = await supabase.rpc('fn_reabrir_periodo', {
    p_id_periodo: idPeriodo,
    p_motivo:     motivo,
    p_id_persona: idPersona,
  });
  if (error) throw error;
}

/**
 * Genera una URL firmada (presigned) para descargar el PDF de un cierre.
 * La URL expira en 1 hora.
 */
export async function descargarPdfCierre(urlStorage) {
  const { data, error } = await supabase.storage
    .from('cierres-mensuales')
    .createSignedUrl(urlStorage, 3600);
  if (error) throw error;
  return data.signedUrl;
}
