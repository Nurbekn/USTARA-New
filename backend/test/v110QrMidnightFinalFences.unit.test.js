'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
const previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:createQr}=require('../controllers/walkinQrController');
const {createHandlers:createQueue}=require('../controllers/walkinQueueController');
if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];
const barber={role:'barber',profileId:7,id:12}, key='a'.repeat(32), token='b'.repeat(48);
const result=(rows=[])=>({rowCount:rows.length,rows});
function response(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function qrFixture({initialLive=true,freshLive=true,requestLive=true,issued=true,consumed=true,
                   joined=true,finalized=true,statusLive=true,decision='approve'}={}){
 const queries=[],release=[], qr={id:71,barber_id:7,used_at:null,token_live:initialLive};
 const data={async connect(){return {async query(sql,args=[]){queries.push({sql,args});
   if(sql.includes('SELECT b.id FROM barbers'))return result([{id:7}]);
   if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return result([qr]);
   if(sql.includes('FROM walkin_qr_requests WHERE qr_token_id='))return result([]);
   if(sql.includes('SELECT used_at IS NOT NULL AS used'))return result([{used:false,token_live:statusLive}]);
   if(sql.includes('FROM walkin_qr_tokens WHERE id=$1') && sql.includes('AS token_live'))return result([{token_live:freshLive}]);
   if(sql.includes('AS open_now'))return result([{open_now:true}]);
   if(sql.includes('count(*)::int AS total'))return result([{total:0}]);
   if(sql.includes('INSERT INTO walkin_qr_requests('))return result(issued?[{id:72}]:[]);
   if(sql.includes('UPDATE walkin_qr_tokens SET used_at'))return result(consumed?[{id:71}]:[]);
   if(sql.includes('SELECT used_at IS NOT NULL AS used'))return result([{used:false,token_live:statusLive}]);
   if(sql.includes('FROM walkin_qr_requests WHERE id=$1 AND barber_id=$2 FOR UPDATE'))return result([{
    id:72,barber_id:7,request_key:key,display_label:'Mehmon',status:'pending',pending_live:requestLive,queue_entry_id:null
   }]);
   if(sql.includes('INSERT INTO walkin_queue('))return result(joined?[{id:73}]:[]);
   if(sql.includes('UPDATE walkin_qr_requests SET status='))return result(finalized?[{id:72}]:[]);
   if(sql.includes('SELECT (created_at>clock_timestamp()')&&sql.includes('WHERE id=$1'))return result([{pending_live:statusLive}]);
   if(sql.includes('SELECT id,display_label,created_at FROM walkin_qr_requests'))return result([]);
   return result([]);
  },release(b){release.push(b===true)}}},async query(sql,args=[]){queries.push({sql,args});
   if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens'))return result([{status:'pending',pending_live:true}]);
   return result([]);
 }};
 async function send(which){const r=response();const handlers=createQr(data);
  if(which==='requestJoin')await handlers.requestJoin({body:{token,request_id:key,label:'Mehmon'}},r);
  if(which==='decide')await handlers.decide({user:barber,params:{id:'72'},body:{decision}},r);
  if(which==='pendingList')await handlers.pendingList({user:barber},r);
  if(which==='requestStatus')await handlers.requestStatus({body:{token,request_id:key}},r);
  return r;
 }
 return {send,queries,release,sql:part=>queries.find(q=>q.sql.includes(part))?.sql,has:part=>queries.some(q=>q.sql.includes(part))};
}
function queueFixture({open=true,joined=true,preview=false}={}){
 const queries=[],release=[];
 const data={async connect(){return {async query(sql,args=[]){queries.push({sql,args});
  if(sql.includes('SELECT b.id FROM barbers'))return result([{id:7}]);
  if(sql.includes('request_key=$2 FOR UPDATE'))return result([]);
  if(sql.includes('AS open_now'))return result([{open_now:open}]);
  if(sql.includes('INSERT INTO walkin_queue('))return result(joined?[{id:88,queue_date:'2026-11-20',status:'waiting',display_label:'Mehmon'}]:[]);
  if(sql.includes('WITH clock AS'))return result([{queue_date:'2026-11-20',as_of:'2026-11-20T10:00:00Z',closed:false,revision:0,waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0}]);
  return result([]);
 },release(b){release.push(b===true)}}}};
 async function send(){const r=response();const handlers=createQueue(data);
  if(preview)await handlers.dayClosePreview({user:barber,body:{}},r);
  else await handlers.join({user:barber,body:{request_id:key}},r);
  return r;
 }
 return {send,queries,release,sql:part=>queries.find(x=>x.sql.includes(part))?.sql,has:part=>queries.some(x=>x.sql.includes(part))};
}

test('v110: old-day QR token expires even when TTL says still live',async()=>{
 const f=qrFixture({initialLive:false}),r=await f.send('requestJoin');
 assert.equal(r.statusCode,410);assert.equal(r.body.code,'qr_expired');assert.equal(f.has('INSERT INTO walkin_qr_requests'),false);
 assert.match(f.sql('FOR UPDATE'),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: token expires after barber lock if local date rolls over',async()=>{
 const f=qrFixture({freshLive:false}),r=await f.send('requestJoin');
 assert.equal(r.statusCode,410);assert.equal(f.has('INSERT INTO walkin_qr_requests'),false);
 assert.match(f.sql('AS token_live FROM walkin_qr_tokens WHERE id=$1'),/Asia\/Tashkent/);
});
test('v110: guest QR insert is date-fenced in SQL',async()=>{
 const f=qrFixture(),r=await f.send('requestJoin');assert.equal(r.statusCode,202);
 assert.match(f.sql('INSERT INTO walkin_qr_requests('),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
 assert.match(f.sql('UPDATE walkin_qr_tokens SET used_at'),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v110: token expires between preflight and guest INSERT, no consumption',async()=>{
 const f=qrFixture({issued:false}),r=await f.send('requestJoin');assert.equal(r.statusCode,410);
 assert.equal(f.has('UPDATE walkin_qr_tokens SET used_at'),false);
 assert.equal(f.has('walkin_qr_request_events'),false);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: token expires during final consumption; whole request rolls back',async()=>{
 const f=qrFixture({consumed:false,statusLive:false}),r=await f.send('requestJoin');
 assert.equal(r.statusCode,410);assert.equal(r.body.code,'qr_expired');
 assert.equal(f.has('walkin_qr_request_events'),false);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: QR request capacity counts only today, not 23:59 yesterday',async()=>{
 const f=qrFixture(),r=await f.send('requestJoin');assert.equal(r.statusCode,202);
 assert.match(f.sql('count(*)::int AS total'),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
});
for (const decision of ['approve','reject']) {
 test('v110: cannot '+decision+' previous-day QR request even within 30 minutes',async()=>{
  const f=qrFixture({requestLive:false,decision}),r=await f.send('decide');
  assert.equal(r.statusCode,410);assert.equal(r.body.code,'request_expired');
  assert.equal(f.has('INSERT INTO walkin_queue('),false);
  assert.equal(f.has('UPDATE walkin_qr_requests SET status='),false);
 });
}
test('v110: approval INSERT uses same DB clock for date and effective schedule',async()=>{
 const f=qrFixture(),r=await f.send('decide');assert.equal(r.statusCode,200);
 const sql=f.sql('INSERT INTO walkin_queue(');
 assert.match(sql,/WITH now_at AS \(SELECT clock_timestamp\(\) AS at\)/);
 assert.match(sql,/r\.created_at>now_at\.at-interval '30 minutes'/);
 assert.match(sql,/r\.status='pending'/);
 assert.match(sql,/ustara_effective_day_schedule/);
 assert.match(sql,/queue_date\)/);
 assert.equal(f.has('INSERT INTO walkin_queue_events'),true);
});
test('v110: failed final approval INSERT rolls back without audit',async()=>{
 const f=qrFixture({joined:false}),r=await f.send('decide');assert.equal(r.statusCode,409);
 assert.equal(r.body.code,'qr_not_available');
 assert.equal(f.has('INSERT INTO walkin_queue_events'),false);
 assert.equal(f.has('UPDATE walkin_qr_requests SET status='),false);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: final QR decision UPDATE is also same-day fenced',async()=>{
 const f=qrFixture(),r=await f.send('decide');assert.equal(r.statusCode,200);
 assert.match(f.sql('UPDATE walkin_qr_requests SET status='),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
});
test('v110: final approval UPDATE lost race to deadline, inserted queue rolls back',async()=>{
 const f=qrFixture({finalized:false,statusLive:false}),r=await f.send('decide');
 assert.equal(r.statusCode,410);assert.equal(f.has('INSERT INTO walkin_queue('),true);
 assert.equal(f.has('walkin_qr_request_events'),false);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: same-day rejection makes no queue entry',async()=>{
 const f=qrFixture({decision:'reject'}),r=await f.send('decide');
 assert.equal(r.statusCode,200);assert.equal(r.body.status,'rejected');
 assert.equal(f.has('INSERT INTO walkin_queue('),false);assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v110: pending requests list excludes old local dates',async()=>{
 const f=qrFixture(),r=await f.send('pendingList');assert.equal(r.statusCode,200);
 assert.match(f.sql('SELECT id,display_label,created_at FROM walkin_qr_requests'),/created_at AT TIME ZONE 'Asia\/Tashkent'/);
});
test('v110: guest receipt status marks previous-day pending as expired',async()=>{
 const f=qrFixture(),r=await f.send('requestStatus');assert.equal(r.statusCode,200);
 assert.match(f.sql('WITH ranked AS'),/r\.created_at AT TIME ZONE 'Asia\/Tashkent'/);
});
test('v110: manual barber join uses one database-clock sample with final hours gate',async()=>{
 const f=queueFixture(),r=await f.send();assert.equal(r.statusCode,201);
 const sql=f.sql('INSERT INTO walkin_queue(');
 assert.match(sql,/WITH now_at AS \(SELECT clock_timestamp\(\) AS at\)/);
 assert.match(sql,/ustara_effective_day_schedule/);
 assert.match(sql,/queue_date\)/);
 assert.equal(f.has('INSERT INTO walkin_queue_events'),true);assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v110: hours close after preflight; manual join rolls back without audit',async()=>{
 const f=queueFixture({joined:false}),r=await f.send();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'barber_closed');
 assert.equal(f.has('INSERT INTO walkin_queue_events'),false);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v110: manual join still rejects a barber who was closed already',async()=>{
 const f=queueFixture({open:false}),r=await f.send();assert.equal(r.statusCode,409);
 assert.equal(f.has('INSERT INTO walkin_queue('),false);
});
test('v110: close-day readiness excludes yesterday QR pending requests',async()=>{
 const f=queueFixture({preview:true}),r=await f.send();assert.equal(r.statusCode,200);
 const sql=f.sql('WITH clock AS');assert.match(sql,/q\.created_at AT TIME ZONE 'Asia\/Tashkent'\)::date=clock\.today/);
 assert.equal(r.body.read_only,true);
});
