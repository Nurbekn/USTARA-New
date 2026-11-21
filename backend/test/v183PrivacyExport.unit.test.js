'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createExportHandler,MAX_BOOKINGS } = require('../controllers/privacyExportV183');
function response() {
 const state={status:200,headers:{},data:null};
 return {state,res:{set(k,v){state.headers[k]=v;return this;},status(n){state.status=n;return this;},json(value){state.data=value;return this;}}};
}
function fakeDb({ row, bookings=[], badQuery=false, noOwner=false } = {}) {
 const calls=[];let released=false;
 const c={async query(sql,params){calls.push({sql,params});
   if(badQuery && sql.startsWith('SELECT'))throw Object.assign(Error('db unavailable'),{code:'08006'});
   if(sql.includes('FROM users u'))return noOwner?{rowCount:0,rows:[]}:{rowCount:1,rows:[row||{account_id:8,phone:'+998901234567',profile_id:19,first_name:'Ali',last_name:'Test',created_at:'2026-01-01'}]};
   if(sql.includes('FROM bookings'))return {rows:bookings};
   return {rowCount:0,rows:[]};
 },release(){released=true;}};
 return {connect:async()=>c,calls,get released(){return released;}};
}
const user=(role='customer')=>({user:{role,accountId:8,profileId:19}});
test('v183: rejects admin, missing account, forged/invalid profile without querying DB', async () => {
 const db=fakeDb();const fn=createExportHandler(db);
 for(const u of [{role:'admin',accountId:8,profileId:19},{role:'customer',accountId:0,profileId:19},{role:'barber',accountId:8,profileId:1.5}]){
  const x=response();await fn({user:u},x.res);assert.equal(x.state.status,403);
 }
 assert.equal(db.calls.length,0);
});
test('v183: customer only own profile and booking metadata; no cross-account contact joins',async()=>{
 const db=fakeDb({row:{phone:'+998901234567',profile_id:19,first_name:'A',last_name:'B',address:'My home'},
  bookings:[{id:10,service_id:3,booking_time:'2026-12-01',duration_minutes:30,status:'pending',created_at:'2026-11-01',customer_phone:'+998999999999',private_note:'secret'}]});
 const x=response();await createExportHandler(db)(user(),x.res);
 assert.equal(x.state.status,200);assert.equal(x.state.headers['Cache-Control'],'no-store, max-age=0');
 assert.equal(x.state.data.profile.address,'My home');
 assert.deepEqual(x.state.data.bookings[0],{id:10,serviceId:3,bookingTime:'2026-12-01',durationMinutes:30,status:'pending',createdAt:'2026-11-01'});
 assert.doesNotMatch(JSON.stringify(x.state.data),/secret|\+998999999999/);
 const selects=db.calls.filter(c=>c.sql.includes('SELECT'));
 assert.deepEqual(selects[0].params,[8,19]);assert.match(selects[0].sql,/c\.id=\$2/);
 assert.match(selects[1].sql,/WHERE customer_id=\$1/);assert.deepEqual(selects[1].params,[19,MAX_BOOKINGS+1]);
 assert.equal(db.calls.at(-1).sql,'COMMIT');assert.equal(db.released,true);
});
test('v183: barber export scoped to barber ID, excludes customer IDs and private details',async()=>{
 const db=fakeDb({row:{phone:'+998901234567',profile_id:19,salon_name:'My shop',verification_status:'approved'},
  bookings:[{id:10,service_id:3,customer_id:500,booking_time:'2026-12-01',duration_minutes:30,status:'confirmed',created_at:'2026-11-01'}]});
 const x=response();await createExportHandler(db)(user('barber'),x.res);
 assert.equal(x.state.status,200);assert.equal(x.state.data.profile.salonName,'My shop');
 assert.equal(x.state.data.account.role,'barber');
 assert.equal(JSON.stringify(x.state.data).includes('customerId'),false);
 assert.match(db.calls.find(c=>c.sql.includes('FROM bookings')).sql,/WHERE barber_id=\$1/);
});
test('v183: identity mismatch fails closed, never executes booking query',async()=>{
 const db=fakeDb({noOwner:true});const x=response();await createExportHandler(db)(user(),x.res);
 assert.equal(x.state.status,403);assert.equal(db.calls.filter(c=>c.sql.includes('FROM bookings')).length,0);
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.released,true);
});
test('v183: too many records returns 413, no partial file',async()=>{
 const db=fakeDb({bookings:Array(MAX_BOOKINGS+1).fill({id:1})});const x=response();
 await createExportHandler(db)(user(),x.res);
 assert.equal(x.state.status,413);assert.equal(x.state.data.code,'privacy_export_too_large');
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.released,true);
});
test('v183: backend error fails closed with 503, no private data, and rollback',async()=>{
 const db=fakeDb({badQuery:true});const x=response();
 const previous=console.error;console.error=()=>{};
 try{ await createExportHandler(db)(user(),x.res); } finally{console.error=previous;}
 assert.equal(x.state.status,503);assert.equal(x.state.data.code,'privacy_export_unavailable');
 assert.equal(db.calls.at(-1).sql,'ROLLBACK');assert.equal(db.released,true);
});
test('v183: routed after auth, explicit whitelist and profile links, no migration',()=>{
 const root=path.resolve(__dirname,'..');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const route=fs.readFileSync(path.join(root,'routes/privacy.js'),'utf8');
 assert.match(server,/app\.use\("\/api\/privacy"/);
 assert.match(route,/router\.get\('\/export', auth,/);
 for (const [file,needle] of [
  ['../frontend/src/pages/user/Profile.jsx','<PrivacyExportV183'],
  ['../frontend/src/pages/barber/Profile.jsx','<PrivacyExportV183'],
  ['../frontend/src/components/PrivacyExportV183.jsx','subscribeSession'],
 ])assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(needle));
});
