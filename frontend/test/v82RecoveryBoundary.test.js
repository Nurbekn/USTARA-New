import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(path) {
  let content=(await readFile(path,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for (const m of content.matchAll(/from "([^"]+)"/g)) {
    const dep=await load(new URL(m[1],path));content=content.replace(m[0],`from "${dep}"`);
  }
  return data(content);
}
const {createBookingSubmitter,checkBookingRecovery}=await import(await load(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const originalFetch=globalThis.fetch, originalStorage=globalThis.sessionStorage;
const base={barberId:23,serviceId:34,date:'2030-01-07',time:'10:00',token:'test-jwt',accountId:100};
const booking={id:42,barber_id:23,service_id:34,booking_time:'2030-01-07T05:00:00Z',duration_minutes:30,status:'confirmed'};
const key='ustara:pending-booking-request';
const oldId='550e8400-e29b-41d4-a716-446655440000';
let cache;
function storage() {
  cache=new Map();globalThis.sessionStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
}
function parked(accountId=100) {
  return {signature:JSON.stringify([23,[34],'2030-01-07','10:00']),requestId:oldId,
    ...(accountId===null?{}:{accountId})};
}
afterEach(()=>{
  globalThis.fetch=originalFetch;
  if(originalStorage===undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage=originalStorage;
});
test('v82: duplicate identical in-flight submission shares the same Promise and single POST', async()=>{
  storage();let finish,posts=0;
  globalThis.fetch=()=>{posts++;return new Promise(resolve=>{finish=resolve})};
  const submit=createBookingSubmitter();
  const first=submit(base),same=submit({...base});
  assert.equal(first,same);assert.equal(posts,1);
  finish(new Response(JSON.stringify({data:booking}),{status:201}));
  assert.equal((await first).data.id,42);assert.equal(submit.pending(),null);
});
for(const [label,modify] of [
 ['changed time',{time:'10:30'}],
 ['changed service',{serviceId:35}],
 ['changed barber',{barberId:25}],
 ['changed date',{date:'2030-01-08'}],
 ['changed account',{accountId:101}],
]) test(`v82: ${label} cannot piggyback on an in-flight booking`,async()=>{
  storage();let finish,posts=0;
  globalThis.fetch=()=>{posts++;return new Promise(resolve=>{finish=resolve})};
  const submit=createBookingSubmitter();
  const first=submit(base);
  await assert.rejects(submit({...base,...modify}),{status:409,code:'booking_in_progress'});
  assert.equal(posts,1);assert.ok(submit.pending());
  finish(new Response(JSON.stringify({data:booking}),{status:201}));
  assert.equal((await first).data.id,42);
});
test('v82: pending key from unknown owner cannot attach to authenticated customer',async()=>{
  storage();cache.set(key,JSON.stringify(parked(null)));
  let posts=0;globalThis.fetch=()=>{posts++;throw Error('unexpected')};
  const submit=createBookingSubmitter();
  await assert.rejects(submit(base),{status:409,code:'booking_recovery_owner_unknown'});
  assert.equal(posts,0);assert.equal(submit.pending().requestId,oldId);
});
test('v82: pending authenticated owner cannot be reused with unbound caller identity',async()=>{
  storage();cache.set(key,JSON.stringify(parked()));
  let posts=0;globalThis.fetch=()=>{posts++;throw Error('unexpected')};
  const submit=createBookingSubmitter();
  await assert.rejects(submit({...base,accountId:undefined}),{code:'booking_recovery_owner_unknown'});
  assert.equal(posts,0);assert.equal(submit.pending().requestId,oldId);
});
test('v82: matching owner still retries the same persisted UUID after a reload',async()=>{
  storage();cache.set(key,JSON.stringify(parked()));
  let sent;
  globalThis.fetch=async(_url,opt)=>{sent=JSON.parse(opt.body).request_id;return new Response(JSON.stringify({data:booking}),{status:200});};
  const submit=createBookingSubmitter();
  assert.equal((await submit(base)).data.id,42);
  assert.equal(sent,oldId);assert.equal(submit.pending(),null);assert.equal(cache.has(key),false);
});
test('v82: missing uncertainty flag on a negative recovery response fails closed',async()=>{
  for(const body of [{found:false},{found:false,uncertain:false},{found:false,uncertain:'true'}]){
    globalThis.fetch=async()=>new Response(JSON.stringify(body));
    await assert.rejects(checkBookingRecovery({requestId:oldId,token:base.token}),/noto‘g‘ri/);
  }
});
test('v82: confirmed negative lookup remains uncertain, never clears pending request',async()=>{
  storage();cache.set(key,JSON.stringify(parked()));
  globalThis.fetch=async()=>new Response(JSON.stringify({found:false,uncertain:true}));
  const submit=createBookingSubmitter();
  assert.deepEqual(await checkBookingRecovery({requestId:oldId,token:base.token}),{found:false,uncertain:true});
  assert.equal(submit.pending().requestId,oldId);
});
test('v82: 503 recovery failure does not clear an unresolved booking key',async()=>{
  storage();cache.set(key,JSON.stringify(parked()));
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'recovery_unavailable',message:'Try later'}),{status:503});
  const submit=createBookingSubmitter();
  await assert.rejects(checkBookingRecovery({requestId:oldId,token:base.token}),{status:503});
  assert.equal(submit.pending().requestId,oldId);
});
test('v82: malformed pending owner is rejected without reusing forged request ID',async()=>{
  storage();cache.set(key,JSON.stringify({...parked(),accountId:'100'}));
  let sent;globalThis.fetch=async(_url,opt)=>{sent=JSON.parse(opt.body).request_id;return new Response(JSON.stringify({data:booking}),{status:201});};
  const submit=createBookingSubmitter();
  await submit(base);
  assert.notEqual(sent,oldId);
});
