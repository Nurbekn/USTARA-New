import { verifyBookingReceipt } from "./bookingReceipt.js";
import { request } from "../../../api/client.js";

export async function createBooking({ barberId, serviceId, serviceIds, date, time, token, signal, requestId, expectedTotalPrice, expectedDurationMinutes, expectedCancellationPolicy, customerProfileId }) {
  const ids = serviceIds ?? [serviceId];
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) throw new Error('Xizmatlarni tanlang.');
  serviceId = ids[0];
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(`${date}T00:00:00Z`) : NaN;
  if (!Number.isSafeInteger(barberId) || barberId <= 0 || barberId > 2147483647 || !Number.isSafeInteger(serviceId) || serviceId <= 0 || serviceId > 2147483647
    || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== date
    || typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || Number(time.slice(3)) % 5 !== 0) {
    throw new Error("Sartarosh, xizmat, sana yoki vaqt noto‘g‘ri.");
  }
  if (!token) throw Object.assign(new Error("Qayta tizimga kiring."), { status: 401 });
  if (expectedTotalPrice !== undefined &&
    !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(expectedTotalPrice))) {
    throw new Error('Narxni qayta tekshiring.');
  }
  if (expectedDurationMinutes !== undefined && (!Number.isSafeInteger(expectedDurationMinutes) || expectedDurationMinutes <= 0
    || expectedDurationMinutes > 1200 || expectedDurationMinutes % 5 !== 0)) {
    throw new Error('Xizmat davomiyligini qayta tekshiring.');
  }
  if (expectedCancellationPolicy !== undefined && (!expectedCancellationPolicy ||
    typeof expectedCancellationPolicy !== 'object' || Array.isArray(expectedCancellationPolicy) ||
    !(expectedCancellationPolicy.cutoff_minutes === null ||
      (Number.isSafeInteger(expectedCancellationPolicy.cutoff_minutes) &&
        expectedCancellationPolicy.cutoff_minutes >= 0 && expectedCancellationPolicy.cutoff_minutes <= 10080)) ||
    typeof expectedCancellationPolicy.text !== 'string' || expectedCancellationPolicy.text.length > 280)) {
    throw new Error('Bekor qilish qoidalarini qayta tekshiring.');
  }
  if (requestId !== undefined && (typeof requestId !== 'string' || !REQUEST_ID.test(requestId))) {
    throw new Error('Bron so‘rovi identifikatori noto‘g‘ri.');
  }
  const bookingTime = `${date}T${time}:00+05:00`;
  // The API client accepts ONE options object. Token and AbortSignal must
  // travel inside it; positional arguments are ignored and send an unauthenticated POST.
  const result = await request("POST", "/api/bookings", {
    body: { barber_id: barberId, ...(serviceIds ? { service_ids: ids } : { service_id: serviceId }), booking_time: bookingTime, ...(expectedTotalPrice !== undefined ? { expected_total_price: expectedTotalPrice } : {}),
      ...(expectedDurationMinutes !== undefined ? { expected_duration_minutes: expectedDurationMinutes } : {}),
      ...(expectedCancellationPolicy !== undefined ? { expected_cancellation_policy: expectedCancellationPolicy } : {}), ...(requestId ? { request_id: requestId } : {}) },
    token, signal,
  });
  verifyBookingReceipt(result?.data, {
    barberId, serviceId, serviceIds: ids, bookingTime,
    expectedTotalPrice, expectedDurationMinutes, customerProfileId,
  });
  return result;
}

