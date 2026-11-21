'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Same dependency-free controller test convention as v94/v98.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
const row=(id,status='waiting')=>({id,barber_id:7,queue_date:'2026-11-19',
  status,display_label:'Guest',queue_position:id,created_at:'2026-11-19T08:00:00Z'});
function harness({waiting=[row(11),row(12),row(13)],written=null,callWritten=1}={}){
  const statements=[],releases=[];
  const client={async query(sql,args=[]){
    statements.push({sql,args});
    const data=rows=>({rowCount:rows.length,rows});
    if(sql.includes('SELECT b.id FROM barbers'))return data([row(7)]);
    if(sql.startsWith('SELECT id FROM walkin_queue'))return data(waiting.map(x=>({id:x.id})));
    if(sql.includes("AND status='called' FOR UPDATE"))return data([]);
    if(sql.includes("AND status='arrived' FOR UPDATE"))return data([]);
    if(sql.includes("AND status='in_service' FOR UPDATE"))return data([]);
    if(sql.includes('LIMIT 1 FOR UPDATE'))return data(waiting.slice(0,1));
    if(sql.startsWith("UPDATE walkin_queue SET status='called'"))
      return data(callWritten?[row(waiting[0].id,'called')]:[]);
    if(sql.startsWith('UPDATE walkin_queue AS w'))
      return data(Array.from({length:written??waiting.length},(_,i)=>({id:waiting[i]?.id??i+1})));
    return data([]);
  },release(v){releases.push(v)}};
  const actions=createHandlers({connect:async()=>client});
  const req=(body,params={})=>({user:{role:'barber',profileId:7,id:3},body,params});
  async function send(method,body,params){const res={statusCode:200,headers:{},
    set(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},
    json(v){this.body=v;return this}};
    await actions[method](req(body,params),res);return res;}
  const q=snippet=>statements.filter(x=>x.sql.includes(snippet));
  return {send,statements,releases,q};
}
const reason='Mijoz navbatdagi joyini almashtirishni so‘radi';
const order=[11,12,13];
function reorder(h){return h.send('reorder',{direction:'up',reason,expected_order:order},{id:'12'});}

test('v99 callNext SQL checks current Tashkent date at the actual UPDATE',async()=>{
  const h=harness(),out=await h.send('callNext',{expected_next_id:11});
  assert.equal(out.statusCode,200);
  const write=h.q("UPDATE walkin_queue SET status='called'")[0];
  assert.match(write.sql,/AND queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date RETURNING/);
  assert.deepEqual(write.args,[11,7]);
});
test('v99 crossed-midnight callNext writes nothing and never emits a called event',async()=>{
  const h=harness({callWritten:0});
  const out=await h.send('callNext',{expected_next_id:11});
  assert.equal(out.statusCode,409);assert.equal(out.body.code,'queue_changed');
  assert.equal(h.q('INSERT INTO walkin_queue_events').length,0);
  assert.equal(h.q('INSERT INTO walkin_queue_notification_outbox').length,0);
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
  assert.equal(out.headers['Cache-Control'],'no-store');
});
test('v99 reorder SQL checks current Tashkent date at actual UPDATE',async()=>{
  const h=harness(),out=await reorder(h);assert.equal(out.statusCode,200);
  const write=h.q('UPDATE walkin_queue AS w')[0];
  assert.match(write.sql,/w.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
  assert.deepEqual(write.args,[[12,11,13],7]);
  assert.equal(h.q('INSERT INTO walkin_queue_reorder_events').length,1);
});
for(const written of [0,1,2]){
 test('v99 reorder partial write ('+written+'/3) rolls back all rows without audit',async()=>{
  const h=harness({written});const out=await reorder(h);
  assert.equal(out.statusCode,409);assert.equal(out.body.code,'queue_changed');
  assert.equal(h.q('INSERT INTO walkin_queue_reorder_events').length,0);
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
 });
}
test('v99 a fully updated reorder commits exactly once and is non-cacheable',async()=>{
 const h=harness(),out=await reorder(h);
 assert.equal(out.body.changed,true);assert.equal(h.q('COMMIT').length,1);
 assert.equal(out.headers['Cache-Control'],'no-store');assert.deepEqual(h.releases,[false]);
});
test('v99 stale observed order is rejected before guarded write',async()=>{
 const h=harness();const out=await h.send('reorder',
  {direction:'up',reason,expected_order:[11,13,12]},{id:'12'});
 assert.equal(out.statusCode,409);assert.equal(h.q('UPDATE walkin_queue AS w').length,0);
});
test('v99 invalid reorder ID is rejected before opening DB transaction',async()=>{
 const h=harness();const out=await h.send('reorder',{direction:'up',reason,expected_order:order},{id:'0'});
 assert.equal(out.statusCode,400);assert.equal(h.statements.length,0);
});
