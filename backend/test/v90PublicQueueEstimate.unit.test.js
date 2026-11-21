'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimateWait,typicalMinutes}=require('../services/queueLiveEstimate');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createPublicSummary}=require('../controllers/queuePublicController');
const data=rows=>({rows,rowCount:rows.length});
const response=()=>{const state={status:200,body:null,headers:{}};return {
  status(code){state.status=code;return this;},
  set(k,v){state.headers[k]=v;return this;},
  json(body){state.body=body;return this;},state,
};};
const row={id:7,waiting_count:2,has_called:false,day_closed:false,typical_minutes:30,as_of:new Date()};
test('an ordinary public ETA remains a visibly approximate 5-minute interval',()=>{
  assert.deepEqual(estimateWait(2,true,20),{min_minutes:15,max_minutes:90,approximate:true});
  assert.deepEqual(estimateWait(1,false,20),{min_minutes:0,max_minutes:30,approximate:true});
});
for(const val of [0,-1,Number.NaN,'bad',null])
 test('invalid or zero service duration uses rough fallback '+String(val),()=>{
  assert.equal(typicalMinutes(val),20);
 });
test('small positive average is rounded to nearest 5-minute upper bound',()=>{assert.equal(typicalMinutes(2.5),5);});
test('unreasonably long estimates become unknown, not multi-day predictions',()=>{
  assert.equal(estimateWait(500,true,90),null);
  assert.equal(estimateWait(2147483647,false,90),null);
  assert.equal(estimateWait(70,true,90),null);
  assert.deepEqual(estimateWait(2,false,5),{min_minutes:0,max_minutes:15,approximate:true});
});
test('one SQL statement uses consistent Tashkent date at midnight',async()=>{
 let sql;
 const handler=createPublicSummary({query:async(q)=>{sql=q;return data([row]);}});
 const res=response();await handler({params:{barberId:'7'}},res);
 assert.equal(res.state.status,200);
 assert.equal((sql.match(/statement_timestamp\(\)/g)||[]).length,4);
 assert.doesNotMatch(sql,/clock_timestamp\(\)/);
 assert.match(sql,/Asia\/Tashkent/);
 assert.match(sql,/q\.status='waiting'/);
 assert.match(sql,/q\.status IN \('called','arrived','in_service'\)/);
});
test('a large but valid queue preserves count while avoiding unsupported ETA',async()=>{
 const handler=createPublicSummary({query:async()=>data([{...row,waiting_count:1000}])});
 const res=response();await handler({params:{barberId:'7'}},res);
 assert.equal(res.state.status,200);
 assert.equal(res.state.body.waiting_count,1000);
 assert.equal(res.state.body.new_arrival_estimate,null);
 assert.equal(res.state.headers['Cache-Control'],'no-store');
 assert.match(res.state.body.as_of,/Z$/);
});
test('response keeps the minimal public contract without user/booking identities',async()=>{
 const handler=createPublicSummary({query:async()=>data([{...row,phone:'SECRET',user_id:9,display_label:'UNKNOWN'}])});
 const res=response();await handler({params:{barberId:'7'}},res);
 assert.equal(res.state.status,200);
 assert.deepEqual(Object.keys(res.state.body).sort(),
  ['barber_id','waiting_count','currently_called','day_closed','new_arrival_estimate','estimate_note','as_of'].sort());
 assert.equal(res.state.body.new_arrival_estimate.approximate,true);
});
test('unexpected database failures do not expose sensitive SQL or a fabricated queue',async()=>{
 const handler=createPublicSummary({query:async()=>{throw Object.assign(Error('sensitive DB host'),{code:'XX000'});}});
 const res=response();const old=console.error;console.error=()=>{};
 try{await handler({params:{barberId:'7'}},res);}finally{console.error=old;}
 assert.equal(res.state.status,503);
 assert.equal(res.state.body.code,'queue_unavailable');
 assert.equal(Object.hasOwn(res.state.body,'waiting_count'),false);
 assert.doesNotMatch(JSON.stringify(res.state.body),/sensitive|host/);
});
