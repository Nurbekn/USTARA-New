'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueueTelegramService}=require('../services/queueTelegramNotifications');
const rows=items=>({rows:items,rowCount:items.length});
const qr='a'.repeat(48),receipt='b'.repeat(32),invite='c'.repeat(48);
function fake({ticket={id:4,status:'waiting'},item={entry_id:4,status:'waiting',consumed_at:null},latest={status:'waiting'},linked=[]}={}){
 const queries=[];
 const client={async query(sql,params=[]){queries.push({sql,params});
   if(sql.includes('JOIN walkin_qr_tokens') && (sql.includes('FOR UPDATE OF q') || sql.includes('JOIN walkin_queue q ON q.id=r.queue_entry_id')))return rows(ticket?[ticket]:[]);
   if(sql.includes('FROM walkin_queue_telegram_subscriptions WHERE entry_id'))return rows(linked);
   if(sql.includes('FOR SHARE OF r'))return rows([{ok:1}]);
   if(sql.includes('SELECT (created_at>clock_timestamp()'))return rows([]);
   if(sql.includes('JOIN walkin_queue q ON q.id=i.entry_id'))return rows(item?[item]:[]);
   if(sql.includes('SELECT status,queue_date FROM walkin_queue WHERE id=$1'))return rows(latest?[latest]:[]);
   if(sql.includes('UPDATE walkin_queue_telegram_subscriptions'))return rows([{entry_id:4}]);
   return rows([]);
 },release(){}};
 return {queries,pool:{connect:async()=>client}};
}
test('v41 Telegram issue date and waiting state are decided inside PG row lock',async()=>{
 const f=fake();await createQueueTelegramService({pool:f.pool,env:{TELEGRAM_BOT_USERNAME:'UstaraTestBot'}}).issue(qr,receipt);
 const lock=f.queries.find(q=>q.sql.includes('JOIN walkin_qr_tokens')&&q.sql.includes('FOR UPDATE OF q'));
 assert.match(lock.sql,/q\.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(lock.sql,/q.status='waiting'/);
 assert.ok(f.queries.some(q=>q.sql.includes('COMMIT')));
});
test('v41 expired invite cannot be revived by a skewed Node clock',async()=>{
 const f=fake({item:null});
 await assert.rejects(createQueueTelegramService({pool:f.pool}).consume(invite,100222),{code:'invite_expired'});
 const query=f.queries.find(q=>q.sql.includes('JOIN walkin_queue q ON q.id=i.entry_id'));
 assert.match(query.sql,/i.expires_at>clock_timestamp\(\)/);
 assert.match(query.sql,/q.queue_date=\(clock_timestamp\(\) AT TIME ZONE/);
 assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO walkin_queue_telegram_subscriptions')),false);
 assert.ok(f.queries.some(q=>q.sql.includes('ROLLBACK')));
});
test('v41 invite consumption has no second Node Date.now expiry rejection',async()=>{
 const f=fake({item:{entry_id:4,status:'waiting',consumed_at:null,expires_at:new Date(0),queue_date:'1980-01-01'}});
 // Deliberately stale JS values in this fake: in real PG these cannot pass WHERE.
 // There must be no second, potentially contradictory, app-server date check.
 assert.deepEqual(await createQueueTelegramService({pool:f.pool}).consume(invite,100222),{linked:true});
 assert.ok(f.queries.some(q=>q.sql.includes('INSERT INTO walkin_queue_telegram_subscriptions')));
});
test('v41 offer consent rechecks current Tashkent date under locked queue record',async()=>{
 const f=fake();const result=await createQueueTelegramService({pool:f.pool}).offerConsent(qr,receipt,true);
 assert.equal(result.offers_enabled,true);
 const lock=f.queries.find(q=>q.sql.includes('SELECT status,queue_date FROM walkin_queue WHERE id=$1'));
 assert.match(lock.sql,/q?.?queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(lock.sql,/FOR UPDATE/);
});
