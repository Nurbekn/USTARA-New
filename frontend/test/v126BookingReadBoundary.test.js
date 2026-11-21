import {test,beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
// Run the production booking model, session module and real HTTP adapter in
// Node with fake browser storage. No live account or PostgreSQL is required.
const toURL = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`;
async function loadModule(url) {
  let source = (await readFile(url,'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for(const m of source.matchAll(/(from\s+|import\()(['"])([^'"]+)\2/g)) {
    const path=m[3].endsWith('.js')?m[3]:`${m[3]}.js`;
    const dependency=await loadModule(new URL(path,url));
    source=source.replace(m[0],`${m[1]}${m[2]}${dependency}${m[2]}`);
  }
  return toURL(source);
}
const model=await import(await loadModule(new URL('../src/pages/user/bookings/model.js',import.meta.url)));
const originalFetch=globalThis.fetch;
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
const store=new Map();
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,value),
  removeItem:key=>store.delete(key),
}});
function setIdentity(version=1,profileId=12,role='customer') {
  const claims={id:91,profileId,role,exp:Math.floor(Date.now()/1000)+3600};
  const token=`test.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.v${version}`;
  store.set('ustara-api-access-token',token);
  store.set('ustara-session',JSON.stringify({role,phone:'+998901234567',accountId:91,
    profileId,authenticated:true,authSource:'backend',tokenExpiresAt:claims.exp*1000}));
  return token;
}
const row={id:61,customer_id:12,barber_id:23,service_id:34,booking_time:'2030-01-07T05:00:00Z',
  booking_end:'2030-01-07T05:30:00Z',status:'confirmed',duration_minutes:30,service_name:'Soch olish'};
const validService={id:34,barber_id:23,name:'Soch olish',price:'25000.00',duration_minutes:30,is_active:true};
const response=value=>new Response(JSON.stringify(value));
async function waitForRequest(get) {
  for(let i=0;!get()&&i<50;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof get(),'function');
}
beforeEach(()=>{store.clear();setIdentity();});
afterEach(()=>{globalThis.fetch=originalFetch;store.clear();});
after(()=>{if(originalStorage)Object.defineProperty(globalThis,'sessionStorage',originalStorage);else delete globalThis.sessionStorage;});
for(const [name,run,body] of [
  ['list',()=>model.loadCustomerBookings(),[row]],
  ['detail',()=>model.loadCustomerBooking(61),row],
  ['service choices',()=>model.loadBookingServiceChoices({barber:{id:23}}),[validService]],
]) {
  test(`v126: ${name} rejects old session response after token rotation`,async()=>{
    let resolve;
    globalThis.fetch=()=>new Promise(complete=>{resolve=complete;});
    const pending=run();
    await waitForRequest(()=>resolve);
    setIdentity(2);
    resolve(response(body));
    await assert.rejects(pending,{status:409,code:'session_changed'});
  });
  test(`v126: ${name} rejects old response after customer identity switches`,async()=>{
    let resolve;
    globalThis.fetch=()=>new Promise(complete=>{resolve=complete;});
    const pending=run();
    await waitForRequest(()=>resolve);
    setIdentity(3,99);
    resolve(response(body));
    await assert.rejects(pending,{status:409,code:'session_changed'});
  });
}
test('v126: known booking fields only; no stray private API data enters UI model',async()=>{
  globalThis.fetch=async()=>response([{...row,customer_phone:'+998990000000',password_hash:'secret',
    account_token:'another-secret',customer_email:'private@example.test',internal_notes:'hidden',
    services:[{...validService,customer_phone:'private',internal_note:'hidden'}]}]);
  const [booking]=await model.loadCustomerBookings();
  for(const secret of ['customer_phone','password_hash','account_token','customer_email','internal_notes'])
    assert.equal(Object.hasOwn(booking,secret),false,secret);
  assert.deepEqual(booking.services,[{id:34,name:'Soch olish',price:25000,durationMinutes:30}]);
});
test('v126: invalid service snapshots and invalid totals are blocked',async()=>{
  for(const changes of [{services:'not an array'},{services:[{...validService,price:'NaN'}]},
    {services:[{...validService,id:0}]},{total_price:'not money'},{total_price:-1}]) {
    globalThis.fetch=async()=>response({...row,...changes});
    await assert.rejects(model.loadCustomerBooking(61));
  }
});
test('v126: service choices must be for same barber, active, valid and unique',async()=>{
  let calls=0;
  const use=async data=>{
    globalThis.fetch=async(url)=>{calls++;assert.equal(new URL(url).searchParams.get('barber_id'),'23');return response(data);};
    return model.loadBookingServiceChoices({barber:{id:23}});
  };
  assert.deepEqual(await use([validService,{...validService,id:35,is_active:false}]),[validService]);
  for(const bad of [[{...validService,barber_id:24}],[validService,validService],
    [{...validService,barber_id:null}],[{...validService,price:'invalid'}]])
    await assert.rejects(use(bad),/Xizmatlar ro‘yxati noto‘g‘ri/);
  assert.equal(calls,5);
});
test('v126: malformed API service list is never treated as empty success',async()=>{
  for(const invalid of [null,{},'ok']){
    globalThis.fetch=async()=>response(invalid);
    await assert.rejects(model.loadBookingServiceChoices({barber:{id:23}}));
  }
});
