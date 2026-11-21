'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { multiSlots } = require('../services/multiBooking');
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id:dbPath, filename:dbPath, loaded:true, exports:{} };
const {createPublicSummary} = require('../controllers/queuePublicController');

const rows = values => ({ rows:values, rowCount:values.length });
function availabilityFixture({ booked=true, active=true }={}) {
  const statements=[];
  let released;
  const pool={
    async connect() { return {
      async query(sql,args) {
        statements.push([sql,args]);
        if (/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(sql)) return rows([]);
        if (sql.startsWith('SELECT verification_status,accepting_bookings'))
          return rows([{verification_status:'approved',accepting_bookings:active}]);
        if (sql.startsWith('SELECT id,name,price,duration_minutes'))
          return rows([{id:12,name:'Soch olish',price:'45000.00',duration_minutes:15}]);
        if (sql.includes('FROM ustara_effective_day_schedule'))
          return rows([{start_time:'09:00:00',end_time:'10:00:00',breaks:[],now_minutes:-100}]);
        if (sql.includes('FROM bookings WHERE barber_id=$1'))
          return rows(booked ? [{start:560,end:580}] : []);
        throw Error('Unexpected SQL: '+sql);
      },
      release(broken) { released=broken??false; }
    }; }
  };
  return {pool,statements,get released(){return released;}};
}
const opts={barber_id:'7',service_ids:'12',date:'2030-01-07'};
test('public multi-service response has only free slot candidates; no occupied time blocks',async()=>{
  const f=availabilityFixture();
  const result=await multiSlots(f.pool,opts);
  assert.equal(result.working,true);
  assert.deepEqual(Object.keys(result).filter(k=>/busy|booked|reservation|customer/.test(k)),[]);
  assert.ok(result.slots.length>0);
  assert.equal(result.candidates.every(c=>c.available===true),true);
  assert.equal(result.candidates.some(c=>c.start==='09:10'),false);
  assert.equal(result.candidates.some(c=>c.start==='09:20'),false);
  assert.equal(result.candidates.some(c=>c.start==='09:40'),true);
  assert.deepEqual(result.slots,result.candidates.map(({start,end})=>({start,end})));
  assert.equal(f.released,false);
  assert.ok(f.statements.some(([sql])=>sql==='COMMIT'));
});
test('no booking: public response shows all available slots without inventing busy data',async()=>{
  const f=availabilityFixture({booked:false});
  const result=await multiSlots(f.pool,opts);
  assert.ok(result.slots.length>8);
  assert.equal(result.candidates.some(c=>c.available===false),false);
  assert.equal(Object.hasOwn(result,'busy'),false);
});
test('paused barber does not reveal availability or occupied slots',async()=>{
  const f=availabilityFixture({active:false});
  const result=await multiSlots(f.pool,opts);
  assert.equal(result.accepting_bookings,false);
  assert.deepEqual(result.slots,[]);
  assert.deepEqual(result.candidates,[]);
  assert.equal(Object.hasOwn(result,'busy'),false);
});
for (const [name,query] of [
  ['hex barber',{...opts,barber_id:'0x7'}],
  ['exponent barber',{...opts,barber_id:'7e0'}],
  ['leading zero barber',{...opts,barber_id:'07'}],
  ['oversized barber',{...opts,barber_id:'2147483648'}],
  ['fraction barber',{...opts,barber_id:'7.0'}],
  ['hex service',{...opts,service_ids:'0xc'}],
  ['exponent service',{...opts,service_ids:'12e0'}],
  ['blank service',{...opts,service_ids:'12,'}],
  ['leading zero service',{...opts,service_ids:'012'}],
  ['oversized service',{...opts,service_ids:'2147483648'}]
])test(name+' rejected before DB access',async()=>{
  await assert.rejects(multiSlots({connect(){throw Error('DB must not open');}},query),e=>e.status===400);
});
function response(){const state={status:200,body:null,headers:{}};return {
 set(k,v){state.headers[k]=v;return this;},status(n){state.status=n;return this;},json(x){state.body=x;return this;},state};}
const queueRow={id:7,waiting_count:3,has_called:true,day_closed:false,as_of:new Date(),typical_minutes:20};
test('public queue aggregate keeps approximate ETA but never personal fields',async()=>{
  const h=createPublicSummary({query:async()=>rows([{...queueRow,display_label:'private',phone:'secret',request_key:'hidden'}])});
  const res=response();await h({params:{barberId:'7'}},res);
  assert.equal(res.state.status,200);assert.equal(res.state.headers['Cache-Control'],'no-store');
  assert.equal(res.state.body.waiting_count,3);
  assert.equal(res.state.body.new_arrival_estimate.approximate,true);
  assert.deepEqual(Object.keys(res.state.body).sort(),['barber_id','waiting_count','currently_called','day_closed','new_arrival_estimate','estimate_note','as_of'].sort());
});
for (const bad of ['2147483648','0','-1','01','1e2','0x10','1.0',' ','99999999999999'])
 test('public queue invalid ID '+bad+' makes no DB query',async()=>{
  const h=createPublicSummary({query(){throw Error('DB not allowed');}});
  const res=response();await h({params:{barberId:bad}},res);
  assert.equal(res.state.status,400);assert.equal(res.state.headers['Cache-Control'],'no-store');
 });
for (const bad of [null,undefined,-1,NaN,1.5,Infinity,'1e2','-1','999999999999999999999999',true])
 test('malformed queue count '+String(bad)+' fails closed rather than showing zero',async()=>{
  const h=createPublicSummary({query:async()=>rows([{...queueRow,waiting_count:bad}])});
  const res=response();await h({params:{barberId:'7'}},res);
  assert.equal(res.state.status,503);assert.equal(res.state.body.code,'queue_unavailable');
  assert.equal(Object.hasOwn(res.state.body,'waiting_count'),false);
 });
for (const hasCalled of [0,1,'true',null,undefined])
 test('malformed currently_called '+String(hasCalled)+' fails closed',async()=>{
  const h=createPublicSummary({query:async()=>rows([{...queueRow,has_called:hasCalled}])});
  const res=response();await h({params:{barberId:'7'}},res);
  assert.equal(res.state.status,503);
 });
