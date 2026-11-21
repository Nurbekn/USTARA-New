'use strict';
// Production-only browser smoke helpers. A DOM element remaining from the
// previous navigation must never count as readiness for the next SPA route.
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assertNavigation(result){
 if(!result || typeof result.frameId!=='string' || !result.frameId || result.errorText)
  throw Error('Chrome navigation failed before production route readiness');
 return true;
}
async function waitForRoute(evaluate,pathname,condition,{attempts=100,pollMs=100,pause=delay}={}){
 if(typeof evaluate!=='function'|| (pathname.length>180 || !/^\/USTARA-New\/(?:[a-z][a-z0-9-]*\/)*[a-z0-9-]{1,80}$/.test(pathname))||
    typeof condition!=='string'||!condition ||
    !Number.isInteger(attempts)||attempts<1||attempts>150||
    !Number.isInteger(pollMs)||pollMs<0||pollMs>1000)
  throw Error('Chrome production route probe is invalid');
 const predicate=`location.pathname === ${JSON.stringify(pathname)} && (${condition})`;
 for(let i=0;i<attempts;i++){
  try{if(await evaluate(predicate))return true;}
  catch(error){
   // CDP execution contexts can be destroyed momentarily by Page.navigate.
   // Never swallow transport shutdown, timeouts or other unexpected failures.
   if(error?.message!=='CDP command failed')throw error;
  }
  if(i+1<attempts)await pause(pollMs);
 }
 throw Error('Chrome production route did not become ready');
}
function monitorRuntimeExceptions(ws){
 let errorCount=0;
 const onMessage=event=>{
  try{if(JSON.parse(event.data)?.method==='Runtime.exceptionThrown')errorCount++;}catch{}
 };
 ws.addEventListener('message',onMessage);
 return {
  assertClean(){if(errorCount)throw Error('Published JavaScript runtime exception');},
  stop(){ws.removeEventListener('message',onMessage);},
  get errors(){return errorCount;}
 };
}
// Watch only locally served compiled resources; external fonts are not
// evidence of a broken CI bundle and API requests are blocked by CSP.
function monitorLocalAssetFailures(ws,origin){
 const errors=[],requests=new Map();
 if(typeof origin!=='string'||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))
  throw Error('local asset monitor requires loopback origin');
 const important=new Set(['Script','Stylesheet','Font','Image']);
 const isLocalAsset=(url,type)=>typeof url==='string' && url.startsWith(origin+'/') &&
   (important.has(type)||/\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|avif|gif|ico|webmanifest)(?:[?#]|$)/i.test(url));
 const observe=event=>{
  let payload;try{payload=JSON.parse(event.data);}catch{return;}
  const p=payload?.params||{};
  if(payload.method==='Network.requestWillBeSent'){
   if(isLocalAsset(p.request?.url,p.type))
    requests.set(p.requestId,p.request.url);
  }else if(payload.method==='Network.loadingFailed'){
   if(requests.has(p.requestId))errors.push('asset-load-failed');
  }else if(payload.method==='Network.responseReceived'){
   if(isLocalAsset(p.response?.url,p.type))requests.set(p.requestId,p.response.url);
   if(requests.has(p.requestId)&&p.response?.status>=400)errors.push('asset-http-error');
  }
 };
 ws.addEventListener('message',observe);
 return {assertClean(){if(errors.length)throw Error('Published local asset load failed');},
  stop(){ws.removeEventListener('message',observe);requests.clear();},get errors(){return errors.length;}};
}
module.exports={assertNavigation,waitForRoute,monitorRuntimeExceptions,monitorLocalAssetFailures};
