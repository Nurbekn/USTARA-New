'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {targetOf,intentOf,createHandlers}=require('../controllers/adminAccountSuspensionV187');
function mockResponse(){return {statusCode:200,headers:{},payload:null,
  set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(obj){this.payload=obj;return this;}};}
function fakeDb({userState=null,found=true,admin=true,breakAt='',role='customer'}={}){
  const calls=[];const state={suspended:userState};
  let released=false;
  const client={async query(sql,args=[]){calls.push({sql,args});
    if(breakAt&&sql.includes(breakAt))throw Error('database secret');
    if(sql.includes('FROM admin_accounts'))return {rowCount:admin?1:0,rows:admin?[{id:1}]:[]};
    if(sql.startsWith('SELECT id,user_id FROM'))return {rowCount:found?1:0,rows:found?[{id:11,user_id:22}]:[]};
    if(sql.startsWith('SELECT id,role,admin_suspended_at FROM users'))return {rowCount:1,rows:[{id:22,role,admin_suspended_at:state.suspended}]};
    if(sql.startsWith('INSERT INTO admin_account_suspension_events'))return {rowCount:1,rows:[{id:44}]};
    if(sql.startsWith('UPDATE users SET admin_suspended_at='))state.suspended=sql.includes('clock_timestamp')?'2026-11-21T00:00:00Z':null;
    return {rowCount:1,rows:[]};
  },release(broken){released=true;state.broken=broken;}};
  return {connect:async()=>client,calls,state,get released(){return released;}};
}
async function submit(db,body={action:'suspend',expectedSuspended:false,reason:'Repeat no-shows'},role='customer',actor={role:'admin',id:1}){
  const req={user:actor,params:{id:'11',role},body};
  const res=mockResponse();await createHandlers(db).change(req,res);return res;
}
test('v187: strictly validate role, profile ID, intent and explicit expected state',()=>{
  assert.deepEqual(targetOf({role:'barber',id:'42'}),{role:'barber',id:42});
  for(const id of ['0','-1','1;DROP','2147483648','1.0'])assert.equal(targetOf({role:'customer',id}),null);
  assert.equal(targetOf({role:'admin',id:'2'}),null);
  assert.equal(intentOf({action:'suspend',expectedSuspended:false,reason:'Valid reason'}).action,'suspend');
  for(const b of [{action:'suspend',expectedSuspended:true,reason:'Valid reason'},
    {action:'restore',expectedSuspended:false,reason:'Valid reason'},
    {action:'suspend',expectedSuspended:false,reason:' x '},
    {action:'restore',expectedSuspended:true,reason:'unsafe\nreason'}])assert.equal(intentOf(b),null);
});
test('v187: only an active Admin may mutate, unauthorized calls never reach SQL',async()=>{
  const db=fakeDb();let res=await submit(db,undefined,'customer',{role:'customer',id:1});
  assert.equal(res.statusCode,403);assert.equal(db.calls.length,0);
  res=await submit(db,undefined,'customer',{role:'admin',id:1});assert.equal(res.statusCode,200);
  const inactive=fakeDb({admin:false});res=await submit(inactive);assert.equal(res.statusCode,403);
  assert.ok(inactive.calls.some(c=>c.sql==='ROLLBACK'));
  assert.equal(inactive.calls.some(c=>c.sql.startsWith('UPDATE users')),false);
});
test('v187: suspend transaction revokes sessions, increments version, audits without touching bookings',async()=>{
  const db=fakeDb();const res=await submit(db);
  assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
  assert.deepEqual(res.payload,{role:'customer',profileId:11,suspended:true,sessionsRevoked:true,bookingsChanged:false});
  const all=db.calls.map(c=>c.sql);const profile=all.findIndex(s=>s.startsWith('SELECT id,user_id FROM'));
  const user=all.findIndex(s=>s.startsWith('SELECT id,role,admin_suspended_at FROM users'));
  const change=all.findIndex(s=>s.startsWith('UPDATE users SET admin_suspended_at='));
  assert.ok(profile<user&&user<change);
  assert.ok(all.some(s=>s.startsWith('INSERT INTO account_session_versions')));
  assert.ok(all.some(s=>s.startsWith('UPDATE account_device_sessions SET revoked_at=')));
  assert.ok(all.some(s=>s.startsWith('INSERT INTO admin_account_suspension_events')));
  assert.ok(!all.some(s=>/UPDATE bookings|DELETE FROM bookings|DELETE FROM users|UPDATE notifications/.test(s)));
  assert.equal(all.at(-1),'COMMIT');assert.equal(db.released,true);
});
test('v187: restoring keeps existing sessions revoked, and writes audit event',async()=>{
  const db=fakeDb({userState:'2026-11-21T00:00:00Z',role:'barber'});
  const res=await submit(db,{action:'restore',expectedSuspended:true,reason:'Appeal approved'},'barber');
  assert.equal(res.statusCode,200);assert.equal(res.payload.suspended,false);
  assert.ok(db.calls.some(c=>c.sql.startsWith('SELECT pg_advisory_xact_lock')));
  assert.ok(db.calls.some(c=>c.sql.startsWith('UPDATE users SET admin_suspended_at=NULL')));
  assert.ok(db.calls.some(c=>c.sql.includes('account_session_versions')));
  assert.ok(db.calls.some(c=>c.sql.includes('account_device_sessions')));
  const audit=db.calls.find(c=>c.sql.startsWith('INSERT INTO admin_account_suspension_events'));
  assert.deepEqual(audit.args,[22,1,'restore','Appeal approved']);
});
test('v187: stale Admin state produces 409 without mutation',async()=>{
  const db=fakeDb({userState:'2026-11-21T00:00:00Z'});
  const res=await submit(db);assert.equal(res.statusCode,409);
  assert.equal(res.payload.code,'suspension_state_changed');
  assert.ok(db.calls.some(c=>c.sql==='ROLLBACK'));
  assert.ok(!db.calls.some(c=>c.sql.startsWith('UPDATE users')));
});
test('v187: missing profile and database failure fail closed, do not leak error',async()=>{
  const missing=fakeDb({found:false});assert.equal((await submit(missing)).statusCode,404);
  const broken=fakeDb({breakAt:'account_session_versions'});
  const res=await submit(broken);assert.equal(res.statusCode,503);
  assert.equal(res.payload.code,'suspension_state_unknown');
  assert.ok(!JSON.stringify(res.payload).includes('database secret'));
  assert.ok(broken.calls.some(c=>c.sql==='ROLLBACK'));
});
test('v187: authentication & routes guard suspended accounts at login and on subsequent requests',()=>{
  const identity=fs.readFileSync(path.join(root,'middleware/accountIdentity.js'),'utf8');
  assert.equal((identity.match(/account.admin_suspended_at IS NULL/g)||[]).length,2);
  const login=fs.readFileSync(path.join(root,'services/loginAuthentication.js'),'utf8');
  assert.match(login,/SELECT admin_suspended_at FROM users WHERE id=\$1 FOR SHARE/);
  assert.match(login,/code:'account_suspended'/);
  const routes=fs.readFileSync(path.join(root,'routes/admin.js'),'utf8');
  assert.match(routes,/router.patch\('\/users\/:role\/:id\/suspension',authMiddleware,ops.adminOnly,suspensionV187.change\)/);
});
test('v187: migration ledger and signup contracts include forward-only suspension',()=>{
  const migration=fs.readFileSync(path.join(root,'database/migrations/20261230_admin_account_suspensions.sql'),'utf8');
  assert.match(migration,/ALTER TABLE users ADD COLUMN admin_suspended_at TIMESTAMPTZ/);
  assert.match(migration,/admin_account_suspension_events/);
  assert.doesNotMatch(migration,/\bDELETE FROM bookings\b/);
  const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
  assert.match(bootstrap,/\\ir migrations\/20261230_admin_account_suspensions.sql/);
});
