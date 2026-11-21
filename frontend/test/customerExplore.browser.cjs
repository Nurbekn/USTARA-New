// Faqat UI testi: API va xarita plitalari fixture; haqiqiy baza ishlatilmaydi.
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ustara-customer-home-'));
 const browser=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+root,'about:blank'],{stdio:'ignore'});let ws;
 try{
  for(let n=0;n<100&&!fs.existsSync(path.join(root,'DevToolsActivePort'));n++)await delay(100);
  const port=fs.readFileSync(path.join(root,'DevToolsActivePort'),'utf8').split('\n')[0];const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0;const pending=new Map(),network=[],errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.onmessage=async event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);else if(m.method==='Fetch.requestPaused')await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1kAAAAASUVORK5CYII='});};
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser amali bajarilmadi');return r.result.value;};
  const until=async(expression,label)=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(100);}throw Error(label+' kutish muddati tugadi');};
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(root,name+'.png'),Buffer.from(r.data,'base64'));};
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*://*.tile.openstreetmap.org/*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const exp=Math.floor(Date.now()/1000)+3600;const token='test.'+btoa(JSON.stringify({id:1,profileId:1,role:'customer',exp}))+'.test';
    sessionStorage.setItem('ustara-api-access-token',token);sessionStorage.setItem('ustara-session',JSON.stringify({accountId:1,profileId:1,role:'customer',phone:'+998900000001',authenticated:true,authSource:'backend',tokenExpiresAt:exp*1000,profile:{first_name:'Ali',last_name:'Mijoz'}}));
    window.__calls=[];window.__empty=false;window.__failure=false;
    const people=[{id:1,first_name:'Ali',last_name:'Usta',location:{lat:41.301,lng:69.2}},{id:2,first_name:'Vali',last_name:'Usta',location:{lat:41.35,lng:69.3}},{id:3,first_name:'Soli',last_name:'Usta',location:{lat:42,lng:70}},{id:4,first_name:'Pending',last_name:'Usta',verification_status:'pending'}];
    const original=window.fetch.bind(window);window.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.startsWith('/api/'))return original(input,options);window.__calls.push(url.pathname);
      let body=[];let status=200;
      if(url.pathname==='/api/barbers'){body=window.__empty?[]:people;if(window.__failure){status=503;body={message:'Test server error'};}}
      if(url.pathname==='/api/customers/me')body={customer:{id:1,phone:'+998900000001',first_name:'Ali',last_name:'Mijoz',latitude:41.3,longitude:69.2}};
      if(url.pathname==='/api/social')body={following:['barber:3'],posts:[]};
      if(url.pathname==='/api/promotions')body=[2,4];
      if(url.pathname==='/api/bookings')body=window.__empty?[]:[{id:20,customer_id:1,barber_id:2,service_id:1,booking_time:new Date(Date.now()+7200000).toISOString(),duration_minutes:30,status:'confirmed',barber_first_name:'Vali',barber_last_name:'Usta'},{id:10,customer_id:1,barber_id:1,service_id:1,booking_time:new Date(Date.now()+3600000).toISOString(),duration_minutes:30,status:'pending',barber_first_name:'Ali',barber_last_name:'Usta'}];
      return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
    };
  `});
  const base=process.env.USTARA_FRONTEND_URL||'http://127.0.0.1:5173/USTARA-New';
  await send('Page.navigate',{url:base+'/user'});await until("document.querySelectorAll('.uh-barbers .uh-barber-card').length===3",'Home natijalari');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.uh-barbers .uh-barber-card')).map(a=>a.getAttribute('href').split('/').pop())"),['3','1','2']);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.uh-upcoming')).map(a=>new URL(a.href).searchParams.get('booking'))"),['10','20']);
  assert.equal(await evaluate("document.querySelectorAll('.uh-featured .uh-barber-card').length"),1);
  assert.equal(await evaluate("document.querySelector('.uh-style-toggle').getAttribute('aria-expanded')"),'false');
  assert.equal(network.some(url=>/BarbersMap|leaflet|tile.openstreetmap/.test(url)),false);
  await shot('home');
  await evaluate("document.querySelector('.uh-map-link').click()");await until("document.querySelectorAll('#uh-map .ustara-barber-map-pin').length===3",'Home xarita');
  await evaluate("document.querySelector('.uh-map-link').click()");assert.equal(await evaluate("!!document.querySelector('#uh-map')"),false);
  await evaluate("document.querySelector('.uh-barbers .uh-section-heading a').click()");await until("document.querySelectorAll('.ex-result').length===3",'Qidiruv');
  assert.equal(await evaluate("document.querySelector('.ex-search input').placeholder"),'Sartarosh qidirish');
  const before=await evaluate("window.__calls.filter(p=>p==='/api/barbers').length");
  await evaluate("Array.from(document.querySelectorAll('.ex-view-switch button')).find(b=>b.textContent==='Xarita').click()");await until("document.querySelectorAll('.ustara-barber-map-pin').length===3",'Qidiruv xaritasi');
  await evaluate("(()=>{const input=document.querySelector('.ex-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Soli');input.dispatchEvent(new Event('input',{bubbles:true}));})()");await until("document.querySelectorAll('.ustara-barber-map-pin').length===1",'Filtrlangan marker');
  await shot('search-map');
  await evaluate("Array.from(document.querySelectorAll('.ex-view-switch button')).find(b=>b.textContent==='Ro‘yxat').click()");await until("document.querySelectorAll('.ex-result').length===1",'Filtrlangan ro‘yxat');assert.equal(await evaluate("window.__calls.filter(p=>p==='/api/barbers').length"),before);
  await evaluate("Array.from(document.querySelectorAll('.ex-view-switch button')).find(b=>b.textContent==='Xarita').click()");await until("document.querySelectorAll('.ustara-barber-map-pin').length===1",'Marker');await evaluate("document.querySelector('.ustara-barber-map-pin').click()");await until("location.pathname.endsWith('/user/barbers/3')",'Marker profili');
  // Empty va error holatlari API fixture o‘zgarishi bilan tekshiriladi.
  await evaluate("window.__empty=true;history.pushState({},'', '/USTARA-New/user');dispatchEvent(new PopStateEvent('popstate'))");await until("!!document.querySelector('.uh-empty')",'Bo‘sh Home');assert.equal(await evaluate("!!document.querySelector('.uh-booking-strip')"),false);
  await evaluate("window.__failure=true;history.pushState({},'', '/USTARA-New/user/explore');dispatchEvent(new PopStateEvent('popstate'))");await until("!!document.querySelector('.ex-state[role=alert]')",'Qidiruv xatosi');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);console.log(JSON.stringify({home:true,ranking:true,bookings:true,ads:true,lazyMap:true,sharedResults:true,markerProfile:true,empty:true,error:true,artifacts:root}));await send('Browser.close');
 }finally{ws?.close();browser.kill('SIGTERM');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
