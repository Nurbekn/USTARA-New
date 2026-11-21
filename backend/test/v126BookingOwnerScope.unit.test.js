const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const bookingSource=fs.readFileSync(path.join(__dirname,'../controllers/bookingsController.js'),'utf8');
const bookingSlice=bookingSource.slice(bookingSource.indexOf('async function getBooking(req, res)'),bookingSource.indexOf("//Bo'sh slots"));
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.data=v;return this;}};}
function isolated(){
 let calls=0;
 const pool={query:async()=>{calls++;return {rowCount:0,rows:[]};}};
 const api=vm.runInNewContext(bookingSlice+'\n;({getBooking,getBookingById})',{
   pool,console,attachBookingServices:async rows=>rows,
 });
 return {api,requested:()=>calls};
}
for(const method of ['getBooking','getBookingById']){
 for(const id of [null,undefined,0,-1,NaN,'12',2147483648]){
  test(`v126 ${method} denies invalid customer profile ${String(id)}`,async()=>{
   const {api,requested}=isolated(),res=response();
   await api[method]({user:{role:'customer',profileId:id},params:{id:'61'}},res);
   assert.equal(res.code,403);assert.equal(requested(),0);
   assert.equal(res.headers['Cache-Control'],'no-store');
  });
 }
 test(`v126 ${method} denies missing account scope`,async()=>{
   const {api,requested}=isolated(),res=response();
   await api[method]({user:{role:'guest'},params:{id:'61'}},res);
   assert.equal(res.code,403);assert.equal(requested(),0);
 });
}
test('v126: authenticated services list always disables caching, including invalid-ID replies',async()=>{
 const code=fs.readFileSync(path.join(__dirname,'../controllers/servicesController.js'),'utf8');
 const safeId=code.slice(code.indexOf('function safeId('),code.indexOf('function isServiceBody('));
 const handler=code.slice(code.indexOf('async function getSevices('),code.indexOf('// Single-service lookup'));
 const api=vm.runInNewContext(safeId+'\n'+handler+'\n;getSevices',{pool:{},console});
 let calls=0;
 const db={query:async(_sql,values)=>{calls++;assert.deepEqual(Array.from(values),[23,false]);return {rows:[]};}};
 const ok=response();await api({user:{role:'customer',profileId:12},query:{barber_id:'23'}},ok,null,db);
 assert.equal(ok.code,200);assert.equal(ok.headers['Cache-Control'],'no-store');
 const bad=response();await api({user:{role:'customer',profileId:12},query:{barber_id:'23x'}},bad,null,db);
 assert.equal(bad.code,400);assert.equal(bad.headers['Cache-Control'],'no-store');assert.equal(calls,1);
});
