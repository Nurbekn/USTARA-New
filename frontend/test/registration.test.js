import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Real registration flow and API adapter, with Vite env substituted in memory.
// No .env access, server calls or browser storage outside this test fixture.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const dependency = await loadModule(new URL(match[1], url));
    source = source.replace(`from "${match[1]}"`, `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const registrationUrl = new URL("../src/pages/auth/utils/registration.js", import.meta.url);
const registration = await import(await loadModule(registrationUrl));
const phonePolicy = await import(await loadModule(new URL("../src/pages/auth/utils/phone.js", import.meta.url)));
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} });
beforeEach(() => { registration.clearRegistration(); storage.clear(); });
afterEach(() => { registration.clearRegistration(); globalThis.fetch = originalFetch; });
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});

const input = { phone: "+998901234567", password: "RegistrationTest123", role: "customer" };
const sessionToken = "a".repeat(64);
const sent = () => ({ sessionToken, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  otpExpiresAt: new Date(Date.now() + 180000).toISOString(), resendAfter: 180 });
const verified = () => ({ completionExpiresAt: new Date(Date.now() + 900000).toISOString() });
const completed = { token: "test-result-jwt", customer: { id: 23, phone: input.phone, first_name: "Ali", last_name: "Valiyev" } };
function transport(replies) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const reply = replies[calls.length - 1];
    assert.ok(reply, "Unexpected extra request");
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  };
  return calls;
}
function assertCall(call, action, body) {
  assert.equal(call.url, `http://localhost:5000/api/auth/registration/${action}`);
  assert.equal(call.options.method, "POST");
  assert.deepEqual(JSON.parse(call.options.body), body);
}

test("start succeeds for customer and barber and preserves deadlines/specialty", async () => {
  for (const details of [input, { ...input, role: "barber", specialty: "stylist" }]) {
    const body = sent();
    const calls = transport([{ body }]);
    const before = Date.now();
    await registration.startRegistration(details);
    assertCall(calls[0], "start", details);
    const state = registration.getRegistration();
    assert.equal(state.stage, "otp");
    assert.equal(state.specialty, details.specialty);
    assert.equal(state.sessionToken, sessionToken);
    assert.equal(state.sessionExpiresAt, Date.parse(body.sessionExpiresAt));
    assert.equal(state.otpExpiresAt, Date.parse(body.otpExpiresAt));
    assert.ok(state.resendAt >= before + 180000 && state.resendAt <= Date.now() + 180000);
  }
});

test("start canonicalizes the phone before sending and retaining it", async () => {
  const calls = transport([{ body: sent() }]);
  await registration.startRegistration({ ...input, phone: "90 123-45-67" });
  assertCall(calls[0], "start", { ...input, phone: "+998901234567" });
  assert.equal(registration.getRegistration().phone, "+998901234567");
});

test("frontend registration uses backend canonical phone and password rules", async () => {
  const cases = [
    ["Aa123456", ""], ["Abcdefg" + "1".repeat(121), ""],
    ["Abcdefg" + "1".repeat(122), "Parol 8–128 ta belgidan iborat bo‘lishi kerak."],
    ["12345678", "Bu parol juda kuchsiz. Boshqa parol tanlang."],
    ["987654321", "Parolda kamida bitta harf va bitta raqam bo‘lishi kerak."],
    ["PasswordX", "Parolda kamida bitta harf va bitta raqam bo‘lishi kerak."],
  ];
  for (const [password, expected] of cases) assert.equal(registration.registrationPasswordError(password), expected);
  for (const raw of ["90 123-45-67", "998901234567", "+998 (90) 123-45-67", "00998901234567"]) {
    assert.equal(phonePolicy.normalizePhone(raw), "+998901234567");
  }
});

test("resend succeeds and sends the existing registration token in JSON", async () => {
  const updated = { ...sent(), otpExpiresAt: new Date(Date.now() + 190000).toISOString() };
  const calls = transport([{ body: sent() }, { body: updated }]);
  await registration.startRegistration(input);
  await registration.resendRegistration();
  assertCall(calls[1], "resend", { sessionToken });
  assert.equal(registration.getRegistration().otpExpiresAt, Date.parse(updated.otpExpiresAt));
  assert.equal(registration.getRegistration().sessionToken, sessionToken);
});

