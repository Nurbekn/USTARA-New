import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class MemoryStorage {
  constructor() { this.data = new Map(); this.failRemove = false; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { if (this.failRemove) throw new Error('Storage denied'); this.data.delete(key); }
}
const browser = new EventTarget();
globalThis.window = browser;
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.atob = (value) => Buffer.from(value, 'base64').toString('utf8');
// The Vite module has extensionless imports. Evaluate its unmodified logic with a
// minimal ESM export/import shim, rather than changing production imports for Node.
const source = readFileSync(new URL('../src/pages/auth/utils/session.js', import.meta.url), 'utf8')
  .replace(/^import \{ clearRegistration \} from .*;$/m, 'const clearRegistration = () => {};')
  .replace(/export (const|function) /g, '$1 ');
const api = runInNewContext(`${source}\n({ clearSession, getSession, getSessionSnapshot, setSession, subscribeSession })`,
  { window, localStorage, sessionStorage, Event, Date, Math, JSON, Number, String, setTimeout, clearTimeout, atob });
const { clearSession, getSession, getSessionSnapshot, setSession, subscribeSession } = api;

function loginFixture() {
  const exp = Math.floor(Date.now() / 1000) + 120;
  const token = `header.${Buffer.from(JSON.stringify({ id: 18, profileId: 22, role: 'customer', exp })).toString('base64url')}.signature`;
  setSession({ role: 'customer', phone: '+998901234567', authenticated: true,
    authSource: 'backend', accountId: 18, profileId: 22, tokenExpiresAt: exp * 1000, token });
}

test('v68 logout removes account metadata as well as credentials', () => {
  loginFixture();
  assert.equal(getSession()?.role, 'customer');
  clearSession();
  assert.equal(getSession(), null);
  assert.equal(localStorage.getItem('ustara-account'), null);
  assert.equal(sessionStorage.getItem('ustara-api-access-token'), null);
});

test('v68 remote logout clears this tab without re-broadcasting', () => {
  loginFixture();
  let changes = 0;
  const unsubscribe = subscribeSession(() => { changes++; });
  const oldSignal = localStorage.getItem('ustara-logout-event');
  const e = new Event('storage');
  Object.defineProperty(e, 'key', { value: 'ustara-logout-event' });
  browser.dispatchEvent(e);
  assert.equal(getSession(), null);
  assert.equal(localStorage.getItem('ustara-logout-event'), oldSignal);
  assert.ok(changes >= 2);
  unsubscribe();
});

test('v68 invalid or expired JWT removes stale tab secrets', () => {
  loginFixture();
  sessionStorage.setItem('ustara-api-access-token', 'broken');
  assert.equal(getSessionSnapshot(), null);
  assert.equal(sessionStorage.getItem('ustara-api-access-token'), null);
  assert.equal(sessionStorage.getItem('ustara-session'), null);
});

test('v68 logout continues removing keys even if one storage operation fails', () => {
  loginFixture();
  localStorage.failRemove = true;
  assert.doesNotThrow(() => clearSession());
  assert.equal(sessionStorage.getItem('ustara-api-access-token'), null);
  assert.equal(sessionStorage.getItem('ustara-session'), null);
  localStorage.failRemove = false;
  clearSession();
});

test('v68 logout does not broadcast when explicitly disabled', () => {
  loginFixture();
  const before = localStorage.getItem('ustara-logout-event');
  clearSession({ broadcast: false });
  assert.equal(localStorage.getItem('ustara-logout-event'), before);
});
