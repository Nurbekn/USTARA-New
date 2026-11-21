'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
const prev=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
if(prev)require.cache[dbPath]=prev;else delete require.cache[dbPath];
const basic=()=>({queue_date:'2026-11-20',as_of:'2026-11-20T10:00:00Z',closed:false,revision:0,waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0});
function fixture({row=basic(),authorized=true,commitFails=false,rollbackFails=false,queryFails=false,user={role:'barber',profileId:7,id:12}}={}){
 const queries=[],releases=[];
 const db={async connect(){return {async query(sql,args=[]){
   queries.push({sql,args});
   if(sql==='COMMIT' && commitFails)throw Error('connection lost');
   if(sql==='ROLLBACK' && rollbackFails)throw Error('rollback failed');
   if(sql.includes('SELECT b.id FROM barbers'))return {rowCount:authorized?1:0,rows:authorized?[{id:7}]:[]};
   if(sql.includes('WITH clock AS')){
     if(queryFails)throw Error('private database details');
     return {rowCount:row?1:0,rows:row?[row]:[]};
   }
   return {rowCount:0,rows:[]};
 },release(value){releases.push(value===true)}}}};
 const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(code){this.statusCode=code;return this},json(x){this.body=x;return this}};
 return {send:async()=>{await createHandlers(db).dayClosePreview({user,body:{}},res);return res},queries,releases};
}
test('v106: empty authorized queue produces read-only readiness snapshot',async()=>{
 const f=fixture(),r=await f.send();
 assert.equal(r.statusCode,200);assert.equal(r.body.ready,true);assert.equal(r.body.closed,false);
 assert.equal(r.body.read_only,true);assert.deepEqual(r.body.blockers,[]);
 assert.equal(r.body.queue_date,'2026-11-20');assert.equal(r.headers['Cache-Control'],'no-store');
 const q=f.queries.find(x=>x.sql.includes('WITH clock AS'));
 assert.deepEqual(q.args,[7]);assert.match(q.sql,/Asia\/Tashkent/);
 assert.ok(q.sql.includes('past_unresolved'));assert.ok(q.sql.includes("o.state IN ('open','offered','accepted')"));
 assert.ok(!f.queries.some(x=>/^(INSERT|UPDATE|DELETE|TRUNCATE)\s/i.test(x.sql)));
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});
for(const key of ['waiting','called','arrived','in_service','pending_qr','active_bookings','active_offers','past_unresolved']){
 test('v106: unresolved '+key+' blocks readiness without changing it',async()=>{
   const f=fixture({row:{...basic(),[key]:2}}),r=await f.send();
   assert.equal(r.statusCode,200);assert.equal(r.body.ready,false);
   assert.deepEqual(r.body.blockers,[key]);assert.equal(r.body.counts[key],2);
   assert.equal(f.queries.at(-1).sql,'COMMIT');
 });
}
test('v106: multiple blockers remain explicit and contain no identifiers',async()=>{
 const f=fixture({row:{...basic(),waiting:1,active_offers:3}}),r=await f.send();
 assert.deepEqual(r.body.blockers,['waiting','active_offers']);
 assert.equal(JSON.stringify(r.body).includes('display_label'),false);
});
for(const row of [null,{...basic(),waiting:-1},{...basic(),pending_qr:'0'},{...basic(),queue_date:'2026-11-XX'}]){
 test('v106: malformed database response never signals READY',async()=>{
  const r=await fixture({row}).send();assert.equal(r.statusCode,503);assert.notEqual(r.body.ready,true);
 });
}
test('v106: customer role rejected without DB connection',async()=>{
 const f=fixture({user:{role:'customer',profileId:7,id:12}}),r=await f.send();
 assert.equal(r.statusCode,403);assert.equal(f.queries.length,0);
});
test('v106: unapproved or deactivated barber is rejected',async()=>{
 const f=fixture({authorized:false}),r=await f.send();assert.equal(r.statusCode,403);
 assert.equal(f.queries.some(x=>x.sql.includes('WITH clock AS')),false);
});
test('v106: DB error returns generic unavailable, not private details',async()=>{
 const r=await fixture({queryFails:true}).send();assert.equal(r.statusCode,503);
 assert.ok(!JSON.stringify(r.body).includes('private database'));
});
test('v106: uncertain COMMIT quarantines DB connection',async()=>{
 const f=fixture({commitFails:true}),r=await f.send();assert.equal(r.statusCode,503);
 assert.equal(r.body.code,'queue_unavailable');assert.deepEqual(f.releases,[true]);
});
test('v106: failed rollback quarantines DB connection',async()=>{
 const f=fixture({queryFails:true,rollbackFails:true}),r=await f.send();assert.equal(r.statusCode,503);assert.deepEqual(f.releases,[true]);
});
