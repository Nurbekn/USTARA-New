'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
const previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];

const rows=a=>({rows:a,rowCount:a.length});
const ticket=(status='called')=>({id:31,barber_id:7,display_label:'Mehmon',queue_date:'2026-11-20',
  status,queue_position:1,created_at:'2026-11-20T05:00:00Z',
  called_at:'2026-11-20T06:00:00Z',finished_at:null});
function fixture({entry=ticket(),authorized=true,update=true,commitFails=false,rollbackFails=false,writeFails=false}={}) {
  const queries=[],released=[];let updates=0,events=0;
  const db={async connect(){return {
    async query(sql,args=[]){queries.push({sql,args});
      if(sql==='COMMIT'&&commitFails)throw Error('simulated commit timeout');
      if(sql==='ROLLBACK'&&rollbackFails)throw Error('simulated rollback failure');
      if(sql.includes('SELECT b.id FROM barbers'))return rows(authorized?[{id:7}]:[]);
      if(sql.includes('AND id=$2 FOR UPDATE'))return rows(entry?[entry]:[]);
      if(sql.startsWith('UPDATE walkin_queue SET status=$1')){
        if(writeFails)throw Error('simulated write failure');
        updates++;return rows(update?[{...entry,status:args[0]}]:[]);
      }
      if(sql.includes('INSERT INTO walkin_queue_events'))events++;
      return rows([]);
    },release(broken){released.push(broken===true)}
  }}};
  async function send({body={status:'missed',expected_status:'called'},id='31',
    user={role:'barber',id:5,profileId:7}}={}){
    const result={statusCode:200,headers:{},body:null,
      set(k,v){this.headers[k]=v;return this},status(c){this.statusCode=c;return this},
      json(v){this.body=v;return this}};
    await createHandlers(db).finish({body,user,params:{id}},result);
    return result;
  }
  return {send,queries,released,updates:()=>updates,events:()=>events};
}

test('v105: called -> missed is guarded by expected status and one audit write',async()=>{
  const f=fixture(),r=await f.send();
  assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'missed');
  assert.equal(f.updates(),1);assert.equal(f.events(),1);assert.equal(r.body.replayed,false);
  assert.equal(r.headers['Cache-Control'],'no-store');
  const statements=f.queries.map(x=>x.sql);
  assert.ok(statements.some(x=>x.includes("queue_date=(statement_timestamp() AT TIME ZONE 'Asia/Tashkent')::date")));
  assert.ok(statements.indexOf('COMMIT')>statements.findIndex(x=>x.includes('INSERT INTO walkin_queue_events')));
});
test('v105: replay of already missed ticket cannot duplicate update or audit',async()=>{
  const f=fixture({entry:ticket('missed')}),r=await f.send();
  assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);
  assert.equal(f.updates(),0);assert.equal(f.events(),0);
});
for(const status of ['waiting','arrived','in_service','served','left']){
  test('v105: no-show forbidden from '+status,async()=>{
    const f=fixture({entry:ticket(status)}),r=await f.send();
    assert.equal(r.statusCode,409);assert.equal(f.updates(),0);assert.equal(f.events(),0);
  });
}
test('v105: stale called snapshot cannot mark an arrived ticket as missed',async()=>{
  const f=fixture({entry:ticket('arrived')}),r=await f.send();
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'queue_changed');
});
test('v105: explicit invalid observed status rejected before DB connect',async()=>{
  const f=fixture(),r=await f.send({body:{status:'missed',expected_status:'cancelled'}});
  assert.equal(r.statusCode,400);assert.equal(f.queries.length,0);
});
test('v105: another role cannot mark no-show',async()=>{
  const f=fixture(),r=await f.send({user:{role:'customer',id:5,profileId:7}});
  assert.equal(r.statusCode,403);assert.equal(f.updates(),0);
});
test('v105: deactivated/unapproved barber cannot mark no-show',async()=>{
  const f=fixture({authorized:false}),r=await f.send();
  assert.equal(r.statusCode,403);assert.equal(f.updates(),0);
});
test('v105: missing or foreign ticket remains private',async()=>{
  const f=fixture({entry:null}),r=await f.send();
  assert.equal(r.statusCode,404);assert.equal(f.updates(),0);
});
test('v105: old-day ticket cannot be changed by a later confirmation',async()=>{
  const f=fixture({update:false}),r=await f.send();
  assert.equal(r.statusCode,409);assert.equal(f.events(),0);
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
test('v105: unknown commit result never claims no-show success',async()=>{
  const f=fixture({commitFails:true}),r=await f.send();
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_result_unknown');
  assert.deepEqual(f.released,[true]);
  assert.ok(!JSON.stringify(r.body).includes('simulated commit timeout'));
});
test('v105: failed write rolls back without false no-show audit',async()=>{
  const f=fixture({writeFails:true}),r=await f.send();
  assert.equal(r.statusCode,503);assert.equal(f.events(),0);
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');
  assert.deepEqual(f.released,[false]);
});
test('v105: failed rollback quarantines DB connection',async()=>{
  const f=fixture({writeFails:true,rollbackFails:true}),r=await f.send();
  assert.equal(r.statusCode,503);assert.deepEqual(f.released,[true]);
});
