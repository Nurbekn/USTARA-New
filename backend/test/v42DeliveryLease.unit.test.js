'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createQueueTelegramDispatcher}=require('../services/queueTelegramNotifications');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const {SQL,summarize}=require('../scripts/v41-telegram-delivery-health');
const rows=values=>({rows:values,rowCount:values.length});
function createPool(){
 const queries=[];
 const pool={async query(sql,params=[]){queries.push({sql,params});return rows([]);}};
 return {pool,queries};
}
test('v42 queue dispatcher quarantines abandoned NULL lease without replay',async()=>{
 const fixture=createPool();const sends=[];
 const worker=createQueueTelegramDispatcher({pool:fixture.pool,api:async(...args)=>sends.push(args)});
 assert.equal(await worker.step(),false);
 assert.match(fixture.queries[0].sql,/status='uncertain'/);
 assert.match(fixture.queries[0].sql,/status='processing' AND \(lease_until IS NULL OR lease_until<clock_timestamp\(\)\)/);
 assert.ok(fixture.queries.some(x=>/FOR UPDATE OF o SKIP LOCKED/.test(x.sql)));
 assert.deepEqual(sends,[]);
});
test('v42 smart booking dispatcher quarantines abandoned NULL lease without replay',async()=>{
 const fixture=createPool();const sends=[];
 const worker=createSmartBookingTelegram({pool:fixture.pool,api:async(...args)=>sends.push(args)});
 assert.equal(await worker.step(),false);
 const repair=fixture.queries.find(x=>/status='sending' AND \(lease_until IS NULL/.test(x.sql));
 assert.ok(repair);assert.match(repair.sql,/status='uncertain'/);
 assert.ok(fixture.queries.some(x=>/FOR UPDATE OF t SKIP LOCKED/.test(x.sql)));
 assert.deepEqual(sends,[]);
});
test('v42 operator view counts NULL in-flight leases as stale for manual review',()=>{
 assert.match(SQL,/status='processing' AND \(lease_until IS NULL OR lease_until<clock_timestamp\(\)\)/);
 assert.match(SQL,/status='sending' AND \(lease_until IS NULL OR lease_until<clock_timestamp\(\)\)/);
 assert.doesNotMatch(SQL,/\b(?:chat_id|token_hash|password)\b/i);
 const result=summarize([{channel:'queue',status:'processing',total:2,due:0,stale_lease:2},
  {channel:'smart_booking',status:'sending',total:1,due:0,stale_lease:1}]);
 assert.equal(result.attention.length,2);
 assert.equal(result.attention[0].stale_lease,2);
 assert.equal(result.attention[1].stale_lease,1);
});
