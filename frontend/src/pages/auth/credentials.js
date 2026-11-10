// Local test authentication only. Replace with server-side password handling.
const ITERATIONS = 210000;
const keyFor = (phone) => `ustara-password:${phone}`;
const encode = (bytes) => btoa(String.fromCharCode(...bytes));
const decode = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export function validPassword(value) {
  const chars = Array.from(value);
  const digits = chars.filter((char) => /^[0-9]$/.test(char)).length;
  const letters = chars.filter((char) => /^[A-Za-z]$/.test(char)).length;
  const punctuation = chars.filter((char) => /^[!-~]$/.test(char) && !/[A-Za-z0-9]/.test(char)).length;
  return digits >= 8 && letters >= 1
    && chars.length === digits + letters + punctuation;
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return encode(new Uint8Array(bits));
}

export async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: encode(salt), digest: await derive(password, salt) };
}

export function savePasswordRecord(phone, record) {
  // Never persist the original password, including in router history state.
  if (!/^\+998\d{9}$/.test(phone) || !record || !/^[A-Za-z0-9+/]{22}==$/.test(record.salt) || !/^[A-Za-z0-9+/]{43}=$/.test(record.digest)) throw new Error('Invalid password record');
  localStorage.setItem(keyFor(phone), JSON.stringify(record));
}

export function hasPasswordRecord(phone) {
  return localStorage.getItem(keyFor(phone)) !== null;
}

export async function verifyPassword(phone, password) {
  const record = JSON.parse(localStorage.getItem(keyFor(phone)));
  if (!record?.salt || !record?.digest) return false;
  return await derive(password, decode(record.salt)) === record.digest;
}
