// A guest draft is not a reservation or a slot hold. Only whitelisted
// service identifiers/date/time are stored in this browser tab for 5 minutes.
export const DRAFT_KEY = 'ustara:booking-draft-v1';
export const DRAFT_TTL_MS = 5 * 60 * 1000;
const MAX_STORED_LENGTH = 2048;
function browserStorage() {
  try { return globalThis.sessionStorage ?? null; }
  catch { return null; } // SecurityError in restricted browsers
}
const FIELDS = ['version', 'barberId', 'serviceIds', 'date', 'time', 'createdAt'];
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):(?:[0-5][05])$/;
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
function validDay(value) {
  if (typeof value !== 'string' || !dayPattern.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
function validDraft(draft, now) {
  // A corrupted or manually edited storage value must never return JWT/PII
  // extras or turn non-plain objects into arbitrary app state.
  return draft !== null && typeof draft === 'object' && !Array.isArray(draft)
    && Object.keys(draft).length === FIELDS.length
    && Object.keys(draft).every(key => FIELDS.includes(key))
    && Number.isSafeInteger(now) && now >= 0
    && draft.version === 1 && positive(draft.barberId)
    && Array.isArray(draft.serviceIds) && draft.serviceIds.length > 0 && draft.serviceIds.length <= 20
    && draft.serviceIds.every(positive) && new Set(draft.serviceIds).size === draft.serviceIds.length
    && validDay(draft.date) && typeof draft.time === 'string'
    && (draft.time === '' || timePattern.test(draft.time))
    && Number.isSafeInteger(draft.createdAt) && draft.createdAt >= 0 && draft.createdAt <= now
    && now - draft.createdAt <= DRAFT_TTL_MS;
}
export function clearBookingDraft(storage = browserStorage()) {
  try { storage?.removeItem(DRAFT_KEY); } catch { /* private mode */ }
}
export function readBookingDraft(storage = browserStorage(), now = Date.now()) {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    if (typeof raw !== 'string' || raw.length > MAX_STORED_LENGTH) {
      clearBookingDraft(storage);
      return null;
    }
    const draft = JSON.parse(raw);
    if (!validDraft(draft, now)) { clearBookingDraft(storage); return null; }
    // Return a fresh, allowlisted value, never the parsed storage object.
    return { version: 1, barberId: draft.barberId, serviceIds: [...draft.serviceIds],
      date: draft.date, time: draft.time, createdAt: draft.createdAt };
  } catch { clearBookingDraft(storage); return null; }
}
export function saveBookingDraft(selection, storage = browserStorage(), now = Date.now()) {
  if (!selection || typeof selection !== 'object') return false;
  if (!storage || typeof storage.setItem !== 'function') return false;
  const previous = readBookingDraft(storage, now);
  const draft = { version: 1, barberId: selection.barberId,
    serviceIds: selection.serviceIds, date: selection.date, time: selection.time ?? '', createdAt: now };
  if (!validDraft(draft, now)) return false;
  if (previous && previous.barberId === draft.barberId
    && previous.date === draft.date && previous.time === draft.time
    && JSON.stringify(previous.serviceIds) === JSON.stringify(draft.serviceIds)) return true;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    // A silent no-op storage implementation must never produce a "saved" badge.
    const written = readBookingDraft(storage, now);
    return !!written && written.barberId === draft.barberId
      && written.date === draft.date && written.time === draft.time
      && JSON.stringify(written.serviceIds) === JSON.stringify(draft.serviceIds);
  } catch { return false; }
}
// Deselecting the last service must not restore stale selections. Do not
// erase a separate barber's draft when the user merely browses a new page.
export function clearBookingDraftForBarber(barberId, storage = browserStorage(), now = Date.now()) {
  const existing = readBookingDraft(storage, now);
  if (existing?.barberId !== barberId) return false;
  clearBookingDraft(storage);
  return true;
}
// Revalidate saved selections against the *current* catalog and the dates
// actually displayed. A valid five-minute draft may still have stale data.
export function restoreBookingDraft(draft, barberId, currentServiceIds, allowedDates) {
  if (!draft || draft.barberId !== barberId || !Array.isArray(draft.serviceIds)
      || !draft.serviceIds.length || draft.serviceIds.length > 20
      || !draft.serviceIds.every(positive) || !Array.isArray(currentServiceIds)
      || !Array.isArray(allowedDates) || !allowedDates.includes(draft.date)) return null;
  const available = new Set(currentServiceIds.filter(positive));
  return draft.serviceIds.every(id => available.has(id)) ? draft : null;
}
export function bookingDraftResumePath(storage = browserStorage(), now = Date.now()) {
  const draft = readBookingDraft(storage, now);
  return draft ? `/user/barbers/${draft.barberId}` : null;
}
