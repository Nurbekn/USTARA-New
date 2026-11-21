// Shared profile-name policy. No browser APIs, so both UI and tests can reuse it.
export function normalizeProfilePart(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function profilePartError(value) {
  if (typeof value !== 'string') return 'Ism yoki familiyani to‘g‘ri kiriting.';
  const text = normalizeProfilePart(value);
  if (!text || Array.from(text).length > 80
    || !/^[\p{L}\p{M}][\p{L}\p{M} '\u2018\u2019\u02bb\u02bc-]*$/u.test(text)) {
    return '1–80 belgidan iborat ism kiriting. Harflar, bo‘shliq, apostrof va chiziqcha mumkin.';
  }
  return '';
}

export function canonicalProfileNames(firstName, lastName) {
  const firstError = profilePartError(firstName);
  const lastError = profilePartError(lastName);
  if (firstError || lastError) {
    const error = new Error('Ism va familiyani to‘g‘ri kiriting.');
    error.fields = { ...(firstError ? { firstName: firstError } : {}), ...(lastError ? { lastName: lastError } : {}) };
    throw error;
  }
  return { firstName: normalizeProfilePart(firstName), lastName: normalizeProfilePart(lastName) };
}
