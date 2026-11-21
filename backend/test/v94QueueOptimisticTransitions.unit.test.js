'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const lifecyclePath=require.resolve('../services/queueOfferLifecycle');
const effects=[];
require.cache[lifecyclePath]={id:lifecyclePath,filename:lifecyclePath,loaded:true,exports:{
  cancelUnconfirmedQueueOffers:async(_,id)=>{effects.push('cancel:'+id)},
  cleanupTerminalQueue:async(_,id)=>{effects.push('cleanup:'+id)},
}};
const {createHandlers}=require('../controllers/walkinQueueController');
const row=(id,status)=>({id,barber_id:7,queue_date:'2026-11-19',display_label:'Guest',status,
  queue_position:1,created_at:'2026-11-19T12:00:00Z',called_at:status==='waiting'?null:'2026-11-19T12:10:00Z',
  finished_at:['served','missed','left'].includes(status)?'2026-11-19T12:40:00Z':null});
function harness({current=null,waiting=null,entry=null}={}){
  const statements=[],releases=[];effects.length=0;
  const client={async query(sql,args=[]){statements.push({sql,args});
    if(sql.includes('SELECT b.id FROM barbers'))return {rows:[{id:7}],rowCount:1};
    if(sql.includes("AND status='called' FOR UPDATE"))return {rows:current?[current]:[],rowCount:current?1:0};
    if(sql.includes("AND status='waiting' ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE"))
      return {rows:waiting?[waiting]:[],rowCount:waiting?1:0};
    if(sql.includes('AND id=$2 FOR UPDATE'))return {rows:entry?[entry]:[],rowCount:entry?1:0};
    if(sql.startsWith("UPDATE walkin_queue SET status='called'"))return {rows:[row(waiting.id,'called')],rowCount:1};
    if(sql.startsWith('UPDATE walkin_queue SET status=$1'))return {rows:[row(entry.id,args[0])],rowCount:1};
    return {rows:[],rowCount:0};
  },release(broken){releases.push(broken)}};
  const req={user:{role:'barber',profileId:7,id:3},body:{},params:{id:'5'}};
  const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(obj){this.body=obj;return this}};
  return {actions:createHandlers({connect:async()=>client}),req,res,statements,releases,
    events:()=>statements.filter(x=>x.sql.startsWith('INSERT INTO walkin_queue_events')).length,
    updates:()=>statements.filter(x=>x.sql.startsWith('UPDATE walkin_queue SET status')).length};
}
test('v94 call next with matching observed head performs one update and one event',async()=>{
  const h=harness({waiting:row(8,'waiting')});h.req.body={expected_next_id:8};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.res.body.entry.status,'called');
  assert.equal(h.events(),1);assert.equal(h.updates(),1);
  assert.deepEqual(h.releases,[false]);
});
test('v94 a reordered queue rejects stale next ticket without writes',async()=>{
  const h=harness({waiting:row(9,'waiting')});h.req.body={expected_next_id:8};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,409);assert.equal(h.res.body.code,'queue_changed');
  assert.equal(h.events(),0);assert.equal(h.updates(),0);
  assert.equal(h.statements.at(-1).sql,'ROLLBACK');
});
test('v94 missing observed head is a stale response, not an automatic call',async()=>{
  const h=harness();h.req.body={expected_next_id:8};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,409);assert.equal(h.updates(),0);
});
test('v94 concurrent call with different ticket cannot masquerade as retry',async()=>{
  const h=harness({current:row(9,'called')});h.req.body={expected_next_id:8};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,409);assert.equal(h.updates(),0);assert.equal(h.events(),0);
  assert.equal(effects.length,0);
});
test('v94 retry of same called ticket is replayed without a duplicate call',async()=>{
  const h=harness({current:row(8,'called')});h.req.body={expected_next_id:'8'};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.res.body.replayed,true);
  assert.equal(h.events(),0);assert.equal(h.updates(),0);
  assert.deepEqual(effects,['cancel:8']);
});
for(const bad of [null,0,-1,1.25,'0','01','0x10','1e2','9007199254740992',{},'bad']){
 test('v94 malformed next ticket rejected before DB '+String(bad),async()=>{
  const h=harness();h.req.body={expected_next_id:bad};
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,400);assert.equal(h.statements.length,0);
 });
}
test('v94 legacy caller without optional precondition still follows FIFO',async()=>{
  const h=harness({waiting:row(8,'waiting')});
  await h.actions.callNext(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.events(),1);
});
test('v94 matching called status can be marked served',async()=>{
  const h=harness({entry:row(5,'called')});h.req.body={status:'served',expected_status:'called'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.res.body.entry.status,'served');
  assert.equal(h.updates(),1);assert.equal(h.events(),1);assert.deepEqual(effects,['cleanup:5']);
});
test('v94 matching waiting status may leave queue but cannot mark served',async()=>{
  const h=harness({entry:row(5,'waiting')});h.req.body={status:'left',expected_status:'waiting'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.events(),1);
});
test('v94 stale finish from waiting cannot close already-called ticket',async()=>{
  const h=harness({entry:row(5,'called')});h.req.body={status:'left',expected_status:'waiting'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,409);assert.equal(h.res.body.code,'queue_changed');
  assert.equal(h.events(),0);assert.equal(h.updates(),0);assert.equal(effects.length,0);
});
test('v94 final status replay after lost HTTP response remains idempotent',async()=>{
  const h=harness({entry:row(5,'served')});h.req.body={status:'served',expected_status:'called'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.res.body.replayed,true);
  assert.equal(h.events(),0);assert.equal(h.updates(),0);
});
test('v94 contradictory terminal state cannot be overwritten by stale action',async()=>{
  const h=harness({entry:row(5,'missed')});h.req.body={status:'served',expected_status:'called'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,409);assert.equal(h.events(),0);
});
for(const bad of [null,'served','removed','CALLED',0,[],{}]){
 test('v94 malformed observed status rejected without DB '+String(bad),async()=>{
  const h=harness();h.req.body={status:'served',expected_status:bad};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,400);assert.equal(h.statements.length,0);
 });
}
test('v94 legacy finish without expected status still accepts called->served',async()=>{
  const h=harness({entry:row(5,'called')});h.req.body={status:'served'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.statusCode,200);assert.equal(h.events(),1);
});
test('v94 write failures are non-cacheable, stale operations return safe public codes',async()=>{
  const h=harness({entry:row(5,'called')});h.req.body={status:'left',expected_status:'waiting'};
  await h.actions.finish(h.req,h.res);
  assert.equal(h.res.headers['Cache-Control'],'no-store');
  assert.ok(!JSON.stringify(h.res.body).includes('database'));
});
