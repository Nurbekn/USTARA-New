'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandlers,parseTarget}=require('../controllers/adminAccountBookingImpactV186');
const {createAccountDeletionService}=require('../services/accountDeletionService');
const root=path.resolve(__dirname,'..');
function res(){return {statusCode:200,payload:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(s){this.statusCode=s;return this;},json(p){this.payload=p;return this;}};}
async function impact(db,role='admin',params={role:'barber',id:'11'}){const r=res();await createHandlers(db).impact({user:{role},params},r);return r;}
test('v186: impact preview rejects invalid user/role/identifiers before querying',async()=>{
  const db={query:()=>{throw Error('must not query')}};
  for(const role of ['customer','barber',null]){
    const r=await impact(db,role);assert.equal(r.statusCode,403);assert.equal(r.headers['Cache-Control'],'no-store');
  }
  for(const params of [{role:'admin',id:'11'},{role:'barber',id:'0'},{role:'barber',id:'011'},
    {role:'barber',id:'11 OR 1=1'},{role:'customer',id:'2147483648'},{role:'barber',id:'1.0'},
    {role:'customer',id:['12']},{role:'customer',id:'-12'}]){
    assert.equal(parseTarget(params),null);assert.equal((await impact(db,'admin',params)).statusCode,400);
  }
});
test('v186: preview only counts unended pending/confirmed visits and returns no PII',async()=>{
  const calls=[];const db={async query(sql,args){calls.push({sql,args});return calls.length===1?
    {rowCount:1,rows:[{id:11}]}:{rowCount:1,rows:[{active_count:3,earliest_booking_time:'2030-01-01T12:00:00Z'}]};}};
  const r=await impact(db);
  assert.equal(r.statusCode,200);assert.equal(r.headers['Cache-Control'],'no-store');
  assert.deepEqual(r.payload,{role:'barber',profileId:11,readOnly:true,activeCount:3,
    hasUnfinishedBookings:true,earliestBookingTime:'2030-01-01T12:00:00Z'});
  assert.deepEqual(calls.map(c=>c.args),[[11,'barber'],[11]]);
  assert.match(calls[1].sql,/barber_id=\$1/);
  assert.match(calls[1].sql,/booking_time \+ duration_minutes \* INTERVAL '1 minute' > clock_timestamp\(\)/);
  assert.match(calls[1].sql,/status IN \('pending','confirmed'\)/);
  assert.ok(!calls.some(x=>/DELETE|INSERT|UPDATE|phone|password|token/i.test(x.sql)));
});
test('v186: missing users, DB errors, corrupt count all fail closed',async()=>{
  assert.equal((await impact({query:async()=>({rowCount:0,rows:[]})})).statusCode,404);
  assert.equal((await impact({query:async()=>{throw Error('secret')}},'admin')).statusCode,503);
  let n=0;const r=await impact({query:async()=>++n===1?{rowCount:1,rows:[{id:11}]}:{rowCount:1,rows:[{active_count:'unknown'}]}});
  assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r.payload).includes('secret'));
});
function deletionDb(active,role='barber'){const calls=[];let released=false;
  const client={async query(sql,args){calls.push({sql,args});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SET LOCAL'))return {rowCount:0,rows:[]};
    if(sql.includes('FROM admin_accounts'))return {rowCount:1,rows:[{id:1}]};
    if(sql.includes(`FROM ${role==='customer'?'customers':'barbers'} p JOIN users`))return {rowCount:1,rows:[{user_id:22,phone:'+998901234567'}]};
    if(sql.startsWith(`SELECT id,user_id FROM ${role==='customer'?'customers':'barbers'}`))return {rowCount:1,rows:[{id:11,user_id:22}]};
    if(sql.startsWith('SELECT id,phone,role FROM users'))return {rowCount:1,rows:[{id:22,phone:'+998901234567',role}]};
    if(sql.includes('FROM bookings')&&sql.includes('clock_timestamp()'))return active?{rowCount:1,rows:[{id:123}]}:{rowCount:0,rows:[]};
    if(sql.includes('FROM bookings b')&&sql.includes('JOIN services'))return {rowCount:0,rows:[]};
    return {rowCount:1,rows:[{id:22,phone:'+998901234567'}]};
  },release(){released=true;}};
  return {connect:async()=>client,calls,get released(){return released;}};
}
test('v186: deletion checks in transaction after identity locks; active booking means rollback, no booking DELETE',async()=>{
  const db=deletionDb(true);const svc=createAccountDeletionService(db);
  await assert.rejects(svc.deleteAccount({actor:{id:1,role:'admin'},profileId:11,role:'barber'}),
    e=>e.status===409&&e.code==='active_bookings');
  const sqls=db.calls.map(v=>v.sql);
  const locked=sqls.findIndex(s=>s.startsWith('SELECT id,phone,role FROM users'));
  const checked=sqls.findIndex(s=>s.includes('FROM bookings')&&s.includes('clock_timestamp()'));
  assert.ok(locked>=0&&checked>locked);
  assert.ok(sqls.includes('ROLLBACK'));assert.equal(sqls.includes('COMMIT'),false);
  assert.ok(!sqls.some(s=>/DELETE FROM bookings|DELETE FROM users/.test(s)));
  assert.equal(db.released,true);
});
test('v186: customer with an upcoming booking is equally protected',async()=>{
  const db=deletionDb(true,'customer');
  await assert.rejects(createAccountDeletionService(db).deleteAccount({actor:{id:1,role:'admin'},profileId:11,role:'customer'}),
    e=>e.status===409&&e.code==='active_bookings');
  assert.ok(db.calls.some(x=>x.sql.includes('WHERE customer_id=$1 AND status IN')));
  assert.ok(!db.calls.some(x=>x.sql.includes('DELETE FROM bookings')));
  assert.ok(db.calls.some(x=>x.sql==='ROLLBACK'));
});
test('v186: existing safe historical deletion path remains possible after server check',async()=>{
  const db=deletionDb(false);const result=await createAccountDeletionService(db)
   .deleteAccount({actor:{id:1,role:'admin'},profileId:11,role:'barber'});
  assert.equal(result.profileId,11);
  const sqls=db.calls.map(v=>v.sql);
  assert.ok(sqls.some(x=>x.includes('DELETE FROM bookings WHERE barber_id=$1')));
  assert.ok(sqls.includes('COMMIT'));assert.ok(!sqls.includes('ROLLBACK'));
});
test('v186: admin GET guarded; DELETE remains guarded at service layer',()=>{
  const routes=fs.readFileSync(path.join(root,'routes/admin.js'),'utf8');
  assert.match(routes,/router\.get\('\/users\/:role\/:id\/booking-impact',authMiddleware,ops\.adminOnly,impactV186\.impact\)/);
  const admin=fs.readFileSync(path.join(root,'controllers/adminOperations.js'),'utf8');
  assert.match(admin,/deletionService\.deleteAccount/);
  assert.match(routes,/router\.delete\('\/users\/:role\/:id', authMiddleware, ops\.adminOnly, ops\.deleteUser\)/);
});