test("verify succeeds and retains the completion deadline", async () => {
  const body = verified();
  const calls = transport([{ body: sent() }, { body }]);
  await registration.startRegistration(input);
  await registration.verifyRegistration("00123");
  assertCall(calls[1], "verify", { sessionToken, otp: "00123" });
  assert.equal(registration.getRegistration().stage, "verified");
  assert.equal(registration.getRegistration().completionExpiresAt, Date.parse(body.completionExpiresAt));
});

test("complete succeeds without persisting the returned JWT in registration storage", async () => {
  const calls = transport([{ body: sent() }, { body: verified() }, { body: completed }]);
  await registration.startRegistration(input);
  await registration.verifyRegistration("00123");
  assert.deepEqual(await registration.completeRegistration("Ali", "Valiyev"), completed);
  assertCall(calls[2], "complete", { sessionToken, firstName: "Ali", lastName: "Valiyev" });
  assert.equal(registration.getRegistration().stage, "completed");
  assert.equal(registration.getRegistration().sessionToken, undefined);
  assert.equal(storage.has("ustara-pending-registration"), false);
  assert.deepEqual(await registration.completeRegistration("Ali", "Valiyev"), completed);
  assert.equal(calls.length, 3);
});

test("HTTP errors retain status/message/code and metadata used by UI and flow", async () => {
  for (const [status, action, code, metadata] of [
    [400, "verify", "invalid_otp", { attemptsRemaining: 3 }],
    [429, "resend", "resend_too_soon", { retryAfter: 120 }],
    [423, "verify", "registration_blocked", { adminRequired: true, blockedUntil: null }],
  ]) {
    registration.clearRegistration();
    transport([{ body: sent() }, { status, body: { message: "Backend message", code, ...metadata, extraInfo: "retained" } }]);
    await registration.startRegistration(input);
    const before = Date.now();
    await assert.rejects(action === "resend" ? registration.resendRegistration() : registration.verifyRegistration("00000"), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.message, "Backend message");
      assert.deepEqual(error.metadata, { ...metadata, extraInfo: "retained" });
      for (const [key, value] of Object.entries(metadata)) assert.equal(error[key], value);
      if (code === "invalid_otp") assert.equal(registration.registrationError(error), "Tasdiqlash kodi noto‘g‘ri. 3 ta urinish qoldi.");
      if (code === "resend_too_soon") assert.equal(registration.registrationError(error), "Yangi kod so‘rashdan oldin kutish vaqti tugashini kuting.");
      return true;
    });
    if (code === "resend_too_soon") assert.ok(registration.getRegistration().resendAt >= before + 120000);
    if (code === "registration_blocked") assert.deepEqual(registration.getRegistration().block, { adminRequired: true, until: null });
  }
});

test("all four requests omit JWT Authorization and keep session token out of URL", async () => {
  storage.set("ustara-api-access-token", "unrelated-login-jwt");
  const calls = transport([{ body: sent() }, { body: sent() }, { body: verified() }, { body: completed }]);
  await registration.startRegistration(input);
  await registration.resendRegistration();
  await registration.verifyRegistration("00123");
  await registration.completeRegistration("Ali", "Valiyev");
  assert.equal(calls.length, 4);
  for (const [index, call] of calls.entries()) {
    assert.equal(new Headers(call.options.headers).has("Authorization"), false);
    assert.equal(call.options.credentials, "omit");
    assert.ok(!call.url.includes(sessionToken));
    const body = JSON.parse(call.options.body);
    assert.equal(body.sessionToken, index === 0 ? undefined : sessionToken);
    assert.equal(body.token, undefined);
  }
});

test("network and non-JSON errors preserve existing registration messages", async () => {
  for (const mode of ["network", "html", "empty"]) {
    globalThis.fetch = async () => {
      if (mode === "network") throw new TypeError("Network unavailable");
      return new Response(mode === "html" ? "<html>Error</html>" : null);
    };
    await assert.rejects(registration.startRegistration(input), (error) => {
      assert.equal(error.message, mode === "network"
        ? "Server bilan aloqa o‘rnatilmadi. Internet va ulanishni tekshirib, qayta urinib ko‘ring."
        : "Serverdan javob olinmadi. Keyinroq qayta urinib ko‘ring.");
      return true;
    });
  }
});

