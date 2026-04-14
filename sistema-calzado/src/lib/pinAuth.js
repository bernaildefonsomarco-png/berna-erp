import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPin(plain) {
  if (plain == null || String(plain).length === 0) return null;
  return bcrypt.hash(String(plain), ROUNDS);
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
