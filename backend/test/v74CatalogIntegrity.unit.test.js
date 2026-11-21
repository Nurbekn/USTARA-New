'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../db');
const oldDb = require.cache[dbPath];
require.cache[dbPath] = {id: dbPath, filename: dbPath, loaded: true, exports: {query() { throw Error('unexpected live database'); }}};
const { safeId, getServiceById, getSevices, createPublicServicesHandler } = require('../controllers/servicesController');
const { selectedServices } = require('../services/bookingSelection');
after(() => { if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath]; });
function res() {return { statusCode:200,headers:{},status(code){this.statusCode=code;return this;},set(k,v){this.headers[k]=v;return this;},json(body){this.body=body;return this;}};}
for (const value of ['0','-1','+1','1.0','01',' 1','1 ','1e3','2147483648','9007199254740993','abc',null,undefined,{},[],Infinity]) {
 test(`ID validator rejects ${String(value)}`,()=>assert.equal(safeId(value),null));
}
test('ID validator accepts positive canonical PostgreSQL integer',()=>{
 assert.equal(safeId('1'),1);assert.equal(safeId(2147483647),2147483647);
});
test('single item requires safe ID and does not hit database for invalid request',async()=>{
 const response=res();await getServiceById({params:{id:'1e3'}},response,null,{query(){throw Error('called');}});
 assert.equal(response.statusCode,400);
});
test('single service applies owner or active approved merchant rule in query',async()=>{
 const response=res();let calls=0;
 const database={async query(sql,args){calls++;assert.match(sql,/verification_status='approved'/);assert.match(sql,/deactivated_at IS NULL/);assert.match(sql,/is_active/);assert.deepEqual(args,[14,null,false]);return {rowCount:1,rows:[{id:14,name:'Soch',price:'1500.00',duration_minutes:30,barber_id:3,is_active:true}]};}};
 await getServiceById({params:{id:'14'},user:{role:'customer',profileId:7}},response,null,database);
 assert.equal(calls,1);assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(response.body.is_active,undefined);
});
test('owner sees own inactive service and its state',async()=>{
 const response=res();await getServiceById({params:{id:'15'},user:{role:'barber',profileId:3}},response,null,{async query(sql,args){assert.deepEqual(args,[15,3,true]);return {rowCount:1,rows:[{id:15,name:'Soch',price:'250.00',duration_minutes:15,barber_id:3,is_active:false}]};}});
 assert.equal(response.body.is_active,false);
});
test('not found single-service response is 404',async()=>{
 const response=res();await getServiceById({params:{id:'15'},user:{role:'customer'}},response,null,{async query(){return {rowCount:0,rows:[]};}});
 assert.equal(response.statusCode,404);
});
test('single-service database errors do not leak secrets to caller',async()=>{
 const response=res();const previous=console.error;console.error=()=>{};
 try {await getServiceById({params:{id:'15'},user:{role:'customer'}},response,null,{async query(){throw Error('private-db-token');}});}finally{console.error=previous;}
 assert.equal(response.statusCode,500);assert.doesNotMatch(JSON.stringify(response.body),/private-db-token/);
});
test('owner services list rejects unsafe ID and preserves user ownership filter',async()=>{
 const bad=res();await getSevices({query:{barber_id:'01'},user:{role:'customer'}},bad,null,{query(){throw Error('called');}});assert.equal(bad.statusCode,400);
 const valid=res();await getSevices({query:{barber_id:'5'},user:{role:'barber',profileId:5}},valid,null,{async query(sql,args){assert.match(sql,/is_active/);assert.deepEqual(args,[5,true]);return {rows:[]};}});assert.equal(valid.statusCode,200);
});
test('public catalog rejects exponential and noncanonical IDs',async()=>{
 const handler=createPublicServicesHandler({async query(){throw Error('called');}});
 for(const barber_id of ['1e3','01',' 1','2147483648']) {const response=res();await handler({query:{barber_id}},response);assert.equal(response.statusCode,400);}
});
async function quote(rows){return selectedServices({async query(){return {rows,rowCount:rows.length};}},3,rows.map(row=>row.id));}
test('exact cents aggregation avoids floating point imprecision',async()=>{
 const selected=await quote([{id:1,name:'A',price:'0.10',duration_minutes:5},{id:2,name:'B',price:'0.20',duration_minutes:10}]);
 assert.equal(selected.totalPrice,'0.30');assert.equal(selected.duration,15);
});
for (const price of ['1e3','Infinity','NaN','1.234','-1.00','0.00','100000000.00',' 1.00 ','01.00',null]) {
 test(`booking rejects invalid stored price ${String(price)}`,async()=>{
  await assert.rejects(quote([{id:1,name:'A',price,duration_minutes:10}]),{status:503,code:'invalid_service_price'});
 });
}
test('quote keeps original selection order',async()=>{
 const rows=[{id:2,name:'B',price:'20.30',duration_minutes:10},{id:1,name:'A',price:'100.00',duration_minutes:20}];
 const picked=await selectedServices({async query(){return {rows,rowCount:rows.length};}},3,[1,2]);
 assert.deepEqual(picked.services.map(s=>s.id),[1,2]);assert.equal(picked.totalPrice,'120.30');
});
test('update and delete reject noncanonical IDs before SQL',async()=>{
 const {refreshServiceData,deleteService}=require('../controllers/servicesController');
 const database={connect(){throw Error('unexpected database transaction');}};
 for(const handler of [refreshServiceData,deleteService]) {
  const response=res();await handler({params:{id:'01'},user:{role:'barber',profileId:3},body:{name:'Soch',price:1000,duration_minutes:30}},response,null,database);
  assert.equal(response.statusCode,400);
 }
});
