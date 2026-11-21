const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword } = require('../utils/passwordPolicy');
const { createAccountPauseController } = require('../controllers/accountPauseController');
const fs = require('node:fs');
const path = require('node:path');

function response() {
  return { statusCode: 200, payload: null, headers: {}, set(k,v) {this.headers[k]=v;return this;},
    status(v) {this.statusCode=v;return this;}, json(v) {this.payload=v;return this;} };
}
function harness({role='customer', passwordHash, activeBookings=false, stale=false, broken=false}={}) {
  const sql=[], state={ deactivated:false, version:0 };
  const client={async query(query,args=[]) {
    sql.push({query, args});
    if(broken) throw Error('SENSITIVE DB DATA');
    if(query.includes('FROM barbers WHERE user_id=$1 FOR UPDATE')) return {rowCount:1,rows:[{id:9}]};
    if(query.startsWith('SELECT id,role,password,deactivated_at FROM users')) return {rowCount:1, rows:[{
      id:8, role, password:passwordHash, deactivated_at:state.deactivated?new Date():null}]};
    if(query.includes('FROM bookings b JOIN')) return {rowCount:Number(activeBookings),rows:activeBookings?[{id:3}]:[]};
    if(query.startsWith('INSERT INTO account_session_versions')) return stale? {rowCount:0,rows:[]} : {rowCount:1,rows:[{version:++state.version}]};
    if(query.startsWith('UPDATE users SET deactivated_at')) {state.deactivated=true;return {rowCount:1};}
    throw Error('Unexpected mocked SQL');
  }};
  const protect=async (_identity,fn)=>fn(client);
  return { controller:createAccountPauseController({ pool:{}, protect }), sql,state };
}
const req=(role='customer',password='ExamplePassword1!')=>({user:{role,accountId:8,sessionVersion:0},
  body:{password},socket:{remoteAddress:'192.0.2.10'}});

test('deactivate: rejects wrong password without mutating account',async()=>{
  const h=harness({passwordHash:await hashPassword('ExamplePassword1!')}); const res=response();
  await h.controller.deactivate(req('customer','wrong-password'),res);
  assert.equal(res.statusCode,401);assert.equal(res.payload.code,'invalid_credentials');
  assert.equal(h.state.deactivated,false);assert.equal(h.state.version,0);
});

test('deactivate: refuses active or future booking; history remains intact',async()=>{
  const h=harness({passwordHash:await hashPassword('ExamplePassword1!'),activeBookings:true}); const res=response();
  await h.controller.deactivate(req(),res);
  assert.equal(res.statusCode,409);assert.equal(res.payload.code,'active_bookings');
  assert.equal(h.state.deactivated,false);
  assert.match(h.sql.find(x=>x.query.includes('FROM bookings b JOIN')).query, /booking_time\+b\.duration_minutes/);
});

test('deactivate: barber locks profile before user, bumps version and pauses',async()=>{
  const h=harness({role:'barber',passwordHash:await hashPassword('ExamplePassword1!')}); const res=response();
  await h.controller.deactivate(req('barber'),res);
  assert.equal(res.statusCode,200);assert.equal(res.payload.code,'account_deactivated');
  assert.equal(h.state.deactivated,true);assert.equal(h.state.version,1);
  assert.match(h.sql[0].query,/FROM barbers.*FOR UPDATE/);
  assert.equal(h.sql.some(x=>x.query.includes('INSERT INTO bookings')),false);
});

test('deactivate: stale token and storage failures fail closed',async()=>{
  const hash=await hashPassword('ExamplePassword1!');
  const stale=harness({passwordHash:hash,stale:true});let res=response();
  await stale.controller.deactivate(req(),res);
  assert.equal(res.statusCode,401);assert.equal(stale.state.deactivated,false);
  const broken=harness({passwordHash:hash,broken:true});res=response();
  await broken.controller.deactivate(req(),res);
  assert.equal(res.statusCode,503);assert.doesNotMatch(JSON.stringify(res.payload),/SENSITIVE/);
});

test('deactivate: admin, missing password and malformed identity never query DB',async()=>{
  const h=harness();let res=response();
  await h.controller.deactivate(req('admin'),res);assert.equal(res.statusCode,403);
  res=response();await h.controller.deactivate({...req(),body:{}},res);assert.equal(res.statusCode,400);
  assert.equal(h.sql.length,0);
});

test('deactivate: documented forward migration is present and protects existing accounts',()=>{
  const root=path.resolve(__dirname,'../database');
  const sql=fs.readFileSync(path.join(root,'migrations/20261126_account_pause.sql'),'utf8');
  assert.match(sql,/ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMPTZ/);
  assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
  assert.match(fs.readFileSync(path.join(root,'bootstrap.sql'),'utf8'),/20261126_account_pause/);
  const auth=fs.readFileSync(path.resolve(__dirname,'../middleware/accountIdentity.js'),'utf8');
  assert.match(auth,/account\.deactivated_at IS NULL/);
});
