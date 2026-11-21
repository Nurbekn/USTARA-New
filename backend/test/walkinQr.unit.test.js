'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers,tokenHash,requestHash,publicOrigin,isKey,isToken}=require('../controllers/walkinQrController');
const {qrSvg}=require('../utils/qrSvg');
const TOKEN='d'.repeat(48),KEY='a'.repeat(32),NOW=new Date();
const response=rows=>({rows,rowCount:rows.length});
const user={role:'barber',id:19,profileId:7};
function harness({tokenUsed=false,expired=false,qrExisting=null,request=null,open=true,queueBusy=false,commitFail=false,issuedLimit=false,qrMinutes=10,closedDay=false}={}){
 const sql=[],released=[];
 const qrToken={id:44,barber_id:7,token_live:!expired,used_at:tokenUsed?new Date():null};
 const client={async query(query,args=[]){
   sql.push({query,args});
   if(query==='COMMIT'&&commitFail)throw new Error('commit failed');
   if(query.includes('SELECT b.id FROM barbers'))return response([{id:7}]);
   if(query.includes('FROM barber_day_closures'))return response([{closed:closedDay}]);
   if(query.includes('FROM walkin_qr_tokens')&&query.includes('FOR UPDATE'))return response([qrToken]);
   if(query.includes('FROM walkin_qr_tokens WHERE id=$1'))return response([{token_live:!expired}]);
   if(query.includes('UPDATE walkin_qr_requests SET status='))return response([{id:54}]);
   if(query.includes('FROM walkin_qr_requests')&&query.includes('WHERE qr_token_id=$1'))return response(qrExisting?[{...qrExisting,pending_live:Date.now()-new Date(qrExisting.created_at).getTime()<30*60000}]:[]);
   if(query.includes('AS open_now'))return response([{open_now:open}]);
   if(query.includes('FROM walkin_qr_tokens')&&query.includes('count(*)::int'))return response([{total:issuedLimit?6:0}]);
   if(query.includes('count(*)::int AS total'))return response([{total:queueBusy?20:0}]);
   if(query.includes('SELECT ttl_minutes FROM walkin_qr_settings'))return response([{ttl_minutes:qrMinutes}]);
   if(query.includes('INSERT INTO walkin_qr_tokens'))return response([{expires_at:new Date(Date.now()+600000)}]);
   if(query.includes('INSERT INTO walkin_qr_requests'))return response([{id:54}]);
   if(query.includes('UPDATE walkin_qr_tokens SET used_at='))return response([{id:44}]);
   if(query.includes('FROM walkin_qr_requests WHERE id=$1')&&query.includes('FOR UPDATE'))return response(request?[{...request,pending_live:Date.now()-new Date(request.created_at).getTime()<30*60000}]:[]);
   if(query.includes('SELECT id,display_label,created_at FROM walkin_qr_requests'))return response([]);
   if(query.includes('INSERT INTO walkin_queue('))return response([{id:115}]);
   return response([]);
 },release(b){released.push(b);}};
 const db={connect:async()=>client,query:async(q,args)=>{
   sql.push({query:q,args});
   if(q.includes('SELECT b.id FROM barbers'))return response([{id:7}]);
   if(q.includes('SELECT id,display_label,created_at FROM walkin_qr_requests'))return response([]);
   if(q.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens'))return response([{status:'pending',pending_live:true}]);
   return response([]);
 }};
 const handlers=createHandlers(db);
 async function call(name,body={},params={},actor=user,headers={origin:'http://localhost:5173'}){
   const state={status:200,headers:{}};
   const res={status(v){state.status=v;return this;},set(k,v){state.headers[k]=v;return this;},json(v){state.body=v;return this;}};
   await handlers[name]({body,params,user:actor,headers},res);return state;
 }
 return {call,sql,released};
}
test('QR tokens are 192-bit opaque, keys are strict, and saved fingerprints are domain-separated',()=>{
 assert.equal(isToken(TOKEN),true);assert.equal(isToken('x'.repeat(48)),false);
 assert.equal(isKey(KEY),true);assert.equal(isKey('a'.repeat(31)),false);
 assert.equal(tokenHash(TOKEN).length,64);
 assert.equal(requestHash(KEY).length,64);
 assert.notEqual(requestHash(KEY),crypto.createHash('sha256').update(KEY).digest('hex'));
});
test('only barber can create QR, input origin must match browser origin and allow https/localhost',async()=>{
 const h=harness();
 assert.equal((await h.call('tokenCreate',{origin:'http://localhost:5173'},{},{role:'customer',id:4,profileId:4})).status,403);
 assert.equal((await h.call('tokenCreate',{origin:'https://evil.com'},{},user)).status,403);
 assert.equal((await h.call('tokenCreate',{origin:'http://external.example'},{},user,{origin:'http://external.example'})).status,400);
 assert.equal(h.sql.length,0);
 assert.equal(publicOrigin({headers:{origin:'https://ustara.uz'}},'https://ustara.uz'),'https://ustara.uz');
});
test('QR issuance limited per barber to protect database from repeated clicks',async()=>{
 const h=harness({issuedLimit:true}),r=await h.call('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(r.status,429);assert.equal(r.body.code,'qr_issue_limit');
 assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_qr_tokens')));
 assert.equal(h.sql.at(-1).query,'ROLLBACK');
});
test('barber QR is server-generated offline and raw token is not persisted to database',async()=>{
 const h=harness(),r=await h.call('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(r.status,201);
 assert.match(r.body.url,/^http:\/\/localhost:5173\/queue\/check-in\/[a-f0-9]{48}$/);
 assert.match(r.body.svg_data_uri,/^data:image\/svg\+xml;base64,/);
 const svg=Buffer.from(r.body.svg_data_uri.split(',')[1],'base64').toString('utf8');
 assert.match(svg,/<svg/);assert.match(svg,/fill="#111827"/);
 const insert=h.sql.find(x=>x.query.includes('INSERT INTO walkin_qr_tokens'));
 assert.equal(insert.args[1].length,64);assert.ok(!r.body.url.includes(insert.args[1]));
 assert.ok(!h.sql.some(x=>x.query.includes(r.body.url.slice(-48))));
 assert.equal(h.sql.at(-1).query,'COMMIT');assert.equal(h.released.length,1);
});
test('QR renderer is local, with quiet-zone border and never echoes URL as markup',()=>{
 const svg=qrSvg('https://ustara.uz/queue/check-in/'+TOKEN);
 assert.match(svg,/viewBox="0 0 \d+ \d+"/);assert.doesNotMatch(svg,/https:\/\//);
 assert.throws(()=>qrSvg('javascript:alert(1)'));
});
test('public guest request consumes one token, creates pending record but NOT queue entry',async()=>{
 const h=harness(),r=await h.call('requestJoin',{token:TOKEN,request_id:KEY,label:' Guest '},{},undefined,{});
 assert.equal(r.status,202);assert.deepEqual(r.body,{status:'pending',replayed:false});
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_qr_requests')).length,1);
 assert.equal(h.sql.filter(x=>x.query.includes('UPDATE walkin_qr_tokens SET used_at')).length,1);
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_queue(')).length,0);
 assert.equal(h.sql.filter(x=>x.query.includes('walkin_qr_request_events')&&x.query.includes('INSERT')).length,1);
 const args=h.sql.find(x=>x.query.includes('INSERT INTO walkin_qr_requests')).args;
 assert.equal(args[2],requestHash(KEY));assert.equal(args[3],KEY);assert.equal(args[4],'Guest');
});
test('public invalid token, expired token and closed barber do not enqueue anyone',async()=>{
 let h=harness();assert.equal((await h.call('requestJoin',{token:'wrong',request_id:KEY})).status,400);assert.equal(h.sql.length,0);
 h=harness({expired:true});assert.equal((await h.call('requestJoin',{token:TOKEN,request_id:KEY})).status,410);
 h=harness({open:false});assert.equal((await h.call('requestJoin',{token:TOKEN,request_id:KEY})).status,409);
 assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_qr_requests')));
});
test('same token + same request-id replay safe; different receipt rejected',async()=>{
 const old={id:54,request_hash:requestHash(KEY),display_label:'Mehmon',status:'pending',created_at:NOW};
 let h=harness({tokenUsed:true,qrExisting:old}),r=await h.call('requestJoin',{token:TOKEN,request_id:KEY});
 assert.equal(r.status,200);assert.equal(r.body.replayed,true);
 assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_qr_requests')));
 h=harness({tokenUsed:true,qrExisting:old});r=await h.call('requestJoin',{token:TOKEN,request_id:'b'.repeat(32)});
 assert.equal(r.status,409);assert.equal(r.body.code,'qr_used');
 h=harness({tokenUsed:true});r=await h.call('requestJoin',{token:TOKEN,request_id:KEY});assert.equal(r.status,410);
});
test('public status endpoint returns only anonymous status, not ticket or private label',async()=>{
 const h=harness(),r=await h.call('requestStatus',{token:TOKEN,request_id:KEY});
 assert.equal(r.status,200);assert.deepEqual(r.body,{status:'pending'});
 assert.equal(h.sql[0].args[0],tokenHash(TOKEN));assert.equal(h.sql[0].args[1],requestHash(KEY));
});
test('barber approval creates one FIFO entry with audit inside same transaction',async()=>{
 const item={id:54,barber_id:7,request_key:KEY,display_label:'Mehmon',status:'pending',queue_entry_id:null,created_at:NOW};
 const h=harness({request:item});const r=await h.call('decide',{decision:'approve'},{id:'54'});
 assert.equal(r.status,200);assert.equal(r.body.queue_entry_id,115);
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_queue(')).length,1);
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_queue_events')).length,1);
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_qr_request_events')).length,1);
 assert.equal(h.sql.at(-1).query,'COMMIT');
});
test('reject creates no queue entry; decisions idempotent, cannot reverse old decision',async()=>{
 let h=harness({request:{id:54,status:'pending',request_key:KEY,display_label:'Mehmon',created_at:NOW}});
 let r=await h.call('decide',{decision:'reject'},{id:54});assert.equal(r.body.status,'rejected');
 assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_queue(')));
 h=harness({request:{id:54,status:'approved',queue_entry_id:115,request_key:KEY,display_label:'Mehmon',created_at:NOW}});
 r=await h.call('decide',{decision:'approve'},{id:54});assert.equal(r.body.replayed,true);
 r=await h.call('decide',{decision:'reject'},{id:54});assert.equal(r.status,409);
});
test('request approval cannot bypass closing hours and expiry',async()=>{
 const req={id:54,status:'pending',request_key:KEY,display_label:'Mehmon',created_at:NOW};
 let h=harness({request:req,open:false}),r=await h.call('decide',{decision:'approve'},{id:54});
 assert.equal(r.status,409);assert.ok(!h.sql.some(x=>x.query.includes('INSERT INTO walkin_queue(')));
 const stale={...req,created_at:new Date(Date.now()-45*60000)};
 h=harness({request:stale});r=await h.call('decide',{decision:'approve'},{id:54});
 assert.equal(r.status,410);assert.equal(r.body.code,'request_expired');
});
test('nonbarber cannot see or accept a private QR request, and missing foreign request hidden',async()=>{
 const h=harness(),foreigner={role:'customer',id:4,profileId:4};
 assert.equal((await h.call('pendingList',{}, {},foreigner)).status,403);
 assert.equal((await h.call('decide',{decision:'approve'},{id:1},foreigner)).status,403);
 assert.equal((await h.call('decide',{decision:'approve'},{id:1})).status,404);
 assert.equal(h.sql.filter(x=>x.query.includes('INSERT INTO walkin_queue(')).length,0);
});
test('full pending limit protects barber; every failure rolls back',async()=>{
 const h=harness({queueBusy:true}),r=await h.call('requestJoin',{token:TOKEN,request_id:KEY});
 assert.equal(r.status,429);assert.equal(h.sql.at(-1).query,'ROLLBACK');
});
test('migration is sequential, QR secrets hashed at rest and public routes isolated',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261205_walkin_qr_approval.sql'),'utf8');
 assert.match(migration,/token_hash CHAR\(64\)/);
 assert.match(migration,/qr_token_id BIGINT NOT NULL UNIQUE/);
 assert.match(migration,/20261204_walkin_queue_core/);
 const boot=fs.readFileSync(path.join(__dirname,'../database/bootstrap.sql'),'utf8');
 assert.ok(boot.indexOf('20261205_walkin_qr_approval.sql')>boot.indexOf('20261204_walkin_queue_core.sql'));
 const routes=require('../routes/queue').stack.filter(x=>x.route);
 assert.deepEqual(routes.slice(0,3).map(x=>x.route.path),['/public/:barberId','/qr-requests','/qr-status']);
  const open=new Set(['/public/:barberId','/qr-requests','/qr-status','/qr-leave',
  '/telegram/opt-in','/telegram/opt-out','/telegram/offer-consent',
  '/offers/:id/decision','/offers/:id/services']);
 assert.ok(routes.filter(x=>open.has(x.route.path)).every(x=>x.route.stack[0].handle.name==='publicQrRateLimit'));
 assert.ok(routes.filter(x=>!open.has(x.route.path)).every(x=>x.route.stack[0].handle.name==='authMiddleware')); 
});

test('Admin QR TTL is read in the issuance transaction, range-limited, and returned to barber',async()=>{
  const h=harness({qrMinutes:25});const r=await h.call('tokenCreate',{origin:'http://localhost:5173'});
  assert.equal(r.status,201);assert.equal(r.body.ttl_minutes,25);
  const setting=h.sql.find(x=>x.query.includes('SELECT ttl_minutes FROM walkin_qr_settings'));
  assert.match(setting.query,/FOR SHARE/);
  const inserted=h.sql.find(x=>x.query.includes('INSERT INTO walkin_qr_tokens'));
  assert.equal(inserted.args[2],25);assert.match(inserted.query,/\$3::integer/);
  for(const qrMinutes of [0,121]){const invalid=harness({qrMinutes});const out=await invalid.call('tokenCreate',{origin:'http://localhost:5173'});
    assert.equal(out.status,503);assert.ok(!invalid.sql.some(x=>x.query.includes('INSERT INTO walkin_qr_tokens')));
  }
});

test('v107: QR issuance is refused after a persisted day closure',async()=>{
 const h=harness({closedDay:true});const res=await h.call('tokenCreate',{origin:'http://localhost:5173'});
 assert.equal(res.status,409);assert.equal(res.body.code,'barber_closed');
 assert.equal(h.sql.some(x=>x.query.includes('INSERT INTO walkin_qr_tokens')),false);
});
