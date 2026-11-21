// Backend credentials and session metadata stay in this browser tab.
import { clearRegistration } from "./registration";
const SESSION_KEY = "ustara-session";
const ACCOUNT_KEY = "ustara-account";
const CHANGE_EVENT = "ustara-session-changed";
const ACCESS_TOKEN_KEY = "ustara-api-access-token";
const LOGOUT_EVENT_KEY = "ustara-logout-event";
export const isValidPhone = (phone) => typeof phone === "string" && /^\+998\d{9}$/.test(phone);
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function parse(raw) {
  try {
    const value = JSON.parse(raw);
    return value && ["customer", "barber"].includes(value.role) && isValidPhone(value.phone) ? value : null;
  } catch { return null; }
}
function validBackendSession(value, token) {
  try {
    if (value?.authenticated !== true || value.authSource !== "backend" || !token
      || !Number.isFinite(value.tokenExpiresAt) || value.tokenExpiresAt <= Date.now()) return false;
    const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    // UI consistency only. JWT signatures and access rights are checked by APIs.
    return Number.isInteger(value.accountId) && value.accountId > 0
      && Number.isInteger(value.profileId) && value.profileId > 0
      && payload.id === value.accountId && payload.profileId === value.profileId
      && payload.role === value.role && payload.exp * 1000 === value.tokenExpiresAt;
  } catch { return false; }
}
export function getSessionSnapshot() {
  try {
    // Also restore older OTP sessions whose non-secret metadata was persisted
    // locally; the JWT must still exist in this tab and match every identity.
    const raw = sessionStorage.getItem(SESSION_KEY) || read(SESSION_KEY);
    if (validBackendSession(parse(raw), sessionStorage.getItem(ACCESS_TOKEN_KEY))) return raw;
    // Never retain a JWT after it has expired or stopped matching session metadata.
    // Avoid emitting another change event from inside a subscription callback.
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  } catch { return null; }
}
export function getSession() {
  const value = parse(getSessionSnapshot());
  if (!value) return null;
  try { return { ...value, token: sessionStorage.getItem(ACCESS_TOKEN_KEY) }; } catch { return null; }
}
// Retained for the separate password-reset UI, never used to authenticate login.
export const getAccount = () => parse(read(ACCOUNT_KEY)) || parse(read(SESSION_KEY));
export function setSession(session) {
  if (!parse(JSON.stringify(session)) || !validBackendSession(session, session.token)) throw new Error("Invalid backend session");
  const { role, phone, setupDone, token, ...metadata } = session;
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role, phone, authSource: "backend",
      ...(role === "barber" ? { setupDone: !!setupDone } : {}) }));
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...metadata, role, phone,
      ...(role === "barber" ? { setupDone: !!setupDone } : {}) }));
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // A partial storage write must not leave a usable authenticated session.
    try { sessionStorage.removeItem(ACCESS_TOKEN_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be unavailable. */ }
    throw new Error("Sessiyani saqlab bo‘lmadi. Brauzer saqlash ruxsatlarini tekshiring.");
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function clearSession({ notify = true, broadcast = true } = {}) {
  // Best-effort cleanup: unavailable storage must not prevent other stores being cleared.
  try { clearRegistration(); } catch { /* Ignore storage restrictions. */ }
  for (const [store, keys] of [
    [sessionStorage, [ACCESS_TOKEN_KEY, SESSION_KEY]],
    [localStorage, [SESSION_KEY, ACCOUNT_KEY]],
  ]) {
    for (const key of keys) {
      try { store.removeItem(key); } catch { /* Keep clearing remaining keys. */ }
    }
  }
  // A pending booking from the old account must not be retried after logout.
  try { sessionStorage.removeItem('ustara:pending-booking-request'); } catch { /* Storage unavailable. */ }
  if (broadcast) {
    try { localStorage.setItem(LOGOUT_EVENT_KEY, `${Date.now()}:${Math.random()}`); }
    catch { /* The current tab has still cleared its own credentials. */ }
  }
  if (notify) window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeSession(listener) {
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    const session = parse(getSessionSnapshot());
    if (session) timer = setTimeout(refresh, Math.min(2147483647, Math.max(1, session.tokenExpiresAt - Date.now() + 25)));
    listener();
  };
  const storage = (event) => {
    if (event.key === LOGOUT_EVENT_KEY) {
      // A logout from another tab must invalidate this tab's private session too.
      clearSession({ notify: true, broadcast: false });
      return;
    }
    if (event.key === SESSION_KEY || event.key === ACCESS_TOKEN_KEY || event.key === null) refresh();
  };
  window.addEventListener(CHANGE_EVENT, refresh);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", refresh);
  refresh();
  return () => {
    clearTimeout(timer);
    window.removeEventListener(CHANGE_EVENT, refresh);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", refresh);
  };
}
export const dashboardPath = (session) => session?.role === "customer" ? "/user" : session?.role === "barber" ? (session.setupDone ? "/barber" : "/barber/setup") : "/login";
