'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createManualAccountRecovery } = require('../services/manualAccountRecovery');
const { createManualRecoveryController } = require('../controllers/manualAccountRecoveryController');

function fixture({ known = true, blocked = false } = {}) {
  const state = { cases: new Map(), events: [], queries: [], adminActive: true, fault: '', ip: '127.0.0.1' };
  const limits = [];
  const pool = {
    async query(sql, args) { return handle(sql, args); },
    async connect() {
      let snapshot;
      return { async query(sql, args) {
        if (sql === 'BEGIN') snapshot = { cases: new Map([...state.cases].map(([key,value]) => [key, {...value}])), events: state.events.map(e => ({...e})) };
        if (sql === 'ROLLBACK') { state.cases = snapshot.cases; state.events = snapshot.events; return {rows:[]}; }
        return handle(sql, args);
      }, release() {} };
    },
  };
  async function handle(sql, args = []) {
    state.queries.push(sql);
    if (state.fault && sql.includes(state.fault)) throw new Error('secret password in DB error');
    if (sql.startsWith('SELECT id FROM users WHERE phone')) return {rows: known ? [{id: 17}] : []};
    if (sql.includes('INSERT INTO manual_recovery_cases')) {
      state.cases.set(args[0], { id: args[0], hash: args[1], phone: args[2], user_id: args[3], status: 'open', updated_at: new Date() });
      return {rowCount:1,rows:[]};
    }
    if (sql.includes('INSERT INTO manual_recovery_events')) {
      state.events.push({case_id:args[0],type:args[1] ?? 'opened',admin_id:args[2]??null,reason:args[3]??null});
      return {rowCount:1, rows:[]};
    }
    if (sql.startsWith('SELECT status,updated_at FROM manual_recovery_cases')) {
      const c=state.cases.get(args[0]);return {rows:c?.hash===args[1]?[{status:c.status,updated_at:c.updated_at}]:[]};
    }
    if (sql.startsWith('SELECT id FROM admin_accounts')) return {rowCount: state.adminActive ? 1 : 0,rows:state.adminActive?[{id:args[0]}]:[]};
    if (sql.startsWith('SELECT status FROM manual_recovery_cases')) {
      const c = state.cases.get(args[0]);return {rows:c?[{status:c.status}]:[]};
    }
    if (sql.startsWith('UPDATE manual_recovery_cases SET status')) {
      state.cases.get(args[0]).status=args[1]; return {rowCount:1,rows:[]};
    }
    if (sql.startsWith('SELECT id,phone,status,created_at,updated_at')) {
      return {rows:[...state.cases.values()].map(({id,phone,status,updated_at})=>({id,phone,status,updated_at}))};
    }
    return {rowCount:0, rows:[]};
  }
  const service=createManualAccountRecovery({pool,limit: async(scope, identity, max, seconds) => {
    limits.push({scope, identity, max, seconds}); return !blocked;
  }});
  return {state,service,limits};
}

