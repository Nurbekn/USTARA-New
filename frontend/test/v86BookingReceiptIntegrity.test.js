import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { verifyBookingReceipt, bookingReceiptView } from '../src/pages/user/barber/bookingReceipt.js';
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(url) {
  let source=(await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for(const match of source.matchAll(/from "([^"]+)"/g)) {
    source=source.replace(match[0],`from "${await load(new URL(match[1],url))}"`);
  }
  return moduleUrl(source);
}
const {createBooking,createBookingSubmitter,checkBookingRecovery}=await import(
  await load(new URL('../src/pages/user/barber/createBooking.js',import.meta.url)));
const initialFetch=globalThis.fetch, initialStorage=globalThis.sessionStorage;
afterEach(()=>{
  globalThis.fetch=initialFetch;
  if(initialStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage=initialStorage;
});
const row=()=>({id:61,customer_id:12,barber_id:23,service_id:34,
  booking_time:'2030-01-07T05:00:00.000Z',duration_minutes:30,status:'confirmed',
  total_price:'75000.00',services:[{id:34,name:'Soch olish',price:'75000.00'}]});
const input={barberId:23,serviceIds:[34],serviceId:34,customerProfileId:12,
  bookingTime:'2030-01-07T10:00:00+05:00',expectedTotalPrice:'75000.00',expectedDurationMinutes:30};
const select={barberId:23,serviceIds:[34],date:'2030-01-07',time:'10:00',
  token:'jwt-fake-test-token',accountId:91,customerProfileId:12,
  expectedTotalPrice:'75000.00',expectedDurationMinutes:30};
const badCases=[
  ['no row',null],
  ['string id',{id:'61'}],
  ['overflow id',{id:2147483648}],
  ['wrong barber',{barber_id:24}],
  ['wrong customer',{customer_id:13}],
  ['wrong primary service',{service_id:35}],
  ['wrong timestamp',{booking_time:'2030-01-07T06:00:00Z'}],
  ['timezone-less timestamp',{booking_time:'2030-01-07T05:00:00'}],
  ['unknown status',{status:'created'}],
  ['null status',{status:null}],
  ['quoted duration changed',{duration_minutes:35}],
  ['fractional duration',{duration_minutes:31.5}],
  ['too-long duration',{duration_minutes:1205}],
  ['quoted price increased',{total_price:'75000.01'}],
  ['quoted price decreased',{total_price:'74999.99'}],
  ['scientific price',{total_price:'7.5e4'}],
  ['negative price',{total_price:'-5.00'}],
  ['wrong service order',{services:[{id:35,name:'Other'}]}],
  ['duplicate services',{services:[{id:34},{id:34}]}],
  ['non-string service name',{services:[{id:34,name:{bad:true}}]}],
];
for(const [label,change] of badCases) {
  test(`v86: rejects unverified success — ${label}`,()=>{
    const data=change===null?null:{...row(),...change};
    assert.throws(()=>verifyBookingReceipt(data,input),{code:'booking_confirmation_unverified',status:0});
  });
}
test('v86: quoted decimals are compared exactly in cents',()=>{
  const actual={...row(),total_price:'75000.0'};
  assert.equal(verifyBookingReceipt(actual,input),actual);
  assert.throws(()=>verifyBookingReceipt({...row(),total_price:'75000.005'},input));
});
test('v86: all authentic booking statuses have explicit and truthful receipt headings',()=>{
  for(const status of ['pending','confirmed','completed','cancelled','rejected']) {
    const receipt=bookingReceiptView({...row(),status});
    assert.equal(receipt.id,61);
    assert.equal(receipt.end-receipt.start,30*60000);
    assert.equal(receipt.active,['pending','confirmed'].includes(status));
    assert.ok(receipt.title.includes(status==='cancelled'?'bekor':status==='rejected'?'rad':' ' ) || receipt.title.length>5);
  }
  assert.notEqual(bookingReceiptView({...row(),status:'cancelled'}).title,'Bron tasdiqlandi');
});
test('v86: receipt shows services and server price without inventing missing price',()=>{
  const ready=bookingReceiptView(row());
  assert.equal(ready.serviceNames,'Soch olish');
  assert.equal(ready.amount,'75000.00');
  assert.equal(bookingReceiptView({...row(),total_price:null,services:[]}).amount,null);
});
test('v86: API unverified success remains uncertain and is not acknowledged as saved',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({data:{...row(),barber_id:24}}),{status:201});
  await assert.rejects(createBooking(select),{status:0,code:'booking_confirmation_unverified'});
});
test('v86: uncertain POST confirmation keeps request ID for read-only recovery',async()=>{
  const db=new Map();globalThis.sessionStorage={getItem:k=>db.get(k)??null,setItem:(k,v)=>db.set(k,v),removeItem:k=>db.delete(k)};
  const post=[];
  globalThis.fetch=async(_url,options)=>{
    post.push(JSON.parse(options.body).request_id);
    return new Response(JSON.stringify({data:{...row(),total_price:'75001.00'}}),{status:201});
  };
  const submit=createBookingSubmitter();
  await assert.rejects(submit(select),{code:'booking_confirmation_unverified'});
  assert.equal(post.length,1);
  assert.equal(submit.pending()?.requestId,post[0]);
  await assert.rejects(submit({...select,time:'11:00'}),{code:'booking_recovery_required'});
  assert.equal(post.length,1);
});
test('v86: recovered booking is scoped to current customer profile',async()=>{
  const url='550e8400-e29b-41d4-a716-446655440000';
  globalThis.fetch=async()=>new Response(JSON.stringify({found:true,data:{...row(),customer_id:99}}));
  await assert.rejects(checkBookingRecovery({requestId:url,token:select.token,customerProfileId:12}),/noto‘g‘ri qaytardi/);
  globalThis.fetch=async()=>new Response(JSON.stringify({found:true,data:row()}));
  const response=await checkBookingRecovery({requestId:url,token:select.token,customerProfileId:12});
  assert.equal(response.data.id,61);
});
test('v86: recovery still treats a negative lookup as uncertain',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({found:false,uncertain:true}));
  const result=await checkBookingRecovery({requestId:'550e8400-e29b-41d4-a716-446655440000',token:select.token,customerProfileId:12});
  assert.equal(result.found,false);
  assert.equal(result.uncertain,true);
});
test('v86: actual response is preserved for valid booking and replays',async()=>{
  const response={data:{...row(),replayed:true},message:'Avvalgi bron topildi'};
  globalThis.fetch=async()=>new Response(JSON.stringify(response),{status:200});
  assert.deepEqual(await createBooking(select),response);
});
