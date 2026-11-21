"use strict";
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

// Module cache injection avoids importing the live database and reading .env.
const dbPath = require.resolve('../db');
const originalDb = require.cache[dbPath];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { addService, deleteService, refreshServiceData, setServiceStatus } = require('../controllers/servicesController');
after(() => { if (originalDb) require.cache[dbPath] = originalDb; else delete require.cache[dbPath]; });

function req(op) {
  return op === 'create'
    ? { user: { role: 'barber', profileId: 7 }, body: { name: 'Soch olish', price: 45000, duration_minutes: 30 } }
    : { user: { role: 'barber', profileId: 7 }, params: { id: '14' } };
}
function res() {
  return {
    statusCode: 200, body: null,
    status(n) { this.statusCode = n; return this; },
    json(data) { this.body = data; return this; },
  };
}
function fixture({failCode, failAt, rollbackFails = false} = {}) {
  const statements = [], discarded = [];
  const client = {
    async query(sql, args) {
      statements.push([sql,args]);
      if (sql === 'ROLLBACK' && rollbackFails) throw Error('socket-closed');
      if (failAt && sql.startsWith(failAt)) {
        const e = Error('private-service-db-detail'); e.code=failCode; throw e;
      }
      if (sql.startsWith('SELECT id,verification_status FROM barbers'))
        return { rowCount: 1, rows: [{ id: 7, verification_status: 'approved' }] };
      if (sql.includes("to_regclass('booking_services')")) return { rowCount: 1, rows: [{ ready: true }] };
      if (sql.startsWith('UPDATE services')) return { rowCount: 1, rows: [{ id: 14, is_active: false }] };
      if (sql.startsWith('INSERT INTO services')) return { rowCount: 1, rows: [{ id: 14, barber_id:7, name: 'Soch olish' }] };
      if (sql.startsWith('DELETE FROM services')) return { rowCount: 1, rows: [] };
      return { rowCount:0, rows:[] };
    },
    release(value) { discarded.push(value); },
  };
  return { database: { connect: async () => client }, statements, discarded };
}
async function invoke(op, f) {
  const response = res();
  if (op === 'create') await addService(req(op),response,null,f.database);
  else await deleteService(req(op),response,null,f.database);
  return response;
}
for (const op of ['create','delete']) {
  for (const code of ['40P01','40001','55P03','57014']) {
    test(`${op} maps PG ${code} to safe retryable conflict and rolls back`, async () => {
      const f=fixture({ failCode:code, failAt: op==='create' ? 'INSERT INTO services':'DELETE FROM services' });
      const response=await invoke(op,f);
      assert.equal(response.statusCode,409);
      assert.equal(response.body.code,'booking_busy');
      assert.doesNotMatch(JSON.stringify(response.body),/private-service-db-detail/);
      assert.equal(f.statements.at(-1)[0],'ROLLBACK');
      assert.equal(f.statements.some(([sql])=>sql==='COMMIT'),false);
      assert.deepEqual(f.discarded,[false]);
    });
  }
  test(`${op} discards unsafe connection after failed rollback`, async () => {
    const f=fixture({ failCode:'40P01', failAt:op==='create'?'INSERT INTO services':'DELETE FROM services', rollbackFails:true });
    const response=await invoke(op,f);
    assert.equal(response.statusCode,409);
    assert.deepEqual(f.discarded,[true]);
  });
  test(`${op} commits after success`, async () => {
    const f=fixture();
    const response=await invoke(op,f);
    assert.equal(response.statusCode, op==='create'?201:200);
    assert.equal(f.statements.at(-1)[0],'COMMIT');
    assert.deepEqual(f.discarded,[false]);
  });
  test(`${op} refuses invalid role without connecting`, async () => {
    const response=res();
    const bad={...req(op),user:{role:'customer',profileId:7}};
    const noDb={connect(){throw Error('must not connect');}};
    if(op==='create') await addService(bad,response,null,noDb);
    else await deleteService(bad,response,null,noDb);
    assert.equal(response.statusCode,403);
  });
}
test('referenced services continue to respond with archive guidance, never a DELETE',async()=>{
  const f=fixture({failCode:'23503',failAt:'DELETE FROM services'});
  const response=await invoke('delete',f);
  assert.equal(response.statusCode,409);
  assert.equal(response.body.code,'service_has_bookings');
  assert.equal(f.statements.at(-1)[0],'ROLLBACK');
  assert.deepEqual(f.discarded,[false]);
});
test('non-transient SQL error must not be reported as booking_busy',async()=>{
  const f=fixture({failCode:'42501',failAt:'DELETE FROM services'});
  const original=console.error;console.error=()=>{};
  try {
    const response=await invoke('delete',f);
    assert.equal(response.statusCode,500);
    assert.notEqual(response.body.code,'booking_busy');
  } finally {console.error=original;}
});

for (const op of ['create','delete','edit','status']) {
  test(`${op} discards the connection if COMMIT outcome is uncertain`,async()=>{
    const f=fixture({failAt:'COMMIT',failCode:'08006'});
    const response=res();
    const data={...req('delete'),body:{name:'Soch olish',price:45000,duration_minutes:30}};
    const oldError=console.error;console.error=()=>{};
    try {
      if (op==='create') await addService(req('create'),response,null,f.database);
      else if (op==='delete') await deleteService(req('delete'),response,null,f.database);
      else if (op==='edit') await refreshServiceData(data,response,null,f.database);
      else await setServiceStatus({...data,body:{is_active:false}},response,null,f.database);
    } finally {console.error=oldError;}
    assert.equal(response.statusCode,500);
    assert.doesNotMatch(JSON.stringify(response.body),/private-service-db-detail/);
    assert.equal(f.statements.at(-1)[0],'ROLLBACK');
    assert.deepEqual(f.discarded,[true]);
  });
}