test('Continue opens OTP state before delivery and status activates its countdown after bot delivery', async () => {
  const botUrl = 'https://t.me/ustara_test_bot';
  const waiting = { sessionToken, sessionExpiresAt: new Date(Date.now()+1800000).toISOString(), deliveryPending: true, botUrl, otpExpiresAt: null, resendAfter: 0 };
  const delivered = { sessionExpiresAt: waiting.sessionExpiresAt, deliveryPending: false, otpExpiresAt: new Date(Date.now()+180000).toISOString(), resendAfter: 180 };
  const calls = transport([{body: waiting},{body: waiting},{body: delivered}]);
  await registration.startRegistration(input);
  const initial = registration.getRegistration();
  assert.equal(initial.stage, 'otp'); assert.equal(initial.deliveryPending, true); assert.equal(initial.otpExpiresAt, null); assert.equal(initial.botUrl, botUrl);
  assert.equal(registration.registrationPath(initial), '/otp');
  await registration.refreshRegistration(); assert.equal(registration.getRegistration(), initial);
  await registration.refreshRegistration();
  assert.equal(registration.getRegistration().deliveryPending, false);
  assert.equal(registration.getRegistration().otpExpiresAt, Date.parse(delivered.otpExpiresAt));
  assert.equal(registration.getRegistration().botUrl, botUrl);
  assertCall(calls[1], 'status', {sessionToken}); assertCall(calls[2], 'status', {sessionToken});
});

test('unsafe or missing bot capability URL never creates a waiting OTP session', async () => {
  for (const botUrl of ['javascript:alert(1)', 'https://evil.invalid/?start=reg_'+ 'a'.repeat(43), 'https://t.me/ustara_test_bot?start=otp', undefined]) {
    transport([{body: {sessionToken,sessionExpiresAt:new Date(Date.now()+1800000).toISOString(),deliveryPending:true,botUrl,otpExpiresAt:null,resendAfter:0}}]);
    await assert.rejects(registration.startRegistration(input), {message:'Serverdan bot havolasi olinmadi.'});
    assert.equal(registration.getRegistration(),null);
  }
});

test('repeated signup stores only the new session and shows restart/cooldown state', async () => {
  const first = {sessionToken,sessionExpiresAt:new Date(Date.now()+1800000).toISOString(),deliveryPending:true,botUrl:'https://t.me/ustara_booking_bot',otpExpiresAt:null,resendAfter:0};
  const second = {...first,sessionToken:'b'.repeat(64),restarted:true,deliveryRetryAfter:120};
  const calls=transport([{body:first},{body:second},{body:{completionExpiresAt:new Date(Date.now()+900000).toISOString()}}]);
  await registration.startRegistration(input);
  await registration.startRegistration({...input,password:'ChangedPassword123'});
  const pending=registration.getRegistration();
  assert.equal(pending.sessionToken,second.sessionToken);
  assert.equal(pending.stage,'otp');assert.equal(pending.restarted,true);
  assert.equal(pending.deliveryPending,true);assert.equal(pending.otpExpiresAt,null);
  assert.ok(pending.deliveryRetryAt>Date.now()+119000);
  const saved=JSON.parse(storage.get('ustara-pending-registration'));
  assert.equal(saved.sessionToken,second.sessionToken);
  assert.ok(!JSON.stringify(saved).includes('ChangedPassword123'));
  assertCall(calls[1],'start',{...input,password:'ChangedPassword123'});
  await registration.verifyRegistration('12345');
  assertCall(calls[2],'verify',{sessionToken:second.sessionToken,otp:'12345'});
});

