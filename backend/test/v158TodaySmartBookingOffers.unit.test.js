'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const rows=x=>({rows:x,rowCount:x.length});
function fixture({approved=true,dbFail=false}={}){
 const queries=[];
 const db={async connect(){return {async query(sql,args=[]){
  queries.push({sql,args});
  if(sql.includes('FROM barbers b JOIN users u'))return rows(approved?[{id:12}]:[]);
  if(sql.includes('FROM smart_booking_openings o')&&sql.includes('LEFT JOIN LATERAL')){
   if(dbFail)throw new Error('DB unavailable');
   return rows([{id:4,state:'offered',start_at:'2026-11-20T09:30:00Z',duration_minutes:30,
     offer_id:8,offer_status:'pending',expires_at:'2026-11-20T09:28:00Z',display_label:'Guest',booking_id:null}]);
  }
  return rows([]);
 },release(broken){queries.push({sql:'RELEASE',args:[broken]});}};}};
 return {db,queries};
}
test('v158: barber offers timeline uses live approved account check and own barber scope',async()=>{
 const {db,queries}=fixture();
 const result=await createSmartBookingOffers(db).listForBarber(12,501);
 assert.equal(result.length,1);
 assert.equal(result[0].state,'offered');
 const identity=queries.find(x=>x.sql.includes('FROM barbers b JOIN users u'));
 assert.deepEqual(identity.args,[12,501]);
 assert.match(identity.sql,/verification_status='approved'/);
 assert.match(identity.sql,/deactivated_at IS NULL/);
 assert.match(identity.sql,/FOR SHARE OF b,u/);
 const read=queries.find(x=>x.sql.includes('LEFT JOIN LATERAL'));
 assert.deepEqual(read.args,[12]);
 assert.match(read.sql,/o\.barber_id=\$1/);
 assert.match(read.sql,/Asia\/Tashkent/);
 assert.match(read.sql,/LIMIT 50/);
 assert.equal(queries.at(-2).sql,'COMMIT');
 assert.equal(queries.some(x=>/\b(INSERT|UPDATE|DELETE)\b/i.test(x.sql)),false);
});
test('v158: unapproved/mismatched barber identity cannot read even private offer summaries',async()=>{
 const f=fixture({approved:false});
 await assert.rejects(createSmartBookingOffers(f.db).listForBarber(12,999),{code:'barber_required',status:403});
 assert.equal(f.queries.some(x=>x.sql.includes('LEFT JOIN LATERAL')),false);
 assert.equal(f.queries.some(x=>x.sql==='COMMIT'),false);
 assert.equal(f.queries.some(x=>x.sql==='ROLLBACK'),true);
});
test('v158: failed database offer read cannot return a fake empty calendar',async()=>{
 const f=fixture({dbFail:true});
 await assert.rejects(createSmartBookingOffers(f.db).listForBarber(12,501),/DB unavailable/);
 assert.equal(f.queries.some(x=>x.sql==='ROLLBACK'),true);
 assert.equal(f.queries.some(x=>x.sql==='COMMIT'),false);
});
