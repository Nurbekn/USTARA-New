const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createProfileIssueHandlers,parseReportListQuery,publicReport} = require('../controllers/profileIssueReports');

function runMock(answers=[]) {
  const calls=[];
  const pool={async query(sql,params){calls.push({sql,params}); const x=answers.shift(); if(x instanceof Error)throw x; return x||{rows:[],rowCount:0};}};
  const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this;},set(k,v){this.headers[k]=v;return this;},json(x){this.payload=x;return this;}};
  return {calls,res,handlers:createProfileIssueHandlers(pool)};
}
const admin={role:'admin',id:3};

test('v129: default admin query remains backward compatible',()=>{
  assert.deepEqual(parseReportListQuery(),{status:'all',page:1,offset:0});
});
test('v129: all explicit states use a fixed server-side allowlist',()=>{
  for(const status of ['all','pending','resolved','dismissed']) assert.equal(parseReportListQuery({status})?.status,status);
});
test('v129: pages have bounded fixed-size offsets',()=>{
  assert.deepEqual(parseReportListQuery({status:'pending',page:'1'}),{status:'pending',page:1,offset:0});
  assert.deepEqual(parseReportListQuery({status:'resolved',page:'2'}),{status:'resolved',page:2,offset:100});
  assert.equal(parseReportListQuery({page:'100'})?.offset,9900);
});
test('v129: malformed filters and SQL injection are rejected',()=>{
  for(const bad of [{status:['all','pending']},{status:'all OR TRUE'},{status:'__proto__'},
   {status:''},{page:'0'},{page:'00'},{page:'101'},{page:'-1'},{page:'1.2'},
   {page:'1;SELECT'},{page:['1','2']},{page:1},{page:{}},null,[]]) {
    assert.equal(parseReportListQuery(bad),null,JSON.stringify(bad));
  }
});
test('v129: public row allowlist rejects reporter IDs, phone, credentials and injected fields',()=>{
  const row={id:12,barber_id:17,reason:'address',details:'Wrong location',status:'pending',
    created_at:'2026-11-20',barber_first:'A',reporter_user_id:5,phone:'+998123456',
    password:'secret',token:'secret',__sensitive:'unapproved'};
  assert.deepEqual(publicReport(row),{id:12,barber_id:17,reason:'address',details:'Wrong location',status:'pending',created_at:'2026-11-20',barber_first:'A'});
});
test('v129: pending filtered queue uses bound params with ordered pagination',async()=>{
  const m=runMock([{rows:[{id:1,barber_id:9,reason:'hours',details:'Hours wrong',status:'pending',phone:'private'}]}]);
  await m.handlers.list({user:admin,query:{status:'pending',page:'3'}},m.res);
  assert.equal(m.res.statusCode,200); assert.deepEqual(m.calls[0].params,['pending',200]);
  assert.match(m.calls[0].sql,/\bWHERE \(\$1::text='all' OR r.status=\$1\)/);
  assert.match(m.calls[0].sql,/LIMIT 101 OFFSET \$2/);
  assert.match(m.calls[0].sql,/r\.created_at DESC,r\.id DESC/);
  assert.equal(m.res.headers['Cache-Control'],'no-store');
  assert.equal(m.res.payload[0].phone,undefined);
});
test('v129: reviewed queue filters still exclude identity and credentials',async()=>{
  const m=runMock([{rows:[{id:2,barber_id:9,status:'resolved',reason:'media',reporter_user_id:44}]}]);
  await m.handlers.list({user:admin,query:{status:'resolved',page:'1'}},m.res);
  assert.deepEqual(m.calls[0].params,['resolved',0]);
  assert.deepEqual(m.res.payload,[{id:2,barber_id:9,status:'resolved',reason:'media'}]);
  assert.doesNotMatch(m.calls[0].sql,/reporter_user_id|password|\.phone/);
});
test('v129: invalid page returns 400 without querying DB',async()=>{
  const m=runMock();
  await m.handlers.list({user:admin,query:{status:'all',page:'200000'}},m.res);
  assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);
});
test('v129: unauthenticated/non-admin readers are refused before inspecting filters',async()=>{
  const m=runMock();
  await m.handlers.list({user:{role:'customer',accountId:1},query:{page:'3'}},m.res);
  assert.equal(m.res.statusCode,403);assert.equal(m.calls.length,0);
});
test('v129: database failure returns no rows or DB error text',async()=>{
  const m=runMock([new Error('password=secret')]);
  await m.handlers.list({user:admin,query:{status:'pending'}},m.res);
  assert.equal(m.res.statusCode,503);assert.doesNotMatch(JSON.stringify(m.res.payload),/secret|password/);
});
test('v129: current migration still has unique pending constraint and no destructive DDL',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261217_profile_issue_reports.sql'),'utf8');
  assert.match(sql,/CREATE UNIQUE INDEX profile_issue_one_pending_per_reason/);
  assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b/i);
});
