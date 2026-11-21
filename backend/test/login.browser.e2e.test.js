const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { assertLocalDevtoolsUrl,createCdpTransport } = require('./helpers/v60ChromeCdp');
const { chromeBinary,chromeExited,stopChrome } = require('./helpers/v61ChromeLifecycle');
const enabled = process.env.NODE_ENV === 'test' && process.env.USTARA_LOGIN_E2E === '1'
  && process.env.USTARA_LOGIN_WRITE_TESTS === 'I_AUTHORIZE_TEST_DATA';

test('Login E2E: Chrome, React, HTTP va PostgreSQL', { skip: !enabled, timeout: 90000 }, async t => {
  const h = await require('./helpers/loginHarness').createLoginHarness();
  t.after(() => h.close());
  const frontend = path.resolve(__dirname, '../../frontend');
  const { createServer } = await import(pathToFileURL(frontend + '/node_modules/vite/dist/node/index.js'));
  const react = (await import(pathToFileURL(frontend + '/node_modules/@vitejs/plugin-react/dist/index.js'))).default;
  // Explicitly disable Vite config and env loading; no .env file is accessed.
  const vite = await createServer({ configFile: false, envDir: false, root: frontend,
    base: '/USTARA-New/', plugins: [react()],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(h.base) },
    server: { host: '127.0.0.1', port: 0 } });
  t.after(() => vite.close());
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ustara-login-chrome-'));
  const chrome = spawn(chromeBinary(), ['--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  // spawn failure emits 'error', not an immediate exitCode; never leave it unhandled.
  let launchFailed=false;
  chrome.on('error', () => { launchFailed=true; });
  t.after(async () => {
    try { await stopChrome(chrome); }
    finally { await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  });
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchFailed || chromeExited(chrome)) throw Error('Chrome exited before CDP became available');
    try {
      const value=Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if(Number.isSafeInteger(value)&&value>0&&value<=65535){port=value;break;}
    } catch {}
    await delay(100);
  }
  assert.ok(port, 'Chrome debugging port ochilmadi');
  const tabsResponse=await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(5000)});
  assert.equal(tabsResponse.ok,true,'Chrome CDP target list unavailable');
  const tabs=await tabsResponse.json();
  const url=assertLocalDevtoolsUrl(tabs.find(tab=>tab.type==='page')?.webSocketDebuggerUrl,port);
  const ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Chrome CDP socket opening timed out')),5000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Chrome CDP socket unavailable'));},{once:true});
  });
  const cdp=createCdpTransport(ws);
  t.after(()=>cdp.close());
  const send=cdp.send;
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw Error('Brauzer kutish muddati tugadi: ' + expression);
  };
  const fill = (selector, value) => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const submit = () => evaluate('document.querySelector("form").requestSubmit()');
  const openLogin = async () => {
    await send('Page.navigate', { url: origin + '/USTARA-New/login' });
    await wait('!!document.querySelector("input[type=tel]")');
    await evaluate('sessionStorage.clear(); localStorage.clear()');
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__loginDocumentId = Math.random().toString(36);' });
  for (const [role, width] of [['customer', 390], ['barber', 1440]]) {
    await t.test(`${role}: ${width}px, bitta so‘rov, mustaqil hisob va kutish vaqti`, async () => {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      const user = await h.account(role), other = await h.account(role);
      await openLogin();
      await fill('input[type=tel]', user.phone.slice(4));
      await fill('#password', 'Wrong123');
      const baseline = h.requests.length;
      // Dispatch synchronously before React can render disabled state.
      await evaluate('document.querySelector("form").requestSubmit(); document.querySelector("form").requestSubmit()');
      await wait('!!document.querySelector("#password-error") && !document.querySelector("button[type=submit]").disabled');
      assert.equal(h.requests.length - baseline, 1);
      for (let n = 2; n <= 4; n++) {
        await submit();
        await wait('!!document.querySelector("#password-error") && !document.querySelector("button[type=submit]").disabled');
      }
      await submit();
      await wait('document.body.innerText.includes("Qayta urinishgacha")');
      assert.equal(h.requests.length - baseline, 5);
      assert.deepEqual(h.requests.slice(baseline).map(r => r.status), [401, 401, 401, 401, 429]);
      assert.ok(h.requests.slice(baseline).every(r => r.path === '/api/auth/login'));
      assert.equal(await evaluate('document.querySelector("button[type=submit]").disabled'), true);
      const before = await evaluate('document.querySelector("[role=alert]").textContent');
      await delay(1200);
      assert.notEqual(await evaluate('document.querySelector("[role=alert]").textContent'), before);
      await submit(); await delay(100);
      assert.equal(h.requests.length - baseline, 5);
      // Another phone can log in while the original phone remains blocked.
      await fill('input[type=tel]', other.phone.slice(4)); await fill('#password', h.password);
      await submit();
      await wait(`JSON.parse(sessionStorage.getItem('ustara-session'))?.role === '${role}' && !location.pathname.endsWith('/login')`);
      assert.equal(h.requests.length - baseline, 6);
      assert.equal(h.requests.at(-1).status, 200);
      // Shorten only this test phone's DB block to verify real UI expiry.
      await h.pool.query("UPDATE login_attempt_limits SET blocked_until=clock_timestamp()+interval '3 seconds' WHERE scope='public' AND kind='account' AND key_hash=$1", [h.hash(user.phone)]);
      await evaluate('sessionStorage.clear(); localStorage.clear()');
      await openLogin();
      await fill('input[type=tel]', user.phone.slice(4)); await fill('#password', h.password);
      await submit(); await wait('document.body.innerText.includes("Qayta urinishgacha")');
      await wait('!document.querySelector("button[type=submit]").disabled');
      await submit();
      await wait(`JSON.parse(sessionStorage.getItem('ustara-session'))?.role === '${role}' && !location.pathname.endsWith('/login')`);
      assert.equal(h.requests.at(-1).status, 200);
      await evaluate('sessionStorage.clear(); localStorage.clear()');
    });
  }
  await t.test('admin: takroriy bosish bitta so‘rov, 5-xatoda bir daqiqa va muddatdan keyin kirish', async () => {
    await send('Page.navigate', { url: origin + '/USTARA-New/admin' });
    await wait('!!document.querySelector("input[autocomplete=username]")');
    await fill('input[autocomplete=username]', h.adminLogin);
    await fill('input[autocomplete=current-password]', 'Wrong123');
    const baseline = h.requests.length;
    await evaluate('document.querySelector("form").requestSubmit(); document.querySelector("form").requestSubmit()');
    await wait('!!document.querySelector(".admin-error") && !document.querySelector("button").disabled');
    assert.equal(h.requests.length - baseline, 1);
    for (let n = 2; n <= 4; n++) {
      await submit();
      await wait('!!document.querySelector(".admin-error") && !document.querySelector("button").disabled');
    }
    await submit();
    await wait('document.body.innerText.includes("Qayta urinishgacha")');
    assert.deepEqual(h.requests.slice(baseline).map(r => r.status), [401, 401, 401, 401, 429]);
    assert.equal(await evaluate('document.querySelector("button").disabled'), true);
    const before = await evaluate('document.querySelector("[role=status]").textContent');
    assert.match(before, /(?:1:00|0:59)/);
    await delay(1200);
    assert.notEqual(await evaluate('document.querySelector("[role=status]").textContent'), before);
    await submit(); await delay(100);
    assert.equal(h.requests.length - baseline, 5);
    await h.pool.query("UPDATE login_attempt_limits SET blocked_until=clock_timestamp()+interval '3 seconds' WHERE scope='admin' AND kind='account' AND key_hash=$1", [h.hash('singleton-admin')]);
    const documentId = await evaluate('window.__loginDocumentId');
    await send('Page.reload');
    await wait(`window.__loginDocumentId && window.__loginDocumentId !== ${JSON.stringify(documentId)}`);
    await wait('!!document.querySelector("input[autocomplete=username]")');
    await fill('input[autocomplete=username]', h.adminLogin);
    await fill('input[autocomplete=current-password]', h.password);
    await submit();
    await wait('document.body.innerText.includes("Qayta urinishgacha")');
    await wait('!document.querySelector("button").disabled');
    await submit();
    await wait('!!document.querySelector(".admin-shell") && !!sessionStorage.getItem("ustara-admin-access")');
    assert.equal(h.requests.at(-1).status, 200);
  });

});
