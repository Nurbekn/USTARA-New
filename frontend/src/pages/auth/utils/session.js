// ==========================================================
// session.js — MOCK login session (localStorage)
//
// Until the backend (JWT) exists, this remembers who signed up
// in this browser: { role: "customer" | "barber", phone, setupDone }.
// Replace the three functions with real token handling later.
// ==========================================================
const KEY = "ustara-session";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export const setSession = (session) =>
  localStorage.setItem(KEY, JSON.stringify(session));

export const clearSession = () => localStorage.removeItem(KEY);
