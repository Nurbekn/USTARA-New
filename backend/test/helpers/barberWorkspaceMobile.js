const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function runWorkspaceMobile({base,barber,token,artifacts,zeroEarnings}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-workspace-browser-'));
 const chrome=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});let ws;
 try{
 for(let n=0;n<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));n++)await delay(100);
 const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let seq=0;const pending=new Map(),errors=[];
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Fetch.requestPaused'){
  try{const response=await fetch(base+new URL(m.params.request.url).pathname);await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:response.status,responseHeaders:[{name:'Content-Type',value:response.headers.get('content-type')||'image/webp'}],body:Buffer.from(await response.arrayBuffer()).toString('base64')});}catch{await send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'});}
 }};
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Brauzer amali bajarilmadi: '+r.exceptionDetails.text);return r.result.value;};
 const until=async(expr,label)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(100);}throw Error(label+' kutish muddati tugadi');};
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));};
 const exp=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp;
 const session={...barber,accountId:barber.id,authenticated:true,authSource:'backend',tokenExpiresAt:exp*1000,setupDone:true,profile:{first_name:'Ali',last_name:'Valiyev'}};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Fetch.enable',{patterns:[{urlPattern:'*://localhost:5000/api/media/*'},{urlPattern:'*://127.0.0.1:5000/api/media/*'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('ustara-api-access-token',${JSON.stringify(token)});sessionStorage.setItem('ustara-session',${JSON.stringify(JSON.stringify(session))});const original=window.fetch.bind(window);window.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);return original(url.pathname.startsWith('/api/')?${JSON.stringify(base)}+url.pathname+url.search:input,options);};`});
 const go=async page=>{await send('Page.navigate',{url:(process.env.USTARA_FRONTEND_URL||'http://127.0.0.1:5173/USTARA-New')+'/barber/'+page});};
 await go('schedule');await until("document.querySelectorAll('.wh-toggle[aria-checked=\"true\"]').length===6",'Saqlangan jadval');
 assert.ok(await evaluate("!!document.querySelector('.bx-top-right .va-badge')"));assert.equal(await evaluate("document.querySelector('.bx-status').textContent.includes('noma')"),false);assert.ok(await evaluate("!!document.querySelector('.bx-status-dot')"));assert.equal(await evaluate("!!document.querySelector('.bx-status .va-badge')"),false);await shot('workspace-schedule');
 await go('services');await until("!!document.querySelector('.bx-btn-sm.bx-btn-primary')",'Xizmatlar');await evaluate("document.querySelector('.bx-btn-sm.bx-btn-primary').click()");await until("!!document.querySelector('.bx-sheet output')",'Davomiylik');assert.match(await evaluate("document.querySelector('.bx-sheet output').textContent"),/5/);
 for(let i=0;i<11;i++){await evaluate("document.querySelector('[aria-label=\"5 daqiqa qo‘shish\"]').click()");await delay(30);}
 assert.equal(await evaluate("document.querySelector('[aria-label=\"5 daqiqa qo‘shish\"]').disabled"),true);assert.match(await evaluate("document.querySelector('.bx-sheet output').textContent"),/1 soat/);await shot('workspace-service');
 await go('portfolio');await until("document.querySelector('.bx-portfolio-post img')?.naturalWidth>0",'Portfolio rasmi');assert.equal(await evaluate("document.querySelector('.bx-portfolio-stats div:nth-child(2) dd').textContent"),'0');await shot('workspace-portfolio');await evaluate("document.querySelector('.bx-portfolio-post').click()");await until("!!document.querySelector('.bx-reactions')",'Post ko‘rinishi');
 await until("!document.querySelector('[aria-label=\"Yoqtirish\"]').disabled",'Post holati');await evaluate("document.querySelector('[aria-label=\"Yoqtirish\"]').click()");await until("document.querySelector('[aria-label=\"Yoqtirish\"]').getAttribute('aria-pressed')==='true'",'Like');
 await evaluate("(()=>{const el=document.querySelector('.bx-comment-form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Yaxshi uslub');el.dispatchEvent(new Event('input',{bubbles:true}));})()");await delay(100);await evaluate("document.querySelector('.bx-comment-form').requestSubmit()");await until("document.querySelector('.bx-post-comments')?.textContent.includes('Yaxshi uslub')",'Izoh');assert.equal(await evaluate("document.body.textContent.includes('NaN')"),false);await shot('workspace-post');
 await go('portfolio');await until("!!document.querySelector('.bx-portfolio-post')",'Qayta portfolio');await evaluate("document.querySelector('.bx-portfolio-post').click()");await until("document.querySelector('[aria-label=\"Yoqtirish\"]')?.getAttribute('aria-pressed')==='true' && !document.querySelector('[aria-label=\"Yoqtirish\"]').disabled",'Like qayta yuklanganda');await until("document.querySelector('.bx-post-comments')?.textContent.includes('Yaxshi uslub')",'Izoh qayta yuklanganda');
 await go('earnings');await until("document.querySelectorAll('.bx-income-day').length===7",'Daromad');assert.match(await evaluate("document.querySelector('.bx-earn-total strong').textContent"),/50.*000/);await evaluate("Array.from(document.querySelectorAll('.bx-earn-period button')).find(b=>b.textContent.includes('30')).click()");await until("document.querySelectorAll('.bx-income-day').length===30",'30 kunlik diagramma');await shot('workspace-earnings');
 await zeroEarnings();await go('earnings');await until("document.querySelectorAll('.bx-income-day').length===7",'Nol daromad');assert.match(await evaluate("document.querySelector('.bx-earn-total strong').textContent"),/^0 /);await shot('workspace-earnings-zero');
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);await send('Browser.close');
 }finally{ws?.close();chrome.kill('SIGTERM');}
}
module.exports={runWorkspaceMobile};
