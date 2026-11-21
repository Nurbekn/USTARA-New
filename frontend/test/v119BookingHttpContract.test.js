import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';

// Run the real client/request modules without needing a Vite installation.
async function moduleUrl(url) {
  let code = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    code = code.replace(match[0], `from "${await moduleUrl(new URL(match[1], url))}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const booking = await import(await moduleUrl(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const slots = await import(await moduleUrl(new URL('../src/pages/user/barber/availableSlots.js',import.meta.url)));
const confirmation = await import(new URL('../src/pages/user/barber/bookingConfirmation.js',import.meta.url));
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.sessionStorage;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = originalStorage;
});
function storage() {
  const values = new Map();
  globalThis.sessionStorage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  return values;
}
const reqId = '62e49d0a-e996-4d82-9361-ad517a79a987';
const source = {barberId:7, serviceIds:[11,12], date:'2030-04-07', time:'10:00',token:'customer-private-jwt',
  expectedTotalPrice:'85000.00',expectedDurationMinutes:35,customerProfileId:3,
  expectedCancellationPolicy:{cutoff_minutes:60,text:'Kamida 1 soat oldin'},requestId:reqId};
const receipt = {id:41,customer_id:3,barber_id:7,service_id:11,booking_time:'2030-04-07T10:00:00+05:00',duration_minutes:35,
  total_price:'85000.00',status:'confirmed',services:[{id:11,name:'Soch',price:'50000.00'},{id:12,name:'Soqol',price:'35000.00'}]};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('v119 #42/#52: POST has Bearer token, no-store, exact quote, services, policy, request ID',async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return response({message:'OK',data:receipt},201);};
  const result=await booking.createBooking({...source});
  assert.equal(result.data.id,41);
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].url).pathname,'/api/bookings');
  assert.equal(calls[0].opts.method,'POST');
  assert.equal(new Headers(calls[0].opts.headers).get('Authorization'),'Bearer customer-private-jwt');
  assert.equal(new Headers(calls[0].opts.headers).get('Content-Type'),'application/json');
  assert.equal(calls[0].opts.cache,'no-store');
  assert.equal(calls[0].opts.credentials,'omit');
  assert.deepEqual(JSON.parse(calls[0].opts.body),{
    barber_id:7,service_ids:[11,12],booking_time:'2030-04-07T10:00:00+05:00',
    expected_total_price:'85000.00',expected_duration_minutes:35,
    expected_cancellation_policy:{cutoff_minutes:60,text:'Kamida 1 soat oldin'},request_id:reqId,
  });
});

test('v119 #100: caller AbortSignal cancels authenticated booking POST',async()=>{
  const controller=new AbortController(); let seenSignal;
  globalThis.fetch=async(_url,opts)=>{
    seenSignal=opts.signal;
    return await new Promise((_resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  };
  const job=booking.createBooking({...source,signal:controller.signal});
  await Promise.resolve();controller.abort();
  await assert.rejects(job,error=>error.code==='request_aborted' && error.status===0);
  assert.equal(seenSignal.aborted,true);
});

test('v119: no token => no POST, neither browser state nor hidden auth is assumed',async()=>{
  let count=0;globalThis.fetch=async()=>{count++;return response({data:receipt},201)};
  await assert.rejects(booking.createBooking({...source,token:''}),error=>error.status===401);
  assert.equal(count,0);
});

test('v119 #5: legacy one-service submission remains compatible, with Authorization',async()=>{
  const calls=[];
  const single={...receipt,service_id:11,services:[receipt.services[0]],duration_minutes:20,total_price:'50000.00'};
  globalThis.fetch=async(_url,opts)=>{calls.push(opts);return response({data:single},201)};
  const result=await booking.createBooking({barberId:7,serviceId:11,date:source.date,time:source.time,token:source.token,
    expectedTotalPrice:'50000.00',expectedDurationMinutes:20,customerProfileId:3});
  assert.equal(result.data.id,41);
  assert.equal(new Headers(calls[0].headers).get('Authorization'),`Bearer ${source.token}`);
  const body=JSON.parse(calls[0].body);
  assert.equal(body.service_id,11);
  assert.equal('service_ids' in body,false);
});

test('v119 #6/#92: GET server slot -> captured quote -> authenticated POST keeps matching context',async()=>{
  const requests=[];
  globalThis.fetch=async(url,opts)=>{
    const u=new URL(url);requests.push({path:u.pathname,opts});
    if(u.pathname==='/api/bookings/available-slots') {
      assert.equal(u.searchParams.get('barber_id'),'7');
      assert.equal(u.searchParams.get('service_ids'),'11,12');
      return response({date:source.date,service_ids:source.serviceIds,working:true,accepting_bookings:true,
        duration:35,total_price:'85000.00',slots:[{start:'10:00',end:'10:35'}]});
    }
    return response({data:receipt},201);
  };
  const result=await slots.loadAvailableSlots({barberId:7,serviceIds:[11,12],date:source.date,token:source.token});
  const now=1_900_000_000_000;
  const chosen=result.slots.find(s=>s.time==='10:00');
  const input={barberId:7,serviceIds:[11,12],date:source.date,selected:chosen,quote:result.total_price,duration:result.duration,
    policy:{cutoff_minutes:60,text:'Kamida 1 soat oldin'},quoteReceivedAt:now,serviceName:'Soch + Soqol'};
  const snapshot=confirmation.captureBookingConfirmation(input,now+1);
  assert.ok(snapshot);
  assert.equal(confirmation.isBookingConfirmationCurrent(snapshot,input,now+2),true);
  const created=await booking.createBooking({...source,expectedTotalPrice:snapshot.price,expectedDurationMinutes:snapshot.duration});
  assert.equal(created.data.status,'confirmed');
  assert.deepEqual(requests.map(r=>r.path),['/api/bookings/available-slots','/api/bookings']);
  assert.ok(requests.every(r=>new Headers(r.opts.headers).get('Authorization')===`Bearer ${source.token}`));
});

test('v119 #52: server price mismatch is NOT a booking success',async()=>{
  globalThis.fetch=async()=>response({data:{...receipt,total_price:'90000.00'}},201);
  await assert.rejects(booking.createBooking({...source}),{code:'booking_confirmation_unverified'});
});

test('v119: invalid day, time and 21 services are rejected before POST',async()=>{
  let count=0;globalThis.fetch=async()=>{count++;return response({data:receipt},201)};
  await assert.rejects(booking.createBooking({...source,date:'2030-02-30'}));
  await assert.rejects(booking.createBooking({...source,time:'10:03'}));
  await assert.rejects(booking.createBooking({...source,serviceIds:Array.from({length:21},(_,i)=>i+1)}));
  assert.equal(count,0);
});

test('v119 #144: unknown POST response reuses the same authenticated idempotency key',async()=>{
  storage();const keys=[];
  globalThis.fetch=async(_url,opts)=>{
    assert.equal(new Headers(opts.headers).get('Authorization'),`Bearer ${source.token}`);
    keys.push(JSON.parse(opts.body).request_id);
    return response({code:'booking_result_unknown',message:'Uncertain commit'},503);
  };
  const submit=booking.createBookingSubmitter();
  const selection={...source,accountId:19,requestId:undefined};
  await assert.rejects(submit(selection),{code:'booking_result_unknown'});
  await assert.rejects(submit(selection),{code:'booking_result_unknown'});
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
  assert.equal(submit.pending().accountId,19);
});

test('v119: 409 in-progress keeps same idempotency key; different selection is blocked',async()=>{
  storage();const ids=[];
  globalThis.fetch=async(_url,opts)=>{ids.push(JSON.parse(opts.body).request_id);return response({code:'booking_in_progress'},409);};
  const submit=booking.createBookingSubmitter();
  const selection={...source,accountId:19,requestId:undefined};
  await assert.rejects(submit(selection),{code:'booking_in_progress'});
  assert.equal(submit.pending().requestId,ids[0]);
  await assert.rejects(submit({...selection,time:'10:05'}),{code:'booking_recovery_required'});
  await assert.rejects(submit(selection),{code:'booking_in_progress'});
  assert.deepEqual(ids,[ids[0],ids[0]]);
});

test('v119: definitive 409 price_changed releases pending idempotency key',async()=>{
  storage();globalThis.fetch=async()=>response({code:'price_changed'},409);
  const submit=booking.createBookingSubmitter();
  await assert.rejects(submit({...source,accountId:19,requestId:undefined}),{code:'price_changed'});
  assert.equal(submit.pending(),null);
});

test('v119 #144: GET recovery never creates a new booking; missing key remains uncertain',async()=>{
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});return response({found:false,uncertain:true});
  };
  const result=await booking.checkBookingRecovery({requestId:reqId,token:source.token,customerProfileId:3});
  assert.deepEqual(result,{found:false,uncertain:true});
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.method,'GET');
  assert.equal(new Headers(calls[0].opts.headers).get('Authorization'),`Bearer ${source.token}`);
  assert.equal(new URL(calls[0].url).pathname,`/api/bookings/recovery/${reqId}`);
  assert.equal('body' in calls[0].opts,false);
});

test('v119: receipt recovery confirms ownership, rejects wrong customer',async()=>{
  globalThis.fetch=async()=>response({found:true,data:{...receipt,replayed:true}});
  const result=await booking.checkBookingRecovery({requestId:reqId,token:source.token,customerProfileId:3});
  assert.equal(result.found,true);
  globalThis.fetch=async()=>response({found:true,data:{...receipt,customer_id:9}});
  await assert.rejects(booking.checkBookingRecovery({requestId:reqId,token:source.token,customerProfileId:3}),/Bronlarim/);
});

test('v119: UI recovery rejects token/profile changes before accepting stale GET',async()=>{
  const ui=await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx',import.meta.url),'utf8');
  assert.match(ui,/latestSession\.profileId !== session\.profileId/);
  assert.match(ui,/latestSession\.token !== session\.token/);
});
