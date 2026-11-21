'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandlers,parseQuery,PAGE_SIZE}=require('../controllers/adminBookingControlV164');
const root=path.resolve(__dirname,'..');
function response(){return {statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(v){this.body=v;return this;}};}
function fakeDb(rows=[]){const calls=[];return {calls,async query(sql,args){calls.push({sql,args});return {rows};}};}
async function run(db,{role='admin',query={}}={}){const res=response();await createHandlers(db).list({user:{role},query},res);return res;}
test('v164: role guard fails closed before database access and response is never cached',async()=>{
 const db=fakeDb();for(const role of ['customer','barber',null]){
  const r=await run(db,{role});assert.equal(r.statusCode,403);assert.equal(r.headers['Cache-Control'],'no-store');
 }
 assert.equal(db.calls.length,0);
});
test('v164: status/date/barber/page allowlist rejects injections and malformed parameters before DB',async()=>{
 const inputs=[{status:'all;DROP TABLE bookings'},{status:'approved'},{page:'0'},{page:'101'},{page:'1 OR 1=1'},
 {barberId:'0'},{barberId:'01'},{barberId:'2 OR 1=1'},{barberId:'9999999999'},{date:'2026-02-30'},{date:'2026-13-01'},
 {date:'2026-01-01T00:00:00Z'},{unknown:'secret'},{status:['pending','confirmed']}];
 const db=fakeDb();for(const query of inputs){const r=await run(db,{query});assert.equal(r.statusCode,400,JSON.stringify(query));}
 assert.equal(db.calls.length,0);
 assert.equal(parseQuery({status:'all',page:'1'}).barber,null);
});
test('v164: filters use positional SQL params and exact Tashkent calendar bounds',async()=>{
 const db=fakeDb([{id:14,status:'confirmed'}]);
 const r=await run(db,{query:{status:'confirmed',barberId:'42',date:'2026-11-21',page:'2'}});
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,{page:2,pageSize:50,hasNext:false,
  filters:{status:'confirmed',date:'2026-11-21',barberId:42},bookings:[{id:14,status:'confirmed'}]});
 assert.deepEqual(db.calls[0].args,['confirmed',42,'2026-11-21T00:00:00+05:00','2026-11-22T00:00:00+05:00',51,50]);
 assert.match(db.calls[0].sql,/ORDER BY bk\.booking_time DESC,bk\.id DESC/);
 assert.match(db.calls[0].sql,/bk\.status=\$1/);
 assert.match(db.calls[0].sql,/bk\.booking_time>=\$3/);
 assert.ok(!db.calls[0].sql.includes('2026-11-21'));
 assert.ok(!db.calls[0].sql.match(/DELETE|UPDATE|INSERT|password_hash|\.phone\b/i));
});
test('v164: pagination exposes at most 50, never claims an exact total',async()=>{
 const db=fakeDb(Array.from({length:51},(_,i)=>({id:i+1,status:'confirmed'})));
 const r=await run(db);
 assert.equal(r.statusCode,200);assert.equal(r.body.bookings.length,PAGE_SIZE);assert.equal(r.body.hasNext,true);
 assert.equal(Object.hasOwn(r.body,'total'),false);assert.deepEqual(db.calls[0].args,[51,0]);
});
test('v164: no results are an empty page; database errors fail as 503',async()=>{
 const db=fakeDb();const empty=await run(db);assert.equal(empty.statusCode,200);assert.deepEqual(empty.body.bookings,[]);
 const broken={query:async()=>{throw Object.assign(new Error('credential secret'),{code:'08006'});}};
 const old=console.error;console.error=()=>{};
 try{const r=await run(broken);assert.equal(r.statusCode,503);assert.ok(!JSON.stringify(r.body).includes('credential secret'));}
 finally{console.error=old;}
});
test('v164: GET router applies both authentication and adminOnly middleware',()=>{
 const routes=fs.readFileSync(path.join(root,'routes/admin.js'),'utf8');
 assert.match(routes,/router\.get\('\/bookings\/control',authMiddleware,ops\.adminOnly,bookingControlV164\.list\)/);
 const src=fs.readFileSync(path.join(root,'controllers/adminBookingControlV164.js'),'utf8');
 assert.match(src,/req\.user\?\.role!=='admin'/);
});
