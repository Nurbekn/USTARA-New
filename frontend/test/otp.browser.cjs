// Chrome CDP UI E2E. Every /api/ call is intercepted; no real backend or Telegram.
// Start an isolated Chrome with --remote-debugging-port=9240 and Vite on 5188.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='http://127.0.0.1:5188/USTARA-New';
const debug='http://127.0.0.1:9240';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const setup=`
  const realNow=Date.now;
  Date.now=()=>realNow()+Number(sessionStorage.getItem('__clock')||0);
  window.__advance=ms=>{sessionStorage.setItem('__clock',Number(sessionStorage.getItem('__clock')||0)+ms);document.dispatchEvent(new Event('visibilitychange'));};
  const draw=CanvasRenderingContext2D.prototype.fillText, clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.width===220)window.__captcha='';return clear.apply(this,args);};
  CanvasRenderingContext2D.prototype.fillText=function(...args){if(this.canvas.width===220)window.__captcha=(window.__captcha||'')+args[0];return draw.apply(this,args);};
  window.__calls=[];
  const originalFetch=window.fetch;
  window.fetch=async(url,options={})=>{
    if(!String(url).includes('/api/'))return originalFetch(url,options);
    const action=String(url).split('/').at(-1);
    window.__calls.push(action);
    let server=JSON.parse(sessionStorage.getItem('__server')||'null');
    const pending=JSON.parse(sessionStorage.getItem('ustara-pending-registration')||'null');
    if(!server && pending)server={until:pending.resendAt,delivery:!pending.deliveryPending,otp:pending.otpExpiresAt};
    const mode=window.__mode;
    if(mode==='offline')throw new TypeError('Disconnected');
    if(['resend','verify'].includes(action))await new Promise(resolve=>setTimeout(resolve,250));
    if(mode==='500')return new Response(JSON.stringify({code:'registration_error',message:'PRIVATE SQL ERROR'}),{status:500});
    if(mode==='429')return new Response(JSON.stringify({code:'otp_rate_limited',message:'PRIVATE LIMIT'}),{status:429,headers:{'Retry-After':'90'}});
    if(action==='start'||action==='resend'){
      server={until:Date.now()+60000,delivery:false,otp:null};
      sessionStorage.setItem('__server',JSON.stringify(server));
    }
    let body={};
    if(['start','resend','status'].includes(action))body={sessionToken:'a'.repeat(64),sessionExpiresAt:new Date(Date.now()+1800000).toISOString(),
      deliveryPending:!server.delivery,botUrl:'https://t.me/ustara_booking_bot',otpExpiresAt:server.otp?new Date(server.otp).toISOString():null,
      serverNow:new Date(Date.now()).toISOString(),resendAvailableAt:new Date(server.until).toISOString(),resendAfter:Math.max(0,Math.ceil((server.until-Date.now())/1000))};
    if(action==='verify'){
      if(JSON.parse(options.body).otp!=='12345')return new Response(JSON.stringify({code:'invalid_otp',message:'PRIVATE ERROR',attemptsRemaining:4}),{status:400});
      body={completionExpiresAt:new Date(Date.now()+900000).toISOString()};
    }
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  };
`;
async function connect(target){
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve=>{ws.onopen=resolve;});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{const data=JSON.parse(event.data);if(!data.id)return;const call=pending.get(data.id);pending.delete(data.id);data.error?call.reject(Error(data.error.message)):call.resolve(data.result);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:setup});
  return{send,evaluate,close:()=>ws.close(),id:target.id};
}
async function waitFor(page,expression){
  for(let i=0;i<100;i++){if(await page.evaluate(expression))return;await delay(100);}
  throw Error('Sahifa kutilgan holatga o‘tmadi: '+expression);
}
async function input(page,selector,value){
  await page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(40);
}
const state=page=>page.evaluate(`(()=>{const r=document.querySelector('.au-otp-resend'),card=document.querySelector('.au-card');return{resendDisabled:r.disabled,timer:r.querySelector('[role=timer]')?.textContent,timers:document.querySelectorAll('[role=timer]').length,confirmDisabled:document.querySelector('button[type=submit]').disabled,inputs:document.querySelectorAll('.au-otp input').length,overflow:document.documentElement.scrollWidth>innerWidth,cardWidth:card.getBoundingClientRect().width,telegram:document.querySelector('.au-otp-telegram')?.getAttribute('href'),error:document.querySelector('[role=alert]')?.textContent||'',values:[...document.querySelectorAll('.au-otp input')].map(e=>e.value).join('')}})()`);
async function signup(page,role){
  await page.send('Page.navigate',{url:base+(role==='barber'?'/signup/usta':'/signup')});
  await delay(300);
  await waitFor(page,`!!document.querySelector('.au-captcha input') && !!window.__captcha`);
  await input(page,'#phone','901234567');await input(page,'#password','BrowserTest123');await input(page,'#confirm-password','BrowserTest123');
  await input(page,'.au-captcha input',await page.evaluate('window.__captcha'));
  await page.evaluate(`document.querySelector('button[type=submit]').click()`);
  await waitFor(page,`!!document.querySelector('.au-otp-resend')`);
}
async function contact(page){
  await page.evaluate(`{const s=JSON.parse(sessionStorage.getItem('__server'));s.delivery=true;s.otp=Date.now()+60000;sessionStorage.setItem('__server',JSON.stringify(s));window.dispatchEvent(new Event('focus'));}`);
  await delay(150);
}
(async()=>{
  const targets=await(await fetch(debug+'/json/list')).json();
  const page=await connect(targets.find(tab=>tab.type==='page'));
  const report=[];let second;
  try{
    for(const [label,width,height,role]of[['mobile-320',320,720,'customer'],['mobile-390',390,844,'barber'],['desktop',1280,900,'customer']]){
      await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      await page.send('Page.navigate',{url:base+'/signup'});await delay(400);
      await page.evaluate(`sessionStorage.clear()`);
      await signup(page,role);
      const initial=await state(page);
      assert.equal(initial.resendDisabled,true);assert.equal(initial.inputs,5);assert.equal(initial.timers,1);
      assert.equal(initial.telegram,'https://t.me/ustara_booking_bot');assert.equal(initial.overflow,false);assert.ok(initial.cardWidth<=380);
      assert.equal(initial.confirmDisabled,true);
      await delay(2100);assert.notEqual((await state(page)).timer,initial.timer);
      if(label==='mobile-320'){
        const target=await(await fetch(debug+'/json/new?'+encodeURIComponent('about:blank'),{method:'PUT'})).json();
        second=await connect(target);
        await second.send('Page.navigate',{url:base+'/otp'});
        await waitFor(second,`!!document.querySelector('.au-otp-resend')`);
        assert.equal((await state(second)).resendDisabled,true);
        assert.ok(Math.abs(await page.evaluate(`JSON.parse(sessionStorage.getItem('ustara-pending-registration')).resendAt`)-await second.evaluate(`JSON.parse(sessionStorage.getItem('ustara-pending-registration')).resendAt`))<1000);
        second.close();await fetch(debug+'/json/close/'+target.id);second=null;
      }
      const before=(await state(page)).timer;
      await page.send('Page.reload');await delay(300);await waitFor(page,`!!document.querySelector('.au-otp-resend')`);
      const after=(await state(page)).timer;assert.ok(after<=before);assert.notEqual(after,'01:00');
      await contact(page);assert.ok((await state(page)).timer<=after);
      // Clipboard paste triggers exactly one verify; rapid submits stay locked.
      await page.evaluate(`{const data=new DataTransfer();data.setData('text/plain','11111');document.querySelector('.au-otp input').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit();}`);
      await delay(400);
      assert.equal(await page.evaluate(`window.__calls.filter(a=>a==='verify').length`),1);
      assert.equal((await state(page)).error,'Kod noto‘g‘ri');assert.equal((await state(page)).values,'');
      assert.equal(await page.evaluate(`document.activeElement===document.querySelector('.au-otp input')`),true);
      await input(page,'.au-otp input','1');
      await page.evaluate(`document.querySelectorAll('.au-otp input')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}))`);
      assert.equal((await state(page)).values,'');
      await page.evaluate('window.__advance(61000)');
      await waitFor(page,`document.querySelector('.au-otp-resend')?.disabled === false`);
      assert.equal((await state(page)).resendDisabled,false);assert.equal((await state(page)).timer,'00:00');
      assert.equal((await state(page)).error,'Kod muddati tugagan');
      for(const [mode,message]of[['offline','Internet aloqasini tekshiring'],['500','So‘rov bajarilmadi. Qayta urinib ko‘ring'],['429','Birozdan keyin qayta urinib ko‘ring']]){
        await page.evaluate(`window.__mode=${JSON.stringify(mode)};document.querySelector('.au-otp-resend').click()`);
        await delay(400);assert.equal((await state(page)).error,message);
        if(mode==='429'){assert.equal((await state(page)).resendDisabled,true);await page.evaluate(`window.__mode='';window.__advance(91000)`);await waitFor(page,`document.querySelector('.au-otp-resend')?.disabled === false`);}
        else assert.equal((await state(page)).resendDisabled,false);
      }
      await page.evaluate(`window.__mode='';window.__calls=[];document.querySelector('.au-otp-resend').click();document.querySelector('.au-otp-resend').click();`);
      await delay(400);assert.equal(await page.evaluate(`window.__calls.filter(a=>a==='resend').length`),1);
      assert.equal((await state(page)).resendDisabled,true);
      await contact(page);
      const screenshot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/ustara-otp-final-'+label+'.png',Buffer.from(screenshot.data,'base64'));
      if(width===320){await page.send('Emulation.setDeviceMetricsOverride',{width,height:320,deviceScaleFactor:1,mobile:true});assert.equal((await state(page)).overflow,false);await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});}
      await page.evaluate(`document.querySelector('.au-link-back').click()`);await waitFor(page,`!!document.querySelector('.au-captcha input')`);
      await page.send('Page.navigate',{url:base+'/otp'});await delay(300);await waitFor(page,`!!document.querySelector('.au-otp-resend')`);
      assert.equal((await state(page)).resendDisabled,true);
      await input(page,'.au-otp input','12345');
      await waitFor(page,`location.pathname.endsWith('/complete-profile')`);
      report.push({label,role,status:'PASS'});
      // End this registration before the next scenario.
      await page.evaluate(`sessionStorage.clear()`);
    }
    fs.writeFileSync('/tmp/ustara-otp-final-e2e.json',JSON.stringify({api:'mocked',report},null,2));
    console.log('PASS',JSON.stringify(report));
  }finally{second?.close();page.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
