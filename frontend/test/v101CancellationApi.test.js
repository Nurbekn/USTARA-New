import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
// Same real browser transport, auth and model used by existing booking tests.
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadModule(url) {
  let source=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for(const match of source.matchAll(/(from\s+|import\()(['"])([^'"]+)\2/g)) {
    const path=match[3].endsWith('.js')?match[3]:`${match[3]}.js`;
    const dependency=await loadModule(new URL(path,url));
    source=source.replace(match[0],`${match[1]}${match[2]}${dependency}${match[2]}`);
  }
  return moduleUrl(source);
}
const model=await import(await loadModule(new URL('../src/pages/user/bookings/model.js',import.meta.url)));
const originalFetch=globalThis.fetch;
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
const store=new Map();
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  getItem:k=>store.get(k)??null, setItem:(k,v)=>store.set(k,v), removeItem:k=>store.delete(k),
}});
function session(version=1, role='customer') {
  const claims={id:91,profileId:12,role,exp:Math.floor(Date.now()/1000)+3600};
  const token=`test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.v${version}`;
  store.set('ustara-api-access-token',token);
  store.set('ustara-session',JSON.stringify({role,phone:'+998901234567',accountId:91,profileId:12,authenticated:true,authSource:'backend',tokenExpiresAt:claims.exp*1000}));
  return token;
}
const booking={id:61,startsAt:'2030-01-07T05:00:00Z',barber:{id:23},services:[{id:34}]};
const nowMs=Date.parse('2030-01-06T10:00:00Z');
beforeEach(()=>{store.clear();session();});
afterEach(()=>{globalThis.fetch=originalFetch;store.clear();});
after(()=>{if(previousStorage)Object.defineProperty(globalThis,'sessionStorage',previousStorage);else delete globalThis.sessionStorage;});

test('v101 after confirmed cancel fetches authenticated free times without creating a booking',async()=>{
  const requests=[];
  const token=store.get('ustara-api-access-token');
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);requests.push({path:parsed.pathname,method:options.method});
    assert.equal(options.method,'GET');
    assert.equal(new Headers(options.headers).get('Authorization'),`Bearer ${token}`);
    assert.equal(parsed.pathname,'/api/bookings/available-slots');
    assert.equal(parsed.searchParams.get('barber_id'),'23');
    assert.equal(parsed.searchParams.get('service_ids'),'34');
    const date=parsed.searchParams.get('date');
    return new Response(JSON.stringify({ date,duration:30,working:true,slots:[{start:'10:00',end:'10:30'}] }));
  };
  const alternatives=await model.loadCancellationAlternatives(booking,{nowMs});
  assert.ok(alternatives.slots.length>0);
  assert.ok(requests.length>=1);
  assert.ok(requests.every(x=>x.method==='GET'&&x.path==='/api/bookings/available-slots'));
});
test('v101 refuses to look up alternative times under a barber account',async()=>{
  session(1,'barber');let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('should not send');};
  await assert.rejects(model.loadCancellationAlternatives(booking,{nowMs}),{status:401});
  assert.equal(calls,0);
});
test('v101 a session change while fetching never returns old account results',async()=>{
  let respond;
  globalThis.fetch=()=>new Promise(resolve=>{respond=resolve;});
  const task=model.loadCancellationAlternatives(booking,{nowMs});
  for(let i=0;i<40&&!respond;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof respond,'function');
  session(2);
  respond(new Response(JSON.stringify({date:'2030-01-07',duration:30,working:true,
    slots:[{start:'10:00',end:'10:30'}]})));
  await assert.rejects(task,{status:409,code:'session_changed'});
});
test('v101 invalid services return a safe fallback and send no API calls',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('not expected');};
  const alternatives=await model.loadCancellationAlternatives({ ...booking, services:[{id:null}] },{nowMs});
  assert.equal(alternatives.reason,'service_unavailable');assert.equal(calls,0);
});
test('v101 server failure is not silently shown as no available slots',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'down'}),{status:503});
  await assert.rejects(model.loadCancellationAlternatives(booking,{nowMs}),/tekshirib bo‘lmadi/);
});
