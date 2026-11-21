'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
function mock(){
 const operations=[];
 const db={connect:async()=>({
  async query(sql){operations.push(sql);return {rowCount:0,rows:[]}},
  release(){}
 })};
 const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}};
 const req={user:{role:'barber',profileId:7,id:3},params:{id:'5'},body:{status:'left'}};
 return {actions:createHandlers(db),res,req,operations};
}
for(const invalid of ['0','01','0x10','1e2','-1','9007199254740992','1.5','not-an-id']){
 test('v93 finish rejects invalid queue ID '+invalid,async()=>{
  const x=mock();x.req.params.id=invalid;
  await x.actions.finish(x.req,x.res);
  assert.equal(x.res.statusCode,400);
  assert.equal(x.operations.length,0);
 });
}
test('v93 accepts a canonical BIGINT string ID before ownership check',async()=>{
 const x=mock();x.req.params.id='2147483648';
 await x.actions.finish(x.req,x.res);
 assert.notEqual(x.res.statusCode,400);
 assert.ok(x.operations.includes('BEGIN'));
});
test('v93 reorder rejects duplicate and malformed BIGINT order entries',async()=>{
 const x=mock();x.req.body={direction:'up',reason:'Navbat sababining yozuvi',expected_order:['1','01']};
 await x.actions.reorder(x.req,x.res);
 assert.equal(x.res.statusCode,400);
 assert.equal(x.operations.length,0);
});
