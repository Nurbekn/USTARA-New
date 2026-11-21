const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../controllers/barbersController'), 'utf8');
const part = source.match(/function createBarberDirectoryHandler\(database = pool\) \{[\s\S]*?\n\}\n\nconst getBarbers/);
assert.ok(part, 'public handler definition must be present');
const createBarberDirectoryHandler = vm.runInNewContext(
  `${part[0].slice(0, -'\n\nconst getBarbers'.length)}\ncreateBarberDirectoryHandler;`,
  {pool:{},exploreBarber:(row)=>row,console:{error:()=>{}}}
);
const respond=()=>({headers:{},statusCode:200,body:null,set(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}});
test('dynamic directory disables caching on success, even for empty lists',async()=>{
  const database={query:async(sql,params)=>{
    assert.match(sql,/WHERE b\.verification_status=\$1/);
    assert.deepEqual(Array.from(params),['approved','barber']);
    return {rows:[]};
  }};
  const res=respond();await createBarberDirectoryHandler(database)({},res);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,[]);
});
test('failed directory reads are not cached as public search results',async()=>{
  const res=respond();
  await createBarberDirectoryHandler({query:async()=>{throw new Error('simulated database loss');}})({},res);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(res.statusCode,500);
  assert.equal(res.body.message,'Serverda xatolik yuz berdi');
});
