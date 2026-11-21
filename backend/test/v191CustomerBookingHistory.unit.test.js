'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {createHandler}=require('../controllers/customerBookingNotificationHistoryV191');
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(s){this.code=s;return this;},json(v){this.payload=v;return this;}});
test('v191: only customer can see their own history, no SQL for other actor',async()=>{
 let queries=0;const fn=createHandler({query:async()=>{queries++;return {rows:[]};}});
 for(const user of [undefined,{role:'admin',id:2},{role:'customer',id:0},{role:'barber',id:11}]){
  const r=response();await fn({user},r);assert.equal(r.code,403);
 }
 assert.equal(queries,0);
});
test('v191: row-level scope and no delivery/read assertion',async()=>{
 let params,sql;
 const fn=createHandler({query:async(q,p)=>{sql=q;params=p;return {rows:[{id:'3',booking_id:9,event_kind:'pending',status:'accepted',created_at:'2026-11-21'}]};}});
 const r=response();await fn({user:{role:'customer',id:11}},r);
 assert.deepEqual(params,[11]);assert.equal(r.code,200);
 assert.equal(r.headers['Cache-Control'],'no-store');
 assert.deepEqual(r.payload,{notices:[{id:'3',bookingId:9,event:'pending',status:'accepted',createdAt:'2026-11-21'}]});
 assert.match(sql,/WHERE n.user_id=\$1/);assert.match(sql,/LIMIT 20/);
 assert.match(sql,/admin_suspended_at IS NULL/);
 assert.doesNotMatch(JSON.stringify(r.payload),/chat_id|phone|message_id/);
});
test('v191: database error does not expose private SQL or credentials',async()=>{
 const fn=createHandler({query:async()=>{throw Error('sensitive sql connection url');}});
 const r=response();await fn({user:{role:'customer',id:11}},r);
 assert.equal(r.code,503);assert.deepEqual(r.payload,{code:'notification_history_unavailable'});
});
test('v191: history route registered before dynamic customer IDs',()=>{
 const routes=fs.readFileSync(path.resolve(__dirname,'../routes/customers.js'),'utf8');
 const first=routes.indexOf("router.get('/telegram/notifications'");
 const second=routes.indexOf('router.get("/:id"');
 assert.ok(first>=0 && second>first);
});
