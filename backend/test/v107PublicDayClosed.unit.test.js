'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');const prior=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createPublicSummary}=require('../controllers/queuePublicController');
if(prior)require.cache[dbPath]=prior;else delete require.cache[dbPath];
async function run(day_closed){
 let sql='';const handler=createPublicSummary({async query(q){sql=q;return {rowCount:1,
 rows:[{id:7,waiting_count:0,has_called:false,day_closed,typical_minutes:20,as_of:new Date()}]}}});
 const res={code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(x){this.body=x;return this;}};
 await handler({params:{barberId:'7'}},res);return {res,sql};
}
test('v107: public queue clearly indicates persisted closure without a fake ETA',async()=>{
 const {res,sql}=await run(true);
 assert.equal(res.code,200);assert.equal(res.body.day_closed,true);
 assert.equal(res.body.new_arrival_estimate,null);
 assert.match(res.body.estimate_note,/qabul qilinmaydi/);
 assert.match(sql,/barber_day_closures dc/);assert.match(sql,/Asia\/Tashkent/);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('v107: new-day open queue may still have a normal ETA',async()=>{
 const {res}=await run(false);assert.equal(res.body.day_closed,false);
 assert.ok(res.body.new_arrival_estimate);
});
for(const value of [null,undefined,'false',0,1]){
 test('v107: invalid closure database value never publishes an open ETA',async()=>{
  const {res}=await run(value);assert.equal(res.code,503);
 });
}
