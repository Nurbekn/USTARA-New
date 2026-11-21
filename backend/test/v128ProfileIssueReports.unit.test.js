const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createProfileIssueHandlers,validateReport,idOf} = require('../controllers/profileIssueReports');

const customer={role:'customer',accountId:44};
const admin={role:'admin',id:1};
function mock(answers=[]) {
 const calls=[];
 const pool={async query(sql,params){ calls.push({sql,params});const answer=answers.shift();if(answer instanceof Error)throw answer;return answer ?? {rows:[],rowCount:0}; }};
 const res={statusCode:200, headers:{}, status(code){this.statusCode=code;return this;},set(name,value){this.headers[name]=value;return this;},json(payload){this.payload=payload;return this;}};
 return {calls,pool,res,handlers:createProfileIssueHandlers(pool)};
}
function req({role=customer,params={id:'7'},body={reason:'address',details:'Uy raqami xato ko‘rsatilgan'},}={}) { return {user:role,params,body}; }

test('v128: accepted report stores authenticated customer identity and strict allowlisted reason', async()=>{
 const m=mock([{rowCount:1,rows:[{id:'9'}]}]);
 await m.handlers.submit(req(),m.res);
 assert.equal(m.res.statusCode,201);assert.deepEqual(m.res.payload,{accepted:true});
 assert.equal(m.res.headers['Cache-Control'],'no-store');
 assert.deepEqual(m.calls[0].params,[7,44,'address','Uy raqami xato ko‘rsatilgan']);
 assert.match(m.calls[0].sql,/verification_status='approved'/);
 assert.match(m.calls[0].sql,/ON CONFLICT/);
 assert.equal(JSON.stringify(m.res.payload).includes('44'),false);
});
test('v128: untrusted identity or missing account is rejected without DB traffic',async()=>{
 for(const user of [{role:'barber',accountId:44},{role:'admin',id:1},null,{role:'customer',accountId:0}]){
  const m=mock();await m.handlers.submit(req({role:user}),m.res);assert.equal(m.res.statusCode,403);assert.equal(m.calls.length,0);
 }
});
test('v128: invalid barber ID is rejected without DB traffic',async()=>{
 for(const id of [null,'0','-1','1e2','0x10','1.2','9999999999999999999999','NaN']){
  const m=mock();await m.handlers.submit(req({params:{id}}),m.res);assert.equal(m.res.statusCode,400,id);assert.equal(m.calls.length,0);
 }
});
test('v128: blank, oversized and invalid reason/details blocked',async()=>{
 for(const body of [{reason:'spam',details:'Enough words to pass'}, {reason:'other',details:'short'}, {reason:'address',details:' '.repeat(12)}, {reason:'address',details:'a'.repeat(501)}, {reason:'hours',details:'valid text\u0000injection'}, {reason: 'media',details:88},null]) {
  const m=mock();await m.handlers.submit(req({body}),m.res);assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);
 }
});
test('v128: duplicate active issue is 409; unavailable profile is 404',async()=>{
 const payload={reason:'services',details:'Incorrect service advertised'};
 const dup=mock([{rowCount:0},{rowCount:1}]);await dup.handlers.submit(req({body:payload}),dup.res);assert.equal(dup.res.statusCode,409);
 const gone=mock([{rowCount:0},{rowCount:0}]);await gone.handlers.submit(req({body:payload}),gone.res);assert.equal(gone.res.statusCode,404);
});
test('v128: database error is 503 and does not expose DB secrets',async()=>{
 const m=mock([Object.assign(new Error('database password abc'),{code:'ECONNRESET'})]);await m.handlers.submit(req(),m.res);
 assert.equal(m.res.statusCode,503);assert.doesNotMatch(JSON.stringify(m.res.payload),/password|abc/);
});
test('v128: admin reports only public review fields',async()=>{
 const row={id:'1',barber_id:7,reason:'address',details:'Wrong address',status:'pending'};
 const m=mock([{rowCount:1,rows:[row]}]);await m.handlers.list(req({role:admin}),m.res);
 assert.equal(m.res.statusCode,200);assert.deepEqual(m.res.payload,[row]);
 assert.match(m.calls[0].sql,/LIMIT 101/);assert.doesNotMatch(m.calls[0].sql,/reporter_user_id|\.phone|password/i);
});
test('v128: no non-admin access to reports or review',async()=>{
 const m=mock();await m.handlers.list(req({role:customer}),m.res);assert.equal(m.res.statusCode,403);
 await m.handlers.review(req({role:customer,body:{status:'resolved'}}),m.res);assert.equal(m.res.statusCode,403);assert.equal(m.calls.length,0);
});
test('v128: admin closes pending report without deleting profile; auditable reviewer',async()=>{
 const m=mock([{rowCount:1,rows:[{id:'7',status:'resolved'}]}]);await m.handlers.review(req({role:admin,body:{status:'resolved'}}),m.res);
 assert.deepEqual(m.res.payload,{id:7,status:'resolved'});assert.deepEqual(m.calls[0].params,[7,'resolved',1]);
 assert.match(m.calls[0].sql,/status='pending'/);assert.doesNotMatch(m.calls[0].sql,/DELETE/);
});
test('v128: reviewed/missing report distinguished and invalid transition fails closed',async()=>{
 const gone=mock([{rowCount:0},{rowCount:0}]);await gone.handlers.review(req({role:admin,body:{status:'dismissed'}}),gone.res);assert.equal(gone.res.statusCode,404);
 const done=mock([{rowCount:0},{rowCount:1}]);await done.handlers.review(req({role:admin,body:{status:'dismissed'}}),done.res);assert.equal(done.res.statusCode,409);
 for(const status of ['pending','deleted','accepted',null,{},[]]) {const m=mock();await m.handlers.review(req({role:admin,body:{status}}),m.res);assert.equal(m.res.statusCode,400);assert.equal(m.calls.length,0);}
});
test('v128: migration is wired after previous 47 SQL without destructive DDL',()=>{
 const root=path.join(__dirname,'../database');const sql=fs.readFileSync(path.join(root,'migrations/20261217_profile_issue_reports.sql'),'utf8');
 const b=fs.readFileSync(path.join(root,'bootstrap.sql'),'utf8');const v=fs.readFileSync(path.join(root,'bootstrap/verify.sql'),'utf8');
 assert.ok(b.indexOf('20261216_safe_day_close.sql') < b.indexOf('20261217_profile_issue_reports.sql'));
 assert.match(v,/profile_issue_reports/);assert.match(v,/20261217_profile_issue_reports/);assert.match(v,/profile_issue_one_pending_per_reason/);
 assert.match(sql,/CREATE UNIQUE INDEX profile_issue_one_pending_per_reason[\s\S]*WHERE status='pending'/);
 assert.match(sql,/CHECK\(status IN\('pending','resolved','dismissed'\)\)/);
 assert.doesNotMatch(sql,/\bDROP (?:TABLE|SCHEMA)|\bTRUNCATE\b/i);
});
test('v128: routes enforce auth + admin middleware and reason validation',()=>{
 const barberRoutes=fs.readFileSync(path.join(__dirname,'../routes/barbers.js'),'utf8');
 const adminRoutes=fs.readFileSync(path.join(__dirname,'../routes/admin.js'),'utf8');
 assert.match(barberRoutes,/post\('\/:id\/profile-report', authMiddleware, profileIssues.submit\)/);
 assert.match(adminRoutes,/get\('\/profile-reports', authMiddleware, ops.adminOnly, profileIssues.list\)/);
 assert.match(adminRoutes,/patch\('\/profile-reports\/:id', authMiddleware, ops.adminOnly, profileIssues.review\)/);
 assert.equal(validateReport({reason:'other',details:'  Correct details about profile '} ).details,'Correct details about profile');
 assert.equal(idOf('abc'),null);
});
