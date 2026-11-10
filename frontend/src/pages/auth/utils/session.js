// TEST authentication only. localStorage and the public 12345 code are forgeable.
// Production must use server-verified sessions and authorize every API request.
const SESSION_KEY = "ustara-session";
const ACCOUNT_KEY = "ustara-account";
const CHANGE_EVENT = "ustara-session-changed";
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
export const getSessionSnapshot = () => read(SESSION_KEY);
export function getSession() {
  const value = parse(getSessionSnapshot());
  return value?.authenticated === true ? value : null;
}
// The local test account survives logout; it is NOT an authenticated session.
// Legacy records can be used to sign in again but cannot open protected pages.
export const getAccount = () => parse(read(ACCOUNT_KEY)) || parse(read(SESSION_KEY));
export function setSession(session) {
  if (!parse(JSON.stringify(session)) || session.authenticated !== true) throw new Error("Invalid authenticated session");
  const { role, phone, setupDone } = session;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role, phone, ...(role === 'barber' ? {setupDone: !!setupDone} : {}) }));
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeSession(listener) {
  const storage = (event) => { if (event.key === SESSION_KEY || event.key === null) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener('storage', storage); };
}
export const dashboardPath = (session) => session?.role === "customer" ? "/user" : session?.role === "barber" ? (session.setupDone ? "/barber" : "/barber/setup") : "/login";
