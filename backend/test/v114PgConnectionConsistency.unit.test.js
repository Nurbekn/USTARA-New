'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isPgConnectionBroken}=require('../utils/pgConnectionHealth');
const {isBrokenScheduleConnection}=require('../services/barberScheduleWriteGuard');
const dbPath=require.resolve('../db');
const originalDb=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:queueHandlers}=require('../controllers/walkinQueueController');
const {createHandlers:qrHandlers}=require('../controllers/walkinQrController');
if(originalDb)require.cache[dbPath]=originalDb;else delete require.cache[dbPath];

for(const code of ['08000','08006','08P01','57P01','57P02','57P03','ECONNRESET','EPIPE','ENOTCONN','ETIMEDOUT','ECONNABORTED','ERR_STREAM_DESTROYED']){
 test(`v114 shared transport classifier: ${code}`,()=>{
  assert.equal(isPgConnectionBroken({code}),true);
  assert.equal(isBrokenScheduleConnection({code}),true);
 });
}
for(const code of ['23505','23503','40001','40P01','55P03','57014','XX000']){
 test(`v114 ordinary SQL error does not poison pool: ${code}`,()=>{
  assert.equal(isPgConnectionBroken({code}),false);
 });
}
test('v114 nested/wrapped socket codes are shared across controllers',()=>{
 const e={cause:{originalError:{cause:{code:'EPIPE'}}}};
 assert.equal(isPgConnectionBroken(e),true);
 assert.equal(isBrokenScheduleConnection(e),true);
 assert.equal(isPgConnectionBroken({errors:[{code:'XX000'},{cause:{code:'57P01'}}]}),true);
});
test('v114 cyclic and hostile unstructured error objects are bounded',()=>{
 const e={code:'40P01'};e.cause=e;
 assert.equal(isPgConnectionBroken(e),false);
 assert.equal(isPgConnectionBroken(undefined),false);
 assert.equal(isPgConnectionBroken({message:'Connection terminated unexpectedly'}),true);
 assert.equal(isPgConnectionBroken({message:'user typed connection terminated unexpectedly in request'}),false);
});
function response(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};}
function dbFailure({at='SET LOCAL',code='08006',nested=false}={}){
 const sql=[],releases=[];
 const client={async query(q){
   sql.push(q);
   if(q.startsWith(at)){
    const problem=new Error('private connection string must not be exposed');
    if(nested)problem.cause={code};else problem.code=code;
    throw problem;
   }
   if(q.includes('FROM barbers b JOIN users'))return {rowCount:1,rows:[{id:7}]};
   return {rowCount:0,rows:[]};
  },release(discard){releases.push(Boolean(discard));}};
 return {sql,releases,db:{async connect(){return client;}}};
}
for(const scope of ['queue mutation','queue private list','queue day-close preview','qr mutation']){
 for(const code of ['08006','57P01','EPIPE']){
  test(`v114 ${scope}: ${code} before COMMIT discards despite successful ROLLBACK`,async()=>{
   const f=dbFailure({code});const res=response();
   const actor={role:'barber',id:3,profileId:7};
   const original=console.error;console.error=()=>{};
   try{
    if(scope==='queue mutation')await queueHandlers(f.db).join({user:actor,body:{request_id:'b'.repeat(32)}},res);
    else if(scope==='queue private list')await queueHandlers(f.db).list({user:actor},res);
    else if(scope==='queue day-close preview')await queueHandlers(f.db).dayClosePreview({user:actor},res);
    else await qrHandlers(f.db).tokenCreate({user:actor,headers:{},body:{origin:'http://localhost:5173'}},res);
   }finally{console.error=original;}
   assert.equal(res.statusCode,503);assert.equal(res.headers['Cache-Control'],'no-store');
   assert.deepEqual(f.releases,[true]);assert.equal(f.sql.at(-1),'ROLLBACK');
   assert.equal(f.sql.includes('COMMIT'),false);
   assert.doesNotMatch(JSON.stringify(res.body),/private connection string/i);
  });
 }
}
for(const scope of ['queue mutation','queue private list','qr mutation']){
 test(`v114 ${scope}: ordinary SQL failure leaves connection reusable after ROLLBACK`,async()=>{
  const f=dbFailure({code:'23505'}),res=response();const user={role:'barber',id:3,profileId:7};
  const original=console.error;console.error=()=>{};
  try{
   if(scope==='queue mutation')await queueHandlers(f.db).join({user,body:{request_id:'b'.repeat(32)}},res);
   else if(scope==='queue private list')await queueHandlers(f.db).list({user},res);
   else await qrHandlers(f.db).tokenCreate({user,headers:{},body:{origin:'http://localhost:5173'}},res);
  }finally{console.error=original;}
  assert.deepEqual(f.releases,[false]);assert.equal(f.sql.at(-1),'ROLLBACK');
 });
}
