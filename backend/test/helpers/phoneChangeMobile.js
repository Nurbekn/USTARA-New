// Browser exercises real phone-change HTTP/SQL. Unrelated dashboard reads are fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runPhoneChangeMobile({ base, f, service, code, artifacts }) {
  const browserRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara-phone-mobile-'));
  const browser = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + browserRoot, 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    const activePort = path.join(browserRoot, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(activePort); i++) await delay(100);
    assert.ok(fs.existsSync(activePort), 'Chrome ishga tushishi kerak');
    const port = fs.readFileSync(activePort, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve;ws.onerror = reject; });
    let id = 0;const pending = new Map(), errors = [];
    ws.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id) { const p = pending.get(m.id);pending.delete(m.id);m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;pending.set(n, { resolve, reject });ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async expression => {
      const answer = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (answer.exceptionDetails) throw Error('Browser amali bajarilmadi: ' + answer.exceptionDetails.text);
      return answer.result.value;
    };
    const until = async (expression, label) => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return;await delay(100); }
      const diagnostic = await evaluate("JSON.stringify({path:location.pathname,success:document.body.textContent.includes('Raqam yangilandi'),password:!!document.querySelector('#password'),phoneChanged:history.state?.usr?.phoneChanged,text:document.body.innerText.slice(0,180)})");
      throw Error('Browser kutish muddati tugadi: ' + label + ' ' + diagnostic);
    };
    const field = async (selector, value) => {
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await delay(80);
    };
    const clickText = async (text) => { await evaluate(`(Array.from(document.querySelectorAll('.pc-panel button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}) || Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})).click()`);await delay(100); };
    const session = { ...f.actor, role: f.actor.role, accountId: f.actor.id, profileId: f.profile.id, phone: f.phone,
      authenticated: true, authSource: 'backend', tokenExpiresAt: jwtExpiry(f.token), setupDone: true,
      profile: { first_name: 'Sinov', last_name: 'Foydalanuvchi' } };
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: f.actor.role === 'customer' ? 360 : 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      sessionStorage.clear();localStorage.clear();
      sessionStorage.setItem('ustara-api-access-token',${JSON.stringify(f.token)});
      sessionStorage.setItem('ustara-session',${JSON.stringify(JSON.stringify(session))});
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,options)=>{
        const url=new URL(typeof input==='string'?input:input.url,location.href);
        if(url.pathname.startsWith('/api/auth/phone-change/')||url.pathname==='/api/auth/login')return originalFetch(${JSON.stringify(base)}+url.pathname,options);
        if(url.pathname.startsWith('/api/')){
          let body=[];
          const profile={id:${f.profile.id},phone:${JSON.stringify(f.phone)},first_name:'Sinov',last_name:'Foydalanuvchi',specialty:'barber',verification_status:'approved',accepting_bookings:true};
          if(url.pathname==='/api/customers/me')body={customer:profile};
          if(url.pathname==='/api/barbers/me')body={barber:profile};
          if(url.pathname.endsWith('/reviews/me'))body={reviews:[]};
          if(url.pathname.endsWith('/portfolio'))body={posts:[]};
          if(url.pathname==='/api/social')body={following:[],posts:[]};
          if(url.pathname.endsWith('/telegram/status'))body={linked:false};
          return Promise.resolve(new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}));
        }
        return originalFetch(input,options);
      };
    ` });
    const frontend = process.env.USTARA_FRONTEND_URL || 'http://127.0.0.1:5173/USTARA-New';
    await send('Page.navigate', { url: frontend + (f.actor.role === 'customer' ? '/user/profile' : '/barber/profile') });
    if (f.actor.role === 'customer') {
      await until("!!document.querySelector('.up-menu-row')", 'customer profili');
      await evaluate("Array.from(document.querySelectorAll('.up-menu-row')).find(b=>b.textContent.includes('Telefon raqami')).click()");
    }
    if (f.actor.role === 'barber') await until("document.querySelector('.bx-profile h2')?.textContent.includes('Sinov')", 'barber profili');
    await until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Raqamni almashtirish')", 'telefon tugmasi');
    await clickText('Raqamni almashtirish');
    await until("!!document.querySelector('.pc-panel #password')", 'profil paroli');
    await field('.pc-panel #password', 'IncorrectPassword123');await evaluate("document.querySelector('form.pc-panel').requestSubmit()");
    await until("document.querySelector('.pc-error')?.textContent.includes('Parol noto‘g‘ri')", 'noto‘g‘ri parol');
    assert.equal(await evaluate("!!document.querySelector('#phone-change-number')"), false);
    await field('.pc-panel #password', f.password);await evaluate("document.querySelector('form.pc-panel').requestSubmit()");
    await until("!!document.querySelector('#phone-change-number')", 'yangi telefon');
    await field('#phone-change-number', f.newPhone.slice(4));await evaluate("document.querySelector('form.pc-panel').requestSubmit()");
    await until("!!document.querySelector('.pc-bot')", 'Telegram havolasi');
    assert.equal(await evaluate("!!document.querySelector('.pc-otp')"), false);
    const botUrl = await evaluate("document.querySelector('.pc-bot').href");
    const message = { chat: { id: f.chat, type: 'private' }, from: { id: f.chat }, contact: { user_id: f.chat, phone_number: f.newPhone.slice(1) } };
    await service.open(message, new URL(botUrl).searchParams.get('start'));
    await service.contact(message);
    await until("document.querySelectorAll('.pc-otp input').length===5", 'OTP holati');
    assert.equal(await evaluate("document.querySelector('.pc-resend').disabled"), true);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(artifacts, `phone-change-${f.actor.role}-mobile.png`), Buffer.from(image.data, 'base64'));
    const paste = async digits => evaluate(`(()=>{const data=new DataTransfer();data.setData('text',${JSON.stringify(digits)});document.querySelector('.pc-otp input').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));})()`);
    const good = code();
    await paste(good);await delay(80);
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.pc-otp input')).map(i=>i.value).join('')"), good);
    await field('.pc-otp input:last-child', '');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.pc-otp input')).indexOf(document.activeElement)"), 3);
    const bad = (good[0] === '0' ? '1' : '0') + good.slice(1);
    await paste(bad);await delay(80);await evaluate("document.querySelector('form.pc-panel').requestSubmit()");
    await until("document.querySelector('.pc-error')?.textContent.includes('Kod noto‘g‘ri')", 'noto‘g‘ri OTP');
    assert.equal(await evaluate("document.querySelector('.pc-otp input').value"), '');
    await paste(good);await delay(80);await evaluate("document.querySelector('form.pc-panel').requestSubmit()");
    await until("location.pathname.endsWith('/login')", 'login yo‘naltirish');
    assert.equal(await evaluate("sessionStorage.getItem('ustara-api-access-token')"), null);
    await until("document.body.textContent.includes('Raqam yangilandi') && !!document.querySelector('#password')", 'login muvaffaqiyat xabari');
    await field('#password', f.password);await evaluate("document.querySelector('form').requestSubmit()");
    await until("!!sessionStorage.getItem('ustara-api-access-token')", 'yangi raqam bilan login');
    assert.notEqual(await evaluate("sessionStorage.getItem('ustara-api-access-token')"), f.token);
    assert.deepEqual(errors, []);
    await send('Browser.close');
  } finally { ws?.close();browser.kill('SIGTERM'); }
}
function jwtExpiry(token) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp * 1000; }
module.exports = { runPhoneChangeMobile };
