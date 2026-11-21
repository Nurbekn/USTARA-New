'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,requestHash}=require('../controllers/walkinQrController');
const token='a'.repeat(48),requestId='b'.repeat(32);
const user={role:'barber',id:91,profileId:7};
const rows=(...r)=>({rows:r,rowCount:r.length});
function setup({owner=true,tokenLive=true,tokenUsed=false,replay=null,pendingLive=true,decision=null,publicStatus=null}={}){
 const calls=[],writes=[];
 const client={async query(sql,args=[]){
  calls.push({sql,args});
  if(/^(INSERT|UPDATE|DELETE)\b/i.test(sql))writes.push({sql,args});
  if(sql.includes('SELECT b.id FROM barbers'))return owner&&args[0]===7&&(args.length===1||args[1]===91)?rows({id:7}):rows();
  if(sql.includes('FROM barber_day_closures'))return rows({closed:false});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return rows({id:18,barber_id:7,used_at:tokenUsed?new Date():null,token_live:tokenLive});
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return rows({token_live:tokenLive});
  if(sql.includes('UPDATE walkin_qr_requests SET status='))return rows({id:88});
  if(sql.includes('FROM walkin_qr_requests')&&sql.includes('WHERE qr_token_id=$1'))return replay?rows({...replay,pending_live:pendingLive}):rows();
  if(sql.includes('AS open_now'))return rows({open_now:true});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('count(*)'))return rows({total:0});
  if(sql.includes('count(*)::int AS total'))return rows({total:0});
  if(sql.includes('SELECT ttl_minutes'))return rows({ttl_minutes:10});
  if(sql.includes('INSERT INTO walkin_qr_tokens'))return rows({expires_at:new Date()});
  if(sql.includes('INSERT INTO walkin_qr_requests'))return rows({id:20});
  if(sql.includes('FROM walkin_qr_requests WHERE id=$1')&&sql.includes('FOR UPDATE'))return decision?rows({...decision,pending_live:pendingLive}):rows();
  if(sql.includes('SELECT id,display_label,created_at FROM walkin_qr_requests'))return rows({id:200,display_label:'Private',created_at:new Date()});
  if(sql.includes('INSERT INTO walkin_queue('))return rows({id:123});
  return rows();
 },release(){calls.push({sql:'RELEASE'});}};
 const db={connect:async()=>client,query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('WITH ranked AS'))return rows(publicStatus??{status:'pending',pending_live:pendingLive});
  return rows();
 }};
 const handlers=createHandlers(db);
 const run=async(type,body={},params={},actor=user)=>{
  const state={status:200,headers:{}};
  const res={status(n){state.status=n;return this},json(o){state.body=o;return this},set(k,v){state.headers[k]=v;return this}};
  await handlers[type]({body,params,user:actor,headers:{origin:'http://localhost:5173'}},res);
  return state;
 };
 return {run,calls,writes};
}
test('v50/1 QR issuance rejects a foreign/deactivated barber before advisory lock or insert',async()=>{
 const h=setup({owner:false}),r=await h.run('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(r.status,403);
 assert.equal(h.writes.length,0);
 assert.ok(!h.calls.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(h.calls.some(x=>x.sql.includes('b.user_id=$2')&&x.sql.includes('FOR SHARE OF b,u')&&x.args[1]===91));
 assert.ok(h.calls.some(x=>x.sql==='ROLLBACK'));
 const ok=setup();const out=await ok.run('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(out.status,201);
 const i=ok.calls.findIndex(x=>x.sql.includes('SELECT b.id FROM barbers'));
 const j=ok.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 assert.ok(i>=0&&j>i,'identity lock precedes advisory lock');
});
test('v50/2 private QR pending list requires ownership and uses one transaction',async()=>{
 const other=setup({owner:false}),forbidden=await other.run('pendingList');
 assert.equal(forbidden.status,403);
 assert.equal(other.calls.some(x=>x.sql.includes('SELECT id,display_label,created_at FROM walkin_qr_requests')),false);
 const good=setup(),res=await good.run('pendingList');
 assert.equal(res.status,200);assert.equal(res.body.pending.length,1);
 assert.ok(good.calls.some(x=>x.sql==='COMMIT'));
 assert.ok(good.calls.findIndex(x=>x.sql.includes('SELECT b.id FROM barbers'))<good.calls.findIndex(x=>x.sql.includes('SELECT id,display_label,created_at FROM walkin_qr_requests')));
});
test('v50/3 private approval also requires owning user, not profile id alone',async()=>{
 const d={id:88,barber_id:7,status:'pending',request_key:requestId,display_label:'Guest'};
 const h=setup({owner:false,decision:d});const res=await h.run('decide',{decision:'approve'},{id:'88'});
 assert.equal(res.status,403);assert.equal(h.writes.length,0);
 assert.equal(h.calls.some(x=>x.sql.includes('FROM walkin_qr_requests WHERE id=$1')),false);
});
test('v50/4 token expiry and replay pending expiry depend on database clock flags',async()=>{
 const stale=setup({tokenLive:false});const r=await stale.run('requestJoin',{token,request_id:requestId});
 assert.equal(r.status,410);assert.equal(stale.writes.length,0);
 assert.ok(stale.calls.some(x=>x.sql.includes('expires_at>clock_timestamp()')));
 const replay=setup({tokenUsed:true,pendingLive:false,replay:{request_hash:requestHash(requestId),display_label:'Mehmon',status:'pending',created_at:new Date()}});
 const old=await replay.run('requestJoin',{token,request_id:requestId});
 assert.equal(old.body.status,'expired');assert.equal(old.body.replayed,true);
 assert.ok(replay.calls.some(x=>x.sql.includes("created_at>clock_timestamp()-interval '30 minutes'")));
});
test('v50/5 both public status and barber approval use DB-calculated 30-minute validity',async()=>{
 const guest=setup({pendingLive:false,publicStatus:{status:'pending',pending_live:false,created_at:new Date()}});
 const status=await guest.run('requestStatus',{token,request_id:requestId});
 assert.equal(status.body.status,'expired');
 const decision={id:88,barber_id:7,status:'pending',request_key:requestId,display_label:'Mehmon',created_at:new Date()};
 const expired=setup({decision,pendingLive:false});
 const out=await expired.run('decide',{decision:'approve'},{id:'88'});
 assert.equal(out.status,410);assert.equal(out.body.code,'request_expired');
 assert.equal(expired.writes.length,0);
 assert.ok(expired.calls.some(x=>x.sql.includes('created_at>clock_timestamp()')));
});
