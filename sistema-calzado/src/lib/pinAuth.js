import bcrypt from 'bcryptjs';
import { supabase } from '../api/supabase';

const ROUNDS = 10;

export async function hashPin(plain) {
  if (plain == null || String(plain).length === 0) return null;
  return bcrypt.hash(String(plain), ROUNDS);
}

/**
 * Fetches the persona row by id and verifies the entered PIN.
 * Returns true if the PIN matches, false otherwise.
 */
export async function verificarPin(idPersona, enteredPin) {
  const { data, error } = await supabase
    .from('personas_tienda')
    .select('pin, pin_hash')
    .eq('id_persona', idPersona)
    .single();
  if (error || !data) return false;
  return verifyPersonaPin(data, enteredPin);
}

export async function verifyPersonaPin(personaRow, enteredPin) {
  if (!personaRow || enteredPin == null) return false;
  const s = String(enteredPin);
  if (personaRow.pin_hash && String(personaRow.pin_hash).length > 0) {
    try {
      return await bcrypt.compare(s, personaRow.pin_hash);
    } catch {
      return false;
    }
  }
  if (personaRow.pin != null && personaRow.pin !== '') {
    return String(personaRow.pin) === s;
  }
  return false;
}
