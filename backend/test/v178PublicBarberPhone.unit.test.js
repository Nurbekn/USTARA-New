'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createBarberProfileService}=require('../services/barberProfile');

test('#159: public phone is canonical barber account phone, only approved active profile',async()=>{
  const calls=[];
  const service=createBarberProfileService({query:async(sql,values)=>{
    calls.push({sql,values});return {rows:[{id:17,first_name:'Said',phone:'+998901112233'}]};
  }});
  const publicProfile=await service.getPublic(17);
  assert.equal(publicProfile.phone,'+998901112233');
  assert.deepEqual(calls[0].values,[17]);
  assert.match(calls[0].sql,/u\.phone AS phone/);
  assert.match(calls[0].sql,/u\.role='barber'/);
  assert.match(calls[0].sql,/u\.deactivated_at IS NULL/);
  assert.match(calls[0].sql,/b\.verification_status='approved'/);
  assert.doesNotMatch(calls[0].sql,/JOIN customers|c\.phone/i);
});
test('#159: pending or deactivated profile is not published even if phone exists',async()=>{
  const service=createBarberProfileService({query:async()=>({rows:[]})});
  assert.equal(await service.getPublic(92),null);
});
test('#159: response whitelist includes barber phone but not private customer contact',()=>{
  const code=fs.readFileSync(require.resolve('../controllers/barbersController'),'utf8');
  const fields=code.match(/const publicFields = \[([\s\S]*?)\];/)?.[1];
  assert.ok(fields);
  assert.match(fields,/"phone"/);
  assert.doesNotMatch(fields,/customer_id|client_phone|user_id|password/);
});
