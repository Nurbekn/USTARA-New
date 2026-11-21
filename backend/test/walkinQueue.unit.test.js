'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,validateLabel}=require('../controllers/walkinQueueController');
const {readBootstrapPlan}=require('../scripts/bootstrap-plan');
const goodKey='a'.repeat(32);
const today='2026-11-18';
const row=(id,status='waiting',label='Mehmon')=>({id,barber_id:7,request_key:goodKey,display_label:label,queue_date:today,status,
  created_at:'2026-11-18T09:00:00Z',called_at:status==='waiting'?null:'2026-11-18T09:10:00Z',
  finished_at:['served','missed','left'].includes(status)?'2026-11-18T09:30:00Z':null});
const data=rows=>({rows,rowCount:rows.length});
function harness({duplicate=null,open=true,current=null,waiting=null,entry=null,failInsert=false}={}){
  const sql=[];let releases=0;
  const client={async query(query,args=[]){sql.push({query,args});
    if(query.includes('SELECT b.id FROM barbers'))return data([{id:7}]);
    if(query.includes('WHERE barber_id=$1 AND request_key=$2 FOR UPDATE'))return data(duplicate?[duplicate]:[]);
    // v98: the database, not JS, decides whether a replay still belongs to today.
    if(query.includes(' AS today') && query.includes('queue_date=(statement_timestamp()'))return data([{today:true}]);
    if(query.includes('AS open_now'))return data([{open_now:open}]);
    if(query.includes('INSERT INTO walkin_queue(')){if(failInsert)throw Error('insert error');return data([row(18,'waiting',args[2])]);}
    if(query.includes("AND status='called' FOR UPDATE"))return data(current?[current]:[]);
    if(query.includes("AND status='waiting' ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE"))return data(waiting?[waiting]:[]);
    if(query.includes('AND id=$2 FOR UPDATE'))return data(entry?[entry]:[]);
    if(query.startsWith("UPDATE walkin_queue SET status='called'"))return data([row(waiting.id,'called',waiting.display_label)]);
    if(query.startsWith('UPDATE walkin_queue SET status=$1'))return data([row(entry.id,args[0],entry.display_label)]);
    return data([]);
  },release(){releases++;}};
  const db={connect:async()=>client,query:async(query,args)=>{sql.push({query,args});
    if(query.includes('SELECT b.id FROM barbers'))return data([{id:7}]);
    return data([]);}};
  const actions=createHandlers(db);
  async function call(name,body={},params={},user={role:'barber',profileId:7,id:17}){
    const state={status:200,headers:{}};
    const res={status(code){state.status=code;return this;},json(value){state.body=value;return this;},set(key,v){state.headers[key]=v;return this;}};
    await actions[name]({body,params,user},res);return state;
  }
  return {call,sql,get releases(){return releases;}};
}
test('label validation forbids controls and excessive length; default is anonymous',()=>{
 assert.equal(validateLabel(undefined),'Mehmon');assert.equal(validateLabel('  Ticket 42  '),'Ticket 42');
 for(const label of [' '.repeat(2),'x'.repeat(61),'a\nb',12])assert.throws(()=>validateLabel(label),{status:400});
});
test('only authenticated barber may access private queue and no SQL runs for outsiders',async()=>{
 const h=harness();assert.equal((await h.call('join',{request_id:goodKey}, {},{role:'customer',id:2,profileId:2})).status,403);
 assert.equal((await h.call('list',{}, {},{role:'customer',id:2,profileId:2})).status,403);
 assert.equal((await h.call('callNext',{}, {},{role:'admin',id:2})).status,403);
 assert.equal(h.sql.length,0);
});
test('walk-in creation requires valid idempotency key',async()=>{
 const h=harness();assert.equal((await h.call('join',{label:'A'})).status,400);
 assert.equal((await h.call('join',{request_id:'invalid'})).status,400);
 assert.equal(h.sql.length,0);
});
test('join under shared barber lock checks open hours, creates one row and one audit event',async()=>{
 const h=harness();const out=await h.call('join',{request_id:goodKey,label:'  Test  '});
 assert.equal(out.status,201);assert.equal(out.body.entry.display_label,'Test');assert.equal(out.body.replayed,false);
 assert.equal(out.body.entry.request_key,undefined);
 const queries=h.sql.map(x=>x.query);
 assert.ok(queries.findIndex(x=>x.includes('pg_advisory_xact_lock'))<queries.findIndex(x=>x.includes('INSERT INTO walkin_queue(')));
 assert.equal(queries.filter(x=>x.startsWith('INSERT INTO walkin_queue_events')).length,1);
 assert.equal(queries.at(-1),'COMMIT');assert.equal(h.releases,1);
});
test('closed working day rejects new walk-ins with ROLLBACK and no new event',async()=>{
 const h=harness({open:false});const out=await h.call('join',{request_id:goodKey});
 assert.equal(out.status,409);assert.equal(out.body.code,'barber_closed');
 assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_queue(')));
 assert.equal(h.sql.at(-1).query,'ROLLBACK');
});
test('retry returns same entry without second event and rejects changed payload',async()=>{
 let h=harness({duplicate:row(9)});let out=await h.call('join',{request_id:goodKey});
 assert.equal(out.status,200);assert.equal(out.body.replayed,true);
 assert.ok(!h.sql.some(x=>x.query.startsWith('INSERT INTO walkin_queue_events')));
 h=harness({duplicate:row(9)});out=await h.call('join',{request_id:goodKey,label:'Different'});
 assert.equal(out.status,409);assert.equal(out.body.code,'request_id_reused');assert.equal(h.sql.at(-1).query,'ROLLBACK');
});
test('FIFO next only takes oldest waiting, logs call, returns current call on retry',async()=>{
 let h=harness({waiting:row(4)}),out=await h.call('callNext');
 assert.equal(out.status,200);assert.equal(out.body.entry.id,4);
 assert.ok(h.sql.some(x=>x.query.includes('ORDER BY queue_position ASC NULLS LAST,id LIMIT 1 FOR UPDATE')));
 assert.equal(h.sql.filter(x=>x.query.startsWith('INSERT INTO walkin_queue_events')).length,1);
 h=harness({current:row(4,'called')});out=await h.call('callNext');
 assert.equal(out.body.replayed,true);assert.equal(out.body.entry.status,'called');
 assert.equal(h.sql.filter(x=>x.query.startsWith('INSERT INTO walkin_queue_events')).length,0);
});
test('empty queue cannot call a nonexisting customer',async()=>{
 const h=harness();const out=await h.call('callNext');assert.equal(out.status,404);assert.equal(out.body.code,'queue_empty');
 assert.equal(h.sql.at(-1).query,'ROLLBACK');
});
test('valid status transitions preserve called-before-served, and idempotent finishing',async()=>{
 let h=harness({entry:row(9,'waiting')}),out=await h.call('finish',{status:'served'},{id:'9'});
 assert.equal(out.status,409);assert.equal(out.body.code,'invalid_transition');
 h=harness({entry:row(9,'called')});out=await h.call('finish',{status:'served'},{id:'9'});
 assert.equal(out.status,200);assert.equal(out.body.entry.status,'served');
 assert.equal(h.sql.filter(x=>x.query.startsWith('INSERT INTO walkin_queue_events')).length,1);
 h=harness({entry:row(9,'served')});out=await h.call('finish',{status:'served'},{id:'9'});
 assert.equal(out.body.replayed,true);assert.equal(h.sql.filter(x=>x.query.startsWith('INSERT INTO walkin_queue_events')).length,0);
 h=harness({entry:row(9,'waiting')});out=await h.call('finish',{status:'left'},{id:9});assert.equal(out.status,200);
});
test('foreign queue is hidden, bad status is rejected, and failed write rolls back',async()=>{
 let h=harness();assert.equal((await h.call('finish',{status:'served'},{id:3})).status,404);
 assert.equal((await h.call('finish',{status:'called'},{id:3})).status,400);
 h=harness({failInsert:true});assert.equal((await h.call('join',{request_id:goodKey})).status,503);
 assert.equal(h.sql.at(-1).query,'ROLLBACK');assert.equal(h.releases,1);
});
test('private GET list is barber-only, public summary has no personal ticket data',async()=>{
 const h=harness();const out=await h.call('list');assert.equal(out.status,200);
 assert.equal(h.sql.length,7);
 assert.equal(h.sql[0].query,'BEGIN ISOLATION LEVEL REPEATABLE READ');
 assert.match(h.sql[3].query,/FOR SHARE OF b,u/);
 assert.deepEqual(h.sql[3].args,[7,17]);
 assert.ok(h.sql.slice(4,6).every(x=>x.args[0]===7));
 assert.equal(h.sql.at(-1).query,'COMMIT');
 const routes=require('../routes/queue').stack.filter(x=>x.route).map(x=>x.route);
 assert.deepEqual(routes.map(x=>x.path),['/public/:barberId','/qr-requests','/qr-status','/qr-leave','/telegram/opt-in','/telegram/opt-out','/telegram/offer-consent','/offers/:id/decision','/offers/:id/services','/offers/:id/confirm-booking','/offers/:id/decision/customer','/offers/:id/services/customer','/offers/:id/confirm-booking/customer','/manual/claim','/manual/mine','/manual/:id/revoke','/manual/:id/leave','/offers/mine','/offers/:id/cancel','/qr-tokens','/qr-pending','/qr-pending/:id','/mine','/walk-ins','/walk-ins/:id/claim-code','/call-next','/:id/start','/:id/finish','/:id/reorder']);
 const open=new Set(['/public/:barberId','/qr-requests','/qr-status','/qr-leave',
  '/telegram/opt-in','/telegram/opt-out','/telegram/offer-consent',
  '/offers/:id/decision','/offers/:id/services']);
 assert.ok(routes.filter(x=>open.has(x.path)).every(x=>x.stack[0].handle.name==='publicQrRateLimit'));
 assert.ok(routes.filter(x=>!open.has(x.path)).every(x=>x.stack[0].handle.name==='authMiddleware'));
 
});
test('forward-only queue migration is last in bootstrap and inventory validates new tables',()=>{
 const root=path.resolve(__dirname,'..');const migration=fs.readFileSync(path.join(root,'database/migrations/20261204_walkin_queue_core.sql'),'utf8');
 const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 const verify=fs.readFileSync(path.join(root,'database/bootstrap/verify.sql'),'utf8');
 assert.match(migration,/walkin_queue_one_called_per_day/);assert.match(migration,/walkin_queue_events/);
 assert.match(migration,/walkin_queue_request_unique/);
 for(const marker of ['walkin_queue','walkin_queue_events','20261204_walkin_queue_core'])assert.ok(verify.includes(marker));
 assert.ok(bootstrap.indexOf('20261204_walkin_queue_core.sql')>bootstrap.indexOf('20261203_barber_break_rules.sql'));
 assert.equal(readBootstrapPlan().filter(x=>x.file.startsWith('migrations/')).length,63);
});
