'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBarberEarningsController}=require('../controllers/barberEarningsController');
function respond(){return {statusCode:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
for(const [ready,expectedBasis] of [[true,'booking_snapshot'],[false,'current_service_price']]){
 test('v162 calculated prices never claim received payments, schema ready '+ready,async()=>{
  const sql=[];
  const pool={async query(text,params){sql.push({text,params});
   if(text.includes("to_regclass('booking_services')"))return {rows:[{ready}],rowCount:1};
   return {rows:[{day:'2026-11-19',service:'Haircut',amount:50000,count:1,estimated:false}],rowCount:1};
  }};
  const res=respond();await createBarberEarningsController(pool)({user:{role:'barber',profileId:7}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.estimateOnly,true);
  assert.equal(res.body.paymentVerified,false);assert.equal(res.body.basis,expectedBasis);
  assert.equal(res.body.rows[0].amount,50000);
  assert.deepEqual(sql.at(-1).params,[7]);
  assert.equal(res.headers['Cache-Control'],'no-store');
 });
}
test('v162 unprivileged actor cannot read barber estimates',async()=>{
 let queryCount=0;const pool={query:async()=>{queryCount++;throw Error('unexpected');}};
 const res=respond();await createBarberEarningsController(pool)({user:{role:'customer'}},res);
 assert.equal(res.statusCode,403);assert.equal(queryCount,0);
});
