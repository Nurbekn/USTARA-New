const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runSocialBookingBrowser({ base, barber, customer, services, date, artifacts, setFewBarbers }) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-social-booking-browser-'));
 const chrome=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});let ws;
 try{
  for(let n=0;n<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));n++)await delay(100);
  const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let sequence=0,scriptId;const pending=new Map(),errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=async event=>{
   const message=JSON.parse(event.data);
   if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p.reject(Error(message.error.message)):p.resolve(message.result);}
   else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
   else if(message.method==='Fetch.requestPaused'){
    try{const response=await fetch(base+new URL(message.params.request.url).pathname);await send('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:response.status,responseHeaders:[{name:'Content-Type',value:response.headers.get('content-type')||'image/webp'}],body:Buffer.from(await response.arrayBuffer()).toString('base64')});}
    catch{await send('Fetch.failRequest',{requestId:message.params.requestId,errorReason:'Failed'});}
   }
  };
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Brauzer amali: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));return r.result.value;};
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(100);}throw Error(label+' kutish muddati tugadi');};
  const go=page=>send('Page.navigate',{url:(process.env.USTARA_FRONTEND_URL||'http://127.0.0.1:5173/USTARA-New')+page});
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input=(selector,text)=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(text)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const shot=async name=>{await delay(230);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));};
  const actor=async person=>{
   if(scriptId)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:scriptId});
   const exp=JSON.parse(Buffer.from(person.token.split('.')[1],'base64url')).exp;
   const session={...person,accountId:person.id,authenticated:true,authSource:'backend',tokenExpiresAt:exp*1000,setupDone:true,profile:{first_name:'Ali',last_name:'Valiyev'}};delete session.token;
   scriptId=(await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('ustara-api-access-token',${JSON.stringify(person.token)});sessionStorage.setItem('ustara-session',${JSON.stringify(JSON.stringify(session))});const original=window.fetch.bind(window);window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return original(url.pathname.startsWith('/api/')?${JSON.stringify(base)}+url.pathname+url.search:input,options);};`})).identifier;
  };
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*://localhost:5000/api/media/*'},{urlPattern:'*://127.0.0.1:5000/api/media/*'}]});
  for(const width of [320,1280]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await actor(customer);
   await go('/user/social');await until("document.querySelector('.so-gallery img')?.naturalWidth>0",'Feed haqiqiy rasmi');
   assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
   await click('.so-post .so-follow');await until("document.querySelector('.so-post .so-follow').getAttribute('aria-pressed')==='true'",'Follow');
   await click('.so-post [aria-label="Like"]');await until("document.querySelector('.so-post [aria-label=\"Like\"]').getAttribute('aria-pressed')==='true'",'Like');
   await click('.so-post .so-save');await until("document.querySelector('.so-post .so-save').getAttribute('aria-pressed')==='true'",'Save');
   await go('/user/social');await until("document.querySelector('.so-post [aria-label=\"Like\"]')?.getAttribute('aria-pressed')==='true'",'Like qayta yuklandi');assert.equal(await evaluate("document.querySelector('.so-post .so-save').getAttribute('aria-pressed')"),'true');
   await click('.so-post .so-gallery-open');await until("!!document.querySelector('.so-media-viewer [role=dialog]')",'Media viewer');
   await evaluate("(()=>{const node=document.querySelector('.so-media-viewer .so-gallery-track');node.scrollTo({left:node.clientWidth,behavior:'instant'});})()");await until("document.querySelector('.so-media-viewer .so-gallery-dots')?.getAttribute('aria-label')==='2 / 2'",'Swipe indikator');await shot('social-viewer-'+width);
   await evaluate('history.back()');await until("!document.querySelector('.so-media-viewer [role=dialog]')",'Viewer orqaga');
   await click('.so-post [aria-label="Izohlar"]');await until("!!document.querySelector('.so-comments textarea')",'Izohlar sheet');await until("!document.querySelector('.so-comments [role=status]')",'Izohlar yuklandi');
   await input('.so-comments textarea','Mobil izoh '+width);await delay(70);await evaluate("document.querySelector('.so-comments form').requestSubmit()");await until(`document.querySelector('.so-comments ul')?.textContent.includes('Mobil izoh ${width}')`,'Izoh yuborish');
   await click('.so-comment-tools button');await input('.so-comment-edit textarea','Yangilangan '+width);await delay(70);await click('.so-comment-edit button');await until(`document.querySelector('.so-comments ul')?.textContent.includes('Yangilangan ${width}')`,'Izoh tahriri');
   await until("!!document.querySelector('.so-comment-tools button:nth-child(2)')",'Tahrir saqlandi');await click('.so-comment-tools button:nth-child(2)');await until("Array.from(document.querySelectorAll('.so-comment-tools button')).some(node=>node.textContent==='O‘chirishni tasdiqlash')",'O‘chirish tasdig‘i');await evaluate("Array.from(document.querySelectorAll('.so-comment-tools button')).find(node=>node.textContent==='O‘chirishni tasdiqlash').click()");await until("!document.querySelector('.so-comments li')",'Izoh o‘chirish');await click('.so-dialog-scope .bx-sheet-head button');
   await click('.so-post [aria-label="Like"]');await until("document.querySelector('.so-post [aria-label=\"Like\"]').getAttribute('aria-pressed')==='false'",'Unlike');await click('.so-post .so-save');await until("document.querySelector('.so-post .so-save').getAttribute('aria-pressed')==='false'",'Unsave');await click('.so-post .so-follow');await until("document.querySelector('.so-post .so-follow').getAttribute('aria-pressed')==='false'",'Unfollow');
   await evaluate(`document.querySelector('.so-post .so-gallery img').src=${JSON.stringify(base+'/api/media/99999999')}`);await until("!!document.querySelector('.so-gallery-placeholder')",'Yo‘q media placeholderi');
   await go('/user');await until(width===320 ? "!!document.querySelector('.uh-barbers-compact')" : "!!document.querySelector('.uh-barbers-detailed')", 'Home kartalari');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await shot('customer-home-'+width);
   if(width===320){await setFewBarbers();await go('/user');await until("!!document.querySelector('.uh-barbers-detailed .uh-book-action')",'Kam sartarosh batafsil Home');}
   // Keyingi o‘lchamda batafsil kartalar tekshiriladi.
   await go('/user/barbers/'+barber.profileId+(width===1280?'?services='+services.map(service=>service.id).join(','):''));await until("document.querySelectorAll('.ib-service').length===2",'Xizmatlar');
   if(width===320)for(let i=1;i<=2;i++)await click('.ib-service:nth-child('+i+')');
   else assert.equal(await evaluate("document.querySelectorAll('.ib-service[aria-pressed=true]').length"),2);
   await evaluate(`Array.from(document.querySelectorAll('.ib-dates button')).find(node=>node.querySelector('strong').textContent===${JSON.stringify(date.slice(8))}).click()`);
   await until("document.querySelectorAll('.ib-hours button').length>0",'Soat oralig‘i');assert.equal(await evaluate("document.querySelectorAll('.ib-slots button').length"),0);
   await evaluate("Array.from(document.querySelectorAll('.ib-hours button')).find(node=>node.textContent.startsWith('09:00')).click()");await until("document.querySelectorAll('.ib-slots button').length>0",'5 daqiqalik vaqtlar');
   assert.equal(await evaluate("Array.from(document.querySelectorAll('.ib-slots button')).find(node=>node.textContent==='09:05').disabled"),true);
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.ib-slots')).gridTemplateColumns.split(' ').length"),4);
   if(width===320){await evaluate("Array.from(document.querySelectorAll('.ib-slots button')).find(node=>node.textContent==='09:35').click()");assert.match(await evaluate("document.querySelector('.ib-selection').textContent"),/09:35–10:05/);await click('.ib-booking > .ib-primary');await until("!!document.querySelector('.ib-confirm')",'Tasdiqlash');await click('.ib-confirm .ib-primary');await until("!!document.querySelector('.ib-success')",'Ko‘p xizmatli bron saqlandi');}
   else {assert.equal(await evaluate("Array.from(document.querySelectorAll('.ib-slots button')).find(node=>node.textContent==='09:35').disabled"),true);}
   await shot('booking-'+width);await actor(barber);await go('/barber');await until("document.querySelectorAll('.bx-home-service').length===2",'Dashboard xizmatlari');assert.ok(await evaluate("document.body.textContent.includes('Soch olish + Soqol olish')"));assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await shot('dashboard-'+width);
   await go('/barber/portfolio');await until("document.querySelector('.bx-portfolio-post img')?.naturalWidth>0",'Portfolio grid rasmi');
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.bx-portfolio-grid')).gridTemplateColumns.split(' ').length"),3);
   assert.ok(await evaluate("(()=>{const r=document.querySelector('.bx-portfolio-post').getBoundingClientRect();return Math.abs(r.width-r.height)<1;})()"));
   await click('.bx-portfolio-post');await until("document.querySelector('.bx-portfolio-viewer .so-gallery img')?.naturalWidth>0",'Portfolio galereyasi');
   assert.equal(await evaluate("document.querySelectorAll('.bx-portfolio-viewer .so-gallery figure').length"),2);await shot('portfolio-'+width);
  }
  assert.deepEqual(errors,[]);await send('Browser.close');
 }finally{ws?.close();chrome.kill('SIGTERM');}
}
module.exports={runSocialBookingBrowser};
