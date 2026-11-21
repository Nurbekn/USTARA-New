'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {BarberProfileError,normalizeBarberProfilePatch,createBarberProfileService}=require('../services/barberProfile');
const sample={title:'Classic cutting',issuer:'Local school',year:2022};
test('#109 certificate normalization permits only bounded self-reported titles and issuers',()=>{
 assert.deepEqual(normalizeBarberProfilePatch({certificates:[{...sample,title:'  Classic cutting  '}]}).certificates,[sample]);
 assert.deepEqual(normalizeBarberProfilePatch({certificates:[]}).certificates,[]);
});
test('#109 certificate validation rejects fake verified and untrusted URLs',()=>{
 const bad=[null,{},'certified',[{...sample,verified:true}],[{...sample,evidenceUrl:'https://evil.test'}],
  Array.from({length:6},()=>({...sample})),[{...sample,title:' '}],[{...sample,issuer:' '}],
  [{...sample,year:1940}],[{...sample,year:new Date().getUTCFullYear()+1}],
  [{...sample,year:'2022'}],[{...sample,title:'a'.repeat(81)}],[sample,{...sample,title:'CLASSIC CUTTING'}]];
 for(const certificates of bad){
  assert.throws(()=>normalizeBarberProfilePatch({certificates}),e=>e instanceof BarberProfileError&&e.status===400,JSON.stringify(certificates));
 }
});
test('#109 self-reported certificates update is account-bound and cast to JSONB, never badge',async()=>{
 const captured=[];
 const database={query:async(sql,values)=>{captured.push({sql,values});return {rows:[{id:8,certificates:[sample]}]};}};
 const service=createBarberProfileService(database);
 const result=await service.update(8,21,normalizeBarberProfilePatch({certificates:[sample]}));
 assert.equal(result.id,8);
 assert.match(captured[0].sql,/certificates=\$3::jsonb/);
 assert.match(captured[0].sql,/WHERE b\.id=\$1 AND b\.user_id=\$2/);
 assert.deepEqual(captured[0].values,[8,21,JSON.stringify([sample])]);
 assert.doesNotMatch(captured[0].sql,/INSERT INTO barber_evidence_badges|verification_status=/);
});
test('#109/#159 public profile includes approved barber phone, not customer identity or certificate badge',async()=>{
 const q=[];
 const service=createBarberProfileService({query:async(sql,values)=>{q.push({sql,values});return {rows:[{id:8,certificates:[sample]}]};}});
 const result=await service.getPublic(8);
 assert.deepEqual(result.certificates,[sample]);
 assert.match(q[0].sql,/b\.certificates/);
 assert.match(q[0].sql,/verification_status='approved'/);
 assert.match(q[0].sql.split(/\bFROM\b/)[0],/u\.phone AS phone/);
 assert.doesNotMatch(q[0].sql.split(/\bFROM\b/)[0],/customer|user_id|verification_status|created_at/i);
});
test('#109 migration is forward-only, bounded and bootstrap-verified',()=>{
 const base=path.join(__dirname,'..','database');
 const read=p=>fs.readFileSync(path.join(base,p),'utf8');
 const sql=read('migrations/20261225_barber_self_reported_certificates.sql');
 assert.match(sql,/ADD COLUMN certificates JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
 assert.match(sql,/jsonb_array_length\(certificates\)<=5/);
 assert.match(sql,/20261224_booking_customer_checkins/);
 assert.match(read('bootstrap.sql'),/20261225_barber_self_reported_certificates/);
 assert.match(read('bootstrap/verify.sql'),/barbers_certificates_array_v171/);
});
