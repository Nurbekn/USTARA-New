"use strict";
// This is a REAL Chrome smoke of the already BUILT frontend, unlike the
// existing PG login E2E, which uses Vite's dev server. No test users needed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {servePages}=require('./helpers/v63StaticPages');
const {chromeBinary,chromeExited,stopChrome}=require('./helpers/v61ChromeLifecycle');
const {assertLocalDevtoolsUrl,createCdpTransport}=require('./helpers/v60ChromeCdp');
const {assertNavigation,waitForRoute,monitorRuntimeExceptions,monitorLocalAssetFailures}=require('./helpers/v64ChromeRoutes');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const enabled=process.env.NODE_ENV==='test' && process.env.USTARA_PAGES_BUILD_SMOKE==='1';
test('Published bundle: Chrome, real Vite dist and SPA fallback',{skip:!enabled,timeout:90000},async t=>{
 const dist=path.resolve(__dirname,'../../frontend/dist');
 const {verifyPagesOutput}=require('../../scripts/publish-tree-check.cjs');
 verifyPagesOutput(dist);
 const server=await servePages(dist);t.after(()=>server.close());
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ustara-v63-pages-'));
 const chrome=spawn(chromeBinary(),['--headless=new','--no-sandbox','--disable-gpu',
   '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
   '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let launchFailed=false;chrome.once('error',()=>{launchFailed=true;});
 t.after(async()=>{try{await stopChrome(chrome);}finally{
  await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }});
 let port=0;
 for(let i=0;i<100;i++){
  if(launchFailed||chromeExited(chrome))throw Error('Chrome launch failed');
  try{const n=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
   if(Number.isInteger(n)&&n>0&&n<=65535){port=n;break;}}catch{}
  await pause(100);
 }
 assert.ok(port,'Chrome CDP failed to start');
 const response=await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(5000)});
 assert.ok(response.ok);
 const targets=await response.json();
 const ws=new WebSocket(assertLocalDevtoolsUrl(targets.find(x=>x.type==='page')?.webSocketDebuggerUrl,port));
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('CDP open deadline exceeded')),5000);
  ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
  ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('CDP unavailable'));},{once:true});
 });
 const cdp=createCdpTransport(ws);t.after(()=>cdp.close());
 const runtimeErrors=monitorRuntimeExceptions(ws);t.after(()=>runtimeErrors.stop());
 const assetErrors=monitorLocalAssetFailures(ws,server.url);t.after(()=>assetErrors.stop());
 const send=cdp.send;
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error('Production page runtime exception');
  return result.result.value;
 };
 async function navigate(route,width){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
  assertNavigation(await send('Page.navigate',{url:server.url+'/USTARA-New/'+route}));
 }
 await t.test('mobile: 390px production login rendered',async()=>{
  await navigate('login?lang=ru',390);
  await waitForRoute(evaluate,'/USTARA-New/login','!!document.querySelector("input[type=tel]") && !!document.querySelector("#password")');
  runtimeErrors.assertClean();assetErrors.assertClean();
  assert.equal(await evaluate('innerWidth'),390);
  assert.equal(await evaluate('location.pathname'),'/USTARA-New/login');
  assert.equal(await evaluate('document.documentElement.lang'),'ru');
  assert.match(await evaluate('document.title'),/Вход/);
  assert.match(await evaluate('document.querySelector(\'meta[name="description"]\').content'),/барбера/);
 });
 await t.test('desktop: 1440px production admin rendered',async()=>{
  await navigate('admin?lang=en',1440);
  await waitForRoute(evaluate,'/USTARA-New/admin','!!document.querySelector("input[autocomplete=username]") && !!document.querySelector("input[autocomplete=current-password]")');
  assert.equal(await evaluate('location.pathname'),'/USTARA-New/admin');
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  assert.match(await evaluate('document.title'),/Administration/);
  runtimeErrors.assertClean();assetErrors.assertClean();
  assert.equal(await evaluate('innerWidth'),1440);
 });
 await t.test('SPA fallback: direct forgot-password route renders',async()=>{
  const fallback=await fetch(server.url+'/USTARA-New/forgot-password',{signal:AbortSignal.timeout(5000)});
  assert.equal(fallback.status,200);
  const html=await fallback.text();assert.match(html,/<div id="root"/);
  await navigate('forgot-password',390);
  await waitForRoute(evaluate,'/USTARA-New/forgot-password','document.body.innerText.includes("Parolni tiklash")');
  runtimeErrors.assertClean();assetErrors.assertClean();
  // v155: exercise direct QR and help routes on the SAME verified Vite bundle.
  // No network/API calls, no QR submission, no personal data or test identity.
  const qrToken='c'.repeat(48);
  const qrRoute=`/USTARA-New/queue/check-in/${qrToken}`;
  const qrFallback=await fetch(`${server.url}${qrRoute}?lang=ru`,{signal:AbortSignal.timeout(5000)});
  assert.equal(qrFallback.status,200);
  assert.match(await qrFallback.text(),/<div id="root"/);
  await navigate(`queue/check-in/${qrToken}?lang=ru`,390);
  await waitForRoute(evaluate,qrRoute,'!!document.querySelector("main form input[maxlength=60]")');
  assert.equal(await evaluate('document.documentElement.lang'),'ru');
  assert.equal(await evaluate('location.search'),'?lang=ru');
  runtimeErrors.assertClean();assetErrors.assertClean();
  const helpFallback=await fetch(server.url+'/USTARA-New/help?lang=en',{signal:AbortSignal.timeout(5000)});
  assert.equal(helpFallback.status,200);
  assert.match(await helpFallback.text(),/<div id="root"/);
  await navigate('help?lang=en',390);
  await waitForRoute(evaluate,'/USTARA-New/help','!!document.querySelector(".hc-page #hc-language")');
  assert.equal(await evaluate('document.documentElement.lang'),'en');
  assert.equal(await evaluate('document.querySelector("#hc-language").value'),'en');
  runtimeErrors.assertClean();assetErrors.assertClean();
 });
});
