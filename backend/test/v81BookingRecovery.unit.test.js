'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {recoverBooking}=require('../services/bookingRecovery');
const ID='550e8400-e29b-41d4-a716-446655440000';
const actor={role:'customer',accountId:100,profileId:10};
function harness({found=true,snapshots=true,schema=true,fails=false}={}) {
 const calls=[];
 const db={async query(sql,params){
   calls.push({sql,params});
   if(fails)throw Object.assign(Error('secret database internal'),{code:'08006'});
   if(sql.includes('to_regclass'))return {rows:[{ready: sql.includes('booking_request_keys')?schema:snapshots}]};
   if(sql.includes('JOIN bookings b'))return found
     ? {rowCount:1,rows:[{id:44,customer_id:actor.profileId,barber_id:30,service_id:3,booking_time:'2035-01-01T05:00:00Z',status:'confirmed',duration_minutes:30,total_price:'30000.00'}]}
     : {rowCount:0,rows:[]};
   if(sql.includes('FROM booking_services'))return {rows:[{booking_id:44,id:3,name:'Tarixiy xizmat',price:'30000.00',duration_minutes:30}]};
   throw Error('Unexpected query: '+sql);
 }};
 return {db,calls};
}
test('v81: only customer can read recovery, without contacting database',async()=>{
 const {db,calls}=harness();
 for(const user of [{...actor,role:'barber'},null,{...actor,profileId:2147483648},{...actor,profileId:0}])
   await assert.rejects(recoverBooking(db,user,ID),{status:403,code:'forbidden'});
 assert.equal(calls.length,0);
});
test('v81: invalid request_id rejected before any database query',async()=>{
 const {db,calls}=harness();
 for(const id of ['not-a-uuid','550e8400-e29b-11d4-a716-446655440000','',null])
   await assert.rejects(recoverBooking(db,actor,id),{status:400,code:'invalid_request_id'});
 assert.equal(calls.length,0);
});
test('v81: missing idempotency migration fails closed',async()=>{
 const {db,calls}=harness({schema:false});
 await assert.rejects(recoverBooking(db,actor,ID),{status:503,code:'migration_required'});
 assert.equal(calls.some(c=>c.sql.includes('JOIN bookings b')),false);
});
test('v81: unknown request returns uncertain, not confirmation of rollback',async()=>{
 const {db,calls}=harness({found:false});
 assert.deepEqual(await recoverBooking(db,actor,ID),{found:false,uncertain:true});
 const lookup=calls.find(c=>c.sql.includes('JOIN bookings b'));
 assert.deepEqual(lookup.params,[10,ID]);
 assert.match(lookup.sql,/k\.customer_id=\$1/);
 assert.match(lookup.sql,/b\.customer_id=\$1/);
 assert.equal(calls.some(c=>c.sql.includes('FROM booking_services')),false);
});
test('v81: returned booking has original immutable snapshot, not new service catalog',async()=>{
 const {db,calls}=harness();
 const result=await recoverBooking(db,actor,ID);
 assert.equal(result.found,true);
 assert.equal(result.data.id,44);
 assert.equal(result.data.replayed,true);
 assert.equal(result.data.total_price,'30000.00');
 assert.equal(result.data.service_name,'Tarixiy xizmat');
 assert.equal(result.data.services[0].name,'Tarixiy xizmat');
 assert.equal(calls.filter(c=>c.sql.includes('FROM booking_services')).length,1);
});
test('v81: old booking without multi-service snapshots stays recoverable',async()=>{
 const {db}=harness({snapshots:false});
 const result=await recoverBooking(db,actor,ID);
 assert.equal(result.found,true);
 assert.deepEqual(result.data.services,undefined);
 assert.equal(result.data.total_price,'30000.00');
});
test('v81: DB connection failure is not reported as a negative lookup',async()=>{
 const {db}=harness({fails:true});
 await assert.rejects(recoverBooking(db,actor,ID),{code:'08006'});
});
test('v81: GET recovery is registered before /:id and protected by auth middleware',()=>{
 const routes=readFileSync(join(__dirname,'../routes/bookings.js'),'utf8');
 const recovery=routes.indexOf('router.get("/recovery/:requestId", authMiddleware, getBookingRecovery)');
 const byId=routes.indexOf('router.get("/:id", authMiddleware, getBookingById)');
 assert.ok(recovery>=0 && byId>recovery);
});
test('v81: GET has no INSERT/UPDATE/DELETE and no notification call',()=>{
 const code=readFileSync(join(__dirname,'../services/bookingRecovery.js'),'utf8');
 assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|COMMIT|notifyBooking)\b/);
 const controller=readFileSync(join(__dirname,'../controllers/bookingsController.js'),'utf8');
 assert.match(controller,/getBookingRecovery\(req,res,_next,database=pool\)/);
 assert.match(controller,/res\.set\('Cache-Control','no-store'\)/);
});
