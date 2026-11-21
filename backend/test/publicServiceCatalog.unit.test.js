const { test, after } = require('node:test');
const assert = require('node:assert/strict');
// Stub the database before requiring the production controller: unit tests
// must never load credentials or create a real PostgreSQL pool.
const dbPath = require.resolve('../db');
assert.equal(require.cache[dbPath], undefined);
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {query() {throw new Error('Unexpected DB request');}} };
const { createPublicServicesHandler } = require('../controllers/servicesController');
after(() => { delete require.cache[dbPath]; });
function call(handler, query = {barber_id:'23'}) {
  const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(obj){this.body=obj;return this;}};
  return handler({query},res).then(()=>res);
}
test('public services use approved & active status only, limited fields, no auth needed',async()=>{
  let called=0;const db={async query(sql,params){called++;
    assert.match(sql,/verification_status='approved'/);assert.match(sql,/deactivated_at IS NULL/);
    assert.match(sql,/is_active/);assert.deepEqual(params,[23]);
    assert.doesNotMatch(sql,/SELECT\s+\*/i);
    return {rows:[{id:34,name:'Soch olish',price:'45000.00',duration_minutes:30,barber_id:23}]};}};
  const res=await call(createPublicServicesHandler(db));
  assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(called,1);
  assert.deepEqual(Object.keys(res.body[0]),['id','name','price','duration_minutes','barber_id']);
});
test('public catalog rejects invalid barber id before SQL',async()=>{
 const db={query(){throw new Error('SQL should not run')}};
 for(const barber_id of ['x','-1','1.2','9007199254740999',undefined]){
   const res=await call(createPublicServicesHandler(db),{barber_id});assert.equal(res.statusCode,400);
 }
});
test('database error does not reveal SQL or private messages',async()=>{
 const res=await call(createPublicServicesHandler({async query(){throw new Error('secret_database_uri')}}));
 assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.body),/secret_database_uri/);
});
