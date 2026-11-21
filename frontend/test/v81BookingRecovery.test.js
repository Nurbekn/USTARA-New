import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const url=(source)=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(path){
 let text=(await readFile(path,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
 for(const match of text.matchAll(/from "([^"]+)"/g)){
   const dep=await load(new URL(match[1],path));
   text=text.replace(match[0],`from "${dep}"`);
 }
 return url(text);
}
const {createBookingSubmitter,checkBookingRecovery}=await import(await load(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const originalFetch=globalThis.fetch, originalStorage=globalThis.sessionStorage;
const account={barberId:23,serviceId:34,date:'2030-01-07',time:'10:00',token:'test-session-jwt',accountId:100};
const booking={id:61,customer_id:12,barber_id:23,service_id:34,booking_time:'2030-01-07T05:00:00Z',status:'confirmed',duration_minutes:30};
let records;
function storage(){
 records=new Map();
 globalThis.sessionStorage={getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
}
afterEach(()=>{
 globalThis.fetch=originalFetch;
 if(originalStorage===undefined)delete globalThis.sessionStorage;
 else globalThis.sessionStorage=originalStorage;
});
test('v81: unknown network outcome retains request ID and blocks changed time',async()=>{
 storage();let calls=0;
 globalThis.fetch=async()=>{calls++;throw new TypeError('lost response')};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account),{code:'network_error'});
 assert.ok(submit.pending()?.requestId);
 await assert.rejects(submit({...account,time:'11:00'}),{code:'booking_recovery_required'});
 assert.equal(calls,1);
});
test('v81: same selection can safely retry with identical request ID',async()=>{
 storage();const keys=[];
 globalThis.fetch=async(_url,opts)=>{keys.push(JSON.parse(opts.body).request_id);
   if(keys.length===1)throw new TypeError('lost');
   return new Response(JSON.stringify({data:booking}),{status:200});};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account),{code:'network_error'});
 await submit(account);
 assert.equal(keys[0],keys[1]);
 assert.equal(submit.pending(),null);
 assert.equal(records.size,0);
});
test('v81: recovery lookup is authorized GET with no request body',async()=>{
 let calls=0;
 globalThis.fetch=async(url,opts)=>{
   calls++;
   assert.match(url,/\/api\/bookings\/recovery\/550e8400-e29b-41d4-a716-446655440000$/);
   assert.equal(opts.method,'GET');
   assert.equal(opts.body,undefined);
   assert.equal(new Headers(opts.headers).get('Authorization'),'Bearer '+account.token);
   assert.equal(opts.cache,'no-store');
   return new Response(JSON.stringify({found:true,data:{...booking,replayed:true}}));
 };
 const recovered=await checkBookingRecovery({requestId:'550e8400-e29b-41d4-a716-446655440000',token:account.token});
 assert.equal(recovered.data.id,61);
 assert.equal(calls,1);
});
test('v81: absent result remains uncertain and pending key is preserved',async()=>{
 storage();globalThis.fetch=async()=>{throw new TypeError('lost')};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account),{code:'network_error'});
 const key=submit.pending().requestId;
 globalThis.fetch=async()=>new Response(JSON.stringify({found:false,uncertain:true}));
 assert.equal((await checkBookingRecovery({requestId:key,token:account.token})).found,false);
 assert.equal(submit.pending().requestId,key);
});
test('v81: clearPending requires explicit action and clears session storage',async()=>{
 storage();globalThis.fetch=async()=>{throw new TypeError('lost')};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account));
 assert.equal(submit.clearPending(),true);
 assert.equal(submit.pending(),null);
 assert.equal(records.size,0);
});
test('v81: clearing in-flight request is refused',async()=>{
 storage();let finish;
 globalThis.fetch=()=>new Promise(resolve=>{finish=resolve});
 const submit=createBookingSubmitter();
 const awaiting=submit(account);
 assert.equal(submit.clearPending(),false);
 finish(new Response(JSON.stringify({data:booking}),{status:201}));
 await awaiting;
 assert.equal(submit.pending(),null);
});
test('v81: recovery cannot be called with invalid ID or missing token',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected')};
 await assert.rejects(checkBookingRecovery({requestId:'oops',token:account.token}));
 await assert.rejects(checkBookingRecovery({requestId:'550e8400-e29b-41d4-a716-446655440000',token:''}));
 assert.equal(calls,0);
});
test('v81: malformed success response does not falsely confirm booking',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({found:true,data:{id:'61'}}));
 await assert.rejects(checkBookingRecovery({requestId:'550e8400-e29b-41d4-a716-446655440000',token:account.token}),/noto‘g‘ri/);
});
test('v81: switched account never reuses old account request ID',async()=>{
 storage();const ids=[];
 globalThis.fetch=async(_url,opts)=>{ids.push(JSON.parse(opts.body).request_id);
   if(ids.length===1)throw new TypeError('lost');
   return new Response(JSON.stringify({data:booking}),{status:201});};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account));
 await submit({...account,accountId:101});
 assert.notEqual(ids[0],ids[1]);
});
test('v81: forged or malformed stored request ID is never sent',async()=>{
 storage();records.set('ustara:pending-booking-request',JSON.stringify({signature:JSON.stringify([23,[34],'2030-01-07','10:00']),requestId:'fake'}));
 let got;
 globalThis.fetch=async(_url,opts)=>{got=JSON.parse(opts.body).request_id;return new Response(JSON.stringify({data:booking}),{status:201});};
 await createBookingSubmitter()(account);
 assert.match(got,/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
 assert.notEqual(got,'fake');
});
test('v81: recoverable storage contains account ID but never JWT',async()=>{
 storage();globalThis.fetch=async()=>{throw new TypeError('lost')};
 await assert.rejects(createBookingSubmitter()(account));
 const raw=[...records.values()].join('');
 assert.doesNotMatch(raw,/test-session-jwt/);
 assert.match(raw,/"accountId":100/);
});
test('v81: confirmed 409 clears uncertain key allowing a different selection',async()=>{
 storage();let n=0;
 globalThis.fetch=async()=>{n++;
   return n===1?new Response(JSON.stringify({message:'Band'}),{status:409})
     :new Response(JSON.stringify({data:{...booking,booking_time:'2030-01-07T06:00:00Z'}}),{status:201});};
 const submit=createBookingSubmitter();
 await assert.rejects(submit(account),{status:409});
 assert.equal(submit.pending(),null);
 await submit({...account,time:'11:00'});
 assert.equal(n,2);
});
