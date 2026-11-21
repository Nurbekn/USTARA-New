import { request as apiRequest } from "../../../api/client.js";
import { PASSWORD_HINT as REGISTRATION_PASSWORD_HINT, passwordError } from "./passwordPolicy.js";
import { normalizePhone } from "./phone.js";
import { canonicalProfileNames, profilePartError } from "../../../utils/profileIdentity.js";
function validBotUrl(value) {
  return typeof value === 'string' && /^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value);
}
const KEY = "ustara-pending-registration";
const SPECIALTIES = ["barber", "cosmetolog", "stylist"];
const validTimestamp = value => Number.isSafeInteger(value) && value > 0;
const listeners = new Set();
let pending = null;
let expiryTimer;
// Share only the active registration between open same-origin tabs. Credentials
// remain in sessionStorage; no localStorage, URL or persistent cross-tab token.
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("ustara-registration") : null;
try {
  const value = JSON.parse(sessionStorage.getItem(KEY));
  // Preserve an existing tab while removing its obsolete delivery capability.
  if (/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\?start=reg_[A-Za-z0-9_-]{43}$/.test(value?.botUrl || '')) {
    value.botUrl = value.botUrl.split('?')[0];
  }
  if (validRegistrationSnapshot(value)) pending = value;
  else sessionStorage.removeItem(KEY);
} catch { /* Memory-only fallback when tab storage is unavailable. */ }

