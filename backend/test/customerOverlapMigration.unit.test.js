'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../database');
test('v14 new migration is ordered and forward-only, with no silent data deletion',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'bootstrap.sql'),'utf8');
  const file='20261130_customer_time_overlap.sql';
  const sql=fs.readFileSync(path.join(root,'migrations',file),'utf8');
  assert.ok(bootstrap.indexOf('migrations/20261129_booking_idempotency.sql')<bootstrap.indexOf(`migrations/${file}`));
  assert.ok(bootstrap.includes(`\\ir migrations/${file}`));
  for(const expected of [
    'bookings_customer_time_excl','EXCLUDE USING gist','customer_id public.gist_int4_ops WITH =',
    "status IN ('pending','confirmed')",'ACCESS EXCLUSIVE MODE',
    "20261129_booking_idempotency",'collision.first_id',
  ])assert.ok(sql.includes(expected),`Missing ${expected}`);
  assert.equal(/\b(?:TRUNCATE|DROP\s+TABLE|DELETE\s+FROM\s+bookings|UPDATE\s+bookings)\b/i.test(sql),false);
  const verify=fs.readFileSync(path.join(root,'bootstrap/verify.sql'),'utf8');
  assert.ok(verify.includes('bookings_customer_time_excl'));
  assert.ok(verify.includes('20261130_customer_time_overlap'));
});
