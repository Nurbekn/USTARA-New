'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
const originalDb=require.cache[dbPath];
const calls=[],releases=[];
let failCode='08006',faultAt='SET LOCAL',nested=false;
const client={async query(sql){
 calls.push(sql);
 if(sql.startsWith(faultAt)){
  const e=Error('private slot DB connection string');
  if(nested)e.cause={code:failCode};else e.code=failCode;
  throw e;
 }
 return {rowCount:0,rows:[]};
},release(x){releases.push(Boolean(x));}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{connect:async()=>client}};
const {getAvailableSlots}=require('../controllers/bookingsController');
if(originalDb)require.cache[dbPath]=originalDb;else delete require.cache[dbPath];
function response(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};}
async function run(code,at='SET LOCAL',isNested=false){
 calls.length=0;releases.length=0;failCode=code;faultAt=at;nested=isNested;
 const req={query:{barber_id:'7',service_id:'3',date:'2035-01-01'}};
 const res=response();const original=console.error;console.error=()=>{};
 try{await getAvailableSlots(req,res);}finally{console.error=original;}
 return res;
}
for(const code of ['08006','57P01','ECONNRESET']){
 test(`v114 available slots: ${code} on read discards the connection`,async()=>{
  const r=await run(code);
  assert.equal(r.statusCode,500);assert.equal(r.headers['Cache-Control'],'no-store');
  assert.deepEqual(releases,[true]);assert.equal(calls.at(-1),'ROLLBACK');
  assert.doesNotMatch(JSON.stringify(r.body),/private slot/i);
 });
 test(`v114 available slots: ${code} on BEGIN discards without ROLLBACK`,async()=>{
  const r=await run(code,'BEGIN');
  assert.equal(r.statusCode,500);assert.deepEqual(releases,[true]);
  assert.equal(calls.includes('ROLLBACK'),false);
 });
}
test('v114 available slots: nested socket error also discards after ROLLBACK',async()=>{
 await run('EPIPE','SET LOCAL',true);assert.deepEqual(releases,[true]);
});
test('v114 available slots: ordinary SQL rejection rolls back and keeps healthy client',async()=>{
 await run('23505');assert.deepEqual(releases,[false]);assert.equal(calls.at(-1),'ROLLBACK');
});
test('v114 available slots: invalid parameters never open a transaction',async()=>{
 calls.length=0;releases.length=0;
 const res=response();await getAvailableSlots({query:{barber_id:'0',service_id:'3',date:'invalid'}},res);
 assert.equal(res.statusCode,400);assert.equal(calls.length,0);assert.equal(releases.length,0);
});
