import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { verifyBookingReceipt } from '../src/pages/user/barber/bookingReceipt.js';
// Import the REAL ESM browser transport under Node (without fake Vite installation).
async function moduleUrl(url) {
  let source=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for(const match of [...source.matchAll(/from ["']([^"']+)["']/g)])
    source=source.replace(match[0],`from "${await moduleUrl(new URL(match[1],url))}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const {createBooking,createBookingSubmitter,checkBookingRecovery}=await import(await moduleUrl(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const originalFetch=globalThis.fetch, originalStore=globalThis.sessionStorage;
afterEach(()=>{
  globalThis.fetch=originalFetch;
  if(originalStore === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage=originalStore;
});
const uuid='62e49d0a-e996-4d82-9361-ad517a79a987';
const source={barberId:7,serviceIds:[11,12],date:'2030-04-07',time:'10:00',token:'customer-1-jwt',accountId:19,customerProfileId:3,
  expectedTotalPrice:'85000.00',expectedDurationMinutes:35,expectedCancellationPolicy:{cutoff_minutes:60,text:'Bir soat oldin'}};
const booking={id:41,customer_id:3,barber_id:7,service_id:11,booking_time:'2030-04-07T10:00:00+05:00',duration_minutes:35,
  total_price:'85000.00',status:'confirmed',services:[{id:11},{id:12}]};
const output=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function storage(){const values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,val)=>values.set(key,val),removeItem:key=>values.delete(key)};return values;}
const signature=JSON.stringify([7,[11,12],'2030-04-07','10:00']);

test('v120 #52 price missing in server receipt is NOT success after quoted POST',async()=>{
  let posts=0; globalThis.fetch=async()=>{posts++;return output({data:{...booking,total_price:null}},201)};
  await assert.rejects(createBooking(source),{code:'booking_confirmation_unverified'});
  assert.equal(posts,1);
});
test('v120 #5 multi-service receipt cannot silently omit services',()=>{
  assert.throws(()=>verifyBookingReceipt({...booking,services:undefined},{serviceIds:[11,12]}),{code:'booking_confirmation_unverified'});
  assert.equal(verifyBookingReceipt(booking,{serviceIds:[11,12]}).id,41);
  assert.equal(verifyBookingReceipt({...booking,services:undefined},{serviceIds:[11]}).id,41);
});
test('v120 #52 malformed cancellation cutoff is rejected locally before booking POST',async()=>{
  let posts=0;globalThis.fetch=async()=>{posts++;return output({data:booking})};
  for(const bad of [{cutoff_minutes:-1,text:'abc'},{cutoff_minutes:10.5,text:'abc'},{cutoff_minutes:1,text:{}},{cutoff_minutes:10081,text:'abc'},[],null])
    await assert.rejects(createBooking({...source,expectedCancellationPolicy:bad}),/qoidalarini/);
  assert.equal(posts,0);
});
test('v120 #144 malformed explicit request_id is rejected locally',async()=>{
  let posts=0;globalThis.fetch=async()=>{posts++;return output({data:booking})};
  for(const bad of ['not-a-uuid','../../bad','',null,42])
    await assert.rejects(createBooking({...source,requestId:bad}),/identifikatori/);
  assert.equal(posts,0);
});
test('v120 #100 recovery matches original barber/time/ordered services',async()=>{
  const requests=[];
  globalThis.fetch=async(url,opts)=>{requests.push([url,opts]);return output({found:true,data:booking})};
  assert.equal((await checkBookingRecovery({requestId:uuid,token:source.token,customerProfileId:3,expectedSelection:signature})).found,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0][1].method,'GET');
  assert.equal(new Headers(requests[0][1].headers).get('Authorization'),`Bearer ${source.token}`);
  for(const bad of [{...booking,barber_id:8},{...booking,booking_time:'2030-04-07T11:00:00+05:00'},
    {...booking,services:[{id:12},{id:11}]},{...booking,service_id:12}]){
    globalThis.fetch=async()=>output({found:true,data:bad});
    await assert.rejects(checkBookingRecovery({requestId:uuid,token:source.token,customerProfileId:3,expectedSelection:signature}),/Bronlarim/);
  }
});
test('v120 #144 bad persisted booking selection is not trusted as a replay key',async()=>{
  const values=storage();values.set('ustara:pending-booking-request',JSON.stringify({signature:'["not a valid ID"]',requestId:uuid,accountId:19}));
  let sent;
  globalThis.fetch=async(_url,opts)=>{sent=JSON.parse(opts.body).request_id;return output({data:booking})};
  await createBookingSubmitter()(source);
  assert.notEqual(sent,uuid);
});
test('v120 #144 changed bearer token cannot piggyback on same in-flight booking',async()=>{
  storage();let complete,posts=0;
  globalThis.fetch=()=>{posts++;return new Promise(resolve=>complete=resolve)};
  const send=createBookingSubmitter();
  const original=send(source);
  await assert.rejects(send({...source,token:'another-session'}),{code:'booking_in_progress'});
  assert.equal(posts,1);
  complete(output({data:booking}));
  assert.equal((await original).data.id,41);
});
test('v120 #52 changed quote cannot piggyback on old in-flight booking',async()=>{
  storage();let complete,posts=0; globalThis.fetch=()=>{posts++;return new Promise(resolve=>complete=resolve)};
  const send=createBookingSubmitter(),first=send(source);
  await assert.rejects(send({...source,expectedTotalPrice:'90000.00'}),{code:'booking_in_progress'});
  assert.equal(posts,1);complete(output({data:booking}));await first;
});
test('v120 #100 inconsistent recovery responses cannot be shown as success',async()=>{
  for(const bad of [{found:false,uncertain:true,data:booking},{found:true,uncertain:true,data:booking},
    {found:false,uncertain:false},{found:true,data:null}]) {
    globalThis.fetch=async()=>output(bad);
    await assert.rejects(checkBookingRecovery({requestId:uuid,token:source.token,customerProfileId:3}),/noto‘g‘ri/);
  }
});
test('v120 #144 malformed expected selection causes no recovery GET',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return output({found:false,uncertain:true})};
  await assert.rejects(checkBookingRecovery({requestId:uuid,token:source.token,expectedSelection:'bad JSON'}));
  assert.equal(calls,0);
});
test('v120 #100 UI hands the pending selection to recovery verification',async()=>{
  const ui=await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx',import.meta.url),'utf8');
  assert.match(ui,/expectedSelection:attempt\.signature/);
  assert.match(ui,/latestSession\.profileId !== session\.profileId/);
});
