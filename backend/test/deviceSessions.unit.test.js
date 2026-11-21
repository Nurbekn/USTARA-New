'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deviceLabel, createDeviceSession, validSessionId } = require('../services/deviceSessions');
const { createSessionsController } = require('../controllers/sessionsController');

function res() { return { statusCode:200,headers:{},body:null,
  set(k,v){this.headers[k]=v;return this;},status(code){this.statusCode=code;return this;},
  json(data){this.body=data;return this;} }; }
const currentId='d'.repeat(32);
const otherId='e'.repeat(32);
const user={role:'barber',accountId:99,sid:currentId};

test('UA is categorized to a safe minimal label and raw device data is not persisted', async () => {
  assert.equal(deviceLabel('Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36'), 'Chrome · Linux');
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone) Safari/605.1.15'), 'Safari · iOS');
  assert.equal(deviceLabel('<script>alert(1)</script>'), 'Brauzer · qurilma');
  assert.ok(validSessionId(currentId));
  assert.ok(!validSessionId('../abcd'));
  let sql='', params;
  const client={query:async(q,values)=>{sql=q;params=values;return {rowCount:1}}};
  assert.equal(await createDeviceSession(client,99,'Chrome/123.0.0.0 (Linux)',currentId),currentId);
  assert.deepEqual(params,[currentId,99,'Chrome · Linux']);
  assert.match(sql,/INSERT INTO account_device_sessions/);
  await assert.rejects(createDeviceSession(client,0,'',currentId),/Invalid device/);
});

test('device list is scoped to current account; no token or IP exposed', async () => {
  let args;
  const controller = createSessionsController({pool:{query:async (_sql, a)=>{
    args=a;
    return {rows:[{session_id:currentId,device_label:'Chrome · Linux',created_at:'2026-11-18T12:00:00Z',expires_at:'2026-11-25T12:00:00Z'},
      {session_id:otherId,device_label:'Safari · iOS',created_at:'2026-11-17T12:00:00Z',expires_at:'2026-11-24T12:00:00Z'}]};
  }}});
  const out=res();await controller.list({user},out);
  assert.equal(out.statusCode,200);
  assert.deepEqual(args,[99]);
  assert.equal(out.body.sessions.length,2);
  assert.equal(out.body.sessions[0].current,true);
  assert.equal(out.body.sessions[1].current,false);
  assert.doesNotMatch(JSON.stringify(out.body), /password|token|ip_address|authorization/i);
  assert.equal(out.headers['Cache-Control'],'no-store');
});

test('only owned devices can be revoked, and revoked current session is disclosed', async () => {
  let sql,params;
  const controller = createSessionsController({pool:{query:async(q, a)=>{
    sql=q;params=a;return {rowCount:1,rows:[{session_id:a[0]}]};
  }}});
  const output=res();await controller.revokeOne({user,params:{id:otherId}},output);
  assert.equal(output.body.current,false);
  assert.deepEqual(params,[otherId,99]);
  assert.match(sql,/session_id=\$1 AND user_id=\$2 AND revoked_at IS NULL/);
  const second=res();await controller.revokeOne({user,params:{id:currentId}},second);
  assert.equal(second.body.current,true);
  const forged=res();await controller.revokeOne({user:{role:'admin',accountId:99},params:{id:otherId}},forged);
  assert.equal(forged.statusCode,403);
  const malformed=res();await controller.revokeOne({user,params:{id:'invalid'}},malformed);
  assert.equal(malformed.statusCode,400);
});

test('failed query and unknown session never claim the device is revoked', async () => {
  const empty=createSessionsController({pool:{query:async()=>({rowCount:0,rows:[]})}});
  const missing=res();await empty.revokeOne({user,params:{id:otherId}},missing);
  assert.equal(missing.statusCode,404);
  const broken=createSessionsController({pool:{query:async()=>{throw Error('db raw error with secrets')}}});
  const result=res();await broken.list({user},result);
  assert.equal(result.statusCode,503);
  assert.doesNotMatch(JSON.stringify(result.body), /db raw error/);
});