// Share the active promise: rapid clicks cannot create a second POST while
// React is still rendering its disabled submit button.
// A retry after a lost HTTP response must retain the SAME key. Session storage
// survives route reloads in this tab, without storing the JWT or private data.
const ATTEMPT_STORAGE_KEY = 'ustara:pending-booking-request';
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validSelectionSignature(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const [barberId, ids, date, time, ...extra] = JSON.parse(value);
    if (extra.length || !Number.isSafeInteger(barberId) || barberId <= 0 || barberId > 2147483647 ||
      !Array.isArray(ids) || !ids.length || ids.length > 20 ||
      ids.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647) ||
      new Set(ids).size !== ids.length ||
      typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date ||
      typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      Number(time.slice(3)) % 5 !== 0) return false;
    return true;
  } catch { return false; }
}
function validAttempt(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && validSelectionSignature(value.signature)
    && REQUEST_ID.test(value.requestId)
    && (value.accountId === undefined || (Number.isSafeInteger(value.accountId) && value.accountId > 0));
}
function readAttempt() {
  try {
    const attempt = JSON.parse(globalThis.sessionStorage?.getItem(ATTEMPT_STORAGE_KEY) || 'null');
    return validAttempt(attempt) ? attempt : null;
  } catch { return null; }
}
function writeAttempt(attempt) {
  try {
    if (attempt) globalThis.sessionStorage?.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
    else globalThis.sessionStorage?.removeItem(ATTEMPT_STORAGE_KEY);
  } catch { /* In-memory attempt still protects this page. */ }
}
// GET is observation only; a missing result does not prove the POST rolled back.
export async function checkBookingRecovery({requestId,token,signal,customerProfileId,expectedSelection}) {
  if (!REQUEST_ID.test(requestId || '') || !token ||
    (expectedSelection !== undefined && !validSelectionSignature(expectedSelection))) {
    throw new Error('Bron so‘rovini tekshirib bo‘lmadi.');
  }
  const result = await request('GET', `/api/bookings/recovery/${requestId}`, {token,signal});
  if (!result || typeof result.found !== 'boolean' ||
      (result.found === false && (result.uncertain !== true || result.data != null)) ||
      (result.found && result.uncertain === true) ||
      (result.found && (!Number.isSafeInteger(result.data?.id) || result.data.id <= 0 || result.data.id > 2147483647
        || !Number.isSafeInteger(result.data?.barber_id) || result.data.barber_id <= 0
        || !Number.isFinite(Date.parse(result.data?.booking_time))
        || !Number.isSafeInteger(result.data?.duration_minutes) || result.data.duration_minutes <= 0
        || !['pending','confirmed','completed','cancelled','rejected'].includes(result.data?.status)))) {
    throw new Error('Server bron holatini noto‘g‘ri qaytardi.');
  }
  if (result.found) {
    try {
      const [barberId, serviceIds, date, time] = expectedSelection ? JSON.parse(expectedSelection) : [];
      verifyBookingReceipt(result.data, {customerProfileId,
        ...(expectedSelection ? {barberId, serviceIds, serviceId:serviceIds[0],
          bookingTime:`${date}T${time}:00+05:00`} : {})});
    }
    catch { throw new Error('Server bron holatini noto‘g‘ri qaytardi. Bronlarim ro‘yxatini tekshiring.'); }
  }
  return result;
}
export function createBookingSubmitter() {
  let active, activeSignature, activeAccountId, activeToken, activeProfileId, activeQuote, pending = readAttempt();
  const submit = (selection) => {
    const signature = JSON.stringify([selection.barberId, selection.serviceIds ?? [selection.serviceId], selection.date, selection.time]);
    const accountId = Number.isSafeInteger(selection.accountId) && selection.accountId > 0 ? selection.accountId : undefined;
    // Only an exact duplicate from the same account may share an in-flight
    // response. A different booking/account must not receive its result.
    const quote = JSON.stringify([selection.expectedTotalPrice, selection.expectedDurationMinutes,
      selection.expectedCancellationPolicy]);
    if (active) {
      if (signature === activeSignature && accountId === activeAccountId &&
          selection.token === activeToken && selection.customerProfileId === activeProfileId &&
          quote === activeQuote) return active;
      return Promise.reject(Object.assign(new Error('Avvalgi bron so‘rovi hali davom etmoqda. Uning natijasini kuting.'),
        {status:409,code:'booking_in_progress'}));
    }
    // Old persisted requests without owner information must never be
    // attached to a logged-in account by assumption.
    if (pending && ((accountId === undefined) !== (pending.accountId === undefined))) {
      return Promise.reject(Object.assign(new Error('Oldingi bron so‘rovining akkaunti aniqlanmadi. Bronlaringizni tekshiring.'),
        {status:409,code:'booking_recovery_owner_unknown'}));
    }
    // An earlier account's pending request must never attach to this one.
    if (pending && accountId !== undefined && pending.accountId !== undefined && pending.accountId !== accountId) {
      pending = null; writeAttempt(null);
    }
    if (pending && pending.signature !== signature) {
      return Promise.reject(Object.assign(new Error('Oldingi bron so‘rovi natijasi noma’lum. Yangi vaqt tanlashdan oldin bron holatini tekshiring.'),
        {status:409,code:'booking_recovery_required'}));
    }
    if (!pending) {
      if (typeof globalThis.crypto?.randomUUID !== 'function') {
        return Promise.reject(new Error('Xavfsiz bron so‘rovini yaratib bo‘lmadi. Brauzerni yangilang.'));
      }
      const id = globalThis.crypto.randomUUID();
      if (!REQUEST_ID.test(id)) return Promise.reject(new Error('Xavfsiz bron identifikatorini yaratib bo‘lmadi.'));
      pending = { signature, requestId: id, ...(accountId !== undefined ? {accountId} : {}) };
      writeAttempt(pending);
    }
    activeSignature = signature;
    activeAccountId = accountId;
    activeToken = selection.token;
    activeProfileId = selection.customerProfileId;
    activeQuote = quote;
    active = createBooking({ ...selection, requestId: pending.requestId }).then(
      (result) => { pending = null; writeAttempt(null); return result; },
      (error) => {
        // A definitive client rejection cannot have committed this request.
        // Retain the key for uncertain network/5xx, timeout, rate-limit cases.
        if (error?.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
          && !['booking_in_progress', 'booking_result_unknown', 'booking_recovery_required'].includes(error?.code)) {
          pending = null; writeAttempt(null);
        }
        throw error;
      },
    ).finally(() => { active = null; activeSignature = undefined; activeAccountId = undefined;
      activeToken = undefined; activeProfileId = undefined; activeQuote = undefined; });
    return active;
  };
  submit.pending = () => pending ? { ...pending } : null;
  submit.clearPending = () => {
    if (active) return false;
    pending = null; writeAttempt(null); return true;
  };
  return submit;
}