// Only accept internally coherent registration snapshots, including messages from
// other tabs. A copied/replayed BroadcastChannel event must not resurrect a
// completed or expired registration or switch to a different account.
// Incoming cross-tab state is untrusted: only accept coherent, non-credential-
// changing snapshots. The backend remains the authority for registration.
export function validRegistrationSnapshot(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!["customer", "barber"].includes(value.role)
    || (value.role === "barber" && !SPECIALTIES.includes(value.specialty))
    || !/^\+998\d{9}$/.test(value.phone)
    || !/^[0-9a-f]{64}$/.test(value.sessionToken)
    || !["otp", "verified"].includes(value.stage)
    || !validTimestamp(value.sessionExpiresAt)
    || !validTimestamp(value.resendAt)
    || (value.deliveryPending !== true && value.deliveryPending !== false)) return false;
  if (value.deliveryPending === true) {
    if (value.stage !== "otp" || value.otpExpiresAt !== null
      || !validBotUrl(value.botUrl)
      || (value.deliveryRetryAt !== undefined && !validTimestamp(value.deliveryRetryAt))) return false;
  } else if (!validTimestamp(value.otpExpiresAt)) return false;
  if (value.stage === "verified"
    && (!validTimestamp(value.completionExpiresAt) || value.deliveryPending)) return false;
  if (value.stage === "otp" && value.sessionExpiresAt <= now) return false;
  if (value.stage === "verified" && value.completionExpiresAt <= now) return false;
  if (value.block !== undefined && value.block !== null) {
    if (typeof value.block !== "object" || Array.isArray(value.block)
      || typeof value.block.adminRequired !== "boolean"
      || (value.block.until !== null && !validTimestamp(value.block.until))) return false;
  }
  return true;
}
// A valid session token cannot be used to change the account identity or
// decrease any previously observed deadline through stale tab messages.
export function canApplyRegistrationSnapshot(current, incoming, now = Date.now()) {
  if (!validRegistrationSnapshot(incoming, now)) return false;
  if (!current) return true;
  if (current.stage === "completed") return false;
  if (current.sessionToken !== incoming.sessionToken
    || current.role !== incoming.role
    || current.phone !== incoming.phone
    || (current.role === "barber" && current.specialty !== incoming.specialty)) return false;
  if (current.stage === "verified" && incoming.stage !== "verified") return false;
  if (validTimestamp(current.sessionExpiresAt)
    && incoming.sessionExpiresAt < current.sessionExpiresAt) return false;
  if (validTimestamp(current.resendAt) && incoming.resendAt < current.resendAt) return false;
  if (current.stage === "verified"
    && incoming.completionExpiresAt < current.completionExpiresAt) return false;
  if (current.stage === "otp" && incoming.stage === "otp") {
    if (current.deliveryPending === false && incoming.deliveryPending === true) return false;
    if (validTimestamp(current.otpExpiresAt) && incoming.otpExpiresAt !== null
      && incoming.otpExpiresAt < current.otpExpiresAt) return false;
    if (validTimestamp(current.deliveryRetryAt) && validTimestamp(incoming.deliveryRetryAt)
      && incoming.deliveryRetryAt < current.deliveryRetryAt) return false;
  }
  return true;
}
export const getRegistration = () => pending;
export function subscribeRegistration(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function save(value, broadcast = true) {
  const previousToken = pending?.sessionToken;
  pending = value;
  clearTimeout(expiryTimer);
  try {
    // Completed response/JWT is held in memory until handed to the auth session.
    if (value?.sessionToken && value.stage !== "completed") sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch { /* Never fall back to URLs, logs or persistent localStorage. */ }
  armExpiry();
  listeners.forEach((listener) => listener());
  if (broadcast) channel?.postMessage({ type: "state", previousToken, value: value?.stage === "completed" ? null : value });
}
if (channel) {
  channel.onmessage = ({ data }) => {
    if (data?.type === "request") {
      if (validRegistrationSnapshot(pending)) channel.postMessage({ type: "state", value: pending });
    } else if (data?.type === "state") {
      const value = data.value;
      if (value === null && data.previousToken === pending?.sessionToken) save(null, false);
      else if (canApplyRegistrationSnapshot(pending, value)) save(value, false);
    }
  };
  if (!pending) channel.postMessage({ type: "request" });
}
export const clearRegistration = () => save(null);
export const registrationPath = (value) => value?.stage === "otp" ? "/otp" : "/complete-profile";
export const registrationDeadline = (value) => value?.stage === "verified" ? value.completionExpiresAt : value?.sessionExpiresAt;
export const registrationBlocked = (value, now = Date.now()) => !!value?.block && (value.block.adminRequired || value.block.until === null || value.block.until > now);
function armExpiry() {
  if (!pending?.sessionToken) return;
  const current = pending;
  expiryTimer = setTimeout(() => {
    if (pending === current) save({ ...current, sessionToken: undefined });
  }, Math.max(0, registrationDeadline(current) - Date.now()));
}
armExpiry();
export { REGISTRATION_PASSWORD_HINT };
export const registrationPasswordError = passwordError;
export const registrationNameError = profilePartError;

export function registrationError(error) {
  if (!error || typeof error !== "object") return "So‘rov bajarilmadi. Qayta urinib ko‘ring.";
  if (error.code === 'otp_rate_limited') return 'So‘rovlar ko‘paydi. Biroz kutib qayta urinib ko‘ring.';
  if (error.code === "registration_blocked" || error.code === "sms_limit") {
    if (error.adminRequired) return "Telefon raqamingiz bloklangan. Blokdan chiqarish uchun administratorga murojaat qiling.";
    const until = new Date(error.blockedUntil);
    return Number.isFinite(until.getTime())
      ? `Kod yuborish limiti sabab raqam ${until.toLocaleString("uz-UZ")} gacha bloklangan.`
      : "Telefon raqamingiz vaqtincha bloklangan. Keyinroq qayta urinib ko‘ring.";
  }
  if (error.code === "otp_not_sent") return "Avval shu sahifadagi bot havolasini ochib kod oling.";
  if (error.code === "invalid_otp") return `Tasdiqlash kodi noto‘g‘ri.${Number.isInteger(error.attemptsRemaining) ? ` ${error.attemptsRemaining} ta urinish qoldi.` : ""}`;
  if (error.code === "otp_expired") return "Kodning 1 daqiqalik muddati tugadi. Yangi kod so‘rang.";
  if (error.code === "invalid_session") return "Ro‘yxatdan o‘tish sessiyasi yangilangan yoki muddati tugagan. Shu oynada qayta kod oling.";
  if (error.code === "completion_expired") return "Ro‘yxatdan o‘tish muddati tugagan. Jarayonni qayta boshlang.";
  if (error.code === "resend_too_soon") return "Yangi kod so‘rashdan oldin kutish vaqti tugashini kuting.";
  if (error.code === "telegram_contact_required") return "Telegram botni oching va o‘z telefon kontaktingizni ulashing. Keyin kod olishni qayta bosing.";
  if (error.code === "telegram_otp_unavailable") return "Telegram orqali kod yuborilmadi. Botni ochib qayta urinib ko‘ring yoki administratorga murojaat qiling.";
  if (error.code === "sms_unavailable" || error.code === "otp_unavailable") return "Tasdiqlash kodi xizmati hozir ishlamayapti. Keyinroq qayta urinib ko‘ring.";
  if (error.code === "phone_exists" || error.code === "registration_conflict") return "Bu telefon raqamida hisob mavjud. Kirish sahifasidan foydalaning.";
  return typeof error.message === "string" && error.message.trim()
    ? error.message : "So‘rov bajarilmadi. Qayta urinib ko‘ring.";
}
export function otpError(error) {
  if (!error || typeof error !== "object") return "So‘rov bajarilmadi. Qayta urinib ko‘ring";
  if (error.status === 429) return "Birozdan keyin qayta urinib ko‘ring";
  if (["network_error", "request_timeout", "request_aborted"].includes(error.code)) return "Internet aloqasini tekshiring";
  if (error.code === "invalid_otp") return "Kod noto‘g‘ri";
  if (error.code === "otp_expired") return "Kod muddati tugagan";
  if (error.code === "otp_not_sent") return "Botni oching va o‘z kontaktingizni ulashing";
  if (["registration_blocked", "sms_limit"].includes(error.code)) return "Raqam bloklangan. Administratorga murojaat qiling";
  if (["invalid_session", "completion_expired"].includes(error.code)) return "Sessiya tugagan. Qayta boshlang";
  return "So‘rov bajarilmadi. Qayta urinib ko‘ring";
}
async function request(action, body) {
  try {
    const data = await apiRequest("POST", `/api/auth/registration/${action}`, { body });
    if (data === null) throw new Error("Serverdan javob olinmadi. Keyinroq qayta urinib ko‘ring.");
    return data;
  } catch (error) {
    let message;
    if (["network_error", "request_timeout", "request_aborted"].includes(error.code)) {
      message = "Server bilan aloqa o‘rnatilmadi. Internet va ulanishni tekshirib, qayta urinib ko‘ring.";
    } else if (error.code === "invalid_response"
      || (error.code === "http_error" && error.message === "Serverdan JSON javob olinmadi.")) {
      message = "Serverdan javob olinmadi. Keyinroq qayta urinib ko‘ring.";
    }
    const result = message ? Object.assign(new Error(message, { cause: error }), {
      status: error.status, code: error.code, metadata: error.metadata,
    }) : error;
    // Existing flow/UI reads these fields directly; retain all other backend
    // metadata in ApiError.metadata without changing registration state logic.
    for (const field of ["adminRequired", "blockedUntil", "attemptsRemaining", "retryAfter"]) {
      result[field] = error.metadata?.[field];
    }
    throw result;
  }
}
const deadline = (value) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Serverdan ro‘yxatdan o‘tish muddati olinmadi.");
  return timestamp;
};
function resendAt(data) {
  if (data.resendAvailableAt && data.serverNow) {
    return Date.now() + Math.max(0, deadline(data.resendAvailableAt) - deadline(data.serverNow));
  }
  if (!Number.isFinite(data.resendAfter) || data.resendAfter < 0) throw new Error("Serverdan kutish vaqti olinmadi.");
  return Date.now() + data.resendAfter * 1000;
}
function sent(data) {
  if (data.deliveryPending === true) {
    if (!validBotUrl(data.botUrl)) throw new Error('Serverdan bot havolasi olinmadi.');
    const retryAfter = data.deliveryRetryAfter ?? 0;
    if (!Number.isFinite(retryAfter) || retryAfter < 0) throw new Error('Serverdan kod olish vaqti olinmadi.');
    return { sessionExpiresAt: deadline(data.sessionExpiresAt), otpExpiresAt: null, resendAt: resendAt(data), retryAt: 0,
      deliveryPending: true, botUrl: data.botUrl, deliveryRetryAt: Date.now() + retryAfter * 1000 };
  }
  if (!Number.isFinite(data.resendAfter) || data.resendAfter < 0) throw new Error("Serverdan kutish vaqti olinmadi.");
  return { sessionExpiresAt: deadline(data.sessionExpiresAt), otpExpiresAt: deadline(data.otpExpiresAt), resendAt: resendAt(data), retryAt: 0, deliveryPending: false };
}
export async function startRegistration({ phone, password, role, specialty }) {
  if (!["customer", "barber"].includes(role)) throw new Error("Hisob turi noto‘g‘ri.");
  if (role === "barber" && !SPECIALTIES.includes(specialty)) throw new Error("Mutaxassislikni tanlang.");
  const canonicalPhone = normalizePhone(phone);
  const data = await request("start", { phone: canonicalPhone, password, role, ...(role === "barber" ? { specialty } : {}) });
  if (!/^[0-9a-f]{64}$/.test(data.sessionToken)) throw new Error("Serverdan registration session olinmadi.");
  // testOtp is intentionally ignored: there is no public/fixed OTP in this UI.
  save({ phone: canonicalPhone, role, specialty, sessionToken: data.sessionToken, stage: "otp",
    restarted: data.restarted === true, ...sent(data) });
}
async function sessionRequest(action, extra = {}) {
  const current = pending;
  if (!current?.sessionToken) throw Object.assign(new Error("Ro‘yxatdan o‘tishni qayta boshlang."), { code: "invalid_session" });
  try {
    const data = await request(action, { sessionToken: current.sessionToken, ...extra });
    if (pending !== current) throw new Error("Ro‘yxatdan o‘tish sessiyasi yangilandi. Joriy so‘rov bilan davom eting.");
    return data;
  } catch (error) {
    if (pending === current) {
      if (error.status === 423) save({ ...current, block: { adminRequired: !!error.adminRequired, until: Date.parse(error.blockedUntil) || null } });
      if (error.status === 429 && Number.isFinite(error.retryAfter)) {
        const retryAt = Date.now() + error.retryAfter * 1000;
        save({ ...current, resendAt: Math.max(current.resendAt, retryAt), retryAt });
      }
      if (["invalid_session", "completion_expired"].includes(error.code)) {
        if (action === "complete") save({ ...current, sessionToken: undefined, completionExpiresAt: 0, terminalError: registrationError(error) });
        else clearRegistration();
      }
    }
    throw error;
  }
}
export async function refreshRegistration() {
  const current = pending;
  if (!current?.sessionToken || current.stage !== 'otp') return;
  const data = await sessionRequest('status');
  if (data.deliveryPending === true) {
    // Older servers may omit cooldown metadata while waiting.
    if (data.resendAvailableAt && data.serverNow) save({ ...current, resendAt: resendAt(data) });
    return;
  }
  if (data.deliveryPending !== false) throw new Error('Kod yuborish holati olinmadi.');
  const expiresAt = deadline(data.otpExpiresAt);
  if (!Number.isFinite(data.resendAfter) || data.resendAfter < 0) throw new Error('Kod kutish vaqti olinmadi.');
  save({ ...current, deliveryPending: false, otpExpiresAt: expiresAt,
    sessionExpiresAt: deadline(data.sessionExpiresAt), resendAt: resendAt(data) });
}
export async function resendRegistration() {
  if (pending?.stage !== "otp") throw new Error("Kod bosqichi yakunlangan.");
  const data = await sessionRequest("resend");
  if (pending?.stage !== "otp") throw new Error("Ro‘yxatdan o‘tish bosqichi o‘zgardi.");
  save({ ...pending, ...sent(data), block: null });
}
export async function verifyRegistration(otp) {
  if (pending?.stage !== "otp") throw new Error("Kod allaqachon tasdiqlangan.");
  const data = await sessionRequest("verify", { otp });
  if (pending?.stage !== "otp") throw new Error("Ro‘yxatdan o‘tish bosqichi o‘zgardi.");
  save({ ...pending, stage: "verified", completionExpiresAt: deadline(data.completionExpiresAt) });
}
export async function completeRegistration(firstName, lastName) {
  if (pending?.stage === "completed") return pending.result;
  const names = canonicalProfileNames(firstName, lastName);
  const data = await sessionRequest("complete", names);
  const profile = data[pending.role];
  if (typeof data.token !== "string" || !Number.isInteger(profile?.id) || profile.id <= 0 || profile.phone !== pending.phone
    || profilePartError(profile.first_name) || profilePartError(profile.last_name)
    || (pending.role === "barber" && !SPECIALTIES.includes(profile.specialty))) throw new Error("Account javobini qayta ishlashda xatolik yuz berdi.");
  // Discard the consumed registration credential. Cache the result in memory so
  // a local storage failure can be retried without creating another account.
  const { sessionToken: consumed, ...context } = pending;
  void consumed;
  save({ ...context, stage: "completed", result: data });
  return data;
}

export function registrationSession(result, context) {
  try {
    const encoded = result.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    const profile = result[context.role];
    // Decoding supplies UI identity only; API authorization remains server-side.
    if (payload.role !== context.role || !Number.isInteger(payload.id) || payload.id <= 0
      || payload.profileId !== profile.id || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new Error();
    return { role: context.role, phone: profile.phone, accountId: payload.id, profileId: profile.id,
      authSource: "backend", authenticated: true, token: result.token, tokenExpiresAt: payload.exp * 1000,
      ...(context.role === "barber" ? { setupDone: false, verification_status: result.verification_status } : {}) };
  } catch { throw new Error("Server sessiyasini ochib bo‘lmadi. Qayta urinib ko‘ring."); }
}
