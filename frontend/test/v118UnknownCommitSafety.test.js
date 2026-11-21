import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
async function moduleUrl(url){
 let code=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
 for(const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) code=code.replace(match[0],`from "${await moduleUrl(new URL(match[1],url))}"`);
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const {createBookingSubmitter}=await import(await moduleUrl(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const {bookingNeedsRecovery,bookingRecoveryMessage}=await import(new URL('../src/pages/user/barber/bookingRecoveryFeedback.js',import.meta.url));
const oldFetch=globalThis.fetch,oldStorage=globalThis.sessionStorage;
afterEach(()=>{globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldStorage});
const selection={barberId:4,serviceId:5,date:'2030-01-05',time:'12:00',accountId:7,token:'dev-jwt'};
function storage(){const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};return values;}
test('v118 #52/#100: server 503 unknown COMMIT is not falsely reported as booking failure',async()=>{
 const values=storage();const requests=[];
 globalThis.fetch=async(_url,opts)=>{
  requests.push(JSON.parse(opts.body).request_id);
  return new Response(JSON.stringify({code:'booking_result_unknown',message:'ambiguous COMMIT'}),{status:503});
 };
 const submit=createBookingSubmitter();
 const err=await submit(selection).then(()=>null,e=>e);
 assert.equal(err?.status,503);assert.equal(err?.code,'booking_result_unknown');
 assert.equal(bookingNeedsRecovery(err),true);
 assert.match(bookingRecoveryMessage(err),/Bron yaratilgan bo‘lishi mumkin/);
 assert.ok(submit.pending()?.requestId);
 assert.equal(requests[0],submit.pending().requestId);
 assert.ok(values.size>0);
 await assert.rejects(submit({...selection,time:'12:05'}),{code:'booking_recovery_required'});
 assert.equal(requests.length,1);
});
test('v118 #52/#100 same selection reuses idempotency key after uncertain COMMIT',async()=>{
 storage();const keys=[];
 globalThis.fetch=async(_url,opts)=>{
  keys.push(JSON.parse(opts.body).request_id);
  return new Response(JSON.stringify({code:'booking_result_unknown'}),{status:503});
 };
 const submit=createBookingSubmitter();
 await assert.rejects(submit(selection),{code:'booking_result_unknown'});
 await assert.rejects(submit(selection),{code:'booking_result_unknown'});
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
});
test('v118 only recognized recovery codes are shown as uncertain',()=>{
 assert.equal(bookingNeedsRecovery({code:'booking_result_unknown'}),true);
 assert.equal(bookingNeedsRecovery({code:'booking_in_progress'}),true);
 assert.equal(bookingNeedsRecovery({code:'price_changed'}),false);
 assert.equal(bookingNeedsRecovery(null),false);
 assert.equal(bookingRecoveryMessage({code:'price_changed'}),null);
});
test('v118 UI maps booking_result_unknown to recovery, not generic "save failed"',async()=>{
 const ui=await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx',import.meta.url),'utf8');
 assert.match(ui,/const recoveryRequired = bookingNeedsRecovery\(error\)/);
 assert.match(ui,/error\.code === 'booking_result_unknown'/);
 assert.match(ui,/bookingRecoveryMessage\(error\)/);
});