function response() {return {headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}

test('known and unknown numbers both receive generic tickets; no account access changes', async () => {
  const yes=fixture({known:true}), no=fixture({known:false});
  const a=await yes.service.start({phone:'+998901234567'},'127.0.0.1');
  const b=await no.service.start({phone:'+998901234567'},'127.0.0.1');
  assert.equal(a.status,201); assert.equal(b.status,201);
  assert.equal(a.body.message,b.body.message);
  assert.match(a.body.caseId,/^[0-9a-f]{32}$/);
  assert.match(a.body.ticketToken,/^[0-9a-f]{64}$/);
  assert.equal(yes.state.cases.get(a.body.caseId).user_id,17);
  assert.equal(no.state.cases.get(b.body.caseId).user_id,null);
  assert.notEqual(yes.state.cases.get(a.body.caseId).hash,a.body.ticketToken);
  assert.equal((await yes.service.status({caseId:a.body.caseId,ticketToken:a.body.ticketToken},'127.0.0.1')).body.status,'open');
  const forbidden = yes.state.queries.filter(sql => /UPDATE (users|telegram_otp_contacts|account_session_versions)/.test(sql));
  assert.deepEqual(forbidden, []);
});

test('status requires full secret; token and case id cannot be guessed', async () => {
  const f=fixture(), opened=await f.service.start({phone:'+998901234567'},'127.0.0.1');
  await assert.rejects(f.service.status({caseId:opened.body.caseId,ticketToken:'0'.repeat(64)},'127.0.0.1'),{code:'recovery_ticket_unavailable'});
  await assert.rejects(f.service.status({caseId:'x',ticketToken:'invalid'},'127.0.0.1'),{code:'invalid_recovery_ticket'});
  const valid = await f.service.status({caseId:opened.body.caseId,ticketToken:opened.body.ticketToken},'127.0.0.1');
  assert.equal(valid.body.status, 'open');
  assert.equal(JSON.stringify(valid.body).includes('+998'),false);
});

test('admin review is audited, validates permissions and closed ticket is terminal', async () => {
  const f=fixture(), opened=await f.service.start({phone:'+998901234567'},'127.0.0.1');
  await assert.rejects(f.service.review({status:'closed',reason:'Tekshirildi'},opened.body.caseId,{id:17,role:'customer'}),{code:'admin_required'});
  await assert.rejects(f.service.review({status:'verified',reason:'Tekshirildi'},opened.body.caseId,{id:1,role:'admin'}),{code:'invalid_recovery_status'});
  f.state.adminActive=false;
  await assert.rejects(f.service.review({status:'reviewing',reason:'Tekshirildi'},opened.body.caseId,{id:1,role:'admin'}),{code:'admin_required'});
  f.state.adminActive=true;
  const review=await f.service.review({status:'reviewing',reason:'Shaxsiy tekshiruv talab qilinadi'},opened.body.caseId,{id:1,role:'admin'});
  assert.equal(review.body.code,'recovery_case_updated');
  assert.equal(f.state.events.at(-1).admin_id,1);
  assert.equal((await f.service.cases({id:1,role:'admin'})).body.cases[0].status,'reviewing');
  assert.equal((await f.service.review({status:'closed',reason:'Ariza yopildi'},opened.body.caseId,{id:1,role:'admin'})).status,200);
  await assert.rejects(f.service.review({status:'reviewing',reason:'Qayta ochish'},opened.body.caseId,{id:1,role:'admin'}),{code:'recovery_case_closed'});
});

test('failed audit event rolls back state, controller hides provider errors', async () => {
  const f=fixture(), opened=await f.service.start({phone:'+998901234567'},'127.0.0.1');
  f.state.fault='INSERT INTO manual_recovery_events';
  await assert.rejects(f.service.review({status:'reviewing',reason:'Tasdiq uchun'},opened.body.caseId,{id:1,role:'admin'}));
  assert.equal(f.state.cases.get(opened.body.caseId).status,'open');
  const controller=createManualRecoveryController(f.service);
  const res=response();
  await controller.review({body:{status:'reviewing',reason:'Tasdiq uchun'},params:{id:opened.body.caseId},user:{id:1,role:'admin'}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.doesNotMatch(JSON.stringify(res.body),/secret|password/);
});

test('rate limit is enforced before any user lookup and phone input validated', async () => {
  const f=fixture({blocked:true});
  const out=await f.service.start({phone:'+998901234567'},'127.0.0.1');
  assert.equal(out.status,429); assert.equal(f.state.cases.size,0);
  assert.equal(f.state.queries.length,0);
  await assert.rejects(f.service.start({phone:'bad'},'127.0.0.1'),{code:'invalid_phone'});
});


test('public recovery controller ignores spoofed forwarded IP and fails closed without a direct peer', async () => {
  const seen = [];
  const service = {
    async start(_body, ip) {seen.push(ip);return {status:201, body:{code:'recovery_case_opened'}};},
    async status(_body, ip) {seen.push(ip);return {status:200, body:{code:'recovery_case_status'}};},
  };
  const controller = createManualRecoveryController(service);
  const spoof = { body:{phone:'+998901234567'}, ip:'198.51.100.200',
    headers:{'x-forwarded-for':'198.51.100.201'}, socket:{remoteAddress:'127.0.0.1'} };
  const first = response(); await controller.start(spoof,first);
  assert.equal(first.statusCode,201);
  const second = response(); await controller.status({...spoof,body:{}},second);
  assert.equal(second.statusCode,200);
  assert.deepEqual(seen,['127.0.0.1','127.0.0.1']);
  const missing=response(); await controller.start({body:spoof.body,ip:'198.51.100.201'},missing);
  assert.equal(missing.statusCode,503);
  assert.equal(seen.length,2);
});
