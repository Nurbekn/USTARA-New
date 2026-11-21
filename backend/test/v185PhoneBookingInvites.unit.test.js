'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const c=require('../controllers/phoneBookingInvitesV185');
const response=()=>{const out={status:200,body:null,headers:{}};return {out,res:{set(k,v){out.headers[k]=v;return this;},status(s){out.status=s;return this;},json(body){out.body=body;return this;}}};};
const user={role:'barber',profileId:9};
const body={serviceId:17,bookingTime:'2026-11-24T14:30:00+05:00'};
const now='2026-11-21T02:00:00Z';
const expires='2026-11-21T02:30:00Z';
function db(options={}){
 const ops=[];let released=false,broken=false;
 const client={async query(sql,args){
  ops.push({sql,args});
  if(sql==='COMMIT'&&options.commitError)throw Object.assign(Error('network'),{code:'08006'});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('SET LOCAL'))return {rowCount:0,rows:[]};
  if(sql.includes('FROM barbers b')&&sql.includes('FOR UPDATE'))return {rowCount:1,rows:[{id:9,verification_status:options.unapproved?'pending':'approved',accepting_bookings:true,now}]};
  if(sql.includes('FROM services')&&sql.includes('FOR SHARE'))return options.missingService?{rowCount:0,rows:[]}:{rowCount:1,rows:[{id:17}]};
  if(sql.includes('count(*)::integer'))return {rowCount:1,rows:[{n:options.rateLimit?10:0}]};
  if(sql.includes('INSERT INTO barber_phone_booking_invites'))return {rowCount:1,rows:[{id:12,expires_at:expires}]};
  throw Error('unexpected SQL '+sql);
 },release(b){released=true;broken=Boolean(b);}};
 return {connect:async()=>client,ops,get released(){return released;},get broken(){return broken;}};
}
const req=(override={})=>({user,body,params:{},...override});
test('v185: only valid barber can create; malformed timezone/time/service/extra fields rejected before DB',async()=>{
 const handler=c.createHandler({connect:()=>{throw Error('should not connect');}});
 for(const u of [{role:'customer',profileId:9},{role:'barber',profileId:0},{role:'admin',profileId:9}]) {
  const x=response();await handler(req({user:u}),x.res);assert.equal(x.out.status,403);
 }
 for(const b of [{...body,serviceId:0},{...body,bookingTime:'2026-11-24T14:31:00+05:00'},
  {...body,bookingTime:'2026-11-24T14:30:00Z'}, {...body,bookingTime:'2026-11-24T14:30:00+04:00'},
  {...body,customerPhone:'+998900000000'}, {...body,serviceId:'17'}]) {
  const x=response();await handler(req({body:b}),x.res);assert.equal(x.out.status,400);
 }
 assert.ok(c.checkCreateBody(body));
});
test('v185: create uses approved barber lock, active service, rate-limit and stores only SHA-256 token',async()=>{
 const fake=db(),x=response();await c.createHandler(fake)(req(),x.res);
 assert.equal(x.out.status,201);assert.match(x.out.body.token,c.TOKEN_RE);assert.equal(x.out.body.id,12);
 assert.equal(x.out.headers['Cache-Control'],'no-store');
 const insert=fake.ops.find(q=>q.sql.includes('INSERT INTO barber_phone_booking_invites'));
 assert.equal(insert.args.length,4);
 assert.equal(insert.args[0],9);assert.equal(insert.args[1],17);
 assert.equal(insert.args[3],c.digest(x.out.body.token));
 assert.ok(!JSON.stringify(insert).includes(x.out.body.token));assert.equal(fake.released,true);
 assert.match(x.out.body.note,/slot/i);
});
test('v185: inactive barber/service or rate limit never writes an invitation',async()=>{
 for(const [options,code] of [[{unapproved:true},409],[{missingService:true},404],[{rateLimit:true},429]]){
  const fake=db(options),x=response();await c.createHandler(fake)(req(),x.res);
  assert.equal(x.out.status,code);assert.equal(fake.ops.some(q=>q.sql.includes('INSERT INTO barber_phone_booking_invites')),false);
 }
});
test('v185: failed/unknown COMMIT must not report successful invite or leak token',async()=>{
 const fake=db({commitError:true}),x=response();await c.createHandler(fake)(req(),x.res);
 assert.equal(x.out.status,503);assert.equal(x.out.body.code,'invite_creation_unknown');assert.equal(fake.broken,true);
 assert.equal(JSON.stringify(x.out.body).includes('token'),false);
});
test('v185: public invite GET requires unguessable token and exposes no phone/customer identity',async()=>{
 const token='A'.repeat(43);let query;
 const read=c.readHandler({query:async(sql,args)=>{query={sql,args};return {rowCount:1,rows:[{barber_id:9,service_id:17,
  booking_time:'2026-11-24T09:30:00Z',expires_at:expires,barber_first_name:'Ali',barber_last_name:'U',
  service_name:'Soch olish',price:'50000.00',duration_minutes:30}]};}});
 let x=response();await read({params:{token}},x.res);assert.equal(x.out.status,200);
 assert.equal(x.out.body.barberId,9);assert.equal(x.out.body.serviceId,17);
 assert.ok(!JSON.stringify(x.out.body).includes('phone'));assert.ok(!JSON.stringify(x.out.body).includes(token));
 assert.deepEqual(query.args,[c.digest(token)]);assert.match(query.sql,/revoked_at IS NULL/);
 assert.match(query.sql,/deactivated_at IS NULL/);
 x=response();await read({params:{token:'bad'}},x.res);assert.equal(x.out.status,404);
 const miss=c.readHandler({query:async()=>({rowCount:0,rows:[]})});x=response();await miss({params:{token}},x.res);assert.equal(x.out.status,410);
});
test('v185: lists and revokes ONLY the authenticated barber items',async()=>{
 let seen;
 const query=async(sql,args)=>{seen={sql,args};return {rowCount:1,rows:[{id:12,service_id:17,state:'active'}]};};
 let x=response();await c.listHandler({query})(req(),x.res);
 assert.equal(x.out.status,200);assert.deepEqual(seen.args,[9]);assert.match(seen.sql,/WHERE barber_id=\$1/);
 x=response();await c.revokeHandler({query})(req({params:{id:'12'}}),x.res);
 assert.equal(x.out.status,200);assert.deepEqual(seen.args,[12,9]);assert.match(seen.sql,/barber_id=\$2/);
 x=response();await c.revokeHandler({query})(req({user:{role:'customer',profileId:9},params:{id:'12'}}),x.res);assert.equal(x.out.status,403);
 x=response();await c.revokeHandler({query})(req({params:{id:'0012'}}),x.res);assert.equal(x.out.status,400);
});
test('v185: migration and routing guarantee invitation cannot directly INSERT bookings',()=>{
 const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
 const sql=read('database/migrations/20261229_barber_phone_booking_invites.sql');
 assert.match(sql,/REFERENCES barbers\(id\)/);assert.match(sql,/REFERENCES services\(id\)/);
 assert.match(sql,/token_digest CHAR\(64\)/);assert.doesNotMatch(sql,/customer_phone|phone_number|INSERT INTO bookings/);
 const routes=read('routes/bookings.js');assert.match(routes,/router.post\("\/phone-invites", authMiddleware/);
 assert.match(routes,/router.get\("\/phone-invites\/mine", authMiddleware/);
 assert.match(routes,/router.get\("\/phone-invites\/:token", phoneInvites.readHandler/);
 assert.match(read('database/bootstrap.sql'),/20261229_barber_phone_booking_invites\.sql/);
 assert.match(read('database/bootstrap/verify.sql'),/'barber_phone_booking_invites'/);
});