test('a revoked older status response cannot clear the replacement signup session', async () => {
  const waiting={sessionToken,sessionExpiresAt:new Date(Date.now()+1800000).toISOString(),deliveryPending:true,botUrl:'https://t.me/ustara_booking_bot',otpExpiresAt:null,resendAfter:0};
  let finishStatus, starts=0;
  globalThis.fetch=async(url)=>{
    if(url.endsWith('/status')) return new Promise(resolve=>{finishStatus=()=>resolve(new Response(JSON.stringify({code:'invalid_session',message:'Revoked'}),{status:401}));});
    starts++;
    return new Response(JSON.stringify(starts===1?waiting:{...waiting,sessionToken:'c'.repeat(64),restarted:true}));
  };
  await registration.startRegistration(input);
  const oldStatus=registration.refreshRegistration();
  await registration.startRegistration(input);
  finishStatus();await assert.rejects(oldStatus,{code:'invalid_session'});
  assert.equal(registration.getRegistration().sessionToken,'c'.repeat(64));
  assert.equal(JSON.parse(storage.get('ustara-pending-registration')).sessionToken,'c'.repeat(64));
});

test('signup cooldown comes from server time, survives reload, and contact does not restart it', async () => {
  const serverNow = new Date('2026-11-01T10:00:00Z');
  const available = new Date(+serverNow + 60000);
  const waiting = {sessionToken, sessionExpiresAt:new Date(Date.now()+1800000).toISOString(),
    deliveryPending:true, botUrl:'https://t.me/ustara_booking_bot', otpExpiresAt:null,
    serverNow:serverNow.toISOString(), resendAvailableAt:available.toISOString(), resendAfter:60};
  transport([{body:waiting}, {body:{...waiting, serverNow:new Date(+serverNow+25000).toISOString(), resendAfter:35}},
    {body:{...waiting, deliveryPending:false, otpExpiresAt:new Date(Date.now()+60000).toISOString(),
      serverNow:new Date(+serverNow+30000).toISOString(), resendAfter:30}}]);
  const before=Date.now();
  await registration.startRegistration(input);
  assert.ok(registration.getRegistration().resendAt >= before+60000);
  await registration.refreshRegistration();
  const saved=registration.getRegistration();
  assert.ok(saved.resendAt >= Date.now()+34000 && saved.resendAt <= Date.now()+35000);
  const source=await loadModule(registrationUrl);
  const reload=await import(moduleUrl(Buffer.from(source.split(',')[1],'base64').toString()+'\n// reload cooldown test'));
  assert.equal(reload.getRegistration().resendAt,saved.resendAt);
  reload.clearRegistration();
  await registration.refreshRegistration();
  assert.equal(registration.getRegistration().deliveryPending,false);
  assert.ok(registration.getRegistration().resendAt <= Date.now()+30000);
});

test('429 Retry-After header is retained; rejected resend does not create a new OTP', async () => {
  transport([{body:sent()}, {status:429, headers:{'Retry-After':'87'}, body:{code:'otp_rate_limited',message:'internal'} },
    {body:{...sent(),deliveryPending:false,resendAfter:0}}]);
  await registration.startRegistration(input);
  const original=registration.getRegistration();
  const before=Date.now();
  await assert.rejects(registration.resendRegistration(), error => {
    assert.equal(error.retryAfter,87);
    assert.equal(registration.otpError(error),'Birozdan keyin qayta urinib ko‘ring');
    return true;
  });
  assert.equal(registration.getRegistration().otpExpiresAt,original.otpExpiresAt);
  assert.ok(registration.getRegistration().resendAt >= before+87000);
  const retryAt=registration.getRegistration().retryAt;
  await registration.refreshRegistration();
  assert.equal(registration.getRegistration().retryAt,retryAt);
});

test('failed resend preserves cooldown and OTP; technical messages stay out of OTP UI',async()=>{
  transport([{body:sent()},{status:500,body:{code:'registration_error',message:'SQL private detail'}}]);
  await registration.startRegistration(input);
  const original=registration.getRegistration();
  await assert.rejects(registration.resendRegistration(),error=>{
    assert.equal(registration.otpError(error),'So‘rov bajarilmadi. Qayta urinib ko‘ring');return true;
  });
  assert.equal(registration.getRegistration(),original);
  assert.equal(registration.otpError({code:'network_error'}),'Internet aloqasini tekshiring');
});
