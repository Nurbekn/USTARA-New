'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Isolate controller from a live PostgreSQL server in unit tests.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
const receipt='b'.repeat(32);
function mockDb({commitFails=false,rollbackFails=false,beginFails=false,writeFails=false}={}){
 const statements=[],releases=[];
 const client={
  async query(sql,args){statements.push(sql);
   if(sql==='BEGIN'&&beginFails)throw Error('begin failure');
   if(sql==='COMMIT'&&commitFails)throw Error('connection lost during commit');
   if(sql==='ROLLBACK'&&rollbackFails)throw Error('rollback failure');
   if(sql.includes('SELECT b.id FROM barbers'))return {rows:[{id:7}],rowCount:1};
   if(sql.includes('request_key=$2 FOR UPDATE'))return {rows:[],rowCount:0};
   if(sql.includes('AS open_now'))return {rows:[{open_now:true}],rowCount:1};
   if(sql.includes('INSERT INTO walkin_queue(')){
    if(writeFails)throw Error('insert failure');
    return {rowCount:1,rows:[{id:9,display_label:'Mehmon',queue_date:'2026-11-19',status:'waiting',queue_position:1}]};
   }
   return {rows:[],rowCount:0};
  },release(broken){releases.push(broken)}
 };
 const actions=createHandlers({connect:async()=>client});
 const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
 const req={body:{request_id:receipt},params:{},user:{role:'barber',profileId:7,id:3}};
 return {statements,releases,actions,req,res};
}
test('v92 successful barber join commits and returns healthy connection',async()=>{
 const x=mockDb();await x.actions.join(x.req,x.res);
 assert.equal(x.res.statusCode,201);assert.equal(x.res.body.entry.id,9);
 assert.deepEqual(x.releases,[false]);assert.equal(x.statements.at(-1),'COMMIT');
});
test('v92 unknown COMMIT outcome cannot be presented as successful queue join',async()=>{
 const x=mockDb({commitFails:true});await x.actions.join(x.req,x.res);
 assert.equal(x.res.statusCode,503);assert.equal(x.res.body.code,'queue_result_unknown');
 assert.deepEqual(x.releases,[true]);
 assert.equal(x.statements.filter(s=>s==='COMMIT').length,1);
 assert.equal(x.statements.includes('ROLLBACK'),false);
 assert.equal(x.res.headers['Cache-Control'],'no-store');
 assert.ok(!JSON.stringify(x.res.body).includes('connection lost'));
});
test('v92 failed write rolls back and preserves usable connection',async()=>{
 const x=mockDb({writeFails:true});await x.actions.join(x.req,x.res);
 assert.equal(x.res.statusCode,503);assert.deepEqual(x.releases,[false]);
 assert.equal(x.statements.at(-1),'ROLLBACK');
});
test('v92 failed rollback discards connection',async()=>{
 const x=mockDb({writeFails:true,rollbackFails:true});await x.actions.join(x.req,x.res);
 assert.deepEqual(x.releases,[true]);
});
test('v92 failed BEGIN does not roll back unstarted transaction',async()=>{
 const x=mockDb({beginFails:true});await x.actions.join(x.req,x.res);
 assert.deepEqual(x.releases,[false]);assert.equal(x.statements.includes('ROLLBACK'),false);
});
test('v92 read-only list COMMIT error discards connection but never reports an ambiguous write',async()=>{
 const x=mockDb({commitFails:true});await x.actions.list(x.req,x.res);
 assert.equal(x.res.statusCode,503);assert.equal(x.res.body.code,'queue_unavailable');
 assert.deepEqual(x.releases,[true]);assert.equal(x.statements.includes('ROLLBACK'),false);
});
