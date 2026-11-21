const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const file=fs.readFileSync(path.join(__dirname,'../controllers/bookingsController.js'),'utf8');
const source=file.slice(file.indexOf('async function getBooking(req, res)'),file.indexOf('//Bo\'sh slots'));
function response(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
function makeFixture(){
 const queries=[];
 const data={id:1,customer_id:12,barber_id:23,barber_salon_name:'Ustara',barber_address:'Toshkent',barber_latitude:41.31,barber_longitude:69.28,barber_phone:'+998901234567'};
 const pool={async query(sql,params){queries.push({sql,params});return {rowCount:1,rows:[data]};}};
 const api=vm.runInNewContext(source+'\n;({getBooking,getBookingById})',{pool,console,attachBookingServices:async rows=>rows});
 return {api,queries,data};
}
for(const [name, handler, params] of [['list','getBooking',[12]],['detail','getBookingById',[61,12]]]){
 test(`v125: owner-scoped ${name} selects only barber's phone and location`,async()=>{
  const f=makeFixture(),res=response();
  await f.api[handler]({user:{role:'customer',profileId:12},params:{id:'61'}},res);
  assert.equal(res.code,200);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.deepEqual(Array.from(f.queries[0].params),params);
  const sql=f.queries[0].sql;
  assert.match(sql,/barbers\.address AS barber_address/);
  assert.match(sql,/barbers\.salon_name AS barber_salon_name/);
  assert.match(sql,/barbers\.latitude AS barber_latitude/);
  assert.match(sql,/barbers\.longitude AS barber_longitude/);
  assert.match(sql,/u\.id=barbers\.user_id AND u\.role='barber'/);
  assert.doesNotMatch(sql,/AS customer_phone/);
  assert.match(sql,new RegExp(`WHERE bookings\\.${name==='list'?'customer_id = \\$1':'id=\\$1'}`));
  assert.equal(Array.isArray(res.body)?res.body[0].barber_phone:res.body.barber_phone,'+998901234567');
 });
}
test('v125: barber booking view is not changed to expose new public fields',async()=>{
 const f=makeFixture(),res=response();await f.api.getBooking({user:{role:'barber',profileId:23}},res);
 assert.match(f.queries[0].sql,/AS customer_phone/);
 assert.doesNotMatch(f.queries[0].sql,/AS barber_phone/);
 assert.deepEqual(Array.from(f.queries[0].params),[23]);
});
test('v125: invalid customer booking ID is blocked before SQL',async()=>{
 const f=makeFixture(),res=response();await f.api.getBookingById({user:{role:'customer',profileId:12},params:{id:'not-an-id'}},res);
 assert.equal(res.code,400);assert.equal(f.queries.length,0);
});
