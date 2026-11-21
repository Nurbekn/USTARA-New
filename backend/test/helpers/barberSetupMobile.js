const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function runBarberSetupMobile({ base, f, artifacts }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-setup-browser-'));
  const browser = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    for (let n = 0; n < 100 && !fs.existsSync(path.join(dir, 'DevToolsActivePort')); n++) await delay(100);
    const port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0];
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r;ws.onerror = j; });
    let id = 0;const pending = new Map(), errors = [];
    ws.onmessage = event => { const m = JSON.parse(event.data);if (m.id) { const p = pending.get(m.id);pending.delete(m.id);m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;pending.set(n, { resolve, reject });ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error('Brauzer amali bajarilmadi');return r.result.value; };
    const until = async (expression, label) => { for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return;await delay(100); }throw Error(label + ' muddati tugadi'); };
    const payload = JSON.parse(Buffer.from(f.token.split('.')[1], 'base64url'));
    const session = { ...f.actor, accountId: f.actor.id, phone: f.phone, authenticated: true, authSource: 'backend', tokenExpiresAt: payload.exp * 1000, setupDone: false, profile: { first_name: 'Sinov', last_name: 'Usta' } };
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      sessionStorage.setItem('ustara-api-access-token',${JSON.stringify(f.token)});
      sessionStorage.setItem('ustara-session',${JSON.stringify(JSON.stringify(session))});
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,options)=>{
        const url=new URL(typeof input==='string'?input:input.url,location.href);
        if(['/api/barbers/setup','/api/barbers/me','/api/barbers/working-hours'].includes(url.pathname))return originalFetch(${JSON.stringify(base)}+url.pathname,options);
        if(url.pathname.startsWith('/api/'))return Promise.resolve(new Response(JSON.stringify({message:'Aloqasiz dashboard so‘rovi testda rad etildi'}),{status:503,headers:{'content-type':'application/json'}}));
        return originalFetch(input,options);
      };
    ` });
    await send('Page.navigate', { url: (process.env.USTARA_FRONTEND_URL || 'http://127.0.0.1:5173/USTARA-New') + '/barber/setup' });
    await until("!!document.querySelector('.bp-save')&&!document.querySelector('.bp-save').disabled", 'Profil yuklash');
    assert.equal(await evaluate("document.querySelectorAll('.wh-toggle[aria-checked=\"true\"]').length"), 6);
    assert.equal(await evaluate("document.querySelector('.wh-toggle[aria-label=\"Yakshanba ish kuni\"]').getAttribute('aria-checked')"), 'false');
    assert.equal(await evaluate("document.querySelector('.wh-toggle[aria-label=\"Shanba ish kuni\"]').getAttribute('aria-checked')"), 'true');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });fs.writeFileSync(path.join(artifacts, 'barber-setup-mobile.png'), Buffer.from(shot.data, 'base64'));
    await evaluate("document.querySelector('.bp-save').click()");
    await until("location.pathname.endsWith('/barber/pending')&&document.body.textContent.includes('Admin tasdiqlashi kutilmoqda')", 'Admin tasdiqlash sahifasi');
    assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('ustara-session')).setupDone"), true);
    assert.equal(await evaluate("sessionStorage.getItem('ustara-api-access-token')"), f.token);
    assert.deepEqual(errors, []);
    const done = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });fs.writeFileSync(path.join(artifacts, 'barber-pending-mobile.png'), Buffer.from(done.data, 'base64'));
    await send('Browser.close');
  } finally { ws?.close();browser.kill('SIGTERM'); }
}
module.exports = { runBarberSetupMobile };
