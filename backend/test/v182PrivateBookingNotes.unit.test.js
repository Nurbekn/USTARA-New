'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const handler=require('../controllers/bookingPrivateNotesV182');
function response() {
 const out={code:200,json:null,headers:{}};
 return {out,res:{set(k,v){out.headers[k]=v;return this;},status(n){out.code=n;return this;},json(data){out.json=data;return this;}}};
}
const req=(role='barber',profileId=7,body=undefined)=>({user:{role,profileId},params:{id:'11'},body});
const expiry=new Date('2027-06-01T10:00:00Z');
function db(initial=null, options={}) {
 let note=initial?{...initial}:null;
 let released=false,ops=[];
 const client={async query(sql,args){
  ops.push({sql,args});
  if(options.commitError && sql==='COMMIT')throw Object.assign(Error('network'),{code:'08006'});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.includes('FROM bookings')&&sql.includes('FOR UPDATE'))return options.missing?{rowCount:0,rows:[]}:{rowCount:1,rows:[{id:11,booking_time:'2027-03-02T10:00:00Z'}]};
  if(sql.includes('DELETE FROM booking_private_notes')&&sql.includes('expires_at'))return {rowCount:0,rows:[]};
  if(sql.includes('SELECT note,revision,expires_at FROM booking_private_notes'))return note?{rowCount:1,rows:[note]}:{rowCount:0,rows:[]};
  if(sql.includes('SELECT ($1::timestamptz'))return {rowCount:1,rows:[{allowed:options.expired!==true}]};
  if(sql.includes('INSERT INTO booking_private_notes')){
   note={note:args[2],revision:1,expires_at:expiry};return {rowCount:1,rows:[note]};
  }
  if(sql.includes('UPDATE booking_private_notes SET note=')){
   note={...note,note:args[2],revision:note.revision+1};return {rowCount:1,rows:[note]};
  }
  if(sql.includes('DELETE FROM booking_private_notes')){note=null;return {rowCount:1,rows:[]};}
  throw Error('Unexpected SQL: '+sql);
 },release(flag){released=true;this.broken=flag;}};
 return {connect:async()=>client,client,get released(){return released;},get note(){return note;},ops};
}
test('v182: only barber with valid profile and id can read/write (no admin/customer)',async()=>{
 const read=handler.readHandler({query:async()=>{throw Error('must not query');}});
 const write=handler.saveHandler({connect:async()=>{throw Error('must not connect');}});
 for(const role of ['customer','admin','guest']) {
  const {out,res}=response();await read(req(role),res);assert.equal(out.code,403);
  const x=response();await write(req(role,7,{text:'Private',expectedRevision:0}),x.res);assert.equal(x.out.code,403);
 }
 for(const id of ['0','01','abc','-1','2147483648']) {
  const r=req();r.params.id=id;const x=response();await read(r,x.res);assert.equal(x.out.code,400);
 }
});
test('v182: GET scopes SQL to same booking barber and does not reveal note to others',async()=>{
 let last;
 const read=handler.readHandler({query:async(sql,args)=>{last={sql,args};return {rowCount:1,rows:[{id:11,note:'Private',revision:2,expires_at:expiry}]};}});
 const x=response();await read(req(),x.res);
 assert.equal(x.out.code,200);assert.deepEqual(x.out.json,{text:'Private',revision:2,expiresAt:expiry.toISOString()});
 assert.deepEqual(last.args,[11,7]);assert.match(last.sql,/b\.barber_id=\$2/);assert.match(last.sql,/expires_at > clock_timestamp\(\)/);
 assert.equal(x.out.headers['Cache-Control'],'no-store');
 const notFound=handler.readHandler({query:async()=>({rowCount:0,rows:[]})});
 const y=response();await notFound(req(),y.res);assert.equal(y.out.code,404);
});
test('v182: create then update note with revision; no phone or customer text returned',async()=>{
 const fake=db();const write=handler.saveHandler(fake);
 const x=response();await write(req('barber',7,{text:'Bring comb',expectedRevision:0}),x.res);
 assert.equal(x.out.code,200);assert.equal(x.out.json.revision,1);
 assert.equal(fake.note.note,'Bring comb');assert.equal(fake.released,true);
 const y=response();await write(req('barber',7,{text:'Bring clippers',expectedRevision:1}),y.res);
 assert.equal(y.out.code,200);assert.equal(y.out.json.revision,2);
 assert.ok(fake.ops.some(c=>c.sql.includes('FROM bookings')&&c.sql.includes('FOR UPDATE')));
 assert.equal(JSON.stringify(y.out.json).includes('phone'),false);
});
test('v182: stale parallel write rejected before SQL mutation',async()=>{
 const fake=db({note:'existing',revision:3,expires_at:expiry});
 const x=response();await handler.saveHandler(fake)(req('barber',7,{text:'Overwrite',expectedRevision:2}),x.res);
 assert.equal(x.out.code,409);assert.equal(x.out.json.code,'note_changed');
 assert.equal(fake.note.note,'existing');assert.equal(fake.ops.some(c=>c.sql.includes('UPDATE booking_private_notes SET note=')),false);
});
test('v182: DELETE demands matching revision, supports empty idempotent deletion',async()=>{
 const fake=db({note:'existing',revision:1,expires_at:expiry});
 const remove=handler.deleteHandler(fake);
 let x=response();await remove(req('barber',7,{expectedRevision:1}),x.res);
 assert.equal(x.out.code,200);assert.deepEqual(x.out.json,{text:'',revision:0,expiresAt:null});
 x=response();await remove(req('barber',7,{expectedRevision:0}),x.res);assert.equal(x.out.code,200);
});
test('v182: cannot store blank, control chars, more than 500 codepoints, or arbitrary fields',async()=>{
 for(const body of [
  {text:'',expectedRevision:0},{text:'  ',expectedRevision:0},
  {text:'abc\u0000',expectedRevision:0},{text:'x'.repeat(501),expectedRevision:0},
  {text:'normal',expectedRevision:0,barberId:999},{text:'normal',expectedRevision:1.1},
 ]){
  const x=response();await handler.saveHandler({connect:()=>{throw Error('must not connect');}})(req('barber',7,body),x.res);
  assert.equal(x.out.code,400);
 }
 assert.equal(handler.validText('🙂'.repeat(500)),true);
});
test('v182: expired booking cannot acquire private note; unknown COMMIT returns 503, not success',async()=>{
 const expired=db(null,{expired:true});let x=response();
 await handler.saveHandler(expired)(req('barber',7,{text:'abc',expectedRevision:0}),x.res);
 assert.equal(x.out.code,409);assert.equal(expired.note,null);
 const uncertain=db(null,{commitError:true});x=response();
 await handler.saveHandler(uncertain)(req('barber',7,{text:'abc',expectedRevision:0}),x.res);
 assert.equal(x.out.code,503);assert.equal(x.out.json.code,'note_result_unknown');
 assert.equal(uncertain.client.broken,true);
});
test('v182: SQL migration enforces ownership scope, expiry, transfer erasure and cascade',()=>{
 const root=path.resolve(__dirname,'..');
 const sql=fs.readFileSync(path.join(root,'database/migrations/20261228_private_booking_notes.sql'),'utf8');
 const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 const routes=fs.readFileSync(path.join(root,'routes/bookings.js'),'utf8');
 assert.match(sql,/booking_id INTEGER PRIMARY KEY REFERENCES bookings\(id\) ON DELETE CASCADE/);
 assert.match(sql,/NEW\.barber_id IS DISTINCT FROM OLD\.barber_id/);
 assert.match(sql,/DELETE FROM booking_private_notes/);
 assert.match(sql,/INTERVAL '90 days'/);
 assert.ok(bootstrap.indexOf('20261227_shop_gallery_posts.sql') < bootstrap.indexOf('20261228_private_booking_notes.sql'));
 for(const verb of ['get','put','delete'])assert.match(routes,new RegExp(`router\\.${verb}\\(\"/:id/private-note\"`));
 const bookings=fs.readFileSync(path.join(root,'controllers/bookingsController.js'),'utf8');
 assert.doesNotMatch(bookings,/booking_private_notes|private_note/);
});
